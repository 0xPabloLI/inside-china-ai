# InfiniteTalk Modal 推理 Handoff

**日期**: 2026-08-28
**状态**: 推理运行中（`--detach` + spawn + 自动轮询下载）

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

### v10.15 (Modal L4, 修复中)
- **纯 SDPA**: 完全移除 SageAttention，flash_attention 直接用 SDPA
- **tokenizer 下载**: `hf download` 用具体文件路径
- **kokoro 跳过**: Python 3.13+ 不兼容 → patch 跳过 import
- **参数**: steps=5, teacache=0.35, max_frame_num=81, 3s 音频

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
- **根因**: `num_persistent_param_in_dit=0` 全 CPU offload，每步推理需要传输 19.5GB FP8 权重在 CPU↔GPU 之间，L4 上 ~70+ 分钟完成
- **症状 1**: Modal CLI heartbeat 在 ~68 分钟后超时断开（`Deadline exceeded` + `ConnectionResetError`）
- **症状 2**: 即使使用 `spawn()` 异步推理，本地 CLI 退出后 spawn 的函数也被取消（日志: `Received a cancellation signal`）
- **修复**: `modal run --detach` 标志确保 CLI 断开后 app 继续运行。脚本中加了自动轮询 Volume + 自动下载逻辑，检测到输出文件后自动 `modal volume get` 到本地

## 当前状态（2026-08-28 15:02 UTC）

1. ✅ 所有依赖修复完成（transformers pin、diffusers pin、no_init_weights inline、CUDA devel image）
2. ✅ 所有 import 验证通过（`imports OK`、`attention.py OK`、`wan import OK`）
3. ✅ 上次推理（`fc-01M14CHNVQ72ME79MZA9TNYMNZ`）在 14:27 UTC 被取消 — 根因: `spawn()` 没加 `--detach`，CLI 断开后函数被取消
4. ✅ 已用 `--detach` 重新启动推理（App: `ap-yA0npYj9aS4IlkboUm28rM`，函数调用: `fc-01M14E9XS0CTYZJTJYMEFB925Y`）
5. ⏳ 推理在远程独立运行中（预计 ~70 分钟，~16:12 UTC 完成）
6. ⏳ 本地 CLI 正在轮询 Volume，检测到输出后自动下载到本地
7. ⏳ 输出将保存到: `scripts/short-video/experiments/digital-human/infinitetalk/modal-infinitetalk-v10.15-l4.mp4`

## 新 Session 恢复指南

1. 读此 handoff 文件了解上下文
2. 检查 Volume 上是否有输出：
   ```bash
   HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 NODE_USE_ENV_PROXY=1 \
     modal volume ls infinitetalk-models outputs/
   ```
3. 如果有 `modal-infinitetalk-v10.15-l4.mp4`：
   - 下载到本地：
     ```bash
     HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 NODE_USE_ENV_PROXY=1 \
       modal volume get infinitetalk-models outputs/modal-infinitetalk-v10.15-l4.mp4 \
       scripts/short-video/experiments/digital-human/infinitetalk/modal-infinitetalk-v10.15-l4.mp4
     ```
   - 播放验证视频质量
4. 如果没有输出：
   - 检查 Modal app 日志（需要 App ID）：
     ```bash
     HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 NODE_USE_ENV_PROXY=1 \
       modal app list
     HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 NODE_USE_ENV_PROXY=1 \
       modal app logs <APP_ID>
     ```
   - 如果推理失败，检查错误并修复
   - 如果需要重跑（image 已 cached，模型在 Volume 上，应该秒级启动）：
     ```bash
     HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 NODE_USE_ENV_PROXY=1 \
       modal run --detach scripts/short-video/experiments/modal-infinitetalk.py
     ```
     **注意**: 必须加 `--detach` 标志，否则 CLI 断开后 spawn 的推理函数会被取消

## 关键文件

- `scripts/short-video/experiments/modal-infinitetalk.py` — Modal L4 GPU 推理脚本（v10.15，含所有修复）
- `scripts/short-video/voice-samples/voice-sample-24k-3s.wav` — 3 秒音频
- `scripts/short-video/assets/self-portrait.jpg` — 用户照片
- `scripts/short-video/experiments/digital-human/infinitetalk/` — 本地输出目录

## Modal 配置

- **Workspace**: qingshun-li
- **Token**: insidechina
- **Volume**: `infinitetalk-models` — 持久化模型存储（42GB + outputs/）
- **GPU**: L4 ($0.80/h, 24GB VRAM)
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
