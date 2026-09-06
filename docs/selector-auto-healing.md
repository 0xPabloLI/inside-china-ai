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

## 已知修复台账

| 日期 | 源 | 失效原因 | 修复要点 | 验证 |
| --- | --- | --- | --- | --- |
| （待首次实战——baidu_news 对「AI大模型」抽 0 条，疑似 DOM 变更，见 #140 P1 交付评论） | | | | |
