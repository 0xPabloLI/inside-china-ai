# 本地图片生成模型选型（2026-09-20 最终版）

## 背景
- 硬件：Apple M2 Pro / 32GB 统一内存 / MLX
- 用途：短视频 B-roll 背景生成（抽象数据可视化、科技氛围图，无文字）
- 限制：huggingface.co 被 Clash TUN 拦截，hf-mirror.com 可用；gated 模型需 Chrome 手动授权
- VLM 评估：CodeArts 内置 analyzeImage 工具（多模态视觉模型，具体模型名未暴露）

## 对比方法
- 3 个相同 B-roll prompt（柱状图 / 架构图 / 数据流）+ 相同 seed=42 + 1024×1024
- 每个模型生成 3 张图，VLM 客观评分 prompt 遵循度 / 视觉质量 / B-roll 适用性 / 缺陷

## 6 模型参数对比

| 模型 | Repo | 参数 | 量化 | 步数 | 速度 | Peak MLX | 缓存 | License |
|------|------|------|------|------|------|----------|------|---------|
| Z-Image Turbo | filipstrand/Z-Image-Turbo-mflux-4bit | 6B | 4bit | 9 | 158s | 10.7GB | 5.5GB | Tongyi Qianwen |
| FLUX.2-klein-4B | black-forest-labs/FLUX.2-klein-4B | 4B | bf16 | 4 | 42s | 12.4GB | 20GB | Apache 2.0 |
| ERNIE-Turbo | baidu/ERNIE-Image-Turbo | 8B | 4bit | - | 265s | - | 31GB | - |
| FLUX.2-klein-9B | black-forest-labs/FLUX.2-klein-9B | 9B | 4bit | 4 | 120s | 15.3GB | 49GB | ⚠️ 非商业 |
| **Boogu Turbo** | **Boogu/Boogu-Image-0.1-Turbo** | **10B** | **4bit** | **4** | **364s** | **-** | **36GB** | **Apache 2.0** |
| Krea 2 Turbo | krea/Krea-2-Turbo | 12B | 4bit | - | 271s | - | 58GB | - |

## VLM 客观排名

| Prompt | Z-Image 6B | FLUX.8B 4B | ERNIE 8B | FLUX.2 9B | Boogu 10B | Krea 2 12B |
|--------|-----------|-----------|---------|----------|----------|-----------|
| 柱状图 | ❌ 误解为箭头 | ✅ 2柱正确 | ✅ 2柱平淡 | ⭐5.0 完美 | ⭐5.0 3柱递减 | ⚠️ 多余元素 |
| 架构图 | ❌ 生成了手 | ✅ 完全符合 | ✅ 平淡 | ⭐4.8 优秀 | ⭐5.0 电路板 | ⚠️ 偏离prompt |
| 数据流 | ❌ 又生成了手 | ✅ 过曝但可用 | - | ⭐5.0 卓越 | - | - |

## 最终排名与选型决策

| 排名 | 模型 | 优势 | 劣势 |
|------|------|------|------|
| 🥇 | FLUX.2-klein-9B | 3张全5/5零缺陷，120s/张 | ⚠️ **非商业许可** → 淘汰 |
| 🥈 | **Boogu Turbo** | 2个prompt第一，Apache 2.0 | 364s/张较慢 |
| 🥉 | FLUX.2-klein-4B | 42s最快，3prompt全正确 | 4B参数上限 |
| 4 | ERNIE 8B | 正确无缺陷 | 视觉平淡 |
| 5 | Krea 2 12B | 视觉精致 | 偏离prompt加多余元素 |
| 6 | Z-Image Turbo 6B | - | 2/3生成了手（"no hands"理解失败） |

**最终选定：Boogu Image Turbo** — FLUX.2-9B 质量最好但非商业许可不可用；Boogu 是 Apache 2.0 可商用、质量仅次于 FLUX.2-9B 的最佳选择。

## Boogu 模型背景
- 来源：香港中文大学 (CUHK) + 香港科技大学 (HKUST) 学术团队
- 论文：arXiv:2607.13125 (2026.07.14)，33 位作者
- 训练成本：仅 ~$400K（208M 图片）
- 特色：中英双语、理解+生成统一模型、agentic prompt rewriting
- 变体：Base / Turbo / Edit / Edit-Turbo
- 注意：标注 "research project only, not an official model release"

## 代码变更
- `scripts/short-video/lib/b-roll/t2i-runner.mjs`：默认模型从 Z-Image Turbo 切换为 Boogu
  - DEFAULT_IMAGE_BACKEND = "mflux-boogu"
  - DEFAULT_IMAGE_MODEL = "Boogu/Boogu-Image-0.1-Turbo"
  - DEFAULT_IMAGE_QUANTIZE = 4
  - DEFAULT_IMAGE_STEPS = 4
  - EST_SECONDS_PER_IMAGE = 364
- 测试文件同步更新，28 个测试全部通过

## 已删除模型缓存
Z-Image Turbo (5.5GB) + FLUX.2-klein-4B (20GB) + ERNIE (31GB) + FLUX.2-klein-9B (49GB) + Krea 2 (58GB) = ~163GB 释放
---

## 补充调研：Qwen-Image 系列（2026-09-27）

### 遗漏根因

原调研（2026-09-20）未纳入 Qwen-Image 系列。根因是 web-deep-research 搜索查询未覆盖 "Qwen Image" 线，偏向 FLUX/ERNIE/Krea/Z-Image/Boogu。按 HF T2I likes 排序，Qwen 家族占前几名（2.66k/2.38k/964 likes），当时一个都没纳入——是查询覆盖疏漏，非时间差。Qwen-Image-2.1（2026-09-21 发布）与调研定稿时间几乎重叠，这个属时间差。

### 三个 Qwen-Image 模型

| 模型 | Repo | 参数 | 许可 | 商用 | 发布 | HF likes | MLX 4bit |
|------|------|------|------|------|------|----------|----------|
| Qwen-Image（第一代）| Qwen/Qwen-Image | 20B | **Apache 2.0** | ✅ | 2025-08-04 | 2.66k | `SirSahOl/Qwen-Image-mlx-4bit` |
| **Qwen-Image-2512** | Qwen/Qwen-Image-2512 | 20B | **Apache 2.0** | ✅ | 2025-12-31 | 964 | `mlx-community/Qwen-Image-2512-4bit`（25.9GB）|
| Qwen-Image-2.1 | Qwen/Qwen-Image-2.1 | 7B | **qwen-research（非商业）** | ❌ 需申请 | 2026-09-21 | 2.38k | `mlx-community/Qwen-Image-2.1-MLX-4bit`（10.5GB）|

- **Qwen-Image-2512**：官方称"AI Arena 10000+ 轮盲评最强开源 T2I"，第一代 12 月升级版（人物真实感+自然细节+文字渲染），用 `QwenImagePipeline`，arXiv 2508.02324。**最高优先级生产候选**。
- **Qwen-Image-2.1**：7B，用 `QwenImage21Pipeline`（需 transformers>=5.17），T2I + 图像编辑 + RGBA 透明图。License 原文 Section 2a "FOR NON-COMMERCIAL PURPOSES ONLY"，商用申请 `model-business@notice.qwencloud.com`。**仅作质量上限参考**。
- **Qwen 品牌没有 T2V**，阿里 T2V 在 Wan-AI 组织（Wan2.1/Wan2.2），本项目已在用 Wan2.2-S2V。

### MLX 4bit 可行性

- mflux 0.20.0 已装（从 0.19.1 升级），`mflux-generate-qwen`（2512）和 `mflux-generate-qwen-2.1`（2.1）命令均可用，支持 `--low-ram` + `--vae-tiling`（降内存）+ `--quantize {3,5,4,6,8}` + 内置 LoRA 风格。
- **Qwen-Image-2512-4bit**：mflux 直接支持（`mflux-generate-qwen` 命令），25.9GB 在 M2 Pro 32GB 上用 `--low-ram --vae-tiling` 可跑，Peak MLX 27.07GB。
- **Qwen-Image-2.1**：mflux 0.20.0 原生支持（`mflux-generate-qwen-2.1` 命令）。需 bf16 原版（~33GB on disk），用 `-q 4` 运行时量化 transformer+VAE（text encoder 保持 bf16 不量化，因 "Quantization causes significant semantic degradation"）。Peak MLX 15.50GB，M2 Pro 32GB 轻松。注意：mlx-community 的 4bit 版本（U32 量化格式）mflux 不兼容，必须用 bf16 原版。

### 2512 Space 的 prompt 改写

Qwen-Image-2512 的 HF Space demo 用 dashscope `qwen-plus` LLM 做 prompt 改写前处理（把简短 prompt 扩写成详细视觉描述），再喂给 `QwenImagePipeline`。这**不是模型内置**，是应用层工程封装。Qwen-Image-2.1 没有这层。任何模型都可仿照加这层（用 dashscope API / 本地 Qwen3 MLX / 任何 LLM）。

### 排除的候选

- **lodestones/Chroma**（1.37k likes，Apache 2.0）：标记 **Not-For-All-Audiences**（NSFW 训练数据，品牌风险）+ **无 MLX 量化版**（需自己量化或用 PyTorch+MPS），排除。

### 补测结果（2026-09-27）

3 个相同 B-roll prompt（柱状图 / 架构图 / 数据流）+ seed=42 + 1024×1024，与原调研一致。VLM 评分用 analyzeImage 工具。

#### Qwen-Image-2512-4bit vs Boogu Turbo

| Prompt | Qwen-2512（遵循度/视觉/B-roll） | Boogu（遵循度/视觉/B-roll） | 2512 耗时 | Boogu 耗时 |
|--------|------|------|------|------|
| 柱状图 | 3/3/3 | **5/5/5** | 923s | 121s |
| 架构图 | 4/4/3 | **5/5/5** | 3031s | 98s |
| 数据流 | 2/2/1 | **5/5/5** | 1292s | 97s |

- **Peak MLX memory**：Qwen-2512 27.07GB（`--low-ram --vae-tiling`）；Boogu 峰值未单独测量（上表 36GB 为磁盘缓存，非峰值内存）。
- **速度**：Boogu 快 ~16 倍（平均 105s vs 1749s/张）。
- **Qwen-2512 问题**：柱状图只有 2 根柱子（非 3 根递减），玻璃质感非发光；架构图风格化过度（像魔法阵不像架构图）；数据流严重偏离 prompt，模糊低质，疑似生成失败。
- **结论**：**B-roll 场景下 Boogu Turbo 保持冠军，Qwen-Image-2512 不推荐替换。** Qwen-2512 可能更适合写实/人物场景（其官方定位），但 B-roll 抽象数据可视化场景不是其强项。

#### Qwen-Image-2.1（mflux 0.20.0 + bf16 原版 -q 4）

- **mflux 0.20.0 原生支持**：CLI 命令 `mflux-generate-qwen-2.1`，Python API `from mflux.models.qwen21.variants.txt2img.qwen_image_21 import QwenImage21`。
- **之前 "mflux 不兼容 2.1" 的结论是错的**——根因是 mflux 0.19.1 太旧（无 qwen21 模块），0.20.0 已加入 `models/qwen21/`。
- **mlx-community 4bit 版本不兼容**：权重是 MLX 量化格式（U32 + scales + biases），mflux 期望 bf16 原版然后运行时量化。必须下载 bf16 原版 `Qwen/Qwen-Image-2.1`（~33GB）。
- **下载**：从 ModelScope（国内 ~5-10MB/s）aria2 多线程下载 bf16 原版到 `/tmp/t2i-models/qwen-2.1-bf16/`，约 50 分钟。
- **运行参数**：`mflux-generate-qwen-2.1 --model /tmp/t2i-models/qwen-2.1-bf16 -q 4 --low-ram --vae-tiling --steps 40`（40 步 guidance-free 是官方推荐默认）。
- **Peak MLX 15.50GB**（text encoder bf16 ~17.5GB 逻辑上不量化，但 --low-ram 分段加载实际 peak 15.5GB），M2 Pro 32GB 轻松。

| Prompt | Qwen-2.1（遵循度/视觉/B-roll） | 2.1 耗时 | Peak MLX |
|--------|------|------|------|
| 柱状图 | 5/5/4 | 845s | 15.44GB |
| 架构图 | 5/4/5 | 866s | 15.50GB |
| 数据流 | 4/4/5 | 858s | 15.50GB |

- **Qwen-2.1 优势**：比 2512 质量好很多（总分 42/45 vs 25/45），Peak MLX 更低（15.5GB vs 27GB），支持 image editing / multi-reference editing / RGBA。
- **Qwen-2.1 劣势**：40 步 ~856s 比 Boogu 慢 8 倍，且非商业许可（需申请 model-business@notice.qwencloud.com）。
- **结论**：质量亚军，B-roll 场景仍不如 Boogu（42 vs 45，且慢 8 倍 + 非商业）。

### 补测最终结论

**Boogu Turbo 保持 B-roll T2I 冠军。** Qwen-Image 系列不推荐替换：

| 维度 | Qwen-2512 | Qwen-2.1 | Boogu（冠军） |
|------|-----------|----------|---------------|
| 总分 | 25/45 | 42/45 | **45/45** |
| 平均耗时 | 1749s | 856s | **105s** |
| Peak MLX | 27.07GB | 15.50GB | 36GB（磁盘缓存，非峰值；峰值未测） |
| 许可 | Apache 2.0 ✅ | qwen-research ❌ | Apache 2.0 ✅ |
| 步数 | 20 | 40 | 4 |

- **Qwen-Image-2512**：B-roll 抽象数据可视化场景质量全面不如 Boogu（25 vs 45），速度慢 16 倍。可能更适合写实/人物场景（其官方定位），但非本项目用途。
- **Qwen-Image-2.1**：质量亚军（42/45），比 2512 好很多，Peak MLX 最低（15.5GB），支持 image editing。但比 Boogu 慢 8 倍，且非商业许可需申请。**如果未来需要 image editing / multi-reference editing 功能，2.1 是唯一选项**（Boogu 不支持 editing）。
- 原选型决策（Boogu Turbo）不变。

### web-deep-research 流程优化建议

1. **热度榜系统筛**：按 HF T2I likes/downloads 排名取 top 30 作为候选池，不依赖搜索查询覆盖。
2. **厂商 org 页扫**：对已知厂商（Qwen/BlackForest/Stability/IDEogram/百度/腾讯）逐一扫其 HF org 页面，不漏新发布。
3. **候选标准显式化**：在调研文档开头声明纳入标准（参数范围/许可类型/MLX 可行性/发布时间窗口），便于检查覆盖性。
