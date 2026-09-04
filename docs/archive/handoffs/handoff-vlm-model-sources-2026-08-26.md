# Handoff: VLM 升级评估 + 模型选型信源体系 + deep-research 增强

**日期**: 2026-08-26  
**来源 session**: VLM bug 调研 → 修复 → code review → 模型选型讨论  
**关联文档**: `docs/research/vlm-model-selection-benchmark.md`（唯一事实来源）, `docs/research/model-sources-reference.md`（信源规范）, `docs/adr/0009-vlm-qwen3-vl-mlx.md`

---

## 背景

在 VLM 选型过程中发现：

1. mlx-vlm 0.6.16 的 Qwen3VLVideoProcessor（numpy 实现）可用——此前因测试代码用错误 API 调用方式（`apply_chat_template(num_images=0) + generate(video=)` 而非 `generate(prompt=, video=)`）导致 `broadcast_shapes` error，误报为「所有平台都有 bug」。验证日期 2026-08-26；环境 `~/.video-tts-env`（Python 3.12, mlx-vlm 0.6.16, transformers 5.15.1）；模型 `mlx-community/Qwen3-VL-2B-Instruct-4bit`；输入 `unitree-demo.mp4`（1.7s）；正确调用 `generate(prompt=, video=, fps=, max_frames=, temperature=0.0)`；结果 1.9s 内生成准确描述。证据：`scripts/short-video/lib/vlm_analyzer.py` L326-337（原生路径）+ L494-523（fallback），commit `445bf8e`。完整结论见 `docs/research/vlm-model-selection-benchmark.md` §4 视频分析 → 当前结论。此前误报结论见同章节 → 已废弃结论。失效条件：mlx-vlm 或 transformers 升级后需重新 smoke test。
2. Qwen3.5/Qwen3.8 已发布（Ollama 模型目录标注 vision 能力，见 ollama.com/library/qwen3.5:4b 和 qwen3.8:27b）。视觉能力是否「全面超过 Qwen3-VL」需本机同 corpus A/B 验证——当前无公平对比数据。mlx-vlm 对 Qwen3.5 的图片 chat template 适配状态（截至 mlx-vlm 0.6.16, 2026-08-26）：图片处理报错，具体为 placeholder 不匹配。后续 mlx-vlm 升级后需重新验证。
3. Ollama 上的 Qwen3.5:4b 图片处理可用（验证日期 2026-08-26，环境 Ollama + qwen3.5:4b 3.4GB，通过 chat API 调用）。38s/高分辨率图——注意此数据来自高分辨率原图，未做 resize 预处理，与 mlx-vlm 2B-4bit 的 3s/图（1280px resize 后）不可直接比较。公平 A/B 需统一 corpus、统一 resize、相同提示词、≥3 次运行。
4. 本地缓存了 7 个 Qwen3-VL 模型（~26GB），其中 5 个可清理

---

## 讨论项 1: VLM 升级路径评估

### 当前状态

| 模型                                 | 本地可用                 | 图片                 | 视频                 | 速度           | 内存               |
| ------------------------------------ | ------------------------ | -------------------- | -------------------- | -------------- | ------------------ |
| Qwen3-VL-2B-4bit (mlx-vlm)           | ✅ 生产中                | ✅                   | ✅ 原生 1.7s         | 3s/图          | 2.6GB              |
| Qwen3.5-4B-MLX-4bit (mlx-vlm 0.6.16) | ❌ 图片 placeholder 报错 | ❌ placeholder 报错  | 未测                 | —              | —                  |
| Qwen3.5:4b (Ollama)                  | ✅ 已下载 (3.4GB)        | ✅ 38s/高分辨率原图  | 未测                 | —              | 空闲 5min 自动卸载 |
| Qwen3.8-27B (Ollama MLX 变体)        | 未下载                   | ✅ (Ollama 目录标注) | ✅ (Ollama 目录标注) | 需实际加载测量 | ~18GB Q4           |

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

- 优势：本项目候选集内待验证的高容量候选、Apache-2.0、官方模型卡标注支持图像和视频（见 huggingface.co/Qwen/Qwen3.8-27B）
- 劣势：~18GB Q4 变体、内存需求需实际加载测量（非 Ollama 标注值）、mlx-vlm 不支持 `qwen3_8` 架构（截至 0.6.16）、当前仅通过 Ollama 目录标注确认能力，未做本机 smoke test

### 建议

短期保持选项 A（已验证、生产中）。**A/B 公平评估已完成（2026-08-26）**：mlx-vlm 2B-4bit 在同 corpus、同 resize（1280px）、同 prompt 下全面碾压 Ollama qwen3.5:4b——速度快 9-56 倍（3.5s vs 31-197s/图）、内存少 6 倍（1.8GB vs 11.3GB）、输出长 32%、支持原生视频（Ollama API 不支持）。选项 B（Ollama）作为 fallback 不可行。选项 C/D 作为中期 upgrade path 跟踪，需先做本机 smoke test 确认可行性。

---

## 讨论项 2: 模型选型信源体系

### 已完成

已在 `model-sources-reference.md` 中落盘（commit `522ac4d` + `679241d`）：

- §1.8 General 模型选型信源（信源优先级表 + 信源分层使用表）
- §2 模型格式速查表（已拆分为「权重容器」和「量化方法」两个子表）
- §4 Step 7: 本地源码验证

后续修订仅在 `model-sources-reference.md` 中进行；本交接文档不再复制规范正文。

---

## 讨论项 3: deep-research 增强

### 结论

**不新增第二套流程。** 现有 `model-sources-reference.md` §4 Step 7（本地源码验证）和 `AGENTS.md` → Proposal Self-Review 第 4 条已覆盖此教训。问题不是规则缺失，是执行时没遵守。

仅在出现可重复、可量化的执行失败时，再评估是否 fork deep-research skill 或新增 pre-research-check 子 skill。当前无此类证据。

### 工具定位参考

| 工具                | 定位         | 做什么                                  |
| ------------------- | ------------ | --------------------------------------- |
| Brave Search MCP    | 搜索引擎     | 返回搜索结果（标题+URL+snippet）        |
| deep-research skill | 调研方法论   | 6-8 phase pipeline，多源交叉验证 + 报告 |
| web-access skill    | 浏览器自动化 | CDP 连接 Chrome，JS 渲染，登录态抓取    |

---

## 教训落盘：读源码优先 + 正确 API 测试

### 教训

在 VLM 调研中，因为测试代码用了错误的 API 调用方式（`apply_chat_template(num_images=0) + generate(video=)` 而非 `generate(prompt=, video=)`），误报 mlx-vlm 0.6.16 有 `broadcast_shapes` bug。结论"所有平台都有 bug"来自网络搜索（GitHub issues），没有先读本地安装的包源码验证。

### 落实位置

已落盘（commit `522ac4d` + `679241d`）：

1. `model-sources-reference.md` §4 Step 7: 本地源码验证
2. `vlm-model-selection-benchmark.md` §4 视频分析 → 已废弃结论（误报根因记录）
3. `AGENTS.md` → Proposal Self-Review 第 4 条已有覆盖规则

后续修订仅在上述文档中进行；本交接文档不复制规范正文。

---

## 待办

- [x] 用 writing-for-agents 落盘 `model-sources-reference.md` 更新（信源优先级 + Step 7 + 模型格式速查）— commit `522ac4d`
- [x] 落盘 benchmark 误报根因记录 + 跨文档矛盾消除 — commit `679241d`
- [x] ADR-0009 修正 Ollama 视觉能力表述 — commit `679241d`
- [x] deep-research fork 评估 → 结论：不新增第二套流程（见讨论项 3）
- [ ] 清理本地多余 VLM 模型（~20GB）
- [ ] 端到端 pipeline 测试（验证原生视频路径在 production 中工作）
- [x] 公平 A/B 升级评估完成（2026-08-26）— mlx-vlm 2B-4bit 全面碾压 Ollama qwen3.5:4b（速度 9-56x，内存 6x，输出长 32%，支持视频）。详见 benchmark §9

---

## 建议技能

- `code-review` — 如果改动 `vlm_analyzer.py` 切换到 Ollama API
- `deep-research` — 如果需要深入对比 Qwen3.5 vs Qwen3.8 vs Gemma4 的视觉能力（需先做公平 A/B 测试）
