# Tickets: Trend Sources Expansion

> 基于 `docs/specs/spec-trend-sources-expansion.md` 拆分。每个 ticket = 一个可独立验证的切片。

---

## Ticket 依赖图

```
TE-T1 (cleanTitle 纯函数 + 关键词扩展 + 测试)
  ↓
TE-T2 (trend-sources.mjs: 6 个新 source collector 定义 + 测试)
  ↓
TE-T3 (discover-trends.mjs 重构: 可插拔 collector 架构)
  ↓
TE-T4 (集成测试 + 文档更新)
```

---

## TE-T1: cleanTitle 纯函数 + 关键词扩展

**目标**：在 `trends-utils.mjs` 中新增 `cleanTitle()` 函数和扩展关键词表，TDD 先写测试。

**文件**：

- 修改 `scripts/short-video/lib/trends-utils.mjs`
- 修改 `scripts/short-video/__tests__/trends-utils.test.mjs`

**任务**：

1. 新增 `cleanTitle(title)` 纯函数：
   - 移除 emoji（Unicode emoji 范围）
   - 移除 #hashtag# 格式（小红书风格）
   - 移除【】包裹的标记（B站风格）
   - 移除多余空格
   - 处理 null/undefined/空字符串 → 返回 ""
   - 截断 > 200 字符
2. 扩展 `CHINA_AI_KEYWORDS` 数组，新增自媒体常见表达
3. `cleanTitle` 导出

**测试用例**（覆盖场景矩阵 S8, S13）：

- emoji 标题 → 清理
- #hashtag# 标题 → 清理
- 【标记】标题 → 清理
- null/undefined → ""
- 空字符串 → ""
- 正常标题 → 不变
- 超长标题 → 截断到 200 字符
- 混合脏数据 → 清理后干净

**完成标志**：`npx vitest run scripts/short-video/__tests__/trends-utils.test.mjs` 全绿（现有 20 + 新增 8 = 28 用例）。

---

## TE-T2: trend-sources.mjs — 6 个新 source collector

**目标**：新建 `trend-sources.mjs`，定义 6 个新 source collector 的 extract script 和配置。

**文件**：

- 新建 `scripts/short-video/lib/trend-sources.mjs`
- 新建 `scripts/short-video/__tests__/trend-sources.test.mjs`

**依赖**：TE-T1（需要 `cleanTitle`）

**任务**：

1. 定义 source collector 对象格式：
   ```javascript
   {
     name: "xhs",
     label: "小红书",
     needsAuth: true,
     url: (keyword) => `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&type=1`,
     extractScript: `...`,  // CDP eval script
     loginCheckScript: `...`, // 检测是否需要登录
     cleanTitle: true,  // 是否调用 cleanTitle
   }
   ```
2. 实现 6 个 collector：
   - `xhs` — 小红书搜索
   - `sogou_weixin` — 搜狗微信搜索
   - `weibo_hot` — 微博热搜
   - `bilibili` — B站搜索
   - `douyin` — 抖音搜索
   - `tiktok_creator` — TikTok Creator Center 灵感区
3. 每个 collector 的 extract script 在 mock DOM 上测试

**测试用例**（覆盖场景矩阵 S1-S6, S11, S14）：

- 各 collector 的 url() 返回正确 URL
- 各 collector 的 extractScript 在 mock DOM 上返回正确数据
- 登录检测脚本正确识别登录页
- 验证码页面检测（搜狗）
- 空页面 → 返回空数组
- JS 渲染未完成 → 空数组（不报错）

**完成标志**：`npx vitest run scripts/short-video/__tests__/trend-sources.test.mjs` 全绿。

---

## TE-T3: discover-trends.mjs 重构 — 可插拔 collector 架构

**目标**：重构 `discover-trends.mjs`，将现有 5 源和新 6 源统一为可插拔 collector 模式。

**文件**：

- 修改 `scripts/short-video/discover-trends.mjs`
- 修改 `scripts/short-video/lib/trend-sources.mjs`（补充现有 5 源的 collector 定义）

**依赖**：TE-T2

**任务**：

1. 将现有 `SOURCES` 数组迁移到 `trend-sources.mjs`，转为 collector 格式
2. 提取 CDP helper 函数（cdpNewTab/cdpEval/cdpCloseTab/waitForPageLoad/extractFromTab）为公共模块
3. `discover-trends.mjs` 主循环改为：
   ```javascript
   for (const source of ALL_SOURCES) {
     try {
       const articles = await collectFromSource(source, cdpHelper);
       allArticles.push(...articles);
     } catch (e) {
       console.warn(`  ⚠️  ${source.label} failed: ${e.message}`);
     }
   }
   ```
4. 新增搜索关键词参数（默认 "AI 大模型" / "China AI"）
5. 登录检测：`needsAuth` 的源先检查登录状态，失败则 skip
6. `cleanTitle` 集成：collector 标记 `cleanTitle: true` 的源，提取后调用 `cleanTitle`

**测试用例**（覆盖场景矩阵 S7, S9, S10, S15）：

- 11 个源全部正常 → 输出合并结果
- 某源失败 → warn + 继续
- CDP 不可用 → exit(1)
- 全部源失败 → 输出空 JSON + warn
- 跨源去重正确（新源 + 现有源重叠）

**完成标志**：

- `node scripts/short-video/discover-trends.mjs` 正常运行
- 输出 `trending-topics.json` 格式不变
- `sourceStats` 包含 11 个源的统计

---

## TE-T4: 集成测试 + 文档更新

**目标**：端到端集成验证 + 更新文档。

**文件**：

- 修改 `docs/content-pipeline.md`（Stage 0 趋势发现部分）
- 修改 `docs/manual-ops.md`（趋势源列表）
- 修改 `docs/tiktok/tiktok-best-practices.md`（趋势发现渠道表）

**依赖**：TE-T3

**任务**：

1. 运行 `discover-trends.mjs` 验证 11 源正常工作
2. 检查输出 JSON 格式与之前兼容
3. 更新 `content-pipeline.md` 的趋势发现部分
4. 更新 `manual-ops.md` 的趋势源列表
5. 更新 `tiktok-best-practices.md` 的趋势发现渠道表
6. 运行全部测试套件确认无 regression

**完成标志**：

- `npx vitest run scripts/short-video/__tests__/` 全绿
- `npm run lint && npx tsc --noEmit` 通过
- 文档更新完成
