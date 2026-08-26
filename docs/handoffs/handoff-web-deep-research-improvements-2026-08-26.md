# Handoff: web-deep-research skill 改进

**日期**: 2026-08-26  
**来源 session**: VLM bug 调研 → 模型选型 → 发现 web-deep-research skill 使用问题  
**关联文件**: `~/.agents/skills/web-deep-research/SKILL.md`, `~/.agents/skills/web-deep-research/references/angles.md`

---

## 背景

`web-deep-research` 是项目自己定制的 skill（不是 Matt Pocock 的 `deep-research`），已经整合了：
- deep-research 的 8-phase 方法论
- web-access CDP 做抓取
- 本地源码验证（grep / inspect.getsource / smoke test）

在 VLM 调研 session 中使用后发现 5 个改进点。

---

## 改进 1: Phase 3 工具优先级不匹配 CatPaw 环境

**现状**: SKILL.md Phase 3 写着 "DO NOT use built-in tools (jina_search, web_fetch, mcp-search-bridge, Tavily) as the primary retrieval mechanism"，要求只用 web-access CDP。

**问题**: CatPaw 中 Brave Search MCP 已配置且效果好（本次 session 验证），但 skill 明确禁止先用它。每次调研都被强制走 CDP，即使 Brave Search 能直接返回 snippet 结果。

**改进**: 把工具优先级改为分层 fallback——Brave Search MCP 做初步搜索发现 URL → web-access CDP 做需要 JS 渲染/登录态的页面抓取。不再一刀切禁止 Brave Search。

---

## 改进 2: 输出路径不明确

**现状**: Phase 8 写 "Save where the repo keeps research notes"，不够精确。

**问题**: 有时报告存到 `docs/research/`，有时存到 `~/Documents/`（deep-research 的默认路径残留）。

**改进**: 明确输出路径为 `docs/research/<topic>-research.md`。

---

## 改进 3: angles.md 缺少 ML/AI 模型选型模板

**现状**: `references/angles.md` 只有 TikTok 和 China AI 两个领域模板 + 通用模板。

**问题**: 做 VLM/LLM 模型选型调研时没有角度模板可用，从头生成角度。

**改进**: 新增 "ML/AI Model Selection" 角度模板，包含以下角度：

| 角度 | 搜索查询示例 | 关键信源 |
|------|-------------|---------|
| Benchmark 性能 | "[model] benchmark MMLU score" | HF Open LLM Leaderboard, Artificial Analysis |
| Apple Silicon 加速 | "[model] mlx support", "[model] apple silicon mps" | mlx-community, Ollama Library |
| 许可证 | "[model] license commercial use" | HuggingFace model card, LICENSE file |
| 社区工具链 | "[model] mlx-vlm support", "[model] llama.cpp gguf" | GitHub repos, Ollama Library |
| 量化版本可用性 | "[model] 4bit quantized mlx gguf" | HF mlx-community, Ollama Library, LM Studio |

---

## 改进 4: 缺少 RAG reindex 集成

**现状**: 报告生成后是独立产物，不进入项目 RAG 索引。

**改进**: Phase 8 完成后，如果报告存放在 `docs/research/` 下，触发 `triggerRagReindex()` 增量索引。

---

## 改进 5: 报告语言未指定

**现状**: SKILL.md 没有指定报告语言。输出模板是英文的。

**改进**: 明确"报告正文用中文，保留英文技术术语和引用原文"。

---

## 待办

- [ ] 修改 `~/.agents/skills/web-deep-research/SKILL.md` Phase 3 工具优先级（改进 1）
- [ ] 修改 SKILL.md Phase 8 输出路径（改进 2）
- [ ] 新增 `references/angles.md` ML/AI 模型选型模板（改进 3）
- [ ] 修改 SKILL.md Phase 8 加 RAG reindex 步骤（改进 4）
- [ ] 修改 SKILL.md 指定报告语言（改进 5）

---

## 建议技能

- `writing-for-agents` — 修改 skill 文档前加载
