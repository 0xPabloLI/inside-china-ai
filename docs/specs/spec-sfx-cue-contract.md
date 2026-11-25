# Spec — SFX Cue Contract (#1160)

Status: **design only（2026-11-21，未实现、无产线代码）** · Issue: #1160 · Parent: #291（来源 #732 ②）· Planning scale: S1 · Risk: R1（本票不碰管线）

> **下游读者**：本文件只定义契约，不定义音效资产、不定义混音、不铺 Remotion `<Audio>` 层。是否让音效层进入成片是产品判断（2026-11-07 用户裁决「暂不引入」仍然有效）；若产品决定改判，实现票从本文件的 §Contract 取件，不需要重新设计。

## Problem Statement

全库没有 SFX 层：产线代码无 `sfx` / cue sheet / 钉帧表，`ShortVideoProps` 无音效字段，`ShortVideo.tsx` 只有 TTS `<Audio>`，`assets/` 下只有 `bgm/` 没有 `sfx/`（2026-11 本仓取证，见票面）。因此外部范式「把绝对帧改成相对帧表达式」在这里不是改写，而是**从零定义**。定义之前要先回答两个真问题：

1. 一个音效「落在第几帧」现在只能写成绝对帧；改一次镜长，所有绝对帧都失效，且没有任何东西会报错。
2. 同一套帧号要同时服务画面验收与音频证据。`#735` 已经在 QA 终检里建立了相对帧声明：`{offset, offsetFrom: "start"|"end"}` → `relativeFrame` → `frame = visualStartFrames + relativeFrame`（`lib/qa-final-review.mjs` L120-166）。SFX 若自造第二套坐标，两条证据链会在同一帧上给出不同数字。

## Solution

三件东西，各自只有一个 home：

| 件 | 是什么 | 放在哪 | 谁写 |
|---|---|---|---|
| **声明（declaration）** | 作者写的 cue：sceneId + 相对偏移 + 素材引用 | `content/<slug>/sfx-cues.mjs`（与 `scene-data.mjs` 同级的包内源文件） | 作者 / Stage 3，手工 |
| **派生表（derived sheet）** | 用 `sceneTimeline()` 换算出绝对帧后的 cue sheet，附 fps 与时间线摘要 | `output/<slug>/sfx-cue-sheet.json` | 未来的 `sfx-cues.mjs --derive`，每次渲染前后生成 |
| **素材登记（asset registry）** | 音效文件与许可证/署名 | `assets/audio/sfx/` + 既有 `ATTRIBUTION`（`docs/media-asset-management.md`） | 作者，按媒体资产规则 |

声明不进 `scene-data.mjs`：cue 是音频层的事实，不是镜头的文本字段；把 cue 塞进 scene 会再造一个「哪些字段属于哪一层」的模糊边界，也会让 `#253`/`#733` 的 scene 契约被动扩张。派生表是证据，不是输入；渲染只读派生表。

## Contract

### 1. Cue 声明

```js
// content/<slug>/sfx-cues.mjs
export const fps = 30; // 声明所用的帧率，必须与渲染 fps 一致，否则 fail-closed
export const cues = [
  {
    id: "s2-impact",          // 包内唯一
    sceneId: 2,               // 必须命中 scene-data 的 id
    offset: 12,               // 整数帧；offsetFrom="end" 时按 -n 写
    offsetFrom: "start",      // "start" | "end"
    assetId: "whoosh-01",     // 指向 assets/audio/sfx 的登记项
    gainDb: 0,                // 可选，[-60, +6]
    fadeInFrames: 0,          // 可选，>= 0
    fadeOutFrames: 0,         // 可选，>= 0
  },
];
```

字段约束：

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `id` | string | 是 | 包内唯一；`/^[a-z0-9][a-z0-9-]*$/` |
| `sceneId` | number | 是 | 必须存在于 `scene-data.mjs` |
| `offset` | int | 是 | `offsetFrom="start"` 时 `>= 0`；`="end"` 时 `<= 0` |
| `offsetFrom` | enum | 是 | `start` / `end` |
| `assetId` | string | 是 | 在素材登记里存在，文件在盘上 |
| `gainDb` | number | 否 | 默认 0，范围 [-60, +6] |
| `fadeInFrames` / `fadeOutFrames` | int | 否 | 默认 0，`>= 0`，且两者之和不超过 cue 的可用长度 |

### 2. 派生算法

只允许一个时间线来源：

```
schedule = sceneTimeline(sceneDurations, { fps, transitionOverlap })
entry    = schedule.find(e => e.sceneId === cue.sceneId)
relativeFrame =
  offsetFrom === "start" ? offset
                        : entry.clipFrames - 1 + offset
frame = entry.visualStartFrames + relativeFrame
```

`relativeFrame` 是相对**这一镜的可见首帧**的位置，`frame` 是合成时间线上的绝对帧；`transitionOverlap` 只影响 `visualStartFrames` 的推进方式，不改这个公式。这与 `#735` 的 QA 相对帧完全同构，因此同一帧在 QA 拼图与 SFX cue sheet 里是同一个数字。

不做 clamp。QA 的 `Math.min(offsets.entry, clipFrames - 1)` 是为了在过短的镜头里仍产出两帧验收图；cue 越界是作者错误，必须报错并指出 cue / scene / 越界值，而不是悄悄挪到最后一帧。

### 3. 派生表

```json
{
  "schemaVersion": 1,
  "pack": "zhipu-valuation",
  "fps": 30,
  "timelineDigest": "<sha256 of sceneId+duration+transitionOverlap>",
  "generatedAt": "2026-11-21T…Z",
  "cues": [
    {
      "id": "s2-impact",
      "sceneId": 2,
      "offset": 12,
      "offsetFrom": "start",
      "relativeFrame": 12,
      "frame": 245,
      "sceneStartFrame": 233,
      "sceneFrames": 96,
      "assetId": "whoosh-01",
      "assetPath": "assets/audio/sfx/whoosh-01.wav",
      "gainDb": 0
    }
  ]
}
```

派生表必须可由声明 + 时间线**逐字节复现**（去掉 `generatedAt` 后）；`timelineDigest` 用于在渲染/验收边界发现陈旧表：表里的摘要与当前 scenes 不一致时 fail-closed，不允许拿旧表对新片。

### 4. 失败即关闸（fail-closed）

| 条件 | 行为 |
|---|---|
| 声明文件存在但导出形状不对（`fps` 非正、`cues` 非数组） | 非零退出，指出文件 |
| `id` 重复 | 非零退出，列出重复 id |
| `sceneId` 不在 `scene-data` | 非零退出，指出 cue 与缺失 id |
| `offset` 符号与 `offsetFrom` 不匹配 | 非零退出 |
| `relativeFrame < 0` 或 `>= clipFrames` | 非零退出，指出 cue / scene / 值 / 允许范围 |
| `fps` 声明与渲染 fps 不一致 | 非零退出；不按比例换算，避免静默漂移 |
| `assetId` 未登记或文件不在盘上 | 非零退出 |
| `timelineDigest` 与当前 scenes 不一致 | 非零退出，要求重新派生 |
| 没有 `sfx-cues.mjs` | 合法：无声明即无 SFX 层，派生表不生成 |

### 5. 验收判据（定义，不是现状）

- **改镜长自动跟随**：三镜 fixture，第二镜 cue `offsetFrom="end", offset=-6`；把第一镜时长 +2s 后，声明文件不变，派生表里第二镜的 `sceneStartFrame` 与 `frame` 应整体后移 2s×fps，`relativeFrame` 不变。这是「改卡后自动跟随」的可验证定义。
- **越界即红**：同一 fixture 把第三镜 `clipFrames` 改到 4，`offsetFrom="end", offset=-6` 必须非零退出，信息里含 `cue id / sceneId / -6 / clipFrames=4`。
- **陈旧表即红**：改 scenes 但不重新派生，渲染边界读到 `timelineDigest` 不一致必须拒绝。
- **无声明即无层**：没有 `sfx-cues.mjs` 的包，派生表不生成、渲染路径不需要新增分支。

## Boundary

| 相邻件 | 边界 |
|---|---|
| `lib/timeline.mjs` | 唯一时间线真值；本契约只消费 `sceneTimeline()`，不自算 offset |
| `lib/scene-audio.mjs` | 只负责 TTS take 解析（sidecar 链 / 音频目录 containment）；SFX 不往它加字段、不复用它的路径解析，素材解析走媒体资产规则 |
| `#735` QA 终检 | 共享 `{offset, offsetFrom}` 声明语汇与 `relativeFrame → frame` 定义；QA 的拼图不依赖 cue，SFX 的派生表也不进 QA 报告，只共享帧号 |
| `mix-bgm.mjs` / 后期混音 | BGM 是渲染后 ffmpeg `amix`（`-nobgm` 双版本）；SFX 若落地需要单独定义混音阶段与 ducking，属产品裁决后的实现票，本契约不预设 |
| `#733` / `#253` scene 契约 | cue 不进 scene 字段；scene 的文本/分镜契约不因 SFX 扩张 |

## Non-goals

- 不引入音效资产、不选音效库、不写 `assets/audio/sfx/`。
- 不铺 Remotion SFX `<Audio>` 层，不改 `ShortVideoProps` / `ShortVideo.tsx`。
- 不定义混音、ducking、与 BGM 的优先级；不定义发布侧音轨替换。
- 不改字级强制对齐（`text-align.py` → `audio/subtitle-timing.json`）与 QA 终检。
- 不复制外部仓库代码/卡/模板。

## Delivery Status

**设计已交付，未实现**（2026-11-21）。本票的产出就是本文档；没有 commit 到产线代码，也没有新增依赖或资产。消费者：

- 产品裁决（是否让音效层进入成片）——由用户作出，不在本票内；
- 若裁决为「引入」，实现票按 §Contract 取件，先做 `sfx-cues.mjs --derive` + fail-closed 校验，再谈 `<Audio>` 层与混音；
- 若裁决维持「暂不引入」，本文件作为契约档保留，不产生运行时成本。
