# Handoff: Hashtag 管线缺口修复（缺口 A 已完成，缺口 B 待做）

> 更新于 2026-08-26
> 原始 handoff 生成于 2026-08-26（caption 格式重构 + hashtag 库扩展 session）
> 缺口 A 完成于 2026-08-26，commit: d48c3f4 + 53085b6

## 当前状态

| 缺口 | 状态 | 完成内容 |
|------|------|---------|
| A: trendingHashtags 代码未实现 | ✅ 已完成 | 见下方「缺口 A 完成记录」 |
| B: Apify JS 客户端未创建 | ⏳ 待做 | 见下方「缺口 B 待做方案」 |

## 缺口 A 完成记录

> Commit: `d48c3f4` (代码) + `53085b6` (归档)
> Spec: `docs/archive/spec-hashtag-trending-fix.md`
> Tickets: `docs/archive/tickets-hashtag-trending-fix.md`
> Review: `docs/archive/reviews/hashtag-trending-fix-review-2026-08-26.md`

### 改动文件

1. `scripts/short-video/lib/caption-utils.mjs`
   - 新增 `normalizeHashtag(value)` 函数：trim + 去# + 小写 + 拒绝空值/空白/非字符串
   - 重写 `deriveHashtags()` 自动派生路径：优先级分层（core > brand > primary > secondary > pad > trending）
   - trending 标签消费：最多 1 个，满 5 时替换最低优先级 secondary vertical 或 pad，primary entity 不可替换
   - 人工覆盖（`metadata.hashtags`）锁定：不注入 trending
   - 从 `BLACKLISTED_HASHTAGS` 移除 `#creatorsearchinsights`（变为 `[]`）

2. `scripts/short-video/generate-caption.mjs`
   - `hashtagStrategy` 新增 `trending` 分类

3. `scripts/short-video/__tests__/caption-utils.test.mjs`
   - 新增 25 个测试（normalizeHashtag 8 个 + 黑名单移除 2 个 + trending 消费 15 个）
   - 总计 61/61 全绿

4. `docs/tiktok/tiktok-best-practices.md`
   - 更新黑名单说明：移除 `#creatorsearchinsights`
   - 更新 trending 消费机制说明

### 关键决策（Grill 确认）

1. **#creatorsearchinsights 从黑名单移除** — 深度调研结论：(1) 原黑名单基于 2 条视频样本，不足以单独归因 hashtag 效果（§3.3 自己承认）；(2) Buffer 2026 权威指南明确推荐使用；(3) TikTok 官方设计：该标签是元标签（告知 TikTok 内容来源于 Creator Search Insights），不是内容标签；(4) 不自动加入——Agent 在使用 Creator Search Insights 发现内容 gap 时手动通过 `metadata.hashtags` 加入
2. **大小写不影响 TikTok hashtag 权重** — 多来源验证：hashtags 完全大小写不敏感，统一小写安全
3. **优先级替换策略** — 而非原 handoff 的"补位后追加"方案。Review P0-1 指出原方案在满 5 时无法满足"替换垂直标签"的规则
4. **人工覆盖锁定** — `metadata.hashtags` 非空时不注入 trending（Review P0-2）
5. **trending 最多 1 个** — Review 建议的宁缺毋滥原则
6. **trendingHashtags 格式** — 纯字符串数组（如 `["#aiviral"]`），不含 views/posts 元数据

## 缺口 B 待做方案

> ⚠️ 下一 session 从这里开始
> Review 文档：`docs/reviews/handoff-hashtag-pipeline-gaps-review-2026-08-26.md`（仍在 `docs/reviews/` 下，未归档——因为它审阅的是原始 handoff 方案，不是本次修复的 review）

### 问题

`docs/refs/tiktok-skills/lib/apify_client.py` 是 Python 参考实现，管线的 JS 代码中没有 Apify 客户端。`APIFY_TOKEN` 已配好（`.env.local`），但无法被管线使用。

### Review 对原方案的修正（P1 级）

原 handoff 的 `fetchHashtagStats(hashtag) → views/posts/related` 不符合 Apify Actor 的实际能力。Review 建议拆分为：

| 方法 | 是否实现 | 输入/输出 | 数据来源 |
|------|---------|----------|---------|
| `runActor(actorRef, input, options)` | 是 | 原始 dataset items；认证+超时+错误校验 | 低层通用封装 |
| `fetchHashtagVideos(hashtag, options)` | 是 | 归一化视频样本数组 | `clockworks~tiktok-scraper` |
| `fetchHashtagMetrics(hashtags, options)` | 否，先 POC | 只承诺 POC 实测存在的字段 | 专用 Actor（需 POC 确认） |
| `fetchHashtagBatch(hashtags, options)` | POC 后 | 每条结果带 `actor`/`fetchedAt`/`sourceSchemaVersion`/`error` | 需确认 Actor 是否支持批量 |

### Review 对 API 契约的修正

1. **端点**：`POST /v2/actors/:actorId/run-sync-get-dataset-items`（不是 `acts/{actorId}/run-sync-get-items`）
2. **Actor ID**：用 `owner~actor-name` 格式（如 `clockworks~tiktok-scraper`），不是 `owner/actor-name`；用 `encodeURIComponent()`
3. **认证**：`Authorization: Bearer <token>`（header），不用 query token
4. **超时**：同步端点 300s 超时返回 408，需配置 ≤300s 超时 + 处理 408/429/5xx
5. **成本护栏**：`maxTotalChargeUsd` 参数；默认 dry run/mock，远端请求需显式开启

### Review 对入口和落盘的修正

1. **入口**：`node scripts/short-video/research-hashtags.mjs --tags deepseek,qwen`（独立脚本，不在视频管线中）
2. **env 加载**：需显式读取 `.env.local` 中的 `APIFY_TOKEN`（`generate-caption.mjs` 当前不加载 `.env.local`）
3. **落盘**：结果写入调研工件（如 `output/hashtag-research/<date>.json`），不直接改写 `ENTITY_HASHTAG_MAP`；人工确认后才进入代码更新
4. **最低记录字段**：`hashtag`、`actor`、`actorBuild`、`fetchedAt`、`input`、`rawItemCount`、`normalizedResult`、`error`、`costCapUsd`

### Review 建议的实施顺序

| 阶段 | 产物 | 完成标准 |
|------|------|---------|
| 1. B 的 schema POC | 单独、可限额的脚本和匿名化样例响应 | 明确哪个 Actor 的哪个字段可用于 metrics；记录费用与失败模式 |
| 2. 决定 B API | 小型技术规格 | 只暴露 POC 证明的字段；定义运行入口、缓存、错误、工件与费用策略 |
| 3. TDD 实现 B | 新客户端、mock 测试与可选 opt-in smoke test | 不影响逐视频管线；CI 不依赖 token 且不产生外部费用 |

### Review 的 B 验收测试

| 用例 | 期望结果 |
|------|---------|
| 缺少 token | 抛出明确、不可泄露凭据的配置错误；不发网络请求 |
| URL 构造 | 使用 `actors/clockworks~tiktok-scraper/run-sync-get-dataset-items`，动态 ID 被安全编码 |
| 认证 | token 仅在 `Authorization` header，不出现在异常文本或 URL |
| 正常视频样本 | 输入 hashtag，返回与 Python `_video()` 对齐的归一化视频字段 |
| 非数组响应 | 抛出 schema error，不把对象误当作 dataset |
| 429/5xx/网络中断 | 限次指数退避；重试耗尽后保留状态码与 request context |
| 408/超时 | 返回可识别的 timeout error；不把未确认结果写入缓存 |
| 缓存 | 同 tag、同参数在 TTL 内不重复发起远端请求；`forceRefresh` 可绕过 |
| 成本护栏 | 调用参数包含显式费用上限；超出批次限制时在本地失败 |
| POC 集成测试 | 仅在显式 `APIFY_TOKEN` 和 opt-in 标志存在时执行；默认 CI 不产生远端费用 |

### 文件

- `scripts/short-video/lib/apify-client.mjs`（新建）
- `scripts/short-video/__tests__/apify-client.test.mjs`（新建，mock API 调用）
- `scripts/short-video/research-hashtags.mjs`（新建，CLI 入口）

### 使用场景

- 不是运行时工具（不每次做视频时调用）
- 是调研期工具（Hashtag 库维护时批量查数据）
- 被 `analytics-workflow.md` → Hashtag 库维护 → Step 2 调用

## 相关文档

- `docs/tiktok/tiktok-best-practices.md` → Hashtag 策略章节（已更新 trending 消费机制）
- `docs/analytics-workflow.md` → Hashtag 库维护章节
- `docs/research/china-ai-hashtag-mapping.md` → 60+ 实体映射库
- `docs/content-pipeline.md` Stage 3 Step 7 → trending 检查必须执行
- `scripts/short-video/lib/caption-utils.mjs` → `deriveHashtags()` 函数（已修复）
- `scripts/short-video/generate-caption.mjs` → `hashtagStrategy`（已新增 trending 分类）
- `docs/refs/tiktok-skills/lib/apify_client.py` → Python 参考实现
- `docs/reviews/handoff-hashtag-pipeline-gaps-review-2026-08-26.md` → Review 报告（缺口 B 的详细修正意见）
