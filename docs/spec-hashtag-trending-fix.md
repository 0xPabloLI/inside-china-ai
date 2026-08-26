# Spec: Hashtag Trending 修复 + #creatorsearchinsights 黑名单移除

> 来源：handoff-hashtag-pipeline-gaps.md + handoff-hashtag-pipeline-gaps-review-2026-08-26.md
> Grill session：2026-08-26，用户确认全部决策

## 1. 目标

修复 `caption-utils.mjs` 中 `deriveHashtags()` 的两个缺口：
1. **trendingHashtags 未被消费** — 注释声明会读取 `metadata.trendingHashtags`，但代码没有实现
2. **#creatorsearchinsights 黑名单不当** — 基于样本量不足的误判，应移除

## 2. 范围

### 2.1 包含

- `deriveHashtags()` 新增 trending 标签消费逻辑（仅自动派生路径）
- `normalizeHashtag()` 统一规范化函数（全输入来源）
- 从 `BLACKLISTED_HASHTAGS` 移除 `#creatorsearchinsights`
- `generate-caption.mjs` 的 `hashtagStrategy` 分类新增 trending
- 既有 36 个测试保持通过 + 新增测试覆盖场景矩阵

### 2.2 不包含

- 缺口 B（Apify JS 客户端）— 推迟到下一 session
- `snapshot-trending.mjs` 修改 — 它的输出格式不变
- `content-pipeline.md` Stage 3 Step 7 — 已有 trending 检查的契约

## 3. 设计决策

### 3.1 标签优先级分层

| 层级 | 来源 | 可替换? | 示例 |
|------|------|---------|------|
| core | `CORE_TRAFFIC_HASHTAGS` | 否 | `#ainews` |
| brand | `AUXILIARY_TRAFFIC_HASHTAGS` 中的 `#chinaai` | 否 | `#chinaai` |
| primary vertical | `keyEntitiesCompanies[0]` 对应的 `ENTITY_HASHTAG_MAP` 值 | 否 | `#deepseek` |
| secondary vertical | `keyEntitiesCompanies[1+]` 对应的 `ENTITY_HASHTAG_MAP` 值 | **是** | `#chatgpt` |
| traffic pad | `PAD_CANDIDATES` | **是** | `#ai`, `#artificialintelligence` |
| trending | `metadata.trendingHashtags` | 替换者（最多 1 个） | `#aiviral` |

- core + brand 是固定 always-include（当前代码已是如此）
- primary vertical = `companies[0]` 的映射标签，不可被 trending 替换
- secondary vertical 和 traffic pad 是可替换的候选
- trending 最多加 1 个

### 3.2 替换算法

```
1. 收集 core + brand 标签
2. 匹配实体标签（companies[0] = primary, companies[1+] = secondary）
3. 如 tags.length < 3，用 PAD_CANDIDATES 补位
4. 处理 trendingHashtags（最多取 1 个有效标签）：
   a. 规范化 + 黑名单过滤 + 去重
   b. 如 tags.length < 5：直接加入
   c. 如 tags.length >= 5：
      - 找到最后一个 secondary vertical 或 traffic pad（可替换层）
      - 用 trending 标签替换它
      - 如没有可替换的标签，丢弃 trending
5. 截断到 max 5
6. 返回 3-5 个标签
```

### 3.3 人工覆盖语义

`metadata.hashtags` 非空时 = 锁定式人工覆盖：
- 过滤黑名单（移除后的新黑名单为空，但保留机制）
- 截断到 5
- 补位到 3
- **不注入 trendingHashtags**
- 立即返回

### 3.4 normalizeHashtag()

```javascript
function normalizeHashtag(value) {
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (s.length === 0) return null;
  s = s.replace(/^#/, ""); // 移除前导 #
  s = s.toLowerCase();       // 全小写
  if (s.length === 0 || /\s/.test(s)) return null; // 拒绝空值和含空白
  return `#${s}`;
}
```

适用范围：`metadata.hashtags`、`trendingHashtags`、实体映射输出（已是小写，但仍经过统一函数确保一致性）。

### 3.5 #creatorsearchinsights 移除依据

- 原黑名单依据：2 条视频样本（§3.2），数据粒度不足以单独归因（§3.3 自己承认）
- 外部权威来源（Buffer 2026）明确推荐使用 `#creatorsearchinsights`
- TikTok 官方设计：该标签是"元标签"（告知 TikTok 内容来源于 Creator Search Insights），不是内容标签
- 移除后不自动加入——Agent 在使用 Creator Search Insights 发现内容 gap 时手动通过 `metadata.hashtags` 加入
- `BLACKLISTED_HASHTAGS` 变为空数组 `[]`，但保留数据结构和过滤机制以备未来使用

### 3.6 大小写策略

- TikTok hashtag 完全大小写不敏感（多来源验证）
- 统一小写不影响搜索权重、分发效果或算法匹配
- 唯一影响是可读性（展示层面），但 caption 是纯文本不需要 CamelCase

## 4. 接口契约

### 4.1 deriveHashtags() 输入

```javascript
// metadata 新增可选字段 trendingHashtags: string[]
{
  hashtags: ["#deepseek", "#chinaai"],     // 可选，人工覆盖
  keyEntitiesCompanies: ["deepseek", "openai"], // 可选，实体匹配
  primaryEntity: "DeepSeek",              // 可选，SEO 用
  trendingHashtags: ["#aiviral"],          // 可选，NEW: trending 标签
}
```

### 4.2 deriveHashtags() 输出

```javascript
// 不变：string[] of 3-5 hashtags，全小写
["#ainews", "#chinaai", "#deepseek", "#aiviral"]
```

### 4.3 generate-caption.mjs hashtagStrategy 输出

```javascript
hashtagStrategy: {
  total: 4,
  traffic: ["#ainews"],
  vertical: ["#deepseek"],
  brand: ["#chinaai"],
  trending: ["#aiviral"],  // NEW
  rule: "...",
  researchedAt: "2026-08-08",
  dataSource: "...",
}
```

## 5. Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/lib/caption-utils.mjs` | 新增 `normalizeHashtag()`；重写 `deriveHashtags()` 的自动派生路径；移除 `#creatorsearchinsights` 从黑名单 | **Medium** | 修改了核心 hashtag 派生逻辑，影响每条视频的最终 caption。通过 36 个既有测试 + 新测试覆盖场景矩阵验证。人工覆盖路径保持不变（除黑名单移除）。 |
| `scripts/short-video/generate-caption.mjs` | `hashtagStrategy` 新增 `trending` 分类 | **Low** | 纯追加分类逻辑，不修改 caption 生成或约束检查。 |
| `scripts/short-video/__tests__/caption-utils.test.mjs` | 新增 ~12 个测试用例 | **Low** | 纯追加测试，不修改既有测试。 |
| `docs/tiktok/tiktok-best-practices.md` | 更新黑名单说明 + trending 消费机制 | **Low** | 文档更新，不修改代码逻辑。 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | 无 `trendingHashtags` | 与当前自动派生结果一致 | Low | 基础回归测试（既有 36 个测试保持通过） |
| 2 | `trendingHashtags: ["#aiviral"]`，tags.length=4 | 输出包含 `#aiviral`，总数 5 | Low | 直接加入测试 |
| 3 | `trendingHashtags: ["#aiviral"]`，tags.length=3 | 输出包含 `#aiviral`，总数 4 | Low | 直接加入测试 |
| 4 | `trendingHashtags: ["#aiviral"]`，tags.length=5（2 core+brand + 1 primary + 2 secondary） | 输出包含 `#aiviral`，替换最后一个 secondary vertical | Medium | 满容量替换测试 |
| 5 | `trendingHashtags: ["#aiviral"]`，tags.length=5（2 core+brand + 1 primary + 0 secondary + 2 pad） | 输出包含 `#aiviral`，替换最后一个 pad | Medium | 替换 pad 测试 |
| 6 | `trendingHashtags: ["#aiviral"]`，tags.length=5（2 core+brand + 1 primary + 0 secondary + 0 pad + 2 extra core/brand） | 丢弃 trending，保留原 5 个 | Low | 无可替换标签测试 |
| 7 | `trendingHashtags: ["#aiviral", "#aitechtrends"]`，tags.length=3 | 只取 1 个 trending，输出 4 个标签 | Low | 最多 1 个测试 |
| 8 | `trendingHashtags: ["#deepseek"]`（已存在） | 不重复，输出不含重复 | Low | 去重测试 |
| 9 | `trendingHashtags: ["CreatorSearchInsights"]` | 规范化为 `#creatorsearchinsights`，不被黑名单过滤 | Low | 规范化+黑名单移除测试 |
| 10 | `trendingHashtags: ["  #AiViral "]` | 规范化为 `#aiviral` | Low | 规范化测试 |
| 11 | `trendingHashtags: ["", "  ", null, 123]` | 全部被 `normalizeHashtag` 拒绝，不影响原逻辑 | Low | 非法值测试 |
| 12 | `metadata.hashtags: ["#deepseek", "#chinaai"]` + `trendingHashtags: ["#aiviral"]` | 仅返回人工覆盖结果，不注入 trending | Medium | 人工覆盖锁定测试 |
| 13 | `metadata.hashtags: ["#creatorsearchinsights", "#deepseek"]` | `#creatorsearchinsights` 不被过滤，保留在输出中 | Low | 黑名单移除测试 |
| 14 | `trendingHashtags: ["#aiviral"]`，primary entity 有映射，secondary 也有映射，满 5 | primary entity 标签保留，secondary 被替换 | Medium | primary 保护测试 |
| 15 | 既有 36 个测试全部通过 | 无回归 | High | `npx vitest run` 全绿 |

## 6. 实施顺序

1. **Ticket A-1**: 新增 `normalizeHashtag()` + 从黑名单移除 `#creatorsearchinsights`
2. **Ticket A-2**: 重写 `deriveHashtags()` 自动派生路径，实现 trending 标签消费 + 优先级替换
3. **Ticket A-3**: 更新 `generate-caption.mjs` hashtagStrategy 分类
4. **Ticket A-4**: 更新文档（tiktok-best-practices.md 黑名单说明 + trending 消费机制）
