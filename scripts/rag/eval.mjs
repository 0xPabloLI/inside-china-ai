#!/usr/bin/env node
/**
 * RAG Evaluation Script — Golden Query Evaluation (T-22)
 *
 * Loads golden queries from YAML, runs each through embedding + match_content,
 * checks if expected sources appear in top-5 results, and reports hit rate.
 *
 * Usage:
 *   node scripts/rag/eval.mjs
 *
 * Exit code: 0 if hit rate >= 80%, 1 otherwise
 *
 * Spec: docs/archive/spec-rag.md §4.4
 * Depends on: T-16 (query.mjs), T-23 (golden-queries.yaml)
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

import { embed, isOllamaAvailable } from "./lib/ollama.mjs";
import { createRagClient, queryContent } from "./lib/supabase-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_QUERIES_PATH = join(
  __dirname,
  "..",
  "..",
  "docs",
  "refs",
  "rag-eval",
  "golden-queries.yaml",
);

const PASS_THRESHOLD = 80; // 80% hit rate required to pass
const TOP_K = 5; // Check top-5 results

// ─── Pure functions (testable) ───

/**
 * Evaluate a single golden query against search results.
 *
 * For positive queries (expected_sources non-empty):
 *   hit = any expected source matches any top-K result (by content_type + source_id)
 * For negative queries (expected_sources empty):
 *   hit = true if results are empty (correct — no false positives)
 *   hit = false if results are returned (false positive)
 *
 * @param {Object} queryEntry — { query, expected_sources, notes }
 * @param {Array} topResults — Array of { content_type, source_id, similarity } from match_content
 * @returns {{ hit: boolean, matchedSources: string[], missedSources: string[], topSourceIds: string[] }}
 */
export function evaluateQuery(queryEntry, topResults) {
  const topK = topResults.slice(0, TOP_K);
  const topSourceIds = topK.map((r) => `${r.content_type}:${r.source_id}`);
  const expected = queryEntry.expected_sources || [];

  // Negative query: expected_sources is empty
  if (expected.length === 0) {
    return {
      hit: topK.length === 0,
      matchedSources: [],
      missedSources: [],
      topSourceIds,
    };
  }

  // Positive query: check if any expected source matches any top-K result
  const matchedSources = [];
  const missedSources = [];

  for (const exp of expected) {
    const expKey = `${exp.content_type}:${exp.source_id}`;
    if (topSourceIds.includes(expKey)) {
      matchedSources.push(expKey);
    } else {
      missedSources.push(expKey);
    }
  }

  return {
    hit: matchedSources.length > 0,
    matchedSources,
    missedSources,
    topSourceIds,
  };
}

/**
 * Calculate hit rate from evaluation results.
 *
 * @param {Array<{ hit: boolean }>} evalResults
 * @returns {{ total: number, hits: number, misses: number, percentage: number, passesThreshold: boolean }}
 */
export function calculateHitRate(evalResults) {
  const total = evalResults.length;
  const hits = evalResults.filter((r) => r.hit).length;
  const misses = total - hits;
  const percentage = total > 0 ? Math.round((hits / total) * 100) : 0;

  return {
    total,
    hits,
    misses,
    percentage,
    passesThreshold: percentage >= PASS_THRESHOLD,
  };
}

/**
 * Categorize evaluation results by query type based on notes field.
 *
 * Categories: cross-language, entity-alias, data-point, negative, tiktok, research, other
 *
 * @param {Array<{ notes: string }>} evalResults
 * @returns {Object<string, Array>} — { category: results[] }
 */
export function categorizeByType(evalResults) {
  const categories = {};

  for (const result of evalResults) {
    const notes = (result.notes || "").toLowerCase();
    let category = "other";

    if (notes.includes("cross-language")) {
      category = "cross-language";
    } else if (notes.includes("entity alias")) {
      category = "entity-alias";
    } else if (notes.includes("data point")) {
      category = "data-point";
    } else if (notes.includes("negative")) {
      category = "negative";
    } else if (notes.includes("tiktok")) {
      category = "tiktok";
    } else if (notes.includes("research")) {
      category = "research";
    }

    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(result);
  }

  return categories;
}

/**
 * Format the evaluation report as a string.
 *
 * @param {Array} evalResults — Full evaluation results with query, hit, matchedSources, etc.
 * @param {Object} categories — Output of categorizeByType
 * @param {Object} rate — Output of calculateHitRate
 * @returns {string} Formatted report
 */
export function formatReport(evalResults, categories, rate) {
  const lines = [];

  lines.push("╔" + "═".repeat(58) + "╗");
  lines.push("║" + " RAG Evaluation Report".padEnd(58) + "║");
  lines.push("╚" + "═".repeat(58) + "╝");
  lines.push("");

  // Summary
  lines.push("─── Summary ───");
  lines.push(`  Total queries: ${rate.total}`);
  lines.push(`  Hits:          ${rate.hits}`);
  lines.push(`  Misses:        ${rate.misses}`);
  lines.push(`  Hit Rate:      ${rate.percentage}%`);
  lines.push(`  Threshold:     ${PASS_THRESHOLD}%`);
  lines.push(`  Status:        ${rate.passesThreshold ? "✅ PASS" : "❌ FAIL"}`);
  lines.push("");

  // Per-category breakdown
  lines.push("─── Per-Category Breakdown ───");
  for (const [category, results] of Object.entries(categories)) {
    const catHits = results.filter((r) => r.hit).length;
    const catTotal = results.length;
    const catRate = catTotal > 0 ? Math.round((catHits / catTotal) * 100) : 0;
    lines.push(`  ${category.padEnd(20)} ${catHits}/${catTotal} (${catRate}%)`);
  }
  lines.push("");

  // Misses detail
  const misses = evalResults.filter((r) => !r.hit);
  if (misses.length > 0) {
    lines.push("─── Missed Queries ───");
    for (const miss of misses) {
      lines.push(`  Query:   ${miss.query}`);
      lines.push(`  Notes:   ${miss.notes || "(none)"}`);
      lines.push(`  Top-5:   ${miss.topSourceIds?.join(", ") || "(none)"}`);
      if (miss.missedSources?.length > 0) {
        lines.push(`  Expected: ${miss.missedSources.join(", ")}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ─── I/O functions ───

/**
 * Load golden queries from YAML file.
 *
 * @param {string} [yamlPath] — Path to golden-queries.yaml (default: standard location)
 * @returns {Array<{ query: string, expected_sources: Array, notes: string }>}
 */
export function loadGoldenQueries(yamlPath = GOLDEN_QUERIES_PATH) {
  const content = readFileSync(yamlPath, "utf8");
  return yaml.load(content);
}

// ─── Main ───

async function main() {
  console.log("📊 RAG Evaluation");
  console.log("=".repeat(50));

  // 1. Load golden queries
  console.log("\n📋 Loading golden queries...");
  const queries = loadGoldenQueries();
  console.log(`   Loaded ${queries.length} queries`);

  // 2. Pre-check Ollama
  console.log("\n🔍 Checking Ollama availability...");
  if (!(await isOllamaAvailable())) {
    console.error("❌ Ollama is not running. Start with: ollama serve");
    process.exit(1);
  }
  console.log("   ✅ Ollama available");

  // 3. Authenticate
  console.log("\n🔐 Authenticating...");
  const { client } = await createRagClient();
  console.log("   ✅ Authenticated");

  // 4. Evaluate each query
  console.log("\n🧪 Running evaluations...\n");
  const evalResults = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    process.stdout.write(`  [${i + 1}/${queries.length}] "${q.query.substring(0, 50)}${q.query.length > 50 ? "..." : ""}" ... `);

    try {
      // Generate embedding
      const embeddings = await embed([q.query]);
      const queryEmbedding = embeddings[0];

      // Query match_content (no filters, default threshold)
      const results = await queryContent(client, queryEmbedding, {
        threshold: 0.3,
        limit: TOP_K,
      });

      // Evaluate
      const evalResult = evaluateQuery(q, results);
      evalResults.push({
        ...evalResult,
        query: q.query,
        notes: q.notes || "",
      });

      console.log(evalResult.hit ? "✅ HIT" : "❌ MISS");
    } catch (err) {
      console.log(`⚠️ ERROR: ${err.message}`);
      evalResults.push({
        hit: false,
        matchedSources: [],
        missedSources: (q.expected_sources || []).map(
          (e) => `${e.content_type}:${e.source_id}`,
        ),
        topSourceIds: [],
        query: q.query,
        notes: q.notes || "",
        error: err.message,
      });
    }
  }

  // 5. Calculate and report
  const rate = calculateHitRate(evalResults);
  const categories = categorizeByType(evalResults);
  const report = formatReport(evalResults, categories, rate);

  console.log("\n" + report);

  // 6. Exit code
  process.exit(rate.passesThreshold ? 0 : 1);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`\n❌ Fatal error: ${err.message}`);
    process.exit(1);
  });
}
