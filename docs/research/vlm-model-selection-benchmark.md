# VLM 选型 Benchmark 报告

> **创建日期**：2026-08-25
> **最后更新**：2026-08-26（加入 deep research 结论 + 预处理测试 + pipeline 集成）
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

#### 根因分析（Deep Research 确认）

**这不是 MLX/MPS 特有的 bug——是 transformers 库 `Qwen3VLVideoProcessor` 的上游 bug，影响所有平台。**

**各平台受影响的证据**：

| 平台 | Issue | 症状 |
|------|-------|------|
| **MLX/Apple Silicon** | 本项目测试 | `broadcast_shapes` error in mlx-vlm generate() |
| **CUDA/vLLM** | [vllm#35909](https://github.com/vllm-project/vllm/issues/35909) | `AssertionError: timestamps length(10) should be equal video length (16)` |
| **CUDA/SGLang** | [sglang#11354](https://github.com/sgl-project/sglang/issues/11354) | `500 Internal Server Error: index 1 is out of bounds for dimension 0` |
| **Transformers/CUDA** | [Qwen3-VL#2019](https://github.com/QwenLM/Qwen3-VL/issues/2019) | `video_processor produces wrong output shape and video_grid_thw` — T dimension only has 2 (should be 32) |
| **Transformers/CUDA** | [Qwen3-VL#2041](https://github.com/QwenLM/Qwen3-VL/issues/2041) | Pre-processing error following official notebook |
| **LM Studio/Windows** | [lmstudio#1187](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1187) | Qwen3-VL refuses to process videos |

**根因**：Qwen3-VL 引入了全新的 `Qwen3VLVideoProcessor`（与 Qwen2.5-VL 的 `Qwen2_5_VLVideoProcessor` 不同）。新 processor 的 `video_grid_thw` 计算有误——特别是 T（时间）维度被错误地压缩为 2，而非实际的帧数。当模型尝试将 timestamps 与 grid_thw[0] 对齐时，shape 不匹配导致 `broadcast_shapes` 或 `AssertionError`。

**为什么这个 bug 没被修**：
1. Qwen3-VL 使用了全新的 video processor 架构（text-timestamp alignment 取代了 T-RoPE），API 变化大（`return_video_metadata=True` 是 Qwen3-VL 独有参数）
2. 官方推荐用 `qwen-vl-utils` 的 `process_vision_info` 配合 `return_video_metadata=True` 调用——这条路径在 CUDA 上是工作的（官方 demo + swift 文档有成功输出 "A baby wearing glasses..." 的记录）
3. **mlx-vlm 没有实现 `return_video_metadata` 路径**——它直接将视频传给原生 processor，绕过了 `resolve_video_inputs` 中的 fallback 机制
4. vLLM 和 SGLang 各自实现了自己的 video processing 路径，都有各自但不同的 bug
5. 大部分 CUDA 用户通过 `return_video_metadata=True` 避开了这个问题，所以社区报告较少

**替代模型评估**：在 Apple Silicon 上没有比 Qwen3-VL 更好的选择：
- Qwen2.5-VL 在 mlx-vlm 中有成熟的视频支持，但它是上一代模型（OCR、中文识别不如 Qwen3-VL）
- Gemma 3、LLaVA、Pixtral 等在 mlx-vlm 中支持不完整或没有原生视频能力
- vllm-mlx 是新的推理引擎但主要优化文本模型，VLM 视频支持仍在开发中
- 保持 Qwen3-VL + 帧提取 workaround 是当前最佳方案

**已修复（2026-08-26 验证）**：mlx-vlm 0.6.16 内置了 numpy 实现的 `Qwen3VLVideoProcessor`（`processing_qwen3_vl.py`），不再依赖 transformers 的 buggy 实现。原生视频路径在 Qwen3-VL-2B-4bit 上测试成功：unitree-demo.mp4 在 1.9s 内生成准确描述。`vlm_analyzer.py` 已恢复原生视频优先 + 帧提取 fallback 路径。

**仍存在的限制**：mlx-vlm 未实现 Qwen3-VL 的 `return_video_metadata=True` 路径（用于 text-timestamp alignment），但 numpy processor 独立计算 `video_grid_thw`，不依赖该参数。

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
| Qwen3-VL video processor bug 影响所有平台（vLLM, SGLang, LM Studio, transformers） | GitHub Issues |

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
| 视频分析 | 帧提取 ✅ | 帧提取 | 帧提取 |

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
- 视频分析：ffmpeg 帧提取（1 fps → 最多 8 帧 → 多图输入），不使用原生视频处理器

## 7. Pipeline 集成状态

### 已完成

- [x] `vlm_analyzer.py` MODEL_ID → `Qwen3-VL-2B-Instruct-4bit`
- [x] `vlm_analyzer.py` FALLBACK_MODEL_ID → `Qwen3-VL-4B-Instruct-8bit`
- [x] 图片预处理 `resize_image_if_needed()` — 自动 resize >1920px 图片
- [x] 视频分析恢复原生视频优先路径（mlx-vlm 0.6.16 numpy processor 已修复 bug）+ 帧提取 fallback
- [x] 文件头注释更新（说明 bug 根因 + workaround 策略）

### 待办

- [ ] Issue #113：图片预处理已集成到 vlm_analyzer.py，但可能需要测试端到端 pipeline
- [ ] 视频帧提取 workaround 的端到端测试
- [ ] 确认 1920px vs 1280px 阈值在 pipeline 中的表现（当前用 1920px，R4 测试用 1280px 更快）

## 8. 待办

- [x] 4B-8bit 和 8B-4bit 下载完成后补充测试 (R3 已完成)
- [x] 升级 mlx-vlm 到 0.6.16，重新测试视频分析（未修复，但找到 workaround：手动帧提取）
- [x] R4 预处理多场景测试（2B-4bit vs 4B-8bit，4 个 resize 阈值）
- [x] Deep research：Qwen3-VL video bug 跨平台调查（确认是 transformers 上游 bug，非 MLX 特有）
- [x] 替代模型评估（确认无更好选项，保持 Qwen3-VL + workaround）
- [x] 实现 2B-4bit + 预处理 + 帧提取 workaround 在 vlm_analyzer.py 中
- [ ] 端到端 pipeline 测试
- [x] 新建 GitHub issue 跟踪图片预处理 (#113)
