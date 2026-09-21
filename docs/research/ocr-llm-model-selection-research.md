# Deep Research: OCR 代码审查最佳纯文本 LLM 选型

## Executive Summary

针对 alibaba/open-code-review (OCR) 代码审查工具的 LLM 选型需求（必须支持 function calling/tools、强代码理解、可在 M2 Pro 32GB 本地运行），对 Ollama 平台 2026 年 9 月所有支持 tools 的模型进行了系统调研。

**结论：`qwen3.6:27b-mlx` 是最佳选择。** 它在 SWE-Bench Verified（代码 bug 发现与修复基准）上得分 77.2，在同类 27B-30B 模型中排名第一；有 MLX 版本专为 Apple Silicon 优化（19GB，32GB 机器可跑）；2 周前发布，6.7M 下载量，是 Ollama 上最受欢迎的 tools 模型。

**备选：`muse-glimmer:30b-mlx`**（Meta 出品，工具调用基准 MCP Atlas 得分 75.5 远超 Qwen3.6 的 62.5，内置失败恢复机制适合 OCR 多次 API 调用场景）和 **`ornith:9b`**（仅 5.6GB，速度快，纯文本，MIT 许可，适合快速扫描）。

## 关键约束

| 约束 | 要求 |
|------|------|
| Function calling (tools) | 必须 — OCR review agent 通过 tool_calls 调用 |
| 代码理解能力 | 强 — 需识别 bug、安全问题、代码异味 |
| 本地运行 | M2 Pro 32GB — 模型需 ≤20GB（留 OS 余量） |
| 速度 | 重要 — 扫描 155+ 文件，每文件需在 2 分钟内完成 |
| 纯文本 | 代码审查只喂文本，vision 能力无关紧要 |

## 候选模型全面对比

### 可本地运行的 tools 模型（按代码审查相关性排序）

| 模型 | 参数 | 大小 | MLX 版 | 更新 | 下载量 | 许可证 | SWE-Bench Verified | SWE-Bench Pro | MCP Atlas |
|------|------|------|--------|------|--------|--------|-------------------|---------------|-----------|
| **qwen3.6:27b** | 27B | 18GB | 19GB ✅ | 2 周 | 6.7M | Qwen Community | **77.2** | 50.2 | 62.5 |
| **muse-glimmer:30b** | 30B | 18GB | 19GB ✅ | 3 周 | 220K | Apache 2.0 | 76.0 | **51.2** | **75.5** |
| **qwen3.8:27b** | 27B | 18GB | 18GB ✅ | 1 月 | 2.3M | Qwen Community | — | 61.7* | — |
| **ornith:9b** | 9B | 5.6GB | ❌ | 2 月 | 515K | MIT | — | — | — |
| **nemotron-3.5-lightning** | 30B MoE (3B active) | 25GB | 23GB ✅ | 2 周 | 175K | NVIDIA | — | — | — |
| **granite4.1:8b** | 8B | 5.3GB | ❌ | 4 月 | 456K | Apache 2.0 | — | — | — |
| **granite4.1:30b** | 30B | 17GB | ❌ | 4 月 | 456K | Apache 2.0 | — | — | — |

*qwen3.8:27b 的 SWE-Bench Pro 61.7 来自 qwen3.8-flash-next 对比表，非 Meta 官方对比。

### 仅 Ollama Cloud 的 tools 模型（不可本地运行）

| 模型 | 参数 | 备注 |
|------|------|------|
| glm-5.3 | cloud | Z.ai 旗舰，"most capable open-weights for coding" |
| glm-5.3-flash | 18B active, cloud | "approaching Claude Opus 4.8" |
| deepseek-v4-flash | cloud | 1M context, 466K pulls |
| deepseek-v4.1-flash | cloud | 最新 DeepSeek |
| glm-5.1 | cloud | "agentic engineering" |
| kimi-k2.7-code | cloud | "coding-focused agentic" |

### 超出硬件能力的模型

| 模型 | 大小 | 原因 |
|------|------|------|
| qwen3.8-flash-next:125b-mlx | 105GB | 125B MoE，需 105GB MLX |
| qwen3.6:35b | 23-24GB | 35B，32GB 机器余量不足 |
| ornith:35b | 21GB | 35B，偏大 |
| mistral-medium-3.5 | 128B | 远超本地能力 |

## 核心基准对比（Meta 官方：Muse Glimmer vs Qwen3.6 vs Gemma4）

Meta 在 Muse Glimmer 发布时提供了三方对比，这是目前最权威的同类模型直接对比：

### 代码审查相关基准

| 基准 | Muse Glimmer-30B | Qwen3.6-27B | Gemma4-31B | 胜者 |
|------|-----------------|-------------|------------|------|
| **SWE-Bench Verified** | 76.0 | **77.2** | 66.6 | Qwen3.6 |
| **SWE-Bench Pro** | **51.2** | 50.2 | 36.9 | Muse Glimmer |
| **TerminalBench 2.1** | 51.7 | **60.7** | 43.4 | Qwen3.6 |
| **SciCode** | **43.6** | 39.8 | 43.4 | Muse Glimmer |

### 工具调用相关基准

| 基准 | Muse Glimmer-30B | Qwen3.6-27B | Gemma4-31B | 胜者 |
|------|-----------------|-------------|------------|------|
| **MCP Atlas** | **75.5** | 62.5 | 54.2 | Muse Glimmer |
| **DeepSearch QA** | **74.6** | 71.1 | 61.7 | Muse Glimmer |
| **τ3-Banking** | **23.5** | 16.7 | 15.1 | Muse Glimmer |
| **WildClawBench** | **47.6** | 43.2 | 37.6 | Muse Glimmer |
| **Toolathlon Verified** | **73.5*** | 67.1*** | — | Qwen3.8-Flash-Next |

*Toolathlon 来自 qwen3.8-flash-next 对比表，非 Meta 官方对比。

### 分析

- **Qwen3.6 在代码 bug 发现/修复（SWE-Bench Verified）和代码操作（TerminalBench）上更强** — 这正是 OCR 代码审查的核心任务
- **Muse Glimmer 在工具调用可靠性（MCP Atlas）和多步 agentic 任务上更强** — OCR 的 review agent 大量依赖 tool_calls，这也很重要
- **Gemma4 全面落后**，不推荐

## 各候选深度分析

### 1. qwen3.6:27b-mlx — 综合最佳

- **代码审查能力**：SWE-Bench Verified 77.2（同类第一），TerminalBench 60.7（同类第一）
- **Apple Silicon 优化**：有 MLX 版本（`qwen3.6:27b-mlx`），19GB，Ollama MLX 引擎在 M2 Pro 上性能最优
- **社区验证**：6.7M 下载量，Ollama tools 类模型第一名
- **更新**：2 周前发布，最新
- **特色**：agentic coding 升级、thinking preservation、256K context
- **集成**：官方支持 Claude Code、OpenCode、Hermes Agent、OpenClaw
- **劣势**：MCP Atlas 62.5（工具调用不如 Muse Glimmer），Qwen Community License 非完全开源

### 2. muse-glimmer:30b-mlx — 工具调用最佳

- **工具调用能力**：MCP Atlas 75.5（远超 Qwen3.6 的 62.5），内置失败恢复机制
- **失败恢复**：tool call 失败时自动诊断重试 — 对 OCR 扫描多文件场景极有价值
- **Apple Silicon 优化**：有 MLX 版本（`muse-glimmer:30b-mlx`），19GB
- **许可**：Apache 2.0，完全开源
- **来源**：Meta Superintelligence Labs，品牌可信度高
- **劣势**：220K 下载量（远少于 Qwen3.6 的 6.7M），SWE-Bench Verified 76.0 略低于 Qwen3.6

### 3. ornith:9b — 速度最佳

- **大小**：5.6GB，M2 Pro 上可秒级加载
- **纯文本**：唯一纯文本模型（无 vision），tools only
- **许可**：MIT，最宽松
- **定位**："self-improving family for agentic coding"，SWE-Bench/Terminal-Bench SOTA for size
- **劣势**：9B 参数量可能遗漏复杂 bug，2 个月前发布（较旧），无 MLX 版，无 thinking

### 4. nemotron-3.5-lightning — MoE 高吞吐

- **架构**：30B MoE，3B active — 推理速度快（NVIDIA 称 4x throughput）
- **大小**：23GB MLX — 32GB 机器可跑但余量极小
- **纯文本**：Text only，1M context window
- **劣势**：25GB GGUF 偏大，代码基准数据缺失，175K 下载量

### 5. granite4.1:8b — 企业备选

- **大小**：5.3GB，快速
- **许可**：Apache 2.0，企业-ready
- **能力**：function calling、code tasks、FIM、RAG
- **劣势**：4 个月前发布（较旧），无 MLX 版，代码审查基准数据缺失

## 推荐方案

### 首选：`qwen3.6:27b-mlx`

**理由**：
1. SWE-Bench Verified 77.2 — 代码 bug 发现基准同类第一
2. MLX 版本 19GB — Apple Silicon 最优性能
3. 6.7M 下载量 — 社区充分验证
4. 2 周前发布 — 最新
5. 256K context — 可处理大文件

**安装**：`ollama pull qwen3.6:27b-mlx`（19GB，约 2.5h @ 2MB/s）

### 备选：`muse-glimmer:30b-mlx`

**适用场景**：如果 OCR 的 tool_calls 频繁失败或不稳定，Muse Glimmer 的 MCP Atlas 75.5 和内置失败恢复可能更适合。

**安装**：`ollama pull muse-glimmer:30b-mlx`（19GB）

### 快速扫描：`ornith:9b`

**适用场景**：需要快速扫描大量文件时（5.6GB 加载快，推理快），或 32GB 内存不够跑 27B 时。

**安装**：`ollama pull ornith:9b`（5.6GB，约 40min）

## 当前已安装模型

| 模型 | 大小 | 用途 |
|------|------|------|
| bge-m3:latest | 1.2GB | embedding，非代码审查用 |
| qwen3.8:27b-mlx | 18GB | VLM（视觉），不支持 tools，OCR 用不了 |

**注意**：`qwen3.8:27b-mlx` 是 VLM（视觉模型），不支持 tools（function calling），OCR 无法使用。需安装上述推荐模型之一。

## Sources

1. https://ollama.com/search?c=tools — Ollama tools 模型列表 — Tier 1
2. https://ollama.com/search?c=code — Ollama code 模型列表 — Tier 1
3. https://ollama.com/library/qwen3.6 — Qwen3.6 官方页面 — Tier 1
4. https://ollama.com/library/qwen3.8 — Qwen3.8 官方页面 — Tier 1
5. https://ollama.com/library/muse-glimmer — Muse Glimmer 官方页面（含三方基准对比）— Tier 1
6. https://ollama.com/library/ornith — Ornith 官方页面 — Tier 1
7. https://ollama.com/library/nemotron-3.5-lightning — Nemotron 官方页面 — Tier 1
8. https://ollama.com/library/granite4.1 — Granite4.1 官方页面 — Tier 1
9. https://ollama.com/library/qwen3.8-flash-next — Qwen3.8-Flash-Next 官方页面（含基准对比）— Tier 1
10. https://ollama.com/blog — Ollama Blog（发布时间线）— Tier 1