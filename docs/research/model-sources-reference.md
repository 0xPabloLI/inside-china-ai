# 模型搜索来源参考

> **用途**：当用户要求找模型时，按以下来源依次搜索，避免遗漏。
> **创建日期**：2026-08-09

---

## 1. 模型/项目搜索来源

### 1.1 GitHub（最重要）

GitHub 是最大的开源项目仓库，很多数字人/AI 项目不发布到 HuggingFace。**必须搜 GitHub。**

**搜索方法**：

```
https://api.github.com/search/repositories?q={关键词}&sort=stars&order=desc&per_page=20
```

或用网页：`https://github.com/search?q={关键词}&type=repositories&s=stars&o=desc`

**关键词组合策略**（以"数字人"为例，从宽到窄）：

| 搜索目的 | 关键词组合 |
|---------|----------|
| 找所有数字人项目 | `digital human open source` |
| 找 talking head 模型 | `talking head audio driven` |
| 找唇形同步 | `lip sync video` |
| 找特定平台移植 | `{模型名} mlx` / `{模型名} onnx` / `{模型名} mac` / `{模型名} mps` |
| 找替代方案 | `heygen alternative open source` |
| 找中文项目 | `数字人 开源` / `说话头 模型` |
| 找特定功能 | `photo to talking video` / `avatar clone voice` |
| 找框架/集成 | `comfyui talking head` / `comfyui digital human` |

**技巧**：
- 用 GitHub API `q=` 参数 + `sort=stars` 找高星项目
- 搜索后看 `description` 和 `topics` 字段筛选
- 查看 README 中的 `Installation` 和 `Requirements` 部分确认 GPU/OS 要求
- 检查 `docker-compose.yml` 中的 `runtime: nvidia` 判断是否硬性依赖 CUDA
- 检查 `requirements.txt` 中是否有 `onnxruntime-gpu` / `xformers` / `bitsandbytes` 等 CUDA 专用包
- 看 Issues 中是否有人讨论 Mac/MPS/Apple Silicon 支持

### 1.2 HuggingFace

**适合找**：预训练模型权重、量化版本（MLX/ONNX/GGUF）、在线 Demo

```
# API 搜索
https://huggingface.co/api/models?search={关键词}&limit=20

# 网页搜索
https://huggingface.co/models?search={关键词}
```

**关键词组合**：
- `talking head` / `lip sync` / `portrait animation` / `audio-driven portrait`
- `{模型名} mlx` / `{模型名} onnx` / `{模型名} coreml`
- `digital human` / `avatar`

**技巧**：
- 看 `likes` 和 `downloads` 判断模型热度
- 看 `tags` 字段找特定平台版本（`mlx`、`onnx`、`coreml`）
- 看 `library_name` 确认推理框架
- 看 README 中的性能数据和兼容性说明

### 1.3 ModelScope（阿里巴巴）

中国版 HuggingFace，很多中国团队的模型首发在这里。

```
https://modelscope.cn/api/v1/models?PageSize=20&PageNumber=1&Query={关键词}
```

网页：`https://modelscope.cn/models?Query={关键词}`

### 1.4 Gitee（中国版 GitHub）

中国开发者经常在这里发布项目，特别是中文数字人项目。

网页：`https://search.gitee.com/?q={关键词}&type=repository`

### 1.5 PapersWithCode

论文 + 代码索引，适合找学术界的最新模型。

网页：`https://paperswithcode.com/search?q={关键词}`

### 1.6 ComfyUI 生态

很多数字人模型有 ComfyUI 节点封装，搜索 `comfyui {功能}` 在 GitHub 上。

### 1.7 其他来源

| 来源 | 网址 | 说明 |
|------|------|------|
| **arxiv** | arxiv.org/search | 找最新论文，确认 arxiv ID 后查代码 |
| **Replicate** | replicate.com | 云端模型推理，有 API |
| **Civitai** | civitai.com | SD 社区，有 avatar 模型 |
| **OpenXLab** | openxlab.org.cn | 上海 AI Lab 的模型平台 |
| **B站** | search.bilibili.com | 搜中文教程，经常有部署指南 |
| **小红书** | xiaohongshu.com | 搜"数字人 开源"找中文社区动态 |

---

## 2. GPU 兼容性判断清单

搜索到模型后，按以下步骤判断是否兼容目标设备：

### 2.1 检查 CUDA 硬依赖

| 检查项 | 在哪里看 | CUDA 专用信号 |
|--------|---------|-------------|
| `requirements.txt` | repo 根目录 | `onnxruntime-gpu`, `xformers`, `bitsandbytes`, `ninja`, `mmcv-full` |
| `docker-compose.yml` | `deploy/` 目录 | `runtime: nvidia`, `capabilities: [gpu]` |
| 推理代码 | `grep -r "cuda\|\.to(device)" *.py` | `device = "cuda"` 硬编码 |
| 训练代码 | `train.py` | 通常更难移植 |
| README | 安装/硬件要求章节 | "Requires NVIDIA GPU" |

### 2.2 MPS 兼容性判断

```
# 无 CUDA 专用依赖 + device 可参数化 = MPS 可能可行
grep -r "cuda\|device" inference.py | head -20
# 如果是 args.device 传入 → 可以设 "mps"
# 如果是 torch.device("cuda") 硬编码 → 需要改代码
```

### 2.3 常见 CUDA 专用包替代方案

| CUDA 专用包 | macOS 替代 |
|------------|-----------|
| `onnxruntime-gpu` | `onnxruntime-silicon` 或 `onnxruntime`（CPU） |
| `xformers` | 无直接替代，需跳过或用 PyTorch 原生 attention |
| `bitsandbytes` | 无 macOS 版本 |
| `mmcv-full` | `mmcv`（可能功能受限） |
| `ninja` | `brew install ninja` |
| `mmpose` + `mmdet` | 可用但需 MPS 后端 |

---

## 3. 搜索流程模板

当用户要求"找一个能做 X 的模型"时：

```
Step 1: GitHub API 搜索（最宽关键词 + sort=stars）
Step 2: HuggingFace API 搜索（找权重和量化版本）
Step 3: GitHub API 搜索（平台限定：{模型名} mlx/onnx/mac/mps）
Step 4: ModelScope 搜索（找中国团队模型）
Step 5: PapersWithCode 搜索（找最新学术模型）
Step 6: 汇总 → 检查 GPU 兼容性 → 推荐方案
```

---

## Design Decisions & References

- **为什么 GitHub 比 HuggingFace 更重要**：很多完整的数字人项目（HeyGem、Linly-Talker、OpenTalking）只在 GitHub 上，HuggingFace 主要是模型权重仓库。
- **为什么搜多个关键词组合**：同一个功能可能有多个表述（"talking head" vs "digital human" vs "说话头" vs "数字人"），单一关键词会遗漏。
- **为什么检查 docker-compose.yml**：很多项目的 README 不明确说"需要 NVIDIA"，但 Docker 配置中的 `runtime: nvidia` 是硬性依赖的铁证。

---

## 模型选择通用标准

> **触发条件**：选模型时（ASR、TTS、VLM、数字人等）先读此章节。硬性要求不满足则不入选。

### 硬性要求（不满足则不入选）

1. **许可证允许商用** — 接受：MIT、Apache-2.0、BSD、MPL-2.0、CC-BY-4.0。不接受：CC-BY-NC 及任何含 Non-Commercial 限制的许可证。
2. **Apple Silicon 加速** — 支持 MPS（PyTorch）、MLX、Metal（whisper.cpp/ggml）、CoreML 中的至少一种。纯 CPU-only 或硬性依赖 CUDA 的不入选（可在调研报告中标注为"不兼容"但不作为首选）。

### 综合评分（多维度加权）

满足硬性要求后，对四个维度各打 1-5 分，加权求和得总分。总分用于横向对比，不作为唯一决策依据——实际选择还需结合具体场景需求（如中文支持、实时性、部署复杂度等）。

| 维度 | 权重 | 5 分 | 3 分 | 1 分 |
|------|------|------|------|------|
| Apple Silicon 加速成熟度 | 30% | MLX 原生 | Metal/CoreML | MPS only / CPU |
| 许可证宽松度 | 20% | MIT / Apache-2.0 | BSD / MPL-2.0 | CC-BY-4.0（有署名要求） |
| 精度/质量 | 30% | 业界 SOTA | 可用 | 一般 |
| 社区与工具链 | 20% | 活跃维护 + 完善工具链 | 有更新 | 停更/无工具链 |

> **评分原则**：精度和加速成熟度各占 30% 是核心考量；许可证和社区各占 20% 是约束性考量。总分相同时，优先看精度。

### 领域推荐索引

| 领域 | 详细对比见 |
|------|-----------|
| ASR（语音转文字） | 下表 |
| TTS（语音合成） | `docs/research/voice-cloning-solutions-m2-pro.md` |
| VLM（视觉语言模型） | `docs/research/digital-human-solutions-m2-pro.md` |
| 数字人 | `docs/research/digital-human-solutions-m2-pro.md` |

### ASR 推荐速查

| 工具 | 许可证 | 加速 | 推荐模型 | 加速(30%) | 许可证(20%) | 精度(30%) | 社区(20%) | 总分 | 状态 |
|------|--------|------|----------|-----------|------------|----------|-----------|------|------|
| whisper.cpp | MIT | Metal + CoreML | large-v3-turbo | 5 | 5 | 4 | 5 | **4.7** | ⭐ 首选 |
| mlx-whisper | MIT | MLX | large-v3 | 5 | 5 | 5 | 3 | **4.6** | ⭐ 备选 |
| whisperx (faster-whisper) | BSD-4 | ❌ CPU | base | 1 | 3 | 3 | 4 | **2.7** | ⚠️ 仅 alignment |
| Parakeet MLX | Apache-2.0 | MLX | 0.6B | 5 | 5 | 3 | 3 | **4.0** | ⚠️ 英文为主 |

> NVIDIA Canary-Qwen（CC-BY-NC + CUDA only）不满足硬性要求，不进入评分。
