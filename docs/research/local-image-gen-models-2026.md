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
