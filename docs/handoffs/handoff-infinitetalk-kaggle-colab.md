# Handoff: InfiniteTalk 测试 — Kaggle + Colab 双平台

> **创建时间**: 2026-08-24
> **更新时间**: 2026-08-25
> **状态**: 🔄 脚本已修复（v9/v2），等待运行测试

## 测试目标

在 T4 16GB GPU 上测试 InfiniteTalk（基于 Wan2.1-14B）FP8 量化 + low VRAM 模式推理。

## 源码分析结论（2026-08-25 新增）

通过阅读 InfiniteTalk GitHub 源码（`generate_infinitetalk.py` + `wan/multitalk.py` + `wan/modules/t5.py`），确认了三个关键问题：

### 1. 必须用 `--quant fp8`（不是 int8）

T5 量化加载代码（`wan/modules/t5.py`）：
```python
if quant is not None:
    model_state_dict = load_file(os.path.join(quant_dir, f"t5_{quant}.safetensors"))
    with open(os.path.join(quant_dir, f"t5_map_{quant}.json"), "r") as f:
        quantization_map = json.load(f)
    requantize(model, model_state_dict, quantization_map, device='cpu')
```

当 `quant='int8'` 时 → 寻找 `t5_int8.safetensors` → **HF repo 中不存在此文件** → 崩溃
当 `quant='fp8'` 时 → 寻找 `t5_fp8.safetensors` → **HF repo 中存在** ✅

HF repo `MeiGen-AI/InfiniteTalk/quant_models/` 文件列表：
- `infinitetalk_single_int8.safetensors` (19.5GB) ← DiT INT8 ✅
- `infinitetalk_single_fp8.safetensors` (19.5GB) ← DiT FP8 ✅
- `t5_fp8.safetensors` (6.73GB) ← T5 FP8 ✅
- **`t5_int8.safetensors` 不存在** ← T5 INT8 ❌

README 示例也使用 `--quant fp8`。

### 2. FP8 模式不需要 LoRA（省 9.9GB）

Pipeline 构造函数（`wan/multitalk.py`）：
```python
if quant is not None:
    # 量化分支：只用 quant_dir，不引用 infinitetalk_dir
    model_state_dict = load_file(quant_dir)
    ...
else:
    # 非量化分支：需要 infinitetalk_dir（LoRA 文件）
    weight_files = [..., f"{infinitetalk_dir}"]
    ...
```

LoRA 加载也有条件：
```python
if lora_dir is not None and quant is None:  # ← quant is None 条件
    lora_wrapper = WanLoraWrapper(self.model)
    ...
```

结论：`quant='fp8'` 时，LoRA 被跳过，不需要下载。

### 3. `config.json` MISSING 根因：`--include` 和位置参数混用

v8 命令：
```bash
hf download Wan-AI/Wan2.1-I2V-14B-480P \
    --include 'config.json' 'Wan2.1_VAE.pth' ... \
    --local-dir ...
```

`hf download --help` 确认：
- `--include TEXT` 只接受**一个** glob pattern（可重复 `--include`）
- `[FILENAMES]...` 位置参数直接指定文件名

混用时，`--include 'config.json'` 作为 filter 只匹配 `config.json`，后面的 `'Wan2.1_VAE.pth'` 等变成位置参数。但 `--include` 的 filter 可能排除了位置参数指定的文件。

修复：去掉 `--include` 对具体文件的使用，改用位置参数 + `--include` 只用于 glob pattern（tokenizer 目录）：
```bash
hf download Wan-AI/Wan2.1-I2V-14B-480P \
    config.json Wan2.1_VAE.pth models_t5_umt5-xxl-enc-bf16.pth ... \
    --include 'google/umt5-xxl/*' 'xlm-roberta-large/*' \
    --local-dir ...
```

## 当前状态

### 脚本（已修复）

- **Colab 脚本**: `scripts/colab/infinitetalk-test/run_infinitetalk_colab.py`（v2）
  - `--quant fp8`（不是 int8）
  - 跳过 LoRA 下载
  - `hf download` 修复（位置参数 + `--include` 只用于 glob）
  - `pip install` 去掉 `-q`（保持 WebSocket 活跃）
  - 推理命令去掉 `--infinitetalk_dir`
  - fallback 到 InfiniteTalk 内置示例数据
- **Kaggle 脚本**: `scripts/kaggle/infinitetalk-test/infinitetalk_inference.py`（v9）
  - 同上修复
- **kernel-metadata**: `scripts/kaggle/infinitetalk-test/kernel-metadata.json`（不变）

### 模型文件需求（总计 ~42GB）

| 文件 | 大小 | 来源 | 用途 |
|------|------|------|------|
| config.json | 250B | Wan-AI/Wan2.1-I2V-14B-480P | 模型结构配置 |
| Wan2.1_VAE.pth | 508MB | 同上 | VAE 编解码器 |
| models_t5_umt5-xxl-enc-bf16.pth | 11.4GB | 同上 | T5 编码器（非量化 fallback） |
| models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth | 4.77GB | 同上 | CLIP 视觉编码器 |
| google/umt5-xxl/ | ~0.05GB | 同上 | T5 tokenizer |
| xlm-roberta-large/ | ~0.05GB | 同上 | CLIP tokenizer |
| infinitetalk_single_fp8.safetensors | 19.5GB | MeiGen-AI/InfiniteTalk | FP8 量化 DiT |
| infinitetalk_single_fp8.json | 49.3KB | 同上 | FP8 量化 map |
| t5_fp8.safetensors | 6.73GB | 同上 | FP8 量化 T5 |
| t5_map_fp8.json | 12.5KB | 同上 | T5 FP8 量化 map |
| chinese-wav2vec2-base | 0.35GB | TencentGameMate/chinese-wav2vec2-base | 音频编码器 |

**不需要的文件**：
- 7 个 DiT shard 文件 ~70GB（`diffusion_pytorch_model-0000{1-7}-of-00007.safetensors`）
- LoRA 文件 9.9GB（`single/infinitetalk.safetensors`）

## 版本历史

| 版本 | 平台 | 问题 | 根因 |
|------|------|------|------|
| v5 | Kaggle | 排队超时 | 50 分钟后被系统标记 ERROR |
| v6 | Kaggle | `huggingface-cli` 废弃 | huggingface_hub 1.11.0 中 `huggingface-cli` **no longer works** |
| v7 | Kaggle | `hf download` 成功但磁盘满 | 尝试下载 82GB 基座，`No space left on device` |
| v8 | Kaggle | 选择性下载基座成功但 config.json MISSING + INT8 下载磁盘满 | `--include` 和位置参数混用 + Kaggle 20GB 磁盘不够 |
| v9 | Kaggle | 修复脚本（fp8 + 跳过 LoRA + 修复 hf download） | 待测试（Kaggle 磁盘仍不够，需 Dataset 模式） |
| v1 | Colab | Session 被回收 | pip install `-q` 静默模式导致 WebSocket 超时 |
| v2 | Colab | 修复脚本（fp8 + 跳过 LoRA + pip 不用 -q + 修复 hf download） | 待测试 |

## 平台对比

| 特性 | Kaggle | Colab | Modal |
|------|--------|-------|-------|
| 磁盘空间 | ~20GB（/kaggle/working） | ~70-100GB（/content） | Volume 持久化 |
| GPU 时间限制 | 9h（T4） | 90min 空闲限制 | 按需 |
| 模型持久化 | Dataset（需上传） | 无（每次重下） | Volume ✅ |
| 代理 | Kaggle 内置网络 | Clash Verge 7897 ✅ | 直连 |
| 成本 | 免费 | 免费 | $0.59/h T4（$30/月 free credits） |
| 适用性 | 需 Dataset 模式 | ✅ 磁盘够用 | ✅ 最佳但需付费 |

## 下一步建议

1. **方案 A（推荐）**: 在 Colab 上运行 v2 脚本
   ```bash
   HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc run --gpu T4 --timeout 36000 \
     scripts/colab/infinitetalk-test/run_infinitetalk_colab.py
   ```
   - Colab `/content` 有 ~70-100GB 磁盘，足够 42GB 模型
   - 脚本已修复所有已知问题
   - 如果没有上传 portrait.jpg + audio.wav，自动使用 InfiniteTalk 内置示例数据

2. **方案 B**: Kaggle Dataset 模式（如果 Colab 不稳定）
   - 本地下载所有模型文件
   - `kaggle datasets create` 上传为 Dataset
   - 修改脚本从 `/kaggle/input/` 读取（参考 EchoMimicV3 脚本）

3. **方案 C**: Modal T4（$30/月 free credits，有 Volume 存储）
   - 参考 `scripts/short-video/experiments/modal-echomimicv3-nf4.py`
   - Modal Volume 可以持久化模型文件，不用每次下载

## Clash Verge 代理注意事项

- **当前代理**: Clash Verge Rev，mixed-port 7897，系统代理 + TUN 模式
- **Colab CLI 正确用法**: `HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc ...`
- **不要用 `NO_PROXY` 绕过代理** — Clash Verge TUN 模式下 WebSocket 长连接需要走代理才稳定
- **FlClash 端口 7890 有 auth header POST 断连 bug** — Colab CLI 需切到 Clash Verge（端口 7897）
- **Colab CLI exec WebSocket 超时问题**: 即使走代理，长时间无输出的命令可能导致 WebSocket 超时。建议：
  - 脚本中 pip install 不用 `-q`（输出进度保持连接活跃）✅ 已修复
  - 或用 `colab run`（ephemeral session，不需要持久 WebSocket）

## 关键文件

- **Colab 脚本**: `scripts/colab/infinitetalk-test/run_infinitetalk_colab.py`（v2，已修复）
- **Kaggle 脚本**: `scripts/kaggle/infinitetalk-test/infinitetalk_inference.py`（v9，已修复）
- **输入文件**: `scripts/kaggle/infinitetalk-test/input/`（portrait.jpg + audio.wav）
- **kernel-metadata**: `scripts/kaggle/infinitetalk-test/kernel-metadata.json`

## 参考文档

- `docs/research/digital-human-test-progress.md` — 数字人测试进度主文件
- `docs/handoffs/handoff-echomimicv3-kaggle.md` — EchoMimicV3 Kaggle 成功经验（Dataset 模式）
- `docs/handoffs/handoff-colab-nf4-test.md` — Clash Verge 代理配置 + Colab CLI 用法
- `docs/research/colab-cli-guide.md` — Colab CLI 完整指南
- InfiniteTalk README: https://github.com/MeiGen-AI/InfiniteTalk
- InfiniteTalk HF: https://huggingface.co/MeiGen-AI/InfiniteTalk
- InfiniteTalk quant_models: https://huggingface.co/MeiGen-AI/InfiniteTalk/tree/main/quant_models
