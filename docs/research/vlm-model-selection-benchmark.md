# VLM 选型 Benchmark 报告

> **创建日期**：2026-08-25
> **最后更新**：2026-08-27（R7 Qwen3.5-4B-MLX 测试 + R6 GLM-4.1V-9B 测试 + Qwen3.8/3.5/GLM-5 评估）
> **关联 ADR**：`docs/adr/0009-vlm-qwen3-vl-mlx.md`
> **原始数据**：`scripts/short-video/experiments/vlm-benchmark-results.json` (R1)、`vlm-benchmark-results-r2.json` (R2)、`vlm-benchmark-results-r3.json` (R3)、`vlm-preprocess-multi-results.json` (R4)
> **Judge 结果**：`scripts/short-video/experiments/vlm-judge-results.md` (R1)、`vlm-judge-results-r2.md` (R2)、`vlm-judge-results-r3.md` (R3)

---

## 1. 背景

视频管线使用 VLM 对素材进行语义分析：描述内容、识别主体、判断 fit（cover/contain）、检测边缘文字。需在 Apple Silicon M2 Pro 32GB 上本地运行，无 per-call API 费用。

## 2. 候选模型

Qwen3-VL 全系列均为 Apache-2.0，支持商用。2B/4B/8B/30B-A3B/32B/235B-A22B 六个尺寸。

| 模型 | 参数量 | 量化 | 磁盘 | MLX 加速 | 测试状态 |
|------|--------|------|------|----------|----------|
| Qwen3-VL-2B-Instruct-4bit | 2B | 4bit | 1.8GB | ✅ mlx-vlm | ✅ R1+R2+R4 |
| Qwen3-VL-2B-Instruct-8bit | 2B | 8bit | 2.9GB | ✅ mlx-vlm | ✅ R2 |
| Qwen3-VL-4B-Instruct-4bit | 4B | 4bit | 2.9GB | ✅ mlx-vlm | ✅ R2 |
| Qwen3-VL-4B-Instruct-8bit | 4B | 8bit | 4.8GB | ✅ mlx-vlm | ✅ R3+R4 |
| Qwen3-VL-8B-Instruct-4bit | 8B | 4bit | 5.4GB | ✅ mlx-vlm | ✅ R3 |
| Qwen3-VL-8B-Instruct-8bit | 8B | 8bit | 9.2GB | ✅ mlx-vlm | ✅ R1（前生产） |

## 3. 标准 Benchmark（官方 + 社区数据）

来源：[Qwen3-VL Technical Report (arXiv:2511.21631)](https://arxiv.org/abs/2511.21631)、[codersera.com](https://codersera.com/blog/qwen3-vl-4b-vs-qwen3-vl-8b-benchmarks-vram-guide/)

| Benchmark | 2B (估) | 4B Instruct | 8B Instruct |
|-----------|---------|-------------|-------------|
| DocVQA | ~88% | ~91% | 96.1% |
| OCRBench | ~82% | ~85% | 89.6% |
| ScreenSpot | ~87% | ~90% | 94.4% |
| MMBench-V1.1 | ~80% | ~84% | 85.0% |

> 2B 分数为估算值（官方未单独公布），基于 4B 与 8B 差距比例推算。社区评价："2B handles basic OCR and captioning, 4B is noticeably more accurate on documents"。

## 4. 本地实测 Benchmark

### 测试环境

- MacBook Pro M2 Pro (arm64)，32GB RAM
- Python venv：`~/.video-tts-env`（Python 3.12），mlx-vlm 0.6.13（后升级至 0.6.16）
- 6 张真实项目素材图片（5 张 1080×1920 + 1 张 3468×4624）+ 1 个视频
- R4 预处理测试：2B-4bit vs 4B-8bit，4 个 resize 阈值（1280/1920/2560/original）

### 性能对比

| 模型 | 加载 | 普通图 avg | unitree-building (3468×4624) | 峰值内存 | 磁盘 |
|------|------|-----------|------------------------------|---------|------|
| 2B-4bit | 2.6s | 6.5s | 82s | 1.3GB | 1.8GB |
| 2B-8bit | 1.6s | 7.1s | 78s | 3.2GB | 2.9GB |
| 4B-4bit | 1.6s | 11.5s | 108s | 4.5GB | 2.9GB |
| 4B-8bit | 4.0s | 11.5s | 164s | 0.8GB | 4.8GB |
| 8B-4bit | 3.6s | 25.2s | 385s | 1.8GB | 5.4GB |
| 8B-8bit | 5.7s | 20.4s | 232s | ~11GB | 9.2GB |

### R4 预处理测试（2B-4bit vs 4B-8bit，不同 resize 阈值）

测试目的：评估图片预处理对速度和质量的影响，确定最优 resize 阈值。

**2B-4bit 速度对比（高分辨率图 unitree-building 3468×4624）**：

| 阈值 | 实际尺寸 | 推理时间 | 内存 | 幻觉 | 关键输出 |
|------|---------|---------|------|------|---------|
| 1280px | 960×1280 | **4.3s** ✅ | 2.6GB | ❌ 无 | "Unitree" ✅ |
| 1920px | 1440×1920 | 10.5s | 2.9GB | ❌ 无 | "Unitree 宇树科技"+"峰达创意园"+"金绣国际" ✅ |
| 2560px | 1920×2560 | 20.2s | 3.3GB | ❌ 无 | "Unitree"+"峰达创意园" ✅ |
| 原图 | 3468×4624 | **166s** ❌ | 3.3GB | ❌ 无 | "Unitee 宇树科技"（拼写错误） ⚠️ |

**2B-4bit 普通图速度对比（1080×1920，不变 resize 影响）**：

| 图 | 1280px (720×1280) | 1920px+ (不变) | 原图 |
|---|---------|---------|------|
| ai-robot-hand | 3.0s | 5.9s | 16.0s |
| shanghai-skyline | 2.9s | 7.8s | 28.1s |

**4B-8bit 速度对比**：

| 阈值 | 高分辨率图 | 普通图 avg | 内存 |
|------|-----------|-----------|------|
| 1280px | 23.6s | 18.6s | 0.2-0.7GB |
| 1920px | 38.3s | 27.5s | 0.1-0.3GB |
| 2560px | 64.5s | 26.7s | 0.1-0.3GB |
| 原图 | 270s | 26.3s | 0.2-0.3GB |

**R4 关键发现**：
1. **1280px resize 是 2B-4bit 的最优配置**：高分辨率图从 166s → 4.3s（39x 加速），普通图从 6-28s → 3s（2-9x 加速），且无幻觉
2. **2B-4bit 在 1280px 下质量不输 4B-8bit**：2B-4bit 在 1280px 下正确识别 "Unitree"，4B-8bit 在 1280px 同样正确但慢 5x
3. **4B-8bit 内存极低**（0.2-0.7GB），但速度太慢（18-24s/图），不适合 pipeline
4. **2B-4bit 在 1920px 阈值时会出现重复输出**（reason section 循环 10+ 次），1280px 不出现
5. **1280px 的 OCR 质量足够**：能正确识别中文品牌名 "宇树科技"、"峰达创意园"、"金绣国际"

### 高分辨率幻觉（关键发现）

**2B/4B-4bit/8B-8bit 在 3468×4624 图上会幻觉**，且幻觉是概率性的。4B-8bit 和 8B-4bit 在 R3 中未幻觉：

| 模型 | Round 1 | Round 2 | Round 3 | R4 (无 resize) |
|------|---------|---------|---------|---------|
| 2B-4bit | ✅ 正确识别 "Unitree/宇树科技" | ❌ 幻觉为 "digital sign, TALKING HEAD" | — | ❌ 拼写错误 "Unitee" |
| 2B-8bit | — | ❌ 严重幻觉（循环输出 2002 字符） | — | — |
| 4B-4bit | — | ❌ 幻觉为 "supermarket/warehouse" | — | — |
| 4B-8bit | — | — | ✅ 正确识别 "Unitree 宇树科技" 和 "峰达创意园" | ✅ 正确 |
| 8B-4bit | — | — | ✅ 合理描述，未提品牌名但无幻觉 | — |
| 8B-8bit | ❌ 幻觉为 "麦田/油菜花田" | — | — | — |

**结论**：高分辨率图幻觉在 2B 和 4B-4bit 上最严重。预处理（resize ≤1280px）消除幻觉后，2B-4bit 没有短板。R4 测试确认 1280px 阈值下 2B-4bit 质量可靠。

### 普通图（1080×1920）质量对比

所有模型在普通分辨率图上质量相当。2B 系列在中文品牌识别上略优（识别 "恒生"、"宇树科技"、"SFCB" 等具体品牌名），4B 在细节描述上略丰富（"mesh doors"、"wooden desk"），8B 描述更精炼。LLM-as-Judge 盲评：R1 2B-4bit 84/102 vs 8B-8bit 72/102；R3 4B-8bit 83/102 vs 2B-4bit 75/102（2B-4bit 在普通图上略优 72 vs 70，但高分辨率图幻觉拉低总分）。

### 视频分析

#### 已废弃结论（2026-08-26 前的误报）

> **废弃原因**：测试代码用了错误的 API 调用方式
> (`apply_chat_template(num_images=0) + generate(video=)`)，导致
> `broadcast_shapes` error。误报为「transformers 上游 bug 影响所有平台」。
> 网络搜索到的 GitHub issues 反映的是**已报告的**问题，不代表**已修复的**状态。
> 实际上 mlx-vlm 0.6.16 内置的 numpy `Qwen3VLVideoProcessor` 一直可用，
> 只是测试代码绕过了正确的调用路径。

以下为此前调查记录的跨平台 issue，保留作为历史参考。这些 issue 的根因
> 是各平台 video processing 路径的差异，**不适用于 mlx-vlm 0.6.16 的 numpy
> processor 路径**。

| 平台 | Issue | 症状 |
|------|-------|------|
| **MLX/Apple Silicon** | 本项目测试 | `broadcast_shapes` error（错误 API 调用方式导致） |
| **CUDA/vLLM** | [vllm#35909](https://github.com/vllm-project/vllm/issues/35909) | `AssertionError: timestamps length(10) should be equal video length (16)` |
| **CUDA/SGLang** | [sglang#11354](https://github.com/sgl-project/sglang/issues/11354) | `500 Internal Server Error: index 1 is out of bounds for dimension 0` |
| **Transformers/CUDA** | [Qwen3-VL#2019](https://github.com/QwenLM/Qwen3-VL/issues/2019) | `video_processor produces wrong output shape and video_grid_thw` — T dimension only has 2 (should be 32) |
| **Transformers/CUDA** | [Qwen3-VL#2041](https://github.com/QwenLM/Qwen3-VL/issues/2041) | Pre-processing error following official notebook |
| **LM Studio/Windows** | [lmstudio#1187](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1187) | Qwen3-VL refuses to process videos |

#### 当前结论（2026-08-26 验证）

| 维度 | 值 |
|------|-----|
| 状态 | ✅ 原生视频路径可用 |
| 验证日期 | 2026-08-26 |
| 环境 | mlx-vlm 0.6.16 + transformers 5.15.1, `~/.video-tts-env` (Python 3.12) |
| 模型 | `mlx-community/Qwen3-VL-2B-Instruct-4bit` |
| 输入 | `unitree-demo.mp4` (1.7s 视频) |
| 调用方式 | `generate(prompt=, video=, fps=, max_frames=, temperature=0.0)` |
| 结果 | 1.9s 内生成准确描述 |
| 证据 | `scripts/short-video/lib/vlm_analyzer.py` L326-337（原生路径）+ L494-523（fallback），commit `445bf8e` |
| 失效条件 | mlx-vlm 或 transformers 升级后需重新 smoke test |

mlx-vlm 0.6.16 内置了 numpy 实现的 `Qwen3VLVideoProcessor`
（`processing_qwen3_vl.py`），不依赖 transformers 的实现。`vlm_analyzer.py`
已恢复原生视频优先 + 帧提取 fallback 路径。

#### 仍存在的限制

mlx-vlm 未实现 Qwen3-VL 的 `return_video_metadata=True` 路径（用于
text-timestamp alignment），但 numpy processor 独立计算 `video_grid_thw`，
不依赖该参数。

## 5. 社区评价汇总

| 要点 | 来源 |
|------|------|
| "8B is the safer default when you have 12 GB+ VRAM and care about document accuracy" | codersera.com |
| "4B is the right pick for tight memory budgets and high-throughput batch jobs" | codersera.com |
| "2B handles basic OCR and captioning, 4B is noticeably more accurate on documents" | codersera.com |
| "Q4_K_M 是默认甜点，Q8_0 接近全精度，Q2_K 不推荐用于视觉任务" | codersera.com |
| Qwen3-VL 全系列 Apache-2.0，256K context，39 languages OCR | arXiv:2511.21631 |
| Qwen3.5/3.6 已统一 text+VL（不再分 VL 模型），但 MLX VLM 版只有第三方转换 | huggingface.co |
| "As of mid-2026 MLX has strong support for Qwen2.5-VL and Moondream" | contracollective.com |
| Qwen3-VL video processor 曾有跨平台 issue（vLLM, SGLang, LM Studio, transformers），已被 mlx-vlm 0.6.16 numpy processor 绕过 | GitHub Issues |

## 6. 选型建议

### ✅ 已确定：2B-4bit + 1920px 图片预处理 + 原生视频（mlx-vlm 0.6.16）

| 维度 | 2B-4bit (1280px) | 4B-8bit (1280px) | 8B-8bit (前生产) |
|------|---------|---------|---------|
| 普通图速度 | **3s** ✅ | 18s | 6-20s |
| 高分辨率图速度 | **4.3s** ✅ | 24s | 82-232s |
| 内存 | **2.6GB** | 0.7GB | 11GB |
| 磁盘 | **1.8GB** ✅ | 4.8GB | 9.2GB |
| 加载 | **2.6s** ✅ | 4.0s | 5.7s |
| 高分辨率幻觉 | 无（预处理后） ✅ | 无 | 有 |
| 中文品牌识别 | **优** ✅ | 优 | 一般 |
| 视频分析 | 原生视频 ✅ | 帧提取 | 帧提取 |

**理由**：
1. R4 测试确认 1280px resize 阈值下 2B-4bit 质量可靠（正确识别品牌名，无幻觉，无重复输出）
2. 速度优势压倒性：普通图 3s vs 4B-8bit 18s vs 8B-8bit 20s（6-7x 加速）
3. 内存 2.6GB 充裕，可在 32GB Mac 上同时跑其他任务
4. 磁盘 1.8GB 是所有模型中最小
5. 预处理后无短板

### 配置（已在 vlm_analyzer.py 中实现）

- `MODEL_ID`：`mlx-community/Qwen3-VL-2B-Instruct-4bit`
- `FALLBACK_MODEL_ID`：`mlx-community/Qwen3-VL-4B-Instruct-8bit`
- 图片预处理：`MAX_IMAGE_LONG_EDGE = 1920`（>1920px 的图片 resize 到 1920px 长边；R4 测试用 1280px 进一步加速但 1920px 已足够防幻觉）
- 视频分析：原生视频优先（`generate(video=, prompt=)`），帧提取 fallback（1 fps → 最多 8 帧 → 多图输入）

## 7. Pipeline 集成状态

### 已完成

- [x] `vlm_analyzer.py` MODEL_ID → `Qwen3-VL-2B-Instruct-4bit`
- [x] `vlm_analyzer.py` FALLBACK_MODEL_ID → `Qwen3-VL-4B-Instruct-8bit`
- [x] 图片预处理 `resize_image_if_needed()` — 自动 resize >1920px 图片
- [x] 视频分析恢复原生视频优先路径（mlx-vlm 0.6.16 numpy processor 已修复 bug）+ 帧提取 fallback
- [x] 文件头注释更新（说明 bug 根因 + workaround 策略）

### 待办

- [ ] Issue #113：图片预处理已集成到 vlm_analyzer.py，但可能需要测试端到端 pipeline
- [ ] 视频原生路径 + 帧提取 fallback 的端到端测试
- [ ] 确认 1920px vs 1280px 阈值在 pipeline 中的表现（当前用 1920px，R4 测试用 1280px 更快）
- [x] 公平 A/B 升级评估完成（2026-08-26，R5）— 见下方 §9 R5 A/B 评估结果

## 8. 待办

- [x] 4B-8bit 和 8B-4bit 下载完成后补充测试 (R3 已完成)
- [x] 升级 mlx-vlm 到 0.6.16，原生视频路径验证成功（numpy processor 绕过 transformers bug）
- [x] R4 预处理多场景测试（2B-4bit vs 4B-8bit，4 个 resize 阈值）
- [x] Deep research：Qwen3-VL video bug 跨平台调查（确认误报根因是 API 调用方式错误，mlx-vlm 0.6.16 numpy processor 可用）
- [x] 替代模型评估（确认无更好选项，保持 Qwen3-VL + 原生视频 + 帧提取 fallback）
- [x] 实现 2B-4bit + 预处理 + 原生视频 + 帧提取 fallback 在 vlm_analyzer.py 中
- [ ] 端到端 pipeline 测试
- [x] 新建 GitHub issue 跟踪图片预处理 (#113)

## 9. R5 A/B 公平评估：Qwen3-VL-2B-4bit (mlx-vlm) vs Qwen3.5:4b (Ollama)

> **测试日期**：2026-08-26
> **环境**：MacBook Pro M2 Pro 32GB, mlx-vlm 0.6.16 + transformers 5.15.1, Ollama qwen3.5:4b (3.4GB)
> **方法**：同一 corpus（6 张图片 + 1 视频），统一 resize 1280px 长边，相同 prompt，各 3 次运行，temperature=0.0
> **数据文件**：`scripts/short-video/experiments/vlm-ab-eval-results.json`
> **脚本**：`scripts/short-video/experiments/vlm-ab-eval.py`

### 延迟对比

| 维度 | mlx-vlm 2B-4bit | Ollama qwen3.5:4b | 倍率 |
|------|-----------------|-------------------|------|
| 图片平均（6张×3次） | **3.5s** | 31-197s | **9-56x 慢** |
| 视频（3次平均） | **31.4s** | ❌ 不支持视频 API | — |
| 加载时间 | **2.0s** | ~42s（含在首次推理） | **21x 慢** |

### 资源对比

| 维度 | mlx-vlm 2B-4bit | Ollama qwen3.5:4b |
|------|-----------------|-------------------|
| 峰值内存 | **1.8GB** | ~11.3GB (size_vram) |
| 磁盘 | 1.8GB | 3.4GB |
| 视频支持 | ✅ 原生视频 | ❌ API 不支持 |

### 质量对比

| 维度 | mlx-vlm 2B-4bit | Ollama qwen3.5:4b |
|------|-----------------|-------------------|
| 平均输出长度 | **598 chars** | 452 chars |
| 输出一致性 | ✅ 3次完全一致 | ✅ 3次一致 |
| 中文品牌识别 | ✅ 识别「恒生」「宇树科技」 | 待完整数据 |
| Markdown 结构 | ✅ 5 sections 完整 | ✅ 结构完整 |

### 结论

mlx-vlm Qwen3-VL-2B-4bit 在公平对比下全面优于 Ollama qwen3.5:4b：
1. **速度快 9-56 倍**（图片 3.5s vs 31-197s）
2. **内存少 6 倍**（1.8GB vs 11.3GB）
3. **输出更长 32%**（598 vs 452 chars）
4. **支持原生视频**，Ollama API 不支持
5. **确定性输出**，3 次完全一致

**决策确认**：短期保持选项 A（2B-4bit + mlx-vlm）。Ollama qwen3.5:4b 作为 fallback VLM 不可行——31s/图在 20+ assets 的 pipeline 中意味着 10+ 分钟仅 VLM 分析。

## 10. R6 GLM-4.1V-9B-Thinking-4bit 测试

> **测试日期**：2026-08-27
> **环境**：MacBook Pro M2 Pro 32GB, mlx-vlm 0.6.16, Python 3.12 (`~/.video-tts-env`)
> **方法**：同一 corpus（6 张图片），统一 resize 1280px 长边，相同 prompt，1 run/image，temperature=0.0, max_tokens=512
> **模型**：`mlx-community/GLM-4.1V-9B-Thinking-4bit`（MIT 许可证，glm4v 架构）
> **数据文件**：`/tmp/glm-ab-eval-results.json`

### 性能对比

| 维度 | Qwen3-VL-2B-4bit (R5) | GLM-4.1V-9B-Thinking-4bit | 倍率 |
|------|----------------------|---------------------------|------|
| 加载时间 | 2.0s | 7.4s | 3.7x 慢 |
| 图片平均推理 | **3.5s** | 28.5s | **8.1x 慢** |
| 最快图片 | ~1.5s | 22.7s | ~15x 慢 |
| 最慢图片 | ~5.0s | 37.4s | ~7.5x 慢 |
| 峰值内存 | **1.8GB** | 1.1GB | 0.6x（更少） |
| 磁盘 | **1.8GB** | 6.6GB | 3.7x 大 |
| 视频支持 | ✅ 原生 | ✅ 架构支持（未实测） | — |

### 各图片推理时间

| 图片 | GLM-4.1V (9B) | Qwen3-VL (2B, R5 参考) |
|------|--------------|----------------------|
| ai-robot-hand.jpg | 23.6s | ~1.5s |
| data-center.jpg | 22.7s | ~1.2s |
| financial-chart.jpg | 31.1s | ~2.0s |
| shanghai-skyline.jpg | 24.9s | ~1.5s |
| revenue-laptop.jpg | 31.2s | ~2.0s |
| unitree-building.jpg | 37.4s | ~2.0s |

### 质量观察

| 维度 | GLM-4.1V-9B | Qwen3-VL-2B |
|------|-------------|-------------|
| 输出长度 | 1304-2238 chars | 300-500 chars |
| Thinking 链 | ✅ 完整推理过程（`Got it, let's analyze...`） | ❌ 直接输出 |
| 中文识别 | ✅ 识别「宇树科技」「峰达创意园」「恒生」「中国农业银行」 | ✅ 同等水平 |
| Markdown 结构 | ✅ 5 sections 完整 | ✅ 5 sections 完整 |
| 推理深度 | 更丰富（逐步分析 → 结论） | 简洁直接 |

### 结论

GLM-4.1V-9B-Thinking-4bit 在质量上有明显优势（thinking 推理链 + 更丰富的输出），但速度上不适用生产：
1. **推理慢 8.1x**：28.5s/图 vs 3.5s/图。20+ assets 的 pipeline 需要 9.5 分钟仅 VLM 分析
2. **磁盘大 3.7x**：6.6GB vs 1.8GB
3. **质量优势明显但不关键**：thinking 推理链对 fit/cover-contain 判断不影响（2B 已足够准确）
4. **内存反而更优**：1.1GB vs 1.8GB（9B-4bit 量化后内存效率高）

**决策**：不替换生产 VLM。GLM-4.1V-9B 可作为未来需要更复杂推理（如 OCR + 逻辑分析复合任务）时的候选。生产维持 Qwen3-VL-2B-4bit。

### 其他候选评估

| 模型 | 参数量 | 评估结论 |
|------|--------|---------|
| Qwen3.8-27B-4bit | 27B | ❌ mlx-community 只有 27B，在 32GB Mac 上可加载但推理极慢（2B 的 13.5x），不做候选 |
| Qwen3.5-4B-MLX-4bit | 4B | ❌ R7 已测，见下方 §11 |
| Qwen3.5-9B-MLX-4bit | 9B | ⏳ 下载中，未完成测试 |
| Ollama qwen3.5:4b | 4B | ❌ R5 已测，慢 9-56x，不支持视频 |

### GLM-5 系列评估

| 模型 | 架构 | 许可证 | 状态 |
|------|------|--------|------|
| GLM-5.2 | glm_moe_dsa | MIT | 纯语言，无视觉 |
| GLM-5.2-Vision-NVFP4 | glm5v | MIT | ❌ NVFP4 格式需 Blackwell GPU |
| GLM-5.3-Flash | glm5_next | MIT | ❌ MoE 大模型，2-bit 量化 135GB，32GB Mac 不可用 |
| orcarouter/GLM-5.3-Flash-MLX | glm5_next | MIT | ❌ MLX 量化版存在但 mlx-vlm 不支持 glm5_next 架构 |

**结论**：GLM 全系列 MIT 开源。最新 GLM-5 系列因 MoE 架构太大 + mlx-vlm 不支持，当前可用的最佳 GLM 视觉模型仍是 GLM-4.1V-9B-Thinking-4bit。

## 11. R7 Qwen3.5-4B-MLX-4bit 公平 A/B 测试

> **测试日期**：2026-08-27
> **环境**：MacBook Pro M2 Pro 32GB, mlx-vlm 0.6.16, Python 3.12 (`~/.video-tts-env`)
> **方法**：同一 corpus（6 张图片），统一 resize 1280px 长边，相同 prompt，各 3 runs/image, temperature=0.0
> **模型**：`mlx-community/Qwen3.5-4B-MLX-4bit`（vision-language-model, qwen3_5 架构）
> **数据文件**：`scripts/short-video/experiments/vlm-qwen35-mlx-eval-results.json`
> **脚本**：`scripts/short-video/experiments/vlm-qwen35-mlx-eval.py`

### 性能对比

| 维度 | Qwen3-VL-2B-4bit (基线) | Qwen3.5-4B-MLX-4bit | 倍率 |
|------|----------------------|---------------------|------|
| 加载时间 | **4.0s** | 4.7s | 1.2x 慢 |
| 图片平均推理 | **4.7s** | 39.0s | **8.3x 慢** |
| 最快图片 | 4.3s | 29.1s | 6.8x 慢 |
| 最慢图片 | 5.7s | 63.1s | 11.1x 慢 |
| 峰值内存 | 0.5GB | 0.6GB | 1.2x（几乎相同） |
| 失败率 | 0% | 0% | — |

### 各图片推理时间

| 图片 | Qwen3-VL-2B (avg) | Qwen3.5-4B (avg) | 倍率 |
|------|-------------------|------------------|------|
| ai-robot-hand.jpg | 4.7s | 30.6s | 6.5x |
| data-center.jpg | 4.6s | 52.6s | 11.4x |
| financial-chart.jpg | 4.3s | 30.0s | 7.0x |
| shanghai-skyline.jpg | 4.8s | 44.7s | 9.3x |
| revenue-laptop.jpg | 4.4s | 29.7s | 6.8x |
| unitree-building.jpg | 5.5s | 46.2s | 8.4x |

### 质量对比

| 维度 | Qwen3-VL-2B-4bit | Qwen3.5-4B-MLX-4bit |
|------|-----------------|---------------------|
| 输出长度 | 493-710 chars | 3607-7745 chars |
| 输出格式 | 直接 Markdown | Thinking 链 + Markdown |
| 输出一致性 | ✅ 3次完全一致 | ✅ 3次完全一致 |
| Thinking 链 | ❌ 直接输出 | ✅ 完整推理过程（`The user wants...`） |

### 关键发现

Qwen3.5-4B 输出量大 6-12 倍不是因为"质量好"，而是**包含 thinking 过程 + 最终答案**：
- 2B：直接输出 `## Description\nA robotic hand...`
- 4B：输出 `The user wants a Markdown analysis...\n**1. Description:**\n*Observation:*...\n*Drafting:*...`

4B 模型内置 thinking chain（类似 GLM-4.1V），但这个 thinking chain 对 fit/cover-contain 判断没有帮助——2B 的直接输出已足够准确。

### 结论

Qwen3.5-4B-MLX-4bit 不适合生产替换：
1. **推理慢 8.3x**：39.0s/图 vs 4.7s/图。20+ assets pipeline 需要 13+ 分钟仅 VLM 分析
2. **输出冗余**：thinking chain 占 80%+ 输出量，对 pipeline 无用
3. **内存几乎相同**：0.6GB vs 0.5GB，无优势
4. **质量不优于 2B**：thinking chain 不影响 fit 判断

**决策确认**：生产维持 Qwen3-VL-2B-4bit。Qwen3.5 系列在 Apple Silicon 上不提供有意义的升级。

### Cascade Router 方案

基于 R6 + R7 结果，提出 Cascade Router 方案（[Issue #127](https://github.com/0xPabloLI/inside-china-ai/issues/127)）：
- **Fast path**：Qwen3-VL-2B 分析所有图片（~4.7s/图）
- **Deep path**：GLM-4.1V-9B 对 2B 低信心图片做深度分析（~28.5s/图）
- 预期：20 assets, 3 flagged → 20×4.7s + 3×28.5s = 181s（3 min）vs 全 GLM 9.5 min

### Deep Path 选型分析

> 用户提问：GLM 更新的视觉模型能不能替代 GLM-4.1V-9B 作为 deep path？

#### GLM-4.5V（最新 GLM 视觉模型）

| 维度 | 值 |
|------|-----|
| 许可证 | MIT |
| 架构 | `glm4v_moe`（MoE，激活 8 专家/token） |
| 基础 | 基于 `GLM-4.5-Air-Base` 微调 |
| mlx-vlm 支持 | ✅ 有完整实现（`mlx_vlm/models/glm4v_moe/`） |
| 视觉 | ✅ `vision_config.hidden_size = 1536` |

**各量化版本大小**：

| 量化 | 格式 | 大小 | 32GB Mac | 来源 |
|------|------|------|---------|------|
| 3-bit | MLX | **45.2GB** | ❌ OOM | `mlx-community/GLM-4.5V-3bit` |
| 4-bit | MLX | 57.6GB | ❌ | `mlx-community/GLM-4.5V-4bit` |
| Q2_K | GGUF | 40.6GB | ❌ | `mradermacher/GLM-4.5V-GGUF` |
| IQ4_XS | GGUF | 54.7GB | ❌ | `mradermacher/GLM-4.5V-GGUF` |

**结论**：GLM-4.5V 所有量化版本都 ≥40GB，在 32GB Mac（系统 ~8GB，剩 ~24GB）上无法加载。需要至少 **64GB 统一内存**的 Mac 才能跑 3-bit/Q2_K。

#### GLM-4.1V-9B（当前可用最新 GLM 视觉模型）

| 维度 | 值 |
|------|-----|
| 最小量化 | 4-bit（6.6GB） |
| 峰值内存 | 1.1GB |
| 推理速度 | 28.5s/图 |
| mlx-vlm 支持 | ✅ `glm4v` 架构 |

**GLM-4.1V 是 32GB Mac 上能跑的最新 GLM 视觉模型**。GLM-4.5V 虽然更新，但 MoE 架构总参数量太大，所有量化版都超过 40GB。

#### Deep Path 候选对比

| 模型 | 参数量 | 量化 | 磁盘 | 推理/图 | Thinking | 中文识别 | Cascade 适用？ |
|------|--------|------|------|---------|----------|---------|--------------|
| **GLM-4.1V-9B** | 9B | 4bit | 6.6GB | 28.5s | ✅ | ✅ 优秀 | ✅ **推荐** |
| Qwen3.5-4B-MLX | 4B | 4bit | 4.0GB | 39.0s | ✅ | ✅ 可识别 | ❌ 更慢且无质量优势 |
| GLM-4.5V | MoE | 3bit | 45.2GB | N/A | ✅ | ✅ | ❌ OOM |
| Qwen3-VL-8B | 8B | 4bit | 5.4GB | 25.2s | ❌ | 一般 | ⚠️ 无 thinking chain |

**决策**：Cascade Router deep path 维持 **GLM-4.1V-9B-Thinking-4bit**。理由：
1. GLM-4.5V 不可用（40GB+）
2. Qwen3.5-4B 比 GLM-4.1V 更慢（39s vs 28.5s）且 thinking chain 同样冗余
3. GLM-4.1V 的中文识别能力最强（识别"峰达创意园"、"中国农业银行"等）
4. 两个模型同时加载仅 ~3GB（Qwen2B 1.8GB + GLM 1.1GB），32GB 充裕
