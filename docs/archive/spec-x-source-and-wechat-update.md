# Spec: X.com 搜索源 + cdpFallback 架构 + 微信配置更新

> 创建于 2026-08-04。
> 基于 Grill 阶段（Q1-Q10）的决策共识。

---

## 1. 目标

1. **新增 X.com 搜索源**：加入 `SELF_MEDIA_SOURCES`，通过 CDP 抓取 `x.com/search` 提取推文，Google `site:x.com` 作为 CDP fallback
2. **新增 `cdpFallback` 字段**：在 source 定义中支持 CDP 级别的 fallback 链（CDP主 → CDPFallback → MCPFallback）
3. **更新微信相关配置**：更新 `WECHAT_API_CONFIG` 注释（标注 API 实测状态），改善搜狗微信验证码提示信息

## 2. 架构设计

### 2.1 cdpFallback 字段

在 source 定义中新增可选字段 `cdpFallback`：

```javascript
{
  name: "x_search",
  label: "X (Twitter)",
  needsAuth: true,
  url: (keyword) => `https://x.com/search?q=${encodeURIComponent(keyword)}&f=live`,
  extractScript: `...`,
  loginCheckScript: `...`,
  cdpFallback: {
    url: (keyword) => `https://www.google.com/search?q=${encodeURIComponent('site:x.com ' + keyword)}`,
    extractScript: `...`,
  },
}
```

### 2.2 discover-trends.mjs fallback 执行链

```
collectFromSource(source, keyword):
  Step 1: CDP 主方案 → collectFromCdp(source, keyword)
  Step 2: 如果 Step 1 返回空 && source.cdpFallback 存在 → collectFromCdp(cdpFallback, keyword)
  Step 3: 如果 Step 2 返回空 && source.mcpFallback 存在 → collectFromMcp(source, keyword)
  Step 4: cleanTitle（如需要）→ 返回
```

### 2.3 X.com 搜索源数据提取

从 `[data-testid="tweet"]` 元素提取：

- `title`：推文全文前 150 字符（截断 + "..."）
- `url`：推文链接（从 `time` 元素的父级 `a` 标签）
- `author`：用户名（`a[href] [dir]`）
- `publishedAt`：时间戳（`time[datetime]`）

## 3. 详细设计

### 3.1 X.com 搜索源（新增到 SELF_MEDIA_SOURCES）

```javascript
{
  name: "x_search",
  label: "X (Twitter)",
  needsAuth: true,
  useCleanTitle: false,
  url: (keyword) => `https://x.com/search?q=${encodeURIComponent(keyword)}&f=live`,
  loginCheckScript: `
    var body = document.body ? document.body.innerText : '';
    var url = window.location.href;
    (url.includes('/login') || url.includes('/i/flow/login') ||
     (body.includes('Sign in') && body.length < 500)) ? 'need_login' : 'ok'
  `,
  extractScript: `
    var tweets = document.querySelectorAll('[data-testid="tweet"]');
    var results = [];
    tweets.forEach(function(t) {
      var textEl = t.querySelector('[data-testid="tweetText"]');
      var timeEl = t.querySelector('time');
      var link = timeEl ? timeEl.closest('a') : null;
      var userEl = t.querySelector('a[href] [dir]');
      if (textEl) {
        var text = textEl.textContent.trim();
        results.push({
          title: text.substring(0, 150) + (text.length > 150 ? '...' : ''),
          url: link ? link.href : '',
          author: userEl ? userEl.textContent.trim() : '',
          publishedAt: timeEl ? timeEl.getAttribute('datetime') : ''
        });
      }
    });
    return results;
  `,
  cdpFallback: {
    url: (keyword) => `https://www.google.com/search?q=${encodeURIComponent('site:x.com ' + keyword)}`,
    extractScript: `
      var results = [];
      document.querySelectorAll('div.g, .Gx5Zad, .fP1Qef').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h3, .LC20lb');
        if (link && title) {
          var url = link.href;
          if (url.includes('x.com') || url.includes('twitter.com')) {
            results.push({ title: title.textContent.trim(), url: url });
          }
        }
      });
      return results;
    `,
  },
}
```

### 3.2 discover-trends.mjs collectFromSource 更新

在 Step 1（CDP 主方案）和 Step 3（MCP fallback）之间插入 Step 2（CDP fallback）：

```javascript
async function collectFromSource(source, keyword) {
  // Step 1: Try CDP (primary)
  let articles = await collectFromCdp(source, keyword);

  // Step 2: If CDP failed and CDP fallback is configured, try it
  if (articles.length === 0 && source.cdpFallback) {
    console.log(`  📡 Trying CDP fallback for ${source.label}...`);
    const fallbackSource = {
      ...source,
      name: source.name + "_fallback",
      label: source.label + " (fallback)",
      url: source.cdpFallback.url,
      extractScript: source.cdpFallback.extractScript,
      loginCheckScript: null,
      needsAuth: false,
    };
    articles = await collectFromCdp(fallbackSource, keyword);
  }

  // Step 3: If still failed and MCP fallback is configured, try MCP
  if (articles.length === 0 && source.mcpFallback) {
    const mcpArticles = await collectFromMcp(source, keyword);
    articles = mcpArticles;
  }

  // Step 4: Clean titles if needed (unchanged)
  if (source.useCleanTitle) {
    articles = articles.map((a) => ({ ...a, title: cleanTitle(a.title || "") }));
    articles = articles.filter((a) => a.title.length > 0);
  }

  // Add source name (unchanged)
  for (const a of articles) {
    a.source = source.name;
  }

  return articles;
}
```

### 3.3 WECHAT_API_CONFIG 注释更新

```javascript
export const WECHAT_API_CONFIG = {
  enabled: false,
  searchApi: "https://mp.weixin.qq.com/cgi-bin/searchbiz",
  articleApi: "https://mp.weixin.qq.com/cgi-bin/appmsgpublish",
  // env vars: WX_COOKIE, WX_TOKEN
  // Flow: search account name → get fakeid
  //
  // Verified 2026-08-04:
  //   searchbiz (search account) — ✅ works, returns fakeid + nickname
  //   appmsgpublish?sub=list — ✅ works, but ONLY for own account's publish history
  //   appmsg?action=list_ex&fakeid=xxx — ❌ DISABLED by WeChat (returns "invalid args")
  //   Conclusion: cannot fetch other accounts' article lists via platform API.
  //   Use WECHAT_ACCOUNT_SOURCES (Google search for republished articles) instead.
};
```

### 3.4 搜狗微信验证码提示改进

`discover-trends.mjs` 中 `collectFromCdp` 函数的 captcha 分支：

```javascript
// 之前:
console.warn(`  ⚠️  ${source.label} triggered captcha — CDP failed`);
// 之后:
console.warn(`  ⚠️  ${source.label} 触发验证码，请在 Chrome 中手动通过验证码后重试`);
```

## 4. Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件                                                   | 修改内容                                                             | 风险等级   | 评估                                                                                                                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/short-video/lib/trend-sources.mjs`            | 新增 `x_search` 源到 SELF_MEDIA_SOURCES；更新 WECHAT_API_CONFIG 注释 | **Low**    | 纯追加新源 + 注释更新，不修改现有源定义。下游 ALL_SOURCES 自动包含新源。验证：现有源测试不受影响                                                                                           |
| `scripts/short-video/discover-trends.mjs`              | collectFromSource 新增 Step 2 (cdpFallback)；更新 captcha 提示信息   | **Medium** | 修改核心趋势发现脚本的 fallback 逻辑。新增逻辑仅在 `articles.length === 0 && source.cdpFallback` 时触发，不影响现有源（现有源无 cdpFallback 字段）。验证：运行脚本确认现有 11 源仍正常工作 |
| `scripts/short-video/__tests__/trend-sources.test.mjs` | 更新数量断言（6→7, 11→12）；新增 X.com 源测试；新增 cdpFallback 测试 | **Low**    | 纯追加测试 + 更新数量常量                                                                                                                                                                  |

### Section 2: Behavioral Scenarios

| #   | Scenario                      | Expected Behavior                                       | Risk | Mitigation                                            |
| --- | ----------------------------- | ------------------------------------------------------- | ---- | ----------------------------------------------------- |
| S1  | X.com 已登录，搜索正常        | 提取推文列表，title 为前 150 字符                       | 低   | 实测验证可用                                          |
| S2  | X.com 未登录（登录态过期）    | loginCheckScript 检测 → warn + skip                     | 低   | URL 包含 /login 或页面含 "Sign in" 且内容 <500 字符   |
| S3  | X.com 搜索返回 0 条推文       | 走 cdpFallback → Google site:x.com 搜索                 | 低   | cdpFallback 提取 Google 结果中 x.com/twitter.com 链接 |
| S4  | X.com 页面 JS 渲染慢          | 等待 3s 后提取，空则 retry 3s                           | 低   | 复用现有 PAGE_LOAD_WAIT_MS + retry 逻辑               |
| S5  | cdpFallback 也返回空          | 走 mcpFallback（如有），否则返回空                      | 低   | 现有 fallback 链逻辑不变                              |
| S6  | Google fallback 页面结构变化  | extractScript 返回空 → 该源 0 结果                      | 低   | 返回空不影响其他源                                    |
| S7  | 现有源（无 cdpFallback 字段） | 不触发 Step 2，行为不变                                 | 低   | `source.cdpFallback` 为 undefined → 跳过              |
| S8  | 搜狗微信触发验证码            | 输出中文提示"请在 Chrome 中手动通过验证码后重试" + skip | 低   | 仅改提示信息，行为不变                                |
| S9  | X.com 推文文本 >150 字符      | title 截断为 150 字符 + "..."                           | 低   | extractScript 中 substring 处理                       |
| S10 | X.com 推文无 time 元素        | url 为空字符串                                          | 低   | link 为 null 时 url = ''                              |
| S11 | X.com 推文无 tweetText        | 该推文被跳过                                            | 低   | if (textEl) 判断                                      |
| S12 | 12 个源全部失败               | 输出空 JSON（totalTopics: 0）+ warn                     | 低   | 已有 < 5 topics warn 逻辑                             |
| S13 | 新源数据与现有源重叠          | deduplicateTopics 正确合并                              | 低   | 已有 Jaccard + containment 去重                       |

## 5. 非目标 (Non-Goals)

- 不加微信文章全文提取功能（属于内容管线下游 web-access skill 职责）
- 不修改 WECHAT_ACCOUNT_SOURCES 的 Google 搜索转载方案
- 不修改 `trending-topics.json` 输出格式
- 不修改下游消费者（agent 选题逻辑不变）
- 不实现 Nitter 搜索（实测搜索功能失效）
- 不修改现有源的 url/extractScript/loginCheckScript

## 6. 测试策略

### 6.1 Source 定义测试（trend-sources.test.mjs）

- SELF_MEDIA_SOURCES 数量 6→7
- ALL_SOURCES 数量 11→12
- x_search 源存在且结构完整（name, label, needsAuth, url, extractScript, loginCheckScript）
- x_search 的 cdpFallback 结构完整（url 函数, extractScript 字符串）
- x_search url("DeepSeek") 包含 x.com/search
- x_search loginCheckScript 包含 "login" 检测
- x_search extractScript 包含 `data-testid="tweet"`
- x_search cdpFallback.url("DeepSeek") 包含 google.com 和 site:x.com
- x_search cdpFallback.extractScript 包含 "return results"
- WECHAT_API_CONFIG 注释包含实测状态

### 6.2 不做单元测试的部分

- `discover-trends.mjs` 的 cdpFallback 执行逻辑（依赖 CDP proxy 运行时）
- 实际的 X.com / Google 页面提取（依赖真实浏览器 + 网络）
