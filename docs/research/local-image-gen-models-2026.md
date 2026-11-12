# 本地图片生成模型选型（2026-09-20 最终版）

> **下游票**：#304（收口票；结论「维持 Boogu Turbo」已随 #155 / #1028 落到 `t2i-runner.mjs`，不再产生实施票，结论摘要与本报告路径见 #304 交付记录评论）。

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

---

## Round CLXXVI 收口补充（2026-11-12，#304）

> 本节是 **#304 的收口对账**，不改写上文两轮的冻结结论。上文 9 个候选的 M2 Pro 真机数据、VLM 排名与「Boogu Turbo 保持冠军」结论均已随 #155 / #1028 落到 `scripts/short-video/lib/b-roll/t2i-runner.mjs` 的 `IMAGE_BACKEND_SPECS`（默认 `mflux-boogu`）。票面「现状基线」写于 2026-09-14，其中「默认 Z-Image Turbo」「本机速度从未实测」两项已失效；票正文 write-once 不改，在此更正。

### 1. 候选证据卡与准入（AC ① / ②）

按 `model-sources-reference.md` §4 Step 7a 补齐「运行时版本」列；准入按 §模型选择通用标准分「可验证 / 需缓解 / 不适用」，只有可验证且证据卡完整者进 §2 评分。

| 候选 | 一手来源（repo） | 许可 | Apple Silicon 加速与运行时 | 验证日期 | 准入状态 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| **Boogu Turbo** | `Boogu/Boogu-Image-0.1-Turbo` | Apache-2.0 | mflux 0.20.0 `mflux-generate-boogu`，MLX 4bit | 2026-09-20 / 09-27 / 11-12 | **可验证**（现行默认） |
| FLUX.2-klein-4B | `black-forest-labs/FLUX.2-klein-4B` | Apache-2.0 | mflux 0.20.0 `mflux-generate-flux2`，bf16 | 2026-09-20 | **可验证**（缓存已删） |
| Z-Image Turbo | `filipstrand/Z-Image-Turbo-mflux-4bit` | Tongyi Qianwen（#274 裁为误标，维持无合规风险） | mflux `mflux-generate-z-image-turbo`，MLX 4bit | 2026-09-20 | **可验证** |
| Qwen-Image-2512 | `Qwen/Qwen-Image-2512` + `mlx-community/Qwen-Image-2512-4bit` | Apache-2.0 | mflux 0.20.0 `mflux-generate-qwen` + `--low-ram --vae-tiling` | 2026-09-27 | **可验证** |
| FLUX.2-klein-9B | `black-forest-labs/FLUX.2-klein-9B` | 非商业 | mflux MLX 4bit | 2026-09-20 | 需缓解（NC）→ 不进评分 |
| Qwen-Image-2.1 | `Qwen/Qwen-Image-2.1` | qwen-research 非商业 | mflux 0.20.0 `mflux-generate-qwen-2.1`，bf16 原版 `-q 4` | 2026-09-27 | 需缓解（NC）→ 不进评分 |
| ERNIE-Image-Turbo | `baidu/ERNIE-Image-Turbo` | 模型卡未标，未核 | mflux 0.20.0 `mflux-generate-ernie-image-turbo` | 2026-09-20 | 需缓解（许可未核）→ 不进评分 |
| Krea 2 Turbo | `krea/Krea-2-Turbo` | 模型卡未标，未核 | mflux 0.20.0 `mflux-generate-krea2` | 2026-09-20 | 需缓解（许可未核）→ 不进评分 |
| Qwen-Image（一代） | `Qwen/Qwen-Image` + `SirSahOl/Qwen-Image-mlx-4bit` | Apache-2.0 | MLX 4bit，未本机 smoke | 2026-09-27 登记 | 需缓解（证据卡不全）→ 不进评分 |
| MOSS-Image-SFT（新） | `OpenMOSS-Team/MOSS-Image-SFT`；`mflux-community/moss-image-sft-mflux-q4`（createdAt 2026-10-22） | Apache-2.0（HF API 一手核） | `mflux-generate-moss-image`；本机 mflux 0.20.0 未含该 CLI | 2026-11-12 登记，未实测 | 需缓解（运行时未验证）→ 不进评分 |
| GPT Image 2.6 / Nano Banana Pro | 闭源服务 | 无开放权重 | 无本机路径 | 2026-11 二手信源 | 不适用 |

非 Verified Author 的社区量化版（`mflux-community` / `vanch007` 等）只登记不提权，未做一手许可或质量背书。

### 2. 四维加权评分（AC ③）

口径：`model-sources-reference.md` §模型选择通用标准，各维 1–5 分，权重 Apple Silicon 30% / 许可 20% / 质量 30% / 社区 20%，并应用 2026-10-10 两处量规修正（加速按实测不按后端品牌；运行时不改精度则同分）。**本表是 2026-11-12 依既有证据回溯重建，不是 2026-09-20 当时的决策依据**——当时依据是 VLM 定性排名 + NC 淘汰，不是加权总分。

| 候选 | 加速 30% | 许可 20% | 质量 30% | 社区 20% | 加权总分 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| **Boogu Turbo** | 5 | 5 | 5 | 3 | **4.6** |
| FLUX.2-klein-4B | 5 | 5 | 3 | 5 | **4.4** |
| Qwen-Image-2512 | 1 | 5 | 2 | 5 | **2.9** |
| Z-Image Turbo | 4 | 3 | 1 | 3 | **2.7** |

打分依据：加速按本机实到耗时（Boogu 1024² 补测 97–121s、FLUX.2-4B 42s、Z-Image 158s、Qwen-2512 平均 1749s）；许可按 §1；质量按 B-roll 45 分制（Boogu 45/45、Qwen-2512 25/45、FLUX.2-4B 与 Z-Image 无 45 分制数据，依上文 VLM 定性 ✅ / 2-of-3 失败折算 3 / 1，**与 45 分制口径不可直接换算**）；社区按维护方与 mflux CLI 工具链（Boogu 模型卡自标 `research project only, not an official model release`，故记 3）。Boogu 与 FLUX.2-4B 仅差 0.2 且落在不可比的质量维度上，不足以推翻已落地的选型。

### 3. 本机实测对账（AC ④）

- **已做**：M2 Pro 32GB 上 9 个候选（6 模型 + 3 个 Qwen）同题 3 prompt（柱状图 / 架构图 / 数据流）+ seed=42 + 1024×1024，记录了耗时、Peak MLX 与 VLM 评分。
- **速度口径并列标注**：上文 9-20 表的 **364s/图** 是 832×1216 产线默认（runbook 沿用），9-27 补测的 **97–121s** 是 1024² 同题对比口径；两者分辨率与步数不同，不可直接相比，此处并列保留。
- **与票面 AC 的偏差**：`_t2i-smoke` fixture 确实存在（`scripts/short-video/content/_t2i-smoke/scene-data.mjs`，2026-09-08，单场景 transformer-memory 架构图，`node generate-broll.mjs --content _t2i-smoke`），但既有横评用的是自建 3 prompt + mflux CLI，**未走该 fixture**；因此「VLM gate 通过率」没有按产线 `b-roll-report.json` 口径统计，用的是 VLM 45 分制评分。这是口径偏差，不是等价替换。
- **Kaggle T4 参照：未执行**（用户 2026-11-12 批准豁免，见 §5）。

### 4. 2026-11-12 增量盘点（票面「新发布模型」项）

按 §4 搜索流程模板执行的**增量发现**，不是新一轮全量横评：

- **Step 1 策展**：本机 `~/.video-t2i-env/bin` 共 22 个 `mflux-generate-*` CLI（mflux **0.20.0**，2026-11-09 核），无 `moss-image`；HF T2I 标签。
- **Step 3 HF API（一手，2026-11-12，未认证，http 200）**：`hf-mirror.com/api/models?pipeline_tag=text-to-image&sort=likes&direction=-1&limit=5` → FLUX.1-dev (16111) / SDXL (8465) / SD1.4 (7146) / FLUX.1-schnell (6712) / `abenzerps/Qwen-Image-2.1-Turbo-Quantized` (5872, createdAt 2026-09-20)。前四条为 2022–2024 老权重，第五条是 Qwen-2.1 的二手量化（基础模型非商业）。
- **单模型一手核实**：`mflux-community/moss-image-sft-mflux-q4` → createdAt `2026-10-22`、license `apache-2.0`、tags `mflux/mlx/apple-silicon/text-to-image`、downloads 3309、likes 3；同族 bf16 26.2GB / Q4 7.5GB 见其模型卡。
- **发现**：**MOSS-Image-SFT**（OpenMOSS，2026-10-16，Apache-2.0，5B 单流 DiT + Qwen3.5-9B 文本编码器 + FLUX.2 VAE）是 9-27 定稿之后唯一「可商用 + 官方社区 MLX 量化版 + mflux CLI」的新候选；其差异化能力是长文本渲染（LLTB 96.3%）与 JSON 版面控制（7Bench mIoU 0.88），而本项目 B-roll 用途是**无文字的抽象数据可视化**，能力不对口。另有 FLUX 3 / klein 后续与 GPT Image 2.6 Flare/Sunburst（2026-11-04，闭源）来自 2026-10-19 / 10-26 二手简报，未做一手核实，后者标「不适用」。
- **覆盖性边界**：Step 2 GitHub API 广覆盖搜索、Step 5 ModelScope 与 Step 6 arXiv 全量分支本轮未执行，故本节不能宣称「2026 年新模型已全部盘点」；它是候选发现与结论稳定性复核。
- **结论维持 Boogu Turbo，不换后端**：MOSS-Image 的 5B / Q4 7.5GB + Apache-2.0 有潜在提速价值，但 B-roll T2I 不是端到端瓶颈（既有 `last-profile.json` 实测 TTS + render 占 95–99%），且其强项不对口本用途；没有足够理由改动产线默认后端。

### 5. 用户裁决、豁免与遗留（workflow §10 Exception）

**2026-11-12 用户裁决「核查式闭票」**：沿用既有真机数据补齐证据卡 / 四维评分 / 回填，**不补跑** Kaggle T4 参照与 MOSS-Image 本机实测，不另开重复票（用户 2026-11-07 约定：不新开第三份重复票）。

| AC | 状态 | 依据 / 偏差 |
| ---- | ---- | ---- |
| ① 候选清单 + 证据卡 | 已补齐 | 上文 9 候选 + §1 统一证据卡（运行时版本本轮补） |
| ② 准入 | 满足 | NC / 许可未核 / 证据卡不全者均标「需缓解」不进评分；社区量化版不提权 |
| ③ 四维加权评分 | 本轮补 | §2，回溯重建声明已标注 |
| ④ 本机 ≥2 候选 `_t2i-smoke` 同题 + Kaggle T4 ≥1 | **部分满足（含批准豁免）** | 本机 9 候选同题真机实测；未走 fixture、未按产线 gate 通过率统计（§3）；Kaggle T4 参照未执行 |
| ⑤ 结论回写 + 维持/更换建议 | 满足 | 本报告即结论：**维持现状（Boogu Turbo）**，不产生实现票草案 |

**豁免理由**：① 本地 MLX 是产线唯一 T2I 路径，Kaggle T4 参照不改变本地选型；② 按 `AGENTS.md` 云 GPU 路由优先级，MLX 本地已充分验证，云参照属可选参照而非前置；③ B-roll T2I 非端到端瓶颈；④ 新候选差异化能力不对口 B-roll 无文字抽象图用途。

**残余风险**：若后续出现「Apache-2.0 + mflux 原生 + 抽象图质量显著更优且更快」的新模型，本结论需复核；`~/.video-t2i-env` 的 mflux 升到含 `moss-image` CLI 的版本时，Boogu 默认路径需回归。如需实测，另立窄票，不在本轮扩面。

**下游票**：`#304`（结论摘要与本报告路径见该票交付记录评论；结论已落地，不再产生实施票）。
