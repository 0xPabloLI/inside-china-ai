# Phase 1 Tickets — Tracer-Bullet Breakdown

> 基于 `docs/phase1-spec.md` 拆分。每个 ticket = 一个可独立验证的切片。

---

## Ticket 依赖图

```
P1-T1 (caption 纯函数 + 测试)
  ↓
P1-T2 (caption 脚本 + verify 集成)
  ↓
P1-T3 (trends 分类/去重纯函数 + 测试)
  ↓
P1-T4 (trends 脚本 + CDP 抓取)
```

两个 ISSUE 可并行开发（无交叉依赖），但 TDD 按 ticket 顺序执行更高效。

---

## P1-T1: Caption 推导纯函数 + 单元测试

**目标**：实现 caption 的 title/description/hashtag 推导逻辑为纯函数，TDD 先写测试。

**文件**：
- 新建 `scripts/short-video/lib/caption-utils.mjs`（纯函数模块）
- 新建 `scripts/short-video/__tests__/caption-utils.test.mjs`

**函数签名**：
```js
deriveTitle(scenes, metadata?)     // → string (≤60 chars)
deriveDescription(scenes, metadata?) // → string (≤2200 chars, includes hashtags)
deriveHashtags(scenes, metadata?)   // → string[] (3-5 items)
```

**测试用例**（来自 spec 场景矩阵 S1-S15）：
- S1: metadata 完整 → 直接用
- S2: 无 metadata → 自动推导
- S3: 部分 metadata → 混合
- S4: hashtags 不足 3 → 补位
- S5: hashtags 超 5 → 截断
- S6: title > 60 → 截断
- S7: description > 2200 → 截断
- S8: 无实体命中 → 默认 broad
- S14: title 缺 SEO 关键词 → 追加
- S15: 全短 voiceover → 仍能生成

**完成标志**：`npx vitest run scripts/short-video/__tests__/caption-utils.test.mjs` 全绿。

---

## P1-T2: Caption 脚本 + verify-video 集成

**目标**：编写 `generate-caption.mjs` 脚本，集成到 `verify-video.mjs`。

**文件**：
- 新建 `scripts/short-video/generate-caption.mjs`
- 修改 `scripts/short-video/verify-video.mjs`（末尾集成调用）

**依赖**：P1-T1

**任务**：
1. `generate-caption.mjs` 导入 caption-utils，读取 scene-data，生成两个输出文件
2. verify-video.mjs 在 `printSummary()` 后、all checks pass 时调用
3. 独立运行也支持：`node generate-caption.mjs`
4. 处理 output 目录创建（S11）、文件覆盖（S12）
5. scene-data.mjs 可选 metadata 支持

**测试用例**：
- S9: verify 有 FAIL → 不生成 caption
- S10: scene-data 语法错误 → verify 已 exit(1)，不执行
- S13: 独立运行 generate-caption.mjs → 正常生成

**完成标志**：
- `node generate-caption.mjs` 生成 `output/tiktok-caption.txt` + `output/tiktok-metadata.json`
- `node verify-video.mjs --tiktok` 通过后自动生成上述文件

---

## P1-T3: Trends 分类/去重纯函数 + 单元测试

**目标**：实现 trend discovery 的分类、去重、过滤逻辑为纯函数，TDD 先写测试。

**文件**：
- 新建 `scripts/short-video/lib/trends-utils.mjs`（纯函数模块）
- 新建 `scripts/short-video/__tests__/trends-utils.test.mjs`

**函数签名**：
```js
filterChinaAI(articles)    // → articles[] (只保留 China AI 相关)
classifyTopic(title)       // → "breaking" | "fermenting" | "data" | "explainer"
deduplicateTopics(articles) // → articles[] (相似度 >=0.8 合并，sources 合并)
buildOutputJson(grouped)   // → { scrapedAt, totalTopics, sourceStats, topics }
```

**测试用例**（来自 spec 场景矩阵 T1-T13）：
- T5: 无匹配 → 4 类全空
- T7: 中英文混合 → 正确分类
- T8: 3 源同一新闻 → 合并为 1 条
- T10: 无关键词命中 → 默认 fermenting
- T13: 特殊字符 → 正确处理

**完成标志**：`npx vitest run scripts/short-video/__tests__/trends-utils.test.mjs` 全绿。

---

## P1-T4: Trends 脚本 + CDP 抓取

**目标**：编写 `discover-trends.mjs`，用 Chrome CDP 抓取 5 个源站。

**文件**：
- 新建 `scripts/short-video/discover-trends.mjs`

**依赖**：P1-T3

**任务**：
1. CDP proxy 检查（T2: 不可用 → 报错退出）
2. 5 源站抓取（每源：CDP new → 等待 → eval 提取 → close）
3. 源站不可访问跳过（T3: 跳过 + warn）
4. selector fallback（T4: DOM 不匹配 → 取所有 `a` 标签）
5. Bloomberg 付费墙处理（T9: CDP session）
6. JS 未渲染完等待（T11: 3s 重试 1 次）
7. 调用 trends-utils 过滤/分类/去重/输出

**测试用例**（集成测试，手动验证）：
- T1: 正常运行 → JSON ≥5 条
- T2: proxy 未启动 → 报错
- T3: 源不可访问 → 跳过
- T6: 文章 <5 → warn
- T9: Bloomberg 付费墙
- T11: JS 未渲染

**完成标志**：
- `node discover-trends.mjs` 生成 `output/trending-topics.json`
- JSON 含元数据 + 分类选题 ≥5 条（源站正常时）
