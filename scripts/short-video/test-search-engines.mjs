#!/usr/bin/env node
/**
 * Search Engine Comparison v2 — fixed CDP eval parsing + longer waits
 */

import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
const envPath = join(__dirname, "..", "..", ".env.local");
try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^(\w+)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
    }
  }
} catch {}

const CDP_BASE = "http://localhost:3456";
const QUERY = "DeepSeek China AI";

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
  try { await fetch(`${CDP_BASE}/close?target=${tabId}`); } catch {}
}

async function waitForLoad(tabId, maxWait = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const resp = await cdpEvalRaw(tabId, "document.readyState");
      const val = resp?.result?.value || resp?.value || "";
      if (val === "complete" || val === "interactive") return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function evalAndParse(tabId, script) {
  // Wrap in IIFE and JSON.stringify for reliable transport
  const wrapped = `(function(){${script}})()`;
  const resp = await cdpEvalRaw(tabId, wrapped);
  // Try multiple response formats
  let val = resp?.result?.value;
  if (val === undefined) val = resp?.value;
  if (val === undefined) val = resp;
  
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [];
  }
  if (val && typeof val === "object" && Array.isArray(val)) return val;
  return [];
}

// ─── DuckDuckGo ───
async function testDuckDuckGo(query) {
  console.log("\n🦆 DuckDuckGo (HTML)...");
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const t0 = Date.now();
  
  const tabId = await cdpNewTab(url);
  await new Promise(r => setTimeout(r, 3000));
  await waitForLoad(tabId);
  
  // First check if we hit anomaly/CAPTCHA
  const anomalyCheck = await cdpEvalRaw(tabId, 
    `document.querySelector('.anomaly-modal') ? 'CAPTCHA' : document.querySelectorAll('.result').length + ' results'`
  );
  const status = anomalyCheck?.result?.value || anomalyCheck?.value || "unknown";
  console.log(`  Status: ${status}`);
  
  // Try extracting results
  const results = await evalAndParse(tabId, `
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
    return results.slice(0, 20);
  `);
  
  await cdpCloseTab(tabId);
  console.log(`  ⏱  ${Date.now()-t0}ms | 📊 ${results.length} results`);
  return { engine: "DuckDuckGo (HTML)", elapsedMs: Date.now()-t0, resultCount: results.length, results, status };
}

// ─── Brave Search API (curl fallback for FlClash TUN bug) ───
import { execSync } from "child_process";

async function testBraveSearch(query) {
  console.log("\n🦁 Brave Search API...");
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  console.log(`  API key: ${apiKey ? apiKey.substring(0,8) + "..." : "NOT FOUND"}`);
  if (!apiKey) return { engine: "Brave Search API", error: "No API key", resultCount: 0, results: [] };
  
  const apiUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20`;
  const t0 = Date.now();
  
  // Node.js fetch fails due to FlClash TUN fake-ip routing bug.
  // Use curl with --resolve to bypass DNS resolution (fake-ip 198.18.x.x).
  // Pre-resolve via nslookup to get the fake-ip, then pass to curl --resolve.
  try {
    // Get fake-ip from FlClash DNS
    const nslookupOut = execSync(`nslookup api.search.brave.com 2>/dev/null`, { timeout: 5000, encoding: "utf8" });
    const ipMatch = nslookupOut.match(/Address:\s*(\d+\.\d+\.\d+\.\d+)/g);
    if (!ipMatch || ipMatch.length < 2) throw new Error("DNS resolution failed");
    const fakeIp = ipMatch[1].replace("Address: ", "").trim();
    console.log(`  Resolved fake-ip: ${fakeIp}`);
    
    const curlCmd = `curl -s --connect-timeout 15 --resolve "api.search.brave.com:443:${fakeIp}" "${apiUrl}" -H "Accept: application/json" -H "X-Subscription-Token: ${apiKey}"`;
    const raw = execSync(curlCmd, { timeout: 20000, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    const data = JSON.parse(raw);
    const results = (data.web?.results || []).map(r => ({
      title: r.title || "", url: r.url || "", snippet: r.description ? r.description.substring(0,200) : ""
    }));
    console.log(`  ⏱  ${Date.now()-t0}ms | 📊 ${results.length} results`);
    return { engine: "Brave Search API", elapsedMs: Date.now()-t0, resultCount: results.length, results };
  } catch(e) {
    console.log(`  ❌ ${e.message}`);
    // Fallback: try plain fetch (might work if FlClash config changes)
    try {
      const resp = await fetch(apiUrl, {
        headers: { "Accept": "application/json", "X-Subscription-Token": apiKey },
        signal: AbortSignal.timeout(10000),
      });
      console.log(`  Fallback fetch HTTP ${resp.status}`);
      const data = await resp.json();
      const results = (data.web?.results || []).map(r => ({
        title: r.title || "", url: r.url || "", snippet: r.description ? r.description.substring(0,200) : ""
      }));
      console.log(`  ⏱  ${Date.now()-t0}ms | 📊 ${results.length} results`);
      return { engine: "Brave Search API", elapsedMs: Date.now()-t0, resultCount: results.length, results };
    } catch(e2) {
      return { engine: "Brave Search API", error: `${e.message}; fallback also failed: ${e2.message}`, resultCount: 0, results: [], elapsedMs: Date.now()-t0 };
    }
  }
}

// ─── Google (CDP) ───
async function testGoogle(query) {
  console.log("\n🔍 Google (CDP)...");
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const t0 = Date.now();
  
  const tabId = await cdpNewTab(url);
  await new Promise(r => setTimeout(r, 5000));
  await waitForLoad(tabId);
  
  // Debug: check what we have
  const debug = await cdpEvalRaw(tabId, 
    `'links:' + document.querySelectorAll('a').length + ' divs:' + document.querySelectorAll('div').length`
  );
  const dbg = debug?.result?.value || debug?.value || "";
  console.log(`  Debug: ${dbg}`);
  
  // Google 2026 DOM: h3-based extraction with snippet from parent siblings
  const results = await evalAndParse(tabId, `
    var results = [];
    document.querySelectorAll('h3').forEach(function(h3) {
      // Skip non-result h3s (e.g., "People also ask")
      if (h3.closest('[id*="ask"], [jsname*="ask"]')) return;
      
      // Find the link — h3 is inside an <a> or next to one
      var link = h3.closest('a') || h3.parentElement.querySelector('a');
      if (!link || !link.href || link.href.includes('google.com/search')) return;
      
      var titleText = h3.textContent.trim();
      if (titleText.length < 3) return;
      
      // Google 2026 snippet locations (from DOM analysis):
      // 1. .zz3gNc (inline results)
      // 2. .VwiC3b, .IsZvec (traditional results)
      // 3. .notranslate .ESMNde (site card results)
      // 4. Any sibling div with substantial text
      var container = h3.closest('div');
      var snippet = '';
      var snippetEl = container ? container.querySelector('.zz3gNc, .VwiC3b, .IsZvec, .yDYNvb, .MUxGbd, [data-sncf]') : null;
      if (!snippetEl && container) {
        // Fallback: search siblings/parent for text blocks
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
      if (snippetEl) snippet = snippetEl.textContent.trim().substring(0, 200);
      
      results.push({ title: titleText, url: link.href, snippet: snippet });
    });
    return results.slice(0, 20);
  `);
  
  await cdpCloseTab(tabId);
  console.log(`  ⏱  ${Date.now()-t0}ms | 📊 ${results.length} results`);
  return { engine: "Google (CDP)", elapsedMs: Date.now()-t0, resultCount: results.length, results };
}

// ─── Bing Web Search (CDP) ───
async function testBing(query) {
  console.log("\n🅱️ Bing Search (CDP)...");
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const t0 = Date.now();
  
  const tabId = await cdpNewTab(url);
  await new Promise(r => setTimeout(r, 5000));
  await waitForLoad(tabId);
  
  const results = await evalAndParse(tabId, `
    var results = [];
    // Bing Web Search results: .b_algo is the main result container
    document.querySelectorAll('.b_algo').forEach(function(el) {
      var link = el.querySelector('h2 a, a[href]');
      var title = el.querySelector('h2, h3');
      // Bing snippet: .b_caption p, [class*="abstract"], .b_lineclamp*
      var snippet = el.querySelector('.b_caption p, .b_lineclamp1, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4');
      if (link && title) {
        results.push({ title: title.textContent.trim(), url: link.href, snippet: snippet ? snippet.textContent.trim().substring(0,200) : '' });
      } else if (link) {
        results.push({ title: link.textContent.trim(), url: link.href, snippet: snippet ? snippet.textContent.trim().substring(0,200) : '' });
      }
    });
    // Fallback: any h2 with link
    if (results.length === 0) {
      document.querySelectorAll('h2 a, h3 a').forEach(function(a) {
        if (a.href && a.textContent.trim().length > 5) {
          results.push({ title: a.textContent.trim(), url: a.href, snippet: '' });
        }
      });
    }
    return results.slice(0, 20);
  `);
  
  await cdpCloseTab(tabId);
  console.log(`  ⏱  ${Date.now()-t0}ms | 📊 ${results.length} results`);
  return { engine: "Bing Search (CDP)", elapsedMs: Date.now()-t0, resultCount: results.length, results };
}

// ─── Baidu (CDP) ───
async function testBaidu(query) {
  console.log("\n🇨🇳 Baidu (CDP)...");
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query + " AI")}`;
  const t0 = Date.now();
  
  const tabId = await cdpNewTab(url);
  await new Promise(r => setTimeout(r, 5000));
  await waitForLoad(tabId);
  
  const results = await evalAndParse(tabId, `
    var results = [];
    document.querySelectorAll('.result, .c-container, .new-pmd').forEach(function(el) {
      var link = el.querySelector('a[href]');
      var title = el.querySelector('h3, .t, .c-title');
      var snippet = el.querySelector('.c-abstract, [class*="abstract"]');
      if (link && title) {
        results.push({ title: title.textContent.trim(), url: link.href, snippet: snippet ? snippet.textContent.trim().substring(0,200) : '' });
      }
    });
    // Fallback
    if (results.length === 0) {
      document.querySelectorAll('h3 a').forEach(function(a) {
        if (a.href && a.textContent.trim().length > 5) {
          results.push({ title: a.textContent.trim(), url: a.href, snippet: '' });
        }
      });
    }
    return results.slice(0, 20);
  `);
  
  await cdpCloseTab(tabId);
  console.log(`  ⏱  ${Date.now()-t0}ms | 📊 ${results.length} results`);
  return { engine: "Baidu (CDP)", elapsedMs: Date.now()-t0, resultCount: results.length, results };
}

// ─── Main ───
async function main() {
  console.log("=".repeat(60));
  console.log(`🔬 Search Engine Comparison v2`);
  console.log(`   Query: "${QUERY}"`);
  console.log("=".repeat(60));

  const all = [];
  
  // 1. Brave API (no CDP needed, test first)
  all.push(await testBraveSearch(QUERY));
  
  // 2-5. CDP tests with 3s gap between each
  await new Promise(r => setTimeout(r, 3000));
  all.push(await testDuckDuckGo(QUERY));
  
  await new Promise(r => setTimeout(r, 3000));
  all.push(await testGoogle(QUERY));
  
  await new Promise(r => setTimeout(r, 3000));
  all.push(await testBing(QUERY));
  
  await new Promise(r => setTimeout(r, 3000));
  all.push(await testBaidu(QUERY));

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 COMPARISON TABLE");
  console.log("=".repeat(60));
  console.log(`| Engine | Results | Time | Status |`);
  console.log(`|--------|---------|------|--------|`);
  for (const r of all) {
    const status = r.error || r.status || (r.resultCount > 0 ? "✅" : "❌ 0 results");
    console.log(`| ${r.engine} | ${r.resultCount} | ${r.elapsedMs || "?"}ms | ${status} |`);
  }

  // Sample results
  console.log("\n" + "=".repeat(60));
  console.log("📝 FIRST 5 RESULTS PER ENGINE");
  console.log("=".repeat(60));
  for (const r of all) {
    console.log(`\n─── ${r.engine} ───`);
    if (r.error) { console.log(`  Error: ${r.error}`); continue; }
    (r.results || []).slice(0, 5).forEach((item, i) => {
      console.log(`  ${i+1}. ${item.title}`);
      console.log(`     ${item.url}`);
      if (item.snippet) console.log(`     ${item.snippet.substring(0,100)}...`);
    });
  }

  // Save JSON
  const outDir = join(__dirname, "output");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "search-engine-comparison.json");
  writeFileSync(outPath, JSON.stringify({ query: QUERY, timestamp: new Date().toISOString(), results: all }, null, 2) + "\n");
  console.log(`\n📁 Full JSON: ${outPath}`);
}

main().catch(console.error);
