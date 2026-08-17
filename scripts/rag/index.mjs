#!/usr/bin/env node
/**
 * RAG Index Script — Incremental + Full Rebuild
 *
 * Default: incremental — only embeds chunks whose text hash changed.
 * --full:  full rebuild — re-embeds all chunks regardless of hash.
 *
 * Reads all content sources, chunks, computes SHA-256 hash per chunk,
 * compares against DB hashes, embeds only changed chunks, upserts to
 * Supabase, then cleans up orphaned embeddings.
 *
 * Usage:
 *   node scripts/rag/index.mjs           # incremental (default)
 *   node scripts/rag/index.mjs --full    # full rebuild
 *
 * Pre-requisites:
 *   - Ollama running with bge-m3 model pulled
 *   - .env.local with ADMIN_EMAIL/ADMIN_PASSWORD
 *   - .env with SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY
 *   - Database migration applied (supabase/migrations/*_rag_content_embeddings.sql)
 *   - chunk_hash migration applied (supabase/migrations/20260814150000_rag_add_chunk_hash.sql)
 *
 * Spec: docs/archive/spec-rag.md §4.2
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname, basename, relative, sep } from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import yaml from "js-yaml";

import { chunkMarkdown, chunkSceneData, chunkCatalog } from "./lib/chunker.mjs";
import { normalizeMetadata } from "./lib/normalizer.mjs";
import { embed, isOllamaAvailable, verifyModelDimensions, DEFAULT_MODEL } from "./lib/ollama.mjs";
import {
  createRagClient,
  upsertChunks,
  cleanupOrphans,
  computeChunkHash,
  fetchExistingHashes,
} from "./lib/supabase-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..");
const outputDir = join(__dirname, "output");

// ─── Content source collectors ───

/**
 * Collect published articles from articles/*.md.
 * Reads frontmatter for metadata; skips unpublished (Scenario #3).
 */
function collectArticles() {
  const articlesDir = join(projectRoot, "articles");
  const files = readdirSync(articlesDir).filter((f) => f.endsWith(".md"));
  const results = [];

  for (const file of files) {
    const filePath = join(articlesDir, file);
    const raw = readFileSync(filePath, "utf8");
    const parsed = matter(raw);

    // Skip unpublished (Scenario #3)
    if (!parsed.data.published) {
      console.log(`  ⏭️  Skipped (unpublished): ${file}`);
      continue;
    }

    const slug = parsed.data.slug || basename(file, ".md");
    const chunks = chunkMarkdown(parsed.content, slug);

    // Extract source URLs from frontmatter
    const sourceUrls = (parsed.data.sources || []).map((s) => s.url).filter(Boolean);

    for (const chunk of chunks) {
      const metadata = normalizeMetadata({
        topics: parsed.data.topics,
        entities: parsed.data.entities,
        article_slug: slug,
        section_title: chunk.title,
        published: true,
        source_urls: sourceUrls.length > 0 ? sourceUrls : undefined,
      });

      results.push({
        content_type: "article",
        source_id: slug,
        chunk_index: chunk.chunkIndex,
        chunk_text: chunk.text,
        chunk_title: chunk.title,
        metadata,
      });
    }

    console.log(`  📄 ${file} → ${chunks.length} chunks`);
  }

  return results;
}

/**
 * Collect scene-data from scripts/short-video/content (recursive).
 * Dynamic imports ESM modules; skips _test-fixtures.
 */
async function collectSceneData() {
  const contentDir = join(projectRoot, "scripts", "short-video", "content");
  const results = [];

  // Find all scene-data.mjs files recursively, excluding _test-fixtures
  const sceneFiles = findFilesRecursive(contentDir, "scene-data.mjs").filter(
    (f) => !f.includes("_test-fixtures"),
  );

  for (const sceneFilePath of sceneFiles) {
    const dir = dirname(sceneFilePath);
    const metaPath = join(dir, "meta.mjs");

    try {
      // Dynamic import scene-data.mjs
      const sceneModule = await import(`file://${sceneFilePath}`);
      const scenes = sceneModule.scenes;

      if (!scenes || !Array.isArray(scenes)) {
        console.log(`  ⏭️  Skipped (no scenes export): ${relative(contentDir, sceneFilePath)}`);
        continue;
      }

      // Import meta.mjs if it exists
      let meta = {};
      if (existsSync(metaPath)) {
        const metaModule = await import(`file://${metaPath}`);
        meta = metaModule.meta || {};
      }

      const sourceId = meta.pipelineId || basename(dir);
      const chunks = chunkSceneData(scenes, meta, sourceId);

      for (const chunk of chunks) {
        // Find the corresponding scene for metadata
        const scene = scenes[chunk.chunkIndex]; // Approximate — may not align if scenes were skipped
        const metadata = normalizeMetadata({
          topics: meta.topics,
          entities: meta.keyEntities,
          article_slug: meta.article,
          part_number: meta.partNumber,
          scene_id: scene?.id,
          visual_type: scene?.visualType,
        });

        results.push({
          content_type: "scene-data",
          source_id: sourceId,
          chunk_index: chunk.chunkIndex,
          chunk_text: chunk.text,
          chunk_title: chunk.title,
          metadata,
        });
      }

      console.log(`  🎬 ${relative(contentDir, sceneFilePath)} → ${chunks.length} chunks`);
    } catch (err) {
      console.log(
        `  ⚠️  Failed to import: ${relative(contentDir, sceneFilePath)} — ${err.message}`,
      );
    }
  }

  return results;
}

/**
 * Collect asset catalog entries from scripts/short-video/assets/catalog.yml.
 * Parses YAML, chunks each entry, and returns chunk objects with
 * content_type "asset-catalog".
 *
 * Graceful degradation:
 * - File missing → returns [] (no error)
 * - YAML parse error → console.warn, returns []
 */
function collectAssetCatalog() {
  const catalogPath = join(
    projectRoot,
    "scripts",
    "short-video",
    "assets",
    "catalog.yml",
  );

  if (!existsSync(catalogPath)) {
    return [];
  }

  const raw = readFileSync(catalogPath, "utf8");

  let entries;
  try {
    entries = yaml.load(raw);
  } catch (err) {
    console.warn(`  ⚠️  Failed to parse catalog.yml: ${err.message}`);
    return [];
  }

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const chunks = chunkCatalog(entries);

  const results = chunks.map((chunk) => {
    const entry = entries.find((e) => e.file === chunk.sourceId) || {};
    const metadata = normalizeMetadata({
      media_type: entry.type,
      file_path: entry.file,
      source: entry.source,
      license: entry.license,
      used_in: entry.used_in,
      keywords: entry.keywords,
    });

    return {
      content_type: "asset-catalog",
      source_id: chunk.sourceId,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.text,
      chunk_title: chunk.title,
      metadata,
    };
  });

  console.log(`  🎨 catalog.yml → ${results.length} chunks`);
  return results;
}

/**
 * Collect markdown files from a directory as a given content type.
 */
function collectMarkdownSource(baseDir, contentType, excludePatterns = []) {
  const results = [];

  if (!existsSync(baseDir)) return results;

  const files = findFilesRecursive(baseDir, ".md").filter(
    (f) => !excludePatterns.some((p) => f.includes(p)),
  );

  for (const filePath of files) {
    const raw = readFileSync(filePath, "utf8");
    const relPath = relative(baseDir, filePath);
    const sourceId = basename(filePath, ".md");

    // Extract topic from first H1 heading
    const h1Match = raw.match(/^#\s+(.+)$/m);
    const topic = h1Match ? h1Match[1].trim().toLowerCase().replace(/\s+/g, "-") : contentType;

    const chunks = chunkMarkdown(raw, sourceId);

    for (const chunk of chunks) {
      const metadata = normalizeMetadata({
        source_file: relPath,
        topic,
      });

      results.push({
        content_type: contentType,
        source_id: sourceId,
        chunk_index: chunk.chunkIndex,
        chunk_text: chunk.text,
        chunk_title: chunk.title,
        metadata,
      });
    }

    console.log(`  📋 ${relPath} → ${chunks.length} chunks`);
  }

  return results;
}

// ─── File system helpers ───

function findFilesRecursive(dir, suffix) {
  const results = [];

  function scan(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.name.endsWith(suffix)) {
        results.push(fullPath);
      }
    }
  }

  scan(dir);
  return results;
}

// ─── Main ───

async function main() {
  const isFullRebuild = process.argv.includes("--full");

  console.log(`📚 RAG Index — ${isFullRebuild ? "Full Rebuild" : "Incremental"}`);
  console.log("=".repeat(50));

  // 1. Pre-check Ollama (Scenario #1)
  console.log("\n🔍 Checking Ollama...");
  if (!(await isOllamaAvailable())) {
    console.error("❌ Ollama is not running. Start with: ollama serve");
    process.exit(1);
  }
  console.log("  ✅ Ollama available");

  // Verify model dimensions (Scenario #13)
  console.log("🔍 Verifying model dimensions...");
  try {
    await verifyModelDimensions(DEFAULT_MODEL, 1024);
    console.log("  ✅ bge-m3 returns 1024-dim embeddings");
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  // 2. Authenticate
  console.log("\n🔐 Authenticating...");
  const { client } = await createRagClient();
  console.log("  ✅ Authenticated");

  // 3. Collect all content sources
  console.log("\n📖 Collecting articles...");
  const articleChunks = collectArticles();

  console.log("\n🎬 Collecting scene-data...");
  const sceneChunks = await collectSceneData();

  console.log("\n📋 Collecting source materials...");
  const sourceMaterialChunks = collectMarkdownSource(
    join(projectRoot, "docs", "refs", "source-materials"),
    "source-material",
    ["INDEX.md"], // Exclude index file
  );

  console.log("\n🎨 Collecting asset catalog...");
  const assetCatalogChunks = collectAssetCatalog();

  console.log("\n🎵 Collecting TikTok references...");
  const tiktokChunks = collectMarkdownSource(
    join(projectRoot, "docs", "refs", "tiktok-skills"),
    "tiktok-ref",
    ["AGENTS.md", "CLAUDE.md", "SKILL.md", "/raw/", "/lib/"], // Exclude agent configs, raw files, python lib
  );

  const allChunks = [
    ...articleChunks,
    ...sceneChunks,
    ...sourceMaterialChunks,
    ...tiktokChunks,
    ...assetCatalogChunks,
  ];

  console.log(`\n📊 Total: ${allChunks.length} chunks collected`);

  if (allChunks.length === 0) {
    console.log("  Nothing to index. Exiting.");
    process.exit(0);
  }

  // 4. Compute hashes for all chunks
  for (const chunk of allChunks) {
    chunk.chunk_hash = computeChunkHash(chunk.chunk_text);
  }

  // 5. Determine which chunks need embedding (incremental: hash diff; full: all)
  let chunksToEmbed;

  if (isFullRebuild) {
    chunksToEmbed = allChunks;
    console.log(`\n🧠 Full rebuild: embedding all ${allChunks.length} chunks...`);
  } else {
    console.log("\n🔎 Fetching existing hashes from DB...");
    const allSourceIds = [...new Set(allChunks.map((c) => c.source_id))];
    const existingHashes = await fetchExistingHashes(client, allSourceIds);
    console.log(`  Found ${existingHashes.size} existing chunk hashes in DB`);

    chunksToEmbed = [];
    for (const chunk of allChunks) {
      const key = `${chunk.content_type}:${chunk.source_id}:${chunk.chunk_index}`;
      const existingHash = existingHashes.get(key);
      if (existingHash === chunk.chunk_hash) {
        // Unchanged — skip embedding
        continue;
      }
      chunksToEmbed.push(chunk);
    }

    console.log(`  ${chunksToEmbed.length} chunks changed (need embedding)`);
    console.log(`  ${allChunks.length - chunksToEmbed.length} chunks unchanged (skipped)`);
  }

  // 6. Generate embeddings in batches (only for changed chunks)
  const errorLog = [];
  const chunksWithEmbeddings = [];

  if (chunksToEmbed.length > 0) {
    console.log("\n🧠 Generating embeddings...");
    const BATCH_SIZE = 100;
    for (let i = 0; i < chunksToEmbed.length; i += BATCH_SIZE) {
      const batch = chunksToEmbed.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.chunk_text);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(chunksToEmbed.length / BATCH_SIZE);

      try {
        const embeddings = await embed(texts);
        for (let j = 0; j < batch.length; j++) {
          chunksWithEmbeddings.push({
            ...batch[j],
            embedding: embeddings[j],
          });
        }
        console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} chunks embedded`);
      } catch (err) {
        // Q19: Log failed batch, skip, continue
        console.error(`  ⚠️  Batch ${batchNum} failed: ${err.message}`);
        for (const chunk of batch) {
          errorLog.push({
            source_id: chunk.source_id,
            chunk_index: chunk.chunk_index,
            error: err.message,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    console.log(`\n✅ ${chunksWithEmbeddings.length} chunks embedded, ${errorLog.length} failed`);
  } else {
    console.log("\n✅ No chunks to embed — all unchanged");
  }

  // 7. UPSERT to Supabase (changed chunks only)
  if (chunksWithEmbeddings.length > 0) {
    console.log("\n💾 Upserting to Supabase...");
    await upsertChunks(client, chunksWithEmbeddings);
    console.log(`  ✅ ${chunksWithEmbeddings.length} chunks upserted`);
  } else {
    console.log("\n💾 No chunks to upsert — skipping");
  }

  // 8. Orphan cleanup (Q9, Q18) — always run to catch deleted sources
  console.log("\n🧹 Cleaning up orphaned embeddings...");
  const currentSourceIds = [...new Set(allChunks.map((c) => c.source_id))];
  await cleanupOrphans(client, currentSourceIds);
  console.log(`  ✅ Orphan cleanup complete (${currentSourceIds.length} active sources)`);

  // 9. Write error log if any failures
  if (errorLog.length > 0) {
    mkdirSync(outputDir, { recursive: true });
    const errorLogPath = join(outputDir, "index-errors.log");
    writeFileSync(errorLogPath, JSON.stringify(errorLog, null, 2));
    console.log(`\n⚠️  ${errorLog.length} errors logged to ${errorLogPath}`);
  }

  // 10. Summary
  console.log("\n" + "=".repeat(50));
  console.log(`✅ RAG Index Complete! (${isFullRebuild ? "Full" : "Incremental"})`);
  console.log(`  Total chunks:   ${allChunks.length}`);
  console.log(`  Embedded:       ${chunksWithEmbeddings.length} chunks`);
  console.log(`  Skipped (same): ${allChunks.length - chunksToEmbed.length} chunks`);
  console.log(`  Errors:         ${errorLog.length} chunks`);
  console.log(`  Sources:        ${currentSourceIds.length} active`);
  console.log(`  Articles:       ${articleChunks.length} chunks`);
  console.log(`  Scene-data:     ${sceneChunks.length} chunks`);
  console.log(`  Source-mat:     ${sourceMaterialChunks.length} chunks`);
  console.log(`  TikTok-refs:    ${tiktokChunks.length} chunks`);
  console.log(`  Asset catalog:  ${assetCatalogChunks.length} chunks`);
  console.log("=".repeat(50));
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
