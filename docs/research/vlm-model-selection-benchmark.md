# VLM 选型 Benchmark 报告

> **创建日期**：2026-08-25
> **关联 ADR**：`docs/adr/0009-vlm-qwen3-vl-mlx.md`
> **原始数据**：`scripts/short-video/experiments/vlm-benchmark-results.json` (R1)、`vlm-benchmark-results-r2.json` (R2)、`vlm-benchmark-results-r3.json` (R3)
> **Judge 结果**：`scripts/short-video/experiments/vlm-judge-results.md` (R1)、`vlm-judge-results-r2.md` (R2)、`vlm-judge-results-r3.md` (R3)

---

## 1. 背景

视频管线使用 VLM 对素材进行语义分析：描述内容、识别主体、判断 fit（cover/contain）、检测边缘文字。需在 Apple Silicon M2 Pro 32GB 上本地运行，无 per-call API 费用。

## 2. 候选模型

Qwen3-VL 全系列均为 Apache-2.0，支持商用。2B/4B/8B/30B-A3B/32B/235B-A22B 六个尺寸。

| 模型 | 参数量 | 量化 | 磁盘 | MLX 加速 | 测试状态 |
|------|--------|------|------|----------|----------|
| Qwen3-VL-2B-Instruct-4bit | 2B | 4bit | 1.8GB | ✅ mlx-vlm | ✅ R1+R2 |
| Qwen3-VL-2B-Instruct-8bit | 2B | 8bit | 2.9GB | ✅ mlx-vlm | ✅ R2 |
| Qwen3-VL-4B-Instruct-4bit | 4B | 4bit | 2.9GB | ✅ mlx-vlm | ✅ R2 |
| Qwen3-VL-4B-Instruct-8bit | 4B | 8bit | 4.8GB | ✅ mlx-vlm | ✅ R3 |
| Qwen3-VL-8B-Instruct-4bit | 8B | 4bit | 5.4GB | ✅ mlx-vlm | ✅ R3 |
| Qwen3-VL-8B-Instruct-8bit | 8B | 8bit | 9.2GB | ✅ mlx-vlm | ✅ R1（当前生产） |

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
- Python venv：`~/.video-tts-env`（Python 3.12），mlx-vlm 0.6.13
- 6 张真实项目素材图片（5 张 1080×1920 + 1 张 3468×4624）+ 1 个视频

### 性能对比

| 模型 | 加载 | 普通图 avg | unitree-building (3468×4624) | 峰值内存 | 磁盘 |
|------|------|-----------|------------------------------|---------|------|
| 2B-4bit | 2.6s | 6.5s | 82s | 1.3GB | 1.8GB |
| 2B-8bit | 1.6s | 7.1s | 78s | 3.2GB | 2.9GB |
| 4B-4bit | 1.6s | 11.5s | 108s | 4.5GB | 2.9GB |
| 4B-8bit | 4.0s | 11.5s | 164s | 0.8GB | 4.8GB |
| 8B-4bit | 3.6s | 25.2s | 385s | 1.8GB | 5.4GB |
| 8B-8bit | 5.7s | 20.4s | 232s | ~11GB | 9.2GB |

### 高分辨率幻觉（关键发现）

**2B/4B-4bit/8B-8bit 在 3468×4624 图上会幻觉**，且幻觉是概率性的。4B-8bit 和 8B-4bit 在 R3 中未幻觉：

| 模型 | Round 1 | Round 2 | Round 3 |
|------|---------|---------|---------|
| 2B-4bit | ✅ 正确识别 "Unitree/宇树科技" | ❌ 幻觉为 "digital sign, TALKING HEAD" | — |
| 2B-8bit | — | ❌ 严重幻觉（循环输出 2002 字符） | — |
| 4B-4bit | — | ❌ 幻觉为 "supermarket/warehouse" | — |
| 4B-8bit | — | — | ✅ 正确识别 "Unitree 宇树科技" 和 "峰达创意园" |
| 8B-4bit | — | — | ✅ 合理描述（"multi-story building with ribbed facade"），未提品牌名但无幻觉 |
| 8B-8bit | ❌ 幻觉为 "麦田/油菜花田" | — | — |

**结论**：高分辨率图幻觉在 2B 和 4B-4bit 上最严重。4B-8bit 和 8B-4bit 表现更好，但样本量不足以排除概率性。图片预处理（resize ≤1920px）仍是必要的安全措施。

### 普通图（1080×1920）质量对比

所有模型在普通分辨率图上质量相当。2B 系列在中文品牌识别上略优（识别 "恒生"、"宇树科技"、"SFCB" 等具体品牌名），4B 在细节描述上略丰富（"mesh doors"、"wooden desk"），8B 描述更精炼。LLM-as-Judge 盲评：R1 2B-4bit 84/102 vs 8B-8bit 72/102；R3 4B-8bit 83/102 vs 2B-4bit 75/102（2B-4bit 在普通图上略优 72 vs 70，但高分辨率图幻觉拉低总分）。

### 视频分析

**根因已定位**：mlx-vlm `generate()` API 调用不走 `resolve_video_inputs()` 帧提取 fallback。Qwen3-VL 有 `video_processor` 组件，`processor_handles_video()` 返回 True，所以视频直接传给原生处理器。但原生处理器有 `broadcast_shapes` bug（帧提取返回空数组 shape `(0,)`，与 token shape `(N,)` 不匹配）。`resolve_video_inputs` 只在 CLI 入口 `main()` 中被调用，Python API 调用绕过了它。

**升级 mlx-vlm 0.6.13 → 0.6.16 未修复**：同样的 `broadcast_shapes` 错误。

**已验证的 workaround**：手动调用 `sample_video_frames()` 提取帧 + `subsample_evenly()` 取 8 帧 + 作为多图输入 `generate(image=frames)`。4B-8bit 测试成功，18.4s 生成准确描述："A humanoid robot demonstrates its real-time, multi-modal capabilities by performing various household tasks across different rooms..."。这应该在 `vlm_analyzer.py` 中实现，而非等 mlx-vlm 修复。

## 5. 社区评价汇总

| 要点 | 来源 |
|------|------|
| "8B is the safer default when you have 12 GB+ VRAM and care about document accuracy" | codersera.com |
| "4B is the right pick for tight memory budgets and high-throughput batch jobs" | codersera.com |
| "2B handles basic OCR and captioning, 4B is noticeably more accurate on documents" | codersera.com |
| "Q4_K_M 是默认甜点，Q8_0 接近全精度，Q2_K 不推荐用于视觉任务" | codersera.com |
| Qwen3-VL 全系列 Apache-2.0，256K context，39 languages OCR | arXiv:2511.21631 |
| Qwen3.5/3.6 已统一 text+VL（不再分 VL 模型），但 MLX VLM 版只有第三方转换 | huggingface.co |

## 6. 选型建议

### 推荐：2B-4bit + 图片预处理

| 维度 | 2B-4bit | 4B-4bit | 4B-8bit | 8B-4bit | 8B-8bit |
|------|---------|---------|---------|---------|---------|
| 普通图质量 | 相当 | 相当 | 相当 | 相当 | 相当 |
| 速度 | **6.5s** ✅ | 11.5s | 11.5s | 25.2s | 20.4s |
| 内存 | **1.3GB** ✅ | 4.5GB | 0.8GB | 1.8GB | ~11GB |
| 加载 | 2.6s | 1.6s | 4.0s | 3.6s | 5.7s |
| 高分辨率幻觉 | 有（需预处理） | 有（需预处理） | 无（R3 未幻觉） | 无（R3 未幻觉） | 有（需预处理） |
| 中文品牌识别 | **略优** ✅ | 一般 | **优** ✅ | 一般 | 一般 |
| 标准 benchmark | 最低 | 中间 | 中间 | 较高 | 最高 |

**理由**：所有模型在普通分辨率图上质量相当。2B-4bit 速度最快、内存最小。4B-8bit 是有趣发现——内存仅 0.8GB（比 4B-4bit 的 4.5GB 低得多），速度与 4B-4bit 相当（11.5s/图），且在 R3 中高分辨率图未幻觉。但 2B-4bit 仍有速度优势（6.5s vs 11.5s）。图片预处理消除高分辨率幻觉后，2B-4bit 没有短板。

### 配置建议

- `MODEL_ID`：`mlx-community/Qwen3-VL-2B-Instruct-4bit`
- `FALLBACK_MODEL_ID`：`mlx-community/Qwen3-VL-8B-Instruct-8bit`
- 图片预处理：在 `vlm_analyzer.py` 中 resize >1920px 的图片到 1920px 长边
- 视频分析：升级 mlx-vlm 到 v0.6.15+ 后重新测试

## 7. 待办

- [x] 4B-8bit 和 8B-4bit 下载完成后补充测试 (R3 已完成)
- [x] 升级 mlx-vlm 到 0.6.16，重新测试视频分析（未修复，但找到 workaround：手动帧提取）
- [ ] 实现图片预处理（resize 大图到 ≤1920px）—— Issue #113
- [ ] 实现视频分析 workaround（手动帧提取 + 多图输入）
- [ ] 更新 `vlm_analyzer.py` 中的 MODEL_ID
- [x] 新建 GitHub issue 跟踪图片预处理 (#113)
