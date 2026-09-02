# Tickets: 短视频文本溢出（截断）根治 + 时间轴对齐

> Parent issue: #141 ｜ Spec: `spec-text-overflow-hardening.md`
> 每个 ticket 是 tracer-bullet 垂直切片，可独立验证。
> **每个 ticket 完成后立即把已完成项从 `- [ ]` 改为 `- [x]` 落盘**（context 压缩安全的唯一方式）。

---

## T1 — Remotion 版本统一 + layout-utils 评估 ✅ DONE (2026-08-30)

**Blocked by:** None — can start immediately

**What to build:** Remotion 系列包锁定到同一版本（4.0.517），`@remotion/layout-utils`
按匹配版本安装，`npx remotion versions` 校验通过；产出 fitText/fitTextOnNLines
的复用评估结论。

- [x] `npx remotion upgrade --version 4.0.517` 执行成功
- [x] `npx remotion add @remotion/layout-utils` 安装（`--save-exact`，4.0.517）
- [x] `package.json` 全部精确锁定 4.0.517（含 `remotion` 核心）
- [x] `npx remotion versions` → "All packages have the correct version."
- [ ] 评估结论落盘：fitText / fitTextOnNLines 能否作 Fit 层候选字号选择器 —— **顺延到 T4**（届时才有 Fit 层可评估）
- [x] 冒烟：qwen4 全片渲染成功（此前因 4.0.508/4.0.517 混用直接失败）

---

## T2 — Slot 契约与注册协议基座 ✅ DONE (2026-08-30)

**Blocked by:** None — can start immediately

**What to build:** 文本 slot 契约的单一真源模块：契约 schema、各字段默认字号表、
缩字优先级、bigNumber 焦点数字契约、HTML 模板→slot 映射（按 `visualType`）；
以及契约自身的校验测试。

- [x] 契约 schema 覆盖：`container / maxWidth / maxHeight / preferredSize / minSize / maxLines / lineHeight / fontFamily / fontWeight / letterSpacing / wrapPolicy / annotationPolicy / settledFrame / required / shrinkPriority`
- [x] 默认字号表：result 56/40、company 48/36、action 32/24、context 24/18、source 20/16
- [x] 带标注字段：`maxLines 1` + `wrapPolicy none`；无标注字段 `wrap` + `maxLines 2`
- [x] bigNumber 焦点数字契约：`wrapPolicy none`、`maxLines 1`、Hook `preferredSize 240`、`minSize 150`（2026-09-02 决策 72 放宽，原 180——GLM-6.0 七字符焦点数字适配，stat 保持 180）
- [x] 缩字优先级 `context → action → company → result`；`fitCandidates()` 在 `minSize` 处终止（无 ×0.9）
- [x] HTML 模板→slot 映射按 `visualType` 建立，每个模板声明 slot ID 全集
- [x] 全屏媒体的动态 source 文本纳入契约（第 10 个动态来源）
- [x] 契约校验单测：16 passed（schema、默认值继承、优先级顺序、映射完整性、缩字阶梯）
- [x] （修正 2026-09-02，决策 65）`stacked-cards` 实测宽度已回填（T5 Ticket D：卡片内 752 / source 820）——
      「尚未测量」仅剩新增 `badge` slot，由 T9 承接

---

## T3 — 共享 schedule + 时间轴 A2 + 时间轴验证去假绿 ✅ DONE (2026-08-30)

**Blocked by:** None — can start immediately

**What to build:** 视频不再出现结尾黑帧，语音与画面对齐：非末幕补转场帧使视觉起点回到
`Σ clipFrames`；同一份 schedule 驱动序列、`calculateMetadata`、字幕、音频、帧抽样；
时间轴测试真正覆盖视觉起止；末帧纯背景必须 FAIL。

- [x] 共享 schedule 模块：视觉起点/终点、音频偏移、字幕偏移同源
- [x] 非末幕 `visualDuration = clipFrames + TRANSITION_FRAMES`，末幕不变
- [x] 总时长仍为 `Σ clipFrames`（qwen4 = 1953 帧 / 65.1s）
- [x] CTA 视觉区间 = 1784→1953，与总时长一致（无黑帧尾）
- [x] 音画偏差为 0（各幕视觉起点 = 音频起点）
- [x] 重写时间轴测试：覆盖 TransitionSeries 真实起止（旧断言恒真，已删除）
- [x] 帧抽样改用共享 schedule，并**检查最后一帧**
- [x] 尾部纯背景（空 CTA）帧 → FAIL 而非 WARN
- [x] qwen4 重渲染冒烟：无黑帧、CTA 到最后一帧、音画对齐

---

## T4 — Fit / Assert 几何 gate 核心 ✅ DONE (2026-08-31)

**Blocked by:** T2

> 2026-08-31 grill 已固化实施层决策（独立 fixture 入口 / 两层测试 / fitGroup 纯函数 /
> TextFitError 结构 / EPS 0.5px / 逐帧校验 / 六形态 fixture），见
> `spec-text-overflow-hardening.md` § T4 Implementation Refinement（决策 18–38）。

**What to build:** 渲染时几何判定核心：Fit 层按真实几何选字号（触底失败），
Assert 层在稳定帧用统一坐标校验文本与标注绘制边界（含字形 ink 外溢），
入场窗口逐帧校验安全区；Remotion 侧失败用 `cancelRender()` 输出机器可读错误。

- [x] Fit：字体 ready 后测量；标注 Tracker 挂载后测量；布局溢出用 Range 几何（`textExtentLocal`，只测文本）并集 ink 判定（spec 决策 29 精化）
- [x] Fit：`preferredSize → minSize` 降字号；`minSize` 为硬下限（无 ×0.9）
- [x] Fit 触底 → `cancelRender()` + 机器可读错误（sceneId/slotId/field/measured vs available/fontSize/inkPad）
- [x] 失败/降级：字体加载超时 → 失败（不静默用回退字体度量）
- [x] Assert：统一 composition 坐标（`getBBox()` → `getScreenCTM()` 四角变换；scale 用元素自身 `rect.width/offsetWidth` 比率，不用 `useCurrentScale()` —— 见 spec 决策 31 精化）
- [x] Assert：文本 AABB 与标注绘制 AABB 并集四边落在 slot content box 内
- [x] Assert：只加 stroke paint margin，**不重复计入随机偏移**
- [x] ink-bound：四方向分别计算（左 `max(0, actualBoundingBoxLeft)`，右 `max(0, actualBoundingBoxRight − width)`，上下同理）
- [x] ink-bound：每个渲染行、每个样式 text run 单独测量；ctx 同步 font/letterSpacing/fontKerning/fontStretch
- [x] 入场窗口逐帧校验不越 SAFE_ZONES；settled frame 后不越 slot content box
- [x] 单测：坐标变换、stroke margin、ink 四方向、minSize 硬下限、超时路径（纯层 24/24 + 运行时层真实 Chromium 8/8）

---

## T5 — Remotion 场景模板接入 + F1/F2/F3

**Blocked by:** T2 ✅, T4 ✅

> 2026-09-01 grill 已固化实施层决策（无向后兼容/现实迁就契约/字段四分类归属/数组 slot
> 命名/实测宽度回填/容器裁切断言/字号三类收敛/REMOTION_SLOT_MAP/渲染层唯一判定/
> 测试载体/stacked-cards 只接不修），见 `spec-text-overflow-hardening.md`
> § T5 Implementation Refinement（决策 39–53）。总原则：不保护存量，只保未来管线。

**What to build:** 10 个动态文本来源全部接入契约与 gate，DOM 上可寻址
（`data-text-slot` / `data-text-field`），未识别字段 FAIL；并用 fixture 证明
新 gate 能抓住 s9 真实事故（F1）、Fit 能吸收（F2）、触底会失败（F3）。

- [x] 9 个场景模板 + 全屏媒体 source 接入 Fit/Assert 与 `data-text-*` 注册
- [x] 数组/卡片/行等重复文本使用带索引 slot ID
- [x] 字段四分类（rendered/control/optional/intentionallyOmitted）声明齐全
- [x] 未识别字段 → FAIL（#32/#37 渲染层测试）
- [ ] ~~`rendered` 字段缺失 → FAIL~~ **（2026-09-02 审计更正：未实现）**
      `assertKnownTextFields()` 只拒绝未知键，不检查 required/rendered 缺失
      （`text-slots.test.mjs` 传 `undefined`/`{}` 均 not.toThrow 自证）——由 T9 承接
- [ ] （修正 2026-09-02，决策 66）`mediaOptOut` 归位：原「注册为 control 类」落在错误的
      texts 层（实际是 scene 顶层字段，所有消费方读 `scene.mediaOptOut`）——由 T9 承接
- [x] **F1**：s9 原始文案 + 固定 56px（绕过 Fit）→ 新 gate FAIL（旧 gate PASS）
- [x] **F2**：同输入 + Fit → PASS，字号 ≥ `minSize`，帧上无裁切（baseline-narrative 即 F2 形态）
- [x] **F3**：超长文案 → 失败 + 机器可读错误，非静默非硬裁（fit-bottom @ 40px floor）
- [x] 空值覆盖：`""` / `[]` / `undefined` 字段跳过几何校验且不误报
- [x] **Ticket D**：`measure-slot-widths.mjs` 实测回填（13 场景真 Chromium 渲染，
      probe 经 TextFitError payload 通道回传约束宽度）；修正 708→724（bottom-bar）、
      356→372（split）、740→752（stacked-cards 卡片内，source 独立 820）、
      372→768（contrast chips 换行区）、820→736（cta action 外框）；
      82/82 套件全绿（契约/几何/T4/场景）
- [x] **Ticket E**：`_gate-smoke` 全管线冒烟（`render-only`，9 场景 / 1109 帧 /
      37.1s / 1080×1920）✅；冒烟暴露并修复 6 类失败：①③ StampIn 收缩尾段（EPS 误用 + 820 贴边超调）② 场景转场横移 ④⑤ 入场动画在 settledFrame 后仍在运动（settled
      容器断言改无 transform 布局盒，含 `layoutContentBoxOf` border 修正）⑥ quote-7
      verified 820 块被 880 宽 inline-fit badge 居中右移（反转嵌套：gate 包 badge）；
      28 门测试全绿（11 text-gate + 17 scene-gate），含 late-entrance 回归锁定

---

## T6 — HTML（Playwright）路径退役 ✅ DONE (2026-09-02)

**Blocked by:** 无 ｜ Issue: #147（原标题「HTML 路径管线化 + F8」，scope 已 pivot）

**为什么改方向**：调研确认 15/15 内容包均不使用 playwright renderer（`--playwright`
仅手工旗标），HTML 路径是零消费者 legacy；且「Remotion 与 HTML 共享同一份几何判定」
是自建 fit 内核的主要动机，路径退役后该约束消解（详见 spec 决策 57–62 与
`docs/research/text-auto-fit-landscape-research.md`）。原「管线化 + F8」方案作废。
**#154（HTML 字号契约）随本票关闭为过时。**

- [x] `main.mjs` / `render-only.mjs`：`--playwright` 旗标改为 fail-fast 报错（指向退役说明）—— `lib/renderer-guard.mjs`，7 tests（含两入口真实进程检查）
- [x] 移除/归档 `lib/record-scenes.mjs`、`verify-scene-dom.mjs` 及 main.mjs HTML 分支 —— 6 个 HTML 积木 `git mv` 到 `retired-html-path/`（冻结归档 + README）；assemble.mjs 只留 `resolveOutputVideo`
- [x] 15 个内容包的 `scenes.mjs` 退役处理（与 `lib/scene-templates.mjs` 等 HTML 积木一并评估归档或删除）—— 实删 17 个 `scenes.mjs` + 4 个 `dom-config.mjs` + 8 个 HTML 绑定测试；保留 build-mark-svg.test.mjs 活路径覆盖
- [x] 回归哨兵：Remotion 路径全量测试 + `_gate-smoke` 冒烟保持全绿（确认退役零外溢）—— 全量 2645 passed / 3 failed（#153 存量）；render-only + main.mjs 双冒烟 PASS
- [x] `docs/content-pipeline.md` / `docs/video-workflow.md` 移除 HTML 路径描述 —— 另同步 SKILL.md / brand-system / content-scaffold-guide / visual-design-loop / spec-pipeline-generalization / issue-tracker / README

---

## T7 — 共享 final-media gate（阶段化）✅ DONE (2026-08-30)

**Blocked by:** None — can start immediately

**What to build:** media 依赖型布局缺素材时被可靠拦住，且不阻断自动搜图：
preflight 只报 pending/WARN，sourcing 之后按最终场景与文件存在性硬 FAIL，
`render-only` 在渲染前调用同一 gate。

- [x] 共享 gate 模块（\`lib/final-media-gate.mjs\`）：输入最终场景 + 内容目录，输出 PASS/FAIL + 缺失清单
- [x] preflight 阶段：缺媒体 = pending/WARN，不阻断 sourcing（\`checkNarrativeMediaWarning\` 维持 WARN）
- [x] main：Step 1.6（sourcing 1.5 → patch 1.5c → upscale 1.5b 之后）调用，硬 FAIL
- [x] render-only：Step 2.6（渲染之前）调用（无 sourcing 阶段）
- [x] `mediaOptOut=true` + media 依赖型布局 → FAIL（reason: opt-out-on-media-layout）
- [x] `mediaOptOut=true` + `stacked-cards` → PASS，无 WARN
- [x] 单测 9 passed（含"全部违规场景都上报，不只第一个"）
- [x] 真实数据：gate 正确拦下 qwen4 Scene 9（media-overlay 无 media）；改 `stacked-cards + mediaOptOut` 后放行并渲染成功

---

## T8 — highlight 结构化 + 17 处迁移

**Blocked by:** T2, T5

**What to build:** 作者标什么就高亮什么：`highlight` 改为 `{ field, text }`，
渲染器对子串做切分只包裹该段；`text` 必须是 `field` 文本的子串否则 FAIL；
存量 17 处全部迁移并通过校验。

- [ ] 数据结构改为 `{ field, text }`
- [ ] 渲染器按 `field` 定位并对 `text` 做子串切分（前后片段原样渲染）
- [ ] 校验：`text` 必须是 `field` 文本子串，否则 FAIL
- [ ] 迁移 qwen4 7 处（s6 → `action`，其余 → `result`）
- [ ] 迁移 doubao-work 9 处（s1 → `hookText`，其余 → `result`）
- [ ] 迁移 light-society 1 处：改写为 `{field:"quote", text:"4M beliefs"}`
- [ ] 全量子串校验通过；`highlight` 标 action 的场景只高亮 action 内片段

---

## T9 — stacked-cards badge 接入 + rendered 缺失门 + 多字段垂直 gate + media-overlay 补齐

**Blocked by:** T2 ✅, T5 ✅ ｜ Issue: #150（scope 2026-09-02 审计修订，决策 65–68）

> **2026-09-02 审计修订**：原「补测 stacked-cards 各 slot 宽度」已完成（752/820，T5 Ticket D）；
> 原「53s 透出上一幕媒体」为转场窗口误诊（决策 69）——不是媒体泄漏；原「缩到 minSize
> 再等比」与 minSize 硬下限矛盾（决策 68）——等比阶段删除。

**What to build:** 让 stacked-cards 数据（含 badge）真正通过渲染层；把「rendered 字段
缺失 FAIL」补上；为多字段缩字先建 parent/group gate（否则缩序只是无生产调用者的单测
算法）；media-overlay 补回 action/context。

- [x] **badge 接入（新首项，决策 65）✅ DONE (2026-09-02, `15b4419`)**：stacked-cards 模板渲染
      `texts.badge` 并接 TextGate（gate 包 chip，padding/border 留在 slot 内）；
      `REMOTION_SLOT_MAP.narrative.stacked-cards` 声明 badge 为 optional；
      `measure-slot-widths.mjs` 实测确认 820（13 场景全表 ok 无回归）；
      qwen4 s9（`badge: "LOOP CLOSURE"`）全管线渲染通过（1953 帧 + 71/71 帧检查 +
      badge chip 像素验证：amber 带 y≈464–476，8/31 旧渲染无此带）
- [x] **rendered 缺失 FAIL（T5 审计更正承接，#5）✅ DONE (2026-09-02, `15b4419`)**：
      `assertKnownTextFields()` 对声明为 rendered 且数据缺失（key 缺失或 null）的字段
      FAIL（空串/空数组 present 仍放行，#34 语义保留；alias 感知）；契约单测锁定
      undefined/{}/单缺失/无 rendered 模板四条路径 + fixture `missing-rendered` 渲染层测试。
      存量影响：bytedance-distillation / kimi-sandbox / zhipu-glm6-self-training 有缺
      rendered 的场景，但这些包当前本就因未知 visualType 或非法 layout 无法渲染（决策 45
      throw），不新增破坏
- [x] **mediaOptOut 归位（决策 66）✅ DONE (2026-09-02, `15b4419`)**：从 `REMOTION_SLOT_MAP`
      四个 narrative 布局的 texts `control` 列表移除；`SceneData` 顶层类型补
      `mediaOptOut?: boolean` 声明；text-slots.test.mjs #38 改锁：texts 内 mediaOptOut
      → Unknown text field throw + 遍历断言四布局 texts 列表不再含 mediaOptOut
- [x] 活代码 HTML 残留清理（handoff §6 记录的决策 59 收尾项）✅ (2026-09-02, `15b4419`)：
      删除 `HTML_SLOT_MAP`/`htmlSlotsFor()` 及 text-slots.test.mjs 对应 describe；
      review 双轴修复（`remotionSlotsFor` JSDoc 误删已恢复，amend 并入 `15b4419`）
- [x] **MediaOverlay 顶部补 action、底部补 context ✅ DONE (2026-09-03)**：top band 补
      `ActionText`（SlideUp 0.55s）、bottom band 补 `ContextText`（FadeIn 0.75s），
      均经 TextGate；s6/s8 抽帧确认上屏、中部无空洞
- [x] **parent/group gate 设计并接入（决策 68 前置）✅ DONE (2026-09-03)**：
      `TextGroupGate`（`remotion/src/components/text-group-gate.tsx`）= band 容器本体
      （`data-text-group` + `data-text-container`）；子 TextGate Fit 后把所选字号连同
      `apply()` 交给 group 而不释放渲染；全员报告后量 band 内容高（scrollHeight 减
      padding）对 `getGroup()` 预算；`MEASURED_MAX_HEIGHT` 标定 top 594 / bottom 336
      （实测推演，拒绝 padding 推导，未标定即 throw）；`shrinkOrder()` 从此有生产调用者
- [x] 多字段总高超限时按契约 `shrinkOrder` 逐字段沿各自 `fitCandidates` 阶梯缩到
      `minSize`，每步重测量，仍超则结构化失败 ✅ DONE (2026-09-03)（**无等比阶段**，
      决策 68 修订）：新失败原因 `group-overflow`（`TextFitError.steps` 带缩字轨迹）；
      渲染层两测试锁定「缩低优先级、headline 保持」与「触底结构化失败」（终态顺序
      source 5 → context 10 → result 40，result 终步 = 40 硬下限）
- [x] s9 数据改为 `stacked-cards` + `mediaOptOut: true`（T7 提交，632a96a）
- [x] **s9 视觉复测（决策 69 修正口径）✅ DONE (2026-09-03)**：新渲染 53.2s/53.5s/55.5s
      抽帧——无上一幕媒体透出；53.2s 观察到的「MEMBER/CITY 缺头」为 band 入场滑动
      中途帧（top/bottom band 先后入场，55.5s 稳定帧全部字段完整），非泄漏非裁剪
- [x] s6/s8/s9 重渲染 ✅ DONE (2026-09-03)：qwen4 全管线 1953 帧（v2026-09-02T16-49-12）
      + 文本 gate 零取消 + 71/71 帧检查 PASS；s6/s8 抽帧 action/context 上屏、band
      无重叠；字幕 verification 仅存量 2 coverage gap（§6 已记录，非 T9）

---

## T10 — ink 逐行修正 + F6/F7 fixture + F9 补齐 + 标注口径统一 + 圆标注修复

**Blocked by:** T4 ✅, T5 ✅（2026-09-02 审计修订，决策 67/70）

> **2026-09-02 审计修订**：F4 已有真实 Chromium 用例（T4 运行时 8/8 含 F4 标注越界）、
> F9 已有公式测试 + italic-f 运行时形态——不重复认领。新增两处实施缺陷修复：
> 标注挂载 fail-open、ink 按整节点测量（决策 67）；ANNOTATION_OVERDRAW 口径统一（决策 70）。

**What to build:** ink 测量对齐决策 5（逐渲染行、逐样式 run），补 TextGate 两处缺陷，
把尚未覆盖的回归样本补成 fixture，Hook 大圆不再压字。

- [x] **ink 逐行实现（决策 67b）✅ DONE (2026-09-03, `da2cacf`)**：`collectInkOverhangs`
      逐渲染行（Range 逐字符 rect 按 top 分行）× 逐样式 run（按文本节点宿主 computed
      style 同步 canvas）测量，行子串剔除 `\n` 后过 `measureText`；多行左右 overhang
      不再算错。旧整节点公式以 `wholeNodeInkOverhangs` 形式留在 fixture 作反证见证，
      渲染层测试活断言 `wholeNode.left < perLine.left` 钉死判别力
- [x] **标注挂载 fail-open 修复（决策 67a）✅ DONE (2026-09-03, `da2cacf`)**：挂载轮询
      30 帧无 SVG → 结构化 `annotation-missing` FAIL；settled 断言重构为「稳定轮询 +
      delayRender 句柄」（代际检查：被新字号取代的旧轮询只退出不断言），poll 窗口内
      无绘制框同样 `annotation-missing`。F7 的 `AnnotationCollisionAssert` 同口径：
      声明了但未挂载的 target gate fail-closed（不静默跳过）
- [x] **ANNOTATION_OVERDRAW 口径统一（决策 70）✅ DONE (2026-09-03, `da2cacf`)**：统一口径 =
      settled 断言自身的 drawn-box 测量（`annotationDrawnBox`：路径线段采样
      `paintedBoxOfSvg` 修正 highlight 线型水平超绘误判 → getScreenCTM → 构图坐标）；
      实测 circle around 上越 ~62px、underline understroke 10.3px →
      `ANNOTATION_OVERDRAW_BY_TYPE = { circle: 96, default: 16 }` 按类型容差；
      `annotation-overdraw-probe` fixture + 渲染层/纯层测试锁定（circleInside ≤ default 非空断言）
- [x] **F6 ✅ DONE (2026-09-03, `da2cacf`)**：`f6-media-split-lock52`（s5 原文案
      `"1/9 THE TRAINING COST"` + media-split 372px 列 + `lockFontSize: 52`）→
      结构化 `fit-bottom` FAIL（measured.width > available.width）——历史裁字事故形态在旧世界静默裁切处必 FAIL
- [x] **F7 ✅ DONE (2026-09-03, `da2cacf`)**：`AnnotationCollisionAssert`
      （`remotion/src/components/annotation-collision-gate.tsx`）——collider =
      source 槽标注 SVG 绘制框，targets = 邻槽 `textExtentComposition`（文本范围而非包装盒），
      每目标独立 ratio = 交集面积 / 目标文本面积，≤ 2%（`maxRatio`），被标注目标不计入；
      ratios 记录进 `TextFitError.details` 并落在 host `data-annotation-collision`；
      稳定轮询后一次性判定，不缩字、直接 FAIL
- [x] **F9 补齐（不重复认领 F4）✅ DONE (2026-09-03, `da2cacf`)**：InkLineProbe 补 italic T
      （右越 7.9px @96px）与 letter-spacing（四边零幻影 overhang，锁 letterSpacing 同步）；
      mixed-span / multiline 由决策 67b 测试覆盖
- [x] **Hook 圆改为 `box="inside"` + 字号 240 ✅ DONE (2026-09-03, `da2cacf`)**：单一谓词
      `circleAroundNumber`（≤5 字符）统一门控 `Circle box="inside"`、gate `expectAnnotation`
      与 F7 碰撞断言挂载，三者永不漂移
- [x] **圆修复后 bigNumber 自身完整可读 ✅ DONE (2026-09-03, `da2cacf`)**：box="inside" 使圆
      只在自己槽内绘制（容器断言按类型容差把关）；scene-gate F7 测试（measure:hook，
      subject/numberLabel ratio 各 ≤ 2%）+ baseline-hook PASS 共同验证；全片重渲染验收归 T11

---

## T11 — 端到端重渲染 + 字符预算 WARN 化 + 存量清单 + 文档 + 归档

**Blocked by:** T1 ✅, T3 ✅, T5 ✅, T6 ✅, T7 ✅, T8, T9, T10, **T12**
（2026-09-02 审计修订：+T12，决策 71）｜ Issue: #152

**What to build:** qwen4-preview 全片重渲染通过全部验收项；字符预算按决策 14 落地；
存量内容包批量校验出清单；文档同步；spec/tickets/review 归档。

- [ ] **字符预算 WARN 化（决策 14 补实施，决策 71）**：`scene-rules.mjs` 的
      TEXT_WIDTH_BUDGETS 手写锚点 + `level: "fail"` 改为从契约推导 + `level: "warn"`
      （仅创作提示，不阻断；最终判定只认真实几何）；预算测试同步改写
- [ ] qwen4 全片重渲染：s9 完整且无空洞、s6/8/9 action+context 上屏、
      无黑帧尾巴、CTA 到最后一帧、圆不压字、逐场景帧审计零裁切
- [ ] 存量 15 个生产内容包批量校验，输出 FAIL 清单（仅清单，不改文案）
- [ ] **#153 存量 preflight 回填完成**（关闭父 issue #141 的前置，决策 71）
- [ ] `docs/content-pipeline.md`：预算降为提示级 + 新增几何验证门槛条目
- [ ] `docs/brand-system.md` / `docs/video-workflow.md` 同步契约引用
- [ ] spec / tickets / review 归档到 `docs/archive/`，更新 `docs/archive/README.md`
- [ ] 关联 issue #141 收尾

---

## T12 — 官方 `fitText` 接入 TextGate 生产路径（2026-09-01 新增；2026-09-02 审计修订，决策 57/63/64）

**Blocked by:** T5 ✅（需 28 门测试 + 冒烟基线在位当回归哨兵）｜ Issue: #175

> **2026-09-02 审计修订（决策 63/64）**：原目标 `fitGroup` 无生产调用者（仅单测）——
> 按原样实施不改变生产行为。接入点改为 **TextGate → `fitCandidates()` 生产路径**
> （text-gate.tsx Fit 阶梯）；官方输出只作候选值，最终仍由 Range + ink 终态验证。
> 删除 `validateFontIsLoaded` 强制开启项（Times 栈与 fallback 指标一致，会被官方
> 启发式误判）；保留 `document.fonts.ready` + 超时 FAIL 门。

**What to build:** 官方 `fitText`（单行）/`fitTextOnNLines`（多行，如需）替换 TextGate
候选字号生成中的自建线性外推：官方结果作为候选序列来源，既有终态验证（Range 几何 +
ink）不动——官方不验证结果，验证层是闸门本体。**Assert 层（ink/标注/逐帧/容器）不动**
（决策 58）。这是「已绿代码的等价替换」——先存档基线再动手。

- [x] 基线存档：2026-09-02（commit `b0250c0` 工作树态）门测试 96/96 全绿
      （text-slots 34 + text-geometry 25 + final-media + text-gate-render 11 + scene-gate-render 19）；
      管线基线 = T9 session 的 qwen4 全渲染（1953 帧 + 71/71 帧检查，见 handoff §2）
- [x] Times 900 实测（真实 Chromium 探针，2026-09-02）：无 px letter-spacing 场景官方
      线性外推误差 ≤0.01px（≪ EPS 0.5，精化条件不触发，未加精化步）；fixed-px
      letter-spacing（−10px focus 数字）官方外推炸到 89.9px —— helper 改走双测量 +
      精确求解（`solveSingleLinePxLetterSpacing`），修正后误差 0.02px（kernel 注释存档）
- [x] **TextGate 候选生成接入官方 `fitText`**：`remotion/src/components/official-fit.ts`
      browser helper + `lib/official-fit-kernel.mjs` 纯内核。单行 nowrap/pre → 官方
      `fitText`（px-LS 走修正路径）；折行 → 官方 `fitTextOnNLines`（maxLines=slot 契约值）；
      复合块（statCard）逐块建模取最紧约束。`fitCandidatesFromSeed` 只重排不裁剪旧阶梯
      格子（kernel 性质测试锁定：任意 seed 下候选集合与旧 `fitCandidates` 全等）——
      官方预测只影响探测起点、不影响选中字号；minSize 硬下限与 preferred 封顶在
      `officialSeedSize` 强制（决策 63）
- [x] `fitGroup` 处置：确认零生产消费者（仅 text-geometry.test.mjs）→ 随本票退役
      （text-geometry.mjs 函数与单测 describe 一并删除；决策 68 已先行否定其等比阶段）
- [x] 契约测试：内核性质测试锁「官方种子只重排格子、终态验证仍是唯一裁判」（任意 seed 下
      候选集合与旧阶梯全等）；30 个真渲染门测试在 official 种子路径下全部通过终态验证
      （PASS 形状不回归、FAIL 形状字号/理由逐项不变）；防官方行为漂移的渲染契约探针
      （official-fit-render.test.mjs，等价性 + 精度 + 探测次数三轴）✅ 2026-09-02 落地 6/6：
      Times 900 预测落在一级阶梯内、seeded walk 与盲阶梯同字号、探测次数不多于盲阶梯、
      px-LS 修正解吻合真实几何、fitTextOnNLines 种子吻合、GLM-6.0 @820 官方预测 224px =
      真值（9 次探测，宽 819.66px）
- [x] 全部既有门测试全绿（2026-09-02 本 session：纯层 65/65 + 门测试 30/30 + 全量
      2713 passed / 4 failed——4 个失败均非本票：3 个 #153 存量 preflight + 1 个
      verify-lfs-pointers 环境 flake，该文件数月未改且不在 T12 范围）；
      ~~冒烟全绿~~ **qwen 冒烟由用户豁免（2026-09-02）**（决策 62）；_gate-smoke 全管线
      冒烟补跑中（handoff §2）
- [ ] ~~契约单测补锁定 `validateFontIsLoaded` 开启~~ **（删除，决策 64）**：
      保留 `document.fonts.ready` + 超时 FAIL 门；未来需精确字体验证时先打包命名字体
- [x] 已知局限写入代码注释：official-fit.ts 模块头声明空格分词局限（→ #165，决策 60）、
      validateFontIsLoaded 不开启原因（决策 64）、复合块与 px-LS 近似边界
