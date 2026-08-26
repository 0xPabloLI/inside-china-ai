# Analytics Workflow — TikTok 数据分析独立工作流

> 创建于 2026-08-16（从 `docs/content-pipeline.md` Stage 6 独立出来）。
> Analytics 是跨视频、跨时间的独立工作流，不绑定单次 Content Pipeline 周期。
> 手工操作清单见 `docs/manual-ops.md` 的「定期检查」部分。

---

## 为什么独立

Content Pipeline 是"写文章 → 做视频 → 发布"的单次周期（1-2 天）。
Analytics 是"发布后 48h → 导出 CSV → 分析 → 优化建议"的周级别循环。
两者周期不同、触发条件不同，混在一起容易误以为"做完一条视频紧接着做
analytics"，但实际上 analytics 需要等数据沉淀。

---

## 常规流程（每周）

```
① 检查 pending-analysis.json
   │  新 session 时 agent 被动检查
   │  超过 48h → 提醒导出 CSV
   │
② 导出 TikTok Analytics CSV
   │  登录 https://analytics.tiktok.com
   │  → Content → 选时间范围 → Export
   │
③ 运行分析脚本
   │  node scripts/short-video/fetch-tiktok-analytics.mjs --csv <csv-path>
   │  → 输出 output/analytics-export.json
   │
④ 录入 A/B 测试
   │  node scripts/short-video/ab-test-tracker.mjs --result output/analytics-export.json
   │
④b Hashtag 效果追踪（CDP 抓取方式）
   │  Agent 通过 web-access CDP 抓取 TikTok Studio Analytics 页面
   │  → 提取每条视频的 hashtags + 播放 + 搜索词 + 流量来源
   │  → 追加到 output/hashtag-effect-tracker.jsonl
   │  → 数据见 docs/research/tiktok-competitor-intelligence.md §3
   │
⑤ 标记完成
      Agent 将 pending-analysis.json 的 status 改为 "done"
```

### CSV 导出说明

1. 用你的 TikTok 账号登录 `analytics.tiktok.com`（不需要开发者账号）
2. 进入 Content 页面
3. 选择时间范围（如最近 7 天）
4. 点击 Export 下载 CSV
5. CSV 包含：视频标题、发布时间、播放量、完成率、分享、收藏、评论、点赞

脚本使用模糊匹配解析列名，即使 TikTok 版本更新导致列名略有变化也能处理。

### CDP 抓取方式（替代/补充 CSV 导出）

除了 CSV 导出，Agent 也可以通过 web-access CDP 直接抓取 TikTok Studio 页面数据：

1. CDP 打开 `https://www.tiktok.com/tiktokstudio/analytics/overview` → 获取总览数据
2. CDP 打开 `https://www.tiktok.com/tiktokstudio/content` → 获取每条视频的播放/赞/评论
3. 提取搜索词 Top 5 和流量来源分布

CDP 方式不需要用户手动导出 CSV，但需要用户的 TikTok 登录态。两种方式互补使用。

---

## 数据驱动优化建议

当 analytics 数据积累到一定量后，Agent 在分析完 CSV 数据时可以做以下
判断：

### 数据量门槛

- **>10 个已发布视频**且有完整 analytics 数据时，Agent 开始做跨视频
 对比分析
- **<10 个**时只做单视频数据录入，不做模式分析（样本太小不可靠）

### Agent 能做的事

Agent 从 analytics JSON 中提取模式，例如：

- 哪类场景（hook / data / narrative / cta）的完播率最高/最低
- 视频时长与完播率的相关性
- 发布时间与播放量的相关性
- A/B 测试变量（有无 BGM、不同 hook 类型等）的对比结果

### Agent 不能做的事

- **搜索和推荐具体竞品视频**——TikTok 搜索受地区限制（HK 代理被拒绝
  访问），且 TikTok 搜索结果按平台算法排序，不是按"和你内容类似的竞品"
  排序。Agent 无法准确找到"值得模仿的竞品视频"
- **判断哪个竞品视频值得模仿**——这需要人看完视频后的主观判断

### 当数据发现模式后

Agent 输出类似这样的分析报告：

> "你的 narrative 场景平均完播率 65%，data 场景只有 42%。可能 data 场景
> 的视觉呈现需要优化。建议你在刷 TikTok 时留意别人怎么做数据展示的
> scene。"

然后由 **用户自己决定**是否去找竞品视频参考。如果用户找到了，手动下载
后交给 Agent 分析（见下方）。

---

## Hashtag 效果追踪

> 数据来源：竞品情报库 `docs/research/tiktok-competitor-intelligence.md` §3。
> 首次录入：2026-08-25（4 条视频，CDP 抓取）。

### 追踪文件

`output/hashtag-effect-tracker.jsonl` — 每行一条 JSON 记录，格式：

```json
{"videoTitle":"","publishedAt":"","hashtags":[],"views":0,"likes":0,"comments":0,"searchQueries":[],"fypPercent":0,"searchPercent":0,"recordedAt":""}
```

### Agent 操作步骤

1. 通过 CDP 抓取 TikTok Studio Analytics 数据（见上方 CDP 抓取方式）
2. 对每条视频，从 `tiktok-metadata.json` 或 scene-data 的 `metadata.hashtags` 读取该视频使用的 hashtags
3. 组装记录追加到 `hashtag-effect-tracker.jsonl`
4. 更新 `docs/research/tiktok-competitor-intelligence.md` §3 的视频列表

### 已知结论（2026-08-25，4 条视频）

| Hashtag | 状态 | 证据 |
|---------|------|------|
| `#creatorsearchinsights` | **待重新验证的历史信号** | 2 条视频样本（#2, #3）引来搜索词 "creator insights part 3 4 5"。样本量不足以单标签归因 hashtag 效果。2026-08-26 决策：从 `BLACKLISTED_HASHTAGS` 移除，不自动黑名单。Agent 在使用 Creator Search Insights 发现内容 gap 时可手动通过 `metadata.hashtags` 加入。详见 `docs/tiktok/tiktok-best-practices.md` → Hashtag 策略 |
| `#deepseek` | 有效 | 搜索词 "deepseek" 占 22% 搜索流量 |
| `#ai` | 待验证 | 竞品 9/16 使用，我们仅在视频 #1 使用，播放 247（最高），但无法单独归因 |
| `#chinaai` | 基准 | 每条必带，无法单独归因 |

### Analytics 粒度限制

**TikTok Analytics 不提供**：按单个 hashtag 分拆的流量来源。只能通过 A/B 测试（两条内容相似的视频只换一个 tag）来精确归因。需要 >10 条视频样本。

---

## Hashtag 库维护

> Hashtag 效果追踪（上面）和 Hashtag 库更新是一个闭环：追踪告诉你哪些 tag 有效/有害，库更新把结论固化到代码和文档中。

### 统一循环

```
Hashtag 效果追踪（上面，周级别）
  │  hashtag-effect-tracker.jsonl 积累数据
  │  analytics-conclusions.md 记录结论
  │
  ↓
Hashtag 库维护（季度级别 或 触发式）
  │  ① 查漏补缺：检查最近视频的 keyEntities.companies
  │     → 找出 ENTITY_HASHTAG_MAP 中没有的实体
  │  ② 数据更新：用调研期渠道查 views/posts 数据
  │  ③ 策略调整：根据 analytics 结论调整标签池
  │  ④ 代码更新：更新 caption-utils.mjs + tiktok-best-practices.md
  │  ⑤ 测试验证：跑 caption-utils.test.mjs 确认没 break
  │
  ↓
下一轮 Pipeline 自然使用更新后的库
```

### 触发条件

| 触发条件 | 频率 | 示例 |
|---------|------|------|
| 季度定期 | 每 3 个月 | 季度 hashtag 库审查 |
| 新实体发现 | 即时 | 视频中出现 map 中没有的公司/产品/模型 |
| Analytics 结论 | 即时 | analytics 发现某 tag 有害或某 tag 超预期 |

### 操作步骤

**Step 1: 查漏补缺**

```bash
# 检查最近 N 条视频的 meta.mjs keyEntities.companies
# 对比 ENTITY_HASHTAG_MAP 的 keys
# 找出 map 中没有的实体
```

Agent 扫描 `content/*/meta.mjs` 中的 `keyEntities.companies`，逐个检查是否在 `ENTITY_HASHTAG_MAP` 中有映射。如果没有，进入 Step 2。

**Step 2: 验证新实体的 hashtag**

对每个缺失的实体，用以下渠道验证其 TikTok hashtag 是否存在：

1. **TikTok `/tag/{hashtag}` 页面**（CDP 打开）— 最权威，直接看 TikTok 上的数据
2. **HashtagRadar `tiktokhashtags.com/hashtag/{tag}/`**（CDP 打开）— 看历史数据 + 相关标签
3. **Apify TikTok Hashtag API**（如需批量查询）— 免费额度 $5/月

如果实体有独立 hashtag → 加入 map。如果没有独立 hashtag → 映射到父公司 hashtag（如 `mimo` → `#xiaomi`）。

**Step 3: 更新代码和文档**

| 更新位置 | 更新内容 |
|---------|---------|
| `caption-utils.mjs` → `ENTITY_HASHTAG_MAP` | 新增实体 → hashtag 映射 |
| `caption-utils.mjs` → `CORE_TRAFFIC_HASHTAGS` | 更新 views/posts 数据（如有新数据） |
| `caption-utils.mjs` → `BLACKLISTED_HASHTAGS` | 加入 analytics 发现的有害标签（2026-08-26: `BLACKLISTED_HASHTAGS` 当前为空数组，`#creatorsearchinsights` 已移除，因样本量不足以归因。如未来 analytics 积累 >10 条样本且某标签效果持续低效，可重新评估加入） |
| `tiktok-best-practices.md` → 标签池表格 | 更新浏览量/帖子数数据 |
| `tiktok-best-practices.md` → 垂直标签表 | 新增实体行 |
| `docs/research/china-ai-hashtag-mapping.md` | 更新映射表（新实体 + 来源） |

**Step 4: 测试验证**

```bash
cd scripts/short-video && npx vitest run __tests__/caption-utils.test.mjs
```

全部通过后才算更新完成。

### 调研期数据获取渠道

> 详见 `docs/tiktok/tiktok-best-practices.md` → Hashtag 数据获取渠道（调研期渠道表）。
>
> 摘要：TikTok `/tag/{hashtag}` 页面（CDP，免费）、HashtagRadar（CDP，免费）、Apify `clockworks/tiktok-scraper`（API，Free plan 每月 $5 credit）、TikTok Creative Center（CDP，免费）。

### 与 Analytics → Pipeline 联动的关系

```
Analytics 复盘（周级别）
  → analytics-conclusions.md（hashtag 效果结论）
    → Hashtag 库维护（季度/触发式）
      → 更新 ENTITY_HASHTAG_MAP + BLACKLISTED_HASHTAGS（如有确凿证据）
        → 下一轮 Pipeline Stage 3 自动使用更新后的库
          → Agent 在选 keyEntities 时参考 analytics-conclusions.md
```

---

## Analytics → Pipeline 联动机制

Analytics 的结论不只是记录在文档里——它们要直接反哺到下一轮 Content Pipeline 的决策中。

### 联动机制

```
Analytics 复盘
  │  发现 hashtag 效果问题
  │  发现完播率/搜索词模式
  │
  ↓
输出: analytics-conclusions.md（output/ 目录）
  │  记录本轮发现的具体结论
  │  例："#creatorsearchinsights 待重新验证（样本量不足，已从黑名单移除）"
  │  例："叙事类视频搜索流量高于数据类"
  │
  ↓
下一轮 Pipeline Stage 0（素材收集时）
  │  Agent 读取 output/analytics-conclusions.md
  │  基于结论调整下一轮的内容选择/标签策略
  │
  ↓
下一轮 Pipeline Stage 3（scene-data 生成时）
  │  Agent 在选 hashtag 时参考 analytics 结论
  │  如果 analytics 发现某 tag 低效 → 不用或替换
  │  如果发现某类内容搜索流量高 → 优先选这类内容
```

### analytics-conclusions.md 格式

```markdown
# Analytics Conclusions — 2026-08-25

## Hashtag 策略
- ✅ #deepseek: 搜索流量驱动（22% 搜索词匹配）
- ⚠️ #creatorsearchinsights: 待重新验证的历史信号（2 条视频样本不足以归因，已从黑名单移除；Agent 使用 Creator Search Insights 发现 gap 时可手动加入）
- ⚠️ #ai: 竞品高频使用但未验证效果，下轮 A/B 测试

## 内容策略
- 叙事类视频（DeepSeek #1）播放最高（247），但完播率仅 1.2%
- 短视频（67s，Unitree）FYP 占比升到 86%，但总播放仍低
- 搜索词跟随最新视频变化 → 需保持发布频率

## 下轮 Pipeline 建议
- 优先选有具体数字/公司名的话题（搜索词匹配）
- hashtag 不超过 5 个（#creatorsearchinsights 不再自动黑名单，但仅在内容确实来源于 Creator Search Insights gap 发现时才手动加入）
- 继续缩短视频时长到 60-70s 目标
```

---

## 竞品参考视频分析（用户触发，非 Agent 搜索）

> TikTok 视频无法通过 yt-dlp 下载（反爬拦截），也没有官方下载 API。
> 详见 `docs/research/reference-video-extraction.md`。
> YouTube/Bilibili 可用 yt-dlp 自动下载。

### 触发方式

**用户主动触发**：在刷 TikTok/YouTube 时发现值得模仿的视觉风格，手动
下载视频后交给 Agent 分析。频率：约一两个月一次。

### 操作步骤

1. 用户在 Chrome 中手动下载参考视频（浏览器扩展或直接保存）
2. 将 `.mp4` 文件放到 `output/reference-videos/` 目录
3. 告知 Agent
4. Agent 执行：
   - ffmpeg 关键帧提取（1fps → ~60 帧用于 60s 视频）
   - Vision model 分析每帧（GPT-4o / Claude Vision / Qwen-VL）
   - 输出 media 策略报告 JSON，映射到 `MediaField` schema

### Agent 输出格式

```json
[
  { "scene": 1, "mediaType": "video", "animation": "zoom", "overlay": 0.7 },
  { "scene": 2, "mediaType": "image", "animation": "slide", "overlay": 0.5 }
]
```

> 此管线尚未实现。Issue 29 Part B 覆盖此内容。

---

## 文件参考

| 文件 | 用途 |
|------|------|
| `output/pending-analysis.json` | 待分析视频记录（publish-tiktok.mjs 自动写入） |
| `output/analytics-export.json` | 标准化分析数据（fetch-tiktok-analytics.mjs 输出） |
| `output/ab-test-results.json` | A/B 测试追踪（ab-test-tracker.mjs） |
| `output/hashtag-effect-tracker.jsonl` | Hashtag 效果追踪记录（Agent CDP 抓取后追加） |
| `output/analytics-conclusions.md` | Analytics 结论摘要（Agent 生成，下一轮 Pipeline 读取） |
| `output/reference-videos/` | 用户手动下载的竞品参考视频（按需） |

## 相关文档

- `docs/manual-ops.md` — 定期检查（每周）操作清单
- `docs/research/reference-video-extraction.md` — 视频下载可行性调研 + 竞品分析完整 spec
- `docs/research/tiktok-competitor-intelligence.md` — 竞品爆款情报库 + 自有视频 analytics
- `docs/research/china-ai-hashtag-mapping.md` — 中国 AI 实体 → TikTok hashtag 映射库（60+ 实体，7 层级）
- `docs/tiktok/tiktok-best-practices.md` → Hashtag 数据获取渠道 — 调研期数据获取方式
- `docs/content-pipeline.md` Stage 5 — 发布后自动写 `pending-analysis.json`
- `docs/content-pipeline.md` Stage 0 — Agent 读取 `analytics-conclusions.md` 调整内容策略
- `docs/research/multi-video-splitting-best-practices.md` — 留存模式研究

## Design Decisions & References

| Decision | Rationale | Source |
|----------|-----------|--------|
| Analytics 独立为单独工作流 | 发布后需等 48h 数据沉淀，与 1-2 天的 Content Pipeline 周期不同频 | 独立判断 |
| 数据量门槛 >10 视频才开始模式分析 | <10 样本太小，模式不可靠 | 独立判断 |
| 竞品参考视频由用户手动下载 | TikTok 搜索受地区限制，yt-dlp 无法下载 TikTok 视频 | `docs/research/reference-video-extraction.md` |
| Vision model 逐帧分析参考视频 | 60s 视频提取 ~60 帧（1fps），足以捕捉视觉风格变化 | 独立判断 |
