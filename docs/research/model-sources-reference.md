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

> **API 文档**：[GitHub REST API Search](https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28) — 专属速率限制、1,000 结果上限、`incomplete_results` 字段。最后验证：2026-08-26。

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

> **API 文档**：[HuggingFace Hub API](https://huggingface.co/docs/hub/en/api) — 模型搜索、文件列表、模型卡。最后验证：2026-08-26。

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

> **注**：ModelScope API 需登录 token，搜索结果可能因账户权限不同。最后验证：2026-08-09。

### 1.4 Gitee（中国版 GitHub）

中国开发者经常在这里发布项目，特别是中文数字人项目。

网页：`https://search.gitee.com/?q={关键词}&type=repository`

### 1.5 论文与代码发现

> **注**：PapersWithCode 已于 2025 年并入 Hugging Face，搜索入口重定向至 HF Trending Papers，不再可用作代码索引。

**发现流程**：先以 arXiv / HF Papers 发现论文，再以论文作者、标题和 arXiv ID 在 GitHub / HuggingFace / ModelScope 查找官方实现与权重。

- arXiv 搜索：`https://arxiv.org/search/?query={关键词}&searchtype=all`
- HF Trending Papers：`https://huggingface.co/papers`

### 1.6 ComfyUI 生态

很多数字人模型有 ComfyUI 节点封装，搜索 `comfyui {功能}` 在 GitHub 上。

### 1.7 其他来源

| 来源 | 网址 | 说明 |
|------|------|------|
| **arXiv** | arxiv.org/search | 找最新论文，确认 arXiv ID 后在 GitHub/HF/ModelScope 查实现（见 §1.5） |
| **Replicate** | replicate.com | 云端模型推理，有 API |
| **Civitai** | civitai.com | SD 社区，有 avatar 模型 |
| **OpenXLab** | openxlab.org.cn | 上海 AI Lab 的模型平台 |
| **B站** | search.bilibili.com | 搜中文教程，经常有部署指南 |
| **小红书** | xiaohongshu.com | 搜"数字人 开源"找中文社区动态 |

### 1.8 General 模型选型信源（非数字人专用）

> **触发条件**：选通用 LLM/VLM/ASR/TTS 模型时，按以下优先级查证。可信度从高到低。

| 优先级 | 信源 | 类别 | 用途 | URL |
|--------|------|------|------|-----|
| 1 | **Ollama Library** | 模型目录 | 验证模型可用性 + 能力标签（Text/Image/Tools/Thinking）+ MLX 变体 + 一键安装 | ollama.com/library |
| 2 | **LM Studio 目录** | 模型目录 | 验证 MLX/GGUF 兼容性 + 可视化搜索 | lmstudio.ai/models |
| 3 | **HuggingFace `mlx-community`** | 模型仓库 | 找 MLX 量化版（UGC，**需 smoke test 后再用**） | huggingface.co/mlx-community |
| 4 | **HF Eval Results + 社区榜单** | 评测排名 | 开源 LLM 评测结果与按任务的社区榜单 | huggingface.co/docs/leaderboards |
| 5 | **Artificial Analysis** | 评测排名 | 速度/质量/价格三维对比 | artificial.ai |
| 6 | **Roboflow VLM Benchmark** | 评测排名 | VLM 视觉能力实测排名（25+ 模型，按月更新） | playground.roboflow.com/models/task/vision-language |
| 7 | **ModelScope** | 模型仓库 | 中国团队模型首发地 | modelscope.cn |
| 8 | **Ollama Cheat Sheet** (computingforgeeks) | 速查 | 按 VRAM/场景排序的 Ollama 模型速查表 | computingforgeeks.com/ollama-models-cheat-sheet |

**来源分类**（四层，避免混淆）：

| 分类 | 说明 | 示例 | 证据类型 |
|------|------|------|----------|
| **模型目录**（发现与分发） | 浏览、搜索、一键安装 | Ollama Library、LM Studio 目录 | 第一方事实（模型卡、LICENSE） |
| **权重仓库**（获取与模型卡） | 下载权重、看模型卡和许可证 | HuggingFace、ModelScope | 第一方事实 + 发行与安装 |
| **评测结果**（能力证据） | 质量/速度/成本对比 | HF Eval Results、Artificial Analysis、Roboflow Benchmark | 独立评估 |
| **运行时**（执行与本机验证） | 实际运行模型推理 | Ollama、llama.cpp、mlx-vlm、vLLM | 本机决策 |

> **注意**：Ollama 同时是模型目录（Library）和运行时（serve）。在选模型阶段查 Library，在验证阶段用 serve。
>
> **证据分层**（按可信度从高到低）：第一方事实（官方模型卡、LICENSE、仓库文档）→ 发行与安装（Library/LM Studio/HF 文件页，需 smoke test）→ 独立评估（可复现实验报告，需说明任务集与局限）→ 本机决策（固定 corpus benchmark + E2E 测试，需记录图片/视频/峰值内存/失败率）。

**Ollama 模型驻留**：模型推理后默认 5 分钟空闲自动卸载。可通过 API 的 `keep_alive` 参数或 `OLLAMA_KEEP_ALIVE` 环境变量覆盖（见 [Ollama FAQ](https://docs.ollama.com/faq)）。设为 `0` 立即卸载，设为 `-1` 永久驻留。作为 fallback 可行——平时不占内存。

---

## 2. 模型格式速查

> **触发条件**：下载模型权重前确认格式。不同格式不通用。

### 权重容器（文件格式）

| 格式 | 推理引擎 | 跨引擎？ | Apple Silicon | 说明 |
|------|---------|---------|--------------|------|
| **GGUF** | llama.cpp / Ollama / LM Studio | ✅ | ✅ Metal | llama.cpp **创建**的格式（替代旧 GGML），现为本地推理通用标准 |
| **MLX** | mlx-lm / mlx-vlm / Ollama (macOS) | ❌ Apple only | ✅ 原生 | Apple Silicon 原生格式 |
| **safetensors** | transformers / vLLM | ✅ | ✅ MPS | 全精度源格式，量化前的基础 |

> **性能说明**：不同格式间的性能对比必须以目标模型、量化等级、上下文长度、运行时版本和目标机器的可复现实测为准，不存在普遍适用的百分比结论。

### 量化方法

| 方法 | 适用引擎 | 硬件 | 量化位宽 | 说明 |
|------|---------|------|---------|------|
| **K-quants** | llama.cpp / Ollama | ✅ Metal | Q2-Q8 | GGUF 的量化方式 |
| **MLX 量化** | mlx-lm / mlx-vlm | ✅ 原生 | 2-8 bit | MLX 原生量化 |
| **GPTQ** | vLLM / transformers | ❌ NVIDIA | 4-bit | 量化算法，权重存为 safetensors |
| **AWQ** | vLLM / transformers | ❌ NVIDIA | 4-bit | 量化算法，质量通常优于 GPTQ |
| **EXL2** | ExLlamaV2 | ❌ NVIDIA | 2-8 bpw | 可变比特率，精确填满 VRAM 预算 |

**Apple Silicon 决策**：有 MLX 版优先 MLX，没有则用 GGUF。`safetensors` 用于全精度或 fine-tuning。

---

## 3. GPU 兼容性判断清单

搜索到模型后，按以下步骤判断是否兼容目标设备：

### 3.1 检查 CUDA 硬依赖

| 检查项 | 在哪里看 | CUDA 专用信号 |
|--------|---------|-------------|
| `requirements.txt` | repo 根目录 | `onnxruntime-gpu`, `xformers`, `bitsandbytes`, `ninja`, `mmcv-full` |
| `docker-compose.yml` | `deploy/` 目录 | `runtime: nvidia`, `capabilities: [gpu]` |
| 推理代码 | `grep -r "cuda\|\.to(device)" *.py` | `device = "cuda"` 硬编码 |
| 训练代码 | `train.py` | 通常更难移植 |
| README | 安装/硬件要求章节 | "Requires NVIDIA GPU" |

### 3.2 MPS 兼容性判断

```
# 无 CUDA 专用依赖 + device 可参数化 = MPS 可能可行
grep -r "cuda\|device" inference.py | head -20
# 如果是 args.device 传入 → 可以设 "mps"
# 如果是 torch.device("cuda") 硬编码 → 需要改代码
```

### 3.3 常见 CUDA 专用包替代方案

| CUDA 专用包 | macOS 替代 |
|------------|-----------|
| `onnxruntime-gpu` | `onnxruntime-silicon` 或 `onnxruntime`（CPU） |
| `xformers` | 无直接替代，需跳过或用 PyTorch 原生 attention |
| `bitsandbytes` | 无 macOS 版本 |
| `mmcv-full` | `mmcv`（可能功能受限） |
| `ninja` | `brew install ninja` |
| `mmpose` + `mmdet` | 可用但需 MPS 后端 |

---

## 4. 搜索流程模板

当用户要求"找一个能做 X 的模型"时，按以下顺序执行。策展来源有结果时可短路跳过广覆盖搜索（Step 2-6）。

```
Step 1: 策展来源优先查
  - Ollama Library（ollama.com/library）：验证模型可用性 + 能力标签 + MLX 变体 + 一键安装
  - LM Studio 目录（lmstudio.ai/models）：验证 MLX/GGUF 兼容性 + 可视化搜索
  - 策展来源已验证可用性、兼容性和许可证——找到可用候选后仍需确认准入条件（§5），但可跳过 Step 2-6
  - 未找到 → 进入 Step 2 广覆盖搜索

Step 2: GitHub API 搜索（最宽关键词 + sort=stars）
  - GitHub 搜索 API 有专属速率限制，最多返回 1,000 个结果，可能带 `incomplete_results: true`
  - 完成条件：记录查询、执行日期、认证状态、total_count、incomplete_results
  - `incomplete_results=true` 时必须缩小查询或补充第二个关键词分支
  - 高星数仅为发现信号，不替代维护状态、许可证和兼容性检查

Step 3: HuggingFace API 搜索（找权重和量化版本）
  - HF 是权重仓库（UGC，需 smoke test），不是策展来源——Step 1 未找到时才查

Step 4: GitHub API 搜索（平台限定：{模型名} mlx/onnx/mac/mps）

Step 5: ModelScope 搜索（找中国团队模型）

Step 6: arXiv / HF Papers 发现论文 → 以论文作者、标题和 arXiv ID 在 GitHub/HF/ModelScope 查实现与权重

Step 7: 汇总 → 检查 GPU 兼容性 → 候选证据卡（见 Step 7a）
Step 7a: 候选证据卡（每个进入评分的候选必须完成）
  - 用途、官方来源 URL、项目/权重修订版
  - 许可证链接、目标设备、运行时与版本
  - 安装结果、最小 smoke test、性能测量
  - 已知限制、验证日期
  - 仅状态为「可验证」且证据卡完整的候选才进入评分

Step 8: 本地源码验证（当调研涉及「某库是否有 bug / 某功能是否已实现」时）
  8a. `pip show <package>` → 确认安装版本
  8b. `grep -rn "<关键词>" <package_path>` → 读源码确认实现
  8c. `inspect.getsource(<function>)` → 确认正确的 API 调用方式
  8d. 用正确的 API 调用方式做 smoke test
  8e. 网络搜索结果只作为补充，不作为唯一依据

> **教训（2026-08-26）**：mlx-vlm 0.6.16 的 Qwen3-VL 原生视频一直可用，但因为测试代码用了错误的 API 调用方式（`apply_chat_template(num_images=0) + generate(video=)` 而非 `generate(video_path=, prompt=)`），误报为「所有平台都有 broadcast_shapes bug」。网络搜索到的 bug 报告反映的是**已报告的**问题，不代表**已修复的**状态。详见 `docs/research/vlm-model-selection-benchmark.md` §4「视频分析」中已废弃结论的记录。
```

---

## Design Decisions & References

- **为什么 GitHub 比 HuggingFace 更重要**：很多完整的数字人项目（HeyGem、Linly-Talker、OpenTalking）只在 GitHub 上，HuggingFace 主要是模型权重仓库。
- **为什么搜多个关键词组合**：同一个功能可能有多个表述（"talking head" vs "digital human" vs "说话头" vs "数字人"），单一关键词会遗漏。
- **为什么检查 docker-compose.yml**：很多项目的 README 不明确说"需要 NVIDIA"，但 Docker 配置中的 `runtime: nvidia` 是硬性依赖的铁证。
- **为什么加 Step 8 本地源码验证**：网络搜索到的 bug 报告反映的是已报告的状态，不代表已修复的状态。先读本地安装的包源码，再用正确 API 调用方式做 smoke test，能避免误报。

---

## 模型选择通用标准

> **触发条件**：选模型时（ASR/TTS/VLM/数字人）读此章节。
>
> 候选先按准入条件分为**可验证**、**需缓解**、**不适用**三种状态。许可证或本机加速条件未满足时，记录为「需缓解」；只有在已经验证的替代路径可满足项目约束后，才进入评分。无法缓解的候选标为「不适用」，不进入总分排序。

### 准入条件

1. **许可证** — 优选：MIT、Apache-2.0、BSD、MPL-2.0、CC-BY-4.0。出现 NC（如 CC-BY-NC）、研究限定、地域限制、非标准许可证或缺少许可文本 → 标为「需缓解」（见下）。
2. **Apple Silicon 加速** — MPS（PyTorch）、MLX、Metal（whisper.cpp/ggml）、CoreML 至少支持一种。仅支持 CUDA 或纯 CPU → 标为「不适用」。

### NC 许可证处理

模型代码、权重、训练数据和输出成品的许可可能彼此独立。出现 NC 或非标准许可条款时：

- **分别记录**：代码许可证、权重/模型卡条款、训练数据或上游依赖的限制、计划用途和替代方案
- **状态**：标为「需法务确认」
- **缓解路径**：联系权利人申请商用授权（多数 NC 许可证支持 dual licensing）；或仅用于内部研究/原型，成品不发布
- **决策标准**：仅在获得书面法务结论后，才将该候选标为可发布。仅用于内部实验/对比 → 可接受，但记录风险状态

### 综合评分

状态为「可验证」且证据卡（见 §4 Step 7a）完整的候选，按四维度各打 1-5 分，加权求和：

| 维度 | 权重 | 5 分 | 3 分 | 1 分 |
|------|------|------|------|------|
| Apple Silicon 加速成熟度 | 30% | MLX 原生 | Metal / CoreML | MPS only / CPU |
| 许可证宽松度 | 20% | MIT / Apache-2.0 | BSD / MPL-2.0 / CC-BY-4.0 | NC 许可证（需法务确认） |
| 精度/质量 | 30% | 业界 SOTA | 可用 | 一般 |
| 社区与工具链 | 20% | 活跃维护 + 完善工具链 | 有更新 | 停更 / 无工具链 |

**完成标准**：选定一个模型，记录四维度评分和总分到调研报告中。总分相同看精度。

### 领域推荐索引

| 领域 | 详细对比见 |
|------|-----------|
| ASR | 下表 |
| TTS | `docs/research/voice-cloning-solutions-m2-pro.md` |
| VLM / 数字人 | `docs/research/digital-human-solutions-m2-pro.md` |

### ASR 速查

| 工具 | 许可证 | 加速 | 推荐模型 | 总分 | 状态 |
|------|--------|------|----------|------|------|
| whisper.cpp | MIT | Metal + CoreML | large-v3-turbo | **4.7** | ⭐ 首选 |
| mlx-whisper | MIT | MLX | large-v3 | **4.6** | ⭐ 备选 |
| Parakeet MLX | Apache-2.0 | MLX | 0.6B | **4.0** | ⚠️ 英文为主 |
| whisperx | BSD-4 | CPU | base | **2.7** | ⚠️ 仅 alignment |
| Canary-Qwen | CC-BY-NC | ❌ CUDA | — | — | ⚠️ NC + 无加速，未评分 |

> 评分明细：whisper.cpp 加速5/许可5/精度4/社区5；mlx-whisper 5/5/5/3；Parakeet 5/5/3/3；whisperx 1/3/3/4。Canary-Qwen 两个门槛均未通过（NC + CUDA only），未进入评分。
