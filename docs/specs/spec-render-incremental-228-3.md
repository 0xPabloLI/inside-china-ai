# Spec — Remotion 增量渲染：只重画改动的镜头（#228 ③）

Status: active（2026-11-24） · Parent issue: #228 · Planning scale: S2 · Risk: R3（`scripts/short-video/lib/` 渲染编排、Remotion 时间线、字幕/音频同步与发布前路径）

## Problem Statement

改一句口播、换一张图、只修一条字幕，今天的管线都会把整条片子重渲一遍。

实测（本机真实 profile，2026-11-20）：

| 包 | 重跑总墙钟 | `step-5-render` | 占比 |
| --- | --- | --- | --- |
| `workbuddy-computer-use` | 83.3 s | 76.1 s | 91.3% |
| `deepseek-1055b-round` | 83.7 s | 77.7 s | 92.8% |
| `phai-a1-m1` | 105.6 s | 97.0 s | 91.9% |

render 内部再拆（`*-raw.mp4` 与 `*-short.mp4` 的落盘时间）：

| 包 | Remotion 光栅+编码 | finalize+读回 |
| --- | --- | --- |
| `deepseek-1055b-round` | 66.1 s | 8.8 s |
| `phai-a1-m1` | 83.9 s | 10.1 s |

分帧实测（`workbuddy-computer-use`，1725 帧 / 9 场景 / 57.5 s，`npx remotion render --frames`）：

| 观测 | 结果 |
| --- | --- |
| 冷 bundle + 1 帧 | 10.8 s |
| 30 帧（bundle 已缓存） | 4.0 s |
| 300 帧 | 11.4 s |
| 1000 帧 | 42.5 s |
| 1000 帧 `--concurrency=12`（默认 6） | 43.5 s（无收益） |
| 1000 帧 `--x264-preset=ultrafast` | 41.3 s（编码不是大头） |
| 1000 帧 `--muted` | 41.0 s（音频 mux 不是大头） |

结论：**逐帧光栅是主成本，编码/并发/音频都不是杠杆**；一条 60 秒片子改一个场景仍要重画 1725 帧里的全部。近 9 天 55 次重跑渲染（`#1512` 取证）说明这是日常路径，不是边角。

## Solution

把「渲染」从整片不可分割的一次计算，拆成「按场景可复用的帧段 + 一次整片 finalize」：

1. 每次 render 在 manifest 里记录**每个场景的输入指纹**（scene JSON、duration、音频字节、引用素材字节、相邻场景类型、合成层版本）。
2. 重跑时与上一版 manifest 比对，得到**脏场景集合**；脏场景的帧区间 = `[offset_i - 10, offset_i + clip_i + 10)`（10 帧是 `TransitionSeries` 的转场带宽），合并相邻区间。
3. 只对脏区间调用 `remotion render --frames=a-b` 生成新片段；干净区间从上一版 `raw` 按**旧时间线**裁出（`-ss/-t` 输入定位 + `trim` 精确到帧）。
4. 所有片段按新时间线顺序进入 `finalizeRenderedVideo` 的**单次 ffmpeg pass**：`concat` → `ass` 烧字幕 → `loudnorm` →（可选）BGM，一次编码产出成片。**不生成中间 raw**，因此不增加编码代际；干净帧仍来自上一版的第 1 代编码，与整片重渲的质感一致。
5. 任何一步不能证明「输入未变」——指纹缺失、素材读不到、场景数量变化、帧数对不上、ffmpeg 拼接失败——**回落整片重渲**，并打印回落原因。

观众端：改 1 个场景重跑从 76–97 s 降到目标 **≤30 s**（2 个场景 ≤35 s）；改字幕/BGM 这类不动画面的重跑只走 finalize（约 10 s）；首渲行为与今天完全一致。

## Implementation Decisions

1. **脏判据**（缺一即脏）：
   - 场景对象 canonical JSON（`scenes[i]`，不含 `voiceover` 以外的运行时路径）；
   - `durations[i]`（驱动 `visualDuration`，场景内动画以它为时间基）；
   - `audioPaths[i]` 的字节 sha256（换配音必须重渲该场景的音频段）；
   - 场景引用的 staged 素材（`media.path`）的字节 sha256；`contentDir` 下的 `assets/` 若被场景以相对路径引用，同样按字节判；
   - 相邻场景 `visualType`（`getTransition(prev, curr)` 由两边类型决定，改一侧会改两个转场）；
   - 合成层指纹：`remotion/src/**`（除 fixtures）+ `remotion/package.json` + `tokens.ts` + 字体文件的 sha256 清单。任一变化 → 全量。
2. **切点纪律**：只在场景边界切。脏区间含前后各 10 帧转场带；干净区间若与脏区间相邻，边界让给脏区间。**禁止**在场景内部切帧——入场弹簧、`TextGate` fitting、图表动画都以场景局部帧为时间基。
3. **旧→新帧映射**：干净场景的内容只依赖自己的局部帧，而 `offset` 会因前序 duration 改变而平移；因此干净区间按 `oldOffset = newOffset - Δ`（Δ 为该区间累计的时长差）从上一版 raw 裁取。拼接顺序即新时间线顺序，时长由片段长度保证。
4. **finalize 扩展**：`finalizeRenderedVideo` 增加 `segments: [{path, startFrame, endFrame}]`（新时间线序）。`buildFinalizeArgs` 对每段 `-ss/-t` 输入 + `[i:v]trim,setpts` / `[i:a]atrim,asetpts`，再 `concat=n=N:v=1:a=1`，之后的 `ass`/`loudnorm`/BGM 链保持不变；无字幕时 `-c:v copy` 的旧捷径在 segments 路径上不可用（concat 必须重编码），这是有意的：一次编码换帧级拼接。
5. **音频与 #176**：片段拼接后用同一套 `sceneDurations` 与 `audioPaths` 重新度量头漂移。度量对象是**临时整轨 wav**（`concat` 只出音频，不编码视频）；`measureAudioDrift` 接受任何含音轨的文件。BGM 淡出的总时长用 `totalFrames/fps`，不再探 raw。
6. **manifest 扩展**：`incremental: { schema, compositionFingerprint, fps, totalFrames, scenes:[{id, fingerprint, offsetFrames, clipFrames, visualFrames, audioSha256, mediaSha256}], segments:[{path, startFrame, endFrame, generation}], baseManifest }`。路径相对 `outputDir`，manifest 自包含；`generation` 记录片段来自第几代（供诊断，不参与判据）。
7. **缓存查找**：同 `pipelineId` 下按 `createdAt` 倒序找第一个 `compositionFingerprint` 相同、`fps` 相同、所有 `segments.path` 存在且可读的 manifest。找不到 → 全量。**不跨 pipeline**（不同内容的场景指纹没有可比性）。
8. **无画面变化短路**：新旧 props、全部素材、全部音频字节一致 → 0 帧光栅，直接按旧 segments 重新 finalize（字幕/BGM 改动的重跑）。
9. **修复路径**：Step 6 verify 的修复若命中 `incremental.segments`，用同一 segments + 修正后的 ASS 重新 finalize；否则沿用 `rawOutputPathFor`。两条路径都必须过既有的帧数/响度/字幕读回门。
10. **逃生口与回落**：`SHORT_VIDEO_FORCE_FULL_RENDER=1` 强制全量；所有回落都写进 manifest `incremental.fallbackReason`，不静默。
11. **磁盘**：每个 pipeline 只保留最近 2 个带 segments 的版本（part 文件 + 所需 base raw）；删除前先确认不再被任何保留 manifest 引用，且只删 `output/<id>/render/**` 与 `output/<id>/*-raw.mp4` 里由渲染门写出的文件。旧版本清理失败只 warn。
12. **不做**：不改 `ShortVideo.tsx` 的场景结构、不改转场规则、不改字体/token、不做场景内切分、不做并行分段渲染。

## Modified Files Impact（R3）

- 新增 `render-incremental.mjs`（`lib/` 下，待建：指纹、时间线映射、脏区间、segment 计划、缓存选择）
- `scripts/short-video/lib/render-remotion.mjs`（缓存查找、按区间渲染、回落、manifest 写入、prune）
- `scripts/short-video/lib/render-manifest.mjs`（`incremental` 块 schema、segments 校验、replay 兼容）
- `scripts/short-video/lib/post-process.mjs`（`segments` 的 finalize argv 与临时整轨 wav 度量）
- `scripts/short-video/main.mjs`（Step 6 修复按 segments 重跑 finalize）
- 测试：新增 `render-incremental.test.mjs`（`__tests__/` 下，待建）、`post-process-finalize-segments.test.mjs`（待建）、`render-manifest` 相关断言
- 文档：`docs/video-production-runbook.md` 增补「增量渲染」执行口径与逃生口；`docs/DOCS-INDEX.md` 登记本 spec 与 tickets；`docs/issue-roadmap.md` Round 更新

## Behavioral Scenarios（R3）

| # | 场景 | 期望 |
| --- | --- | --- |
| S1 | 改 1 个场景的文案，重跑 | 只渲该场景 ±10 帧；成片与整片重渲 SSIM All ≥0.999、最低帧 ≥0.985（0.995 在现有 finalize 编码地板下不可达，见 Verification）；≤30 s（2 场景 ≤35 s） |
| S2 | 只换某场景的图片/视频素材 | 该场景脏；素材字节不一致必须被抓住（同名不同字节） |
| S3 | 改某场景的 TTS 时长 | 该场景 + 两侧转场带脏；后续场景内容复用但按新 offset 落位 |
| S4 | 只改 ASS 字幕 / BGM | 0 帧光栅，仅 finalize；成片字幕正确、响度不变 |
| S5 | 改 token/字体/`remotion/src` 组件 | 合成层指纹变 → 全量，不复用旧帧 |
| S6 | 上一版 manifest 缺失/raw 被删/素材不可读 | 全量 + `fallbackReason`，不产出半新半旧的片子 |
| S7 | 首渲（无缓存） | 与今天完全一致的单次整片渲染 |
| S8 | 增量成片后 Step 6 触发字幕修复 | 用 segments + 新 ASS 重跑 finalize；帧数/响度/字幕读回全过 |
| S9 | `SHORT_VIDEO_FORCE_FULL_RENDER=1` | 强制全量，缓存只读不写 |
| S10 | 边界帧检查（每个切点前后 2 帧） | 无重复帧/丢帧/闪烁；切点本身不产生额外 SSIM 跌落（最低帧可能落在脏场景末的转场帧，需人工抽查） |

## Verification（2026-11-24，真实包 `workbuddy-computer-use`）

真实数据：9 场景 / 1725 帧 / 57.5 s，场景 3 窗口 `[408,585)`（177 帧），无 BGM，字幕烧录。

| 场景 | 墙钟 | 复用/光栅帧 | 结果 |
| --- | --- | --- | --- |
| 全量（首渲，冷 bundle） | 72.4 s | 1725 / 1725 | 基线 |
| 全量（`SHORT_VIDEO_FORCE_FULL_RENDER=1`） | 69.5 s | 1725 / 1725 | 基线 |
| 改 1 场景（场景 3 文案） | **20.3 s** | 1548 / 177 | ≤30 s ✅ |
| 改 2 个不相邻场景（2、6） | **32.7 s** | 1251 / 474 | ≤35 s ✅ |
| 无画面变化重跑 | **10.1 s** | 1725 / 0（仅 finalize） | ≤15 s ✅ |

SSIM（增量成片 vs 整片重渲成片，逐帧 `ssim`，默认 CRF23 配方）：

- All **0.999269**；最低 **0.988117**（帧 583–585，场景 3→4 的转场带）。
- 复用场景 1/5/6/7/8/9 逐帧 **1.000000**（CFR 修正后），场景 2/4 均值 0.999884 / 0.998713（相邻 GOP 传播），脏场景 3 均值 0.994674。

为什么 0.995 单帧下限不可达：现有全量链路自身 `full raw → full final`（同一 finalize）只有 All 0.9921、最低 0.9844；`inc final → full raw` All 0.9920、最低 0.9835。把 finalize 提到 CRF16/CRF12，最低也只到 0.99099 / 0.99147；给脏区间加 10 帧 handle 再 trim 无改善。低点来自分区间 Remotion 编码与全量编码在同一复杂转场帧的像素差，不是拼接错位或字幕抖动。

因此 S1 的画面门取 **All ≥0.999 + 最低帧 ≥0.985**（高于现有 finalize 地板 0.9844），并要求切点前后 2 帧人工抽查无丢/重帧。另：`concat` 后加 `fps=30,settb=1/30` 强制 CFR，修掉了增量路径字幕 cue 边界晚一帧的翻转（修复前帧 355 SSIM 0.9915）。

未覆盖：带 BGM 的真实包只过了单测；2 场景组合目前测的是不相邻场景，相邻两场景会并成一个更大区间。

## Out of Scope

- 场景内部切分、分段并行渲染、镜头配方卡（`#228` 其他候选）。
- 修改视觉模板、排版、字体、转场、动画 timing。
- 平台发布链与 HITL。

## Tickets

- **T1 — 计划层（R2）**：`lib/render-incremental.mjs` + 单测。交付 `planIncrementalRender(prevManifest, props, {compositionFingerprint})`：场景指纹、脏集合、脏帧区间、新旧 offset 映射、segment 计划、缓存候选选择。验收：S1/S2/S3/S5/S6 的纯函数用例；demo：对 `workbuddy-computer-use` 的两版 props 打印脏区间与预计复用帧数。
- **T2 — 拼接 finalize（R3）**：`post-process.mjs` 的 segments 参数 + 单测 + 真实 ffmpeg smoke（3 个合成片段拼 90 帧、音轨连续、ASS/loudnorm/BGM 仍生效）。验收：`buildFinalizeArgs` 输出含 `concat=n=3`；smoke 产物帧数/时长/loudness 与整段输入一致；既有 finalize 测试全绿。
- **T3 — 编排与回落（R3）**：`render-remotion.mjs` + `main.mjs` 修复路径 + `render-manifest.mjs` schema + prune + 逃生口。验收：真实 `workbuddy-computer-use` 改 1 个场景重跑 ≤30 s（2 场景 ≤35 s）、SSIM 门通过、`verify-video` 通过；无画面变化重跑 ≤15 s；强制全量与首渲路径全绿。
