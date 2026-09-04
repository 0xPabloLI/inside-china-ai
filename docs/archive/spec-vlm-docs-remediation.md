# Spec: VLM 选型文档修订（基于 Review 2026-08-26）

> **来源**：`docs/reviews/handoff-vlm-model-sources-2026-08-26-review.md`
> **创建日期**：2026-08-26
> **范围**：纯文档修订，不涉及代码改动

---

## 1. 目标

消除 review 发现的 11 个文档问题（F1-F11，排除 F10 deep-research fork），使 4 个 VLM 相关文档达到跨文档一致性，所有断言有可复现证据。

## 2. 修订文件清单

| 文件                                                    | 简称          | 修订内容                                               |
| ------------------------------------------------------- | ------------- | ------------------------------------------------------ |
| `docs/research/vlm-model-selection-benchmark.md`        | benchmark     | F1/F4/F5/F8/F9/F11 — 视频章节重构 + 性能断言修正       |
| `docs/adr/0009-vlm-qwen3-vl-mlx.md`                     | ADR-0009      | F3 — Ollama 视觉能力修正                               |
| `docs/handoffs/handoff-vlm-model-sources-2026-08-26.md` | handoff       | F1/F2/F7/F8/F9 — 待办收束 + 断言修正 + memory 指针替换 |
| `docs/research/model-sources-reference.md`              | model-sources | F6/F7/F8 — 信源表分层 + 格式表拆分 + 性能断言修正      |

## 3. 详细修订方案

### 3.1 benchmark — 视频章节重构（F1, F4, F8, F9, F11）

**当前问题**：第 118-150 行先声称"transformers 上游 bug 影响所有平台"，第 148 行又称"已修复（2026-08-26 验证）"。同一章内结论矛盾。固定性能倍率无测量条件。`[[memory:...]]` 不可审计。

**修订方案**：

将 §4 视频分析章节（第 116-150 行）重构为三个子节：

```
### 视频分析

#### 已废弃结论（2026-08-26 前的误报）

> 废弃原因：测试代码用了错误的 API 调用方式
> (`apply_chat_template(num_images=0) + generate(video=)`)，导致
> `broadcast_shapes` error。误报为"transformers 上游 bug 影响所有平台"。
> 网络搜索到的 GitHub issues 反映的是已报告的问题，不代表已修复的状态。

[保留原跨平台证据表作为历史记录，但明确标注为已废弃]

#### 当前结论（2026-08-26 验证）

| 维度 | 值 |
|------|-----|
| 状态 | ✅ 原生视频路径可用 |
| 验证日期 | 2026-08-26 |
| 环境 | mlx-vlm 0.6.16 + transformers 5.15.1, ~/.video-tts-env (Python 3.12) |
| 模型 | Qwen3-VL-2B-Instruct-4bit |
| 输入 | unitree-demo.mp4 (1.7s) |
| 调用方式 | `generate(prompt=, video=, fps=, max_frames=, temperature=0.0)` |
| 结果 | 1.9s 内生成准确描述 |
| 证据 | `scripts/short-video/lib/vlm_analyzer.py` L326-337 (原生路径) + L494-523 (fallback) |
| 失效条件 | mlx-vlm 或 transformers 升级后需重新 smoke test |

#### 仍存在的限制

mlx-vlm 未实现 Qwen3-VL 的 `return_video_metadata=True` 路径（用于
text-timestamp alignment），但 numpy processor 独立计算 `video_grid_thw`，
不依赖该参数。
```

同时删除 §5 社区评价表第 163 行"Qwen3-VL video processor bug 影响所有平台（vLLM, SGLang, LM Studio, transformers）"——改为"Qwen3-VL video processor 曾有跨平台 issue（已被 mlx-vlm 0.6.16 numpy processor 绕过）"。

### 3.2 benchmark — §8 待办修正

将第 213 行 `[x] 升级 mlx-vlm 到 0.6.16，重新测试视频分析（未修复，但找到 workaround：手动帧提取）` 改为：
`[x] 升级 mlx-vlm 到 0.6.16，原生视频路径验证成功（numpy processor 绕过 transformers bug）`

### 3.3 benchmark — F5 公平 A/B 评估待办

在 §7 Pipeline 集成 → 待办中新增：
`- [ ] 公平 A/B 升级评估：同一图片/视频 corpus、统一 resize、相同提示词、≥3 次运行，比较 2B-4bit vs Ollama qwen3.5:4b 的质量、延迟、内存和失败率`

### 3.4 ADR-0009 — Ollama 视觉能力修正（F3）

**当前第 13 行**：
`- **Ollama-based VLM**: Ollama does not support vision models natively. mlx-vlm is purpose-built for Apple Silicon.`

**改为**：
`- **Ollama-based VLM**: Ollama 支持部分视觉模型（如 qwen3.5:4b），但本项目以 mlx-vlm 为主路径（现有 pipeline + 原生视频 fallback 已围绕它建立）。将 Ollama 用作替代路径前需完成同 corpus 的性能、视频和集成验证。`

### 3.5 handoff — 待办收束（F2）

**当前第 94-100 行**："待落盘"section 列出三项需写入 model-sources-reference.md 的内容。这些已在 commit `522ac4d` 中落盘。

**改为**：

```
### 已完成

已在 `model-sources-reference.md` 中落盘（commit `522ac4d`）：
- §1.8 General 模型选型信源（信源优先级表）
- §2 模型格式速查表
- §4 Step 7: 本地源码验证

后续修订仅在 `model-sources-reference.md` 中进行；本交接文档不再复制规范正文。
```

**待办第 1 项**（第 168 行）：`[x]` 已完成（已有 commit `522ac4d`）

### 3.6 handoff — memory 指针替换（F1）

**当前第 12 行**：
`...误报为"所有平台都有 bug" [[memory:17877336917687800217]]`

**改为**：
`...误报为"所有平台都有 bug"（验证日期 2026-08-26，环境 mlx-vlm 0.6.16 + transformers 5.15.1，证据：`scripts/short-video/lib/vlm_analyzer.py` L326-337 原生视频路径 + benchmark §4 当前结论）`

### 3.7 handoff — Qwen3.8 断言修正（F9）

**当前第 46-47 行**选项 D：

```
- 优势：最强开源 VLM、Apache-2.0、原生视觉
- 劣势：18GB 模型需 24GB+ Mac（M2 Pro 32GB 可跑但紧张）、mlx-vlm 不支持 `qwen3_8` 架构、只能通过 Ollama
```

**改为**：

```
- 优势：本项目候选集内的高容量候选、Apache-2.0、原生视觉（官方模型卡确认支持图像和视频）
- 劣势：~18GB Q4 变体、内存需求需实际加载测量、mlx-vlm 不支持 `qwen3_8` 架构、当前仅通过 Ollama 验证了 MLX 变体
```

### 3.8 handoff — Ollama 进程内存修正（F8）

**当前第 89 行**：`ollama serve 常驻进程 ~16MB（无模型加载时）`

**改为**：`ollama serve 常驻进程（无模型加载时内存占用未实测，官方文档未给出通用基线）`

### 3.9 handoff — 模型格式表 GGUF 说明修正（F7）

**当前第 85 行**：`**GGUF 是 llama.cpp 项目创建的格式**...`

保留原文（事实正确），但 handoff 中的模型格式表与 model-sources-reference.md §2 重复——删除 handoff 中的格式表（第 76-85 行），替换为指针：`详见 model-sources-reference.md §2 模型格式速查表`。

### 3.10 model-sources — §1.8 信源表分层（F6）

在当前 §1.8 线性优先级表后新增"决策证据分层"指导：

```markdown
**信源分层使用**：

| 层级       | 适用问题                   | 首选证据                             | 完成条件                           |
| ---------- | -------------------------- | ------------------------------------ | ---------------------------------- |
| 第一方事实 | 许可证、模态、参数、上下文 | 官方模型卡、LICENSE、官方仓库文档    | 每项关键结论有稳定链接与检索日期   |
| 发行与安装 | 某变体能否拉取和运行       | Ollama Library、LM Studio、HF 文件页 | 在目标设备执行最小 smoke test      |
| 独立评估   | 质量/速度/成本对比         | 可复现实验报告、任务匹配 benchmark   | 说明任务集、版本与局限             |
| 本机决策   | 本项目生产适配性           | 固定 corpus 的 benchmark + E2E 测试  | 图片、视频、峰值内存、失败率均记录 |
```

### 3.11 model-sources — §2 格式表拆分（F7）

将当前 §2 单一格式表拆成两个子表：

**权重容器**：

| 格式            | 推理引擎                          | 跨引擎？      | Apple Silicon | 说明                                       |
| --------------- | --------------------------------- | ------------- | ------------- | ------------------------------------------ |
| **GGUF**        | llama.cpp / Ollama / LM Studio    | ✅            | ✅ Metal      | llama.cpp 创建的格式，现为本地推理通用标准 |
| **MLX**         | mlx-lm / mlx-vlm / Ollama (macOS) | ❌ Apple only | ✅ 原生       | Apple Silicon 原生格式                     |
| **safetensors** | transformers / vLLM               | ✅            | ✅ MPS        | 全精度源格式，量化前的基础                 |

**量化方法**：

| 方法         | 适用引擎            | 硬件      | 量化位宽 | 说明                 |
| ------------ | ------------------- | --------- | -------- | -------------------- |
| **K-quants** | llama.cpp / Ollama  | ✅ Metal  | Q2-Q8    | GGUF 的量化方式      |
| **MLX 量化** | mlx-lm / mlx-vlm    | ✅ 原生   | 2-8 bit  | MLX 原生量化         |
| **GPTQ**     | vLLM / transformers | ❌ NVIDIA | 4-bit    | 权重存为 safetensors |
| **AWQ**      | vLLM / transformers | ❌ NVIDIA | 4-bit    | 质量通常优于 GPTQ    |
| **EXL2**     | ExLlamaV2           | ❌ NVIDIA | 2-8 bpw  | 可变比特率           |

### 3.12 model-sources — 性能断言修正（F8）

**当前第 135 行**：`Apple Silicon 上比 GGUF（Metal 后端）快 30-50%；跨平台比 NVIDIA CUDA 慢 2-4x`

**改为**：`Apple Silicon 原生格式，性能优于 Metal 后端的 GGUF（具体倍率取决于模型和 batch size，未做系统基准测试）`

**当前第 124 行**：`ollama serve 常驻 ~16MB，模型推理后默认 5 分钟空闲自动卸载`

**改为**：`ollama serve 常驻进程，模型推理后默认 5 分钟空闲自动卸载（`OLLAMA_KEEP_ALIVE` 可配，见 [Ollama FAQ](https://docs.ollama.com/faq)）`

### 3.13 model-sources — §4 Step 7 memory 指针替换（F1）

**当前第 199 行**：`见 [[memory:17877336917687800217]]`

**改为**：`见 `docs/research/vlm-model-selection-benchmark.md` §4 视频分析 → 已废弃结论`

---

## 4. Scenario & Risk Verification

### Modified Files Impact

| 文件          | 修改类型                                           | 影响范围         | 风险                                               |
| ------------- | -------------------------------------------------- | ---------------- | -------------------------------------------------- |
| benchmark     | 内容重构（§4 视频章节 + §5 社区评价 + §7/§8 待办） | VLM 选型决策依据 | 低——不改变选型结论（2B-4bit），只修正叙述一致性    |
| ADR-0009      | 事实修正（1 行）                                   | 架构决策记录     | 低——不改变决策（仍用 mlx-vlm），只修正 Ollama 表述 |
| handoff       | 收束 + 修正（多行）                                | 交接文档         | 低——交接文档是历史记录，修正不影响当前执行         |
| model-sources | 结构调整（§1.8 + §2 + §4）                         | 模型搜索流程参考 | 中——格式表拆分可能影响已有引用                     |

### Behavioral Scenarios

| #   | 场景                                               | 预期行为                                                                                 | 验证方式                                |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| S1  | Agent 读 benchmark §4 视频分析                     | 先看到"已废弃结论"（标注废弃原因），再看到"当前结论"（含验证日期、环境、证据），不会混淆 | 读文件检查结构                          |
| S2  | Agent 读 ADR-0009                                  | 看到"Ollama 支持部分视觉模型"，不会误认为 Ollama 完全不支持视觉                          | grep "does not support vision" = 0 hits |
| S3  | Agent 读 handoff 待办                              | 第 1 项标记 [x]，"待落盘"section 已替换为"已完成"指针                                    | grep "待落盘" = 0 hits                  |
| S4  | Agent 读 handoff 选项 D                            | 看到"本项目候选集内的高容量候选"而非"最强开源 VLM"                                       | grep "最强开源 VLM" = 0 hits in handoff |
| S5  | Agent 读 model-sources §2                          | 看到"权重容器"和"量化方法"两个子表，不再混合                                             | 读文件检查结构                          |
| S6  | Agent 读 model-sources §1.8                        | 线性表保留作为速查，下方有"决策证据分层"指导                                             | 读文件检查存在性                        |
| S7  | 在 4 个文件中搜索 `[[memory:`                      | 0 hits                                                                                   | grep 检查                               |
| S8  | 在 4 个文件中搜索 `~16MB` 或 `16 MB`               | 0 hits（Ollama 进程内存数字已删除）                                                      | grep 检查                               |
| S9  | 在 benchmark 中搜索"影响所有平台"                  | 只出现在"已废弃结论"小节内，且标注为废弃                                                 | grep + 上下文检查                       |
| S10 | 在 model-sources 中搜索"快 30-50%"或"慢 2-4x"      | 0 hits                                                                                   | grep 检查                               |
| S11 | 跨文档一致性：ADR-0009 和 handoff 对 Ollama 的表述 | 一致——都说"Ollama 支持部分视觉模型，但本项目以 mlx-vlm 为主路径"                         | 交叉对比                                |
| S12 | benchmark §4 当前结论和 handoff 背景描述           | 一致——都说"原生视频路径可用，误报原因是 API 调用方式错误"                                | 交叉对比                                |

---

## 5. 不在本次范围

- F10（deep-research fork 评估）— 用户明确排除
- F5 的实际 A/B 测试执行 — 需运行模型，仅记录为待办
- 端到端 pipeline 测试 — 需运行代码，仅记录为待办
- 清理本地多余 VLM 模型 — 运维操作，不是文档修订
- 追溯全部历史陈述的验证格式标准化 — 工作量过大
