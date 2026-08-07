# Tickets: Karaoke 字幕漏词与不同步修复

> Spec: `docs/spec-subtitle-karaoke-timeline.md`
> 依赖顺序执行，每张票独立可验证。

---

# 01 — 时间轴单一真相源与帧对齐的 scene clip

**What to build:** 每个 scene 的成片时长由帧数定义而不是浮点秒，装配与字幕从同一个函数派生该时长，因此两者在数学上不可能分歧。

**Blocked by:** None — can start immediately.

**Status:** done

- [x] `lib/timeline.mjs` 导出 `FPS`、`SCENE_BUFFER`、`sceneClipFrames()`、`sceneClipDuration()`、`sceneTimeline()`、`findScene()`（`sceneOffsets` 的超集）
- [x] 浮点边界（`4.5 * 30` 恰好整数）不会多算一帧
- [x] `assemble.mjs` 用 `-frames:v` 固定帧数，fade-out 起点基于帧对齐时长
- [x] `findScene()` 对缺失 sceneId 抛出明确错误（场景 20）
- [x] vitest 覆盖场景 12、20

---

# 02 — Cue 构建：文本由词表派生 + 规范化时序

**What to build:** 给定对齐数据与 scene 时长，产出绝对时间轴上的 cue 列表；每条 cue 的文本由它自己的词表派生，因此不可能出现"文本里有、画面上没有"的词；cue 的进出点遵循 Netflix Timed Text 的时序规则。

**Blocked by:** 01

**Status:** done

- [x] `lib/subtitles/cues.mjs` 导出 `chunkWords()` 与 `buildCues()`
- [x] `text` 恒等于 `words` 拼接（句尾词归属当前块，尾部单词块合并时同步合并词表）
- [x] 分块上限：≤6 词且 ≤49 字符，软限 38 字符
- [x] 时序：lead-in 2 帧、最短 0.8s、hold-out 0.5s、间隔 <0.5s 收紧到 2 帧
- [x] 无 `words` 时降级为静态 cue，文本不丢
- [x] vitest 覆盖场景 1-11

---

# 03 — ASS 渲染与回读：`\kt` 绝对锚点

**What to build:** 把 cue 列表写成 libass 可渲染的 ASS，每个词用 `\kt` 绝对锚定自己的高亮时刻，因此第 N 个词的误差不继承前面词的误差；同一模块能把 ASS 解析回词级时刻，供验证使用。

**Blocked by:** 02

**Status:** done

- [x] `lib/subtitles/ass.mjs` 导出 `renderAss()` 与 `parseAss()`
- [x] 每词输出 `{\kt<cs>\kf<cs>}`，一位小数（1ms 精度）
- [x] `\kt` 基于**量化到厘秒后**的 cue 起点计算
- [x] `{` `}` `\` 转义，换行转 `\N`
- [x] 样式：未读 `#F5F5F5`，已读 `#4d8bff`
- [x] round-trip：`parseAss(renderAss(cues))` 的逐词 onset 与输入偏差 ≤1ms
- [x] vitest 覆盖场景 13、14、15

---

# 04 — 管线切换到 JS 字幕生成器

**What to build:** 管线不再调用 Python 生成字幕，也不再有劣化的 fallback 分支；`~/.f5-tts-env` 或 pysubs2 缺失不会再让视频静默降级成无 karaoke 字幕。

**Blocked by:** 03

**Status:** done

- [x] `main.mjs` Step 4 直接调用 `buildCues` + `renderAss`
- [x] 删除 `generate-ass.py` 与 `lib/generate-srt.mjs`
- [x] 对齐数据缺失时的跳过行为保持不变
- [x] 管线在 `restraint/pt1` 上能产出 `.ass`

---

# 05 — 验证改为回读产物

**What to build:** 验证读的是即将发布的那份 `.ass`，逐词比对文本与时刻；漏一个词或某个词偏差超过 80ms，管线红着退出而不是打印"PASS"。

**Blocked by:** 03

**Status:** done

- [x] `lib/verify-subtitles.mjs` 改为回读 `.ass`，签名改为对象参数
- [x] 词序列不一致 → FAIL；逐词偏差 >80ms → FAIL；间隔落在 2 帧与 0.5s 之间 → FAIL
- [x] 最短时长 <0.8s、每行 >6 词 → WARN（不影响 passed）
- [x] `verify-subtitles.mjs` CLI 与 `main.mjs` Step 6 适配
- [x] 旧单测重写，覆盖场景 16、17、18

---

# 06 — 免 TTS 的验证渲染回路

**What to build:** 改了字幕后能复用既有音频与录制素材，一分钟内重出一条带新字幕的视频，而不是重跑十分钟 TTS。

**Blocked by:** 04

**Status:** done

- [x] `render-only.mjs` 支持 `--content <dir>`，不再硬编码 deepseek
- [x] 复用与主管线相同的字幕生成路径，产物带字幕
- [x] 缺少既有音频/录制素材时给出明确提示

---

# 07 — 真渲染验证与文档同步

**What to build:** 用真视频证明修复生效：所有词都在画面上，逐词偏差在阈值内，clip 帧数与计算一致；文档反映新架构。

**Blocked by:** 05, 06

**Status:** done

- [x] 重渲染 `restraint/pt1`，ffprobe 断言每个 clip 帧数 == `sceneClipFrames()`
- [x] 回读产物断言 170/170 词、逐词偏差 ≤80ms
- [x] `docs/video-workflow.md`、`docs/brand-system.md` 更新字幕章节
- [x] `npx vitest run` 全绿、`npm run lint`、`npx tsc --noEmit`、`npm run build` 通过
