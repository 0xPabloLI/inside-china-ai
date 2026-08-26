# Handoff: VLM 升级评估 + 模型选型信源体系 + deep-research 增强

**日期**: 2026-08-26  
**来源 session**: VLM bug 调研 → 修复 → code review → 模型选型讨论  
**关联文档**: `docs/research/vlm-model-selection-benchmark.md`, `docs/research/model-sources-reference.md`, `docs/adr/0009-vlm-qwen3-vl-mlx.md`

---

## 背景

在 VLM 选型过程中发现：
1. mlx-vlm 0.6.16 的 Qwen3VLVideoProcessor（numpy 实现）一直可用，但之前因为测试代码 API 调用方式错误，误报为"所有平台都有 bug" [[memory:17877336917687800217]]
2. Qwen3.5/Qwen3.8 已发布，视觉能力全面超过 Qwen3-VL，但 mlx-vlm 对 Qwen3.5 的图片 chat template 适配未完成
3. Ollama 上的 Qwen3.5:4b 图片处理完全可用（验证成功）
4. 本地缓存了 7 个 Qwen3-VL 模型（~26GB），其中 5 个可清理

---

## 讨论项 1: VLM 升级路径评估

### 当前状态

| 模型 | 本地可用 | 图片 | 视频 | 速度 | 内存 |
|------|---------|------|------|------|------|
| Qwen3-VL-2B-4bit (mlx-vlm) | ✅ 生产中 | ✅ | ✅ 原生 1.7s | 3s/图 | 2.6GB |
| Qwen3.5-4B-MLX-4bit (mlx-vlm) | ❌ 图片 bug | ❌ placeholder 报错 | 未测 | — | — |
| Qwen3.5:4b (Ollama) | ✅ 已下载 | ✅ 38s/高分辨率图 | 未测 | — | 空闲自动卸载 |
| Qwen3.8-27B (Ollama MLX) | 未下载 | ✅ (Ollama 标注) | ✅ (Ollama 标注) | 需 24GB Mac | ~18GB |

### 升级选项

**选项 A: 保持 Qwen3-VL-2B-4bit（当前）**
- 优势：已验证、1.8GB、3s/图、原生视频可用
- 劣势：Qwen3-VL 是上一代，视觉能力不如 Qwen3.5

**选项 B: 切换到 Ollama Qwen3.5:4b API**
- 优势：图片完全可用、更强制觉能力、Ollama 自动管理内存
- 劣势：需改 `vlm_analyzer.py` 从 Python subprocess → HTTP API 调用；38s/高分辨率图（比 mlx-vlm 慢）；HTTP 开销
- 实现量：中等——改 `generate_response()` 函数，从 `mlx_vlm.generate()` 改成 `requests.post('http://localhost:11434/api/chat')`

**选项 C: 等 mlx-vlm 适配 Qwen3.5 图片后升级**
- 优势：保持 Python API 架构、MLX 原生速度
- 劣势：等待时间不确定（mlx-vlm 社区维护，PR 无定期）

**选项 D: Qwen3.8-27B（Ollama MLX 变体）**
- 优势：最强开源 VLM、Apache-2.0、原生视觉
- 劣势：18GB 模型需 24GB+ Mac（M2 Pro 32GB 可跑但紧张）、mlx-vlm 不支持 `qwen3_8` 架构、只能通过 Ollama

### 建议

短期保持选项 A。如果图片质量不够再考虑选项 B。选项 C/D 作为中期 upgrade path 跟踪。

---

## 讨论项 2: 模型选型信源体系

### 信源分类

文档当前在 `docs/research/model-sources-reference.md`，内容聚焦于数字人/AI 项目的搜索流程。需要补充 **general 模型选型信源**（不只 VLM）。

### 信源优先级

| 优先级 | 信源 | 类别 | 用途 | URL |
|--------|------|------|------|-----|
| 1 | **Ollama Library** | 模型目录 | 验证模型可用性 + 能力标签 + MLX 变体 + 一键安装 | ollama.com/library |
| 2 | **LM Studio 目录** | 模型目录 | 验证 MLX/GGUF 兼容性 + 可视化搜索 | lmstudio.ai/models |
| 3 | **HuggingFace `mlx-community`** | 模型仓库 | 找 MLX 量化版（UGC，需 smoke test） | huggingface.co/mlx-community |
| 4 | **HuggingFace Open LLM Leaderboard** | 评测排名 | 开源 LLM 众包评测排名 | huggingface.co/spaces/open-llm-leaderboard |
| 5 | **Artificial Analysis** | 评测排名 | 速度/质量/价格三维对比 | artificial.ai |
| 6 | **Roboflow VLM Benchmark** | 评测排名 | VLM 视觉能力实测排名（25+ 模型） | playground.roboflow.com/models/task/vision-language |
| 7 | **ModelScope** | 模型仓库 | 中国团队模型首发地 | modelscope.cn |
| 8 | **Ollama Models Cheat Sheet** (computingforgeeks) | 速查参考 | 按 VRAM/场景排序的 Ollama 模型速查表 | computingforgeeks.com/ollama-models-cheat-sheet |

### 模型格式速查

| 格式 | 专用引擎 | 跨引擎？ | Apple Silicon | 量化 |
|------|---------|---------|--------------|------|
| **GGUF** | llama.cpp / Ollama / LM Studio | 是（多引擎支持） | ✅ Metal | Q2-Q8 K-quants |
| **MLX** | mlx-lm / mlx-vlm / Ollama (macOS) | 否（Apple only） | ✅ 原生 | 2-8 bit | Apple Silicon 上比 GGUF（Metal）快 30-50%；跨平台比 CUDA 慢 2-4x |
| **safetensors** | transformers / vLLM | 是 | ✅ MPS | 通常不量化（FP16/BF16） |
| **GPTQ** | vLLM / transformers | 是（NVIDIA） | ❌ | 4-bit |
| **AWQ** | vLLM / transformers | 是（NVIDIA） | ❌ | 4-bit |
| **EXL2** | ExLlamaV2 | 否（NVIDIA only） | ❌ | 2-8 bpw |

**GGUF 是 llama.cpp 项目创建的格式**（替代旧的 GGML），但现在已成为本地推理的通用标准——Ollama、LM Studio、Jan、GPT4All 都支持 GGUF。不是 llama.cpp "专用"的，而是 llama.cpp "发明"的。

### Ollama 内存机制

- `ollama serve` 常驻进程 ~16MB（无模型加载时）
- 模型推理完成后，默认 5 分钟空闲自动卸载（`OLLAMA_KEEP_ALIVE` 可配）
- `/api/ps` 查询当前加载的模型
- 作为 fallback VLM 完全可行：平时不占内存，需要时加载

### 待落盘

需要用 writing-for-agents skill 更新 `docs/research/model-sources-reference.md`：
1. 在 §1.7 "其他来源"表中补充 Ollama Library、LM Studio、Artificial Analysis 等
2. 在 §3 搜索流程模板中加 Step 7: 本地源码验证
3. 新增 §4: 模型格式速查表

---

## 讨论项 3: deep-research 增强

### 现状

- **第三方 deep-research skill**（Matt Pocock）：6-8 phase pipeline，多源搜索 + 引用追踪 + 结构化报告。只用搜索 API，不做本地文件检查。
- **Brave Search MCP**：搜索引擎 API，返回标题+URL+snippet。是 deep-research 的 RETRIEVE 阶段工具之一。
- **web-access skill**：CDP 连接本地 Chrome，执行 JS 渲染，有 session/cookie。用于抓取 JS 渲染页面。

### 区别

| 工具 | 定位 | 做什么 |
|------|------|--------|
| Brave Search MCP | 搜索引擎 | 返回搜索结果（标题+URL+snippet） |
| deep-research skill | 调研方法论 | 6-8 phase pipeline，多源交叉验证 + 报告 |
| web-access skill | 浏览器自动化 | CDP 连接 Chrome，JS 渲染，登录态抓取 |

### 增强方案

在 deep-research skill 的 Phase 3 RETRIEVE 之前加一个 **Phase 2.5: 本地源码检查**：
- 如果调研问题涉及"某库是否有 bug / 某功能是否已实现"，先 `pip show <package>` + `grep -rn` + `inspect.getsource` 读本地源码
- 网络搜索结果只作为补充，不作为唯一依据
- 网络讨论反映的是**已报告的**问题，不代表**已修复的**状态

但 deep-research 是第三方 skill，直接改会被覆盖。替代方案：
- 在 AGENTS.md → Proposal Self-Review 第 4 条后加一条规则：调用 deep-research 前必须先做本地源码检查
- 或创建一个 **pre-research-check** 子 skill，在 deep-research 触发前自动执行

### 待讨论

- 是否要 fork deep-research skill 做项目定制版？
- 还是只在 AGENTS.md 加规则？

---

## 教训落盘：读源码优先 + 正确 API 测试

### 教训

在 VLM 调研中，因为测试代码用了错误的 API 调用方式（`apply_chat_template(num_images=0) + generate(video=)` 而非 `generate(video_path=, prompt=)`），误报 mlx-vlm 0.6.16 有 `broadcast_shapes` bug。结论"所有平台都有 bug"来自网络搜索（GitHub issues），没有先读本地安装的包源码验证。

### 落实位置

**AGENTS.md → Proposal Self-Review 第 4 条**已有一条规则：

> "涉及库/框架功能支持的，查源码（`grep` 源文件、`inspect.getsource`）+ 文档/实际调用"

这条规则已经覆盖了这个教训。问题不是规则缺失，是**执行时没遵守**。需要加强：
1. 在 `model-sources-reference.md` §3 搜索流程模板加 **Step 7: 本地源码验证**
2. 在 VLM benchmark report 中补充误报根因记录

### Step 7 内容

```
Step 7: 本地源码验证（当调研涉及"某库是否有 bug / 某功能是否已实现"时）
  7a. pip show <package> → 确认安装版本
  7b. grep -rn "<关键词>" <package_path> → 读源码确认实现
  7c. inspect.getsource(<function>) → 确认正确的 API 调用方式
  7d. 用正确的 API 调用方式做 smoke test
  7e. 网络搜索结果只作为补充，不作为唯一依据
```

---

## 待办

- [x] 用 writing-for-agents 落盘 `model-sources-reference.md` 更新（信源优先级 + Step 7 + 模型格式速查）— commit `522ac4d`
- [ ] 清理本地多余 VLM 模型（~20GB）
- [ ] 端到端 pipeline 测试（验证原生视频路径在 production 中工作）
- [ ] 评估是否 fork deep-research skill
- [ ] writing-for-agents 正式流程化（低优先级——见 handoff 讨论项 3）

---

## 建议技能

- `writing-for-agents` — 落盘文档更新
- `code-review` — 如果改动 `vlm_analyzer.py` 切换到 Ollama API
- `deep-research` — 如果需要深入对比 Qwen3.5 vs Qwen3.8 vs Gemma4 的视觉能力
