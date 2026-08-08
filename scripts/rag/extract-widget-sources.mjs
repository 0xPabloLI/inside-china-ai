#!/usr/bin/env node
/**
 * Widget Source URL Extractor — RAG Phase 2 (T-20)
 *
 * Scans widget data TS files, extracts sourceUrl/url fields,
 * fetches external content, and saves as markdown for RAG indexing.
 *
 * Usage:
 *   node scripts/rag/extract-widget-sources.mjs
 *
 * Spec: docs/spec-rag.md §4.5
 * Scenarios covered: #15 (paywall → stub), #16 (403/429 → stub), #17 (dedup)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");

const WIDGETS_DATA_GLOB = join(PROJECT_ROOT, "src", "components", "widgets");
const OUTPUT_DIR = join(PROJECT_ROOT, "docs", "refs", "source-materials", "widget-sources");
const ERROR_LOG = join(PROJECT_ROOT, "scripts", "rag", "output", "extract-errors.log");

/**
 * Regex to match `sourceUrl: "..."` or `url: "..."` in TS files.
 * Handles multi-line values (field name and value on separate lines).
 * Captures: group 1 = field name, group 2 = URL value.
 */
const URL_FIELD_REGEX = /(?:sourceUrl|url)\s*:\s*["']([^"']+)["']/gi;

/**
 * Extract all sourceUrl/url field values from TS file content.
 *
 * @param {string} content — TS file content
 * @param {string} filePath — Relative file path (used to derive widgetId)
 * @returns {Array<{url: string, widgetId: string, fieldName: string}>}
 */
export function extractUrlsFromContent(content, filePath) {
  // Derive widgetId from path: "<widget>/data/<file>.ts" → "<widget>"
  const parts = filePath.split("/");
  const widgetId = parts.length >= 2 ? parts[parts.length - 3] || parts[0] : parts[0];

  const results = [];
  let match;
  // Reset regex state
  URL_FIELD_REGEX.lastIndex = 0;
  while ((match = URL_FIELD_REGEX.exec(content)) !== null) {
    const fieldName = match[0].includes("sourceUrl") ? "sourceUrl" : "url";
    const url = match[1];
    results.push({ url, widgetId, fieldName });
  }

  return results;
}

/**
 * Deduplicate URL entries, keeping the first occurrence of each URL.
 * (Scenario #17: multiple widget data files reference same URL)
 *
 * @param {Array<{url: string, widgetId: string, fieldName: string}>} entries
 * @returns {Array<{url: string, widgetId: string, fieldName: string}>}
 */
export function deduplicateUrls(entries) {
  const seen = new Set();
  const deduped = [];
  for (const entry of entries) {
    if (!seen.has(entry.url)) {
      seen.add(entry.url);
      deduped.push(entry);
    }
  }
  return deduped;
}

/**
 * Convert a URL to a filesystem-safe slug.
 *
 * Strips protocol, removes special characters, truncates to 100 chars.
 *
 * @param {string} url
 * @returns {string}
 */
export function slugifyUrl(url) {
  let slug = url
    .replace(/^https?:\/\//, "")
    .replace(/[?#].*$/, "") // remove query params and fragments
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  // Truncate to 100 chars
  if (slug.length > 100) {
    slug = slug.substring(0, 100);
    // Trim to last dash to avoid partial words
    const lastDash = slug.lastIndexOf("-");
    if (lastDash > 50) {
      slug = slug.substring(0, lastDash);
    }
  }

  return slug || "untitled";
}

/**
 * Create markdown for a successfully fetched source.
 *
 * Format (spec §4.5):
 * # Source: <title>
 * > URL: <url>
 * > Extracted from widget: <widget-id>
 *
 * <content>
 *
 * @param {string} url
 * @param {string} widgetId
 * @param {string} title
 * @param {string} content
 * @returns {string}
 */
export function createSourceMarkdown(url, widgetId, title, content) {
  const displayTitle = title || "(Untitled)";
  return `# Source: ${displayTitle}\n> URL: ${url}\n> Extracted from widget: ${widgetId}\n\n${content}\n`;
}

/**
 * Create stub markdown for a failed fetch (paywall, 403, timeout).
 * (Scenario #15, #16)
 *
 * Format (spec §4.5):
 * # Source: <title> (Stub)
 * > URL: <url>
 * > Extracted from widget: <widget-id>
 *
 * ## Note
 * Content could not be fetched (reason). Widget data summary: <key data points>.
 *
 * @param {string} url
 * @param {string} widgetId
 * @param {string} title
 * @param {string} reason — Error reason (HTTP status, timeout, etc.)
 * @param {string} summary — Key data points from widget TS file
 * @returns {string}
 */
export function createStubMarkdown(url, widgetId, title, reason, summary) {
  const displayTitle = title || "(Untitled)";
  let note = `Content could not be fetched (${reason}).`;
  if (summary) {
    note += ` Widget data summary: ${summary}.`;
  }
  return `# Source: ${displayTitle} (Stub)\n> URL: ${url}\n> Extracted from widget: ${widgetId}\n\n## Note\n${note}\n`;
}

/**
 * Fetch content from a URL.
 *
 * @param {string} url
 * @param {number} [timeoutMs=15000] — Fetch timeout in milliseconds
 * @returns {Promise<{title: string, content: string}>}
 * @throws {Error} On HTTP error (403, 429, etc.) or network failure
 */
export async function fetchUrlContent(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ChinaAINewsBot/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract title from HTML
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Simple HTML to text conversion
    const content = htmlToText(html);

    return { title, content };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Simple HTML to text conversion.
 * Strips tags, scripts, styles, and normalizes whitespace.
 *
 * @param {string} html
 * @returns {string}
 */
function htmlToText(html) {
  return (
    html
      // Remove script and style blocks
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      // Convert block elements to newlines
      .replace(/<(?:p|div|h[1-6]|br|li|tr)[^>]*>/gi, "\n")
      // Remove all remaining tags
      .replace(/<[^>]+>/g, "")
      // Decode common HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      // Normalize whitespace
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

/**
 * Scan all widget data TS files and extract URL entries.
 *
 * @returns {Array<{url: string, widgetId: string, fieldName: string, filePath: string}>}
 */
function scanWidgetDataFiles() {
  const widgetDirs = readdirSync(WIDGETS_DATA_GLOB, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const allEntries = [];

  for (const widgetDir of widgetDirs) {
    const dataDir = join(WIDGETS_DATA_GLOB, widgetDir, "data");
    if (!existsSync(dataDir)) continue;

    const tsFiles = readdirSync(dataDir).filter((f) => f.endsWith(".ts"));
    for (const tsFile of tsFiles) {
      const filePath = join(dataDir, tsFile);
      const relPath = `${widgetDir}/data/${tsFile}`;
      const content = readFileSync(filePath, "utf-8");
      const entries = extractUrlsFromContent(content, relPath);
      // Attach filePath to each entry for stub summary extraction
      for (const entry of entries) {
        entry.filePath = relPath;
        entry.tsContent = content;
      }
      allEntries.push(...entries);
    }
  }

  return allEntries;
}

/**
 * Extract a brief summary from widget TS content for stub markdown.
 * Returns key data points (first few string values).
 *
 * @param {string} tsContent
 * @returns {string}
 */
function extractWidgetSummary(tsContent) {
  // Extract string values that look like data points
  const stringValues = [];
  const stringRegex = /["']([^"']{5,80})["']/g;
  let match;
  while (stringValues.length < 5 && (match = stringRegex.exec(tsContent)) !== null) {
    const val = match[1];
    // Skip URLs, CSS colors, import paths
    if (!val.startsWith("http") && !val.startsWith("#") && !val.includes("import")) {
      stringValues.push(val);
    }
  }
  return stringValues.join("; ");
}

/**
 * Main: scan widget files, deduplicate URLs, fetch content, save markdown.
 *
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] — If true, only scan and list URLs without fetching
 * @param {Function} [options.fetchFn=fetchUrlContent] — Fetch function (for testing)
 */
export async function main(options = {}) {
  const { dryRun = false, fetchFn = fetchUrlContent } = options;

  // Ensure output directory exists
  if (!dryRun) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    mkdirSync(dirname(ERROR_LOG), { recursive: true });
  }

  // 1. Scan all widget data TS files
  console.log("📂 Scanning widget data files...");
  const allEntries = scanWidgetDataFiles();
  console.log(`   Found ${allEntries.length} URL entries across widget files`);

  // 2. Deduplicate URLs (Scenario #17)
  const deduped = deduplicateUrls(allEntries);
  console.log(`   ${deduped.length} unique URLs after deduplication`);

  if (dryRun) {
    console.log("\nURLs to fetch:");
    for (const entry of deduped) {
      console.log(`  [${entry.widgetId}] ${entry.url}`);
    }
    return { total: allEntries.length, unique: deduped.length, fetched: 0, stubs: 0, errors: 0 };
  }

  // 3. Fetch content for each URL
  let fetched = 0;
  let stubs = 0;
  let errors = 0;
  const errorLines = [];

  for (const entry of deduped) {
    const slug = slugifyUrl(entry.url);
    const fileName = `${entry.widgetId}-${slug}.md`;
    const outputPath = join(OUTPUT_DIR, fileName);

    process.stdout.write(`  Fetching ${entry.url}... `);

    try {
      const { title, content } = await fetchFn(entry.url);
      const md = createSourceMarkdown(entry.url, entry.widgetId, title, content);
      writeFileSync(outputPath, md);
      console.log("✅");
      fetched++;
    } catch (err) {
      const reason = err.message;
      const summary = extractWidgetSummary(entry.tsContent || "");
      const md = createStubMarkdown(entry.url, entry.widgetId, "", reason, summary);
      writeFileSync(outputPath, md);
      console.log(`⚠️ Stub (${reason})`);
      stubs++;
      errorLines.push(`[${new Date().toISOString()}] ${entry.url} — ${reason}`);
      errors++;
    }
  }

  // 4. Log failures
  if (errorLines.length > 0) {
    writeFileSync(ERROR_LOG, errorLines.join("\n") + "\n");
    console.log(`\n⚠️ ${errorLines.length} failures logged to ${ERROR_LOG}`);
  }

  // 5. Summary
  console.log(`\n📊 Summary:`);
  console.log(`   ${allEntries.length} total URL entries found`);
  console.log(`   ${deduped.length} unique URLs`);
  console.log(`   ${fetched} fetched successfully`);
  console.log(`   ${stubs} stubs created (failed fetches)`);
  console.log(`   ${errors} errors logged`);

  return { total: allEntries.length, unique: deduped.length, fetched, stubs, errors };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  main({ dryRun }).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
