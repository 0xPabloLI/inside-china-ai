#!/usr/bin/env node
/**
 * SEO structured-data gate.
 *
 * Local (default, offline): validates every JSON-LD document registered in
 * `src/lib/seo-jsonld-registry.ts` against the zod schemas in
 * `scripts/seo/jsonld-schema.mjs`. Non-zero exit blocks the build (wired to
 * `prebuild`), so malformed Article / FAQPage / BreadcrumbList markup can never
 * ship.
 *
 * Optional online spot-check:
 *   node scripts/seo/validate-jsonld.mjs --online
 *   node scripts/seo/validate-jsonld.mjs --online https://chinaai.news/companies
 * Fetches the live HTML, validates the JSON-LD actually served, and prints
 * Google Rich Results Test links for manual confirmation.
 */

import { spawnSync } from "child_process";
import { extractJsonLdFromHtml, validateJsonLdDoc } from "./jsonld-schema.mjs";

const args = process.argv.slice(2);
const online = args.includes("--online");
const urlArgs = args.filter((a) => a.startsWith("http"));

const DEFAULT_ONLINE_URLS = [
  "https://chinaai.news/",
  "https://chinaai.news/companies",
  "https://chinaai.news/compare/deepseek-vs-qwen-vs-glm",
  "https://chinaai.news/tiktok-connect",
];

function runLocalGate() {
  console.log("🔎 Validating registered JSON-LD (offline)…");
  const res = spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", "src/lib/structured-data.test.ts", "--reporter=dot"],
    { stdio: "inherit", env: { ...process.env, CI: "true" } },
  );
  return res.status === 0;
}

async function runOnlineCheck() {
  const urls = urlArgs.length ? urlArgs : DEFAULT_ONLINE_URLS;
  let ok = true;
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "china-ai-news-seo-gate" } });
      if (!res.ok) {
        console.error(`  ✗ ${url} — HTTP ${res.status}`);
        ok = false;
        continue;
      }
      const docs = extractJsonLdFromHtml(await res.text());
      if (docs.length === 0) {
        console.error(`  ✗ ${url} — no JSON-LD found`);
        ok = false;
        continue;
      }
      const errors = docs.flatMap((d, i) => validateJsonLdDoc(d, `${url}#${i + 1}`));
      if (errors.length) {
        ok = false;
        for (const e of errors) console.error(`  ✗ ${e}`);
      } else {
        console.log(`  ✓ ${url} — ${docs.length} document(s) valid`);
      }
      console.log(
        `    Rich Results: https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`,
      );
    } catch (e) {
      ok = false;
      console.error(`  ✗ ${url} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return ok;
}

const localOk = runLocalGate();
let onlineOk = true;
if (online) {
  console.log("\n🌐 Spot-checking live URLs…");
  onlineOk = await runOnlineCheck();
}

if (!localOk || !onlineOk) {
  console.error("\n❌ Structured-data gate failed — fix the JSON-LD above before publishing.");
  process.exit(1);
}
console.log("\n✅ Structured-data gate passed.");
