#!/usr/bin/env node
/**
 * RAG Query Script — Semantic search over content knowledge base.
 *
 * Usage:
 *   node scripts/rag/query.mjs "search text"
 *   node scripts/rag/query.mjs "search text" --type article
 *   node scripts/rag/query.mjs "search text" --topics deepseek,funding
 *   node scripts/rag/query.mjs "search text" --format human
 *   node scripts/rag/query.mjs "search text" --rerank
 *
 * Options:
 *   --type <T>        Filter by content_type (article, scene-data, source-material, research, tiktok-ref)
 *   --topics <a,b>    Filter by topics (comma-separated, case-insensitive)
 *   --rerank          Enable reranker (bge-reranker-base; requires `ollama pull bge-reranker-base`)
 *   --format <json|human>  Output format (default: json)
 *   --threshold <F>   Similarity threshold (default: 0.5)
 *   --limit <N>       Max results (default: 10)
 *   --include-noise   Include results below 0.5 similarity (default: filtered out)
 *
 * Spec: docs/archive/spec-rag.md §4.3
 * Q10: Default JSON for Agent consumption; --format human for debugging
 * Q17: Empty topics → NULL to RPC (COALESCE handles in DB)
 *
 * Confidence levels (based on empirical bge-m3 similarity distribution):
 *   high:   ≥ 0.60 — relevant, safe to use directly
 *   low:    0.50 – 0.60 — marginally relevant, use with caution
 *   noise:  < 0.50 — likely irrelevant, filtered out by default
 */

import { embed, isOllamaAvailable } from "./lib/ollama.mjs";
import { createRagClient, queryContent } from "./lib/supabase-client.mjs";

// ─── Confidence classification (pure function, exported for testing) ───

/**
 * Classify a result's confidence level based on its similarity score.
 *
 * Empirical thresholds derived from bge-m3 evaluation:
 *   - Positive queries hit 60-70% similarity
 *   - Negative queries peak at 47-51% similarity
 *   - 50% cleanly separates signal from noise
 *
 * @param {number} similarity — Cosine similarity (0-1 range)
 * @returns {{ level: 'high'|'low'|'noise', label: string, emoji: string }}
 */
export function classifyConfidence(similarity) {
  if (similarity >= 0.6) {
    return { level: "high", label: "high confidence", emoji: "🟢" };
  }
  if (similarity >= 0.5) {
    return { level: "low", label: "low confidence — use with caution", emoji: "🟡" };
  }
  return { level: "noise", label: "noise — likely irrelevant", emoji: "🔴" };
}

// ─── CLI execution (guarded so import doesn't trigger process.exit) ───

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const args = process.argv.slice(2);

  function getArg(name) {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  }

  function hasFlag(name) {
    return args.includes(`--${name}`);
  }

  // First non-flag arg is the query
  const queryText = args.find((a) => !a.startsWith("--"));

  if (!queryText) {
    console.error("❌ Query text is required");
    console.error(
      '   Usage: node scripts/rag/query.mjs "search text" [--type T] [--topics a,b] [--rerank] [--format json|human]',
    );
    process.exit(1);
  }

  const filterType = getArg("type");
  const filterTopicsRaw = getArg("topics");
  const useRerank = hasFlag("rerank");
  const format = getArg("format") || "json";
  const includeNoise = hasFlag("include-noise");
  // When --include-noise is set without explicit --threshold, lower DB threshold to 0.0
  // so noise results are actually returned from the database.
  const explicitThreshold = getArg("threshold");
  const threshold = explicitThreshold ? parseFloat(explicitThreshold) : includeNoise ? 0.0 : 0.5;
  const limit = getArg("limit") ? parseInt(getArg("limit"), 10) : 10;

  // Parse topics: comma-separated → array (Q5: lowercase)
  // Empty string or missing → null (Scenario #10, Q17)
  let filterTopics = null;
  if (filterTopicsRaw) {
    filterTopics = filterTopicsRaw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (filterTopics.length === 0) filterTopics = null;
  }

  // ─── Reranker (optional, Q8) ───

  async function rerankResults(query, results) {
    // Scenario #19: pre-check model availability
    const { OLLAMA_URL } = await import("./lib/ollama.mjs");

    try {
      const tagsResp = await fetch(`${OLLAMA_URL}/api/tags`);
      const tagsData = await tagsResp.json();
      const hasReranker = tagsData.models?.some((m) => m.name?.includes("bge-reranker"));

      if (!hasReranker) {
        console.error("⚠️  --rerank specified but bge-reranker-base not found.");
        console.error("   Run: ollama pull bge-reranker-base");
        console.error("   Returning unranked results.\n");
        return results;
      }

      // Call reranker API
      const resp = await fetch(`${OLLAMA_URL}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "bge-reranker-base",
          input: results.map((r) => `${query}\n\n${r.chunk_text}`),
        }),
      });

      if (!resp.ok) {
        console.error(`⚠️  Reranker API failed: HTTP ${resp.status}`);
        return results;
      }

      const data = await resp.json();

      // Score each result by the mean of its embedding
      const scored = results.map((r, i) => ({
        ...r,
        rerank_score: data.embeddings[i]
          ? data.embeddings[i].reduce((a, b) => a + b, 0) / data.embeddings[i].length
          : 0,
      }));

      scored.sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0));
      return scored;
    } catch (err) {
      console.error(`⚠️  Reranker failed: ${err.message}`);
      return results;
    }
  }

  // ─── Output formatters ───

  function formatJson(results) {
    // Q10: Default JSON for Agent consumption
    const output = results.map((r) => {
      const conf = classifyConfidence(r.similarity || 0);
      return {
        content_type: r.content_type,
        source_id: r.source_id,
        chunk_index: r.chunk_index,
        chunk_title: r.chunk_title,
        similarity: r.similarity ? Number(r.similarity.toFixed(4)) : null,
        confidence: conf.level,
        metadata: r.metadata,
        preview: r.chunk_text?.slice(0, 200) + (r.chunk_text?.length > 200 ? "..." : ""),
      };
    });
    console.log(JSON.stringify(output, null, 2));
  }

  function formatHuman(results) {
    // --format human: readable text for debugging
    if (results.length === 0) {
      console.log("No results found.");
      return;
    }

    const high = results.filter(
      (r) => classifyConfidence(r.similarity || 0).level === "high",
    ).length;
    const low = results.filter((r) => classifyConfidence(r.similarity || 0).level === "low").length;
    const noise = results.filter(
      (r) => classifyConfidence(r.similarity || 0).level === "noise",
    ).length;

    console.log(`Found ${results.length} results:`);
    if (noise > 0) {
      console.log(`  🟢 ${high} high  ·  🟡 ${low} low  ·  🔴 ${noise} noise`);
    } else {
      console.log(`  🟢 ${high} high  ·  🟡 ${low} low`);
    }
    console.log("");
    console.log("─".repeat(60));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const sim = r.similarity ? (r.similarity * 100).toFixed(1) + "%" : "N/A";
      const title = r.chunk_title || "(untitled)";
      const conf = classifyConfidence(r.similarity || 0);

      console.log(`\n[${i + 1}] ${conf.emoji} ${r.content_type} / ${r.source_id}`);
      console.log(`    Title:      ${title}`);
      console.log(`    Similarity: ${sim}`);
      console.log(`    Confidence: ${conf.label}`);
      if (r.metadata?.topics) {
        console.log(`    Topics:     ${r.metadata.topics.join(", ")}`);
      }
      if (r.metadata?.article_slug) {
        console.log(`    Article:    ${r.metadata.article_slug}`);
      }
      console.log(`    Preview:    ${r.chunk_text?.slice(0, 150)}...`);
      console.log("─".repeat(60));
    }
  }

  // ─── Main ───

  async function main() {
    // 1. Pre-check Ollama (Scenario #1)
    if (!(await isOllamaAvailable())) {
      console.error("❌ Ollama is not running. Start with: ollama serve");
      process.exit(1);
    }

    // 2. Authenticate
    const { client } = await createRagClient();

    // 3. Generate query embedding
    const embeddings = await embed([queryText]);
    const queryEmbedding = embeddings[0];

    // 4. Vector search via RPC
    const results = await queryContent(client, queryEmbedding, {
      type: filterType,
      topics: filterTopics,
      threshold,
      limit,
    });

    // 5. Optional rerank (Q8)
    let finalResults = results;
    if (useRerank && results.length > 3) {
      finalResults = await rerankResults(queryText, results);
    }

    // 6. Filter noise unless --include-noise (default: filter < 0.5)
    if (!includeNoise) {
      finalResults = finalResults.filter(
        (r) => classifyConfidence(r.similarity || 0).level !== "noise",
      );
    }

    // 7. Output (Q10)
    if (format === "human") {
      formatHuman(finalResults);
    } else {
      formatJson(finalResults);
    }
  }

  main().catch((err) => {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
  });
}
