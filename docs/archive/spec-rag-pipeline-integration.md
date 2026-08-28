# Spec: RAG Pipeline Integration (#111)

**状态：** Approved — 可直接实施
**Issue：** #111
**依赖：** #15 done (RAG infrastructure), #103 done (content-pipeline.md offload)

## Problem Statement

Agent 写文章（Stage 1）和 scene-data（Stage 3）时只搜索实时互联网（`search-sources.mjs`），无法检索项目已积累的内容。这导致：
- 内容重复——同一公司/话题的不同角度被反复报道
- 缺少交叉引用——新文章不知道此前发过什么
- 上下文流失——写脚本时公司背景信息不在记忆中，需要重新搜索
- RAG 数据在 Supabase 中积累但从未被管线消费

## Solution

在 content-pipeline.md 的两个位置插入 RAG 查询步骤，使用现有 `scripts/rag/query.mjs` CLI（无需新代码）：

1. **Stage 0 末尾**：素材收集完成后、文章轨/视频轨分叉前，用"话题关键词 + 主要公司名"查 RAG，结果供 Stage 1 和 Stage 3 共享参考
2. **Stage 3 Step 1 之后**：读素材后、写脚本前，用"叙事角度 + 公司名"查已有 scene-data，避免重复角度

Agent 读取 RAG 结果后：
- **避免重复**：不在新内容中重复已有文章/视频的角度和数据
- **融入上下文**：在公司名出现时自然带入已有背景（如"ByteDance 旗下的 TikTok"），将已知信息融入 voiceover 脚本
- **可选交叉引用**：在文章中引用此前发布的相关文章（如"此前我们报道过 DeepSeek 的融资进展"）

Stage 2e 从管线步骤序列中移出，重新定位为"随时可用的工具"参考块。

## User Stories

1. As the content agent, I want to query RAG before writing an article, so that I know what has already been published on the same topic
2. As the content agent, I want to query RAG before writing scene-data, so that I avoid repeating angles from previous videos
3. As the content agent, I want to see company background context from previous articles, so that I can naturally incorporate it into voiceover scripts
4. As the content agent, I want RAG queries to be non-blocking, so that if Ollama is not running the pipeline continues without error
5. As the content agent, I want to query by content type, so that I can separately check articles, scene-data, and source materials
6. As a reader, I want articles to reference prior coverage when relevant, so that I can follow the narrative arc across pieces
7. As a reader, I want videos to have richer company context, so that I understand the background without needing to watch previous videos
8. As the content agent, I want the Stage 2e RAG query reference to remain available as a tool, so that I can query RAG at any point during content creation, not just at fixed pipeline steps

## Implementation Decisions

### ID1: Query positions

Two RAG query points in the pipeline:

- **Stage 0 末尾**（"Stage 0 完成 → 文章轨/视频轨分叉"的节点之前）：用 `话题关键词 + 主要公司名` 作为 query text。查 `--type article` 和 `--type source-material`。结果供 Stage 1 和 Stage 3 共享。
- **Stage 3 Step 1 之后**（"读 Stage 0 素材"之后、"确定叙事类型"之前）：用 `叙事角度 + 公司名` 作为 query text。查 `--type scene-data` 和 `--type article`。结果服务视频脚本写作。

### ID2: Query input construction

Agent 从 Stage 0 的 `discovery.json` 和提取的素材中提炼 query text：
- Stage 0 末尾：`话题关键词 + 主要公司名/实体名`（如 `"DeepSeek 估值 幻方量化"`）
- Stage 3 Step 1 后：`叙事角度 + 公司名`（如 `"DeepSeek 模型训练 芯片"`）

Agent 自行从素材中提炼，不强制格式。bge-m3 对中英文混合查询表现良好。

### ID3: Result consumption

Agent 读取 `query.mjs --format json` 的输出后：
- 在记忆中标注"已有相关内容"及其角度/数据点
- 生成文章/scene-data 时避免重复已有角度
- 在公司名出现时自然带入已有背景
- 可选在文章中添加交叉引用（如 markdown link 到已有文章 slug）
- 不持久化 RAG 查询结果到 `content/<slug>/`——查询是即时参考

### ID4: Degradation behavior

与 Stage 2d（RAG Reindex）的非阻塞规则完全一致：
- Ollama 未运行 → 跳过查询 + 输出警告 `⚠️ RAG query skipped: Ollama not running` → 继续管线
- `query.mjs` 执行失败（网络/Supabase 错误）→ 输出警告 `⚠️ RAG query failed: <error>, continuing without RAG context` → 继续管线
- RAG 库为空（第一篇内容）→ 返回空 JSON `[]` → Agent 正常继续生成，无需特殊处理

### ID5: Stage 2e repositioning

Stage 2e "RAG 查询"从管线步骤序列中移出。CLI 用法和 `content_type` 表格保留，重新定位为参考块（类似 Stage 0 中"与 RAG 的区别"注释块的定位），放在 Stage 2 区域末尾作为"随时可用的工具"。

### ID6: No new code

直接使用现有 `scripts/rag/query.mjs` CLI。不创建 wrapper 脚本。不修改 `query.mjs`。不修改 `publish-article.mjs`（已有 `triggerRagReindex()`）。

### ID7: Context type queries at each position

| 查询位置 | `--type` 参数 | 目的 |
|----------|-------------|------|
| Stage 0 末尾 #1 | `article` | 查已有文章，避免重复角度 |
| Stage 0 末尾 #2 | `source-material` | 查已有源素材，复用研究 |
| Stage 3 Step 1 后 #1 | `scene-data` | 查已有视频场景，避免重复叙事 |
| Stage 3 Step 1 后 #2 | `article` | 查文章 draft（如已就绪），获取公司背景 |

## Testing Decisions

### Testing approach

本 spec 是纯文档流程改动（修改 `content-pipeline.md`），不涉及新代码。测试方式：

1. **文档结构验证**：验证 `content-pipeline.md` 中 Stage 0 末尾和 Stage 3 Step 1 后确实新增了 RAG 查询步骤
2. **Stage 2e 重新定位验证**：验证 Stage 2e 不再作为管线步骤出现，而是作为工具参考块
3. **降级规则一致性验证**：验证新增步骤的降级描述与 Stage 2d 的非阻塞规则一致
4. **端到端行为验证**：在真实管线运行中验证 RAG 查询步骤被执行（如 Ollama 运行时查询返回结果，未运行时跳过+警告）

### Prior art

项目中类似的文档流程验证方式：#103（docs offload）使用 `grep` 验证文档结构和行数。本 spec 采用类似方式。

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `docs/content-pipeline.md` | Stage 0 末尾新增 RAG 查询步骤；Stage 3 Step 1 后新增 RAG 查询步骤；Stage 2e 从管线步骤改为工具参考块 | **Low** | 纯文档修改，不涉及代码逻辑。Stage 2e 位置调整不影响其 CLI 用法描述的正确性。新增步骤遵循已有非阻塞规则模式。下游消费者（Agent 按 pipeline 操作）获得更完整指引，不会 break 已有行为。 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | 第一篇内容（RAG 库为空），Stage 0 末尾查 RAG | `query.mjs` 返回 `[]`，Agent 正常继续生成，无特殊处理 | Low | 空数组是 `query.mjs` 已有的正常行为 |
| 2 | Ollama 未运行，Stage 0 末尾查 RAG | 跳过查询 + 输出 `⚠️ RAG query skipped: Ollama not running` + 继续管线 | Low | 与 Stage 2d 非阻塞规则一致 |
| 3 | Ollama 运行但 Supabase 连接失败，Stage 3 查 RAG | `query.mjs` 输出错误 + Agent 输出 `⚠️ RAG query failed: <error>, continuing without RAG context` + 继续管线 | Low | `query.mjs` 已有错误处理（process.exit(1)），Agent 捕获退出码后继续 |
| 4 | Stage 0 查 RAG 返回 3 篇已有文章（高置信度），Stage 1b 生成文章 | Agent 读结果后在记忆中标注已有角度，生成文章时避免重复，可选添加交叉引用 | Medium | Agent 需判断哪些角度已覆盖。缓解：RAG 结果含 `preview` 字段（200 chars），足以判断角度 |
| 5 | Stage 3 查 RAG 返回已有 scene-data，视频脚本写作 | Agent 读已有场景的 voiceover 文本，避免重复叙事结构，可融入公司背景 | Medium | 同 #4，Agent 用 `preview` 判断。缓解：`--type scene-data` 只返回场景数据 |
| 6 | Stage 0 和 Stage 3 用不同 query text 查 RAG，返回不同结果 | 正常行为——两个查询点是独立的，用不同关键词和 `--type` 过滤 | Low | 设计如此：Stage 0 查 article+source-material，Stage 3 查 scene-data+article |
| 7 | RAG 返回结果中包含当前正在写的文章 draft 自身（Stage 2b 保存 draft 后 reindex，Stage 3 查到） | Agent 识别 source_id 与当前 slug 一致，跳过该条结果 | Low | `query.mjs` 返回 `source_id` 字段，Agent 可比对 |
| 8 | Stage 2e 重新定位后，Agent 仍能在文档中找到 RAG CLI 用法 | Stage 2e 内容（CLI 命令 + content_type 表格）保留在 Stage 2 区域末尾的参考块中 | Low | 内容不变，只改定位。grep 验证 CLI 命令仍存在 |
| 9 | 用户提供的素材与已有 source-material 高度重叠 | RAG 查 `--type source-material` 返回已有素材，Agent 可复用而非重复提取 | Low | 这正是 RAG 查询的价值场景 |
| 10 | 多集系列（Part 1/2/3），Part 2 写脚本时查 RAG 返回 Part 1 的 scene-data | Agent 读 Part 1 的角度和叙事，在 Part 2 中避免重复，保持系列连贯性 | Low | `--type scene-data` + `--topics` 过滤可精确查同一话题 |

## Out of Scope

- Server function / API endpoint for RAG query（issue 明确排除）
- Automated content gap detection（Agent 自行判断，不做自动化检测）
- Analytics-driven retrieval（不接入 analytics 数据驱动查询）
- Multimodal retrieval（tracked in #21）
- RAG 查询结果持久化到文件（即时参考，不持久化）
- 强制交叉引用（Agent 可选添加，不设 MRL blocker 检查）

## Further Notes

- `query.mjs` CLI 已完整实现（`--type`, `--format json`, `--topics`, `--rerank`, `--threshold`, `--limit`），无需修改
- `publish-article.mjs` 已有 `triggerRagReindex()` 非阻塞调用，保存 draft 后自动 reindex
- CONTEXT.md 已有完整 RAG 术语（Embedding, Chunk, Vector Search, Reranker, Golden Query, Orphan Cleanup）
- 本 spec 不新增 CONTEXT.md 术语——RAG 查询是已有能力的管线集成，不是新概念
