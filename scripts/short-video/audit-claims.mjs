#!/usr/bin/env node

/**
 * Evidence audit CLI (#61) — non-blocking claim audit for an article.
 *
 * Extracts the MRL-1 B6 inline claim annotations, classifies claim risk
 * (deterministic rules), cross-checks the Verification Summary, and — when a
 * discovery evidence pack exists — fuzzy-matches claims against public
 * evidence. Output: warnings + an "Evidence Coverage Report" markdown
 * section to append to the MRL-1 report. Never blocks publication.
 *
 * Usage:
 *   node scripts/short-video/audit-claims.mjs --article articles/foo.md [--discovery output/foo/discovery.json] [--out output/foo/evidence-audit.json] [--json]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

import {
  auditClaims,
  matchEvidence,
  generateCoverageReport,
} from "./lib/claim-audit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const articlePath = getArg("article");
if (!articlePath || !existsSync(articlePath)) {
  console.error("❌ --article <path> is required (and must exist)");
  process.exit(1);
}

const markdown = readFileSync(articlePath, "utf8");
const audit = auditClaims(markdown);

// Optional evidence pack: discovery.json from search-sources research mode
let evidenceArticles = [];
const discoveryPath = getArg("discovery");
if (discoveryPath && existsSync(discoveryPath)) {
  try {
    const discovery = JSON.parse(readFileSync(discoveryPath, "utf8"));
    evidenceArticles = (discovery.sources ?? []).map((s) => ({
      title: s.title ?? "",
      snippet: s.snippet ?? "",
      url: s.url,
    }));
  } catch (e) {
    console.warn(`⚠️  discovery parse failed: ${e.message}`);
  }
}
const evidenceMatches = matchEvidence(audit.claims, evidenceArticles);

console.log(`📋 Evidence audit — ${articlePath}`);
console.log("─".repeat(60));
console.log(`  Inline annotations: ${audit.stats.total} (verified ${audit.stats.verified} / partially-verified ${audit.stats["partially-verified"]} / unverified ${audit.stats.unverified} / contradicts ${audit.stats.contradicts})`);
console.log(`  Summary section: ${audit.summary.found ? "found" : "missing"}`);
console.log(`  Evidence matches: ${evidenceMatches.filter((m) => m.matches.length > 0).length}/${audit.claims.length} claims`);
if (audit.warnings.length > 0) {
  console.log("  Warnings:");
  for (const w of audit.warnings) {
    console.log(`    ⚠️  ${w.code}${w.line ? ` (line ${w.line})` : ""}: ${w.message}`);
  }
}
const report = generateCoverageReport(audit, evidenceMatches);
console.log("─".repeat(60));
console.log(report);

if (hasFlag("json") || getArg("out")) {
  const slug = basename(articlePath).replace(/\.md$/, "");
  const outPath = getArg("out") ?? join(__dirname, "output", "audit-claims", `${slug}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      { auditedAt: new Date().toISOString(), article: articlePath, ...audit, evidenceMatches, coverageReport: report },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`  📁 Written: ${outPath}`);
}

// Non-blocking by design (#61): warnings only — always exit 0.
process.exit(0);
