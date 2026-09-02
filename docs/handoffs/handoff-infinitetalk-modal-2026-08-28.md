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

> **成本口径备注**：表中金额均为实际账单（含失败尝试）。~$8.40 是第三次尝试烧满 4h timeout 后被 kill 的计费，不是成功运行的价格——**40 步在单卡 A100 上的“跑完成本”从未被观测到**，$8.40 只是已知下限。任何“40 步单次 ~$8.4”的表述都应理解为“≥$8.4 且不确定能跑完”。

## 下一步方案

### v10.17 运行记录（2026-09-02 凌晨）

- **第一次运行（app ap-LpgLeMMUi0zGfzwa9BOnKm）❌ 失败**：`FileNotFoundError: diffusion_pytorch_model-00001-of-00007.safetensors`。根因：旧脚本为 FP8 路线**故意跳过** base Wan2.1 的 7 个 DiT shards（"selective download"），但官方非量化命令是「base DiT shards + infinitetalk 适配权重」分开加载——换推理路径时权重清单不是超集关系，必须按官方 README 重新核对。失败仅烧 4min GPU ≈ $0.2（变体失败隔离 + CPU 预下载设计生效，权重无损失）。
- **修复**：脚本新增 4g 下载步骤（`--include 'diffusion_pytorch_model*'` ~57GB，CPU 容器）；GPU 函数 RAM 32→64GB（fp32 shard 载入转 bf16）。
- **第二次运行（app ap-rMLnzo5FBde9Ob3jM5MOCC）❌ 失败**：`AssertionError: Aduio file not exists or length not satisfies frame nums`。根因：multitalk.py 的断言要求音频嵌入数 > frame_num，3s 音频 @25fps = 75 嵌入，官方默认 frame_num=81 > 75 直接失败。旧值 frame_num=13 是 streaming 模式的**分块大小**（非总长度），13 < 75 能过断言，v10.15 的 3.04s 输出正是音频驱动长度——「frame_num 13 只出 0.52s」是历史误判。
- **修复**：`--frame_num 73`（4n+1 且 < 75，留 2 嵌入余量），max_frame_num=81 保留（总长上限）。
- **第三次运行（app ap-6HJ3N1pGWT7aAaru49i1Gp）✅ 成功（2026-09-02 ~05:05 CST）**：
  - 推理 **12.2 min**（远低于 48min 估计——该估计从 40 步的 4h 外推，严重失准；实际瓶颈是加载与分块开销），总 GPU 计费 13.4 min ≈ **$0.56**
  - 产出：`experiments/digital-human/infinitetalk/infinitetalk_v1017_lora_audio2.0.mp4`（3.04s，224KB）
  - 抽帧质量评估（t=0.5/1.5/2.5s vs v10.15 同时刻）：表情自然（说话中张嘴露齿，无 v10.15 的夸张张 O）、ID 保持良好（眼镜/胡型/发型稳定）、帧间一致性好
  - **待用户确认 → ✅ 已确认**：lip sync 用户人眼确认达标（2026-09-02）——FusionX 8 步质量全部验证通过
- 三次总成本 ≈ **$1.06**（$0.2 + $0.3 + $0.56），参数校准完成
- 脚本版本：modal-infinitetalk.py **v10.17**（单变体 audio=2.0；3.0 变体注释保留，lip sync 不足时启用）

### v10.18 运行记录（lightx2v A/B，2026-09-02）

- **目的**：FusionX 是 NC 许可证只能验证；lightx2v 是可商用蒸馏 LoRA（官方 README 同节指定，链接 Kijai/WanVideo_comfy 的 `Wan21_T2V_14B_lightx2v_cfg_step_distill_lora_rank32.safetensors`），若质量接近 FusionX 则商用许可问题解决且步数 8→4 更便宜
- **参数**：与 v10.17 完全同配方，仅 steps 8→4、LoRA 文件换成 lightx2v rank32（官方把两者放同一节共用配方）；权重许可标注商用前需核实（Kijai 转存）
- **运行**：app ap-9E3dUlTyVWFuJiHVyqmj0d，2026-09-02，**一次成功**；推理 9.3min（比 FusionX 8 步的 12.2min 快 ~24%），总计费 10.2min ≈ **$0.42**
- **产出**：`experiments/digital-human/infinitetalk/infinitetalk_v1018_lightx2v_audio2.0.mp4`（3.04s，238KB）
- 抽帧质量评估（t=0.5/1.5/2.5s vs FusionX 基线同时刻）：ID 完全保持（眼镜/胡型/发型一致）、口型自然（噘唇/开口/圆唇过渡）、无明显伪影，与 FusionX 基线同级；**待用户 lip sync 人眼确认**
- **结论（2026-09-02 用户人眼确认）**：lip sync 达标；**表情略僵，整体不如 FusionX**（蒸馏步数 8→4 的典型 trade-off：更快更便宜换表情保真度）。质量排序：FusionX > lightx2v，但 FusionX NC 已停测 → lightx2v 是当前**可商用里最好的 InfiniteTalk 蒸馏方案**；唯一遗留：Kijai 转存权重许可标注商用前需核实
- 脚本版本：modal-infinitetalk.py **v10.18**（VARIANTS 改 4 元组 steps/audio/shift/save_file）

### 方案 A: Kaggle T4 + 官方推荐参数（⏸️ 2026-08-31 用户决定暂缓）
- Kaggle P100/T4 免费，30h/周 额度
- v10.11 已在 Kaggle T4 上用 steps=40 成功跑过（7h，但成功）
- 用完整官方参数 + 用户照片 + 3s 音频 + max_frame_num=81
- 预估 ~7h（P100）/ ~4h（T4），免费
- 脚本已有：`scripts/kaggle/infinitetalk-dataset/`

### 方案 B: 非量化 bf16 + FusionX LoRA 8 步（Modal）——参数已对照官方源码验证（2026-08-31）

**验证来源（多源）**：① 官方 README「Run with FusioniX or Lightx2v (Require only 4~8 steps)」章节（MeiGen-AI/InfiniteTalk main，含完整官方命令）；② `generate_infinitetalk.py` 官方源码（参数存在性核对）；③ FusionX 官方卡（ModelScope `AI-ModelScope/Wan14BT2VFusioniX`）；④ Modal 官方定价页（2026-08-31 抓取）。

> **纠错记录（2026-08-31）**：本档上一版曾将 `audio_guide=2.0 / shift=2` 标为「无出处，作废」并改为 4.0/7.0 —— 这是**误判**。官方 README tips 明文写着「不使用 LoRA 时最优 4，应用 LoRA 后推荐 2」，官方 LoRA 命令里就是 `--sample_shift 2`。原 handoff 的 2.0/2.0 一直是对的，已全部改回。

**官方参数存在性确认**：`--lora_dir`（官方参数，支持多文件）与 `--lora_scale`（官方默认 1.2）真实存在 → 本方案是**纯配置改造，无需改代码**。LoRA 权重官方指定文件：`vrgamedevgirl84/Wan14BT2VFusioniX` 仓库的 **I2V 版** `FusionX_LoRa/Wan2.1_I2V_14B_FusionX_LoRA.safetensors`（与 InfiniteTalk 的 I2V 架构匹配）。

**推荐起始参数**（逐项对齐官方 README LoRA 章节命令；唯一区别是去掉 `--num_persistent_param_in_dit 0`——那是低显存用法，80GB 全常驻更快）：

```
--sample_steps 8                  # 官方 LoRA 章节（README: FusionX 4~8 步）
--sample_text_guide_scale 1.0     # 官方（LoRA 后 CFG 必须=1）
--sample_audio_guide_scale 2.0    # 官方（LoRA 后推荐 2；非 LoRA 时 4；lip sync 不足上探 3-4）
--sample_shift 2                  # 官方 LoRA 命令原值（非 LoRA 默认 7）
--lora_scale 1.0                  # 官方命令原值
--max_frame_num 81                # 3s@25fps=75 帧；frame_num 13 是 v10.15 遗留（只出 0.52s），不再传
--offload_model False             # 80GB 显存全常驻（InfiniteTalk 默认 True，必须显式关）
```

**必须移除的遗留参数**（现行 modal-infinitetalk.py 命令行中）：
- `--use_teacache --teacache_thresh 0.1`：TeaCache 靠跳步提效，与 8 步蒸馏直接冲突
- `--quant fp8 --quant_dir`：与 LoRA 格式冲突，必须加载非量化权重
- `--num_persistent_param_in_dit`：80GB 显存下不需要

**LoRA 权重选择**：官方 README 指定 I2V 版 `FusionX_LoRa/Wan2.1_I2V_14B_FusionX_LoRA.safetensors`，下载链接已确认，实施时直接 `hf download vrgamedevgirl84/Wan14BT2VFusioniX FusionX_LoRa/Wan2.1_I2V_14B_FusionX_LoRA.safetensors` 即可。

**权重与 Volume**：需新增非量化权重（InfiniteTalk bf16 DiT ~28GB + T5 bf16 ~10GB），Volume 从 42GB 扩到 ~90GB。Modal Volume 定价 $0.09/GiB/月，**每月前 1 TiB 免费** → 扩容实际 $0。

**硬件（性价比已按 Modal 官方定价核实）**：
- **首选 A100 80GB（$0.000694/s = $2.50/h）**：bf16 28GB 常驻 + 激活值峰值 ~35GB，40GB 版贴线有 OOM 重试风险（一次重试就比差价贵），80GB 版消除该风险
- L40S（$1.95/h, 48GB）看似便宜，但 BF16 算力约为 A100 的 6 成，跑得更久反而更贵
- H100 SXM5（$3.95/h）算力 ~2-3x，单次总成本接近，需要更快迭代反馈时可换
- L4/A10/T4：显存装不下非量化权重，排除

**成本预估**：推理 ~48min + 启动/音频编码开销 → A100 80GB 单次 ~$2.0-2.5；audio_guide/shift 微调 2-3 个变体同 session 批跑总成本 ~$3-4，**预算上限 ~$5**。

**⚠️ 官方质量警告（README 原文）**：FusionX LoRA 会**加剧 >1 分钟视频的颜色漂移、降低 ID 保持**。3s 测试不受影响；生产长视频需分段（每段 <1min）或换 LongCat-Video-Avatar-1.5（同团队 2026-05 后继版，内置 8 步蒸馏 + Whisper 音频编码，Apache 2.0）。

**降本手段（Modal 按容器占用秒计费，与视频时长无关；视频时长只影响推理时长）**：
1. **CPU 容器预下载权重**：权重下载放 CPU-only 函数跑（写进 Volume），GPU 只做推理——省掉首跑 ~20min 的 GPU 计费下载时间，首跑降到 ~$2-2.5
2. **调参变体同 session 批量跑**：audio_guide/shift 的 2-3 个变体串行跑在同一个容器调用里，摊薄启动开销（镜像拉起 + 模型加载 ~5-10min/次），3 个变体总成本 ~$3-4 而不是 3 × $2.5
3. **Volume 持久化**：非量化权重 + LoRA + 补丁过的 repo 都缓存在 Volume（1 TiB/月免费额度内），后续任何一次运行都零下载时间

**⚠️ 许可证（不变）**：FusionX 组件部分受 CC BY-NC-SA 4.0 约束（官方卡原文），属「需缓解」，**仅可用于质量验证，不可发布成品**；商用需换可商用蒸馏方案（如 lightx2v StepDistill LoRA，Apache 2.0 系）或方案 C。

### 方案 C: 换模型
- **LeapTalk**：1 步推理，200 FPS，1.3B，talking head
- **LongCat-Video-Avatar-1.5**：InfiniteTalk 同团队升级版，8 步蒸馏
- 详见 `docs/research/digital-human-test-progress.md`

## 新 Session 恢复指南

1. 读此 handoff 了解上下文
2. 本地已有视频（质量不达标的 v10.15）：`scripts/short-video/experiments/digital-human/infinitetalk/modal-infinitetalk-v10.15-a100.mp4`
3. ~~推荐先走方案 A（Kaggle 免费）~~（2026-08-31 用户决定暂缓 Kaggle，直接走方案 B）
4. Modal 方案 B 按本档「方案 B」章节的参数执行（官方源码已验证），硬件用 A100 80GB：
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
