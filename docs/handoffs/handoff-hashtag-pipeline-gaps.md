# Handoff: Hashtag 管线缺口修复

> 生成于 2026-08-26
> 来源 session: caption 格式重构 + hashtag 库扩展 + writing-for-agents 审查
> Commit: e59c08e (docs fix), a50fe5a + 6b378a4 (hashtag 库 + analytics 闭环)

## 背景

本 session 完成了：
1. `caption-utils.mjs` 重构：删除模板 comment hook，改为 AITL 模式；`ENTITY_HASHTAG_MAP` 从 18 扩展到 60+ 实体
2. `generate-caption.mjs` 改为一段式 caption 输出
3. `china-ai-hashtag-mapping.md` 深度调研报告（60+ 实体，7 层级）
4. `analytics-workflow.md` 新增 Hashtag 库维护 + 效果追踪闭环
5. Writing-for-agents 审查：修复 Apify env var 错误、Actor 名称不一致、渠道表重复

## 两个待修复缺口

### 缺口 A: `trendingHashtags` 代码未实现

**问题**：`caption-utils.mjs` 的 `deriveHashtags()` 注释（第 382-383 行）声明会读取 `metadata.trendingHashtags` 并纳入候选，但**代码没有实现**。

**影响**：Agent 在 Stage 3 Step 7（content-pipeline.md）通过 CDP 检查 TikTok Creative Center trending 标签，写入 `metadata.trendingHashtags`，但 `generate-caption.mjs` 调用 `deriveHashtags()` 时这个字段被完全忽略。trending 标签永远不会出现在最终 caption 中。

**修复方案**：

在 `deriveHashtags()` 函数中，在 "Truncate to max 5" 之前，加入 trending 标签合并逻辑：

```javascript
// After entity matching + pad to min 3, before truncate to max 5:

// Merge trending hashtags (from Creative Center, checked by Agent in Stage 3 Step 7)
const trendingTags = metadata?.trendingHashtags || [];
for (const tag of trendingTags) {
  const normalized = tag.startsWith("#") ? tag : `#${tag}`;
  if (!BLACKLISTED_HASHTAGS.includes(normalized) && !matchedTags.has(normalized)) {
    matchedTags.add(normalized);
  }
  // Only add 1 trending tag max (to stay within 3-5 range)
  if (matchedTags.size >= 5) break;
}

let tags = Array.from(matchedTags);
```

**测试用例**：
- `metadata.trendingHashtags = ["#aiviral"]` → 结果应包含 `#aiviral`
- `metadata.trendingHashtags = []` → 不影响原逻辑
- `metadata.trendingHashtags = ["#creatorsearchinsights"]` → 被黑名单过滤
- `metadata.trendingHashtags` 未设置 → 不影响原逻辑
- trending 标签 + entity 标签总数 > 5 → 截断到 5

**文件**：
- `scripts/short-video/lib/caption-utils.mjs` → `deriveHashtags()` 函数
- `scripts/short-video/__tests__/caption-utils.test.mjs` → 新增测试用例

### 缺口 B: Apify JS 客户端未创建

**问题**：`docs/refs/tiktok-skills/lib/apify_client.py` 是 Python 参考实现，管线的 JS 代码中没有 Apify 客户端。`APIFY_TOKEN` 已配好（`.env.local`），但无法被管线使用。

**影响**：`analytics-workflow.md` → Hashtag 库维护流程中 Apify 是调研期渠道之一（批量查 hashtag views/posts），但没有 JS 代码能调 Apify API。

**修复方案**：

新建 `scripts/short-video/lib/apify-client.mjs`，移植 `apify_client.py` 的核心逻辑：

```javascript
// 核心 API：
// - runActor(actorId, input) → 启动 Apify Actor 并等待结果
// - fetchHashtagStats(hashtag) → 查询单个 hashtag 的 views/posts/related
// - fetchHashtagBatch(hashtags) → 批量查询

// Actor: clockworks/tiktok-scraper
// Input: { hashtags: [tag], resultsPerPage: 20 }
// Output: [{ videoId, playCount, ... }]

// 环境变量: APIFY_TOKEN (已在 .env.local 中配置)
// Apify API: https://api.apify.com/v2/acts/{actorId}/run-sync-get-items
```

**参考实现**：`docs/refs/tiktok-skills/lib/apify_client.py`（`ApifyClient` 类，`fetch_niche_videos` 方法）

**文件**：
- `scripts/short-video/lib/apify-client.mjs`（新建）
- `scripts/short-video/__tests__/apify-client.test.mjs`（新建，mock API 调用）

**使用场景**：
- 不是运行时工具（不每次做视频时调用）
- 是调研期工具（Hashtag 库维护时批量查数据）
- 被 `analytics-workflow.md` → Hashtag 库维护 → Step 2 调用

## 实施顺序

1. **先 A**（缺口 A 影响每次视频管线，trending 标签写入但没被用）
2. **后 B**（缺口 B 是调研期增强，不阻塞管线）

## 相关文档

- `docs/tiktok/tiktok-best-practices.md` → Hashtag 策略章节
- `docs/analytics-workflow.md` → Hashtag 库维护章节
- `docs/research/china-ai-hashtag-mapping.md` → 60+ 实体映射库
- `docs/content-pipeline.md` Stage 3 Step 7 → trending 检查必须执行
- `scripts/short-video/lib/caption-utils.mjs` → `deriveHashtags()` 函数
- `docs/refs/tiktok-skills/lib/apify_client.py` → Python 参考实现
