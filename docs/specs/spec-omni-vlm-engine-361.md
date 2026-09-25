# Spec — 全模态 VLM 引擎接入：方案 C（MiniCPM-o 4.5 + emotion2vec+）（#361）

Status: active（2026-09-25） · Parent issue: #361 · Planning scale: S2（路线由 `docs/research/handoff-omni-vlm-20260925.md` 定案） · Risk: R3（核心管线 + Python/Node 跨进程契约 + 模型真值源）

## Problem Statement

`vlm_analyzer.py` 目前只支持单一引擎：`Qwen3-VL-30B-A3B-Instruct-4bit`（纯视觉，无音频能力）。2026-09-25 用户裁决全模态选型为**方案 C：MiniCPM-o 4.5 MLX 4bit（~7.6GB，视觉+ASR+基础情感+音视频对齐）+ emotion2vec+ 轻量插件（九类细粒度情绪）**，并要求备选引擎须与主引擎能力对齐、切换不降级（备选 1 = 30B MoE + 现有 WhisperX + e2v）。同时实测暴露一个环境阻塞：MiniCPM-o 需要 **mlx-vlm 0.7.2**，而生产 VLM 环境 `~/.video-tts-env` 的 `mlx_vlm 0.3.9` 无 minicpmo 实现、项目 VLM venv `~/.venvs/mlx-vlm` 的 `0.7.0rc0` 权重键名不匹配（加载即 `Missing 1203 parameters`）。

## Solution

`vlm_analyzer.py` 升级为**双引擎子进程**：`--engine=minicpm`（默认，MiniCPM-o 4.5）与 `--engine=qwen3-vl-moe`（备选，30B MoE），引擎选择经 `vlm-model.json` 单一真值源贯穿 Python 推理侧与 Node 缓存 key 侧，换引擎只改该文件一处。新增音频/情绪分析能力：MiniCPM-o 内置 ASR + 基础情感为主信号，emotion2vec+ 九类细粒度情绪为辅助信号，融合输出 `{primary, auxiliary, agreement}` 三字段（不合并成单标签）。加载后执行 warmup dummy 推理消除冷启动抖动。

## Implementation Decisions

1. **venv 策略（用户裁决 2026-09-25）**：把 `~/.venvs/mlx-vlm` 从 mlx-vlm `0.7.0rc0` 升级到 `0.7.2`，`vlm_analyzer.py` 默认改用它（`VLM_ANALYZER_PYTHON_BIN` 默认值调整）。TTS 生产环境 `~/.video-tts-env` **不动**；emotion2vec+ 以子进程方式复用 `~/.video-tts-env`（funasr 1.4.14 已就位），避免污染 VLM venv。
2. **模型真值源多引擎化**：`vlm-model.json` 由 `{ "modelId": "..." }` 扩展为 `{ "engine": "<默认引擎>", "engines": { "<engine>": { "modelId": "..." } } }`。Python 侧按 `--engine`（默认取 JSON 的 `engine`）解析出 `MODEL_ID`；Node 侧 `getVlmModelId()` 返回**当前默认引擎**的 modelId 作为缓存 key 材料。缓存 key 材料含 engine + modelId，跨引擎/跨模型天然失活。
3. **引擎 API 分支**：MiniCPM-o 的 prompt 构造用 `mlx_vlm.prompt_utils.apply_chat_template(processor, model.config, prompt_text, add_generation_prompt=True, num_images=, num_audios=)`；Qwen3-VL 保持现有 `processor.apply_chat_template(messages, tokenize=False, ...)`。两种引擎的 `generate()` 参数分别适配（`audio=` / `image=` / `video=`）。
4. **视频路径**：MiniCPM-o 无原生视频支持 → 用 `mlx_vlm.generate.video.resolve_video_inputs(processor, [path], fps=2.0, max_frames=16)` 抽帧；Qwen3-VL 保持原生 `generate(video=)`。时间窗（startMs/endMs）两条路径都保留现有 ffmpeg 抽帧回退。
5. **音频能力契约**：新增音频分析请求（沿用 `analyze_semantics` 扩展 `mediaType` 或新增 action，实施时定），输出 Markdown 段：`Transcription` / `Language` / `Emotion` / `Tone` / `Speaking Style`。输出需 strip MiniCPM-o 的 `<|SOA>` / `<|tts_eos|>` 控制标记。
6. **e2v 融合**：主信号 MiniCPM-o 音频情绪（7 类粗粒度），辅助信号 e2v 九类细粒度。时间轴以现有 WhisperX（#98）句级时间码为基准；融合规则=细化/兜底/冲突不合并，输出 `{primary, auxiliary, agreement}`（设计定稿见 #361 票评 2026-09-25）。
7. **warmup 防线**：模型加载后自动执行一次 dummy 推理（0.5s 空音频或测试图），完成 JIT/Metal 图初始化，消除实测 34s 冷启动。
8. **保留的预处理不变量**：`MAX_IMAGE_LONG_EDGE=1920`（Lanczos + EXIF transpose）、`mx.metal.clear_cache()` 每 5 case、`parse_markdown_to_dict()` 八字段契约 100% 兼容。

## Modified Files Impact（R3）

- 修改：`scripts/short-video/lib/vlm_analyzer.py`（双引擎 + `--engine` + 音频能力 + warmup）、`scripts/short-video/lib/vlm-model.json`（多引擎结构）、`scripts/short-video/lib/vlm-model.mjs`（读默认引擎 modelId）、`scripts/short-video/lib/visual-analyzer.mjs`（`getVlmModelId` + Python bin 默认值 + 音频请求路由）、`scripts/short-video/lib/asset-sourcer.mjs`（缓存 key 材料）。
- 新增：e2v 插件子进程脚本（`scripts/short-video/lib/emotion2vec_plugin.py`，跑在 `~/.video-tts-env`）。
- 测试：`scripts/short-video/lib/__tests__/vlm-model.test.mjs`（#351 锁定结构需随多引擎结构更新）、`vlm-cache.test.mjs`、新增引擎分支/音频契约测试。
- 环境：`~/.venvs/mlx-vlm` 升级到 mlx-vlm 0.7.2（非仓库文件，需用户授权后执行）。
- 文档：`docs/adr/0009-vlm-qwen3-vl-mlx.md`（引擎变更需新 ADR 或修订）、`docs/DOCS-INDEX.md` 登记本 spec。

## Behavioral Scenarios（R3）

| #   | 场景 | 期望 |
| --- | --- | --- |
| S1 | 默认引擎分析图像 | MiniCPM-o 产出，八字段 Markdown 兼容 `parse_markdown_to_dict()` |
| S2 | 默认引擎分析视频 | 抽帧路径产出，Markdown 兼容 |
| S3 | 分析音频 | 产出 Transcription/Emotion/Tone/Speaking Style，控制标记已 strip |
| S4 | `--engine=qwen3-vl-moe` | 回退到 30B MoE，行为与现状等价 |
| S5 | 换引擎后旧缓存 | 缓存 key 材料变化 → 旧条目不再命中（不误用 stale 结果） |
| S6 | `vlm-model.json` 损坏/缺字段 | 双端 fail-fast（Node import 抛错 / Python RuntimeError） |
| S7 | e2v 插件不可用 | 主信号仍可用，辅助字段降级为 null，不阻断分析 |
| S8 | 冷启动首次音频推理 | warmup 后延迟稳定，无 34s 抖动 |

## Testing Decisions

- Python 侧：`vlm_analyzer.py` 的纯函数（`parse_markdown_to_dict`、prompt 构造、控制标记 strip）用既有 pytest/runner 覆盖；引擎分支用 monkeypatch 隔离 mlx-vlm 调用。
- Node 侧：`vlm-model.test.mjs` 更新为多引擎结构断言（双端同源、无硬编码漂移）；`vlm-cache.test.mjs` 断言 engine+modelId 均入 key。
- R3 真实数据冒烟：至少 1 图 + 1 视频 + 1 音频真实推理（素材 `scripts/short-video/assets/`），缓存 key 与 meta 的模型标识一致；备选引擎 `--engine=qwen3-vl-moe` smoke 级回退验证。
- R3 失败基线：`vlm-model.json` 单引擎结构下多引擎断言必 red；`mlx_vlm 0.3.9` 下加载 MiniCPM-o 必失败（已实测 `Missing 1203 parameters` / 无 minicpmo 模块）。

## Out of Scope

- 长视频切分（>8s 分段索引）与跨 Scene 连续播放（`clipStartMs` 等）→ #360。
- VLM borderline 二度校验 → #294。
- 备选 2（Qwen3-VL-8B 轻量模块化，模型未下载）→ 仅在方案 C 与备选 1 都不成立时评估。
- 引入 SenseVoice（方案 C 的 ASR 由 MiniCPM-o 内置承担，备选复用现有 WhisperX）。

## Further Notes

- 裁决与防线全文：`docs/research/handoff-omni-vlm-20260925.md`；调研实测数据：`docs/research/omni-model-selection-2026.md`。
- 本 spec 为本地 active spec（项目覆写：GitHub 发布需另行授权）。tickets 本地发布于 `.scratch/omni-vlm-361/issues/`。
- 实测证据（2026-09-25，mlx-vlm 0.7.2）：图像 8.3s / 视频抽帧 12.0s / 音频完整分析 17.3s / ASR 2.9s，输出 Markdown 与八字段契约兼容。