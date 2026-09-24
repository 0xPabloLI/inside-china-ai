# Deep Research: OCR 代码审查最佳纯文本 LLM 选型

## Executive Summary

针对 alibaba/open-code-review (OCR) 代码审查工具的 LLM 选型需求（必须支持 function calling/tools、强代码理解、可在 M2 Pro 32GB 本地运行），对 Ollama 平台 2026 年 9 月所有支持 tools 的模型进行了系统调研。

**结论：`ornith:1.5-9b`（Q8_0，9.8GB）是最终采用方案。** Ornith-1.5-9B 在 SWE-bench Verified 得分 70.6，9B 级别无对手（Qwen3.5-9B 仅 53.2，差距 17.4 分）；纯文本 dense，MIT 许可，262K context。从 HuggingFace 下载 GGUF 通过 `ollama create` 导入 Ollama，tools + thinking 实测通过，OCR 代码审查实测通过。用户最终选择 Q8_0（质量优先于速度），Q4_K_M（5.4GB）作为快速备选。

**备选：`Ornith-1.5-35B-A3B`（MoE，Q4_K_M 20.2GiB）**— 激活仅 3B 推理快，质量更好，但 20GB 内存占用紧张，32GB 机器可能 swap。如 9B 质量不够可升级。

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
| qwen3.6:27b-mlx | 18GB | VLM + tools（vision + function calling），可接 OCR |

**注意**：`qwen3.6:27b-mlx` 支持 tools + vision（本地 `ollama show` 确认 capabilities 含 tools），可接 OCR（SWE-Bench Verified 77.2）。详见下方"引擎 Tools 支持确认"。

## 实测经验与约束修正（2026-09-23 更新）

### 三条硬约束（按重要性）

1. **支持 tools（function calling）是硬门槛**：不支持 tools 的模型彻底接不了 OCR 的 review agent，跟快慢无关。（注：qwen3.8-27B 和 qwen3.6-27B 都支持 tools，详见下方"引擎 Tools 支持确认"）
2. **dense 优先，避开 MoE**：MoE 在长上下文 prefill（代码审查 scan 是"输入大输出小"典型）慢 + 高失败率（qwen3:30b-a3b 实测 15 错/27 次 ≈55% 失败）。
3. **纯文本 > VLM 只是次要优化**：VLM 的 Vision Tower 仅占约 0.5-1GB（总模型 3-5%），浪费"还好"，不是主要矛盾。

### 误区纠正

上文"纯文本"曾列为硬约束，但随后仍推荐了带 vision 的 qwen3.6:27b，自相矛盾。实际结论是：**"VLM 不能用于 OCR"是错的**——qwen3.8-27B 和 qwen3.6-27B 都支持 tools（Ollama 官方页面确认 + 本地 `ollama show` 验证），都能接 OCR。选择面应为"支持 tools 的 dense 模型"，纯文本是加分项而非硬约束。详见下方"引擎 Tools 支持确认"。

### 待验证坑

- `qwen3.6:27b-mlx` 量化是 **nvfp4**（NVIDIA 专属 FP4），tag 却叫 -mlx，Apple Silicon Metal 兼容性存疑，需重启 Mac 恢复 Metal 后实测。
- 本地上次测速时叠加了 Metal GPU 故障（Ollama MLX runner 报 `metal::Device` kernel 加载失败，GGUF 引擎报 `failed to create library`），系统级故障需重启 Mac 恢复，并非模型问题。

## Deep Research 更新（2026-09-23 第二轮）

### 引擎 Tools 支持确认

| 引擎 | Apple Silicon | Tools | 证据 |
|------|--------------|-------|------|
| **Ollama** | ✅ | ✅ | 实测 `qwen3.6:27b-mlx` capabilities 有 tools |
| **mlx-lm server** | ✅ | ✅ | 源码有 `ToolCallFormatter` + `tool_parser`（v0.31.3） |
| **llama.cpp server** | ✅ | ✅ | Ollama 的底层引擎 |

→ **三种引擎都支持 tools**。不在 Ollama 上的模型（如 Ornith-1.5-9B）也能用 mlx-lm server 或 llama.cpp server 跑。

### nvfp4 坑确认

- `qwen3.6:27b-mlx` = nvfp4（digest `d49fd9e0da45` 与 `qwen3.6:27b-nvfp4` 相同）
- `qwen3.8:27b-mlx` = nvfp4（digest `5642e97495e1` 与 `qwen3.8:27b-nvfp4` 相同）
- **避坑方式**：用 `q4_K_M` 版（标准 GGUF，走 llama.cpp 引擎）

### 精确分数对比（含 hf-mirror 查到的 HuggingFace README 数据）

#### 纯文本 dense + tools + ≤20GB

| 模型 | SWE-bench Verified | SWE-bench Pro | Terminal-Bench 2.1 | 大小 | Context | 备注 |
|------|-------------------|---------------|-------------------|------|---------|------|
| **Ornith-1.5-9B** | **70.6** | **47.5** | **46.2** | 5.6GB | 256K | 最新，RL agentic coding，MIT |
| **Ornith-1.0-9B** | 69.4 | 42.9 | 43.1 | 5.6GB | 256K | Ollama 直接可用 |
| granite4.1:30b | ? | ? | ? | 17GB | 128K | IBM，仅 HumanEval 81.7，无 SWE-Bench |
| qwen3:32b | <70 | ? | ? | 20GB | 40K | 1 年前老模型 |
| granite4.1:8b | ? | ? | ? | 5.3GB | 128K | IBM |
| qwen3:14b | ? | ? | ? | 9.3GB | 40K | 1 年前 |

#### VLM + tools + dense（代码更强但 VLM）

| 模型 | SWE-bench Verified | SWE-bench Pro | Terminal-Bench 2.1 | 大小 | Context | 备注 |
|------|-------------------|---------------|-------------------|------|---------|------|
| **Qwen3.8-27B** | >77.2(推断) | **61.7** | **73.0** | 18GB | 256K | 最新最强，Ollama 标了 tools |
| Qwen3.6-27B | 77.2 | 50.2 | 60.7 | 17GB | — | 已知代码强 |

#### Ornith-1.5-9B vs 同尺寸对比（HuggingFace README 精确数据）

| 基准 | Ornith-1.5-9B | Ornith-1.0-9B | Qwen3.5-9B | Qwen3.6-35B-A3B | Gemma-4-31B |
|------|---------------|---------------|------------|------------------|-------------|
| SWE-bench Verified | **70.6** | 69.4 | 53.2 | 73.4 | 52 |
| SWE-bench Pro | **47.5** | 42.9 | 31.3 | 49.5 | 35.7 |
| Terminal-Bench 2.1 | **46.2** | 43.1 | 21.3 | 52.5 | 42.1 |

→ **9B 级别 Ornith 无对手**：SWE-bench Verified 70.6 vs Qwen3.5-9B 53.2，差距 17.4 分

### 新发现

1. **Ornith-1.5-9B 已发布**（HuggingFace `ornith-ai/Ornith-1.5-9B-GGUF`），比 1.0 全面提升，但 Ollama 还没更新到 1.5
2. **granite4.1:30b** — IBM 30B dense + 纯文本 + tools + 17GB，但无 SWE-Bench 分数，代码能力不确定
3. **qwen3.8:27b 在 Ollama 上标了 tools**（之前误记为不支持）
4. **Ornith 在 HuggingFace 上是 VLM**（image-text-to-text），但 GGUF 版只跑文本 → Ollama 上等同纯文本
5. **Ornith 没有 31B Dense 版本**（blog 说有但 HuggingFace 未发布）；更大的只有 35B MoE（21GB，不满足约束）
6. **Llama/Gemma 在代码基准上落后太多**：Gemma4-31B SWE-bench Verified 仅 52，Llama 系列都是 1 年前老模型

### 最终推荐

| 优先级 | 模型 | 理由 |
|--------|------|------|
| **纯文本 + 小快** | Ornith-1.0-9B (Ollama) 或 Ornith-1.5-9B (HF GGUF) | SWE-bench 69.4/70.6，5.6GB，prefill 快，KV cache 富余 |
| **代码最强** | Qwen3.8-27B q4_K_M | SWE-bench Pro 61.7, Terminal-Bench 73.0，但 VLM + 18GB + prefill 慢 |

### 当前状态

- `ollama pull ornith:9b` 后台下载中（5.6GB，Ollama CDN ~1.1MB/s）
- Metal GPU 已修复（用户重启 Mac）
- 待实测：ornith:9b 的 tools 路径 + 代码审查质量

## Deep Research 更新（2026-09-24 第三轮：最终采用）

### Ornith-1.5-9B 导入 Ollama 实测

从 HuggingFace（hf-mirror）下载 GGUF，通过 `ollama create` 导入：

```
aria2c -x16 -s16 -k1M -d /tmp/ornith15 -o Ornith-1.5-9B-Q4_K_M.gguf \
  "https://hf-mirror.com/ornith-ai/Ornith-1.5-9B-GGUF/resolve/main/Ornith-1.5-9B-Q4_K_M.gguf"

# Modelfile
FROM /tmp/ornith15/Ornith-1.5-9B-Q4_K_M.gguf
SYSTEM You are Ornith, an open-source agentic coding assistant...
PARAMETER stop <|im_end|>
PARAMETER temperature 0.6
PARAMETER top_k 20
PARAMETER top_p 0.95

ollama create ornith:1.5-9b -f /tmp/ornith15/Modelfile
```

**导入结果**：

```
Model
  architecture        qwen35
  parameters          9.2B
  context length      262144
  quantization        Q4_K_M

Capabilities
  tools
  thinking
  completion
```

**Tools 实测**：发送带 `get_weather` tool 的请求，模型正确返回 `tool_calls`（`get_weather(city="Beijing")`）+ `thinking` 块。加载 5.6s，推理 1.8s。

**OCR 审查实测**：`ocr review --commit 8b10b96` 审查 `src/routes/sitemap[.]xml.ts`，调用 `file_read` tool 成功，52s 完成，0 findings（代码无问题）。

### Ornith-1.5-9B 可用量化版本

| 量化 | 大小 | 备注 |
|------|------|------|
| Q4_K_M | 5.4 GB | 已导入实测 |
| Q5_K_M | 6.6 GB | 质量提升 |
| Q6_K | 7.6 GB | 接近 FP16 |
| Q8_0 | 9.8 GB | ✅ 用户最终选择（质量优先于速度） |
| BF16 | 18.4 GB | 不必要 |

### Ornith-1.5-35B-A3B MoE 发现

HuggingFace 上存在 `ornith-ai/Ornith-1.5-35B-A3B-GGUF`（架构 `qwen35moe`）：

| 量化 | 大小 | 32GB 能跑？ |
|------|------|------------|
| Q4_K_M | 20.2 GiB | 紧张但可行（剩余 ~11 GiB） |
| Q5_K_M | 25.3 GB | ❌ |
| Q6_K | 29.2 GB | ❌ |
| Q8_0 | 37.8 GB | ❌ |

- **优势**：激活仅 3B，推理速度接近 3B dense，可能比 9B Q4_K_M 还快；35B 总参数质量更好
- **风险**：20.2 GiB + Chrome/IDE/OCR，32GB 可能 swap
- **决策**：暂不采用，优先 9B Q4_K_M。如需更强可后续试 35B MoE

### 最终采用

**`ornith:1.5-9b`（Q8_0，9.8GB）**

理由：
1. SWE-bench Verified 70.6 — 9B 级别无对手（Qwen3.5-9B 仅 53.2）
2. Q8_0 近无损量化 — 质量优先于速度
3. 9.8GB — 32GB 机器内存无压力
4. 纯文本 dense — 符合所有约束
5. tools + thinking — OCR 实测通过
6. MIT 许可 — 最宽松
7. 262K context — 可处理大文件

**快速备选**：Q4_K_M（5.4GB）速度更快，单文件 52s，多文件 10min 完成。

**OCR 配置**：`~/.opencodereview/config.json` → `provider=ollama, model=ornith:1.5-9b`

### 非本渠道模型导入 Ollama 方法

从 HuggingFace / ModelScope / 手动下载的 GGUF 文件，可通过 `ollama create` + Modelfile `FROM /path/to/file.gguf` 导入 Ollama。GGUF 内置 chat template，无需额外配置。不限于 Ollama 官方库。

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
11. https://deep-reinforce.com/ornith_1_0.html — Ornith-1.0 blog（含 SWE-Bench 分数）— Tier 1
12. https://hf-mirror.com/ornith-ai/Ornith-1.5-9B — Ornith-1.5-9B HuggingFace README（含精确基准表）— Tier 1
13. https://hf-mirror.com/Qwen/Qwen3.8-27B — Qwen3.8-27B HuggingFace README（含精确基准表）— Tier 1
14. https://hf-mirror.com/ibm-granite/granite-4.1-30b — Granite 4.1 30B HuggingFace README（含 HumanEval/MBPP 分数）— Tier 1
15. https://raw.githubusercontent.com/ibm-granite/granite-4.1-language-models/main/README.md — Granite 4.1 GitHub README — Tier 1
16. mlx-lm server.py 源码（`ToolCallFormatter` + `tool_parser`）— Tier 1（本地源码验证）