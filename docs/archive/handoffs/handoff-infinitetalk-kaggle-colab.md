# Handoff: InfiniteTalk 测试 — Kaggle + Colab 双平台

> **创建时间**: 2026-08-24
> **更新时间**: 2026-08-26 10:50
> **状态**: ✅ Kaggle v8 下载+上传成功（部分文件）+ Colab T4 资源不足

## ⚠️ 当前状态

### Kaggle Dataset Creator — ✅ v8 下载成功，部分上传成功

**v7** (curl -L): 所有 LFS 文件下载成功（7.3 分钟），但 `kaggle datasets version/create` 默认 `--dir-mode=skip` 跳过子目录 → 上传失败。

**v8** (--dir-mode zip): 下载成功 + 上传修复。总时间 85.3 分钟。但只有 Batch 2 和 Batch 4 的 version push 成功，Batch 1 和 3 因 dataset title 冲突失败。当前 dataset 只包含 t5_fp8 + wav2vec2，缺少 Wan2.1 base model 和 FP8 DiT。

**结论**：Kaggle 分批上传策略不可靠。推荐改为在推理 kernel 中直接用 `curl -L` 下载到 `/tmp`（~70GB+），跳过 Dataset 创建。

- **经验文档**: 已合并到 `docs/research/cloud-gpu-options.md` §2.3b
- **Dataset**: https://www.kaggle.com/datasets/xpabloli/infinitetalk-models（不完整，只有部分文件）

### Colab T4 — ❌ 持续 Service Unavailable

- 从 2026-08-25 19:45 到 22:20（~2.5 小时），30 次重试全部失败
- 错误：`ColabRequestError: Failed to issue request POST .../assign?...&variant=GPU&accelerator=T4: Service Unavailable`
- 根因：Google 侧 T4 GPU 资源不足，非脚本问题
- Colab v3 脚本已修复（`Popen` 实时输出），等 T4 可用后可直接运行

## 新 session 下一步

### 方案 1（推荐）：等 Colab T4 可用后运行 v3 脚本
```bash
# 检查 T4 是否可用
HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc run --gpu T4 --timeout 36000 \
  scripts/colab/infinitetalk-test/run_infinitetalk_colab.py
```
- Colab `/content` 有 ~70-100GB 磁盘，足够 42GB 模型
- v3 脚本已修复所有已知问题（`Popen` 实时输出 + `--quant fp8` + 跳过 LoRA + 修复 `hf download`）
- T4 通常在非高峰时段（北京时间凌晨/早上）更容易分配

### 方案 2：Modal T4（$30/月 free credits）
- 参考 `scripts/short-video/experiments/modal-echomimicv3-nf4.py`
- Modal Volume 可以持久化模型文件，不用每次下载
- 定价：$0.59/h T4（[[memory:17867091779830351596]]）
- 不需要代理，直连 HuggingFace

### 方案 3：本地下载 + Kaggle Dataset 上传
- 在本地 Mac 上用 `hf download` 下载所有 42GB 模型文件
- 用 `kaggle datasets create` 上传为 Kaggle Dataset
- 然后在 Kaggle kernel 中从 `/kaggle/input/` 读取模型运行推理
- 缺点：42GB 上传时间长

## 快速检查命令
```bash
# 检查 Colab T4 是否可用
HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc run --gpu T4 --timeout 36000 \
  scripts/colab/infinitetalk-test/run_infinitetalk_colab.py
```

## v3 修复详情（Colab 脚本）

### 根因：`capture_output=True` 吞掉输出
v2 脚本的 `run()` 函数用 `subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)`：
- 所有 stdout/stderr 被 Python 捕获，不直接输出到 console
- `hf download` 下载 42GB 模型时长时间无 stdout 输出
- Colab CLI 的 WebSocket 看不到任何数据 → idle timeout → 连接断开

### v3 修复：`subprocess.Popen` 实时输出
```python
proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        text=True, bufsize=1, universal_newlines=True)
for line in proc.stdout:
    print(line.rstrip())
    sys.stdout.flush()  # 关键：每行 flush
```

## 测试目标

在 T4 16GB GPU 上测试 InfiniteTalk（基于 Wan2.1-14B）FP8 量化 + low VRAM 模式推理。

## 源码分析结论（2026-08-25）

### 1. 必须用 `--quant fp8`（不是 int8）

T5 量化加载代码（`wan/modules/t5.py`）：
```python
if quant is not None:
    model_state_dict = load_file(os.path.join(quant_dir, f"t5_{quant}.safetensors"))
```

当 `quant='int8'` 时 → 寻找 `t5_int8.safetensors` → **HF repo 中不存在** → 崩溃
当 `quant='fp8'` 时 → 寻找 `t5_fp8.safetensors` → **HF repo 中存在** ✅

### 2. FP8 模式不需要 LoRA（省 9.9GB）

Pipeline 代码：`if lora_dir is not None and quant is None:` → LoRA 只在非量化模式加载。

### 3. `config.json` MISSING 根因：`--include` 和位置参数混用

`hf download --include 'config.json'` 作为 filter 排除了其他位置参数指定的文件。
修复：位置参数指定具体文件 + `--include` 只用于 glob pattern。

## 版本历史

### Kaggle Dataset Creator

| 版本 | 方法 | 结果 | 根因 |
|------|------|------|------|
| v1 | `hf download` CLI | ERROR | Kaggle script 模式无 KAGGLE_USERNAME/KAGGLE_KEY |
| v2 | `hf download` CLI + `capture_output=True` + `HF_HUB_ENABLE_HF_TRANSFER=1` | COMPLETE 但 0B | `capture_output` 吞输出 + `hf_transfer` 导致 LFS 0B |
| v3 | `hf download` CLI + `Popen` + timeout 3600s | COMPLETE 但 0B | CLI 保留 repo 路径结构 → 路径重复 + LFS 0B |
| v4 | `hf_hub_download()` + `shutil.move` | ERROR | symlink 跨文件系统 `shutil.move` 失败 |
| v5 | `hf_hub_download()` + `shutil.copy2` + `os.path.realpath()` | ERROR | HF cache blob 0B（`hf_hub_download` 在 Kaggle 上 LFS 0B） |
| v6 | `requests.get()` 直接 HTTP | COMPLETE 但 0B | HF LFS CDN 在 Kaggle 网络中返回 0B |

| **v7** | **`curl -L` (LFS) + `hf_hub_download` (small)** | **✅ 下载成功, ❌ 上传失败** | **Kaggle CLI --dir-mode=skip 跳过子目录** |
| **v8** | **v7 + `--dir-mode zip`** | **✅ 部分成功** | **下载成功, 上传成功但分批 version push 只成功 2/4** |

### Colab

| 版本 | 问题 | 根因 |
|------|------|------|
| v1 | Session 被回收 | pip install `-q` 静默模式导致 WebSocket 超时 |
| v2 | WebSocket 断开（TCP CLOSED），进程变僵尸 | `hf download` 的 `capture_output=True` 吞掉输出 → WebSocket idle 超时 |
| v3 | 修复 `run()` Popen 实时输出 | T4 GPU `Service Unavailable`（Google 侧资源不足，非脚本问题） |

## 平台对比

| 特性 | Kaggle | Colab | Modal |
|------|--------|-------|-------|
| 磁盘空间 | ~20GB（/kaggle/working） | ~70-100GB（/content） | Volume 持久化 |
| GPU 时间限制 | 9h（T4） | 90min 空闲限制 | 按需 |
| 模型持久化 | Dataset（需上传） | 无（每次重下） | Volume ✅ |
| HF LFS 下载 | ❌ 0B 文件 | ✅ 正常 | ✅ 正常 |
| 代理 | Kaggle 内置网络 | Clash Verge 7897 ✅ | 直连 |
| 成本 | 免费 | 免费 | $0.59/h T4（$30/月 free credits） |
| 适用性 | ❌ LFS 下载失败 | ✅ 磁盘够用（等 T4 可用） | ✅ 最佳但需付费 |

## Clash Verge 代理注意事项

- **当前代理**: Clash Verge Rev，mixed-port 7897，系统代理 + TUN 模式
- **Colab CLI 正确用法**: `HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc ...`
- **不要用 `NO_PROXY` 绕过代理** — TUN 模式下 WebSocket 长连接需要走代理才稳定
- **FlClash 端口 7890 有 auth header POST 断连 bug** — Colab CLI 需切到 Clash Verge（端口 7897）[[memory:17874720221420823326]]
- **Colab CLI WebSocket 超时问题根因**: `capture_output=True` 吞掉 stdout → WebSocket 无数据 → idle 超时。v3 用 `Popen` 实时输出已修复
- **Colab T4 `Service Unavailable`**: Google 侧 GPU 资源不足，重试即可

## 关键文件

- **Colab 脚本**: `scripts/colab/infinitetalk-test/run_infinitetalk_colab.py`（v3，已修复 Popen）
- **Kaggle Dataset 脚本**: `scripts/kaggle/infinitetalk-dataset/create_dataset_kernel.py`（v8, curl -L + --dir-mode zip）
- **LFS 经验文档**: 已合并到 `docs/research/cloud-gpu-options.md` §2.3b
- **Kaggle Dataset metadata**: `scripts/kaggle/infinitetalk-dataset/kernel-metadata.json`
- **Kaggle 推理脚本**: `scripts/kaggle/infinitetalk-test/infinitetalk_inference.py`（v9，待 Dataset 创建成功后更新）
- **输入文件**: `scripts/kaggle/infinitetalk-test/input/`（portrait.jpg + audio.wav）

## 参考文档

- `docs/research/digital-human-test-progress.md` — 数字人测试进度主文件
- `docs/handoffs/handoff-echomimicv3-kaggle.md` — EchoMimicV3 Kaggle 成功经验（Dataset 模式）
- `docs/handoffs/handoff-colab-nf4-test.md` — Clash Verge 代理配置 + Colab CLI 用法
- `docs/research/colab-cli-guide.md` — Colab CLI 完整指南
- InfiniteTalk README: https://github.com/MeiGen-AI/InfiniteTalk
- InfiniteTalk HF: https://huggingface.co/MeiGen-AI/InfiniteTalk
- InfiniteTalk quant_models: https://huggingface.co/MeiGen-AI/InfiniteTalk/tree/main/quant_models
