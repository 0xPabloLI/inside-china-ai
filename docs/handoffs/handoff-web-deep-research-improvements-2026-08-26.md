# Handoff: `web-deep-research` skill 改进

**日期**: 2026-08-26

**审阅状态**: 已修订

**来源 session**: VLM bug 调研 → 模型选型 → 发现 `web-deep-research` skill 使用问题

**目标文件**: `~/.agents/skills/web-deep-research/SKILL.md`、`~/.agents/skills/web-deep-research/references/angles.md`

**关联实现**: `scripts/rag/index.mjs`、`scripts/article/lib/publish-utils.mjs`

---

## 背景与范围

`web-deep-research` 是项目定制的全局用户级 skill，而非项目内文件。它整合了 deep-research 的八阶段方法、`web-access` 的检索委派，以及对可本地验证技术结论的源码检查。

> **审阅结论**：本 handoff 的方向合理，但原稿将全局 skill、项目级输出约定与项目 RAG 实现混在同一层，且 RAG reindex 的前提尚未满足。后续实现须先完成下表中的阻塞项，再将行为写入 Phase 8。

| 主题 | 审阅结论 | 实施约束 |
|---|---|---|
| 检索工具 | 应移除对 `web-access` 之外工具的硬编码禁令，但不应把 Brave 固化为 Phase 3 的唯一首选。 | `web-deep-research` 只委派；实际工具选择由 `web-access` 决定。 |
| 输出路径 | 应消除写入 `~/Documents/` 的遗留路径，但全局 skill 不应无条件假定每个仓库都有同一目录。 | 当前项目使用 `<repo>/docs/research/<topic>-research.md`；其他仓库遵循其显式约定或请求确认。 |
| RAG | 现有索引器尚未收集 `docs/research/`。仅触发重建不会索引新报告。 | 先扩展索引器及测试，再接入 Phase 8 的增量重建。 |
| 报告语言 | “始终中文”不适合全局 skill。 | 语言优先级为：用户明确要求 → 仓库约定 → 当前对话语言。 |

---

## 改进 1：让 `web-access` 决定检索路径

**现状**：Phase 3 要求先加载 `web-access`，但同时明确禁止 `jina_search`、`web_fetch`、`mcp-search-bridge`、Tavily 作为主要检索路径。该禁令与 `web-access` 已有的按任务选择 WebSearch、WebFetch、curl 或浏览器 CDP 的职责重叠，并把实现细节复制到上层 skill。

**问题**：原案将其描述为“只用 CDP”，不够准确；`web-access` 的职责本就是根据已知 URL、搜索发现、登录态、JavaScript 渲染和反爬限制选择路径。项目文档记录的是 **Brave Search API**，而非经确认的固定“Brave Search MCP”；在全局 skill 中绑定某个提供者会使配置变化后产生陈旧规则。

**改进**：Phase 3 保留唯一的委派规则：先加载 `web-access` 并遵循其当前检索策略。对于来源发现，允许它使用配置可用的 WebSearch／Brave Search API；对于已知页面，按其建议使用 WebFetch、curl 或 CDP；遇到登录态、交互、JavaScript 渲染或静态层失效时直接使用 CDP。

> **证据边界**：搜索结果摘要仅用于发现候选 URL，不能替代原始页面内容，也不能单独支撑报告中的事实性结论。最终引用仍须指向经提取和分级的原始来源。

---

## 改进 2：明确且可移植地解析输出路径

**现状**：Phase 8 使用 “Save where the repo keeps research notes”，并在无约定时退回 `docs/`；实践中因此出现 `docs/research/` 与 `~/Documents/` 两种落点。

**问题**：输出位置不可预测，且全局 skill 不应把本项目目录结构当作所有工作目录的普遍前提。

**改进**：将 Phase 8 的路径规则改为以下优先级。

| 优先级 | 条件 | 保存位置 |
|---|---|---|
| 1 | 当前仓库定义了研究文档目录 | 使用该目录；本项目固定为 `<repo>/docs/research/<topic>-research.md`。 |
| 2 | 当前仓库有 `docs/research/` 目录但没有更具体约定 | 使用 `<repo>/docs/research/<topic>-research.md`。 |
| 3 | 无法确定仓库约定或工作目录 | 在写入前请求用户确认；不再使用 `~/Documents/` 作为默认兜底。 |

文件名应采用稳定的 kebab-case topic slug。报告保存后，Phase 8 必须回报绝对或仓库相对路径。

---

## 改进 3：新增 ML／AI 模型选型角度模板

**现状**：`references/angles.md` 只有 TikTok、China AI／Tech Industry 和通用模板；模型选型需要临时从零组织调研角度。

**问题**：原稿用单一 `MMLU` 查询代表“Benchmark 性能”，不适用于所有模型类型。模型能力必须按任务和模态选择评测集；例如视觉模型应优先覆盖视觉理解、OCR、文档理解或视频能力，而非复用纯文本模型的单一指标。

**改进**：在 `angles.md` 增加 **ML/AI Model Selection** 模板。模板应从实际工作负载出发，并要求每个候选模型形成可比较的证据矩阵。

| 角度 | 搜索查询示例 | 首选信源与验证 |
|---|---|---|
| 任务匹配与 Benchmark | `[model] [target task] benchmark`；`[model] technical report` | 官方技术报告、模型卡、任务相关 leaderboard；记录评测集、版本、设置与日期。 |
| 真实工作负载评测 | `[model] [project workload] quality latency` | 项目样本上的可复现实测；记录硬件、运行时、量化、输入预处理与指标。 |
| Apple Silicon 与运行时 | `[model] MLX support`；`[model] llama.cpp GGUF`；`[model] Apple Silicon` | 运行时官方文档、模型仓库与本地 smoke test；区分“可下载”与“已在目标硬件可用”。 |
| 许可证与供应链 | `[model] license commercial use`；`[model] LICENSE` | 模型卡、仓库 `LICENSE`、上游权重和依赖许可证；记录商用限制、再分发限制与版本。 |
| 工具链与量化可用性 | `[model] 4bit MLX`；`[model] GGUF`；`[model] runtime support` | 官方／维护者仓库、量化发布页和本地加载测试；记录格式、量化方法与维护状态。 |
| 运行风险与维护性 | `[model] issue`；`[model] regression`；`[model] release notes` | 上游 issue、release notes、项目测试；区分已修复、可规避和未验证风险。 |

> **决策规则**：公开 benchmark 只构成候选筛选证据，不能替代目标硬件与真实工作负载上的实测。结论必须说明“为何适合当前任务”，并保留不确定性与未验证项。

---

## 改进 4：先使研究报告成为可索引来源，再接入 RAG

**现状**：报告写入 `docs/research/` 后，原案要求 Phase 8 调用 `triggerRagReindex()` 做增量索引。

**阻塞问题**：当前 `scripts/rag/index.mjs` 仅收集文章、scene-data、`docs/refs/source-materials/`、TikTok references 和资产目录；它**不收集 `docs/research/`**。因此即使执行增量 reindex，新研究报告也不会进入 RAG。

**改进**：将此项拆为两个有顺序的工作。

1. **先修改项目 RAG 实现**：向索引器增加 `docs/research/` 的 markdown collection、明确 `content_type`、去重／删除语义和测试覆盖；该代码变更须走仓库的实施流程。
2. **再修改 Phase 8**：仅当当前仓库确认 `docs/research/` 已被索引器收集，并且本次报告新建或更新时，从仓库根目录运行 `node scripts/rag/index.mjs`。默认使用其增量模式，失败应记录并告知用户，但不得使已完成的研究报告丢失。

不要在 skill 文案中直接调用 `triggerRagReindex()`：该函数是项目 `scripts/article/lib/publish-utils.mjs` 的模块导出，依赖 `projectRoot` 和调用上下文，并非全局 skill 可直接调用的 CLI。

---

## 改进 5：按请求与仓库约定确定报告语言

**现状**：输出模板为英文，skill 没有语言决策规则。

**问题**：该 skill 位于 `~/.agents/skills/`，可能在多个仓库使用；直接规定“报告正文用中文”会覆盖其他项目和用户的明确需求。

**改进**：在 Phase 8 规定以下语言优先级：

1. 用户明确指定语言时，按用户要求；
2. 未指定时，遵循当前仓库的文档语言约定；
3. 若仓库没有约定，则使用当前对话语言。

英文技术术语、命令、代码标识符、模型名称和原始引用可保留英文；引用的转述语言须与报告正文一致。

---

## 实施顺序与验收

| 顺序 | 待办 | 完成标准 |
|---|---|---|
| 1 | 确认 `web-deep-research` 仍是全局 user-level skill，且列出使用它的目标仓库。 | 文案不将本项目路径、RAG 或语言约定错误推广到其他仓库。 |
| 2 | 修改 SKILL.md Phase 3 为对 `web-access` 的单一委派，并删除上层工具禁令。 | 搜索发现、已知 URL、登录态与 JS 页面均由 `web-access` 的当前策略处理；搜索摘要不被作为证据。 |
| 3 | 修改 SKILL.md Phase 8 的输出路径与语言优先级。 | 本项目报告写入 `docs/research/<topic>-research.md`；无约定时会请求确认；不再写入 `~/Documents/`。 |
| 4 | 在 `references/angles.md` 添加 ML/AI Model Selection 模板。 | 模板包含任务匹配、实际 workload、硬件／运行时、许可证、量化／工具链和风险角度。 |
| 5 | 扩展 `scripts/rag/index.mjs` 以收集 `docs/research/`，并补充自动化测试。 | 新增、修改和删除研究报告在增量索引后分别新增、更新和清除对应 chunks。 |
| 6 | 在满足第 5 项后，将条件化、非阻塞的增量 reindex 写入 Phase 8。 | 更新研究报告会执行并回报 `node scripts/rag/index.mjs` 的结果；索引失败不会删除报告。 |
| 7 | 用一个真实的中文模型选型研究和一个非中文仓库／请求的研究做端到端验证。 | 两次输出分别遵从上述路径、语言和来源证据规则，且 RAG 行为符合仓库能力。 |

---

## 必须加载的技能

- `writing-for-agents`：修改全局 skill 的触发条件、步骤、规则或完成标准前加载。
- `grill-with-docs`、`to-spec`、`to-tickets`、`implement`、`tdd`：仅在实施第 5 项 RAG 索引器代码改动时，按仓库实施流程加载和执行。

---

## 审阅记录

本次审阅已完成跨章节一致性、指针目标存在性和引用文件存在性检查。已确认目标 skill、角度模板、项目 `docs/research/` 目录以及 RAG helper 均存在；同时确认当前 RAG 索引器未收集 `docs/research/`，因此将原先的直接 reindex 建议升级为明确的前置实现依赖。
