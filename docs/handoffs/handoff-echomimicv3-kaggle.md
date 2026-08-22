# Handoff: EchoMimicV3 Kaggle 测试 & 下一步数字人模型测试

> **创建时间**：2026-08-17 20:25 CST
> **上一 session**：EchoMimicV3 Flash 在 Kaggle P100 上的推理测试
> **下一 session 目标**：根据 EchoMimicV3 最终结果，决定继续优化或切换到下一个模型

---

## 当前状态

### EchoMimicV3 v25 (version 27) 正在运行中

- **开始时间**：2026-08-17 19:56 CST
- **当前状态**：RUNNING（截至 20:25，已运行约 29 分钟）
- **后台轮询**：Shell ID 4283（每 2 分钟轮询，自动停止于 COMPLETE/ERROR）
- **Kaggle 限时**：单次 kernel 最长 12 小时（不是连续 12 小时），每周 30 小时 GPU 配额。当前运行远未到限。

### 判断标准

- **如果 v25 COMPLETE 且有 mp4 输出** → EchoMimicV3 在 P100 上可用，但 `sequential_cpu_offload` 模式太慢（推理 20+ 分钟），需评估是否实用
- **如果 v25 COMPLETE 但无 mp4** → 下载 `debug_log.txt` 查看新错误
- **如果 v25 ERROR** → 下载 `debug_log.txt` 查看错误，决定是否修复或切换模型

---

## EchoMimicV3 测试历程（v1-v25，2026-08-15 ~ 08-17）

### 已解决的 7 个环境问题

| # | 问题 | 修复版本 | 修复方法 |
|---|------|---------|---------|
| 1 | P100 (sm_60) 不兼容 cu128 | v1 | 降级 PyTorch 2.10→2.4.1+cu121 |
| 2 | diffusers 0.37 依赖 PyTorch 2.6+ API | v20 | 安装 diffusers 0.31.0 到自定义目录 + PYTHONPATH |
| 3 | transformers 5.0 移除 FLAX_WEIGHTS_NAME | v20 | try/except patch pipeline_loading_utils.py |
| 4 | transformers 5.0 check_torch_load_is_safe 阻止 .bin 加载 | v22 | 逐行替换函数体为 pass |
| 5 | tokenizer 文件 curl 下载为 LFS 指针 (15 bytes) | v23 | 改用 huggingface_hub.hf_hub_download |
| 6 | CUDA OOM (19GB 模型 → 16GB GPU) | v24 | patch pipeline.to(device) → enable_sequential_cpu_offload() |
| 7 | patch 缩进错误 (IndentationError) | v25 | 逐行扫描检测原始缩进 + 应用到所有替换行 |

### 关键文件

- **推理脚本**：`scripts/kaggle/echomimicv3-test/echomimicv3_inference.py`（v25）
- **Kaggle metadata**：`scripts/kaggle/echomimicv3-test/kernel-metadata.json`
- **输入数据**：`scripts/kaggle/echomimicv3-test/input/`（portrait.jpg + audio.mp3）
- **输出目录**：`scripts/kaggle/echomimicv3-test/output_v23/`（v23 日志）、`output_v24/`（v24 日志）
- **进度文档**：`docs/research/digital-human-test-progress.md`（已更新到 v24 结果）

### 模型权重（20GB，下载到 /tmp）

| 组件 | 大小 | 来源 |
|------|------|------|
| VAE | 484MB | `huggingface.co/alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP` |
| umT5 text encoder | 10.8GB | 同上 |
| CLIP image encoder | 4.4GB | 同上 |
| Flash transformer | 3.5GB | `huggingface.co/BadToBest/EchoMimicV3/echomimicv3-flash-pro` |
| Chinese wav2vec2 | 362MB | `modelscope.cn/models/TencentGameMate/chinese-wav2vec2-base` |
| Tokenizer | 21MB | `huggingface.co/alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP/google/umt5-xxl/` |

### 核心问题：sequential_cpu_offload 太慢

`infer_flash.py` 原始代码中 `GPU_memory_mode` 参数被声明但**从未使用**。`pipeline.to(device=device)` 把所有模块（VAE 484MB + T5 10.8GB + CLIP 4.4GB + transformer 3.5GB ≈ 19GB）一次性加载到 GPU，超出 P100 16GB。

v25 patch 为 `enable_sequential_cpu_offload()`，模块逐个搬运到 GPU。但这个模式非常慢——每次 forward pass 都要 CPU→GPU→CPU 搬运，81 帧 × 8 步推理可能需要 30-60 分钟。

---

## 下一步：切换模型方案

如果 EchoMimicV3 不实用（太慢或失败），建议按以下优先级测试新模型：

### 方案 A：Sonic（效果最好但非商用，可做质量基准）

- **VRAM**：12GB（P100 16GB 足够，**不需要 CPU offload**）
- **许可证**：❌ 非商用（仅做质量基准）
- **GitHub**：`github.com/jianchangwanmg/ComfyUI_Sonic`
- **优势**：效果最好，16GB GPU 可直接跑（不需 offload），推理速度快
- **劣势**：非商用；需要 ComfyUI 环境
- **Kaggle 方案**：安装 ComfyUI + Sonic 插件 → 下载模型 → 运行推理
- **关键文件参考**：本地 M2 Pro 测试记录在 `docs/research/digital-human-test-progress.md` Sonic 章节

### 方案 B：InfiniteTalk（Apache 2.0 + 中文 + 无限长度）

- **VRAM**：~12GB（P100 16GB 可能足够）
- **许可证**：✅ Apache 2.0（商用 OK）
- **GitHub**：`github.com/MeiGen-AI/InfiniteTalk`
- **HuggingFace**：`MeiGen-AI/InfiniteTalk`
- **优势**：商用许可、支持中文、无限长度生成、也可做 image-audio-to-video
- **劣势**：基于 WAN 2.1（和 EchoMimicV3 同基座），可能遇到类似的依赖问题
- **Kaggle 方案**：参考 EchoMimicV3 的环境配置（PyTorch 2.4.1+cu121 + diffusers 0.31 + PYTHONPATH），但 InfiniteTalk 可能不需要 patch（取决于其代码是否使用了 `pipeline.to(device)`）

### 方案 C：V-Express（最轻量扩散模型）

- **VRAM**：~8GB（P100 16GB 绰绰有余，**不需要 CPU offload**）
- **许可证**：❓ 待确认
- **GitHub**：`github.com/Naozawa520/V-Express`
- **优势**：最轻量、16GB GPU 直接跑、推理速度应该最快
- **劣势**：在 M2 Pro 上 17min/sub-step（但那是因为 MPS 后端，CUDA 应该快很多）
- **Kaggle 方案**：最简单——clone repo → 下载模型 (~7GB) → 直接推理，不需要复杂的 patch

### 方案 D：LatentSync 1.6（省内存模式）

- **VRAM**：18GB（省内存模式可能压到 16GB）
- **许可证**：✅ OpenRAIL++（商用 OK）
- **GitHub**：`github.com/harlanhong/latentsync`
- **优势**：512px 分辨率、商用许可
- **劣势**：可能需要省内存模式、512px 可能不够清晰

---

## Kaggle 环境 已知问题 & 解决方案（供下一个模型参考）

### 1. PyTorch 版本

```bash
# P100 (sm_60) 需要 cu121，Kaggle 预装 cu128 不兼容
/usr/bin/python3 -m pip uninstall -y torch torchvision torchaudio
/usr/bin/python3 -m pip install torch==2.4.1 torchvision==0.19.1 --index-url https://download.pytorch.org/whl/cu121
```

### 2. diffusers 版本

```bash
# 系统 diffusers 0.37+ 深度集成 PyTorch 2.6+ API
# 安装 diffusers 0.31.0 到自定义目录 + PYTHONPATH 覆盖
/usr/bin/python3 -m pip install --no-deps --target=/kaggle/working/diffusers0310 diffusers==0.31.0
export PYTHONPATH=/kaggle/working/diffusers0310:$PYTHONPATH
```

### 3. transformers 安全检查

```python
# transformers 5.0 的 check_torch_load_is_safe 阻止 .bin 加载
# 需 patch /usr/local/lib/python3.12/dist-packages/transformers/utils/import_utils.py
# 将 check_torch_load_is_safe 函数体替换为 pass
```

### 4. 模型下载到 /tmp

```bash
# /kaggle/working 只有 20GB，大模型下载到 /tmp
MODELS_DIR="/tmp/models"
# curl 下载（hf download CLI 有断点续传 bug）
# tokenizer 文件用 huggingface_hub.hf_hub_download（curl 会返回 LFS 指针）
```

### 5. CPU offload（如果模型 > 16GB）

```python
# 不要用 pipeline.to(device)，用：
pipeline.enable_sequential_cpu_offload()  # 逐模块搬运（慢但避免 OOM）
# 或
pipeline.enable_model_cpu_offload()  # 整模块搬运（快一些但需要更多 VRAM）
```

---

## 云 GPU 资源

| 平台 | 命令 | GPU | 免费额度 | 适用场景 |
|------|------|-----|---------|---------|
| **Kaggle** | `kaggle kernels push -p .` | P100/T4 16GB | 30h/周 | 自动化批量推理 |
| **Colab CLI** | `colab run --gpu T4 script.py` | T4 16GB | 不固定 | 一键运行单脚本 |
| **Colab CDP** | web-access skill | T4 16GB | 同 Colab | 交互式调试 |
| **AutoDL** | 手动租用 | RTX 4090 24GB | ¥1.88/h | 16GB 不够时 |

---

## 建议的 Skills

- `short-video-pipeline` — 如果测试成功后需要集成到视频管线
- `diagnosing-bugs` — 如果新模型遇到环境问题
- `research` — 调研新模型的兼容性和 VRAM 需求
- `handoff` — 如果需要再次 handoff

---

## 相关文档

- `docs/research/digital-human-test-progress.md` — 所有数字人模型测试进度
- `docs/research/digital-human-solutions-m2-pro.md` — 数字人方案主文档
- `docs/research/cloud-gpu-options.md` — 完整 GPU 方案对比
- `docs/archive/handoff-cloud-gpu-kaggle-setup.md` — Kaggle + Colab CLI 配置全过程
- `scripts/kaggle/echomimicv3-test/echomimicv3_inference.py` — EchoMimicV3 推理脚本（v25）
