/**
 * Collectors — file system content source collectors for RAG indexing.
 *
 * Extracted from index.mjs to enable independent unit testing
 * without Ollama or Supabase.
 *
 * Spec: docs/spec-rag-research-collection.md
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename, relative } from "path";

import { chunkMarkdown } from "./chunker.mjs";
import { normalizeMetadata } from "./normalizer.mjs";

// ─── File system helpers ───

/**
 * Recursively find all files with a given suffix in a directory.
 *
 * @param {string} dir - Directory to scan
 * @param {string} suffix - File suffix to match (e.g. ".md")
 * @returns {string[]} Array of absolute file paths
 */
export function findFilesRecursive(dir, suffix) {
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

// ─── Markdown source collector ───

/**
 * Collect markdown files from a directory as a given content type.
 *
 * @param {string} baseDir - Absolute path to the directory to collect from
 * @param {string} contentType - content_type for all chunks (e.g. "research", "source-material")
 * @param {string[]} [excludePatterns=[]] - Substring patterns to exclude files
 * @param {boolean} [useRelativePath=false] - If true, source_id = repo-relative path without extension.
 *                                            If false, source_id = basename without extension.
 * @param {string|null} [projectRoot=null] - Project root path. Required when useRelativePath=true.
 * @returns {Array<Object>} Array of chunk objects
 */
export function collectMarkdownSource(
  baseDir,
  contentType,
  excludePatterns = [],
  useRelativePath = false,
  projectRoot = null,
) {
  const results = [];

  if (!existsSync(baseDir)) return results;

  const files = findFilesRecursive(baseDir, ".md").filter(
    (f) => !excludePatterns.some((p) => f.includes(p)),
  );

  for (const filePath of files) {
    const raw = readFileSync(filePath, "utf8");
    const relPath = relative(baseDir, filePath);

    // Compute source_id based on mode
    let sourceId;
    if (useRelativePath) {
      if (!projectRoot) {
        throw new Error("projectRoot is required when useRelativePath=true");
      }
      // Repo-relative path without .md extension, using forward slashes
      sourceId = relative(projectRoot, filePath).replace(/\.md$/, "").replace(/\\/g, "/");
    } else {
      sourceId = basename(filePath, ".md");
    }

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
