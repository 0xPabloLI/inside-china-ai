# Handoff: VLM Cascade Router + Qwen3.5 Multi-Size Benchmark

> **日期**: 2026-08-27
> **状态**: 调研完成，Issue #127 已创建，Qwen3.5 测试已完成（R7），Cascade Router 方案已确定
> **关联**: `docs/research/vlm-model-selection-benchmark.md` §9-10, Issue #127

---

## 1. 背景

VLM 选型已完成多轮测试（R1-R6）。当前生产用 Qwen3-VL-2B-4bit (mlx-vlm)。
用户提出两个方向：
1. **Cascade Router**: 复杂图片路由到 GLM-4.1V-9B 做深度分析
2. **Qwen3.5 多尺寸测试**: 验证 Qwen3.5 系列是否有更好的选项

## 2. GLM 系列视觉模型调研

### GLM-4.1V-9B-Thinking-4bit（已测，R6）

| 维度 | 值 |
|------|-----|
| 许可证 | **MIT**（完全开源，可商用） |
| 架构 | glm4v（mlx-vlm 原生支持） |
| 参数量 | 9B |
| 4bit 磁盘 | 6.6GB |
| 加载时间 | 7.4s |
| 推理速度 | 28.5s/image (avg) |
| 峰值内存 | 1.1GB |
| Thinking 链 | ✅ 完整推理过程 |
| 中文识别 | ✅ 识别品牌名 |
| 视频支持 | ✅ 架构支持（未实测） |

### GLM-5.3-Flash（最新，但不可用）

| 维度 | 值 |
|------|-----|
| 许可证 | MIT（完全开源） |
| 架构 | glm5_next（**mlx-vlm 不支持**） |
| 类型 | MoE 大模型（62 个 shard） |
| 2-bit 量化 | **135GB**（不可能在 32GB Mac 上跑） |
| MLX 版 | orcarouter/GLM-5.3-Flash-MLX（有 2/3/4/6-bit 变体） |
| 状态 | ❌ 等 mlx-vlm 支持 glm5_next 架构 |

### GLM-5.2-Vision

| 维度 | 值 |
|------|-----|
| 许可证 | MIT |
| 架构 | glm5v（**mlx-vlm 不支持**） |
| 量化版 | baseten/GLM-5.2-Vision-NVFP4（NVFP4 格式，需 Blackwell GPU） |
| 状态 | ❌ 不适用 Apple Silicon |

### 结论

GLM 全系列都是 **MIT 许可证**，完全开源。但最新的 GLM-5 系列：
1. 是 MoE 大模型，2-bit 量化都 135GB，不可能在 32GB Mac 上跑
2. 使用 `glm5_next` / `glm5v` 架构，mlx-vlm 不支持
3. MLX 量化版（orcarouter）存在但无法加载

### GLM-4.5V 补充调研（2026-08-27）

GLM-4.5V 是比 4.1V 更新的视觉版本，mlx-vlm 有完整 `glm4v_moe` 实现：
- 架构：`glm4v_moe`（MoE，激活 8 专家/token）
- mlx-vlm 支持：✅ 完整（`mlx_vlm/models/glm4v_moe/` 有 config + language + vision + processing）
- 最小量化：3-bit MLX = **45.2GB**
- GGUF Q2_K = **40.6GB**
- 32GB Mac（系统 ~8GB，剩 ~24GB）→ ❌ OOM，需至少 **64GB 统一内存**

**当前可用的最佳 GLM 视觉模型是 GLM-4.1V-9B-Thinking-4bit**（6.6GB, 1.1GB 峰值内存, 28.5s/图）。

## 3. Cascade Router 方案

### 核心思路

| 路径 | 模型 | 速度 | 适用场景 |
|------|------|------|---------|
| Fast | Qwen3-VL-2B-4bit | ~3s/image | 标准图片（product demo, skyline, chart） |
| Deep | GLM-4.1V-9B-Thinking-4bit | ~28s/image | Router 标记的复杂图片 |

### Router 信号（should_escalate）

1. 输出长度 < 100 chars
2. `fit` 字段缺失或无效
3. 重复文本（reason section 循环）
4. 图片分辨率 > 1920px + content_kind = "other"

### 预期性能

- 20 assets, 3 flagged: 20×3s + 3×28s = **144s (2.4 min)**
- vs 全 GLM: 20×28s = **560s (9.3 min)**
- vs 全 Qwen2B: 20×3s = **60s (1 min)**

### 内存

- Qwen3-VL-2B: 1.8GB
- GLM-4.1V-9B: 1.1GB
- 同时加载: ~3GB（32GB Mac 充裕）

### GitHub Issue

[Issue #127](https://github.com/0xPabloLI/inside-china-ai/issues/127) 已创建。

## 4. Qwen3.5 评估（已完成）

### R5：Ollama qwen3.5:4b vs mlx-vlm Qwen3-VL-2B（不公平对比）

Ollama 跑视觉模型比 mlx-vlm 慢 5-7 倍且不支持视频 API。**不适用生产**。详见 benchmark §9。

### R7：Qwen3.5-4B-MLX-4bit 公平 A/B 测试

用 mlx-vlm 框架做公平对比（同一 corpus、同一预处理、同一 prompt）。详见 benchmark §11。

| 维度 | Qwen3-VL-2B-4bit | Qwen3.5-4B-MLX-4bit | 结论 |
|------|-----------------|---------------------|------|
| 推理速度 | **4.7s/图** | 39.0s/图 | 8.3x 慢 |
| Thinking 链 | ❌ 直接输出 | ✅ 但对 fit 判断无用 | 冗余 |
| 内存 | 0.5GB | 0.6GB | 无差异 |
| 质量 | 足够 | 不优于 2B | 无优势 |

**结论**：Qwen3.5-4B 不适合生产替换，也不适合 Cascade Router deep path（比 GLM-4.1V 更慢且无质量优势）。

### Qwen3.8 系列

- 只有 27B，32GB Mac 可加载但推理极慢（2B 的 13.5x）
- 需要至少 **48GB RAM**，当前设备不适用

### Qwen3.5 其他尺寸

| 尺寸 | 评估 |
|------|------|
| 2B | 与 Qwen3-VL-2B 同参数量，但 Qwen3.5 统一了 text+VL（不再有独立 VL 模型），MLX VLM 版只有第三方转换 |
| 9B-MLX | 下载中未完成测试，但 R7 已确认 4B 比 GLM-4.1V 更慢（39s vs 28.5s），9B 只会更慢 |

### 冒牌模型风险

`QwennAI/Qwen3.9-245B-A29B` 是冒牌模型（author 是 `QwennAI` 不是 `Qwen`）：
- 201 downloads, 2 likes
- `pipeline_tag: text-generation`（不支持视觉）
- 安装冒牌模型的风险：
  - **后门注入**: 模型权重中可能植入恶意行为（如生成特定触发词时输出恶意代码）
  - **数据收集**: 推理时可能被设计为输出特定内容引导用户访问恶意 URL
  - **能力虚标**: 声称支持 vision 但实际不支持，浪费磁盘和时间
  - 模型权重是二进制文件，无法人工审查，只有可信 author 的模型才安全

## 5. 待办

- [x] Qwen3.5:4b-mlx A/B 测试完成（R7）
- [x] 根据 Qwen3.5 测试结果更新 `vlm-model-selection-benchmark.md`（§11 已写入）
- [ ] 实现 Cascade Router（Issue #127）
- [ ] 端到端 pipeline 测试
