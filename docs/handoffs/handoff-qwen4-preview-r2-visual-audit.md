# Handoff: Qwen4-Preview R2 视觉审阅遗留问题（黑帧 / 圆标注 / 文本截断）

> Created: 2026-08-30
> Trigger: 用户对 `qwen4-preview-v2026-08-29T12-23-09-short.mp4` HITL 二轮审阅提出 3 个问题
> （文字仍被截断 / 橙色椭圆遮挡文字 / 结尾全黑帧且字幕仍在走）
> 前置文档：`docs/archive/handoffs/handoff-qwen4-preview-pipeline-hardening.md`（R1，8 项管线修复，已归档）
> 状态：**仅诊断 + 方案设计，未改任何代码**。等待用户确认后再实施。
> 修订 1（2026-08-30，二轮 review）：§1 时间换算修正（CTA 视觉起点 56.47s 非 59.5s；
> CTA+HOLD=8.63s 非 5.6–6.6s）+ 新增方案 A2；§3.1/§5b 几何修正（content 宽 756px，
> 旧 660/692px 系计算错误）；已被 Proposal supersede 的结论就地标注【历史判断】。
> 修订 2（2026-08-30，用户三审截图）：新增 §3.5（scene 9 `media-overlay` 缺 `media` →
> 背景退化为近黑底 + GridBg，中部空洞叠加在 §3.3 之上）；§4 新增 #8；§5c 新增校验升级待办。
> 修订 3（2026-08-30，三轮 review）：§3.5 缺媒体 FAIL 改为**阶段化门控**（preflight WARN/pending
> → Step 1.5c 后硬 FAIL，因 preflight 早于自动 sourcing）；§2 圆修复推荐组合统一为 A+C、
> 阈值改为可计算 2% 并交由 Proposal fixture F7 验收；§3/§4 的文本方案改为**只链接 Proposal**
> （本文与 Proposal 不设两个真源：本文只保留视频级结论）。
> 分析对象：`scripts/short-video/output/qwen4-preview/qwen4-preview-v2026-08-29T12-23-09-short.mp4`
> （65.1s / 1953 帧 @30fps）

---

## 0. 时间轴基线（后续所有推导都基于这组数字）

`sceneClipFrames(d) = ceil((d + 0.5) * 30)`，来自 `lib/timeline.mjs`：

| 场景 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10(CTA) | Σ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TTS(s) | 5.687 | 5.271 | 6.700 | 7.415 | 4.759 | 6.188 | 6.081 | 6.551 | 6.188 | 5.121 | 59.96 |
| clipFrames | 186 | 174 | 216 | 238 | 158 | 201 | 198 | 212 | 201 | 169 | **1953** |

- 成片 1953 帧 = 65.1s（与 `verification-report.json` 一致）
- 9 个转场 × `TRANSITION_FRAMES=10` = 90 帧
- 帧→秒换算一律 ÷30：**1694 帧=56.47s，1784 帧=59.47s，169 帧=5.63s，259 帧=8.63s**
  （初版曾把 1784 帧误写为 "59.5s 对应 CTA 视觉起点"，二轮 review 已修正）

**Remotion `TransitionSeries` 的转场是"重叠"而非"追加"**（已核对本地源码
`remotion/node_modules/@remotion/transitions/dist/esm/index.mjs:1626-1634`：

```js
if (prev) {
  duration = prev.props.timing.getDurationInFrames({ fps });
  resolvedTransitionOffsets -= duration;   // ← 从后续序列起点里扣掉
}
```

所以场景 i 的**真实视觉起点** `actualStart_i = Σ(clipFrames[0..i-1]) − 10·i`：

| 场景 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 视觉起点(帧) | 0 | 176 | 340 | 546 | 774 | 922 | 1113 | 1301 | 1503 | **1694** |
| 视觉终点(帧) | 186 | 350 | 556 | 784 | 932 | 1123 | 1311 | 1513 | 1704 | **1863** |
| 音频/字幕起点(帧) | 0 | 186 | 360 | 576 | 814 | 972 | 1173 | 1371 | 1583 | **1784** |
| **音画偏差(帧)** | 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | **90** |

最后一行是 R1 完全没发现的**系统性音画漂移**：音频/字幕用 `Σ` 坐标，视觉用 `Σ−10i` 坐标，
每个场景累积滞后 10 帧，到 CTA 时已达 **3.0s**。

---

## 1. 结尾全黑帧 + 字幕仍在走 ✅ 已复现，根因确认

### 现象（抽帧实证，`ffmpeg -ss` 逐帧抽取）

| 时刻 | 文件大小 | 画面 |
|---|---|---|
| 60.0s | 432 KB | CTA 完整可见 |
| **62.0s** | 433 KB | CTA 完整可见（"CHINA AI NEWS / CHINA AI, DECODED / FOLLOW FOR MORE / QWEN4 IS COMING"） |
| **62.5s** | 35 KB | **近全黑**，仅剩字幕 "blueprint." |
| 63.5s | 24 KB | 近全黑，字幕仍在 |
| 64.5s | 31 KB | 近全黑，字幕 "Follow for more." |

### 根因

- `Root.tsx:34-37` 的 `calculateMetadata` 把总帧数算成 `Σ sceneClipFrames = 1953`
- 但 `TransitionSeries` 的实际内容只到 **1863 帧**（见上表：CTA 视觉终点）
- 差 90 帧 = **3.0s**，这 90 帧里 `TransitionSeries` 无内容可渲染，只剩
  `ShortVideo.tsx:146` 的 `<AbsoluteFill style={{backgroundColor:"#0a0a14"}}>` 纯背景
- 字幕是 ffmpeg 烧录的，用的是 `sceneTimeline()` 的 `Σ` 坐标（**不含**转场扣减），
  所以字幕/音频一直走到 1953 帧 → 出现"字幕在走、画面全黑"

### 用户判断正确：CTA 应该维持到视频结束

CTA 现在是"提前 3s 上屏、又提前 3s 消失"：

- CTA 视觉 1694→1863（**56.47s**→62.1s；CTA 原始视觉时长 169 帧 = **5.63s**）
- CTA 音频 1784→1953（**59.47s**→65.1s），但**语音只到 64.6s**（5.121s TTS）
- 结果：场景 9 的语音 Sequence（含 buffer 共 90 帧）压在 CTA 画面上**约 3.0s**
  （语音本体 ~2.5s），最后 ~2.5s 语音（含 "Follow for more."）落在黑屏上

### 修复方向（Grill 阶段在 A / A2 之间定夺，初判 A2 更优）

| 方案 | 做法 | 评价 |
|---|---|---|
| **A2. 非末幕补转场帧（二轮 review 提出，初判推荐）** | 除最后一幕外，每幕 `visualDuration = clipFrames + TRANSITION_FRAMES`；TransitionSeries 重叠扣除后，每幕视觉起点自然回到 `Σ clipFrames` | **音频/字幕/`Root.tsx` 全部零改动**，总时长仍 1953 帧；CTA 视觉 1784→1953（169 帧 = 5.63s），与音频同起点、正好占屏到最后一帧，无需 CTA_HOLD。代价：每幕视觉多显示 10 帧（转场吃进 buffer 区），场景组件收到的 `duration` prop 需同步延长 |
| A. 统一时间轴 + CTA_HOLD（初版提出） | 音频/字幕改用视觉坐标 `actualStart_i`；总时长 = `actualStart_last + clipFrames_last + CTA_HOLD` | 同时修漂移与黑帧；但 CTA 总占屏 169+90=259 帧 = **8.63s**（初版误写 5.6–6.6s），偏长；要动 `sceneTimeline()` 且需保证 Playwright 路径不受影响 |
| B. `calculateMetadata` 直接减转场 | 总时长 = 1863（62.1s） | 会截断最后一句 "Follow for more."，不可接受 |
| C. 末尾显式 Hold Sequence | 1863 帧后补 CTA 持帧 | 音画漂移仍在（CTA 前 3s 还是场景 9 语音），治标 |

两个可行方案（A / A2）都满足用户硬性要求"CTA 到最后一帧、零黑帧"。
**初判 A2 更优**（改动面小一个数量级：只改 `ShortVideo.tsx` 序列时长），
最终由 Grill 对照场景矩阵确认。

---

## 2. 橙色椭圆遮挡其他文字 ✅ 已定位，**不是"故意的效果"，是布局 bug**

### 现象

Hook 场景（t=1.0s / 3.0s）的橙色手绘圆标注，向上压住 subject "QWEN4'S ENGINE"，
向下压住 numberLabel "ACTIVE PARAMS"（圆的描边直接从 "A" 上穿过）。

对比：StatReveal 场景（s7，"62.5" 的圆，t=42.0s）**完全正常**——圆和上下文留白充足。
说明"给关键数字画圆"是**有意的设计**，但 Hook 场景里圆的尺寸失控了。

### 根因（已核对本地源码）

`@remotion/rough-notation` 4.0.517 的 `getCircleItems`
（`remotion/node_modules/@remotion/rough-notation/dist/esm/index.mjs:2194-2213`）：

```js
const width  = rect.w + config.padding.left + config.padding.right;
const height = rect.h + config.padding.top  + config.padding.bottom;
return {
  width:  width  / Math.sqrt(2) * 2,   // ← ×1.414
  height: height / Math.sqrt(2) * 2,   // ← ×1.414
  ...
};
```

且 `Circle` 默认值（`2429-2432`、`2517`、`2855-2868`）：
`padding = {0,0,0,0}`、`box = "around"`、`strokeWidth = 20`。

**`box="around"` 时椭圆外扩 √2 ≈ 1.414 倍**（外接椭圆）。`HookScene.tsx:137` 的 bigNumber 是
**300px 字号**，"6B" 包围盒约 300×270px → 椭圆变成 **424×382px**，上下各外扩约
56px，再加 20px 描边的一半（10px）≈ **66px**。

而 `HookScene.tsx` 留的间隙只有：

- `subject` 的 `marginBottom: 32`（`line 102`）
- `numberLabel` 的 `marginTop: SPACING.lg = 16`（`line 160`）

**66px 外扩 > 32px / 16px 间隙 → 必然压字。** 字号越大越严重（这也是 s7 的 220px 圆没出问题的原因：
220px 字号外扩约 48px，而 `Slot` 给 `hero` 的留白足够）。

### 修复方向（推荐 A+C：`box="inside"` + 降字号）

| 方案 | 做法 | 评价 |
|---|---|---|
| **A. `box="inside"`** | `<Circle box="inside" ...>` → 椭圆内切于文字包围盒（1.0× 而非 1.414×），紧贴文字不外扩 | 一行改动，根治尺寸失控；但圆会变"扁"（贴着 6B 的宽扁包围盒），手绘感减弱 |
| **B. 加大间隙** | `subject` 的 `marginBottom` 32→96；`numberLabel` 的 `marginTop` 16→96 | 保留视觉张力，但要检查总高度是否溢出安全区（`SAFE_ZONES` y∈[220,1150]） |
| C. 降字号（推荐组合中的 C） | 300px → **240px** | 配合 `box="inside"` 进一步缩小外扩的绝对量，同时保留 Hook 的数字冲击感。⚠️ 旧稿此处曾写 220px（对齐 StatReveal），**统一为 240px**——本文与 Proposal 不得并存两个值 |
| D. 显式 `padding` | 给 `<Circle>` 传负 padding 抵消 √2 外扩 | 依赖库实现细节，脆弱，不推荐 |

**推荐 A + C**：`box="inside"`（内切，椭圆不再 √2 外扩）+ 字号 300→240，
既消除遮挡又保留冲击力；再把 `ANNOTATION.circle`
（`components/shared.ts:51-53`）扩展成
`{ progressRange, box, strokeWidth, padding }` 集中配置，Hook/StatReveal/Data 三处共用。

**验收阈值（三轮 review：改为可计算）**：用户要求"零遮挡或极少遮挡、不影响阅读"，
原表述"重叠面积 ≈ 0"不可计算。定为：

- 圆标注绘制 AABB 与 **subject / numberLabel 文本 AABB 的重叠面积 ≤ 被比较文本 AABB 面积的 2%**
- **被标注目标本身（bigNumber）不计入**——圆本就该覆盖它；但 bigNumber 自身
  必须完整可读（不越安全区、不被压字）
- 由 Proposal 的确定性 fixture **F7**（Hook 稳定帧碰撞）自动验收，2% 为初值，Grill 可调
- 注意：`box="inside"` 解决尺寸失控，但**不能自动保证目标数字可读**——
  必须靠 F7 断言，不能只靠改参数

---

## 3. 文字仍被截断 ✅ 找到 2 处真截断 + 1 处更严重的"整行丢失"

### 3.1 真截断：场景 9 result "THAT'S THE WHOLE POINT" 右侧切掉尾字母 T

- 位置：`t≈54.0s`（抽帧 `at-54.0.png`，裁剪放大后确认）
- 现象：橙色 `<Highlight>` 高亮框右缘与卡片右边界重合，最后一个 **"T" 被切掉**，
  实际渲染成 "THAT'S THE WHOLE POIN"
- 根因：`NarrativeScene.tsx:56-62` 的 `ResultText` 是 **56px / weight 900**，22 字符 +
  高亮 padding（左右各 6px）；容器 **content 宽 756px**（border box 820px，二轮 review 实测；
  本文档初版写 "maxWidth: 660" 有误），文本实测宽 **766.67px → 溢出 10.67px**，
  `overflow: "hidden"`（`line 266`）直接裁掉溢出部分
- **R1 新增的 `checkTextWidthBudget`（`lib/scene-rules.mjs`）没拦住它**——字符预算模型
  原理性不足【历史判断：该检查已由 Proposal v2 降级为提示（WARN），
  最终判定改为真实几何验证，见 §5b 指针文档】

### 3.2 疑似截断：场景 6 company "GDN + QSA" 左侧 G 被切

- 位置：`t≈33.0s`，`MediaOverlay` 顶部容器 `left: SAFE_ZONES.left = 60`
- 现象：G 的左缘被裁（渲染出 "DN + QSA"）
- ⚠️ **根因不成立，降为待调查现象**（四轮 review）：初版推测"衬线回退字体左侧 bearing
  为负 + 容器 overflow:hidden"。本地浏览器实测**未测出** G 的左侧 overhang，
  DOM 几何（rect/Range/scroll）本就测不到字形 ink overhang——见 Proposal §6.2
  ink-bound 机制。在 ink-bound 测量落地前，此处**只能保留为待调查现象**，
  不得作为已确认根因写进 ticket
- 优先级：低（1 个字母，视觉上像设计留边）

### 3.3 【新发现，比截断更严重】`media-overlay` 布局**根本不渲染 action / context**

`NarrativeScene.tsx:209-277` 的 `MediaOverlay` 只渲染 4 个字段：

- 顶部：badge、company
- 底部：result、source

**`txt.action` 和 `txt.context` 完全没被引用**（`ActionText`/`ContextText` 在
`line 74-86` 定义了，但 MediaOverlay 里没调用）。

受影响的 3 个场景（本次 6 个 narrative 场景中占一半）：

| 场景 | 丢失的 action | 丢失的 context |
|---|---|---|
| 6 hybrid-attention | "3 LAYERS REMEMBER, 1 LAYER LOOKS UP" | "GATED RESIDUAL + N-GRAM EMBEDDING + MUON" |
| 8 long-context | "PREFILL THROUGHPUT VS QWEN3.7-PLUS" | "QSA KERNEL: PREFILL 7.6X, DECODE 4.9X" |
| 9 loop-closure | "CAPACITY GROWTH, COMPUTE FLAT" | "51B EMBEDDINGS SIT IN REGULAR RAM, NOT VRAM" |

抽帧实证：`at-33.0.png`(s6) / `at-46.0.png`(s8) / `at-54.0.png`(s9)
—— 都只有顶部 badge+company、底部 result+source，中间大片留白，action/context 不见踪影。

**这是内容层面的损失**：action 是每屏的"主张句"，3/10 场景的核心信息没上屏。
用户感知到的"文字被截断"很可能包含这一类。

（修订 2：s9 的中部空洞是 §3.3 + §3.5 叠加——缺 action/context **且** 缺 media，见 §3.5；
s6/s8 有 media、中部由图片填充，仅缺 action/context。）

### 3.4 【顺带】`scene-data.mjs` 的 `highlight` 字段语义与渲染不一致

`s6.highlight = "LOOKS UP"` 本意是标注 action 里的 "LOOKS UP"，
但 `NarrativeScene.tsx:64-67` 的实现是"只要 `txt.highlight` 非空，就给**整个 result**
套高亮框"。所以 s6 的高亮框落在 "MICRO-BLOCK PRECISION" 上，而非作者想标的 "LOOKS UP"。
（s3/s4/s5/s8/s9 同理。）属于数据契约与渲染实现的错配，需二选一定死语义。

### 3.5 【新发现，修订 2】scene 9 的 `media-overlay` **没有 `media`**：背景不是素材，是近黑底

用户三审截图（s9）确认："REMEMBER 6B PARAMS?" 顶置、中部大空洞、"THAT'S THE WHOLE POINT"
底置。追问后核实：**背后不是"黑色素材"，是根本没有素材**——

- `scene-data.mjs:189-207`（s9 loop-closure）：只有 `layout: "media-overlay"`，**无 `media`
  字段**（对比 s6:130-134 / s8:171-175 都有 `media.path`）
- `NarrativeScene.tsx:211` `{hasMedia && ...}` → 无 media 时整个 MediaBackground 跳过；
  `:347` `{!hasMedia && <GridBg />}` → 退化为页面底色 `#0a0a14`（近黑）+ 极淡网格
- `media-overlay` 布局的文本锚定逻辑（顶部 y=220 / 底部 y=1150）**假设中部由全屏 media
  填充**；无 media 时 220→1150 之间约 900px 全部空置 → 视觉空洞

**管线已有防线但挡不住**：`checkNarrativeMediaWarning`（`scene-rules.mjs:1055-1077`）确实会
WARN "narrative scene missing media"——但 (1) WARN 不阻断；(2) 它对所有非 CTA 场景一视同仁，
不区分布局。`media-overlay` / `media-bottom-bar` / `media-split` 是 **media 依赖型布局**（文本
排版围绕 media 设计），缺 media 时画面结构直接崩坏，WARN 级别不匹配后果严重度。

#### 修复方向（并入 §3.3 修复批次，同一 MediaOverlay）

**门控阶段化（三轮 review 修正：FAIL 不能放在 preflight）**
`main.mjs:114-131`（Step 0，调 `verify-video.mjs --pre`）**早于**
`main.mjs:155+`（Step 1.5 自动素材搜索，其注释明确会在 media 路径指向缺失文件时触发
asset-sourcer）。若在 preflight 直接 FAIL，自动 sourcing 就没有机会补回媒体：

| 阶段 | 判定 |
|---|---|
| preflight（`scene-rules`） | 缺媒体 = **pending / WARN**（可修复，留给 sourcing），不阻断 |
| Step 1.5c 之后（sourcing 完成） | 按**最终场景** + 文件实际存在性 **硬 FAIL** |
| `mediaOptOut=true` 与 media 依赖型布局（`media-overlay` / `media-bottom-bar` / `media-split`）组合 | **立即 FAIL**（逻辑矛盾：布局依赖 media 却声明不用） |
| `stacked-cards`（CSS-only）+ `mediaOptOut=true` | **PASS**，不应继续 WARN |

其余（与原来一致）：

1. media 依赖型布局缺 `scene.media` → 经 sourcing 后仍缺 → FAIL；
   `stacked-cards` 等 CSS-only 布局维持 WARN 语义
2. **s9 内容修复（二选一）**：补 media 素材（如 51B embedding RAM vs VRAM 示意图），
   或 layout 改 `stacked-cards`（s2–s5 的居中卡片布局，无 media 设计成立）
3. 验收：s9 重渲染后中部无空洞（有素材 = 图填满；无素材改 layout = 卡片居中）

### 修复方向（§3.1–3.4 汇总）

1. **scene 9 截断**：**根治方案见 Proposal（单一真源，§6.2 真实几何 Fit/Assert）**。
   【历史判断】初版写的"自动降字号分档（56→48→40）+ 预算门槛收紧"已被 Proposal 取代
   （字符预算降为 WARN 提示，最终判定改为真实几何），不再作为实施指令
2. **`media-overlay` 补 action/context**：顶部容器加 `ActionText`（company 之后），
   底部容器加 `ContextText`（result 之后、source 之前）；补完后需重测高度是否溢出
   `SAFE_ZONES`（y∈[220,1150]）
3. **`highlight` 语义**：要么改成"在 result 内部对 `txt.highlight` 子串做局部高亮"
   （需拆分字符串），要么在 `scene-rules.mjs` 加校验——`txt.highlight` 必须是
   `txt.result` 的子串，否则 FAIL。推荐后者（改动小、语义明确）

---

## 4. 影响面与优先级

| # | 问题 | 严重度 | 影响范围 | 建议 |
|---|---|---|---|---|
| 1 | 结尾 3s 黑帧 | **P0 阻断发布** | 所有 Remotion 路径视频（含 doubao-work） | 方案 **A2**（§1 初判更优，Grill 定夺） |
| 2 | 音画累积漂移（最大 3s） | **P0** | 同上 | 随 #1 一起修 |
| 3 | `media-overlay` 丢 action/context | **P1 内容损失** | 所有用 `media-overlay` 的场景 | 补渲染 + 高度回归 |
| 4 | s9 "…POINT" 截断 | P1 | 长 result 文本 | **见 Proposal（真实几何 Fit/Assert）**，本文不重复给方案 |
| 5 | Hook 橙色圆压字 | P2（用户存疑） | 所有带 `bigNumber` 的 hook 场景 | `box="inside"` + 降字号；验收 = fixture F7（§2） |
| 6 | `highlight` 字段语义错配 | P3 | 所有带 `highlight` 的 narrative 场景 | 子串校验 + 单行缩放（Proposal §6.4） |
| 7 | s6 "GDN" 左缘裁切 | P3 | 边缘 | 观察，可并入 #4 |
| 8 | `media-overlay` 缺 `media` → 近黑底大空洞 | **P1 内容损失** | s9；所有 media 依赖型布局场景 | **阶段化门控**（§3.5：preflight WARN → Step 1.5c 后 FAIL）+ s9 补素材/改 layout |

【历史判断，已被 supersede】初版曾写 "#1/#2 与 R1 Backlog #2（字体衬线回退）叠加，
建议一并排期"——衬线基准化（spec #130，`BRAND_FONT_STACK` 显式 Times 栈）后
字体不再是根因；#4 的根治路径见 Proposal（真实几何验证），与字体打包无关
（打包只服务跨机渲染确定性，是独立 backlog）。

---

## 5. 用户决策（2026-08-30 已拍板）

1. **CTA 持帧**：**硬性要求 CTA 画面必须维持到视频最后一帧**（不允许任何黑帧尾巴）。
   实现路径在方案 A / A2 之间由 Grill 定夺（见 §1）——A2 下 CTA 自然显示到最后一帧
   （169 帧 = 5.63s），A 下为 259 帧 = 8.63s
2. **修复范围：管线优先**（R1 精神：保证以后不再发生），本次 qwen4-preview 内容包随之重渲染
3. **Hook 大圆**：保留大圆视觉，**零遮挡或极少遮挡，不得影响阅读**
   （`box="inside"` + 字号 300→**240**；验收阈值：圆标注绘制 AABB 与 subject /
   numberLabel 文本 AABB 的**重叠面积 ≤ 被比较文本 AABB 的 2%**，被标注目标本身不计入；
   由 Proposal fixture F7 自动验收——详见 §2）

## 5b. 截断复发根因（2026-08-30 补充诊断）

问题："为什么文字截断反复出现？"

R1 两道防线这次**同时漏过同一处**（s9 "THAT'S THE WHOLE POINT"）：

1. `checkTextWidthBudget`：预算模型是二值 half/full 档（`scene-rules.mjs:1336-1339`）。
   s9 是 `media-overlay` → 归入 full 档（result 预算 24），22 字符 PASS。
   但 full 档锚点是 "820px 全带宽 @52px" 实测；s9 真实容器是 media-overlay 底部渐变条，
   **content 宽 756px**（本节初版写 "756−64=692px"，属重复扣 padding——`maxWidth` 作用于
   content box，Remotion 无 box-sizing reset——已按二轮 review 修正），字号 56px，
   文本实测 **766.67px → 溢出 10.67px** → 裁切。
   **4 种布局变体 × 各自 padding × 各处字号 vs 二值预算**
2. `checkClippedText`：只探测 safe-zone 右边界 x=880 的"亮像素贴边+右侧全暗"
   （`frame-analysis.mjs:467-473`）。s9 的文字在 **x≈848**（容器内容盒边缘）被
   `overflow:hidden` 裁掉，探测带 860–880 只剩容器深色渐变背景 → 0 命中；且 WARN 级不阻断

结构性原因（四层叠加）：

1. 所有文本容器 `overflow:hidden` → 溢出静默化，CSS 不报错、布局不变形，人审/帧审计均易漏
2. 修复方法论是"打锚点"（上次失败案例实测）而非"建模型" → 每个新视频的
   布局×字号×文案组合不在锚点覆盖内，换个地方再犯
3. 【历史判断，已被 supersede】初版列有"字体回退（衬线比 sans 宽 ~30%）使静态预算
   建立在不稳定度量上"——衬线基准化（spec #130）后此条不再成立；
   跨机字体确定性是独立 backlog（Proposal §6.6）
4. 两道防线共享同一假设（"裁切发生在安全区边界"），容器内部裁切双双失效

**根治方案（管线级，对应决策 2）**：完整方案见
`docs/handoffs/handoff-text-overflow-fix-proposal.md`（现 **v3**）。
review 轨迹：v1 Request changes → v2 修订 → v2 仍 Request changes（二轮）→ v3 修订。
二轮 review 原文存档：`docs/handoffs/review-text-overflow-fix-proposal-2026-08-30.md`。
下表为初版摘要，【历史判断】——A/B/C/D 的最终定位以 Proposal v3 为准：

| 初版方案 | v3 现状 |
|---|---|
| A. FitText 渲染时自适应 | 升级为 **Fit/Assert 双层验证**（布局盒 fit + 标注绘制 bbox assert，含 `useCurrentScale()` 校正）+ `cancelRender` 失败闭环 |
| B. 预算表升维 | **降级为内容创作提示（WARN）**，不再作为放行门槛；最终判定 = 真实几何 |
| C. 启发式扩展 | 维持观察项 |
| D. 打包品牌字体 | **移出本批**，独立 backlog（触发条件：渲染离开本机） |

## 5c. 后续待办（进入 Grill → Spec → Tickets 流程）

1. **时间轴方案定夺**：Grill 对照场景矩阵比较 A2（非末幕补转场帧；音/字幕/Root 零改动）
   与 A（统一时间轴 + CTA_HOLD=8.63s）。无论选哪个，都要按二轮 review 要求重构时间轴验证：
   - 共享 schedule 同时驱动 `ShortVideo`、`Root`、字幕、音频、帧抽样
   - 重写 `__tests__/remotion-timeline.test.mjs`（现状 12/12 PASS 是**假绿**：
     "visual start" 断言是 `timeline[1].offset` 与自身比较，注释与 `ShortVideo.tsx`
     实际不符——视觉由 TransitionSeries 排布，只有音频用 `cumulativeOffsetFrames`）
   - `verify-remotion-frames.mjs` 改用同一 schedule，并**检查最后一帧**；
     尾部纯背景（空 CTA）必须 FAIL 而非 WARN
2. **verify-video 渲染器 gate 影响面**：`verify-video.mjs:394` 仅在
   `meta.renderer === "remotion"` 时跑帧检查，而 main.mjs 默认 Remotion——本地盘点：
   **15 个生产 `content/**/scenes.mjs`**、5 个显式声明 renderer；未声明者默认 Remotion 且
   **跳过帧检查**（三轮 review 修正：旧稿写"10 个内容包"系深度 1 遍历漏计
   `distillation/pt1-3`、`restraint/pt1,pt3`）
3. `highlight` 语义已定（不再待定）：`txt.highlight` 必须是 `txt.result` 的子串
   （scene-rules 校验兜底）+ 带标注 result 单行缩放（Proposal §6.4）
3b. **缺媒体门控阶段化已定**（三轮 review）：见 §3.5 表——preflight WARN/pending →
   Step 1.5c 后硬 FAIL → `mediaOptOut` + media 依赖布局立即 FAIL →
   `stacked-cards` + `mediaOptOut` PASS。**本文是此规则的单一真源**，
   Proposal 只定义与 slot 契约的接口（§6.9）
3c. **圆标注碰撞验收**：由 Proposal 确定性 fixture **F7** 自动验收
   （重叠面积 ≤ 被比较文本 AABB 的 2%，排除被标注目标本身）；本文 §2 阈值同步
4. 其余 Grill 输入：Fixture 设计（**Proposal v3.1 §6.8**）、slot 注册协议细节、
   缩字 floor 语义（v3.1 已取消 minSize×0.9 降级，minSize 为硬下限）
5. 与 R1 的 Backlog 合并去重；实施后重渲染 qwen4-preview 全片，验证：无黑帧尾巴 /
   CTA 到最后一帧 / 圆不遮挡 / s9 完整 / media-overlay 补出 action+context
6. **media 依赖型布局校验（四轮 review 修正）**：采用 §3.5 的**阶段化门控**——
   preflight WARN/pending → Step 1.5c 后硬 FAIL（旧稿"直接将 WARN 升为 FAIL"会阻断
   自动 sourcing，已废弃）。且门控必须抽成**共享 final-media gate**：
   main.mjs 在 sourcing 后调用、render-only.mjs 在渲染前调用
   （后者无 sourcing 阶段，见 `render-only.mjs` Step 2/2.5/3 均无 sourcing）；
   s9 补素材或改 `stacked-cards`，重渲染后中部无空洞

## 6. 复现/验证用命令

```bash
# 黑帧确认
cd scripts/short-video/output/qwen4-preview
for t in 62.0 62.5 63.5 64.5; do
  ffmpeg -v error -ss $t -i qwen4-preview-v2026-08-29T12-23-09-short.mp4 -frames:v 1 -y /tmp/tail-$t.png
done

# 各场景抽帧（时间戳对应视觉起点/30）
# s1:1.0 3.0 | s5:28.0 | s6:33.0 | s7:38.0 42.0 | s8:46.0 | s9:54.0 | s10:57.0 60.0
```

## Suggested Skills

`short-video-pipeline`（管线流程）、`remotion-markup`（Remotion API 正确用法）、
`impeccable`（视觉：圆的视觉张力 / 文本层次）、`brand-system`（品牌一致性）、
`writing-for-agents`（改本目录文档时）。
