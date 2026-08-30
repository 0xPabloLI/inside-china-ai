# InfiniteTalk Modal 推理 Handoff

**日期**: 2026-08-29
**状态**: ❌ 推理完成但质量不达标，参数需调整

## 背景

在 Kaggle T4 GPU 上跑 InfiniteTalk 推理时遇到多个问题，Kaggle 30h GPU 配额耗尽，Colab 免费版 GPU 分配失败。转用 Modal 按需付费。

## 版本历史

### v10.11 (Kaggle, 成功)
- **结果**: 生成了 13 帧 0.52s 视频，使用了自带 example 数据
- **耗时**: ~7 小时
- **参数**: steps=40, teacache=0.2, frame_num=13, max_frame_num=13

### v10.12 (Kaggle, 成功)
- **结果**: 使用用户照片和声音生成了 13 帧视频
- **耗时**: ~3.5 小时
- **参数**: steps=15, teacache=0.3, frame_num=13, max_frame_num=81

### v10.13-v10.14 (Kaggle, 失败)
- max_frame_num=81 导致 streaming mode 多段生成，12h 超时
- SageAttention Triton 编译在 T4 上必失败但每次编译耗时几十秒

### v10.15 (Modal A100 40GB, ✅ 完成但质量不达标)
- **结果**: 576×704, 25fps, 76帧, 3s 视频，332.9 KB
- **耗时**: 75.9 分钟（推理），77.0 分钟（总计）
- **成本**: A100 $2.10/h × 1.28h ≈ $2.69
- **参数**: steps=5, teacache=0.35, max_frame_num=81, 3s 音频, num_persistent_param_in_dit=0
- **问题**: 表情太夸张 — **steps=5 对 InfiniteTalk 太少**（非蒸馏模型，官方推荐 40 步）

## Modal v10.15 修复历史

### Fix 1: transformers 5.x 要求 PyTorch >= 2.5（但用 torch 2.4.1）
- **根因**: `transformers>=4.49.0` 无上限 → Modal 安装了 transformers 5.16.1 → 报 `NameError: name 'nn' is not defined`
- **修复**: pin `transformers>=4.49.0,<5.0`，实际安装 4.55.4
- **同时**: torch 必须先安装（在 optimum-quanto 之前），否则 quanto 拉入 torch 2.13.0

### Fix 2: diffusers 0.31.0 没有 no_init_weights / ContextManagers
- **根因**: InfiniteTalk `multitalk.py` 用 `from diffusers.models.modeling_utils import no_init_weights, ContextManagers`，这两个函数在 diffusers 0.31.0 中已被移除
- **修复**: pin `diffusers==0.31.0`（InfiniteTalk requirements 只说 `>=0.31.0`），并在 patch 中用内联定义替换 import

### Fix 3: optimum-quanto Marlin FP8 kernel 需要 CUDA_HOME
- **根因**: optimum-quanto 在 `.to(device)` 时尝试 JIT 编译 Marlin FP8 kernel，需要 nvcc + CUDA headers，但 `debian_slim` 没有
- **修复**: 改用 `modal.Image.from_registry("nvidia/cuda:12.1.0-devel-ubuntu22.04", add_python="3.11")` 作为基础 image，自带完整 CUDA toolkit
- **同时**: 设置 `CUDA_HOME=/usr/local/cuda` 环境变量

### Fix 4: Modal heartbeat 超时 + spawn 被取消（推理耗时 >60 分钟）
- **根因**: `num_persistent_param_in_dit=0` 全 CPU offload，每步推理需要传输 19.5GB FP8 权重在 CPU↔GPU 之间，~76 分钟完成
- **症状 1**: Modal CLI heartbeat 在 ~68 分钟后超时断开
- **症状 2**: 即使使用 `spawn()` 异步推理，本地 CLI 退出后 spawn 的函数也被取消
- **修复**: `modal run --detach` 标志确保 CLI 断开后 app 继续运行。脚本中加了自动轮询 Volume + 自动下载逻辑

### Fix 5: L4 24GB VRAM 不够（2h 超时被杀）
- **根因**: FP8 模型 19.5GB + 推理中间变量 ~6GB = 25.5GB > 24GB，必须 `num_persistent_param_in_dit=0` 全 offload
- **修复**: 切换到 A100 40GB

### 参数错误: steps=5 太少（非蒸馏模型）
- **根因**: steps=5 是 EchoMimicV3 Flash（蒸馏模型）的参数，错误地套用到了 InfiniteTalk（非蒸馏模型）上
- **官方推荐**: `sample_steps=40`（标准推理），FusionX/lightX2V LoRA 可降到 8/4 步
- **当前参数对比**:

| 参数 | v10.15 当前值 | 官方推荐 | 说明 |
|------|--------------|---------|------|
| sample_steps | 5 | 40 | InfiniteTalk 非蒸馏模型，5 步去噪极度不充分 |
| teacache_thresh | 0.35 | 0.1（官方默认） | 过于激进，跳步太多加剧质量下降 |
| sample_text_guide_scale | 5.0 | 5.0（无 LoRA） | ✅ 正确 |
| sample_audio_guide_scale | 4.0 | 4.0（无 LoRA） | ✅ 正确 |
| num_persistent_param_in_dit | 0 | 0（低 VRAM 模式） | A100 40GB 可改为大值跳过 offload |

## 当前状态（2026-08-29）

1. ✅ 所有依赖修复完成（transformers pin、diffusers pin、no_init_weights inline、CUDA devel image）
2. ✅ `--detach` + 自动轮询下载逻辑已验证可用
3. ✅ A100 40GB 推理完成，视频已自动下载到本地
4. ❌ 视频质量不达标 — 表情太夸张，根因是 steps=5 太少
5. 🔧 **下一步**: 调整参数重跑

## InfiniteTalk 模型特性

- **类型**: Talking body（不是 talking head）— 同步唇 + 头 + 身体 + 表情
- **基座**: Wan2.1-I2V-14B-480P
- **非蒸馏模型**: 标准推理 40 步，不是蒸馏模型（不能像 EchoMimicV3 Flash 那样用 5-8 步）
- **加速选项**: FusionX LoRA（8 步）或 lightX2V LoRA（4 步），但需额外下载 LoRA 权重
- **许可证**: Apache 2.0（商用 OK）

## 下一步计划

### 选项 A: 用官方推荐参数重跑（steps=40）
- **预估时间**: 76 min × (40/5) ≈ 608 min（~10h）—— **太长，不可行**
- **原因**: 全 CPU offload 模式下每步都需传 19.5GB

### 选项 B: 去掉 offload + steps=40（推荐）
- 改 `num_persistent_param_in_dit` 为大值（如 40），让全模型常驻 A100 GPU
- A100 40GB: 19.5GB 模型 + ~6GB overhead = 25.5GB < 40GB ✅
- 预估时间: ~15 min（无 offload 瓶颈）
- 成本: ~$0.53

### 选项 C: 用 FusionX LoRA（8 步）
- 下载 FusionX LoRA 权重
- 改 `sample_steps=8, sample_text_guide_scale=1.0, sample_audio_guide_scale=2.0, sample_shift=2`
- 需要去掉 `--quant fp8`（LoRA 不兼容量化模式）
- 预估时间: 取决于是否 offload

### 选项 D: 换模型 — 测试其他数字人方案
参见 `docs/research/digital-human-test-progress.md` 推荐测试顺序：
1. **EchoMimicV3 Flash** — 已有 Kaggle v51 最优配置，talking head，8 步蒸馏模型
2. **LeapTalk** — 1 步推理，200 FPS，1.3B 参数
3. **SoulX-FlashHead** — 实时流式 talking head，1.3B
4. **LongCat-Video-Avatar-1.5** — InfiniteTalk 同团队升级版，8 步蒸馏

## 新 Session 恢复指南

1. 读此 handoff 文件了解上下文
2. 本地已有视频: `scripts/short-video/experiments/digital-human/infinitetalk/modal-infinitetalk-v10.15-a100.mp4`
3. 如果要重跑（image 已 cached，模型在 Volume 上）：
   ```bash
   HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 NODE_USE_ENV_PROXY=1 \
     modal run --detach scripts/short-video/experiments/modal-infinitetalk.py
   ```
   **注意**: 必须加 `--detach` 标志，否则 CLI 断开后 spawn 的推理函数会被取消

## 关键文件

- `scripts/short-video/experiments/modal-infinitetalk.py` — Modal A100 40GB 推理脚本（v10.15，含所有修复）
- `scripts/short-video/voice-samples/voice-sample-24k-3s.wav` — 3 秒音频
- `scripts/short-video/assets/self-portrait.jpg` — 用户照片
- `scripts/short-video/experiments/digital-human/infinitetalk/modal-infinitetalk-v10.15-a100.mp4` — 输出视频（质量不达标）

## Modal 配置

- **Workspace**: qingshun-li
- **Volume**: `infinitetalk-models` — 持久化模型存储（42GB + outputs/）
- **GPU**: A100 40GB ($2.10/h)
- **Image**: `nvidia/cuda:12.1.0-devel-ubuntu22.04` + Python 3.11 + torch 2.4.1+cu121
- **运行命令**（必须加 `--detach`）:
  ```bash
  HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 NODE_USE_ENV_PROXY=1 \
    modal run --detach scripts/short-video/experiments/modal-infinitetalk.py
  ```
  脚本会自动轮询 Volume 并在推理完成后自动下载到本地。

## 依赖版本总结（已验证）

| 包 | 版本 | 原因 |
|---|---|---|
| torch | 2.4.1+cu121 | InfiniteTalk 兼容，必须先安装 |
| torchvision | 0.19.1+cu121 | 匹配 torch 2.4.1 |
| transformers | >=4.49.0,<5.0 | 5.x 要求 PyTorch >= 2.5 |
| diffusers | ==0.31.0 | InfiniteTalk 用了 0.31 之前的 API（no_init_weights） |
| tokenizers | >=0.20.3,<0.22 | 匹配 transformers 4.x |
| accelerate | >=1.1.1,<2.0 | 稳定版 |
| optimum-quanto | ==0.2.6 | InfiniteTalk 指定版本 |
| numpy | >=1.23.5,<2 | InfiniteTalk 不兼容 numpy 2 |
| 基础 image | nvidia/cuda:12.1.0-devel-ubuntu22.04 | 提供 nvcc + CUDA headers 给 Marlin JIT |

## 已知问题和修复

1. **T4/L4 不支持 flash_attn** → SDPA fallback
2. **SageAttention T4 Triton 编译失败** → 完全移除，纯 SDPA
3. **Kaggle LFS 下载 0B** → `curl -L` 替代 `hf_hub_download`
4. **hf download --include glob 冲突** → 用具体文件路径
5. **kokoro/misaki Python 3.13 不兼容** → patch 跳过 import
6. **文件不要放 /tmp** → 存入代码库 `scripts/short-video/experiments/`
7. **transformers 5.x 要求 PyTorch >= 2.5** → pin `<5.0`
8. **diffusers 0.31+ 移除了 no_init_weights** → 内联定义
9. **optimum-quanto Marlin 需要 CUDA_HOME** → 用 nvidia/cuda devel image
10. **Modal heartbeat 超时 + spawn 被取消** → `modal run --detach` 标志 + 自动轮询下载
11. **L4 24GB VRAM 不够** → A100 40GB
12. **steps=5 表情夸张** → InfiniteTalk 非蒸馏模型，需 40 步或 LoRA 加速
