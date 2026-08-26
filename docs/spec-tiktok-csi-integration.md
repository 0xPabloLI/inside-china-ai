# Spec: TikTok Creator Search Insights + AI Outline CDP 集成

> **创建于**: 2026-08-26
> **调研报告**: `docs/research/tiktok-creator-tools.md`
> **状态**: 待实施

---

## 1. 目标

通过 CDP（Chrome DevTools Protocol）自动化 TikTok Creator Search Insights (CSI) 和 AI Outline 功能，为视频生产管线提供：

1. **Stage 1b**: AI Outline 生成 description + hashtags 候选（写入 scene-data metadata）
2. **Stage 0 补充**: CSI Content Gap 话题发现（选题参考）
3. **Analytics ④b 补充**: CSI Search Analytics per-video 数据

## 2. 背景

- TikTok 没有面向商业用户的 CSI/AI Outline API（Research API 仅限学术机构）
- CDP 是唯一可行路径——web-access skill 已有用户 TikTok 登录态
- 管线已有完整的兜底逻辑：`normalizeHashtag()`、`BLACKLISTED_HASHTAGS`（当前为空）、3-5 限制、SEO 检查、CTA 追加

## 3. 架构

### 3.1 新增文件

```
scripts/short-video/lib/tiktok-csi.mjs     # CDP 交互库（核心）
```

### 3.2 不修改的现有文件

| 文件 | 理由 |
|------|------|
| `caption-utils.mjs` | metadata 注入路径已完备，无需修改 |
| `generate-caption.mjs` | 已有 metadata 读取逻辑 |
| `scene-rules.mjs` | 不消费 metadata |
| `analytics-utils.mjs` | CSV 解析逻辑不变，CSI 数据是补充 |

### 3.3 数据流

```
Phase 1 (AI Outline):
  scene-data 内容 → CDP prompt → AI Outline 生成 → 提取 title/hashtags/hooks
  → 写入 scene-data.mjs 的 export const metadata = { title, description, hashtags }
  → generate-caption.mjs 读取 metadata → deriveTitle/Description/Hashtags
  → 管线兜底逻辑自动作用

Phase 2 (Content Gap):
  CDP 打开 tiktok.com/inspiration → 过滤 Content Gap → 提取话题列表
  → 输出 output/csi-content-gap.json → Agent Stage 0 参考

Phase 3 (Search Analytics):
  CDP 打开 CSI Search Analytics → 提取 per-video 搜索数据
  → 追加到 output/hashtag-effect-tracker.jsonl
```

## 4. API 设计

### 4.1 tiktok-csi.mjs 导出函数

```typescript
// Phase 0: 前置验证
async function checkCsiAvailability(): Promise<{
  available: boolean;
  aiOutlineAvailable: boolean;
  loginRequired: boolean;
  region?: string;
}>

// Phase 1: AI Outline 生成
async function generateAiOutline(prompt: string, opts?: {
  refresh?: number;  // 获取多少个版本，默认 1
  topic?: string;    // CSI 话题名（如已知）
}): Promise<{
  titles: string[];
  hashtags: string[];
  hooks: string[];
  scriptOutline?: string;  // 六段式 outline（参考用）
  source: "ai-outline" | "creator-tips";  // 降级标记
}>

// Phase 2: Content Gap 话题
async function fetchContentGapTopics(opts?: {
  category?: string;  // 按类别过滤
  limit?: number;     // 默认 20
}): Promise<Array<{
  topic: string;
  searchVolume?: string;  // "High", "Medium", "Low"
  contentGap: boolean;
  trendDirection?: "up" | "stable" | "down";
}>>

// Phase 3: Search Analytics (per-video)
async function fetchSearchAnalytics(): Promise<Array<{
  videoTitle: string;
  searchViews: number | null;
  searchImpressions: number | null;
  searchViewPercentage: number | null;
  averageCTR: number | null;
  searchRanking: string | null;
}>>
```

### 4.2 CLI 入口

```bash
# Phase 0 验证
node scripts/short-video/lib/tiktok-csi.mjs --check

# Phase 1: AI Outline 生成（基于 scene-data 内容）
node scripts/short-video/lib/tiktok-csi.mjs --ai-outline --content <dir> [--refresh 3]

# Phase 2: Content Gap 话题
node scripts/short-video/lib/tiktok-csi.mjs --content-gap [--category tech] [--limit 20]

# Phase 3: Search Analytics
node scripts/short-video/lib/tiktok-csi.mjs --search-analytics
```

## 5. Scenario & Risk Verification

### 5.1 Modified Files Impact

| 文件 | 改动 | 消费者影响 |
|------|------|-----------|
| `tiktok-csi.mjs`（新增） | 新建 CDP 库 | 无现有消费者 |
| `content/*/scene-data.mjs` | Agent 手动新增 metadata export | `generate-caption.mjs` 已有读取逻辑 |
| `docs/content-pipeline.md` | 新增 Stage 1b 步骤 | 不改现有 Stage 步骤 |
| `docs/analytics-workflow.md` | 新增 CSI Search Analytics 步骤 | 不改现有步骤 |

### 5.2 Behavioral Scenarios（测试用例来源）

| # | 场景 | 前置条件 | 预期行为 | 测试 |
|---|------|---------|---------|------|
| 1 | CDP 打开 inspiration 页面正常 | 已登录 TikTok | 返回 available=true | `checkCsiAvailability()` mock test |
| 2 | 用户未登录 | 无 TikTok session | available=false, loginRequired=true | mock login redirect |
| 3 | CSI 可见但 AI Outline 不可用 | 地区不支持 AI Outline | available=true, aiOutlineAvailable=false | mock partial page |
| 4 | AI Outline 生成正常输出 | AI Outline 已启用 | 返回 titles/hashtags/hooks | mock AI response |
| 5 | AI Outline 不可用→降级 creator tips | 仅 CSI creator tips | source="creator-tips", 返回 keywords | mock fallback |
| 6 | AI Outline hashtags 含大写/特殊字符 | 任意大小写 | `normalizeHashtag()` 处理 | 已有测试覆盖 |
| 7 | hashtags > 5 个 | AI 返回 6+ | `deriveHashtags()` 截断 | 已有逻辑 |
| 8 | description > 2200 字符 | AI 返回长文本 | `deriveDescription()` 截断 | 已有逻辑 |
| 9 | AI Outline 输出为空 | 页面加载慢 | 脚本报错 + fallback 到自动推导 | 错误处理测试 |
| 10 | DOM 结构变化 | TikTok 更新 | 语义选择器 + fallback | 多选择器策略 |
| 11 | 多次 refresh 获取多版本 | --refresh 3 | 返回 3 组候选 | 参数测试 |
| 12 | Content Gap 话题抓取 | Phase 2 | 输出 JSON 数组 | schema 验证 |
| 13 | Search Analytics 抓取 | Phase 3 | 追加到 jsonl | JSONL 格式 |
| 14 | scene-data 已有 metadata | Agent 已手动写 | 提示确认覆盖 | 交互式确认 |

## 6. 实施顺序

| Phase | 内容 | 依赖 | 测试 |
|-------|------|------|------|
| 0 | CDP 前置验证 | 无 | 手动验证 + 记录 DOM 结构 |
| 1 | `tiktok-csi.mjs` 核心库 + `--ai-outline` + `--check` | Phase 0 | mock 单测 + CDP 集成测试 |
| 2 | `--content-gap` | Phase 1（复用 CDP 基础设施） | mock 单测 |
| 3 | `--search-analytics` | Phase 1 | mock 单测 |

## 7. 降级策略

- AI Outline 不可用 → 降级为 CSI creator tips（keywords + hook best practices）
- CSI 整体不可用 → 脚本报错退出，Agent 继续用现有自动推导逻辑
- CDP 连接失败 → 报错提示用户检查 Chrome + 登录态
- DOM 选择器失效 → 多选择器 fallback + 报错
