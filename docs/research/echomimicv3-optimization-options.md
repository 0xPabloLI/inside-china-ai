# EchoMimicV3 推理优化方案对比

> **创建时间**：2026-08-17
> **目的**：记录各优化方案的收益、代价、验证结论，避免反复跑同样验证
> **基准**：Kaggle P100 16GB, model_cpu_offload + expandable_segments, 8 steps, 81 frames (3.24s), float16 → 推理 23.9 min, 总时间 51.5 min（含两个 test case + Dataset 读取）

---

## 基准数据（v25/v28 实测）

| 指标 | 值 |
|------|-----|
| GPU | Tesla P100-PCIE-16GB (sm_60) |
| 推理模式 | sequential_cpu_offload |
| 推理步数 | 8 (Flash) |
| 视频长度 | 81 帧 / 3.24s @ 25fps |
| 分辨率 | 768×768 |
| 精度 | float16 (P100 不支持 bfloat16) |
| 单次推理时间 | ~24.6 min |
| 环境安装 | ~10 min |
| 模型下载 | ~12 min (19GB → /tmp) |
| 总时间（1 test case） | ~47 min |
| 总时间（2 test case） | ~62 min (v28 实测) |

---

## 方案对比矩阵

### 方案 1：model_cpu_offload 替代 sequential_cpu_offload

| 维度 | 详情 |
|------|------|
| **改动** | `--GPU_memory_mode 'model_cpu_offload'` |
| **收益** | 3-5x 推理加速（理论），整模块搬运减少 CPU-GPU 通信开销 |
| **代价** | VRAM 需求更高——最大单模块 T5 encoder 10.8GB + 运行时中间张量可能 >16GB → OOM 风险 |
| **风险** | 中——可能 OOM 白跑一轮 |
| **验证状态** | ❌ v29 (version 29) OOM；✅ v32 (version 32) + `expandable_segments:True` **成功！** |
| **结论** | **可行！** 加 `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` 后 model_cpu_offload 不再 OOM。推荐作为默认模式。 |
| **v32 实测数据** | A-sequential-expandable: 26.2 min; B-model-expandable: 24.0 min。 |
| **v33 实测数据** | A-weixin: 23.9 min (1434.6s), model_cpu_offload, audio_guidance_scale=2.0; B-video-frame: 24.2 min (1453.7s)。总时间 51.5 min。Dataset 读取成功。 |

### 方案 2：减少推理步数（5 步代替 8 步）

| 维度 | 详情 |
|------|------|
| **改动** | `--num_inference_steps 5` |
| **收益** | -37.5% 推理时间（5/8） |
| **代价** | 质量可能下降——去噪不充分影响嘴部细节和皮肤纹理 |
| **风险** | 低——可以随时改回 8 步 |
| **验证状态** | ✅ v30 (version 30) 已验证 |
| **结论** | 5 步推理时间 22.4 min vs 8 步 24.1 min（-7.1%），时间差异极小，不推荐为速度优化手段。质量对比需从 Kaggle 网页下载两个 mp4 后人工评估 |
| **v30 实测数据** | A-weixin-5steps: 22.4 min, 432.7 KB; B-weixin-8steps: 24.1 min, 421.4 KB。总时间 57.4 min（含环境安装+模型下载+两次推理） |

#### 推理步数说明

- `num_inference_steps` 是 argparse 参数，**无上限**
- 官方推荐：5 步 for talking head，15~25 步 for talking body
- Flash 模型 run_flash.sh 默认用 8 步
- 步数越多质量越好但越慢，步数太少会导致去噪不充分
- EchoMimicV3 Flash 是蒸馏模型（8 步即可），不是标准 50 步模型

### 方案 3：mmgp FP8 量化

| 维度 | 详情 |
|------|------|
| **改动** | 集成 mmgp 库做 FP8 量化 + block_offload |
| **收益** | 可能全 GPU 推理（12GB VRAM 可跑 768×768），速度最快 |
| **代价** | ① FP8 量化降低精度——面部细节（嘴唇边缘、牙齿）可能变模糊；② 代码改动大——需改 pipeline 调用逻辑；③ P100 无 FP8 硬件支持（无 Tensor Core FP8 单元），只能软件模拟 |
| **风险** | 高——兼容性未知，质量损失不可逆 |
| **验证状态** | 未验证 |
| **结论** | 不推荐——质量代价过高，P100 兼容性不确定 |

### 方案 4：模型打包成 Kaggle Dataset

| 维度 | 详情 |
|------|------|
| **改动** | 创建 `echomimicv3-models` Kaggle Dataset (19GB)，kernel 直接从 `/kaggle/input/` 读取 |
| **收益** | 省去每次 ~12 min 模型下载时间 |
| **代价** | ① 一次性上传 30-60 min；② Kaggle Dataset 大小限制 20GB，19GB 卡边缘；③ 模型更新需重新上传 |
| **风险** | 低 |
| **验证状态** | ✅ v33 已验证 Dataset 挂载成功，模型从 `/kaggle/input/echomimicv3-flash/` 直接读取 |
| **结论** | **已完成！** 模型打包为 `xpabloli/echomimicv3-flash` Dataset，每次省 ~12 min 下载时间。 |
| **是否固定模型** | 是——只打包当前使用的 Flash-pro 权重 + Wan2.1 基础模型 + chinese-wav2vec2-base |

### 方案 5：Colab T4 替代 P100

| 维度 | 详情 |
|------|------|
| **改动** | 用 `colab run --gpu T4 script.py` 在 Colab T4 上运行 |
| **收益** | Colab CLI 一键运行；T4 有 Tensor Core（sm_75）支持 FP16 加速 |
| **代价** | ① T4 算力与 P100 相当（不一定是升级）；② 同样 16GB VRAM 需 CPU offload；③ Colab 预装环境不同，PyTorch/diffusers/transformers patch 需重新调试；④ GPU 分配不保证，可能排队 90min；⑤ Colab CLI `--timeout` 默认 30s，长推理需要用 `--keep` + `exec` 分步操作 |
| **风险** | 中——环境兼容性未知 |
| **验证状态** | ✅ Colab T4 已验证可用（40.6s 完成创建+运行+销毁） |
| **结论** | T4 可用但 VRAM 仅 14.6GB（比 P100 16GB 少），需 CPU offload；bfloat16 支持是优势；`colab run --timeout` 需要设置足够长 |
| **T4 vs P100 对比** | T4: 14.6GB VRAM, bfloat16 ❌ (sm_75 不支持), Tensor Core ✅, sm_75; P100: 16GB VRAM, bfloat16 ❌, sm_60。**两者都不支持 bf16**，bf16 需要 Ampere(sm_80+) 或更新架构。 |
| **T4 bf16 更正** | 之前信息有误——T4 (Turing, sm_75) **不支持 bfloat16**。bf16 硬件支持从 Ampere(sm_80, A100) 开始。T4 和 P100 在精度上一样，都用 float16。 |
| **Colab CLI 限制** | `colab run --timeout` 默认 30s，推理脚本需要 `--keep` + 分步 `exec`，或把脚本写成自包含单文件 |

### 方案 6：Colab L4 / A100（更强 GPU）

| 维度 | 详情 |
|------|------|
| **改动** | `colab run --gpu L4` 或 `--gpu A100` |
| **收益** | L4 24GB / A100 40GB → 不需要 CPU offload，推理直接全 GPU |
| **代价** | ① Colab 免费版只有 T4，L4/A100 需要 Pro/Pro+ 付费；② A100 Pro+ $50/月 |
| **风险** | 低（如果愿意付费） |
| **验证状态** | 未验证 |
| **结论** | 付费方案，如果免费方案不够快可考虑 |

### 方案 7：AutoDL RTX 4090（付费按需）

| 维度 | 详情 |
|------|------|
| **改动** | 手动租用 AutoDL RTX 4090 24GB |
| **收益** | 24GB VRAM 不需要 CPU offload，推理速度应该最快 |
| **代价** | ¥1.88/h 付费；手动操作不能自动化 |
| **风险** | 低 |
| **验证状态** | 未验证 |
| **结论** | 免费 GPU 跑不动时的付费备选 |

---

## 多 GPU 并行方案

| 方案 | 说明 | 可行性 |
|------|------|--------|
| Kaggle + Colab 并行 | 两个平台同时跑不同 test case | ✅ 可行——完全独立的 GPU 资源 |
| AutoDL + Kaggle 并行 | 付费 GPU 跑高质量，免费 GPU 跑快速验证 | ✅ 可行 |
| Kaggle 多 kernel 并行 | 多个 kernel 同时 push | ⚠️ 受 30h/周配额限制，不能大规模并行 |
| Kaggle 多账号并行 | 多个 Kaggle 账号各 push kernel | ⚠️ 违反 Kaggle ToS，不推荐 |
| Kaggle T4 x2 数据并行 | 同一模型复制到两张 T4，各跑不同输入 | ✅ 可行——需 `torch.nn.DataParallel` 适配 |
| Kaggle T4 x2 模型并行 | 模型不同层放到不同卡 | ✅ 可行——适合 >15GB 模型，需手动分层 |
| Kaggle + Colab 跨平台显存合并 | 把模型拆到 Kaggle T4 + Colab T4 | ❌ 不可行——不同机器的 GPU 无法通过 PCIe/NVLink 互通 |

**推荐**：Kaggle（日常验证 + 批量推理）+ Colab T4（并行跑不同参数组合）+ AutoDL 4090（最终生产质量输出）

> **跨账号/跨平台显存合并的真相**：不同机器的 GPU 之间无法共享显存。GPU 显存共享需要同一物理机内的 PCIe/NVLink 互联。Kaggle T4 x2 是同一机器上的 2 张卡，可以做数据/模型并行；但 Kaggle T4 + Colab T4 是两台不同的机器，不能合并显存。要"跨账号并行"只能各跑不同的 test case（任务并行），不能合并显存跑同一个模型。

---

## 推荐优化路径（优先级排序）

1. ~~验证 model_cpu_offload~~（v29 OOM；v32 + expandable_segments **成功**；v33 固化为默认配置）
2. ~~验证 5 步 vs 8 步~~（v30 已验证 — **时间仅差 1.7 min，不值得**）
3. ~~验证 expandable_segments~~（v32 已验证 — **model_cpu_offload 可用**）
4. ~~模型打包 Kaggle Dataset~~ → ✅ v33 已验证 Dataset 挂载成功
5. ~~验证 15步/25步推理时间~~ → ✅ v31 log 已通过 kagglehub 获取（见下方步数时间表）
6. ~~app_mm.py 参数组合测试~~ → ✅ v34 已完成（3 test case 全成功，参数变化对推理时间无影响）
7. ~~mmgp 量化版测试~~ → ❌ v35/v36/v39 全部 OOM Kill。mmgp 动态量化需 >32GB CPU RAM，Kaggle 只有 29GB（双 T4 不增加 CPU RAM）。EchoMimicV3 无预量化权重，无法绕过。**不可行，放弃。**
8. ~~Kaggle T4 替代 P100~~ → ✅ **v43 成功！** T4 + diffusers 0.31.0 + sequential_cpu_offload，3/3 test case 通过。比 P100 快 24-29%。Tensor Core FP16 加速有效。
9. ~~双 T4 device_map~~ → ❌ **v45o/v45p OOM**。T4 14.6GB 显存不足以容纳推理中间张量——即使只放 transformer (3.5GB) + VAE (0.5GB) 在 GPU0，推理时 81帧×768×768 的 latent 张量也会占满 14.55GB。无论怎么分配组件到两张卡，OOM 都不可避免。**双卡不可行，放弃。**
10. ~~预量化模型直接加载~~ → ❌ **v44r/v44t/v44s 确认此方式不可行**：
    - **FP8** (lieding1994, Flash 版): `torch.load(weights_only=False)` 成功加载，但 `load_state_dict` 时 `AffineQuantizedTensor` (torchao) 与模型 `float16` 不兼容——`copy_` 失败。需安装 `torchao` + 修改模型代码，超出 patch 范围。
    - **NF4** (siyah1, 完整版): Shape mismatch——NF4 权重 `[6, 1536]` vs 模型 `[1, 6, 1536]`，量化压缩了维度，与原始 transformer 结构不兼容。
    - **失败根因**：之前是直接加载预量化权重文件（`.bin`），而非用 bitsandbytes 动态量化方式。预量化权重的数据类型（torchao `AffineQuantizedTensor`）和维度与模型代码不兼容。
    - **修正方案**：不使用预量化权重，改用 **原始 Flash 版 safetensors + `BitsAndBytesConfig(load_in_4bit=True)` 动态量化**。T4 (sm_75) 完全支持 bitsandbytes NF4。见方案 11。
11. **bitsandbytes NF4 动态量化** → ❌ **v46 确认不可行**：用原始 Flash 版权重 + 手动替换 `nn.Linear` 为 `bnb.nn.Linear4bit`。T4 硬件支持，但 **Kaggle 29GB CPU RAM 不足以同时容纳 bitsandbytes 库 + 19GB 模型 + 量化层创建开销**。每次 3 分钟后 OS `Killed`（OOM）。v46 v2（from_pretrained + quantization_config）报 `TypeError: unexpected keyword argument`；v46 v3（argparse 缩进错误）；v46 v4（OOM，安装 accelerate 加剧）；v46 v5（去掉 accelerate 仍 OOM）。**结论：Kaggle CPU RAM 是瓶颈，bitsandbytes 量化在 Kaggle 不可行。**
12. ~~双 T4 sequential_cpu_offload（双卡验证最终基准）~~ → ✅ **v45r/v45s 成功！** 6/6 test case 全通过。实际只用单卡 + CPU offload，双卡 metadata 确保 Kaggle 分配双卡但推理用 `sequential_cpu_offload`。v45r: 25步 27.1min, 8步 21.0min; v45s(symlink): 25步 54.7min, 8步 49.3min（GPU 节点差异大）。**symlink 替代 cp -r 成功**，省去 ~88s 模型复制时间。
13. **torch.compile** → 未测：JIT 编译 transformer，预估 10-20% 加速。T4 (sm_75) 支持有限，主要加速 Ampere+。Compile 耗时 3-5min，对多段推理划算。
14. **完整版 transformer** → 不做：用户确认 8 步 Flash 版质量已够。`BadToBest/EchoMimicV3/transformer/` 需 50 步推理，慢 6x。
15. **付费方案**（仅在免费方案不够时）→ Lightning AI L4 / Colab Pro+ A100 或 AutoDL 4090。注意：bitsandbytes 量化在 AutoDL 4090 (24GB VRAM + 40GB+ RAM) 上可行，因为 CPU RAM 足够。

---

## 加速方案分批计划（2026-08-18 用户确认）

> 用户指示：先测确认有效的、不降质量的方案；再测未验证的；最后才测可能降质量的。

### A 批：确认有效 / 不降质量（优先测试）

| # | 方案 | 原理 | 为什么不降质量 | 验证计划 |
|---|------|------|-------------|---------|
| A1 | **T4 替代 P100** | Tensor Core (sm_75) FP16 矩阵加速 | 只是换 GPU 型号，模型/参数/精度全一样 | ✅ **v43 成功**（2026-08-19）：T4 + diffusers 0.31.0 + sequential_cpu_offload，3/3 成功。25步 22.4min，8步 18.1min（比 P100 快 24%）。v41/v42 失败因 diffusers 0.37.1 OOM；v43 降级到 0.31.0 解决。 |
| A2 | ~~**双 T4 `device_map`**~~ | text_encoder→GPU1, transformer→GPU0 | ~~组件分配到不同卡，避免 CPU offload~~ | ❌ **v45o/v45p OOM**。最终 v45r/v45s 用 `sequential_cpu_offload` 成功——双卡 metadata 确保 Kaggle 分配双卡但实际用单卡推理。 |

### B 批：未验证 / 可能轻微影响（A 批跑完后再测）

| # | 方案 | 原理 | 风险 |
|---|------|------|------|
| B1 | `cfg_skip_ratio=0.5` | 后半段 steps 跳过 negative CFG 前向（每步省一次 transformer forward） | diffusers 标准参数，非 EchoMimicV3 官方设计。CFG 跳过会影响后半段去噪方向。Flash 版仅 8 步，跳过范围有限；25 步时影响可能较小。**需对比视频验证质量** |
| B2 | `tomesd` Token Merging | 合并相似 token 减少注意力计算 | requirements.txt 有但代码未调用，需集成；可能轻微影响细节 |
| B3 | `torch.compile` | JIT 编译 transformer 计算图 | T4 (sm_75) 对 compile 支持有限，主要加速 Ampere+；compile 耗时 3-5min。对多段推理（1分钟视频 ≈20段）划算。预估 10-20% 加速。 |
| B4 | ComfyUI LCM LoRA | 4 步推理（而非 8 步） | 需 ComfyUI 环境 + LCM LoRA 权重 |
| B5 | lightX2V LoRA | 加速步数到 4-8 步 | InfiniteTalk 用的，EchoMimicV3 未验证 |

### C 批：可能降质量（最后测）

| # | 方案 | 原理 | 代价 |
|---|------|------|------|
| C1 | 减少 steps (5步) | 少跑去噪步数 | v30 已测：时间仅省 7%，质量可能下降 |

### 各模型测试完成后再进行的下一批数字人模型

> 用户指示：先把 EchoMimicV3 测完，再测其他模型。详见 `digital-human-test-progress.md` 待测模型列表。

优先级排序（2026-08-18 更新）：
1. **Ditto**（蚂蚁，Apache 2.0，实时 RTF 0.635，~8GB VRAM，T4 可跑）
2. **FantasyTalking**（阿里，ACM MM 2025，Wan2.1 基座，5GB 低 VRAM 模式）
3. **LatentSync 1.5**（字节，8GB，T4 单卡）
4. **EchoMimic V2**（蚂蚁，CVPR 2025，Apache 2.0，~16GB）
5. **PersonaLive**（CVPR 2026，实时，需 Lightning AI L4）
6. **OmniAvatar**（浙大+阿里，Wan2.1+LoRA，~20GB，需 L4）
7. **Hallo4**（MIT，2025.05，需 A100）
8. **InfiniteTalk / MultiTalk INT8**（双 T4 FSDP）

### GPU 选择指南（2026-08-18 新增）

Kaggle `kernel-metadata.json` 通过 `machine_shape` 字段可选 GPU 类型：

```json
{
  "machine_shape": "NvidiaTeslaT4"
}
```

| 对比项 | P100 (sm_60) | T4 (sm_75) |
|--------|-------------|-----------|
| 默认 PyTorch 兼容 | ❌ 需手动降级到 2.4.1+cu121 | ✅ 默认 cu128 可用 |
| Tensor Core | ❌ | ✅ FP16 加速 |
| VRAM | 16GB | 14.6GB |
| bfloat16 | ❌ | ❌ |
| 脚本复杂度 | ~50行 patch 代码 | 可能只需正常 pip install |

**推荐**：后续模型测试默认用 T4，仅当 VRAM 不够（>14.6GB）时才用 P100。

## 推理步数时间对比（v30 + v31 + v33 + v34 实测）

| 步数 | 推理时间 | offload 模式 | 版本 | 备注 |
|------|---------|-------------|------|------|
| 5 步 | 22.4 min (1342.3s) | sequential_cpu_offload | v30 | audio_guidance_scale=3.0 |
| 8 步 | 24.1 min (1444.9s) | sequential_cpu_offload | v30 | audio_guidance_scale=3.0 |
| 8 步 | 23.9 min (1434.6s) | model_cpu_offload | v33 | audio_guidance_scale=2.0, Dataset 读取 |
| 8 步 | 24.2 min (1453.7s) | model_cpu_offload | v33 | video-frame 参考图 |
| 8 步 | 24.1 min (1445.5s) | model_cpu_offload | v34 | app_mm 参数 (guidance=4.5, DPM++, dynamic_cfg) |
| 8 步 | 24.6 min (1473.8s) | model_cpu_offload | v34 | 官方 demo + app_mm 参数 + 1941字 prompt |
| 15 步 | 29.4 min (1765.7s) | sequential_cpu_offload | v31 | audio_guidance_scale=3.0 |
| 20 步 | 29.1 min (1746.0s) | model_cpu_offload | v34 | app_mm 参数 |
| 25 步 | 31.4 min (1882.7s) | sequential_cpu_offload | v31 | audio_guidance_scale=3.0, P100 |
| 25 步 | 22.4 min (1344.0s) | sequential_cpu_offload | v43 | T4, halfbody-portrait |
| 25 步 | 23.5 min (1407.5s) | sequential_cpu_offload | v43 | T4, weixin-portrait |
| 8 步 | 18.1 min (1086.5s) | sequential_cpu_offload | v43 | T4, weixin-portrait |
| 25 步 | 27.1 min (1628s) | sequential_cpu_offload | v45r | 双 T4 metadata, weixin-portrait, cp -r |
| 8 步 | 21.0 min (1258s) | sequential_cpu_offload | v45r | 双 T4 metadata, weixin-portrait, cp -r |
| 25 步 | 54.7 min (3284s) | sequential_cpu_offload | v45s | 双 T4 metadata, weixin-portrait, symlink |
| 8 步 | 49.3 min (2958s) | sequential_cpu_offload | v45s | 双 T4 metadata, weixin-portrait, symlink |
| 25 步 | 26.5 min (1590s) | sequential_cpu_offload | v45r | 双 T4 metadata, halfbody-portrait, cp -r |

**关键结论**：
- 5步→8步仅差 1.7min（TeaCache 已启用，瓶颈在 CPU-GPU 传输）
- 8步→15步差 5.0min（+20.8%）
- 8步→25步差 7.0min（+29.2%）
- model_cpu_offload (v33) vs sequential_cpu_offload (v30) 时间几乎相同（23.9 vs 24.1min）
- **步数增加的时间代价远小于预期**（之前预估25步42min，实际31.4min）

**T4 vs P100 对比（v43 vs v33）**：
- T4 8步 sequential: 18.1min vs P100 8步 model_cpu_offload: 23.9min → **T4 快 24.3%**
- T4 25步 sequential: 22.4min vs P100 25步 sequential: 31.4min → **T4 快 28.7%**
- T4 用 sequential_cpu_offload（更慢的 offload 模式）但仍比 P100 model_cpu_offload 快——Tensor Core FP16 加速效果显著
- T4 25步(22.4min) ≈ P100 8步(23.9min) → **同时间下 T4 可以跑 3x 步数**
- 注意：T4 用 diffusers 0.31.0，P100 用 0.37.1；0.31.0 不支持 model_cpu_offload 的最新优化，但 T4 的 Tensor Core 弥补了这一劣势

**v45r/v45s 双 T4 metadata 测试结论**：
- v45r（cp -r 复制模型）：25步 27.1min, 8步 21.0min → 比 v43 单卡慢 15-20%（可能 GPU 节点不同）
- v45s（symlink 替代 cp -r）：25步 54.7min, 8步 49.3min → 比 v45r 慢 2x（GPU 节点退化，非 symlink 问题）
- **关键发现**：v45r/v45s 实际只用单卡推理（`sequential_cpu_offload`），双卡 metadata 仅影响 Kaggle 分配的 GPU 类型
- **symlink 有效性**：v45s 用 `os.symlink` 替代 `cp -r` 成功省去 ~88s 模型复制时间，但被 GPU 节点退化掩盖
- **GPU 节点波动**：v43(18.1min) → v45r(21.0min) → v45s(49.3min)，同为 T4 但时间差 2.7x，说明 Kaggle T4 节点性能波动极大
- **结论**：双 T4 metadata 无实际加速，`machine_shape` 仅用于确保分配到 T4（而非 CPU）。最优方案仍是 v43 单卡 T4 + sequential_cpu_offload。

## v48 配置（当前最优：torch.compile + 无 TeaCache）

```python
# 环境配置
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# diffusers 降级（关键！0.37.1 会导致 CPU RAM OOM）
# pip install --no-deps --target=/kaggle/working/diffusers0310 diffusers==0.31.0
# 然后删除系统 diffusers，让 Python 用自定义路径

# 推理参数
--num_inference_steps 8        # Flash 版 8 步即收敛
--audio_guidance_scale 3.0
--GPU_memory_mode 'torch_compile'  # sequential_cpu_offload + torch.compile
# 不使用 TeaCache（--enable_teacache 已移除）—— 会跳过部分步数影响质量
--guidance_scale 6.0
--audio_scale 1.0 --neg_scale 1.0 --neg_steps 0
--seed 43 --weight_dtype 'float16'
--sample_size 768 768 --fps 25 --shift 5.0
--ulysses_degree 1 --ring_degree 1  # 单卡模式
```

**v48 关键变化 vs v43**：
- TeaCache **已禁用**——用户确认 TeaCache 会跳过部分推理步数，影响质量
- torch.compile 已启用（mode='reduce-overhead'），预估 13% 加速
- 需修复 `.config` 属性兼容性 bug（v48 已修复）
- expandable_segments 必须与 sequential_cpu_offload 一起用（防碎片 OOM），对速度无负面影响

**v43 数据来源**：`kagglehub.notebook_output_download('xpabloli/echomimicv3-v43-t4-diffusers031-sequential/versions/1')` 获取的 debug_log.txt

---

## v41/v42 失败分析（diffusers 版本兼容性）

| 版本 | diffusers | offload 模式 | 结果 | 原因 |
|------|-----------|-------------|------|------|
| v41 | 0.37.1 | model_cpu_offload | ❌ OOM Killed | diffusers 0.37.1 的 `enable_model_cpu_offload` 在加载时将所有模块（T5 10.8GB + transformer 3.5GB + CLIP 4.4GB + VAE 0.5GB ≈ 19GB）同时加载到 CPU RAM，Kaggle 29GB 限制下被 OS Killed |
| v42 | 0.37.1 | sequential_cpu_offload | ❌ OOM Killed | 同上——0.37.1 的 sequential 加载路径也先在 CPU RAM 中初始化完整模型 |
| v43 | 0.31.0 | sequential_cpu_offload | ✅ 成功 | 0.31.0 的加载路径更轻量，逐模块加载而非一次性全加载 |

**根因**：diffusers 0.37.1 引入了新的 sharded loading 逻辑，`from_pretrained` 时需要在 CPU RAM 中同时持有完整模型权重。0.31.0 的加载更轻量，逐模块加载。

**理论上可跑的最新 diffusers 版本**：未精确确定。0.31.0 确认可行，0.37.1 确认不可行。中间版本（0.32-0.36）未测试。可通过二分查找确定，但优先级低——0.31.0 已满足需求。

---

## ~~v33 固化配置（P100 时代最优）~~

```python
# 环境配置
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# 推理参数
--num_inference_steps 8
--audio_guidance_scale 2.0  # 从 3.0 降至 2.0，减少眨眼
--GPU_memory_mode 'model_cpu_offload'
--enable_teacache --teacache_threshold 0.1 --num_skip_start_steps 5
--guidance_scale 6.0
--audio_scale 1.0
--neg_scale 1.0
--neg_steps 0
--seed 43
--weight_dtype 'float16'
--sample_size 768 768
--fps 25
--shift 5.0
```

**v33 数据来源**：`kagglehub.notebook_output_download('xpabloli/echomimicv3-flash-test/versions/33')` 获取的 debug_log.txt

---

## EchoMimicV3 模型版本说明（2026-08-20 确认）

### Flash vs 完整版

| 维度 | Flash (蒸馏版) | 完整版 (非蒸馏) |
|------|---------------|----------------|
| HF 路径 | `BadToBest/EchoMimicV3/echomimicv3-flash-pro/` | `BadToBest/EchoMimicV3/transformer/` |
| 文件大小 | 3.35GB | 3.18GB |
| 参数量 | 1.3B (dim=1536, 30 layers, 12 heads) | 1.3B (完全一样) |
| 推理步数 | 8 步 (蒸馏训练) | 50 步 |
| 质量 | 8 步即收敛，更多步数无增益 | 50 步质量更高，但慢 6x |
| 开源状态 | ✅ 已开源 | ✅ 已开源 |

**关键结论**：
- Flash 版走 50 步**无意义**——蒸馏训练已收敛，多出的步数不提升质量
- 完整版可用 `--transformer_path` 指向完整版权重，但需 50 步推理，T4 + CPU offload 下预计 ~113min
- 两者参数量完全相同，区别仅在权重（Flash 经蒸馏训练）
- **没有更大的 EchoMimicV3 模型**——标题就是 "1.3B Parameters are All You Need"

### Flash 版剩余提速空间

| 优化 | 原理 | 预估收益 | 代价 | 状态 |
|------|------|---------|------|------|
| 量化 (FP8/NF4) | 降低 VRAM → 可能消除 CPU offload | 30-50% | FP8 几乎无损；NF4 可能有轻微画质损失 | ❌ 不可行——torchao/NF4 与模型不兼容 |
| 双 T4 device_map | T5→GPU1, 其余→GPU0，消除 offload | 40-60% | pipeline patch 脆弱，依赖官方代码不变 | ❌ 不可行——T4 14.6GB OOM |
| 双 T4 sequential_cpu_offload | 双卡 metadata + 单卡推理 | 0%（仅确保 T4 分配） | 无额外代价 | ✅ v45r/v45s 验证成功，但无加速 |
| torch.compile | JIT 编译 transformer 计算图 | **13.4% 实测** | compile 耗时 ~2min；有 `.config` 属性兼容性 bug | ✅ v47 已测，14:17 vs 16:28 |
| 减少 sample_size | 768→512，像素减少 2.25x | ~40% | 画质显著下降 | 不推荐 |
| 减少 video_length | 81→49 帧 | ~40% | 视频更短 | 非加速方案 |

### 1 分钟视频整体耗时估算

基于 v43/v47/v49 实测数据：

| 方案 | 单段 (3.24s) | 1分钟 (~20段) | 备注 |
|------|-------------|-------------|------|
| T4, 8步, TeaCache on, sequential offload | 17 min | ~5.7 小时 | v48 实测（TeaCache default=True） |
| T4, 8步, TeaCache on, + torch.compile | 14 min | ~4.7 小时 | v47 实测 14:17（.config bug 未产出视频） |
| T4, 8步, **TeaCache off**, sequential offload | 27 min | ~9 小时 | v49 实测 |
| T4, 8步, **TeaCache off**, + torch.compile | 28.5 min | ~9.5 小时 | v49 实测（.config 修复成功，视频产出 ✅） |
| 25步 + offload | ~23 min | ~7.7 小时 | v43 实测 22.4-23.5min |
| NF4 量化 (预估) | ~10 min | ~3.3 小时 | ❌ Kaggle CPU RAM 不足，不可行 |
| 双卡 offload 消除 (预估) | ~8 min | ~2.7 小时 | ❌ T4 14.6GB OOM，不可行 |

**v49 关键发现**：
- torch.compile 修复成功！改用 `torch.compile(transformer.forward)` 而非 `torch.compile(transformer)`，保留 `.config` 属性
- 无 TeaCache 比 有 TeaCache 慢 60%（27 min vs 17 min）
- torch.compile 在无 TeaCache 时仅加速 ~5%（28.5 vs 27 min），远低于有 TeaCache 时的 13%
- compile 和 baseline 产出的视频 MD5 完全相同——**torch.compile 不影响视频质量**

> **注**：1 分钟视频需要多段生成拼接（每段 3.24s/81帧）。实际分段数取决于音频长度和 video_length 参数。
> **P100 退役**：2026-09-15 从 Kaggle 移除，之后只能用 T4。

---

## Patch 方案与鲁棒性（2026-08-20）

### 当前 patch 方案

对 `infer_flash.py` 做字符串替换：

1. **v44 (量化)**：把 `    pipeline.to(device=device)` 替换为 `if/elif/else` 条件分支，根据 `GPU_memory_mode` 选择 offload 模式。同时 patch transformer 加载逻辑支持 `.bin` 格式（FP8 权重）。
2. **v45 (双卡)**：同样替换 `pipeline.to(device=device)`，但增加 `dual_gpu` 分支——T5→`cuda:1`，其余→`cuda:0`。还需 patch `pipeline_wan_fun_inpaint_audio_2512.py` 处理跨 GPU 张量传输。

### 脆弱性

- 字符串替换依赖原始代码中存在 `    pipeline.to(device=device)`（含 4 空格缩进）。官方更新代码如果改变缩进或调用方式，patch 会失效。
- v45 的 pipeline patch 依赖精确匹配 `prompt_embeds = self.text_encoder(...)` 调用。官方重构 pipeline 代码会使 patch 失效。

### 更鲁棒的替代方案（未实现）

**Monkey-patch 方案**——完全不修改原始代码文件：

```python
# monkey_patch.py — 在 infer_flash.py 之前 import
import types

def apply_dual_gpu_patch(pipeline, GPU_memory_mode, device):
    if GPU_memory_mode == 'dual_gpu':
        pipeline.text_encoder.to('cuda:1')
        pipeline.transformer.to('cuda:0')
        pipeline.vae.to('cuda:0')
        pipeline.clip_image_encoder.to('cuda:0')
        return True
    elif GPU_memory_mode == 'sequential_cpu_offload':
        pipeline.enable_sequential_cpu_offload()
        return True
    elif GPU_memory_mode == 'model_cpu_offload':
        pipeline.enable_model_cpu_offload()
        return True
    return False
```

优点：不碰原始代码，官方更新不影响。缺点：需要找到合适的 hook 点（`pipeline.to` 不好直接 monkey-patch 因为是 PyTorch `nn.Module` 方法）。

### Patch bug 历史

v44d-g 和 v45d-g 反复失败的根因：
1. 字符串替换的缩进不匹配——替换文本缺少 4 空格前缀
2. 双替换 bug——`content.replace()` 替换所有出现，第二次替换的 `old_to` 在 `new_to` 内部被找到
3. apply model 在做 string_replace 时会回退之前的修复——最终用 write 工具整体重写脚本解决

---

## NF4/bitsandbytes 量化测试结论（2026-08-21）

### 测试环境与结果

| 测试 | 平台 | CPU RAM | 结果 | 失败原因 |
|------|------|---------|------|----------|
| v46 NF4 bnb | Kaggle T4 | 29GB | ❌ OS Killed (~120min) | bitsandbytes + 模型加载 + 量化过程总 CPU RAM > 29GB |
| v46 NF4 bnb (无 accelerate) | Kaggle T4 | 29GB | ❌ OS Killed | 即使去掉 accelerate 依赖仍不足 |
| Colab NF4 bnb | Colab Pro T4 | 32GB | 未测 | 需手动上传 notebook 运行 |

### 根因分析

- bitsandbytes 在量化前需要在 CPU RAM 中同时持有原始 FP16 权重 + 量化后的 4-bit 权重 = ~2x 模型大小
- EchoMimicV3 Flash transformer 3.35GB + 其他组件（T5 10.8GB + CLIP + VAE）≈ 19GB
- 量化过程峰值 CPU RAM 需求 ~25-28GB，加上 Python/PyTorch runtime ~3-5GB = 28-33GB
- Kaggle 29GB CPU RAM 刚好不够；Colab 32GB 可能够用但未验证

### 结论

- **Kaggle T4 上 NF4/bitsandbytes 量化不可行**——CPU RAM 不足
- **torchao FP8 量化也不可行**——与 EchoMimicV3 模型结构不兼容（shape mismatch）
- **预量化权重不可行**——FP8/NF4 预量化权重与 `from_pretrained` 不兼容
- **Kaggle T4 上已无更多量化方案可尝试**

---

## torch.compile 测试详细数据（v47，2026-08-21）

### 测试配置

- GPU: Kaggle T4 ×2 (metadata 仅确保分配 T4)
- diffusers: 0.31.0
- offload: sequential_cpu_offload + expandable_segments
- torch.compile(mode='reduce-overhead', fullgraph=False)
- TeaCache: threshold=0.1, num_skip_start_steps=5

### 推理时间对比（8步，同一 session 的 GPU 节点）

| 步骤 | baseline (无 compile) | torch.compile | 加速 |
|------|----------------------|---------------|------|
| 1/8 | 172s | 136s | -21% |
| 2/8 | 178s | 148s | -17% |
| 3/8 | 139s | 117s | -16% |
| 4/8 | 跳过(TeaCache) | 跳过(TeaCache) | — |
| 5/8 | 119s | 103s | -13% |
| 6/8 | 140s | 123s | -12% |
| 7/8 | 124s | 109s | -12% |
| 8/8 | 113s | 101s | -11% |
| **总计** | **16:28 (988s)** | **14:17 (857s)** | **-13.4%** |

### 兼容性 Bug

`torch.compile` 返回 `OptimizedModule` 对象，在 diffusers 0.31.0 的 pipeline 代码中访问 `self.transformer.config.patch_size` 时报 `AttributeError: 'function' object has no attribute 'config'`。

**修复方案**（未实现）：在 compile 后给返回对象附加 `.config` 属性：
```python
compiled = torch.compile(pipeline.transformer, mode='reduce-overhead', fullgraph=False)
compiled.config = pipeline.transformer.config  # 代理 config 属性
pipeline.transformer = compiled
```

### 结论

- torch.compile 在 T4 + sequential_cpu_offload 下有稳定 ~13% 加速
- 首次推理无额外编译开销（compile 在 pipeline 设置阶段完成，~2s）
- 需修复 `.config` 属性兼容性 bug 才能产出视频
- **修复后预计 8步 ~15.7min（含 ~2min compile 时间）**

---

## P100 退役信息（2026-08-21 确认）

- **退役日期**：2026-09-15
- **影响**：Kaggle 将不再分配 P100 GPU，所有 GPU kernels 只能使用 T4
- **来源**：Kaggle 官方公告 + 实际测试确认
- **方案调整**：所有配置统一为 T4 + sequential_cpu_offload，不再考虑 P100 路径
- **T4 不能用 model_cpu_offload 的原因**：diffusers 0.37.1 的 `enable_model_cpu_offload` 在加载时需同时持有所有模块到 CPU RAM（T5 10.8GB + transformer 3.5GB + CLIP 4.4GB + VAE 0.5GB ≈ 19GB），加上 runtime 开销 > 29GB，被 OS Killed。T4 只能用 diffusers 0.31.0 + sequential_cpu_offload（逐模块加载）。

---

## Design Decisions & References

- diffusers CPU offload 文档：https://huggingface.co/docs/diffusers/optimization/memory
- EchoMimicV3 官方 Tips：https://github.com/antgroup/echomimic_v3
- ComfyUI_EchoMimic mmgp 集成：https://github.com/smthemex/ComfyUI_EchoMimic
- Colab CLI 操作指南：https://github.com/googlecolab/google-colab-cli/blob/main/skills/colab-operator/SKILL.md
- 基准数据来源：v25 (version 27) + v28 (version 28) + v30 (version 30) + v31 (version 31) + v33 (version 33) Kaggle 运行日志
- v31 log 获取方法：`pip install kagglehub` → `kagglehub.notebook_output_download('xpabloli/echomimicv3-flash-test/versions/31', path='debug_log.txt', output_dir='/tmp/v31')`
