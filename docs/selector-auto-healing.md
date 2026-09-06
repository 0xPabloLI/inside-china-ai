# Selector Auto-Healing Runbook (#140 P5)

> 触发：`node scripts/short-video/selector-health.mjs` 报某 CDP 源 `zero_results`（或 #200 sourceHealth 连续零结果 streak ≥3）。
> 本文档是修复 agent 的执行手册——修复是 agent 驱动的，脚本只负责发现。

## 循环

```
selector-health.mjs（发现）→ 本 runbook（修复）→ selector-health.mjs --only <源>（验证）
```

## 修复步骤（对每个 failing 源）

1. **确认是 DOM 变更，不是内容真空**：换一个常见关键词（如「人工智能」）再跑一次该源。多关键词仍 0 条才继续；单关键词 0 条可能是当天没新闻。
2. **打开真实页面检查 DOM**：
   ```bash
   node --input-type=module -e "
   const { cdpNewTab, cdpCloseTab, cdpEval } = await import('<repo>/scripts/short-video/lib/cdp-client.mjs');
   const t = await cdpNewTab('<该源 url(关键词)>');
   const html = await cdpEval(t, 'document.body.innerHTML.slice(0, 30000)');
   console.log(html?.result?.value ?? html?.value);
   await cdpCloseTab(t);"
   ```
   也可以把 HTML 存文件后离线分析。注意先过 `detectAntiBot`——拦截页上的"DOM"没有分析价值。
3. **从真实 DOM 推导新选择器**：找结果条目的稳定容器（class/id/结构关系），优先组合选择器而不是单一 class；旧脚本的选择器做交叉比对，确认旧失效原因（class 改名 / 结构层级变化 / 懒加载）。
4. **离线验证新脚本**：把新 articleScript 包在 `document.querySelectorAll(...)` 骨架里，对着第 2 步存的 HTML 用 `node --input-type=module -e` + JSDOM？——没有 JSDOM 依赖，直接回真实页测：
   ```bash
   node --input-type=module -e "
   const { cdpNewTab, cdpCloseTab, extractFromTab } = await import('.../cdp-client.mjs');
   const t = await cdpNewTab('<url>');
   const r = await extractFromTab(t, '<新脚本>');
   console.log(r.length, JSON.stringify(r.slice(0, 2)));
   await cdpCloseTab(t);"
   ```
   验收：≥3 条、每条有 title + url、抽样 URL 真实可访问。
5. **回归守卫**：跑 `selector-health.mjs --only <源>` 转绿；再跑同域相邻源（如 bing_news）确认没有顺手改坏。
6. **落库**：修 `lib/source-registry.mjs` 对应条目的 `articleScript`（pathspec 提交，`Session-Id` trailer）；issue #140 留一行修复记录（源名 / 旧失效原因 / 新选择器要点 / 验证计数）。

## 边界

- 只改 `articleScript` / `loginCheckScript` / `imageScript` 的选择器；不改 url、不改 fallback 链、不改 anti-bot 阈值。
- needsAuth 源（xhs、douyin）若失败原因是 `need_login`，那是登录态过期——提示用户人工登录，不是选择器问题，**不要**改脚本。
- `anti_bot` 失败不修选择器——那是风控，归 #140 P1/P2 机制处理。
- 一轮只修实测坏掉的源；"顺手优化"健康源的选择器是被禁止的（每个 healthy 源都是活体证据，别动它）。

## Chrome 安全规程（profile 守卫）

- **绝对禁止**：`pkill -9 Chrome` / `killall Chrome`（unclean kill 可损坏 profile 的 LevelDB——锁文件与 session 数据）；`rm`/移动 `~/Library/Application Support/Google/Chrome/` 下任何内容；任何 "Reset/Cleanup" 类操作。杀进程不等于删 profile，但 unclean kill 是 profile 损坏的最常见来源。
- **CDP 代理僵死的恢复阶梯**：① 只重启代理（`skills/web-access/scripts/cdp-proxy.mjs`，仓库自有工具，与 Chrome 零接触）；② 代理重启后仍 WS 连接失败而 `curl localhost:9222/json/version` 正常 → Chrome DevTools 层卡死，**由用户**优雅退出 Chrome（⌘Q 或 `osascript -e 'quit app "Google Chrome"'`）再带 `--remote-debugging-port=9222` 重启——优雅退出不触碰 profile 数据。Agent 不得代替用户杀/退 Chrome。
- 长跑注意：一次体检 ≈30 次导航，连续多轮压测会让 DevTools WS 层进入僵死——多轮之间留冷却，或分批 `--only` 跑。

## 已知修复台账

| 日期 | 源 | 失效原因 | 修复要点 | 验证 |
| --- | --- | --- | --- | --- |
| 2026-09-07 | google_search | Google 新新闻垂直 SERP：结果块改 `div[data-ved][data-hveid]`，标题改 `div[role="heading"]`，`div.g`/`h3` 消失 | articleScript/imageScript 重写为新结构；缩略图为 base64 data URI，仅 http 图标记 type=image（可下载），data URI 降级 text；外链过滤 google 域 + URL 去重 | health --only 1/1 绿，10 条全结构（title/url/imageUrl） |
| 2026-09-07（待修） | baidu_news | 资讯垂直连热词都「找到相关资讯 0 个」——疑似百度资讯索引收缩（上游问题），非选择器 | 待定：先试资讯垂直其它端点；若上游确死 → 标注不可用或换端点 | — |
| 2026-09-07（待修） | weibo_hot / leiphone / xinzhiyuan / zhidx / wechat_dongchabeating | zero_results，未逐个诊断 | 按 runbook 步骤 2 起做 | — |

## CDP 代理 wsPath 陈旧坑（2026-09-07 修复）

`DevToolsActivePort` 文件缓存的浏览器级 WS 路径与 Chrome 活值脱节时，代理报「连接失败」而 `curl localhost:9222/json/version` 正常——其他 session 正常、本 session 不通的假象即来源于此。已修 `skills/web-access/scripts/cdp-proxy.mjs`：WS 握手失败自动回退 `/json/version` 活值重试。注意 `skills/` 与 agent-harness 仓手动同步，此修复需带过去。
