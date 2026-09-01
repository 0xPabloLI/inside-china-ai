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
- [x] bigNumber 焦点数字契约：`wrapPolicy none`、`maxLines 1`、Hook `preferredSize 240`、`minSize 180`
- [x] 缩字优先级 `context → action → company → result`；`fitCandidates()` 在 `minSize` 处终止（无 ×0.9）
- [x] HTML 模板→slot 映射按 `visualType` 建立，每个模板声明 slot ID 全集
- [x] 全屏媒体的动态 source 文本纳入契约（第 10 个动态来源）
- [x] 契约校验单测：16 passed（schema、默认值继承、优先级顺序、映射完整性、缩字阶梯）
- [ ] （后续 ticket）`stacked-cards` 等尚未测量的布局补 `MEASURED_MAX_WIDTH` —— T9 改 s9 布局时补

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
- [x] 未识别字段、`rendered` 字段缺失 → FAIL（#32/#37 渲染层测试）
- [x] `mediaOptOut` 不被当作文本省略标记（字段注册中为 control 类，契约测试覆盖）
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

## T6 — HTML 路径管线化 + F8

**Blocked by:** T2, T4

**What to build:** HTML 渲染路径不再假绿：模板只产出 raw，随后在 Chromium 中
materialize/fit、注入字号、写 final HTML；验证器与录制器消费同一个 final 文件；
失败抛结构化 `TextFitError` 并终止管线（**不用 `cancelRender()`**）。

- [ ] `generateScene` 只产出 raw HTML（不再承担测量）
- [ ] Chromium materialize：`fonts.ready` + settled 后执行 Fit/Assert
- [ ] Fit 结果以内联 style 注入并写入 final HTML
- [ ] 验证器改为**只读 final 文件**（删除重新生成的逻辑）；final 缺失 → FAIL
- [ ] 录制器 `page.goto` 同一个 final 文件
- [ ] HTML 失败抛结构化 `TextFitError`（与 Remotion 错误结构一致）并终止管线
- [ ] **F8**：Fit 未落盘 → 红；Fit 内联落盘 + 单一产物 → 绿
- [ ] 存量 HTML 内容包渲染冒烟（至少 1 个）

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

## T9 — media-overlay 补齐字段 + s9 布局修正

**Blocked by:** T2, T5

**What to build:** media-overlay 场景把丢失的主张句与上下文补回画面，
s9 不再出现中部空洞；补齐后的垂直空间由契约与缩字优先级兜底。

- [ ] MediaOverlay 顶部补 action、底部补 context
- [ ] 补齐后垂直空间重新标定 `media-overlay.*` 各 slot 的 `maxHeight`
- [ ] 多字段总高超限时按 `context → action → company → result` 缩字，触底再等比，仍超失败
- [x] s9 数据改为 `stacked-cards` + `mediaOptOut: true`（T7 提交，632a96a）
- [ ] **Remotion 的 stacked-cards 视觉待修**：改布局后 gate 放行、渲染成功，但 53s 抽帧显示
      s9 仍透出 s8 的媒体图（qwen-throughput 曲线）——Remotion 的 stacked-cards 分支没有清空
      媒体背景。**数据层已正确，视觉层未完**；本 ticket 要保证 CSS-only 布局确实不显示任何 media
- [ ] 补测 `stacked-cards` 各 slot 的 `MEASURED_MAX_WIDTH`（T2 遗留）
- [ ] s9 左缘裁切现象纳入契约观察（ink-bound 落地后复测；当前不作为已确认根因）
- [ ] s6/s8/s9 重渲染：action/context 上屏，中部无空洞，不违反垂直契约

---

## T10 — 剩余 fixture（F4/F6/F7/F9）+ ink 集成 + 圆标注修复

**Blocked by:** T4, T5

**What to build:** 把四个高价值回归样本固化为确定性 fixture，并让 Hook 的大圆
不再压住其他文字：`box="inside"` + 字号 240，由 F7 自动验收碰撞阈值。

- [ ] **F4**：文字合法但标注 SVG stroke 越界 → Assert FAIL（scroll 合法）
- [ ] **F6**：真实 media-split 布局 + `"1/9 THE TRAINING COST"` @52px（确定性文案写死）→ FAIL
- [ ] **F7**：Hook settled frame，圆与 subject / numberLabel **各自**重叠 ≤ 2%（不合并分母），
      被标注目标不计入；记录实际 ratio；碰撞失败即 FAIL（不偷偷缩字）
- [ ] **F9**：ink 四方向外溢检出，覆盖 italic f/T、letter-spacing、混合 span、多行；
      旧的错误公式必须让本 fixture 变红
- [ ] Hook 圆改为 `box="inside"` + 字号 240
- [ ] 圆修复后 bigNumber 自身完整可读（不越安全区、不被压字）

---

## T11 — 端到端重渲染 + 存量清单 + 文档 + 归档

**Blocked by:** T1, T3, T5, T6, T7, T8, T9, T10

**What to build:** qwen4-preview 全片重渲染通过全部验收项；存量内容包批量校验出清单；
文档同步；spec/tickets/review 归档。

- [ ] qwen4 全片重渲染：s9 完整且无空洞、s6/8/9 action+context 上屏、
      无黑帧尾巴、CTA 到最后一帧、圆不压字、逐场景帧审计零裁切
- [ ] 存量 15 个生产内容包批量校验，输出 FAIL 清单（仅清单，不改文案）
- [ ] `docs/content-pipeline.md`：预算降为提示级 + 新增几何验证门槛条目
- [ ] `docs/brand-system.md` / `docs/video-workflow.md` 同步契约引用
- [ ] spec / tickets / review 归档到 `docs/archive/`，更新 `docs/archive/README.md`
- [ ] 关联 issue #141 收尾
