# InfiniteTalk Modal 推理 Handoff

**日期**: 2026-08-30
**状态**: ❌ Modal A100 标准推理超时，需换平台/方案

## 结论

InfiniteTalk 标准 40 步推理在单卡 A100 40GB 上需要 **4+ 小时**（4h timeout 超时被杀），即使 `offload_model=False`（全模型常驻 GPU）。官方推荐 40 步是为多卡 FSDP 设计的，单卡不可行。

**下一步**：用官方推荐参数在 Kaggle 或 Colab 上测试（免费 GPU 额度），或用 FusionX LoRA 降到 8 步。

## 已有视频文件

| 文件 | GPU | 分辨率 | 时长 | 步数 | 结果 |
|------|-----|--------|------|------|------|
| `infinitetalk_res_fp8_v10.11_t4.mp4` | Kaggle T4 | 896×448 | 0.52s | 40 | example 数据，质量可 |
| `infinitetalk_res_fp8_v10.12_t4_self_portrait.mp4` | Kaggle T4 | 576×704 | 0.52s | 15 | 用户照片，"太短了还没开口" |
| `modal-infinitetalk-v10.15-a100.mp4` | Modal A100 | 576×704 | 3.04s | 5 | ❌ 表情夸张（steps=5 太少） |

## 官方推荐参数

从 InfiniteTalk GitHub README 确认的官方推理命令：

```bash
python generate_infinitetalk.py \
    --ckpt_dir weights/Wan2.1-I2V-14B-480P \
    --wav2vec_dir weights/chinese-wav2vec2-base \
    --infinitetalk_dir weights/InfiniteTalk/single/infinitetalk.safetensors \
    --input_json examples/single_example_image.json \
    --size infinitetalk-480 \
    --sample_steps 40 \
    --mode streaming \
    --motion_frame 9 \
    --save_file infinitetalk_res
```

**关键参数**：
- `sample_steps=40`（标准），FusionX LoRA 可降到 8 步
- `sample_text_guide_scale=5.0`（无 LoRA 时）
- `sample_audio_guide_scale=4.0`（无 LoRA 时）
- `teacache_thresh=0.1`（官方默认，不是 0.35）
- `offload_model`：单 GPU 默认 True，A100 40GB 可设 False
- `num_persistent_param_in_dit`：低 VRAM 设 0，A100 40GB 可设 40

**隐藏交互**：`offload_model` 默认 True 会覆盖 `num_persistent_param_in_dit` 的效果。要真正禁用 offload，必须显式传 `--offload_model False`。

## Modal 花费明细

| 版本 | 日期 | GPU | 推理时间 | 成本 | 结果 |
|------|------|-----|---------|------|------|
| L4 调试 ×4 | 08-28 | L4 | — | $4.31 | ❌ VRAM 不够/被取消 |
| v10.15 (steps=5, offload) | 08-29 | A100 | 76 min | $3.34 | ✅ 完成但表情夸张 |
| v10.16 第一次 (steps=40, offload) | 08-30 | A100 | 2h 超时 | $8.20 | ❌ 超时 |
| v10.16 第二次 (steps=40, offload, 4h) | 08-30 | A100 | ~1h | ~$2 | ❌ 被 kill |
| v10.16 第三次 (steps=40, 无offload, 4h) | 08-30 | A100 | 4h 超时 | ~$8.40 | ❌ 超时 |
| **总计** | | | | **~$26** | |

## 下一步方案

### 方案 A: Kaggle T4 + 官方推荐参数（推荐先试）
- Kaggle P100/T4 免费，30h/周 额度
- v10.11 已在 Kaggle T4 上用 steps=40 成功跑过（7h，但成功）
- 用完整官方参数 + 用户照片 + 3s 音频 + max_frame_num=81
- 预估 ~7h（P100）/ ~4h（T4），免费
- 脚本已有：`scripts/kaggle/infinitetalk-dataset/`

### 方案 B: FusionX LoRA 8 步（Modal A100）
- 下载 FusionX LoRA 权重
- 参数：`--sample_steps 8 --sample_text_guide_scale 1.0 --sample_audio_guide_scale 2.0 --sample_shift 2 --lora_dir <path> --lora_scale 1.0`
- 参数来源：8 步 + CFG 1.0 来自 FusionX 官方卡（vrgamedevgirl，Civitai/ModelScope），不是 InfiniteTalk 官方参数——蒸馏 LoRA 有自己的采样轨迹，40 步 + CFG 5.0 会过饱和出伪影
- ⚠️ 无官方组合参数：FusionX 卡推荐设置针对 T2V/ComfyUI（I2V 用 Phantom LoRA），「InfiniteTalk + FusionX」组合没有官方参数，上述值是社区实测起点，audio_guide_scale=2.0 未经真实音频验证，首次跑当作基线验证
- ⚠️ 许可证：FusionX 组件部分受 CC BY-NC-SA 4.0 约束（官方卡原文），属「需缓解」，**仅可用于质量验证，不可直接发布成品**；商用需换可商用蒸馏方案（如 lightx2v StepDistill LoRA，Apache 2.0 系）或方案 C
- 注意：LoRA 不兼容 `--quant fp8`，需用非量化模型（~20GB DiT + ~10GB T5 = ~30GB，A100 40GB 够）
- 预估时间：8/40 × 4h = ~48 min（可能更短，LoRA 模型更快收敛）
- 预估成本：~$1.68

### 方案 C: 换模型
- **LeapTalk**：1 步推理，200 FPS，1.3B，talking head
- **LongCat-Video-Avatar-1.5**：InfiniteTalk 同团队升级版，8 步蒸馏
- 详见 `docs/research/digital-human-test-progress.md`

## 新 Session 恢复指南

1. 读此 handoff 了解上下文
2. 本地已有视频（质量不达标的 v10.15）：`scripts/short-video/experiments/digital-human/infinitetalk/modal-infinitetalk-v10.15-a100.mp4`
3. 推荐先走方案 A（Kaggle 免费）：
   - 脚本：`scripts/kaggle/infinitetalk-dataset/`（已有 v9 版本）
   - 改用官方推荐参数：steps=40, teacache=0.1, offload_model=True（T4 16GB 必须 offload）
   - max_frame_num=81 生成完整 3s 视频
4. 如需 Modal：
   ```bash
   HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 NODE_USE_ENV_PROXY=1 \
     modal run --detach scripts/short-video/experiments/modal-infinitetalk.py
   ```

## 关键文件

- `scripts/short-video/experiments/modal-infinitetalk.py` — Modal A100 推理脚本（含所有修复 + 参数自检表）
- `scripts/short-video/voice-samples/voice-sample-24k-3s.wav` — 3 秒音频
- `scripts/short-video/assets/self-portrait.jpg` — 用户照片

## Modal 配置

- **Workspace**: qingshun-li
- **Volume**: `infinitetalk-models`（42GB 模型 + outputs/）
- **GPU**: A100 40GB ($2.10/h)
- **Image**: `nvidia/cuda:12.1.0-devel-ubuntu22.04` + Python 3.11 + torch 2.4.1+cu121
- **关键修复**：必须 `--detach` 标志 + `--offload_model False` + `timeout=14400`

## 已知问题和修复

1. **T4/L4 不支持 flash_attn** → SDPA fallback
2. **SageAttention T4 Triton 编译失败** → 纯 SDPA
3. **transformers 5.x 要求 PyTorch >= 2.5** → pin `<5.0`
4. **diffusers 0.31+ 移除了 no_init_weights** → 内联定义
5. **optimum-quanto Marlin 需要 CUDA_HOME** → nvidia/cuda devel image
6. **Modal heartbeat 超时 + spawn 被取消** → `modal run --detach`
7. **L4 24GB VRAM 不够** → A100 40GB
8. **steps=5 表情夸张** → 非蒸馏模型需 40 步
9. **offload_model 默认 True 覆盖 num_persistent_param_in_dit** → 显式 `--offload_model False`
10. **单卡 A100 steps=40 需要 4+ 小时** → 用 Kaggle/Colab 免费额度 或 FusionX LoRA 8 步
