#!/usr/bin/env node
/**
 * SearXNG vs CDP — per-engine comparison
 * Tests the SAME engine via SearXNG backend vs direct CDP scraping
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CDP_BASE = "http://localhost:3456";
const SEARXNG_BASE = "http://localhost:8888";
const QUERY = "DeepSeek China AI";

// ─── CDP helpers ───
async function cdpNewTab(url) {
  const resp = await fetch(`${CDP_BASE}/new`, { method: "POST", body: url });
  const data = await resp.json();
  return data.targetId;
}

async function cdpEvalRaw(tabId, script) {
  const resp = await fetch(`${CDP_BASE}/eval?target=${tabId}`, {
    method: "POST",
    body: script,
  });
  return resp.json();
}

async function cdpCloseTab(tabId) {
  try {
    await fetch(`${CDP_BASE}/close?target=${tabId}`);
  } catch {}
}

async function waitForLoad(tabId, maxWait = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const resp = await cdpEvalRaw(tabId, "document.readyState");
      const val = resp?.result?.value || resp?.value || "";
      if (val === "complete" || val === "interactive") return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function cdpEvalJSON(tabId, script) {
  const resp = await cdpEvalRaw(tabId, script);
  const val = resp?.result?.value || resp?.value || "[]";
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

// ─── SearXNG helpers ───
async function searxngSearch(query, engines, language = "en") {
  const url = `${SEARXNG_BASE}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=${language}&engines=${engines}`;
  const t0 = Date.now();
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await resp.json();
    const elapsed = Date.now() - t0;
    const results = (data.results || []).map((r) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: r.content ? r.content.substring(0, 200) : "",
      engine: r.engines || [],
      score: r.score || 0,
    }));
    const unresponsive = data.unresponsive_engines || [];
    return { results, elapsed, unresponsive, error: null };
  } catch (e) {
    return { results: [], elapsed: Date.now() - t0, unresponsive: [], error: e.message };
  }
}

// ─── CDP per-engine tests ───

async function cdpGoogle(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const t0 = Date.now();
  const tabId = await cdpNewTab(url);
  await new Promise((r) => setTimeout(r, 5000));
  await waitForLoad(tabId);

  const results = await cdpEvalJSON(
    tabId,
    `(function(){
    var results = [];
    document.querySelectorAll('h3').forEach(function(h3) {
      if (h3.closest('[id*="ask"], [jsname*="ask"]')) return;
      var link = h3.closest('a') || h3.parentElement.querySelector('a');
      if (!link || !link.href || link.href.includes('google.com/search')) return;
      var titleText = h3.textContent.trim();
      if (titleText.length < 3) return;
      var container = h3.closest('div');
      var snippetEl = container ? container.querySelector('.zz3gNc, .VwiC3b, .IsZvec, .yDYNvb, .MUxGbd, [data-sncf]') : null;
      if (!snippetEl && container) {
        var parent = h3.parentElement.parentElement;
        if (parent) {
          var divs = parent.querySelectorAll('div, span');
          for (var i = 0; i < divs.length; i++) {
            var t = divs[i].textContent.trim();
            if (t.length > 30 && t.length < 300 && !divs[i].querySelector('h3') && !divs[i].querySelector('a')) {
              snippetEl = divs[i];
              break;
            }
          }
        }
      }
      results.push({ title: titleText, url: link.href, snippet: snippetEl ? snippetEl.textContent.trim().substring(0,200) : '' });
    });
    return JSON.stringify(results.slice(0, 20));
  })()`,
  );

  await cdpCloseTab(tabId);
  return { results, elapsed: Date.now() - t0, error: null };
}

async function cdpBing(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const t0 = Date.now();
  const tabId = await cdpNewTab(url);
  await new Promise((r) => setTimeout(r, 5000));
  await waitForLoad(tabId);

  const results = await cdpEvalJSON(
    tabId,
    `(function(){
    var results = [];
    document.querySelectorAll('.b_algo').forEach(function(el) {
      var link = el.querySelector('h2 a, a[href]');
      var title = el.querySelector('h2, h3');
      var snippet = el.querySelector('.b_caption p, .b_lineclamp1, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4');
      if (link && title) {
        results.push({ title: title.textContent.trim(), url: link.href, snippet: snippet ? snippet.textContent.trim().substring(0,200) : '' });
      } else if (link) {
        results.push({ title: link.textContent.trim(), url: link.href, snippet: snippet ? snippet.textContent.trim().substring(0,200) : '' });
      }
    });
    return JSON.stringify(results.slice(0, 20));
  })()`,
  );

  await cdpCloseTab(tabId);
  return { results, elapsed: Date.now() - t0, error: null };
}

async function cdpDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const t0 = Date.now();
  const tabId = await cdpNewTab(url);
  await new Promise((r) => setTimeout(r, 3000));
  await waitForLoad(tabId);

  const results = await cdpEvalJSON(
    tabId,
    `(function(){
    var results = [];
    document.querySelectorAll('#links .result, .result, .web-result').forEach(function(el) {
      var link = el.querySelector('.result__a, a.result__a');
      var snippet = el.querySelector('.result__snippet');
      if (link) {
        var url = link.href || '';
        if (url.startsWith('//')) url = 'https:' + url;
        results.push({ title: link.textContent.trim(), url: url, snippet: snippet ? snippet.textContent.trim().substring(0,200) : '' });
      }
    });
    return JSON.stringify(results.slice(0, 20));
  })()`,
  );

  await cdpCloseTab(tabId);
  return { results, elapsed: Date.now() - t0, error: null };
}

async function cdpBaidu(query) {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
  const t0 = Date.now();
  const tabId = await cdpNewTab(url);
  await new Promise((r) => setTimeout(r, 5000));
  await waitForLoad(tabId);

  const results = await cdpEvalJSON(
    tabId,
    `(function(){
    var results = [];
    document.querySelectorAll('h3').forEach(function(h3) {
      var link = h3.querySelector('a') || (h3.tagName === 'A' ? h3 : null);
      if (!link || !link.href) return;
      if (link.href.includes('baidu.com/link?url=') || link.href.match(/^https?:\\/\\/[^/]*\\.(com|cn|org|net)\\//)) {
        var title = h3.textContent.trim();
        if (title.length < 5) return;
        var snippet = '';
        var searchParent = h3.parentElement;
        var snippetSelectors = [
          '.c-abstract', '[class*="abstract"]', '[class*="summary"]',
          '[class*="desc"]', '[class*="content"]', 'p.c-color-text',
          'div.c-span-last', 'p', 'div[class*="content-gap"]', 'div[class*="main-info"]'
        ];
        for (var k = 0; k < 4 && searchParent && !snippet; k++) {
          for (var s = 0; s < snippetSelectors.length; s++) {
            var el = searchParent.querySelector(snippetSelectors[s]);
            if (el && el.textContent.trim().length > 25) {
              snippet = el.textContent.trim().substring(0, 200);
              break;
            }
          }
          searchParent = searchParent.parentElement;
        }
        results.push({ title: title.substring(0, 100), url: link.href, snippet: snippet });
      }
    });
    return JSON.stringify(results.slice(0, 20));
  })()`,
  );

  await cdpCloseTab(tabId);
  return { results, elapsed: Date.now() - t0, error: null };
}

// ─── Main ───
async function main() {
  console.log("=".repeat(70));
  console.log("🔬 SearXNG vs CDP — Per-Engine Comparison");
  console.log(`   Query: "${QUERY}"`);
  console.log("=".repeat(70));

  const all = [];

  // ── Google ──
  console.log("\n─── Google ───");
  console.log("CDP direct...");
  const gCdp = await cdpGoogle(QUERY);
  console.log(
    `  ${gCdp.results.length} results, ${gCdp.elapsed}ms, snippets: ${gCdp.results.filter((r) => r.snippet).length}/${gCdp.results.length}`,
  );

  console.log("SearXNG (google cse engine)...");
  const gSx = await searxngSearch(QUERY, "google cse", "en");
  console.log(
    `  ${gSx.results.length} results, ${gSx.elapsed}ms, snippets: ${gSx.results.filter((r) => r.snippet).length}/${gSx.results.length}, unresponsive: ${gSx.unresponsive.map((e) => e[0]).join(",") || "none"}`,
  );

  all.push({ engine: "Google", cdp: gCdp, searxng: gSx });
  await new Promise((r) => setTimeout(r, 3000));

  // ── Bing ──
  console.log("\n─── Bing ───");
  console.log("CDP direct...");
  const bCdp = await cdpBing(QUERY);
  console.log(
    `  ${bCdp.results.length} results, ${bCdp.elapsed}ms, snippets: ${bCdp.results.filter((r) => r.snippet).length}/${bCdp.results.length}`,
  );

  console.log("SearXNG (bing engine)...");
  const bSx = await searxngSearch(QUERY, "bing", "en");
  console.log(
    `  ${bSx.results.length} results, ${bSx.elapsed}ms, snippets: ${bSx.results.filter((r) => r.snippet).length}/${bSx.results.length}, unresponsive: ${bSx.unresponsive.map((e) => e[0]).join(",") || "none"}`,
  );

  all.push({ engine: "Bing", cdp: bCdp, searxng: bSx });
  await new Promise((r) => setTimeout(r, 3000));

  // ── DuckDuckGo ──
  console.log("\n─── DuckDuckGo ───");
  console.log("CDP direct...");
  const dCdp = await cdpDuckDuckGo(QUERY);
  console.log(
    `  ${dCdp.results.length} results, ${dCdp.elapsed}ms, snippets: ${dCdp.results.filter((r) => r.snippet).length}/${dCdp.results.length}`,
  );

  console.log("SearXNG (duckduckgo engine)...");
  const dSx = await searxngSearch(QUERY, "duckduckgo", "en");
  console.log(
    `  ${dSx.results.length} results, ${dSx.elapsed}ms, snippets: ${dSx.results.filter((r) => r.snippet).length}/${dSx.results.length}, unresponsive: ${dSx.unresponsive.map((e) => e[0]).join(",") || "none"}`,
  );

  all.push({ engine: "DuckDuckGo", cdp: dCdp, searxng: dSx });
  await new Promise((r) => setTimeout(r, 3000));

  // ── Baidu (Chinese) ──
  console.log("\n─── Baidu ───");
  console.log("CDP direct...");
  const baiCdp = await cdpBaidu(QUERY);
  console.log(
    `  ${baiCdp.results.length} results, ${baiCdp.elapsed}ms, snippets: ${baiCdp.results.filter((r) => r.snippet).length}/${baiCdp.results.length}`,
  );

  console.log("SearXNG (baidu engine)...");
  const baiSx = await searxngSearch(QUERY, "baidu", "zh");
  console.log(
    `  ${baiSx.results.length} results, ${baiSx.elapsed}ms, snippets: ${baiSx.results.filter((r) => r.snippet).length}/${baiSx.results.length}, unresponsive: ${baiSx.unresponsive.map((e) => e[0]).join(",") || "none"}`,
  );

  all.push({ engine: "Baidu", cdp: baiCdp, searxng: baiSx });

  // ── Summary ──
  console.log("\n" + "=".repeat(70));
  console.log("📊 COMPARISON TABLE");
  console.log("=".repeat(70));
  console.log("| Engine       | Method  | Results | Time   | Snippets | Unresponsive |");
  console.log("|-------------|---------|---------|--------|----------|--------------|");
  for (const a of all) {
    console.log(
      `| ${a.engine.padEnd(12)} | CDP     | ${String(a.cdp.results.length).padEnd(7)} | ${String(a.cdp.elapsed + "ms").padEnd(6)} | ${String(a.cdp.results.filter((r) => r.snippet).length + "/" + a.cdp.results.length).padEnd(8)} | ${"—".padEnd(12)} |`,
    );
    console.log(
      `| ${a.engine.padEnd(12)} | SearXNG | ${String(a.searxng.results.length).padEnd(7)} | ${String(a.searxng.elapsed + "ms").padEnd(6)} | ${String(a.searxng.results.filter((r) => r.snippet).length + "/" + a.searxng.results.length).padEnd(8)} | ${a.searxng.unresponsive.map((e) => e[0]).join(",") || "none".padEnd(12)} |`,
    );
  }

  // ── Sample results ──
  console.log("\n" + "=".repeat(70));
  console.log("📝 FIRST 3 RESULTS PER ENGINE/METHOD");
  console.log("=".repeat(70));
  for (const a of all) {
    console.log(`\n─── ${a.engine} — CDP ───`);
    a.cdp.results.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title}`);
      console.log(`     snippet: ${r.snippet ? r.snippet.substring(0, 80) : "EMPTY"}`);
    });
    console.log(`─── ${a.engine} — SearXNG ───`);
    a.searxng.results.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title}`);
      console.log(`     snippet: ${r.snippet ? r.snippet.substring(0, 80) : "EMPTY"}`);
    });
  }

  // Save JSON
  const outDir = join(__dirname, "output");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "searxng-vs-cdp-comparison.json");
  writeFileSync(
    outPath,
    JSON.stringify({ query: QUERY, timestamp: new Date().toISOString(), results: all }, null, 2) +
      "\n",
  );
  console.log(`\n📁 Full JSON: ${outPath}`);
}

main().catch(console.error);
