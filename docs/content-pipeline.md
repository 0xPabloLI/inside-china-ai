# Content Pipeline — 统一内容管线

> 创建于 2026-08-03。合并原 article-workflow.md + video pipeline 入口。
> Agent 按此文档操作。用户只需对 Agent 说一句话即可启动。

## 管线概览

```
入口 → [Stage 0 共享素材收集] → ┬─ [文章轨：Stage 1 文章草稿 → MRL-1 → Stage 2 保存 draft]
                              └─ [视频轨：Stage 3 scene-data → MRL-2 → Stage 4 视频制作] → [Stage 5: MRL-3 → ⏸️ HITL 内容包审阅 → 确认后公开文章 + TikTok] → [Stage 6 Analytics]
```

> **📚 内容状态与 RAG reindex**：Stage 1 的文章可用 `publish-article.mjs --draft` 保存为非公开 draft；draft 与 Stage 0 素材可供后续工作引用。文章公开发布、附件上传和 TikTok URL 回写都在 HITL 确认后执行。每次 `publish-article.mjs` 调用会非阻塞触发 RAG reindex；其成败不阻塞视频轨。scene-data 就绪后以及 Stage 4 有多媒体素材变更时，仍按各自触发点 reindex。

所有 stage 必经。文章不再是某个工作流的专属步骤，而是管线的必选 stage。

### Stage 0: Source Discovery & Material Gathering

管线起点。三个入口在 Stage 0 汇合，输出统一的「素材集合」（用户素材 + 互联网全文）。

> **Analytics 结论读取（必须）**：Agent 在 Stage 0 开始前，检查 `output/analytics-conclusions.md` 是否存在。如果存在，读取其中的 Hashtag 策略和内容策略结论，在后续 Stage 3 选择 hashtag 和设计内容时参考。详见 `docs/analytics-workflow.md` → Analytics → Pipeline 联动机制。

**入口 1（有素材）**：用户给 PDF/URL/文本 → Agent 读素材 → 提取 keyword → `search-sources --research --content-id <slug>` → Agent 从 `discovery.json` 挑选 URL → `web-access`/Jina 提取全文 → **每个详情页调用 `extract-media.mjs --tab <tabId> --content <slug>` 缓存媒体 URL**（SVE #114）→ 用户素材 + 全文 = Stage 0 输出

**入口 2（有话题）**：用户给话题 → `search-sources --keyword "话题" --research` → Agent 从 `discovery.json` 挑选 URL → `web-access`/Jina 提取全文 → **每个详情页调用 `extract-media.mjs --tab <tabId> --content <slug>` 缓存媒体 URL**（SVE #114）→ 全文 = Stage 0 输出

> **SVE（Single-Visit Extraction，#114）**：Agent 用 `web-access` 打开详情页后，CDP tab 已在手中。立即在该 tab 上运行 `node scripts/short-video/lib/extract-media.mjs --tab <tabId> --content <slug>`，提取页面所有图片/视频/og:image URL 并缓存到 `content/<slug>/research/media-cache.json`。asset-sourcer Phase 0b 会读此缓存，避免重复搜索。`--tab` 复用 Agent 已打开的 tab（Agent `/new` 拿到 tabId 后传给 extract-media.mjs），`--url` 则由 extract-media.mjs 自行开新 tab。

**入口 3（无输入）**：`search-sources --trend` → Agent 从 `trending-topics.json` 选话题 → 走入口 2 路线

> **Evidence 模块**：`scripts/short-video/lib/research/`（schemas、validators、workspace、brief-builder、claim-auditor、scene-claims）保留但不接入管线。`search-sources.mjs --content-id <slug> --research-run-id <id>` 输出 `discovery.json`。非阻塞审计可通过 `research-pipeline.mjs --audit-only` 手动触发（Issue #61）。
>
> 详细 spec 见 `docs/archive/spec-research-evidence-pipeline.md`。

### Stage 0 末尾：RAG 查询（已有内容检索）

Stage 0 素材收集完成后、文章轨/视频轨分叉前，Agent 查 RAG 检索项目已有内容：

```bash
node scripts/rag/query.mjs "话题关键词 公司名" --type article --format json
node scripts/rag/query.mjs "话题关键词 公司名" --type source-material --format json
```

Agent 从 Stage 0 的 `discovery.json` 和素材中提炼查询词（话题关键词 + 主要公司名/实体名）。查询结果供 Stage 1（文章生成）和 Stage 3（scene-data）共享参考。

**结果消费**：
- 避免重复已有文章的角度和数据
- 融入公司背景上下文（如公司名出现时带入已有背景）
- 可选在文章中添加交叉引用（如 markdown link 到已有文章 slug）
- 不持久化查询结果——即时参考，不是管线状态

> **非阻塞**：Ollama 未运行或查询失败时跳过，输出 `⚠️ RAG query skipped: <reason>`，继续管线。与 Stage 2d 降级规则一致。

Stage 0 完成后，文章轨与视频轨基于同一素材集合并行推进：视频脚本不是文章翻译，也不等待文章公开。MRL-1 和 MRL-2 自审通过后不暂停。唯一的人工确认点是 **HITL 内容包审阅**：用户同时审阅文章 draft、scene-data 与视频成品；确认后才公开文章、上传附件并发布 TikTok。

### 语言规则

**所有文章发布为英文。** 无论源素材是中文、英文还是其他语言，Agent 在 Stage 1b 中必须输出英文文章。源素材如为中文，Agent 在总结和扩展时翻译为英文。

**Widget 统一使用英文。** Widget 数据和 UI 文案不需要双语 toggle，直接用英文。现有 DeepSeek widget 中的 EN/中文 toggle 已于 2026-08-08 移除。

### Human-in-the-Loop (HITL) 检查点

管线设 1 个强制人工确认点。Agent 到达 HITL 检查点时 **必须暂停**，输出审阅内容，等待用户在对话中明确确认后方可继续。

| 检查点   | 位置                           | 审阅内容                                                        | 确认方式              |
| -------- | ------------------------------ | --------------------------------------------------------------- | --------------------- |
| **HITL** | Stage 5 内部（验证后、公开前） | 视频成品 mp4 + verify-video.mjs 报告 + 文章 draft + 场景概览表 | 用户说「内容 OK，发布」 |

> **Agent 行为约束**：用户未明确确认前，Agent 不得执行 TikTok 发布。确认必须是用户主动发出（如「继续」「OK」「确认」「发布」等），Agent 不得自行假设确认。

### Machine Review Loop (MRL) — 机器自审循环

每个 HITL 检查点前，Agent **必须先运行 MRL**。MRL 是一轮纯机器自审：Agent 按检查清单逐项验证自己的输出，发现 Blocker 立即修复，然后重新验证，**循环直到 0 Blockers** 才输出 MRL 报告并进入 HITL。

```
[Agent 生成输出] → 🔄 MRL 检查
  ├─ Blocker FAIL → 修复 → 重新检查（循环）
  ├─ Blocker PASS, Warning 存在 → 输出 MRL 报告（PASS with warnings）
  └─ Blocker PASS, Warning 0 → 输出 MRL 报告（PASS）
 → ⏸️ HITL（附 MRL 报告供用户参考）
```

| MRL       | 位置                         | 检查对象                    | Blocker 数              | Warning 数 |
| --------- | ---------------------------- | --------------------------- | ----------------------- | ---------- |
| **MRL-1** | Stage 1（自审，不暂停）      | 文章 frontmatter + markdown | 8                       | 5          |
| **MRL-2** | Stage 3（自审，不暂停）      | scene-data.mjs（每集）      | 13                      | 9          |
| **MRL-3** | Stage 5 → HITL 前            | 视频成品 mp4                | `verify-video.mjs` 已有 | +内容检查  |

**MRL 报告格式**（Agent 在 HITL 输出中附带）：

```
🤖 MRL-N 报告
━━━━━━━━━━━━━━━
状态：✅ PASS（或 ✅ PASS with warnings）
Blockers：0/8 通过
Warnings：2 项（列出但不阻塞）
━━━━━━━━━━━━━━━
✅ B1 Frontmatter — 通过
✅ B2 语言 — 通过
⚠️ W1 字数 3200（建议 800-3000）
...
━━━━━━━━━━━━━━━
```

## 如何启动

三个入口均在 **Stage 0** 汇合。

### 入口 1：有源素材（PDF / 报告 / 长文 / URL）

**用户对 Agent 说**："读这个素材写一篇文章：[PDF 路径 / URL / 文本]"

Agent 从 Stage 0 开始：读素材 → 提取 keyword → 运行 `search-sources --research` → 提取全文 → 进入 Stage 1。

### 入口 2：只有话题或趋势

**用户对 Agent 说**："用「华为 AI 芯片突破」这个话题做一条内容"

Agent 从 Stage 0 开始：运行 `search-sources --keyword "话题" --research` → 提取全文 → 进入 Stage 1。

### 入口 3：无输入（趋势发现）

**用户对 Agent 说**："跑 search-sources --trend，选一个话题做内容"

Agent 从 Stage 0 开始：运行 `search-sources --trend` → 选话题 → 走入口 2 路线。

> **搜索工具有两个模式**：`search-sources.mjs --trend`（趋势发现，扫全部源）和 `search-sources.mjs --keyword "xxx" --research`（深度调研，跑所有 supportsKeyword=true 源）。
>
> **源定义在 `scripts/short-video/lib/source-registry.mjs`**：每个源标注 `accessMethod`、`supportsKeyword`、可选 `locale`、可选 `apiSearch`。新增源只需添加 collector 对象。
>
> **补充搜索源**：需要更多新闻/学术/素材 API 时，查 `docs/tools-catalog.md` → Pipeline API 补充候选。
>
> **与 RAG 的区别**：RAG（`scripts/rag/`）搜索项目已有内容，用本地 Ollama bge-m3 做语义向量搜索，零费用。search-sources 搜索实时互联网。两者不重复。


---

## Stage 1: 文章生成

> 文章生成的完整规则（Widget 决策树、Frontmatter 格式、MRL-1 检查清单、声明验证标注、源引用要求）见 **`docs/article-production-guide.md`**。本节仅保留 contract。

### 1a. 源素材读取

Agent 接收任意格式的源素材，读取并理解核心内容。

| 素材类型            | 读取方法                                      | 工具                           |
| ------------------- | --------------------------------------------- | ------------------------------ |
| PDF                 | 用 `pdf-parse` 或 `web-access` skill 读取文本 | `npm install pdf-parse` 或 CDP |
| 网页 URL            | 用 `web-access` skill (CDP) 抓取              | Chrome 后台 tab                |
| 纯文本              | 直接 `read_file`                              | 内置工具                       |
| 研究报告            | 同 PDF 或网页                                 | 同上                           |
| 社交媒体帖子        | 用 `web-access` skill 抓取                    | CDP                            |
| 话题/趋势（无素材） | Agent 用 `web-access` skill 调研              | CDP                            |

读素材后，agent 在记忆中提取：核心叙事线、关键人物/公司、数据点、引用语句、因果关系。

#### 素材存放约定

所有用户提供的原始素材文件统一存放到 `docs/refs/source-materials/`。命名建议：`<话题关键词>-<简短描述>.<ext>`。此目录纳入 git 跟踪。

### 1b. 富文章生成

**关键理念**：不是纯总结，是 **总结 + 扩展**。

Agent 从 Stage 0 共享素材出发，生成含交互 Widget 的富文章。完整的文章生产规则（Widget 决策树、宽度规则、创建新 Widget 流程、Frontmatter 格式、声明验证标注规范、MRL-1 检查清单、源引用要求、原创分析要求）见 **`docs/article-production-guide.md`**。

### 🔄 MRL-1: 文章自审

Agent 生成 frontmatter markdown 后，运行 MRL-1 自审循环（8 Blockers + 5 Warnings，详见 `docs/article-production-guide.md`）。0 Blockers 后保存 article draft，与视频轨并行推进（不暂停）。

---

## Stage 2: 保存 Article Draft + Widget 准备

MRL-1 通过后，Agent 将文章保存为非公开 draft，并准备发布所需的 widget 与附件清单。公开视频工作不等待 live article URL。

### 2a. Widget 部署（如有新 widget）

如有新 widget，按 `docs/article-production-guide.md` → 创建新 Widget 流程 执行（`npm run build` + 部署 + verify-widget-a11y）。

### 2b. 保存 Article Draft（不公开）

```bash
node scripts/article/publish-article.mjs --file <path> --draft
```

脚本通过 Supabase Auth API 登录（Admin 账号），REST API 按 slug upsert。`--draft` 强制保存为不公开状态；每次调用都会非阻塞触发 `triggerRagReindex()`。HITL 确认后，使用同一文章文件且不带 `--draft` 公开发布。

### 2c. 准备源文件附件（公开操作在 Stage 5）

将所有引用的原始素材文件上传为 article attachments：

```bash
# 上传单个文件
node scripts/article/upload-attachments.mjs --post <slug> --files <path/to/source.pdf>

# 上传多个文件
node scripts/article/upload-attachments.mjs --post <slug> --files <path1.pdf> <path2.csv> <path3.docx>
```

将文件与命令准备好；实际上传在 Stage 5 的 HITL 确认后执行。

### 2d. RAG Reindex（保存文章时自动触发）

保存文章 draft 或公开文章后，都会触发 RAG 增量重建。`publish-article.mjs` 内置 `triggerRagReindex()` 调用，发布成功后自动触发。即使自动触发失败，也不阻塞管线。

> **非阻塞**：如果 Ollama 未运行或 reindex 失败，不阻塞管线后续 stage。Agent 会输出警告并建议手动 `node scripts/rag/index.mjs`。

### 2e. RAG 工具参考（随时可用）

> 管线在 Stage 0 末尾和 Stage 3 Step 2 已集成 RAG 查询步骤。以下 CLI 参考供 Agent 在管线任何阶段随时查询已有内容。

用语义搜索查已有内容（零费用，本地 Ollama bge-m3）：

```bash
node scripts/rag/query.mjs "DeepSeek 估值"                    # 全类型搜索
node scripts/rag/query.mjs "DeepSeek 估值" --type research    # 只搜研究文档
node scripts/rag/query.mjs "数字人" --type scene-data         # 只搜已有视频场景
node scripts/rag/query.mjs "logo" --type asset-catalog        # 只搜素材目录
```

| `content_type` | 内容 | 来源目录 |
|----------------|------|---------|
| `article` | 已发布文章 | `articles/*.md` |
| `scene-data` | 视频场景数据 | `scripts/short-video/content/*/scene-data.mjs` |
| `source-material` | 源素材文档 | `docs/refs/source-materials/` |
| `research` | 研究文档 | `docs/research/` |
| `tiktok-ref` | TikTok 策略参考 | `docs/refs/tiktok-skills/` |
| `asset-catalog` | 素材目录 | `scripts/short-video/assets/catalog.yml` |

`--format human` 输出可读文本；默认 JSON 供 Agent 消费。`--topics` 按 metadata.topics 过滤。`--rerank` 启用重排（需 `ollama pull bge-reranker-base`）。

---

## Stage 3: 视频脚本 + scene-data（与文章轨并行）

> **前置条件**：Stage 0 共享素材已完成。文章 draft 可作为一致性输入，但公开视频工作不以文章公开为前置条件。
>
> **公司档案**：如内容涉及已建档公司（见 `docs/refs/company-profiles/`），确保 scene-data 中的公司信息与档案一致。特别注意 ByteDance 的 Platform Context（TikTok 关系）。

从 Stage 0 共享素材、文章 draft（如已就绪）与视频叙事目标形成独立视频脚本；视频脚本不是文章翻译。

> **脚本写作方法论**：参照 `docs/video-script-writing-guide.md`（S.T.A.R.T. 主框架 + AI Outline HITL 工具 + 留存引擎 + per-scene 素材要求）。

### Step 0: 分集评估

Agent 在生成 scene-data 前，先运行分集评估器。评估器输出 `recommendedParts`（1-5，Agent cap 为 3）。`recommendedParts > 1` 时输出分集评估报告，等待用户确认后生成 N 份 scene-data。

> 多集系列策略（拆分类型、集间链接、连贯规则、合集制作、系列发布）见 **`docs/series-production-guide.md`**。

### 管线进度追踪

每次启动管线时，Agent 在 `scripts/short-video/output/` 下创建 `pipeline-status.json`，记录当前管线的进度状态。

字段：`articleSlug`、`articleTitle`、`startedAt`、`currentStage`、`stages`（各 stage status + completedAt + mrl）、`videoParts`（各集 status + sceneData + mrl）、`nextAction`。

**Agent 行为**：每个 stage 完成后更新；MRL 通过后写入 `mrl` 状态；HITL 暂停时 `nextAction` 写明等待什么；新 session 启动时先读此文件判断未完成管线。

**`main.mjs` 支持**：`node main.mjs --content <dir>`（如 `deepseek`、`distillation/pt1`、`restraint/pt1`；要求目录内 `meta.mjs` + `scene-data.mjs` 两者齐备）。

### 步骤

1. **读 Stage 0 素材** — 从 Stage 0 输出的素材集合（用户素材 + 互联网全文）中提取核心信息。文章 draft 如已就绪可作为一致性参考，但视频不是文章翻译。
2. **RAG 查询（已有 scene-data 检索）** — 用叙事角度 + 公司名查 RAG（命令同 Stage 0 末尾，`--type scene-data` 与 `--type article` 各一次），检索已有视频场景和文章背景。Agent 读取结果后：避免重复已有场景的叙事结构和角度；在公司名出现时融入已有背景信息到 voiceover 脚本中。**非阻塞**：Ollama 不可用时跳过 + 输出警告 + 继续。
3. **确定叙事类型** — 根据素材内容选择叙事结构（详见 `docs/video-script-writing-guide.md` → Step 2 叙事类型）
4. **提炼核心叙事线** — 从素材中提取 3-5 个关键点，确定每个 scene 的素材需求（详见 `docs/video-script-writing-guide.md` → Scene 模板）
5. **生成 AI Outline 话题描述（HITL 检查点）** — Agent 基于核心叙事线生成一段含具体公司名+数字+事件的话题描述（≤30 词），输出到对话中。**Agent 暂停**，等用户在 TikTok 移动端 CSI → AI Outline 中输入并抄回结果。降级：用户跳过则 Agent 自行设计。
6. **按 S.T.A.R.T. 映射表设计 scene** — 逐 scene 按叙事角色设计。每个 scene 填写 `narrativeRole`（S.T.A.R.T. 角色）和 `retentionMechanism`（留存机制），以及 voiceover、素材需求。W7 检查 open loop (S2)、W8 检查 pattern interrupt (S5)、W9 检查 loop closure (S9)。详见 `docs/video-script-writing-guide.md` → Step 3。
7. **设计 SEO 标题**（≤60 chars）——对比 Agent 生成的 title 和 AI Outline 返回的 title，取更优者
8. **写 `scene-data.mjs`** — 逐 scene 写入 scene-data（新建 content dir 时见 `docs/content-scaffold-guide.md`）。每个 scene 的 `media` 字段必须匹配 Step 4 确定的素材要求——未手工指定 media 的 scene 填写 `assetNeed` 字段，asset-sourcer 按 claim 做 per-scene 搜索 + VLM 相关性审查 + 跨内容复用上限（见 `docs/video-script-writing-guide.md` → assetNeed 约定）。素材**生成**比采购更合适的 scene（抽象概念、无现成画面）声明 `mediaStrategy` + `aiVideo.prompt`：字段契约、8 维模板与 preflight 规则见 `docs/video-workflow.md` → B-roll Generation。
8b. **VLM stock 图片相关性评判** — scene-data 写完后，对每个 `media.type === "image"` 的场景运行 VLM 相关性评判：`node scripts/short-video/evaluate-stock-relevance.mjs --content <dir>`。Qwen3-VL 对每张 stock 图片评分（0-100），检查与 voiceover + texts 的相关性。**完成标准**：所有图片 relevance ≥ 60。低于阈值的场景用 `search-replacement-images.mjs` 搜索 Pexels 替换，或声明 `mediaStrategy: "b-roll"` 转为 AI 生成。
9. **检查 TikTok Creative Center trending 标签（必须执行）** — 通过 web-access skill 打开 `https://ads.tiktok.com/creative/creativeCenter/trends/hashtag?period=7&region=US`，检查所有类别的 trending 标签。如果发现与视频内容高度相关的 trending 标签，记录到 scene-data 的 `metadata.trendingHashtags` 字段中。`generate-caption.mjs` 会自动将这些标签纳入候选。如果没有相关的 trending 标签（当前常态），在 scene-data 的 metadata 中注明 `trendingChecked: true` 即可。此步骤为**必须执行**（不是可选）。详见 `docs/tiktok/tiktok-best-practices.md` → Hashtag 策略章节。也可用 `node scripts/short-video/snapshot-trending.mjs --keywords "keyword1,keyword2"` 自动执行。

### 素材 → 视频的节奏适配

| 素材         | 视频                    |
| ------------ | ----------------------- |
| 6-10 个信息点 | 10-12 个场景            |
| 详细论述     | 精简为 1-2 句 voiceover |
| 数据表格     | 数据可视化场景          |
| 引用语句     | 大字引用场景            |
| Widget       | 不出现（视频无法交互）  |

### AI Outline 话题描述规则（Step 5 细则）

> TikTok AI Outline 仅移动端可用。输出质量取决于输入具体度——含公司名+数字时大幅提升。实测（2026-08-27）：泛输入→clickbait；具体输入→Title/Hook/Hashtags 均可用。

**AI Outline 输出用途**：消费映射表→Step 5 scene 设计；Hashtags→对比标签池；Hook→参考改写；Title→对比取优。Script 内容不用。

要求（1-2 句≤30 词、含公司名+数字+事件）与降级路径见 Step 5。

### 🔄 MRL-2: 脚本自审

Agent 写完每集 `content/<dir>/scene-data.mjs` 后，运行 MRL-2 自审循环（每集单独检查），0 Blockers 后直接进入 Stage 4（不暂停）。

**MRL-2 检查项**（B1–B13 Blockers + W1–W9 Warnings）：由 `verify-video.mjs --pre`（`scene-rules.mjs` → `runAllSceneDataChecks`）机器强制；Agent 在 HITL 报告中引用其输出（报告含检查项名称与详情，无需查表）。B5（无 Widget 标记）、B6（数据一致性）、W2（Hook 具体性）为 Agent 判断项。完整清单与阈值见 `scene-rules.mjs`。

**文本溢出双层防线**（spec 决策 14/71，T11 同步）：

1. **字符预算 = 提示级（WARN）**：`checkTextWidthBudget`（`scene-rules.mjs`）从文本槽契约推导预算——`slotCharBudget()`（`lib/text-slots.mjs`）用实测内容盒宽度 ÷ `SLOT_FIELDS.preferredSize` 计算，不手写字符锚点；未实测的槽位直接跳过（不猜测）。超预算只产生 `warn` 级创作提示（建议缩短或换布局），**不阻断**。仅覆盖文本槽契约声明的字段。
2. **几何验证门槛 = 渲染时硬门**：真实判定交给 Remotion 渲染期的 TextGate（`remotion/src/` + `lib/text-geometry.mjs`）——逐行、逐样式 run 的真实几何 + ink 外溢检查，`minSize` 触底仍超即 `cancelRender`（`[TextFitError]`），文案必须改写而非静默缩到不可读。

### 3b. RAG Reindex（scene-data 就绪后自动触发）

```bash
node scripts/rag/index.mjs
```

> **非阻塞**：reindex 失败不阻塞 Stage 4 视频制作。Agent 输出警告并建议手动重跑。

---

## Stage 4: 视频制作

> **前置条件**：Stage 3 已完成（MRL-2 通过）。

`short-video-pipeline` skill 自动加载，`brand-system` skill 同时加载控制视觉一致性。

```bash
node scripts/short-video/main.mjs                    # TTS → Remotion 渲染 → 合成（不含 BGM）
```

> **BGM 不在 Stage 4 自动添加**。视频先以纯 VO 产出，BGM 在 Stage 5 HITL 确认后通过 `mix-bgm.mjs` 独立混入。

视频制作的技术细节（TTS 引擎、渲染参数、文件位置）见 `docs/video-workflow.md`。

> **云 GPU 资源**：当需要跑 CUDA 模型时，使用云 GPU 资源 pool。优先级和 fallback 规则见 `docs/research/digital-human-test-progress.md` → 「云 GPU 资源 Pool 与 Fallback」章节。

### 4b. RAG Reindex（多媒体素材）

视频制作完成后，如本管线下载了新素材或修改了 `assets/catalog.yml`，触发 RAG 增量重建。详见 `docs/media-asset-management.md` §2。

---

## Stage 5: 视频验证 + TikTok 发布

> **前置条件**：Stage 4 已完成（视频已制作）。

### 🔄 MRL-3: 视频自审（HITL 前置）

```bash
node scripts/short-video/verify-video.mjs --tiktok  # TikTok 合规检查 = MRL-3
```

> **Verify-retry loop**（`lib/verify-retry.mjs`）：Step 6 字幕验证失败后，自动分类失败类型并尝试对应修复。每次修复后重新验证，只接受严格减少 error 数的修复，否则回滚。`--max-retries N`（默认 2）控制重试上限。详见 `docs/archive/spec-verify-retry-loop.md`。

**MRL-3 Blockers**（verify-video.mjs 已覆盖）：视频文件有效、时长在 TikTok 60-70s 范围、分辨率/码率/编码合规、字幕文件存在且时间轴对齐、无黑屏/空帧。

**MRL-3 内容补充检查**（Agent 手动执行）：
- TTS 音频时长与 voiceover 估算一致（±5s）
- 字幕文本与 scene-data voiceover 一致（无 Whisper 识别误差导致的 "deep seeks" vs "DeepSeek's"）
- 品牌元素（logo、配色）符合 brand-system 规范

### ⏸️ HITL: 内容包成品审阅检查点

MRL-3 通过后，Agent **暂停**，执行以下步骤：

1. **输出 MRL-3 报告**（verify-video.mjs 合规报告 + 内容补充检查结果）
2. **输出视频文件路径**
3. **输出文章 draft 预览**（文章 markdown 全文）
4. **输出场景概览表**
5. **提示用户审阅要点**：实际观看视频检查整体观感、TTS 语音、字幕、视觉动画、Hook/CTA、有无渲染问题、文章内容准确性、脚本叙事合理性
6. **输出 TikTok 发布前最佳实践提醒** — 完整清单见 `docs/tiktok/tiktok-best-practices.md`。每次必输出，提醒用户发布时和发布后的操作（AIGC 标签、BGM、地理标签、Caption、Hashtag、Trending 检查、Pinned Comment、回复评论、监控数据等）。

   **📦 发布包**（Agent 从 generate-caption.mjs 输出中读取，直接给用户复制粘贴）：

   ```
   📋 Caption（复制粘贴到 TikTok 发布界面）
   [读取 output/tiktok-caption.txt 内容，原样输出]

   📌 Pinned Comment（发布后在评论区手动发这条，然后长按置顶）
   [读取 output/tiktok-pinned-comment.txt 内容，原样输出]
   ```

7. **BGM 选择与确认**（HITL 内）— Agent 自动执行：
   a. 从 BGM 池中按 pipelineId 确定性选择一个 CC-BY BGM（`lib/bgm.mjs` → `selectBGM`）
   b. 获取 TikTok trending sounds 并按内容关键词匹配（`trending-sounds.mjs --content <dir>`）
   c. 输出推荐（选项 A: 混入视频 CC-BY / 选项 B: TikTok trending sound / 选项 C: 不加 BGM）
   d. 等待用户选择 A / B / C
   e. 如选 A：执行 `node scripts/short-video/mix-bgm.mjs --video <path> --pipeline-id <id>`

8. **等待用户确认** — 用户说「视频 OK，发布」或类似确认语后才可执行发布

> **视频/脚本修改时的自动更新规则**：如果用户在 HITL 阶段要求修改视频或 scene-data，Agent 修改完成并重新渲染视频后，必须自动重新运行 `generate-caption.mjs` 以更新 Caption 和 Pinned Comment，然后重新输出发步包。

> **质量门控**：视频质量不达标时，Agent 应建议用户不发布而非强行发布。发布低质量内容会损害账号健康（见 `docs/tiktok/tiktok-best-practices.md` 账号健康管理章节）。

> **Content Publishing Red Lines**：不为发而发（低质量内容杀账号）；不一次用完所有素材（拆分多集更有价值）；不在低 ROI 内容上耗费过多时间（>2 pipeline reruns 需 flag）；不重新发布表现不佳的素材（算法记住 bad asset）。

### 发布（HITL 确认后执行）

#### 5a. 公开文章 + 上传源文件附件

```bash
node scripts/article/publish-article.mjs --file <path>
node scripts/article/upload-attachments.mjs --post <slug> --files <path1> [<path2> ...]
```

公开发布使用与 Stage 2 相同的文章文件，但不带 `--draft`。文章公开完成后再发布 TikTok。

#### 5b. TikTok 发布 + 自动保存 URL

```bash
node scripts/short-video/publish-tiktok.mjs --slug <slug>
```

> 发布后脚本自动轮询 Publora 获取 TikTok video ID，构造 URL 并保存到 `posts.tiktok_url`。

#### 发布后验证

访问 `/posts/{slug}` 确认：文章显示正常、widget 渲染正确、源素材附件完整、TikTok embed 正常显示。

### ⏸️ 用户手工操作检查点

发布后需要用户在 TikTok App 中手动完成：AIGC 标签、趋势音频、地理标签、pinned comment、回复评论。完整清单见 `docs/manual-ops.md` 的「每次发布视频时」部分。

发布成功后，脚本自动写入 `output/pending-analysis.json` 记录待分析状态。Analytics 是独立工作流，见 `docs/analytics-workflow.md`。

---

## 检查点总结

| 检查点                | 位置                           | 类型     | 谁操作 | 必须？          |
| --------------------- | ------------------------------ | -------- | ------ | --------------- |
| **🔄 MRL-1** 文章自审 | Stage 1（自审，不暂停）        | 机器循环 | Agent  | ✅ 必须         |
| 新 widget 部署        | Stage 2（文章准备时）          | 人工操作 | 用户   | 仅当有新 widget |
| **🔄 MRL-2** 脚本自审 | Stage 3（自审，不暂停）        | 机器循环 | Agent  | ✅ 必须         |
| 📚 RAG reindex（多媒体） | Stage 4b（视频制作后）       | 脚本执行 | Agent  | 仅当有多媒体素材变更 |
| **🔄 MRL-3** 视频自审 | Stage 5 → HITL 前              | 机器循环 | Agent  | ✅ 必须         |
| **HITL** 内容包成品审阅 | Stage 5 内部（验证后、公开前） | 人工确认 | 用户   | ✅ 必须         |
| 文章公开发布 + 附件上传 | Stage 5（HITL 确认后）         | 脚本执行 | Agent  | ✅ 必须         |
| TikTok 发布 + URL 保存 | Stage 5 HITL 确认后          | 脚本执行 | Agent  | ✅ 必须         |
| TikTok 手工操作       | Stage 5 之后                   | 人工操作 | 用户   | ✅ 必须         |
| Analytics 导出        | 独立工作流                     | 人工操作 | 用户   | 按需            |


---

## Design Decisions & References

| Topic | Reference | Content |
|-------|-----------|---------|
| Article production rules | `docs/article-production-guide.md` (L1) | Widget decision tree, Frontmatter format, MRL-1 checklist, claim verification, source citation |
| Script writing methodology | `docs/video-script-writing-guide.md` (L1) | S.T.A.R.T. primary framework + AI Outline HITL tool + retention engine, per-scene asset requirements, hook/CTA formulas, W7/W8/W9 narrative checks |
| Multi-video series | `docs/series-production-guide.md` (L1) | Split strategy, inter-episode linking, compilation, series publishing |
| New content scaffold | `docs/content-scaffold-guide.md` (L1) | Directory structure, file templates, CSS overflow checklist, visual style |
| Video production workflow | `docs/video-workflow.md` (L1) | TTS engines, rendering, publishing strategy, file paths |
| Media asset management | `docs/media-asset-management.md` (L1) | Asset placement rules, catalog & RAG integration, reindex trigger matrix |
| TikTok best practices | `docs/tiktok/tiktok-best-practices.md` (L2) | Signal weights, voice rules, hook formulas, audit checklist |
| Analytics workflow | `docs/analytics-workflow.md` (L1) | TikTok Analytics, CSV export, A/B testing, optimization loop |
| Script writing research | `docs/research/short-video-script-writing-best-practices.md` (L2) | 15+ sources — psychological retention engines, hook formulas |
| Multi-video splitting research | `docs/research/multi-video-splitting-best-practices.md` (L2) | 15 sources — TikTok algorithm analysis, episode linking |
| Article pipeline research | `docs/research/china-ai-article-pipeline-2026.md` (L2) | Content strategy, widget design, SEO |
