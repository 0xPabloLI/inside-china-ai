# Deep Research: Qwen3.8 和 Qwen3.6 的 tools（function calling）支持

> 日期：2026-09-23
> 触发：清理本地模型时发现 wrapper 代码和 research 文档对 qwen3.8 tools 支持的说法矛盾

## Executive Summary

通过本地 `ollama show` 验证和 Ollama 官方页面确认，**qwen3.6:27b-mlx 和 qwen3.8:27b-mlx 都支持 tools（function calling）**。此前 `ocr-llm-model-selection-research.md` 中"qwen3.8:27b-mlx 不支持 tools"的说法是错误的，需要修正。两个模型同时支持 vision + tools + thinking，都能用于 OCR 代码审查。research 推荐 qwen3.6 而非 qwen3.8 的真正原因是 SWE-Bench 分数（77.2 vs 无数据），不是 tools 支持。

## Key Findings

### 1. qwen3.6:27b-mlx 支持 tools（本地确认）

`ollama show qwen3.6:27b-mlx` 输出：

```
Capabilities
    completion
    vision
    tools
    thinking
        levels     false, true
        default    true
```

模型架构 qwen3_5，27.8B 参数，nvfp4 量化。**tools 在 capabilities 列表中**。

来源：本地 Ollama 安装（Tier 1，源码级验证）

### 2. qwen3.8:27b-mlx 支持 tools（Ollama 官方页面确认）

Ollama 官方页面 https://ollama.com/library/qwen3.8 顶部标签：`vision tools thinking 27b`

页面列出 12 个 tag，包括 qwen3.8:27b-mlx（MLX 量化，18GB，256K context，Text + Image）。

来源：https://ollama.com/library/qwen3.8（Tier 1，官方页面）

### 3. qwen3.6 也支持 tools（Ollama 官方页面确认）

Ollama 官方页面 https://ollama.com/library/qwen3.6 顶部标签：`vision tools thinking 27b 35b`

页面列出 35 个 tag，包括 qwen3.6:27b-mlx（MLX 量化，19GB，256K context，Text + Image）。

来源：https://ollama.com/library/qwen3.6（Tier 1，官方页面）

### 4. 此前"qwen3.8 不支持 tools"的说法是错误的

`ocr-llm-model-selection-research.md` 中多处错误说法：
- Line 161: "qwen3.8:27b-mlx | 18GB | VLM（视觉），不支持 tools，OCR 用不了"
- Line 163: "qwen3.8:27b-mlx 是 VLM（视觉模型），不支持 tools（function calling），OCR 无法使用"
- Line 169: "不支持 tools 的模型（如 qwen3.8-27B）彻底接不了 OCR"
- Line 175: "qwen3.8-27B 不能用的真实原因是'不支持 tools'"

这些说法与 Ollama 官方页面和本地验证矛盾，需要修正。

### 5. 两个模型都能做 OCR，推荐 qwen3.6 的真正原因是 SWE-Bench 分数

| 模型 | tools | vision | SWE-Bench Verified | 下载量 |
|------|-------|--------|-------------------|--------|
| qwen3.6:27b-mlx | ✅ | ✅ | 77.2 | 6.7M |
| qwen3.8:27b-mlx | ✅ | ✅ | — (无数据) | 2.4M |

qwen3.6 在 SWE-Bench 上有明确得分且更高，这才是推荐它的真正原因。

## 需要修正的文档

1. `docs/research/ocr-llm-model-selection-research.md` — 删除/修正"qwen3.8 不支持 tools"的错误说法（line 161, 163, 169, 175）
2. `skills/open-code-review/SKILL.md:63` — 换模型示例 `qwen3.8:27b-mlx` 可保留（确实支持 tools），但建议改成 `qwen3.6:27b-mlx`（SWE-Bench 更强）
3. `scripts/short-video/lib/qwen38_vlm_wrapper.py:44` — `OLLAMA_MODEL = "qwen3.8:27b-mlx"` 模型名不匹配本地安装（本地是 qwen3.6:27b-mlx），需要修正
4. Memory `feedback-qwen38-27b-4bit-code-review-three-reasons.md` — "不支持 tools"的存疑项现已解决：qwen3.8 **支持** tools

## Open Questions

- qwen3.8:27b-mlx 的 SWE-Bench Verified 分数是多少？（Ollama 页面和 research 文档都没有数据）
- qwen3.8:27b-mlx 和 qwen3.6:27b-mlx 在 OCR 场景下的实际效果对比如何？（两者都支持 tools，需要实测比较）

## Sources

1. 本地 `ollama show qwen3.6:27b-mlx` — Capabilities 列表含 tools — Tier 1
2. https://ollama.com/library/qwen3.8 — 官方页面标签 `vision tools thinking` — Tier 1
3. https://ollama.com/library/qwen3.6 — 官方页面标签 `vision tools thinking` — Tier 1
4. `docs/research/ocr-llm-model-selection-research.md` — 此前错误说法的来源 — 待修正