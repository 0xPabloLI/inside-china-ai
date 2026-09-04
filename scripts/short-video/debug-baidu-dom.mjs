#!/usr/bin/env node
/**
 * Debug Baidu DOM structure - find actual search results
 */

const CDP_BASE = "http://localhost:3456";

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
  // Script must end with return JSON.stringify(data)
  const resp = await cdpEvalRaw(tabId, script);
  const val = resp?.result?.value || resp?.value || "[]";
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

async function main() {
  const query = "DeepSeek China AI";
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;

  console.log("Opening Baidu:", url);
  const tabId = await cdpNewTab(url);
  await new Promise((r) => setTimeout(r, 5000));
  await waitForLoad(tabId);

  const results = await cdpEvalJSON(
    tabId,
    `
    var data = [];
    
    // Find ALL h3 elements in the page
    var h3s = document.querySelectorAll('h3');
    data.push({ type: 'meta', h3_count: h3s.length });
    
    // Look at h3 parent structures
    h3s.forEach(function(h3, i) {
      if (i < 5) {
        var link = h3.querySelector('a') || (h3.tagName === 'A' ? h3 : null);
        var href = link ? link.href : '';
        var title = h3.textContent.trim().substring(0, 100);
        
        // Walk up to find result container
        var container = h3.parentElement;
        for (var k = 0; k < 3 && container; k++) {
          var snippet = container.querySelector('.c-abstract, [class*="abstract"], [class*="content"], [class*="text"], [class*="desc"]');
          if (!snippet) {
            // Try broader: look for large text blocks
            var spans = container.querySelectorAll('span, div, p');
            for (var s = 0; s < spans.length; s++) {
              var t = spans[s].textContent.trim();
              if (t.length > 30 && t.length < 500) {
                snippet = spans[s];
                break;
              }
            }
          }
          if (snippet && snippet.textContent.trim().length > 20) {
            data.push({
              index: i, title: title, href: href,
              snippet: snippet.textContent.trim().substring(0, 200),
              snippetClass: snippet.className || '',
              snippetTag: snippet.tagName,
              containerClass: container.className.substring(0, 80)
            });
            return;
          }
          container = container.parentElement;
        }
        
        data.push({
          index: i, title: title, href: href,
          snippet: '', snippetClass: 'NONE',
          parentClass: h3.parentElement.className.substring(0, 80)
        });
      }
    });
    
    // Dump elements with content-like classes
    var contentEls = document.querySelectorAll('[class*="content"], [class*="abstract"]');
    contentEls.forEach(function(el, i) {
      if (i < 5 && el.textContent.trim().length > 30) {
        data.push({
          type: 'content_el', index: i,
          tag: el.tagName,
          className: (el.className || '').substring(0, 80),
          text: el.textContent.trim().substring(0, 150)
        });
      }
    });
    
    return JSON.stringify(data);
  `,
  );

  console.log("\n=== Baidu DOM Debug Results ===");
  console.log(JSON.stringify(results, null, 2));

  await cdpCloseTab(tabId);
}

main().catch(console.error);
