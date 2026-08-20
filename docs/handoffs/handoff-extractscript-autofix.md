# Handoff: extractScript 自动修复 + warn + health 追踪

> Created: 2026-08-20
> Parent discussion: `docs/research/pipeline-simplification-discussion.md` (Topic 3)
> Trigger: User wants auto-fallback when per-site extractScript returns 0 results, with warn + health tracking

## Context

管线代码 `collectFromCdp()` 用 per-site `extractScript` 提取搜索结果。测试发现部分源的 extractScript 有 bug（如小红书的 `[data-v-*]` 是无效 CSS 选择器），导致返回 0 结果。需要一个自动 fallback 机制：per-site 失效 → generic eval → /extract，并记录失效情况。

## Approved Design

```
collectFromCdp(source, keyword):
  1. 用 per-site extractScript 提取
  2. 如果结果为空（0 篇）→ 运行 generic eval 脚本
  3. 如果 generic eval 也为空 → 运行 /extract（最后兜底）
  4. 如果 per-site 失败但 generic 成功 → console.warn("⚠️ extractScript for {source.name} returned 0 results, generic fallback recovered {N} items. Selector may need updating.")
  5. 把失效信息写入 output/extract-script-health.json:
     { source: "xhs", lastFail: "2026-08-20", reason: "0 results from extractScript", recoveredBy: "generic eval", recoveredCount: 16 }
```

## Implementation Scope

### 改动文件
1. `scripts/short-video/search-sources.mjs`
   - `collectFromCdp()` — 新增 3 层 fallback（per-site → generic → /extract）+ warn + health 写入
   - 新增 `GENERIC_EXTRACT_SCRIPT` 常量（通用 CSS 选择器列表）
   - 新增 `writeHealthReport()` 函数（写入 `output/extract-script-health.json`）

2. 测试文件
   - `__tests__/search-sources-cdp-fallback.test.mjs` — 新建
   - 测试用例：
     - per-site 成功 → 不 fallback，不 warn
     - per-site 0 结果 → generic 成功 → warn + health 记录
     - per-site 0 结果 + generic 0 结果 → /extract 尝试
     - 全失败 → 空数组 + health 记录

### 不改动的文件
- `lib/cdp-client.mjs` — CDP 传输层不变
- `lib/source-registry.mjs` — per-site extractScript 不改（自动修复不是改选择器，而是 fallback）
- `lib/mcp-client.mjs` — 不涉及

## Generic Extract Script

```javascript
const GENERIC_EXTRACT_SCRIPT = `
  var results = [];
  var selectors = [
    'article', '.article-list__item', '.post-item', '.list-item',
    '.news-list .item', '.search-result .item', '.kr-flow-item',
    '.video-list-item', '.bili-video-card', '.note-item',
    '.arxiv-result', 'ytd-video-renderer', '.result',
    '.c-container', 'div.g', '.Gx5Zad'
  ];
  for (var i = 0; i < selectors.length; i++) {
    var items = document.querySelectorAll(selectors[i]);
    if (items.length > 0) {
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h2, h3, h4, .title, .article__title, #video-title, .LC20lb, .c-title');
        if (link) {
          var titleText = title ? title.textContent.trim() : link.textContent.trim();
          if (titleText && titleText.length > 5 && titleText.length < 300) {
            results.push({ title: titleText, url: link.href });
          }
        }
      });
      if (results.length > 0) break;
    }
  }
  if (results.length === 0) {
    document.querySelectorAll('a[href]').forEach(function(a) {
      var text = a.textContent.trim();
      if (text.length > 10 && text.length < 200) {
        results.push({ title: text, url: a.href });
      }
    });
  }
  return results.slice(0, 20);
`;
```

## Health Report Format

`output/extract-script-health.json`:
```json
{
  "lastUpdated": "2026-08-20T05:30:00.000Z",
  "sources": [
    {
      "source": "xhs",
      "label": "小红书",
      "lastFail": "2026-08-20",
      "failCount": 3,
      "reason": "0 results from extractScript",
      "recoveredBy": "generic eval",
      "recoveredCount": 16
    },
    {
      "source": "ithome",
      "label": "iThome",
      "lastFail": "2026-08-20",
      "failCount": 1,
      "reason": "HTTP 404",
      "recoveredBy": "none",
      "recoveredCount": 0
    }
  ]
}
```

## Suggested Skills

- `implement` skill — 标准 TDD 实施
- `tdd` skill — red → green → refactor

## Design Clarifications (2026-08-20 补充)

### per-site extractScript 不删除
per-site extractScript 返回**结构化数据**（`{title, url, imageUrl, snippet}`），精确匹配网站 DOM。Generic eval 和 /extract 返回的是**非结构化内容**（generic 返回 `{title, url}` 数组，/extract 返回整页 Markdown）。per-site 不删除，auto-fallback 使其从「必须维护」变为「有空再维护」——选择器失效时自动降级，不阻断管线。

### Generic eval vs /extract 的区别
- **Generic eval**：用 30+ 通用 CSS 选择器列表，找到第一个有结果的就 break，返回 `{title, url}` 结构化数组。适合**搜索结果页**。
- **/extract**：自动检测正文容器（`article`, `main` 等），转成整页 Markdown。适合**内容页**，对任何页面都能返回内容（>50 字符即算成功）。
- 测试中 96% vs 64% 的差异源于此：/extract 对任何页面都有输出，generic eval 依赖选择器匹配。

### `accessMethod.fallbacks` 字段现状
当前 `collectFromSource()` 的 fallback 链是**硬编码**的（apiSearch → CDP → cdpFallback → mcpFallback），不读 `accessMethod.fallbacks`。该字段目前是文档性的。实施时可考虑删除以简化，或让代码真正读它。

### TikTok Creator 和 mcp_grok_search 在测试中失败的原因
- **TikTok Creator**：primary method 是 `api`（ScrapeCreators API），测试跳过 API 直接测 CDP → 需 login → 失败。管线正常走 API 层，不需要 CDP login。Analytics 数据通过 `publish-tiktok.mjs` 的 TikTok Analytics API 拉取，与 source-registry 无关。
- **mcp_grok_search**：primary method 是 `mcp`，没有 URL（`url: () => ""`），没有 extractScript。测试对所有源都先 `cdpNewTab(url)`，但该源 URL 为空。管线代码 `collectFromSource` 正确处理：Step 1（API）跳过（无 apiSearch）→ Step 2（CDP）跳过（URL 空）→ Step 3（MCP fallback）执行。

## Key References

- 源函数：`scripts/short-video/search-sources.mjs` `collectFromCdp()` 第 145-212 行
- CDP API：`scripts/short-video/lib/cdp-client.mjs` `extractFromTab()` 第 98-122 行
- web-access /extract：`skills/web-access/scripts/cdp-proxy.mjs`（commit b073638，v2.5.4 upgrade + /extract merge）
- CDP 测试结果（临时脚本已删除，结论见上方 Design Clarifications）
