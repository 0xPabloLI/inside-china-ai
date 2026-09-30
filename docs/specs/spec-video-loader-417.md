# Spec — 统一视频装载层：帧/音轨/转写一次解码，按目标模型输出对齐格式（#417）

Status: active（2026-09-30） · Parent issue: #417 · Planning scale: S2 · Risk: R2（Python/Node 跨进程契约 + 模型输入格式；不切生产默认）

## Problem Statement

「喂法」决定成败，但当前管线没有「视频装载」这一层：帧、音频、时间信息在装载环节各走各的路。

- **三份产物三条路径**：帧由 `vlm_analyzer.py` 自己 ffmpeg 抽取（`extract_frames` / `_extract_minicpm_frames` / `resolve_video_inputs`），窗口由 Node 侧 `asset-sourcer.mjs` Phase 2.5 计算后透传，转写由 `video-understand.mjs`（whisper.cpp）与实验脚本（`asr_batch.py`，MLX）分别产出。ffmpeg 调用散在 6+ 处、参数各不相同。
- **时间轴不可恢复**：帧是一个列表、音频是另一个列表，粒度不匹配——「第 i 帧对应哪一段音频」在装载后无法还原（#391 omni 实验只能靠官方规格重算）。
- **装载方式的实测代价**（数字唯一真值处：`docs/research/keyframe-extraction-research.md` §17.3）：纯视觉 67.0%；帧 + 整段原声 **50.0%（−17pp，p=2.5e-06，有害）**；帧 + 转写文本 71.4%（单臂 p=0.0501、四方法合并 3.9e-05）。官方单元格式（1 帧 + 1 秒音频逐对交织）11 视频 / 33 题同题对照 25/33 vs 纯视觉 26/33——**无增益且单次生成慢 5-10 倍**。

结论：**音频的价值以文本形态进入 prompt**；官方单元路径按 #361 引擎契约保留，不做默认。

## Solution

- **单一入口**：`load_video(path, request)` → `{duration_s, frames[], audio_track, transcript, timeline}`，一次解码拿到三份产物。
- **时间轴契约**：三份产物共享源时间轴（绝对秒）。帧 `t`、音频段 `[start,end]`、转写段 `[start,end]`；不变式「帧时刻 ⊂ 音频段边界 ⊂ 转写段边界」，可抽样断言（issue 验收 1）。
- **解码与格式分离**：装载层只产出「对齐过的产物」；目标模型格式由适配器决定——`to_minicpm_units()`（官方 1 帧 + 1 段音频）、`to_text_interleaved()`（转写按时间戳交织进 prompt）、`to_qwen_omni()`（官方 `qwen-omni-utils` 的 TMRoPE 分配）。
- **装载层不选帧**：帧时刻集合由分窗/选帧层给出（#414 的 window plan；#391 的方法选择），装载层只负责把这些时刻物化成帧并保证与音频/转写对齐。

## Implementation Decisions

1. **真值源语言 = Python**（`scripts/short-video/lib/video_loader.py`）：模型侧装配（`vlm_analyzer.py`、`qwen38_vlm_wrapper.py`）全在 Python，缓存与适配器放这里；Node 侧继续只负责**选**（窗口/时刻集合），经现有 `windows` 参数透传，不新增 Node 桥接层。
2. **帧产物**：`frames[i] = {t, path}`（jpg，全分辨率；缩放交给调用方/模型预处理，避免 #361 之前「两处各自 resize」的口径漂移）。
3. **音频段 = 帧时刻链**：段边界由帧时刻导出（`[t_i, t_{i+1})`，末段到 `duration_s`）——这是官方规格「1 帧 + 1 段音频」的本地实现，不依赖 `minicpmo` 包（环境隔离纪律，按规格复现）。≤64s @1fps 时天然 1 秒段；长片档（>64s、解码后均匀采到 64 帧）每段约 `duration/64` 秒（86s 实测 ≈1.34s/段，与 §Session3 的 ~9.4s 档位区分开：那是 10fps 解码口径）。`adjust_length=True` 语义（强制 1 秒段）只在帧率≈1fps 时与上者一致，实现时显式区分。
4. **转写口径唯一**：ctx-off（whisper.cpp `--max-context 0` / MLX `condition_on_previous_text=False`）——#418 实测开关前后重复幻觉 17→1 / 18→4；`#415 ①` 已把该开关写进生产调用。转写保留段级时间戳。
5. **波形直喂不提供 API**：`load_video` 不返回原始波形；音频只以段文件（供官方单元适配器）与转写文本（供 prompt）两种形态离开装载层。
6. **缓存**：key =（视频内容 hash、帧时刻集合、转写模型与开关、解码器版本）；命中即复用 `.scratch/keyframe-bench/{audio,asr}/` 已验证的落盘布局（帧目录 + `audio/segment-*.wav` + `transcript.json` + `manifest.json`）。key 必须命名真实产出物（#351 stale-key 教训）。
7. **生产接线**：`vlm_analyzer.generate_response` 改为经 loader 装配输入；删除 `extract_frames` / `_extract_minicpm_frames` 里的独立 ffmpeg 调用路径（保留函数签名兼容期，内部改走 loader）。**纯视觉路径保持 S1 等价**：无转写、无音频时，帧集合与抽取结果与现状逐字节一致（沿用 #360 的 S1 等价性断言术语）。
8. **Qwen-Omni 适配器只写规格**：`qwen-omni-utils` 不在本仓库安装（引入 5 个顶层包，环境隔离）；适配器按官方 `process_mm_info(..., use_audio_in_video=True)` 语义写清契约，未安装时明确降级报错。

## Modified Files Impact（R2）

- 新增 `scripts/short-video/lib/video_loader.py`（解码 + 对齐 + 缓存 + 三个适配器）
- `scripts/short-video/lib/vlm_analyzer.py`（`generate_response` 经 loader 装配；删除散落 ffmpeg 调用）
- 测试：`scripts/short-video/__tests__/test_video_loader.py`（新增 pytest：时间轴契约、缓存、适配器 argv/单元结构）
- 文档：`docs/video-production-runbook.md` 增加装载层一节（执行口径 + 命令）；本 spec 登记 `docs/DOCS-INDEX.md`
- 缓存目录：随内容产物落盘（`output/{slug}/` 下），具体路径实施时按 `docs/media-asset-management.md` 复核

## Behavioral Scenarios（R2）

| #   | 场景 | 期望 |
| --- | --- | --- |
| S1  | 纯视觉装载（无音频/转写） | 帧集合与现状逐字节一致（S1 等价性断言） |
| S2  | 帧 + 转写文本 | 转写按段级时间戳交织进 prompt；复现「音频不伤视觉」方向（QA 臂） |
| S3  | 官方单元装载（MiniCPM-o） | 1 帧 + 1 段音频，段边界 = 帧时刻链；≤64s 档 1 秒段 |
| S4  | 时间轴一致性抽样 | 帧时刻 ⊂ 音频段边界 ⊂ 转写段边界（随机 10% 抽样断言） |
| S5  | 缓存命中/失效 | 同视频同参数命中；换 ASR 开关或帧集合不命中 |
| S6  | 无音轨素材 | `audio_track` 空、`transcript` 空，纯视觉降级不报错 |
| S7  | ASR 不可用 | 转写缺失但如实标注（`transcript.unavailable`），装载层不抛错——是否放行由调用方门禁决定（与 #415 ① 的 infra 语义一致） |

## Out of Scope

- 选帧策略与帧预算（#391 / #414）
- 生产质检门禁（#415 ① 字幕 CPS / 响度回读 / ASR 腿）
- 原始波形直喂（已实测有害，见 §17.3）
- `qwen-omni-utils` 依赖安装与 Qwen-Omni 真机验证

## Tickets

- `ticket-1` loader 骨架 + 时间轴契约 + 缓存（S1/S4/S5/S6/S7；纯 Python，无 VLM）
- `ticket-2` 模型适配器 + 生产接线 + runbook 一节 + QA 臂复现（S2/S3；需要 VLM 时间）

## Completion

- S1-S7 全部有 evidence：pytest + 真模型 QA 臂（ticket-2）+ 既有 content 目录 Real Data Smoke。
- S1 等价性断言进 CI；`vlm_analyzer` 不再有独立 ffmpeg 抽帧调用。
- 与 #414 的边界：装载层是分窗的**输入侧**——window plan 决定帧时刻集合，loader 只物化与对齐。
