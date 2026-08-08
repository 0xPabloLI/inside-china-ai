# RAG Pre-Work — Issue #15 前置工作计划

> GitHub Issue: [#15 — feat: RAG pipeline for content knowledge base](https://github.com/0xPabloLI/inside-china-ai/issues/15)
> 创建于 2026-08-07。本文档为 Issue #15 的前置工作拆分，支持跨 session 执行。
> 触发条件：20+ 文章或 10+ 视频脚本后正式启动 RAG 管线（视频脚本数 = 非空 scene-data 文件数）。
> 当前进度（2026-08-08 核实）：3 篇文章 + 7 个非空 scene-data（7 条 content 管线，根目录遗留文件已清理），**未达阈值**。

---

## 🔄 新 Session 接续指南

**已完成**：D1-D5 决策 ✅ · WP-10 技术方案 ✅ · WP-1 源素材格式标准化 ✅ · WP-2 公司档案 ✅ · WP-4 实体注册表 ✅ · WP-5 Widget 数据文档化 ✅ · WP-7 Frontmatter 扩展 ✅ · WP-8 TikTok PDF 结构化 ✅ · WP-11 Golden Query 评估集 ✅ · Slug 一致性修正 ✅

**待做（3 个 WP）**：

| 优先级 | WP | 说明 | 依赖 | 预估工作量 |
|--------|----|------|------|------------|
| ✅ 完成 | WP-1 | 源素材格式标准化（2 份唯一 PDF → 结构化 MD） | 无 | 1 session |
| ✅ 完成 | WP-2 | 中国 AI 公司基础档案（7 家） | 无 | 多 session |
| ✅ 完成 | WP-4 | 实体注册表（18 companies + 10 people + 26 models） | WP-2 | 0.5 session |
| ✅ 完成 | WP-5 | Widget 数据文档化（13 个 data 文件 → markdown） | 无 | 1 session |
| ✅ 完成 | WP-7 | 文章 Frontmatter 扩展（3 篇文章 topics/entities/sources） | WP-4 | 0.5 session |
| ✅ 完成 | WP-8 | TikTok 方法论 PDF 结构化（8 sections） | 无 | 1 session |
| ✅ 完成 | WP-11 | Golden Query 评估集（18 条，4 种用例） | WP-10 ✅ | 0.5 session |
| 🔄 进行中 | WP-6 | Scene-data Metadata 统一与补全（任务 3/4 完成，1/2/5 待做） | 无 | 1 session |
| 🟢 低 | WP-3 | 主题事件时间线文档 | WP-2 ✅ | 1 session |
| 🟢 低 | WP-9 | 素材索引文档 | WP-1/2/3/6 | 0.5 session |

**关键产出文档（新 session 必读）**：
1. 本文档（`docs/rag-prework.md`）— 总览 + 各 WP 任务清单
2. `docs/spec-rag.md` — 技术规格（schema、脚本设计、26 行场景矩阵）
3. `docs/tickets-rag.md` — 代码实施 tickets（Phase 1/2 gated，当前不需要）
4. `docs/adr/0007-rag-pipeline-decisions.md` — 6 个架构决策
5. `docs/refs/entity-registry.yaml` — 实体注册表（18 companies + 10 people + 26 models）
6. `docs/refs/rag-eval/golden-queries.yaml` — Golden Query 评估集（18 条）
7. `docs/refs/source-materials/widget-data/` — Widget 数据文档（13 个文件）

**遗留问题（新 session 需关注）**：

| # | 问题 | 关联 WP | 严重度 | 说明 |
|---|------|---------|--------|------|
| 1 | restraint-pt2 内容缺失 | WP-6 | 🟡 中 | `content/restraint/pt1/` 的 `nextPartSlug` 仍指向 `restraint/pt2`，但 pt2 目录不存在（内容缺失）。pt3 的 `prevPartSlug` 已置 null。不影响 RAG 索引，但 scene-data 系列链接断裂。 |
| 2 | WP-6 任务 1/2 延迟 | WP-6 | 🟡 中 | 用户此前决定推迟「定义扩展 meta.mjs 字段标准」和「回填扩展字段」——历史数据在实验阶段、管线变动中，RAG 实施前统一处理。任务 5（verify-video preflight 校验）为可选项。 |
| 3 | WP-3 未开始 | WP-3 | 🟢 低 | 4 个事件时间线文档未创建。依赖 WP-2 ✅ 已满足，可直接启动。产出路径：`docs/refs/source-materials/event-timelines/`。 |
| 4 | WP-9 未开始 | WP-9 | 🟢 低 | 素材索引文档未创建。依赖 WP-1 ✅ + WP-2 ✅ + WP-3（未完成）+ WP-6（部分完成）。可先做 Materials→Articles→Videos 和 Company Profiles 两个 section，Event Timelines section 标 TBD。 |

**新 session 工作流**：
1. 读本文档，查看「遗留问题」表和「待做」表
2. 选择要做的 WP（WP-3 和 WP-9 可直接启动，WP-6 需确认是否继续推进任务 1/2）
3. 读对应 WP 的任务清单（本文档内）
4. 执行任务，完成后更新 WP 状态标记（⏳ → ✅）
5. Commit + push

**Phase 1 代码实施**：当文章 ≥ 20 或 scene-data ≥ 10 时，读 `docs/tickets-rag.md` 从 T-10 开始。当前：3 篇文章 + 7 个 scene-data，**未达阈值**。

---

## ❓ 需要用户决策的项

以下事项需要用户确认后才能推进。每个 session 开始时 Agent 先检查是否有未决项，并扫描各 WP 的状态标记（⏳ 未开始 / 🔄 进行中 / ✅ 完成）。

### D1: Embedding 模型选型 ✅ 已确认

#### 你的调用频率有多高？

**极低。** 这是关键前提——你不是在做搜索引擎，是在做内容创作辅助。

| 场景 | 频率 | Token 数 |
|------|------|---------|
| 初始化知识库（一次性） | 1 次 | ~500K tokens（50 篇文章 + 所有素材/scene-data） |
| 新增 1 篇文章后重新索引 | ~每周 1-2 次 | ~3-5K tokens |
| 写文章前查询（Stage 1b 前置） | 每篇文章 5-10 次查询 | ~100 tokens/次 |
| 日常调试查询 | 偶尔 | ~100 tokens/次 |
| **月度总量** | — | **< 50K tokens**（初始化后） |

> 结论：任何方案的成本都趋近于零。选择标准应该是**质量 > 便利性 > 成本**。

---

#### 全面对比：四大类方案

##### 一、Ollama 本地模型（推荐首选）

你已安装 Ollama（用于 F5-TTS），直接 `ollama pull` 即可。Apple Silicon 上性能很好。

| 模型 | Ollama 命令 | 大小 | 维度 | 多语言 | 上下文 | 质量（MTEB） |
|------|-----------|------|------|--------|--------|-------------|
| **bge-m3** ⭐ | `ollama pull bge-m3` | 1.2GB | 1024 | ✅ 100+ 语言 | 8192 | 顶级（MIRACL 69.2） |
| nomic-embed-v2-moe | `ollama pull nomic-embed-text-v2-moe` | 958MB | 768 | ✅ ~100 语言 | 512 | 高（MIRACL 65.8） |
| qwen3-embedding | `ollama pull qwen3-embedding` | 0.6b/4b/8b | — | ✅ | — | 新模型，数据少 |
| mxbai-embed-large | `ollama pull mxbai-embed-large` | ~335MB | 1024 | ❌ 仅英文（不支持中文，本项目不可用） | 512 | 英文场景顶级 |
| snowflake-arctic-embed2 | `ollama pull snowflake-arctic-embed2` | 568MB | — | ✅ | — | 中高 |

**为什么推荐本地 bge-m3？**

1. **完全免费** — $0，无任何 API 调用费用
2. **多语言** — 你的源素材是中文，文章是英文，bge-m3 同时覆盖两者
3. **8192 上下文** — 一个 chunk 不超过 8K tokens 就不会被截断（nomic 只有 512）
4. **已有 Ollama** — 你已经装了 Ollama（TTS 管线用），无需额外安装
5. **离线可用** — 不依赖网络
6. **质量顶级** — MIRACL（多语言检索）排名第一（69.2 分，超过 OpenAI）；MTEB 综合平均分约 64.7（与 OpenAI text-embedding-3-large 的 64.6 持平）。MIRACL 比 MTEB 更贴切你的场景，因为 MTEB 以英文为主，而你的需求是中英混合检索。
7. **调用简单** — `curl http://localhost:11434/api/embed -d '{"model":"bge-m3","input":"text"}'`

> **BGE M3 是谁做的？** BAAI（北京智源人工智能研究院），中国顶级 AI 研究机构，由北京市政府支持。
> - BGE 系列时间线：BGE v1（2023-08）→ BGE v1.5（2023-09）→ **BGE-M3（2024-01）**，持续维护到 2024-07
> - BGE 系列是开源 embedding 领域引用最多的模型系列
> - BGE-M3 HF 页面原文："BGE-M3 achieves top performance in both English and other languages, surpassing models such as OpenAI"
> - 同时支持三种检索：dense（密集）、sparse（稀疏/类 BM25）、multi-vector（ColBERT），是唯一一个三合一模型
>
> **为什么不推荐更新的模型（如 Qwen3-Embedding）？** Qwen3-Embedding 确实更新（2025 年），但缺乏独立标准评测数据（MIRACL/MTEB），Ollama 上也较新。BGE M3 虽然发布于 2024 年，但在多语言检索上仍是第一名，且有 5.6M 下载量的社区验证。RAG 是基础设施工具，选经过验证的模型更稳妥。等 Qwen3-Embedding 有更多评测数据后，切换也很简单（维度可能不同，需重建索引，代码改动很小）。

**缺点**：
- 首次下载 1.2GB 模型（一次性）
- Apple Silicon CPU 推理速度：~100 chunks/分钟（初始化 500K tokens 约 5-10 分钟，完全可接受）
- 需保持 Ollama 服务运行（`ollama serve`）

##### 二、Cloudflare Workers AI（云端备选）

Cloudflare MCP 在用户级配置 `mcopilot_mcp_settings.json` 中已有（含 account ID `15ddc5147dd5883e27b5427c6db043d3`）。

| 模型 | ID | 价格/M tokens | 维度 | 多语言 |
|------|-----|-------------|------|--------|
| **bge-m3** | `@cf/baai/bge-m3` | $0.012 | 1024 | ✅ 100+ |
| qwen3-embedding | `@cf/qwen/qwen3-embedding-0.6b` | $0.012 | — | ✅ |
| bge-small-en | `@cf/baai/bge-small-en-v1.5` | $0.020 | 384 | ❌ |
| EmbeddingGemma | `@cf/google/embeddinggemma-300m` | — | — | ✅ |

- 免费额度：10,000 Neurons/天 ≈ 9.3M tokens/天
- Reranker：`@cf/baai/bge-reranker-base` $0.003/M tokens
- **实际月成本：< $0.01**（完全在免费额度内）

##### 三、国内云 API（更便宜但需注册）

| 服务商 | 模型 | 价格 | 多语言 | 维度 | 备注 |
|--------|------|------|--------|------|------|
| **阿里百炼** | text-embedding-v3 | ¥0.0007/千token（~$0.0001/M token） | ✅ 中英 | 1024 | 新用户有免费额度 |
| **阿里百炼** | text-embedding-v4 | 约 ¥0.0007/千token | ✅ | 1024 | 最新版 |
| 火山引擎（字节） | Doubao Embedding | 类似价位 | ✅ | — | 需火山引擎账号 |
| 百度千帆 | Embedding-V1 | ¥0.002/千token | ✅ | — | 稍贵 |
| 腾讯混元 | hunyuan-embedding | 类似价位 | ✅ | — | — |

- **阿里百炼是最便宜的**：$0.0001/M tokens，比 Cloudflare 便宜 120 倍（但绝对值都趋近于零）
- 支持 OpenAI 兼容 API 格式，调用方式简单
- 缺点：需注册国内云账号 + 实名认证

##### 四、Hugging Face Inference API

| 模型 | 推荐度 | 备注 |
|------|--------|------|
| BAAI/bge-m3 | ⭐⭐⭐ | 与 Ollama/Cloudflare 同一模型 |
| BAAI/bge-large-en-v1.5 | ⭐⭐ | 英文 only |
| nomic-ai/nomic-embed-text-v2-moe | ⭐⭐ | 多语言 |
| sentence-transformers/all-MiniLM-L6-v2 | ⭐ | 轻量但质量低 |

- Hugging Face 提供 Inference API（`https://api-inference.huggingface.co/pipeline/feature-extraction/{model}`）
- 免费用户有速率限制（适合测试，不适合生产）
- 也可以用 `sentence-transformers` 库直接在本地跑（同 Ollama 方案一）

---

#### 推荐方案：本地 Ollama bge-m3

| 维度 | 本地 Ollama bge-m3 | Cloudflare bge-m3 | 阿里百炼 v3 |
|------|-------------------|------------------|------------|
| 成本 | **$0 永久免费** | $0（免费额度内） | $0（免费额度内） |
| 质量 | 顶级（同一模型） | 顶级（同一模型） | 高（不同模型） |
| 多语言 | ✅ 100+ 语言 | ✅ 100+ 语言 | ✅ 中英 |
| 上下文 | 8192 tokens | — | — |
| 维度 | 1024 | 1024 | 1024 |
| 网络依赖 | ❌ 完全离线 | ✅ 需网络 | ✅ 需网络 |
| 初始化速度 | ~5-10 分钟 | ~1 分钟 | ~1 分钟 |
| 查询延迟 | ~0.5-1 秒 | ~0.2 秒 | ~0.3 秒 |
| 已有基础设施 | ✅ Ollama 已装 | ✅ CF MCP 已配 | ❌ 需注册 |
| Reranker | 本地 bge-reranker | `@cf/baai/bge-reranker-base` | 百炼 gte-rerank |

**推荐理由**：
1. 同一个 bge-m3 模型，质量完全一致
2. 你的调用频率极低（月度 < 50K tokens），本地推理速度完全够用
3. 永久免费，无任何额度担忧
4. 你已经装了 Ollama
5. 离线可用

**混合方案（如果需要）**：
- 日常用本地 Ollama bge-m3
- 如果需要 GPU 加速大批量初始化，临时切 Cloudflare（同模型，embedding 结果兼容）
- 如果需要 reranker，本地跑 bge-reranker 或用 Cloudflare `@cf/baai/bge-reranker-base`

---

#### 成本估算（所有方案）

| 场景 | 本地 Ollama | Cloudflare | 阿里百炼 |
|------|------------|-----------|---------|
| 初始化（500K tokens） | $0（5-10 分钟） | $0.006 | $0.05 |
| 每月新增（~50K tokens） | $0 | $0.0006 | $0.005 |
| 每月查询（~5K tokens） | $0 | $0.00006 | $0.0005 |
| **年总成本** | **$0** | **< $0.01** | **< $0.1** |

> **结论**：所有方案成本都趋近于零。选本地 Ollama bge-m3，因为免费 + 离线 + 已有基础设施 + 同一模型。

---

> **已确认**：采用本地 Ollama bge-m3。（2026-08-07 用户确认）

### D2: 向量存储选型 ✅ 已确认

**推荐：Supabase pgvector**

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Supabase pgvector** ⭐推荐 | 已有 Supabase 基础设施、RLS 保护、RPC 函数检索、无新依赖 | 需启用 pgvector extension |
| Cloudflare Vectorize | 与 Workers AI 同生态 | 需额外配置、Supabase 已有数据 |
| 本地（ChromaDB/LanceDB） | 无云依赖 | 跨 session 共享困难 |

**推荐理由**：项目已深度使用 Supabase（auth、posts 表、storage），pgvector 是 Postgres extension，启用后可直接在现有数据库中创建向量列。检索通过 RPC 函数（`match_content`），与现有 `createServerFn` 架构一致。RLS 确保未发布文章的 embedding 不被公开检索。

> **已确认**：采用 Supabase pgvector。（2026-08-07 用户确认；用户为 Supabase Pro plan，8GB 数据库容量，向量存储占用 < 0.1%）

### D3: 索引范围 ✅ 已确认

Issue #15 定义的 Phase 1 索引范围：
1. 已发布文章（Supabase `posts` 表）
2. Scene-data 文件（`scripts/short-video/content/**/scene-data.mjs`；根目录遗留 `scene-data-pt*.mjs` 已于 2026-08-08 清理：pt1/pt2 删除、pt3 迁移至 `content/restraint/pt3/`）

Issue 评论中建议增加：
3. 源素材（`docs/refs/source-materials/**/*.md`）

**建议额外索引**：
4. 调研报告（`docs/research/*.md`）— 如多视频拆分最佳实践
5. TikTok 参考库（`docs/refs/tiktok-skills/**/*.md`）— hook 公式、voice rules 等
6. Widget 源资料（`docs/refs/source-materials/widget-sources/*.md`）— 从 widget data 的 `sourceUrl`/`url` 字段自动提取并抓取的外部资料

> ⚠️ **Widget 数据索引策略修正（Grill Q11）**：Widget TS 文件本身**不直接索引**——它们是从外部资料中提炼的结构化数据，索引原始资料比索引派生数据更有价值且避免重复 embedding。索引流程增加 pre-step `scripts/rag/extract-widget-sources.mjs`，自动提取 widget 中的 source URL → 抓取内容 → 保存为 markdown → 正常索引。

> ⚠️ **Metadata 数据流约束（2026-08-07 已核实）**：`publish-article.mjs` 的 `buildPostPayload` 只同步 `title/slug/excerpt/content/published` 到 Supabase，WP-7 的 frontmatter 扩展字段（topics/entities/sources）**不会进入 posts 表**，posts 表也无对应列。因此索引器必须以 **markdown 文件为 metadata 的 source of truth**，Supabase posts 表仅用于 published 状态过滤（RLS join）。索引脚本中 `readArticles()` 的实现应读 `articles/*.md` + 用 posts 表校验发布状态，而非从 posts 表读 metadata。

> **已确认**：索引范围 1-6（全部）。（2026-08-07 用户确认；Q11 修正：widget-data → widget-sources）

### D4: Chunking 粒度 ✅ 已确认

| 内容类型 | Chunk 粒度 | Metadata |
|---------|-----------|----------|
| 文章 | 按 `##` 标题分 section | `article_slug, section_title, topics, entities` |
| Scene-data | 按 scene（含 voiceover + visual 描述） | `article_slug, part_number, scene_id, visual_type` |
| 源素材 | 按 `##` 标题分 section | `source_file, source_urls[], topic` |
| Widget 源资料 | 按 `##` 标题分 section | `source_file, source_urls[], widget_id` |
| 调研报告 | 按 `##` 标题分 section | `report_file, topic` |
| TikTok 参考 | 按 `##` 标题分 section | `skill_file, topic` |

> **已确认**：上述 chunking 粒度合适。（2026-08-07 用户确认）

### D5: 检索集成方式 ✅ 已确认

Agent 在写文章时如何调用 RAG？两个方案：

| 方案 | 方式 | 优点 | 缺点 |
|------|------|------|------|
| **A: 脚本 + Agent 调用** ⭐推荐 | 写 `scripts/rag/query.mjs`，Agent 在 Stage 1b 前运行 | 简单、可控、不侵入现有架构 | 需 Agent 手动调用 |
| B: Server fn + 客户端集成 | `createServerFn` 封装检索，admin editor 中显示推荐 | 实时推荐、UI 集成 | 开发量大、需前端改动 |

> ⚠️ **RLS 影响**：选方案 A 意味着检索仅 Agent/admin 使用，schema 预备案中的 anon 公开检索策略**不应启用**（见"数据库 Schema 设计"节），避免公开枚举 embedding chunk 的攻击面。

> **已确认**：先做方案 A（脚本 + Agent 调用）。（2026-08-07 用户确认）

---

## 内容资产盘点（截至 2026-08-08，已核实）

| 类型 | 数量 | 位置 | 格式 | RAG 就绪？ |
|------|------|------|------|-----------|
| 已发布文章 | 3 篇 | `articles/*.md` + Supabase `posts` | frontmatter markdown | ✅ 格式统一 |
| 源素材 | 3 份文件（2 份唯一） | `docs/refs/source-materials/` | 2 份唯一 PDF + 1 markdown | ❌ 2 份唯一 PDF 未结构化 |
| Scene-data | 7 个非空文件 | `scripts/short-video/content/` | JS 模块 | ⚠️ `meta.mjs` 约定已统一但字段稀疏（4-6 字段），需扩展（WP-6） |
| 调研报告 | 1 份 | `docs/research/` | markdown | ✅ |
| Widget 数据 | 13 个 | `src/components/widgets/*/data/*.ts`（6 个 widget 目录） | TypeScript 硬编码 | ✅ 有 sourceUrl/`url` 字段可供 extract-widget-sources.mjs 提取 |
| TikTok 参考库 | ~20 文件 | `docs/refs/tiktok-skills/` | markdown + PDF | ⚠️ 1 份 PDF 未结构化 |
| 实体注册表 | 无 | — | — | ❌ 不存在 |
| 事件时间线 | 散落 | 各文章/research 中 | — | ❌ 未独立 |

> 注：`china-llm-distillation-source.pdf` 与 `国内大模型蒸馏风波的来龙去脉(1).pdf` 原为 MD5 完全相同的重复拷贝（`03bf489b…`），重复文件已于 2026-08-08 删除（commit `20cc3a8`，保留英文文件名那份），源素材按 2 份唯一文件计。

---

## 工作拆分（按 Session）

每个 session 可独立完成一个 Work Package (WP)。WP 之间有依赖关系，但大部分可并行。每个 WP 标题带状态标记（⏳ 未开始 / 🔄 进行中 / ✅ 完成），跨 session 执行时先扫描状态。

### WP-1: 源素材格式标准化 📝 纯文档工作 ｜ 状态：✅ 完成

**目标**：将 2 份唯一 PDF 转为结构化 markdown，与 `bytedance-zhang-yiming-no-distillation-research.md` 格式一致。

**依赖**：无

**任务清单**：

| # | 文件 | 操作 | 预计 |
|---|------|------|------|
| 1 | `docs/refs/source-materials/梁文锋投资者交流会-录音转文本.pdf` | 读取 PDF → 提取关键信息 → 写 `deepseek-liang-investor-meeting-research.md` | 1 session |
| 2 | `docs/refs/source-materials/china-llm-distillation-source.pdf` | 读取 PDF → 提取关键信息 → 写 `china-llm-distillation-research.md` | 1 session |

> ⚠️ **已核实去重**（2026-08-07）：`国内大模型蒸馏风波的来龙去脉(1).pdf` 与 `china-llm-distillation-source.pdf` MD5 相同，为重复拷贝，任务清单已从 3 项减为 2 项。重复文件已于 2026-08-08 删除（commit `20cc3a8`，保留英文文件名那份）。

**输出格式**（每份文件遵循此模板）：

```markdown
# Research Summary: [Topic]

> Compiled [Date] from [N] sources.

## Sources

1. **[Publication]** — [URL] ([Date])
2. ...

## Key Facts

### [Topic Section 1]
- Fact with inline citation
- Fact with inline citation

### [Topic Section 2]
...

## Data Tables

### [Table Name]
| Col1 | Col2 | Col3 |
|------|------|------|
| ... | ... | ... |

## Timeline (if applicable)

| Date | Event |
|------|-------|
| ... | ... |
```

**RAG 价值**：结构化 markdown 可直接按 `##` 分 chunk，每个 chunk 带 source URL metadata。

---

### WP-2: 中国 AI 公司基础档案收集 🔍 调研工作 ｜ 状态：✅ 完成（2026-08-08，7 家全部建档）

**目标**：为 7 家主要中国 AI 公司建立结构化档案，作为多篇文章的共享数据源。

**依赖**：无（可与 WP-1 并行）

**输出目录**：`docs/refs/company-profiles/`（curated 档案与原始素材 `source-materials/` 分离，避免 WP-9 的"素材→文章追溯"语义混淆）

**任务清单**：

| # | 公司 | 优先级 | 已有数据？ | 输出文件 |
|---|------|--------|-----------|---------|
| 1 | DeepSeek | ⭐⭐⭐ | 部分散在文章/widget 中 | `docs/refs/company-profiles/deepseek-profile.md` |
| 2 | ByteDance/Seed | ⭐⭐⭐ | 部分在 bytedance research 中 | `bytedance-profile.md` |
| 3 | Moonshot/Kimi | ⭐⭐ | 部分在 widget 中 | `moonshot-profile.md` |
| 4 | MiniMax | ⭐⭐ | 部分在 widget 中 | `minimax-profile.md` |
| 5 | Alibaba/Qwen | ⭐⭐ | 无 | `alibaba-profile.md` |
| 6 | Baidu/ERNIE | ⭐ | 无 | `baidu-profile.md` |
| 7 | Huawei/昇腾 | ⭐ | 无 | `huawei-profile.md` |

**每份档案包含**：

```markdown
# Company Profile: [Company Name]

> Last updated: [Date]

## Basic Info
- Founded: [year]
- Founder: [name]
- Type: [AI Lab / Tech Giant / Startup]
- Valuation: [amount + source + date]
- Employees: [number + source]

## AI Division
- Team name: [e.g., Seed, DeepSeek]
- Consumer brand: [e.g., Doubao, DeepSeek]
- Enterprise API: [e.g., Volcano Engine]
- Open source strategy: [open-weight / closed / hybrid]

## Model Releases

| Date | Model | Type | Key Metrics | Source |
|------|-------|------|-------------|--------|
| ... | ... | ... | ... | [URL] |

## Funding History

| Date | Round | Amount | Valuation | Investors | Source |
|------|-------|--------|-----------|-----------|--------|
| ... | ... | ... | ... | ... | [URL] |

## Key People

| Name | Role | Joined | Previous | Source |
|------|------|--------|----------|--------|
| ... | ... | ... | ... | [URL] |

## Compute Infrastructure
- Chips: [model + quantity + source]
- Export restrictions: [status]
- Cloud: [provider]

## Notable Events
- [date]: [event] — [source]
```

**调研方式**：使用 `web-access` skill (CDP) 搜索中文和英文来源，交叉验证。

---

### WP-3: 主题事件时间线文档 📝 部分调研 ｜ 状态：⏳ 未开始

**目标**：将多篇文章反复引用的事件提取为独立时间线文档。

**依赖**：WP-2（公司档案中的数据可复用）

**任务清单**：

| # | 时间线 | 已有数据来源 | 输出文件 |
|---|--------|-------------|---------|
| 1 | US-China AI 蒸馏争端 | bytedance research + distillation 文章 | `docs/refs/source-materials/event-timelines/distillation-dispute-timeline.md` |
| 2 | 中国 AI 芯片出口管制 | bytedance research + deepseek 文章 | `chip-export-controls-timeline.md` |
| 3 | DeepSeek 发展时间线 | deepseek 文章 + widget | `deepseek-development-timeline.md` |
| 4 | 中国大模型基准测试排行榜 | 散落在文章正文 | `china-llm-benchmark-leaderboard.md` |

**每份时间线格式**：

```markdown
# Event Timeline: [Title]

> Last updated: [Date]. All events verified with source URLs.

## Timeline

| Date | Event | Source | Verification |
|------|-------|--------|-------------|
| 2023-04 | ByteDance issued internal anti-distillation rule | [Pekingnology](URL) | ✅ Verified |
| 2025-01 | DeepSeek R1 released | [Reuters](URL) | ✅ Verified |
| ... | ... | ... | ... |

## Key Actors
- [Company/Person]: role in this timeline

## Open Questions
- Unresolved aspects with ❌ Unverified status
```

---

### WP-4: 实体注册表 📝 纯文档工作 ｜ 状态：✅ 完成（2026-08-08）

**目标**：建立公司、人物、模型的实体注册表，用于 RAG entity linking 和 query expansion。

**依赖**：WP-2（公司档案中的实体信息）

**输出**：`docs/refs/entity-registry.yaml`

**格式**：

```yaml
# Entity Registry — for RAG entity linking & query expansion
# Last updated: [Date]

companies:
  deepseek:
    name: "DeepSeek"
    aliases: ["深度求索", "Deep Seek", "深度seek"]
    founded: "2023"
    founder: "liang_wenfeng"
    type: "AI Lab"
    status: "active"
    key_products: ["DeepSeek V3", "DeepSeek R1", "DeepSeek V4-Flash"]
    
  bytedance:
    name: "ByteDance"
    aliases: ["字节跳动"]
    ai_division: "Seed"
    consumer_brand: "Doubao"
    enterprise_api: "Volcano Engine"
    founder: "zhang_yiming"
    
  moonshot:
    name: "Moonshot AI"
    aliases: ["月之暗面", "Moonshot"]
    consumer_brand: "Kimi"
    founder: "yang_zhilin"
    
  minimax:
    name: "MiniMax"
    aliases: ["稀宇科技"]
    
  alibaba:
    name: "Alibaba"
    aliases: ["阿里巴巴"]
    ai_division: "Qwen Team"
    consumer_brand: "通义千问"
    
  baidu:
    name: "Baidu"
    aliases: ["百度"]
    ai_division: "ERNIE Team"
    consumer_brand: "文心一言"
    
  huawei:
    name: "Huawei"
    aliases: ["华为"]
    ai_division: "Pangu Team"
    chip_division: "Ascend"

people:
  liang_wenfeng:
    name: "Liang Wenfeng"
    aliases: ["梁文锋"]
    role: "DeepSeek Founder"
    
  zhang_yiming:
    name: "Zhang Yiming"
    aliases: ["张一鸣"]
    role: "ByteDance Founder"
    
  yang_zhilin:
    name: "Yang Zhilin"
    aliases: ["杨植麟"]
    role: "Moonshot AI Founder"

models:
  deepseek_r1:
    company: "deepseek"
    type: "reasoning"
    released: "2025-01"
    
  deepseek_v3:
    company: "deepseek"
    type: "LLM"
    released: "2024-12"
    
  deepseek_v4_flash:
    company: "deepseek"
    type: "LLM"
    released: "2026-04"
    
  seed_2_pro:
    company: "bytedance"
    type: "LLM"
    released: "2026-02"
    
  kimi_k3:
    company: "moonshot"
    type: "LLM"
    released: "2026-07"
    open_weight: true
```

**RAG 价值**：用户搜索「梁文锋」时能命中「Liang Wenfeng」的文章；按 company filter 检索。

---

### WP-5: Widget 数据文档化 📝 纯文档工作 ｜ 状态：✅ 完成（2026-08-08）

**目标**：将 13 个 widget data 文件（6 个 widget 目录）的硬编码数据文档化为 markdown 参考文件。

> **RAG 关联修正（Grill Q11）**：Widget data 不再为 RAG 索引而导出——索引流程改为自动提取 widget 中的 `sourceUrl`/`url`，抓取原始资料后索引。WP-5 本身仍有文档价值（记录数据来源和 curate 逻辑），但**不阻塞 RAG 实施**。

**依赖**：无

**输出**：`docs/refs/source-materials/widget-data/` 目录下 13 个 markdown 文件 ✅ 已创建

**每个文件格式**：

```markdown
# Widget Data: [Widget ID]

> Exported from `src/components/widgets/[path]/data/[file].ts`
> Widget type: [词云/时间线/对比表/矩阵/流程图]
> Last updated: [date from git log]

## Data

[将 TypeScript 数据结构转为 markdown 表格]

## Sources

- [URL 1]
- [URL 2]

## Related Articles

- [article slug 1]
- [article slug 2]
```

---

### WP-6: Scene-data Metadata 统一与补全 📝 纯文档工作 ｜ 状态：🔄 进行中（任务 3、4 已完成，2026-08-08）

**目标**：统一现有两种 metadata 约定，并为所有 meta 文件扩展丰富字段（topics/entities/dataPoints），改善 RAG 检索质量。

**依赖**：无

> ⚠️ **前提修正（2026-08-07 核实）**：每个 content 目录**已有**统一的 `meta.mjs`（`subject/pipelineId/title/article`，系列另有 `seriesId/partNumber`）——不存在"缺 metadata"，缺的是丰富字段。本 WP 采用**扩展 `meta.mjs`** 方案，**不**在 scene-data.mjs 内新增 `export const metadata`（避免引入第三种约定；根目录 pt3 的内联 `seriesMeta` 是第二种约定，一并收敛）。

**现状清单（已核实）**：

| 目录/文件 | meta.mjs | 对应文章 | 问题 |
|----------|----------|---------|------|
| `content/deepseek/` | ✅ | ~~`deepseek-funding-round`~~ → 应为 `deepseek-art-of-restraint` | **article slug stale，需修正**；字段稀疏 |
| `content/restraint/pt1/` | ✅ | `deepseek-art-of-restraint` (pt1) | 字段稀疏 |
| `content/distillation/pt1/` | ✅ | `china-llm-distillation-scandal` (pt1) | 字段稀疏 |
| `content/distillation/pt2/` | ✅ | `china-llm-distillation-scandal` (pt2) | 字段稀疏 |
| `content/distillation/pt3/` | ✅ | `china-llm-distillation-scandal` (pt3) | 字段稀疏 |
| `content/bytedance-distillation/` | ✅ | `bytedance-zhang-yiming-no-distillation` | 字段稀疏 |
| `content/restraint/pt3/` | ✅ | `deepseek-art-of-restraint` (pt3) | 字段稀疏（2026-08-08 由根目录遗留文件迁移而来，见任务 4） |
| ~~`scripts/short-video/scene-data-pt1.mjs`~~ | — | — | 已删除（2026-08-08，commit `20cc3a8`，原为空文件） |
| ~~`scripts/short-video/scene-data-pt2.mjs`~~ | — | — | 已删除（2026-08-08，commit `20cc3a8`，原为空文件） |
| ~~`scripts/short-video/scene-data-pt3.mjs`~~ | — | — | 已迁移至 `content/restraint/pt3/`（2026-08-08）；原 `prevPartSlug` 指向空的 pt2，restraint 系列 pt2 内容缺失（pt1 的 `nextPartSlug` 已置 null，pt2 留作未来任务） |

**任务清单**：

1. 定义扩展 `meta.mjs` 字段标准（在现有字段上增加 `totalParts/createdAt/topics/keyEntities/dataPoints`）
2. 为 6 个现有 `meta.mjs` 回填扩展字段
3. ✅ 已完成（2026-08-08）：修正 `content/deepseek/meta.mjs` 的 stale article slug（`deepseek-funding-round` → `deepseek-art-of-restraint`）
4. ✅ 已完成（2026-08-08）：删除空的 pt1/pt2（commit `20cc3a8`）；pt3 迁移至 `content/restraint/pt3/` 标准目录结构（meta.mjs + scene-data.mjs + scenes.mjs）。⚠️ **约定修正**：内联 `seriesMeta` 收敛进 **scene-data.mjs**（与 deepseek/restraint-pt1/distillation 等现有约定一致，`verify-video.mjs` preflight 从 scene-data 读取 seriesMeta），而非 meta.mjs（meta.mjs 仅承载文章级 metadata）。迁移同时修正了遗留数据 6 项 preflight fail（em-dash、AI 黑名单词、china 关键词 <2、来源归属 <2、数据点场景 <50%、字数 188>180），`verify-video.mjs --pre --content restraint/pt3` 现为 29 PASS / 1 WARN / 0 FAIL；scene-drift 测试已扩展覆盖 pt3（CTA id 10）
5. （可选）在 `verify-video.mjs` preflight 中校验 meta.mjs 必填字段

**扩展 meta.mjs 格式**：

```javascript
export const meta = {
  // ─── 现有字段（保留）───
  subject: "deepseek",
  pipelineId: "restraint-pt1",
  title: "The Art of Restraint — Part 1: Vision Over KPIs",
  article: "deepseek-art-of-restraint",
  seriesId: "deepseek-restraint",
  partNumber: 1,
  // ─── 扩展字段（新增）───
  totalParts: 3,
  createdAt: "2026-08-04",
  topics: ["DeepSeek", "funding", "Liang Wenfeng", "AGI"],
  keyEntities: {
    companies: ["DeepSeek", "Nvidia", "Huawei"],
    people: ["Liang Wenfeng"],
    models: ["DeepSeek V3", "DeepSeek R1"],
  },
  dataPoints: [
    "$1.4B funding round",
    "20K GPUs",
    "$0.14 per million tokens",
  ],
};
```

---

### WP-7: 文章 Frontmatter 扩展 📝 纯文档工作 ｜ 状态：✅ 完成（2026-08-08）

**目标**：为现有 3 篇文章的 frontmatter 预埋 RAG metadata 字段。

**依赖**：WP-4（实体注册表提供标准 entity ID）

**新增字段**：

```yaml
---
title: "..."
slug: "..."
excerpt: "..."
published: true
topics: ["DeepSeek", "distillation", "ByteDance"]
entities:
  companies: ["deepseek", "bytedance", "anthropic"]
  people: ["liang_wenfeng", "zhang_yiming"]
  models: ["deepseek_r1", "seed_2_pro", "kimi_k3"]
sources:
  - type: "pdf"
    file: "docs/refs/source-materials/梁文锋投资者交流会-录音转文本.pdf"
  - type: "url"
    url: "https://..."
---
```

> ✅ **Parser 兼容性已验证**（2026-08-07）：`publish-article.mjs` 使用 `gray-matter`，未知 frontmatter 字段直接忽略、不会报错；`buildPostPayload` 只映射 `title/slug/excerpt/content/published`，新字段不进 Supabase、不影响发布逻辑。原 ⚠️ 顾虑排除。
>
> ⚠️ **数据流约束**：正因新字段不进 Supabase，索引器必须以 markdown 文件为 topics/entities 的 source of truth（见 D3 的"Metadata 数据流约束"）。

---

### WP-8: TikTok 方法论 PDF 结构化 📝 纯文档工作 ｜ 状态：✅ 完成（2026-08-08）

**目标**：将 `docs/refs/tiktok-skills/raw/2026-08-05-自媒体实战方法论(1).pdf` (5368 行) 提取为结构化 markdown。

**依赖**：无

**输出**：`docs/refs/tiktok-skills/content-methodology.md`

**内容大纲**（需从 PDF 中提取）：

1. 品类战略（A/B/C 品类，已有部分在 content-pipeline.md）
2. 四层叙事公式（钩子 → 共情 → 获得感 → 升华，已有部分）
3. Hook 公式和案例
4. 内容节奏控制技巧
5. 账号冷启动策略
6. 其他品类方法（B: 社区短剧, C: 播客对谈）
7. 发布频率和时机
8. 评论区运营

---

### WP-9: 素材索引文档 📝 纯文档工作 ｜ 状态：⏳ 未开始

**目标**：建立素材 → 文章 → 视频 的追溯表。

**依赖**：WP-1, WP-6；Company Profiles / Event Timelines 两个 section 另需 WP-2, WP-3（若先完成 WP-9，这两节可暂标 TBD）

**输出**：`docs/refs/source-materials/INDEX.md`

**格式**：

```markdown
# Source Materials Index

> Last updated: [Date]

## Materials → Articles → Videos

| Source Material | Topic | Article | Video Parts | Status |
|----------------|-------|---------|-------------|--------|
| 梁文锋投资者交流会-录音转文本.pdf | DeepSeek 融资 | deepseek-art-of-restraint | restraint-pt1/2/3 | ✅ Published |
| china-llm-distillation-source.pdf | 蒸馏风波 | china-llm-distillation-scandal | distillation-pt1/2/3 | ✅ Published |
| bytedance-zhang-yiming-no-distillation-research.md | ByteDance 反蒸馏 | bytedance-zhang-yiming-no-distillation | bytedance-distillation | ✅ Published |

## Company Profiles

| Company | Profile File | Last Updated |
|---------|-------------|-------------|
| DeepSeek | docs/refs/company-profiles/deepseek-profile.md | — |
| ...

## Event Timelines

| Event | Timeline File | Last Updated |
|-------|-------------|-------------|
| US-China distillation dispute | event-timelines/distillation-dispute-timeline.md | — |
| ...
```

---

### WP-10: 技术方案文档 📝 纯文档工作 ｜ 状态：✅ 完成

**目标**：在 RAG 正式启动前，完成技术方案设计文档，到阈值时直接实施。

**依赖**：D1-D5 决策完成

**输出**：`docs/spec-rag.md` ✅ + `docs/tickets-rag.md` ✅ + `docs/adr/0007-rag-pipeline-decisions.md` ✅

**内容**：

1. Embedding 模型确认（基于 D1 决策，含凭证前置验证结果）
2. 向量存储确认（基于 D2 决策）
3. 索引范围确认（基于 D3 决策）
4. Chunking 策略（基于 D4 决策）
5. 检索接口设计（基于 D5 决策）
6. 数据库 schema（pgvector extension + embeddings 表 + RPC 函数）
7. 索引脚本设计（`scripts/rag/index.mjs`）
8. 查询脚本设计（`scripts/rag/query.mjs`）
9. Scenario & Risk Verification Matrix
10. 测试计划（引用 WP-11 的 golden query 评估集及通过标准）

---

### WP-11: 检索质量评估集（Golden Queries）📝 纯文档工作 ｜ 状态：✅ 完成（2026-08-08）

**目标**：建立 15-20 条 golden query → 期望命中 chunk 的映射，作为 RAG 上线后的质量回归基线。没有客观评估手段，检索质量只能靠感觉。

**依赖**：D3（索引范围）、WP-10

**输出**：`docs/refs/rag-eval/golden-queries.yaml`

**格式**：

```yaml
- query: "What did Liang Wenfeng say about AGI timelines?"
  expected_sources:
    - content_type: article
      source_id: deepseek-art-of-restraint
    - content_type: source-material
      source_id: deepseek-liang-investor-meeting-research
  notes: "英文 query 命中英文文章 + 中文源素材的结构化 chunk"

- query: "字节跳动内部反蒸馏规定是什么时候发布的？"
  expected_sources:
    - content_type: article
      source_id: bytedance-zhang-yiming-no-distillation
  notes: "中文 query — 跨语言检索用例"
```

**必须包含的用例类型**：

1. **跨语言检索**（英文 query → 中文源素材 chunk；中文 query → 英文文章 chunk）— bge-m3 选型的核心理由，必须实测验证，不能只看 benchmark
2. **Entity alias**（「梁文锋」→ 命中 "Liang Wenfeng" 文章）— 依赖 WP-4 实体注册表
3. **数据点检索**（具体数字，如 funding 金额、token 价格）
4. **负例**（知识库中不存在的话题，应返回低相似度/空结果）

**通过标准**：top-5 命中率 ≥ 80%（正式实施时写入 spec-rag.md 测试计划）。

---

## 依赖关系图

```
WP-1 (源素材格式化)     ──────────────┐
WP-2 (公司档案收集)     ───┐          │
WP-4 (实体注册表)       ←──┘ WP-2     │
WP-3 (事件时间线)       ←── WP-2      │
WP-5 (Widget 数据导出)  ──────────────┤
WP-6 (meta.mjs 扩展)   ──────────────┤
WP-7 (Frontmatter 扩展) ←── WP-4     │
WP-8 (TikTok PDF 结构化)──────────────┤
WP-9 (素材索引)         ←── WP-1,2,3,6│
                                      ↓
WP-10 (技术方案文档)    ←── D1-D5 决策
WP-11 (评估集)          ←── WP-10, D3
                                      ↓
                              [RAG 实施启动]
                              (20+ 文章或 10+ 视频)
```

**可并行**：WP-1, WP-2, WP-5, WP-6, WP-8 互不依赖，可同时进行。

---

## Embedding 模型详细对比

### Cloudflare Workers AI 可用模型

| 模型 | ID | 价格/M tokens | 维度 | 多语言 | Neurons/M |
|------|-----|--------------|------|--------|-----------|
| BGE-m3 | `@cf/baai/bge-m3` | $0.012 | 1024 | ✅ 100+ 语言 | 1,075 |
| Qwen3-Embedding | `@cf/qwen/qwen3-embedding-0.6b` | $0.012 | — | ✅ | 1,075 |
| BGE-small-en | `@cf/baai/bge-small-en-v1.5` | $0.020 | 384 | ❌ 英文 | 1,841 |
| BGE-base-en | `@cf/baai/bge-base-en-v1.5` | $0.067 | 768 | ❌ 英文 | 6,058 |
| BGE-large-en | `@cf/baai/bge-large-en-v1.5` | $0.204 | 1024 | ❌ 英文 | 18,582 |
| EmbeddingGemma | `@cf/google/embeddinggemma-300m` | — | — | ✅ 100+ | — |
| Plamo | `@cf/pfnet/plamo-embedding-1b` | $0.019 | — | ❌ 日文 | 1,689 |

**Reranker**：

| 模型 | ID | 价格/M tokens |
|------|-----|--------------|
| BGE-reranker-base | `@cf/baai/bge-reranker-base` | $0.003 |

> 注：以上模型可用性与价格基于 2026-08 调研，实施时以 Cloudflare 官方文档为准。`@cf/qwen/qwen3-embedding-0.6b` 的目录可用性未验证（方案 B 仅作备选）。

### Ollama 本地模型（推荐首选）

| 模型 | Ollama 命令 | 大小 | 维度 | 多语言 | 上下文 | 质量（MTEB） |
|------|-----------|------|------|--------|--------|-------------|
| **bge-m3** ⭐推荐 | `ollama pull bge-m3` | 1.2GB | 1024 | ✅ 100+ 语言 | 8192 | 顶级（MIRACL 69.2） |
| nomic-embed-v2-moe | `ollama pull nomic-embed-text-v2-moe` | 958MB | 768 | ✅ ~100 语言 | 512 | 高（MIRACL 65.8） |
| qwen3-embedding | `ollama pull qwen3-embedding` | 0.6b/4b/8b | — | ✅ | — | 新模型，数据少 |
| mxbai-embed-large | `ollama pull mxbai-embed-large` | ~335MB | 1024 | ❌ 英文 | 512 | 英文顶级 |
| snowflake-arctic-embed2 | `ollama pull snowflake-arctic-embed2` | 568MB | — | ✅ | — | 中高 |
| granite-embedding | `ollama pull granite-embedding` | 30m/278m | — | ✅(278m) | — | 中 |
| all-minilm | `ollama pull all-minilm` | 22m/33m | — | ❌ 英文 | — | 低 |

**调用方式**（Ollama REST API）：
```bash
# 单条
ollama embed --model bge-m3 --input "text to embed"

# API（batch 支持）
curl http://localhost:11434/api/embed -d '{"model":"bge-m3","input":["text1","text2"]}'
```

### sentence-transformers 本地模型（Python 方式，与 Ollama 互为备选）

| 模型 | 大小 | 维度 | 多语言 | 运行方式 | MTEB 排名 |
|------|------|------|--------|---------|-----------|
| BGE-m3 | ~2.3GB | 1024 | ✅ | `sentence-transformers` / `FlagEmbedding` | 顶级 |
| BGE-base-en-v1.5 | ~440MB | 768 | ❌ | `sentence-transformers` | 高 |
| BGE-small-en-v1.5 | ~130MB | 384 | ❌ | `sentence-transformers` | 中 |
| all-MiniLM-L6-v2 | ~90MB | 384 | ❌ | `sentence-transformers` | 低 |
| nomic-embed-text | ~270MB | 768 | ❌ | `sentence-transformers` | 中高 |

> Ollama 与 sentence-transformers 跑的是同一个 bge-m3 模型权重，embedding 结果一致。Ollama 更简单（无需 Python 环境），推荐优先用 Ollama。

### 成本估算（所有方案对比）

| 场景 | 本地 Ollama | Cloudflare | 阿里百炼 |
|------|------------|-----------|----------|
| 初始化（500K tokens） | $0（5-10 分钟） | $0.006 | $0.05 |
| 每月新增（~50K tokens） | $0 | $0.0006 | $0.005 |
| 每月查询（~5K tokens） | $0 | $0.00006 | $0.0005 |
| **年总成本** | **$0** | **< $0.01** | **< $0.1** |

> **结论**：所有方案成本都趋近于零。选本地 Ollama bge-m3，因为免费 + 离线 + 已有基础设施 + 同一模型。

---

## 数据库 Schema 设计（预备案）

正式实施时创建以下 Supabase migration：

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table
CREATE TABLE public.content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Content reference
  content_type TEXT NOT NULL CHECK (
    content_type IN ('article', 'scene-data', 'source-material', 'research', 'tiktok-ref')
  ),
  source_id TEXT,          -- article slug / file path / widget ID
  chunk_index INT NOT NULL DEFAULT 0,  -- section number within source
  
  -- Chunk content
  chunk_text TEXT NOT NULL,
  chunk_title TEXT,         -- section heading
  
  -- Metadata (JSONB for flexibility)
  metadata JSONB DEFAULT '{}',
  -- Common keys: topics[], entities{companies[], people[], models[]}, source_urls[], dates[]
  -- 注意：metadata->'topics' 必须是 JSON 字符串数组（match_content 的 ?| 操作符依赖此结构），
  -- 由索引脚本保证写入格式
  
  -- Embedding (bge-m3 = 1024 dimensions；若 D1 改选其他模型，维度需同步修改并重建索引)
  embedding vector(1024),
  
  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(content_type, source_id, chunk_index)
);

-- updated_at 自动更新（复用现有 public.set_updated_at()，命名遵循 <table>_set_updated_at 约定）
CREATE TRIGGER content_embeddings_set_updated_at
  BEFORE UPDATE ON public.content_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for similarity search (HNSW = fast approximate nearest neighbor)
CREATE INDEX content_embeddings_embedding_idx
  ON public.content_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Index for metadata filtering
CREATE INDEX content_embeddings_type_idx
  ON public.content_embeddings (content_type);
CREATE INDEX content_embeddings_source_idx
  ON public.content_embeddings (source_id);

-- RLS
ALTER TABLE public.content_embeddings ENABLE ROW LEVEL SECURITY;

-- ⚠️ anon 公开检索策略默认不创建：
-- D5 若选方案 A（脚本 + Agent 调用），检索仅 admin 使用；开放 anon SELECT 会暴露
-- embedding chunk + metadata 的公开枚举面。仅当未来做公开语义搜索功能时才启用：
--
-- CREATE POLICY "public search published articles"
--   ON public.content_embeddings FOR SELECT TO anon, authenticated
--   USING (
--     content_type = 'article'
--     AND EXISTS (
--       SELECT 1 FROM public.posts p
--       WHERE p.slug = content_embeddings.source_id
--         AND p.published = true
--     )
--   );

-- Admin can search all
CREATE POLICY "admin search all embeddings"
  ON public.content_embeddings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Only admin can insert/update/delete embeddings
CREATE POLICY "admin insert embeddings"
  ON public.content_embeddings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin update embeddings"
  ON public.content_embeddings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin delete embeddings"
  ON public.content_embeddings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Similarity search RPC function
-- 注意：不使用 SECURITY DEFINER，保持 security invoker 让 RLS 生效
CREATE OR REPLACE FUNCTION public.match_content(
  query_embedding vector(1024),
  filter_content_type TEXT DEFAULT NULL,
  filter_topics TEXT[] DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content_type TEXT,
  source_id TEXT,
  chunk_index INT,
  chunk_text TEXT,
  chunk_title TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id,
    e.content_type,
    e.source_id,
    e.chunk_index,
    e.chunk_text,
    e.chunk_title,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.content_embeddings e
  WHERE (filter_content_type IS NULL OR e.content_type = filter_content_type)
    AND (filter_topics IS NULL OR e.metadata->'topics' ?| filter_topics)
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY (e.embedding <=> query_embedding) ASC
  LIMIT match_count;
$$;
```

---

## 检索接口设计（预备案）

### 索引脚本：`scripts/rag/index.mjs`

```javascript
// 伪代码 — 正式实施时按 spec-rag.md 实现

// 1. 读取所有内容源
// 注意：文章的 topics/entities metadata 以 markdown 文件为 source of truth（见 D3），
// Supabase posts 表仅用于 published 状态校验
const articles = readArticles();        // articles/*.md（metadata）+ Supabase posts（发布状态）
const sceneData = readSceneData();      // scripts/short-video/content/**/scene-data.mjs + meta.mjs
const sourceMaterials = readSourceMaterials();  // docs/refs/source-materials/**/*.md
const widgetData = readWidgetData();    // src/components/widgets/*/data/*.ts
const research = readResearch();        // docs/research/*.md
const tiktokRefs = readTiktokRefs();    // docs/refs/tiktok-skills/**/*.md

// 2. Chunking
const chunks = [
  ...chunkArticles(articles),       // 按 ## 标题分
  ...chunkSceneData(sceneData),     // 按 scene 分
  ...chunkSourceMaterials(sourceMaterials),  // 按 ## 标题分
  ...chunkWidgetData(widgetData),   // 按 widget 分
  ...chunkResearch(research),       // 按 ## 标题分
  ...chunkTiktokRefs(tiktokRefs),   // 按 ## 标题分
];

// 3. Generate embeddings (Ollama bge-m3, 本地运行)
//    备选：Cloudflare bge-m3（同模型，embedding 结果兼容，切换只需改 embedding client）
for (const batch of chunkBatch(chunks, 100)) {
  const embeddings = await ollamaEmbed('bge-m3', batch.map(c => c.text));
  // 4. Upsert to Supabase
  await supabase.from('content_embeddings').upsert(
    batch.map((c, i) => ({
      content_type: c.type,
      source_id: c.sourceId,
      chunk_index: c.chunkIndex,
      chunk_text: c.text,
      chunk_title: c.title,
      metadata: c.metadata,  // topics 必须是 JSON 字符串数组（?| 操作符依赖）
      embedding: embeddings[i],
    }))
  );
}
```

### 查询脚本：`scripts/rag/query.mjs`

```javascript
// 伪代码
const query = process.argv[2] || "What have we said about DeepSeek?";

// 1. Generate query embedding (Ollama bge-m3)
const [queryEmbedding] = await ollamaEmbed('bge-m3', [query]);

// 2. Vector search
const results = await supabase.rpc('match_content', {
  query_embedding: queryEmbedding,
  match_threshold: 0.7,
  match_count: 10,
});

// 3. (Optional) Rerank with bge-reranker
if (results.data.length > 3) {
  const reranked = await ollamaRerank('bge-reranker-base', {
    query,
    documents: results.data.map(r => r.chunk_text),
  });
  // Reorder by reranker score
}

// 4. Output
for (const result of results.data) {
  console.log(`[${result.content_type}] ${result.chunk_title}`);
  console.log(`  Similarity: ${result.similarity.toFixed(3)}`);
  console.log(`  Source: ${result.source_id}`);
  console.log(`  ${result.chunk_text.slice(0, 200)}...`);
  console.log();
}
```

### Agent 集成点

在 `content-pipeline.md` 的 Stage 1b 步骤 1 之前增加：

```
### Stage 1b 前置：RAG 检索

Agent 在开始写文章前，先运行 RAG 检索：

\`\`\`bash
node scripts/rag/query.mjs "topic keywords"
\`\`\`

Agent 根据检索结果：
- 避免重复已有角度和数据点
- 发现可交叉引用的早期分析
- 找到可复用的 widget 数据
```

---

## Session 执行建议（已更新 2026-08-07）

> D1-D5 ✅ 已确认 · WP-10 ✅ 已完成。以下为剩余 WP 的建议执行顺序。

| Session | 建议完成 | 前置条件 | 状态 |
|---------|---------|---------|------|
| ✅ 已完成 | D1-D5 决策确认 | 无 | ✅ |
| ✅ 已完成 | WP-10 技术方案文档 | D1-D5 | ✅ |
| ✅ 已完成 | WP-1（源素材格式标准化） | 无 | ✅ |
| ✅ 已完成 | WP-2（公司档案，7 家） | 无 | ✅ |
| ✅ 已完成 | WP-5（Widget 数据文档化，13 个文件） | 无 | ✅ |
| ✅ 已完成 | WP-7 + WP-8（Frontmatter + TikTok PDF） | 无 | ✅ |
| ✅ 已完成 | WP-4 + WP-11（实体注册表 + Golden query） | WP-2 ✅ / WP-10 ✅ | ✅ |
| Session G | WP-6 剩余任务 1/2/5（meta.mjs 扩展） | 无 | 🔄 |
| Session H | WP-3（事件时间线文档） | WP-2 ✅ | ⏳ |
| Session I | WP-9（素材索引文档） | WP-1/2/3/6 | ⏳ |
| — | **Phase 1 代码实施**（读 `docs/tickets-rag.md`） | 20+ 文章或 10+ 视频脚本 + 全部 WP 完成 | ⏳ |

> WP-1/2/5/6/7/8 可并行。每个 session 完成后 commit + push，并更新对应 WP 的状态标记。

---

## 更新日志

| 日期 | 内容 |
|------|------|
| 2026-08-07 | 创建文档，完成 embedding/向量存储调研，列出 WP-1~10 |
| 2026-08-07 | Review 修正：① WP-1 去除重复 PDF（MD5 相同），任务 3→2 ② WP-6 重写：改为扩展现有 `meta.mjs` 约定，清单按核实结果重写（根目录 pt1/pt2 为空文件、pt3 为遗留，`content/deepseek/meta.mjs` article slug stale）③ 修正盘点计数（widget 15→13、scene-data ~11→9/7 非空），明确触发条件度量口径 ④ D3/WP-7 明确 metadata 数据流（markdown 为 source of truth；gray-matter 兼容性已验证）⑤ D1 增加 Cloudflare 凭证前置验证（仓库内无证据）⑥ Schema 默认 admin-only（anon 策略注释保留）+ 复用 `set_updated_at()` trigger ⑦ WP-9 补依赖 WP-2/3 ⑧ 新增 WP-11 golden query 评估集（含跨语言用例）⑨ WP-2 输出移至 `docs/refs/company-profiles/` ⑩ 各 WP 加状态标记 |
| 2026-08-07 | D1 重写：推荐方案从 Cloudflare 改为本地 Ollama bge-m3（同一模型，免费+离线+已有 Ollama 基础设施）。新增调用频率分析、Ollama 模型对比表（含 nomic-embed-v2-moe/qwen3-embedding/mxbai-embed-large 等）、国内云 API 对比（阿里百炼/火山引擎/百度/腾讯）、Hugging Face Inference API、全方案成本估算表。更新伪代码 embedding 调用从 Cloudflare 改为 Ollama。 |
| 2026-08-07 | D1-D5 全部确认（用户 Supabase Pro plan，8GB 数据库；存储估算 < 0.1%）。D1-D5 状态标记从 ⏳ 改为 ✅。文档可直接作为 Execution session 的执行依据。 |
| 2026-08-07 | Grill 技术方案（4 轮 19 问）：① Q1 索引触发改为 Hybrid 全量重建（发布自动触发 + 手动触发）② Q2 模型迁移用版本化表 ③ Q3 metadata 双重验证（CHECK + 应用层）④ Q4 超限 chunk 按段落细分 ⑤ Q5 topics 应用层标准化（小写）⑥ Q6 认证复用 loginAdmin()（无 service_role key）⑦ Q8 reranker 默认关 ⑧ Q11 widget data 不直接索引，改为提取 sourceUrl 抓取后索引 ⑨ Q12 scene-data 仍索引 ⑩ Q15 更新 CONTEXT.md + 创建 ADR-0007 ⑪ Q16 脚本目录 scripts/rag/ ⑫ Q17 RPC SECURITY INVOKER + COALESCE ⑬ Q18 UPSERT 幂等 ⑭ Q19 预检查 Ollama + 跳过失败 chunk。产出 spec-rag.md（含 26 条场景矩阵）+ tickets-rag.md（15 tickets，Phase 0 文档 + Phase 1/2 代码）+ ADR-0007 + CONTEXT.md RAG 术语。D3 索引范围修正：去掉 widget-data，加 widget-sources。WP-10 标记 ✅。 |
| 2026-08-08 | WP-1 完成：① 删除重复 PDF（`国内大模型蒸馏风波的来龙去脉(1).pdf`，与 `china-llm-distillation-source.pdf` MD5 相同）② `梁文锋投资者交流会-录音转文本.pdf` → `deepseek-liang-investor-meeting-research.md`（~1970 words，5 个 ## section，12 个 ### 子节，含 AGI 路线图/算力资源/定价逻辑/Huawei 合作/TileLang 等）③ `china-llm-distillation-source.pdf` → `china-llm-distillation-research.md`（~2080 words，6 个 ## section，13 个 ### 子节，含加密 CoT 破解/Anthropic 指控/各厂蒸馏时间线/Kimi K3 刷分/技术附录）。两文件均遵循 bytedance research MD 模板，含 Sources/Key Facts/Data Tables/Timeline/Cross-References。WP-6 推迟（用户决定：历史数据在实验阶段，管线变动中，RAG 实施前统一处理）。 |
| 2026-08-08 | WP-6 任务 3、4 完成：① `content/deepseek/meta.mjs` article slug 修正（`deepseek-funding-round` → `deepseek-art-of-restraint`）② 根目录遗留 scene-data pt3 迁移至 `content/restraint/pt3/` 标准结构（meta.mjs + scene-data.mjs + scenes.mjs；seriesMeta 收敛进 scene-data.mjs，符合现有约定）；随迁移修正 6 项 preflight fail（em-dash、AI 黑名单词、china 关键词、来源归属、数据点、字数 188→179），`verify-video --pre` 29 PASS/1 WARN/0 FAIL，scene-drift 扩展覆盖 pt3 ③ 盘点表/触发条件更新（源素材 4→3 份、scene-data 9→7 非空，重复 PDF 删除与 pt1/pt2 空文件删除见 commit `20cc3a8`）。遗留项：restraint-pt2 内容缺失（pt1 的 nextPartSlug 已置 null，pt2 留作未来任务）。 |
| 2026-08-08 | 遗留引用清理：① distillation pt1-3 的 `prevPartSlug`/`nextPartSlug` 由已删除的 `scene-data-pt*.mjs` 改为标准 `distillation/ptN` 路径 ② restraint pt1 `nextPartSlug` 置 null（pt2 未创建，留作未来任务）③ `docs/content-pipeline.md`（多集结构说明、pipeline-status 示例、HITL-2 残留、main.mjs CLI）与 `docs/video-workflow.md`（Plan B 命令）更新为当前约定 ④ `compile-series-reconstruct.mjs` next-step 提示修正 ⑤ `deepseek-liang-investor-meeting-research.md` 场景位置引用修正 |
| 2026-08-08 | WP-2 完成：7 家中国 AI 公司档案全部建档（DeepSeek、ByteDance、Moonshot/Kimi、MiniMax、Alibaba/Qwen、Baidu/ERNIE、Huawei/Ascend）。输出到 `docs/refs/company-profiles/`。ByteDance 档案含 Platform Context 章节（TikTok 关系）。`content-pipeline.md` Stage 1b/3 增加公司档案查阅规则。数据来源：现有文章/widget/research docs + Wikipedia 交叉验证。WP-4（实体注册表）和 WP-3（事件时间线）的前置依赖已满足，可启动。 |
| 2026-08-08 | WP-4/7/8/11 完成 + Slug 一致性修正（commit `747a122`）：① Slug 修正：DB slug `deepseek-leaked-investor-meeting` → `deepseek-art-of-restraint`；3 个 distillation meta.mjs article 字段 `china-llm-distillation-scandal` → `china-llm-distillation-storm` ② WP-4：创建 `docs/refs/entity-registry.yaml`（18 companies + 10 people + 26 models，snake_case ID 约定） ③ WP-7：3 篇文章 frontmatter 扩展（topics 全小写、entities 用 entity-registry ID、sources 含 PDF/URL 引用） ④ WP-8：`docs/refs/tiktok-skills/content-methodology.md`（10 页 PDF → 8 个 ## section 结构化 markdown） ⑤ WP-11：`docs/refs/rag-eval/golden-queries.yaml`（18 条 query，覆盖跨语言 5 + entity alias 4 + 数据点 5 + 负例 3 + 方法论 3）。tsc 通过，preflight 27 PASS/1 FAIL（预存 hook contract 问题，与本次修改无关）。Spec/tickets 已归档至 `docs/archive/`。 |
| 2026-08-08 | WP-5 完成：13 个 widget data 文件文档化，输出到 `docs/refs/source-materials/widget-data/`。覆盖 6 个 widget 目录（deepseek × 5、deepseek-agi-roadmap、deepseek-api-pricing、deepseek-oss-comparison、deepseek-vision、distillation × 4）。每个文件含 Data（TS 数据结构转 markdown 表格）、Sources（含 explicit sourceUrl/url 的原文链接）、Related Articles（文章嵌入状态）。盘点：5 个 deepseek core widget 未嵌入文章（cloud/talent/funding/pricing/companies + agi-roadmap/vision-keywords），7 个 widget 嵌入 3 篇文章（oss-comparison + api-pricing → deepseek-art-of-restraint；news-coverage → distillation-storm + bytedance；benchmark/identity-bleed/moonshot-funding/minimax-stock → distillation-storm）。RAG 关联：widget data 不直接索引，extract-widget-sources.mjs 提取 sourceUrl 后索引原始资料（Grill Q11 决策不变）。 |
