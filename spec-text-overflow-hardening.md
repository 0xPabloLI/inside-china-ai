# Spec: 短视频文本溢出（截断）根治 + 时间轴对齐

> Status: Ready for Agent ｜ Created: 2026-08-30
> 前置：Proposal v3.3（`docs/handoffs/handoff-text-overflow-fix-proposal.md`，已通过方向）、
> R2 诊断（`docs/handoffs/handoff-qwen4-preview-r2-visual-audit.md`）
> 范围：**管线优先修复**（保证以后不再发生），qwen4-preview 随之重渲染。

---

## Problem Statement

视频里被 `overflow:hidden` 静默裁掉的文字，直到成片人工审阅才被发现。qwen4-preview
Scene 9 的 "THAT'S THE WHOLE POINT" 被切掉尾字母 T：字符预算 PASS、Pre-render
60 PASS / 0 FAIL、成品帧检查 69 PASS / 0 FAIL、单测 48/48 PASS、时间轴单测 12/12 PASS——
**没有任何一层测量过真实几何或真实视觉时间轴**，全链路假绿。

同一根因还有两个已确认的后果：结尾 3s 黑帧（CTA 视觉 62.1s 结束，成片 65.1s）、
音画累积漂移 3s（音频用 `Σ` 坐标、视觉用 `Σ−10i` 坐标）。

用户要的是：**以后不再发生**，而不是再修一次这个视频。

---

## Solution

把"宽度判定"从估算改为**测量**：

- 每个动态文本声明一个 **slot 契约**（可用宽高、字号首选值/硬下限、行数、换行策略、
  标注策略、settled frame），Remotion 组件、HTML 模板、创作提示、验证器四处共同消费
- 渲染时 **Fit 层**按真实几何选字号（触底即 `cancelRender`），**Assert 层**在稳定帧
  用统一坐标校验文本与标注绘制（含字形 ink 外溢），任一失败即终止渲染
- HTML 路径改为 `raw → Chromium materialize/fit → 注入字号 → final`，
  验证器与录制器消费**同一个 final 文件**
- 时间轴采用 **A2**：非末幕 `clipFrames + TRANSITION_FRAMES`，视觉起点回到 `Σ clipFrames`，
  黑帧与音画漂移同时消失，音频/字幕/`Root` 零改动

---

## User Stories

1. As 视频作者，我希望超长文案在渲染前就得到提示，以便我在写 scene-data 时就避开
2. As 视频作者，我希望即使文案偏长，渲染也能自动缩到可读并保留全部文字，而不是切掉尾巴
3. As 视频作者，我希望文案实在太长时管线**明确失败**并告诉我哪个 slot 放不下，
   而不是给我一个看不清的成片
4. As 视频作者，我希望 `highlight` 标什么就高亮什么（哪怕关键词在 action 里），
   而不是渲染器忽略它去框整个 result
5. As 视频作者，我希望 media 依赖型布局缺素材时被拦住，且不会因为我还没跑自动搜图就先失败
6. As 视频作者，我希望 `render-only` 重渲染时也走同样的媒体校验，而不是绕过
7. As 视频作者，我希望 HTML 渲染路径和 Remotion 路径有一致的保护，而不是只有一条路径安全
8. As 视频作者，我希望改了文案/字号后，回归测试能自动告诉我有没有裁切，不靠肉眼审片
9. As 观众，我希望视频结尾是 CTA 而不是黑屏 + 还在跑的字幕
10. As 观众，我希望语音与画面对齐，而不是声音比画面晚 3 秒
11. As 观众，我希望斜体/特殊字形的边缘不被切掉（ink overhang）
12. As 观众，我希望 Hook 的数字圆圈不压住其他文字
13. As 维护者，我希望几何判定只有一份实现，Remotion 与 HTML 共享，不会各自漂移
14. As 维护者，我希望每个 slot 有唯一 ID 并在 DOM 上可寻址，以便自动校验
15. As 维护者，我希望 scene-data 里出现拼错/未识别的字段时直接 FAIL，而不是被静默忽略
16. As 维护者，我希望 fixture 覆盖历史事故形态且不依赖内容包现状（s5 已改布局）
17. As 维护者，我希望 Remotion 依赖版本锁定一致，避免 4.0.508 / 4.0.517 混用
18. As 维护者，我希望时间轴验证测的是真实视觉起止，而不是拿同一个函数的数字自比

---

## Implementation Decisions

1. **Slot 契约单一真源**：新增 `lib/text-slots.mjs`，声明 `container / maxWidth /
maxHeight / preferredSize / minSize / maxLines / lineHeight / fontFamily /
fontWeight / letterSpacing / wrapPolicy / annotationPolicy / settledFrame /
required / shrinkPriority`。契约值覆盖 10 个动态文本来源（9 个场景模板 +
   `FullscreenMedia` 的 `media.source`）。
2. **minSize 是硬下限**：任何阶段（含多字段等比缩）不得低于 `minSize`；
   触底仍放不下 → 失败。取消此前"×0.9 降级"的写法。
3. **注册协议**：每个动态文本节点带 `data-text-slot`（数组/卡片用索引：
   `card[0].value`）+ `data-text-field`；每个 `visualType + layout` 声明字段四分类
   （`rendered` / `control` / `optional` / `intentionallyOmitted`）；未识别字段 FAIL；
   **`mediaOptOut` 只控制媒体，不算文本省略**。
4. **Fit / Assert 双层**：
   - Fit：字体加载完成 + 标注 Tracker 挂载后，按无 transform 的文本布局测双轴；
     溢出则在 `preferredSize → minSize` 间降字号；触底 → 失败
   - Assert：settled frame 上，把 slot / 文本 / 标注 SVG 统一到 composition 坐标
     （`getBBox()` → `getScreenCTM()` 四角变换 + `useCurrentScale()` 校正），
     文本 AABB 与标注绘制 AABB 的并集四边必须落在 slot content box 内；
     随机偏移已烘焙进 SVG path `d`，**只另加 stroke paint margin**
   - 入场窗口（frame < settledFrame）**逐帧**校验不越 SAFE_ZONES（StampIn 为 2× 起缩）
5. **ink-bound 采用 A（Canvas）**：四方向分别计算，禁用单一对称 inkPad；
   每个渲染行、每个不同样式 text run 单独测量；ctx 同步 `font` / `letterSpacing` /
   `fontKerning` / `fontStretch`。**B（像素回归）只作差分辅助**
   （关闭裁切的诊断帧 vs 正常帧），不作阻断 gate——`overflow:hidden` 已删除越界像素，
   单独使用只会重复假绿。
6. **bigNumber 纳入 Fit**，使用独立焦点数字契约：`wrapPolicy: none`、`maxLines: 1`、
   Hook `preferredSize: 240`、硬下限 `180`；顺序固定为 **Fit 数字 → 生成 Circle →
   F7 碰撞 Assert**；碰撞失败即 FAIL，不偷偷继续缩字。
7. **圆标注碰撞阈值**：**每个文字元素分别** ≤ 2%（subject 与 numberLabel 分开计算、
   不合并分母），被标注目标本身不计入；记录实际 ratio。普遍 < 0.5% 可收紧至 1%；
   2–3% 假阳性时改几何算法而非放宽门槛。
8. **`highlight` 改为结构化 `{ field, text }`**：渲染器对 `text` 做子串切分并只包裹
   该子串；`text` 必须是 `field` 所指字段文本的子串，否则 FAIL。
   存量 17 处迁移（qwen4 7 / doubao 9 / light-society 1；light-society 改写为
   `{field:"quote", text:"4M beliefs"}`）。
9. **HTML 路径管线化**：`generateScene` 只产出 raw HTML；随后在 Chromium 中
   materialize + Fit（等 `fonts.ready` 与 settled）→ 注入字号 → 写 final HTML；
   **验证器与录制器都 `page.goto(final)`**。verifier 删除重新 `generateScene` 的逻辑。
10. **失败语义分路径**：HTML 路径抛结构化 `TextFitError`（sceneId / slotId / field /
    measured vs available / fontSize / inkPad）并终止管线；**只有 Remotion 用
    `cancelRender()`**。两者输出同一结构的机器可读错误。
11. **HTML 模板 → slot 映射按 `visualType`**（HTML renderer 不消费 `scene.layout`）；
    每个模板函数声明它渲染的 slot ID 全集。HTML 支持 `media-split` 需先实现布局等价性（本期不做）。
12. **时间轴 A2**：非末幕 `visualDuration = clipFrames + TRANSITION_FRAMES`，
    末幕不变；每幕视觉起点回到 `Σ clipFrames`，总时长仍 1953 帧，
    CTA 视觉 1784→1953 与总时长一致。引入**共享 schedule** 驱动 `ShortVideo`、`Root`、
    字幕、音频、帧抽样。
13. **共享 final-media gate**：`lib/final-media-gate.mjs`，main 在 Step 1.5 sourcing
    **之后**调用、`render-only` 在渲染**之前**调用；preflight 阶段只报 pending/WARN。
14. **字符预算降级为 WARN**：从契约推导（不再是手写锚点），仅作创作提示，
    不放行不阻断；最终判定只认真实几何。
15. **Remotion 版本统一到 4.0.517**（`upgrade --version` + `remotion add`，
    移除 `^` 精确锁定）；评估 `@remotion/layout-utils` 仅作 Fit 层候选字号选择器。
16. **s9 改 `stacked-cards`**（配合门控，重渲染后中部无空洞）。
17. **fitOrder 与缩字优先级写死在契约**：多字段总高超限时按
    `context → action → company → result` 逐个缩到 `minSize`，再等比，仍超则失败。

---

## Testing Decisions

**什么算好测试**：只测外部可观察行为（渲染成功/失败、错误结构、帧上是否完整、
字号是否 ≥ 下限），不测内部实现细节（不测私有函数名、不测中间变量）。

**被测模块**：slot 契约与注册协议、Fit/Assert gate（含 ink-bound 与坐标变换）、
HTML final 产物链路、final-media gate、共享 schedule、highlight 子串切分。

**回归主断言 = 确定性 fixture（F1–F9）**，每个用固定输入 + Remotion still 渲染，
不依赖内容包现状；HTML 路径的 F8 走 Playwright。

**既有先验**：`__tests__/remotion-timeline.test.mjs`（需重写：当前断言恒真）、
`scene-rules.test.mjs`、`frame-analysis.test.mjs`。

**必须包含的反证**：F1 要求"旧 gate 绿 / 新 gate 红"，F9 要求"错误公式的 fixture
变红"——每个新 gate 都必须先证明它能抓住真实事故。

---

## Out of Scope

- **字体打包**（跨机渲染确定性）——独立 backlog，触发条件：渲染离开本机
- **HTML 布局等价性**（让 HTML 支持 `media-split` 等 Remotion 布局变体）
- **逐行标注 / 替换 rough-notation 标注结构**
- **逐行标注所需的多行高亮**
- **存量 15 个内容包的批量文案修复**——只出决策清单，不在本 spec 内改文案
- **圆标注的视觉重新设计**（仅做 `box="inside"` + 字号 240 + F7 自动验收）

---

## Further Notes

- 期刊式教训（已写入 Proposal §11）：方案文档先 commit 再大改；CLI 帮助看完整输出；
  文件盘点用 `find` 递归；样式关键字连字符与驼峰都要匹配。
- 2% 阈值与 240/180 字号为初值，F7/F9 跑出实测 ratio 后在实施中微调（不放宽门槛的前提下）。
- Remotion 与 HTML 的 Assert **共享同一实现**，避免两套判定漂移。

---

## T4 Implementation Refinement（2026-08-31 grill 固化，全部经用户确认）

范围仅限 T4（#145）；不推翻上文任何决策，是其实施层细化。

**架构决策（Round 1）**

18. T4 验证载体 = **独立 fixture 入口**（自己的 `registerRoot`，不碰 `Root.tsx`）；
    vitest 用 `@remotion/renderer.renderStill` + `@remotion/bundler`（均已在 remotion 工作区）
    程序化驱动。F1/F3 fixture（T10）复用同一载体。
    **实施精化（2026-08-31）**：vitest 的 node 环境无法解析 remotion 工作区的
    node_modules，程序化 `renderStill` 不可行；改为 `execFileSync("npx remotion still")`
    CLI 驱动——同样是真实 Chromium 渲染，FAIL 场景断言进程退出码 + stderr 首行
    `[TextFitError] {JSON}` 解析出的完整错误结构，行为等价。
19. DOM/字体相关测试分两层：纯几何（坐标变换、ink 公式、阶梯、错误结构）在
    vitest node 环境用 mock 输入；真实字体/布局行为（font ready、标注挂载、scroll/client）
    在 fixture composition 里由 renderStill 的真实 Chromium 验证。不引入第二套浏览器基建。
20. 多字段缩字编排（决策 17）在 T4 以纯函数 `fitGroup()` 落地 + 单测（消费 T2 的
    `shrinkOrder`）；T5 只负责在场景组件里调用。
21. `useCurrentScale()` 基于元素自身测量实现：`getBoundingClientRect().width /
offsetWidth`（含所有祖先 transform，不依赖 Remotion 内部 API），Studio 预览与
    headless render 下都正确。
22. ink-bound A 公式拆为纯函数：输入「已同步样式的 ctx + text run」，输出四方向外溢。
    反证测试（italic `f`：旧公式 `-actualLeft` 漏报 vs 新公式 `max(0, actualLeft)` 抓住）
    用假 ctx 在 vitest 完成，真实字体行为在 Chromium 层再验。
23. 标注栈事实修正：标注由 `@remotion/rough-notation`（4.0.517，内部 Tracker +
    ResizeObserver，progress 驱动）提供 —— Fit 必须等标注 SVG 挂载后再测。
24. API 事实核验（本地源码）：`cancelRender` 由 `remotion` 导出；`@remotion/renderer`
    导出 `renderStill`/`selectComposition`；`useVideoConfig` 存在于 4.0.517。
25. vitest 环境为 node（vitest.config.ts）—— DOM 类测试必须走 renderStill 层。
26. 工作区已有依赖：`@remotion/layout-utils`（决策 15 的候选字号选择器，本票不必用）。
27. **Modified Files Impact 终审**：T4 不改 `Root.tsx`；`lib/text-slots.mjs` 预计零修改；
    全部为新建文件 + 新测试。对生产路径零回归面（风险敞口推迟到 T5 接线）。

**失败语义与契约（Round 2）**

28. 单一错误类 `TextFitError`（放纯几何模块）：机器可读结构 `{ reason?, sceneId,
slotId, field, measured: {width, height}, available: {width, height}, fontSize,
inkPad: {left, right, top, bottom} }`；`inkPad` 是四方向对象，与 ink-bound 分别计算对齐。
    Remotion 侧 `cancelRender(new TextFitError(...))` 传播到 `renderStill` 调用方；
    HTML 路径（T6）直接 throw 同一类型。
29. Fit 溢出判定 = 布局溢出 **并集** `inkOverhangs > 0`（字形外溢）。
    **实施精化（2026-08-31）**：布局溢出不用 `scrollWidth/Height > clientWidth/Height`
    判定——wrapper 的 scroll 指标把绝对定位的标注 SVG 也算进去，会让 Fit 在标注尚未
    归属 Assert 职责时误判失败。改为 Range 几何（`textExtentLocal`）：TreeWalker 遍历
    文本节点 → `range.getClientRects()` 并集 → ÷ (gate rect.width / offsetWidth) 归一到
    local 空间，只测文本、不测标注。
30. 字体超时：`Promise.race(document.fonts.ready, timeout)`，默认 10 000ms 且可注入；
    超时 → `TextFitError`（`reason: "font-timeout"`），不静默回退字体度量。
31. T4 对下游的 API 表面：纯层（`inkOverhangs`、坐标变换、`boxWithin`、`fitGroup`、
    `TextFitError`）+ 运行时层（`TextGate` 组件 —— 时序编排集中在它一处，T5 逐文本容器套用）。
    **实施精化（2026-08-31）**：不用 `useCurrentScale()` —— `useVideoConfig` 只存在于
    Player 上下文，Composition 渲染（remotion still / 成片）中调用会 throw。scale 一律用
    元素自身 `getBoundingClientRect().width / offsetWidth` 比率恢复，入场变换在该比率中自动抵消。
32. 浮点容差统一 `EPS = 0.5px`：`measured ≤ available + EPS` 判为放得下；Assert 越界 ≤
    0.5px 判为合法；常量单测锁定。
33. 确认项：空值字段跳过几何校验不误报（场景 #28）；ink 四方向单独计算，禁单一对称 inkPad。

**状态转换与执行环境（Round 3）**

34. 入场窗口真·逐帧校验：`frame < settledFrame` 每帧校验不越 SAFE_ZONES；
    `frame ≥ settledFrame` 校验不越 slot content box + 标注并集。不抽样。
35. FAIL 时机：Fit 触底在 `fonts.ready` 后立即 `cancelRender`（不等 settled）；
    Assert 类失败在对应帧就地 `cancelRender`。集成测试断言渲染失败且错误结构完整。
    **实施精化（2026-08-31）**：配合决策 18 精化，集成测试断言的是 `remotion still`
    进程非零退出 + stderr 携带完整 TextFitError JSON（等价于 renderStill reject）。
36. fixture composition 为 props 驱动，单 composition 覆盖六种形态：PASS 基线 / 固定字号绕过
    Fit → FAIL（F1 形态）/ Fit 降字号 → PASS（F2 形态）/ minSize 触底 → FAIL（F3 形态）/
    标注 stroke 越界 → FAIL（F4 形态）/ 字体超时 → FAIL。F9 ink 反证留在 vitest 纯层。
37. 集成测试设宽松 `testTimeout`（bundle + 单 still 约 10–30s），与既有渲染类测试一致。
38. 行为场景补充（并入 Section 2 的 T4 专属行）：
    - B1 坐标变换：`getBBox` 四角 × `getScreenCTM` ÷ scale = composition 坐标（含 scale≠1 用例）
    - B2 标注挂载前测量 → 得到不完整几何；挂载后测量才进 Fit/Assert
    - B3 stroke paint margin 只加一次：标注 `d` 已含随机偏移，Assert 不再叠随机量，只加 `strokeWidth/2`

---

## T5 Implementation Refinement（2026-09-01 grill 固化，全部经用户确认）

范围仅限 T5（#146）；不推翻上文任何决策，是其实施层细化。
用户总原则（覆盖全章）：**不做向后兼容、不保护存量管线产物与已发布内容；
只保证未来生成内容的管线正确**（决策 39）。

**架构边界（Round 1）**

39. 无向后兼容约束：存量内容包视觉变化、渲染 FAIL 均不保护、不迁移、不批量跑；
    契约可以放心做 single source of truth，模板向契约收敛。
40. 契约对齐方向：**现实迁就契约**（与决策 39 配套）。模板字段全量注册进契约，
    字号按决策 46 收敛；不做“契约迁就现实”的保视觉方案。
41. 字段四分类归属：`badge / vs / verified`（边框 pill 短文本）归 **rendered** 并注册
    契约（它们也会溢出）；`color / subjectLogo / *Highlight / brandHighlight /
numberHighlight / mediaOptOut` 归 **control**（控制渲染行为，不做几何校验）；
    `stats[].num/unit/label` 是渲染文本 → rendered。`mediaOptOut` 不是文本省略标记（同决策 3）。
42. 数组字段 slot ID 命名：单字符串数组直接 `field[index]`（`left[0] / right[0] /
points[0]`）；`stats[]` 子字段扁平为独立字段名（新增 `statNum / statUnit`，已有
    `statLabel`），ID 形如 `hook.hero-center.statNum[0]`。`parseSlotId` 语法不变。
43. 缺失宽度测量：一次性测量脚本（`remotion still` + page evaluate 读各容器元素
    `clientWidth`）实测后回填 `MEASURED_MAX_WIDTH`，脚本落盘复用；绝不从 padding 推算（T2 教训）。
44. 垂直总高/容器裁切捕获：场景文本容器挂 `data-text-container`；TextGate settled 时
    额外断言 gate drawn rect ⊆ 最近容器祖先 rect，越界 `cancelRender("container-overflow")`。
    容器不做 Fit，只做 Assert。
45. 未知 `visualType`：ShortVideo dispatch 直接 **throw**，取消 `console.warn` + 回退。
46. 字号收敛取值（三类）：
    - 焦点数字统一：`bigNumber / stat` 语义同族，统一 `240/180`——Hook 现渲染 300、
      StatReveal 220、DataScene 180 全部收敛到 240；
    - 已有契约的常规字段：模板收敛到契约值（`quote 36`、`title 48`、`context 24`、
      `source 20`、Hook `source 26→20` 等）；
    - 新注册字段（`badge/label/subtext/detail/statLabel/subtitle/note/vs/verified/points` 等）：
      `preferred` 取模板当前字号，`minSize = round(0.72 × preferred)`。

**失败语义与接口契约（Round 2）**

47. 存量内容包策略：不迁移、不批量跑、不保证；qwen4-preview 也可弃。
    冒烟对象 = 未来内容：专用 smoke 内容包（`content/_gate-smoke/` 性质）+ fixture 渲染。
48. F1/F2/F3 fixture 数据：s9 原始事故文案（`result: "THAT'S THE WHOLE POINT"` 等，
    git `eb48293` 原文）**写死进 fixture**（确定性、不依赖内容包状态，与场景 #6 口径一致）。
49. TextGate API 扩展：新增可选 `checkContainer?: boolean`（默认 true）——settled 时向上找
    最近 `[data-text-container]` 祖先，断言包含关系；找不到容器祖先则跳过（兼容 fixture）。
    `data-text-slot / data-text-field` 由 TextGate 自动输出，模板无需手写。
50. 字段四分类声明载体：`text-slots.mjs` 新增 `REMOTION_SLOT_MAP`——按 `visualType + layout`
    声明 `rendered / control / optional / intentionallyOmitted` 四个列表，与 `HTML_SLOT_MAP`
    并列；契约单测断言：每个 `rendered` 字段必须有 `SLOT_FIELDS` 条目 + `MEASURED_MAX_WIDTH`
    实测宽度，否则抛错。这是“未识别字段”判定的唯一权威来源。
51. “未识别字段 FAIL”的判定位置：**只在渲染层**（`TextGate → getSlot` 抛错 → `cancelRender`
    机器可读）——不新增数据层第二判定点，避免双重标准。
52. 测试载体：
    - 契约单测扩展 `text-slots.test.mjs`（`REMOTION_SLOT_MAP` 完整性、四分类齐全、
      收敛后默认字号锁定）；
    - 运行时层新建 `scene-gate-fixture.tsx`（独立 `registerRoot`，不碰 Root.tsx）：
      9 模板各一个 PASS 基线 + F1（s9 原文案 + 固定 56 → FAIL）+ F2（同文案 + Fit → PASS）+
      F3（超长 → `fit-bottom`）+ 未注册字段 → FAIL + `container-overflow` → FAIL；
      沿用 T4 的 `execFileSync("npx remotion still")` CLI 驱动（决策 18 精化）。
53. `stacked-cards`：T5 只接入 gate（带索引 `card[0]/card[1]` slot），**不**修它的媒体背景
    透出问题，该项留在 T9（#150）。

**Ticket E 冒烟驱动修正（Round 3，2026-09-01 落盘）**

54. 决策 41/42 修正——hook `stats[]` 不扫平为 `statNum/statUnit`：num+unit 共享
    nowrap 行，宽度竞争无法分别 gate → 整卡单 gate（`hook.hero-center.statCard[i]`，
    200px 实测）。`REMOTION_SLOT_MAP` 中 `stats` 归 control、`statCard` 归 optional
    （gate 输出）；DataScene 的 `statLabel` 经 `FIELD_ALIASES`（statLabel→label）
    走既有 `label` slot，不新增字段。
55. 决策 52 载体修正——`container-overflow` 回归场景落在 T4 的 `text-gate-fixture.tsx`
    （overflow + late-entrance 场景）而非 `scene-gate-fixture.tsx`；覆盖等价。
56. 断言语义变更（修订 Modified Files Impact 表中“只加不改既有路径”约束）：
    Ticket E 全管线冒烟暴露 6 类失败，迫使：(a) 入场窗口断言从 drawn rect 改为
    transform-free 布局盒（StampIn 收缩尾段、场景转场横移、入场位移均收敛 identity，
    drawn 必假阳性）；(b) settled 容器断言同改布局盒（SlideUp 在 settledFrame 后仍在运动）；
    (c) annotation 容忍 `ANNOTATION_OVERDRAW=64px`（rough-notation 椭圆族实测超绘 48-91px，
    场景 #4 的容器内检出相应放宽，slot 内 text⊆断言不受影响）；(d) T4 `entrance-breach`
    测试改写为布局语义违规。T4 其余测试仍作回归哨兵保持全绿；新增 `late-entrance`
    测试锁定 (b)。

---

# Scenario & Risk Verification

## Section 1: Modified Files Impact

| 文件                                                                                 | 修改内容                                                                                     | 风险                                                                     | 评估                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/short-video/remotion/src/ShortVideo.tsx`                                    | 非末幕序列时长 +`TRANSITION_FRAMES`；接入共享 schedule                                       | **High**（视频管线核心，黑帧/漂移的根源）                                | 改动仅 1 处时长计算 + offset 来源；由 F1–F9 + 重渲染冒烟（无黑帧、CTA 到最后一帧、音画对齐）验证。最坏后果：成片时长/对齐错误 → 帧审计与末帧检查会 FAIL 拦截 |
| `scripts/short-video/remotion/src/Root.tsx`                                          | `calculateMetadata` 改用共享 schedule                                                        | Medium                                                                   | A2 下总时长不变（仍 1953），回归风险低；由时间轴测试锁定                                                                                                     |
| `scripts/short-video/lib/timeline.mjs`                                               | 新增共享 schedule（视觉/音频/字幕/帧抽样同源）                                               | **High**（多消费者：ShortVideo、Root、cues.mjs、verify-remotion-frames） | 保持现有 `sceneTimeline()` 语义不变，新增导出；Playwright 路径传 overlap=0 行为不变。最坏后果：字幕偏移 → 现有 sync 校验（tolerance 0.08s）会 FAIL           |
| `scripts/short-video/remotion/src/scenes/*.tsx`（9 个）                              | 接入 Fit/Assert + `data-text-*` 注册                                                         | Medium                                                                   | 逐模板接入 + 逐模板帧审计；FullscreenMedia 一并接入                                                                                                          |
| `scripts/short-video/remotion/src/scenes/NarrativeScene.tsx`                         | MediaOverlay 补 action/context；highlight 子串切分                                           | Medium                                                                   | 补字段改变垂直空间 → 由 slot `maxHeight` 与缩字优先级兜底（F5/总高用例）                                                                                     |
| `scripts/short-video/lib/scene-templates.mjs`                                        | 字号/容器取契约值；模板声明 slot ID 全集                                                     | Medium                                                                   | 影响 15 个生产内容包外观；逐包批量校验出清单后再改                                                                                                           |
| `scripts/short-video/lib/verify-scene-dom.mjs`                                       | 删除重新 `generateScene`，改为只读 final HTML                                                | Medium                                                                   | 之前验的是"另一份 HTML"，改后可能暴露历史隐藏问题 → 正收益；由 F8 验证                                                                                       |
| `scripts/short-video/main.mjs`                                                       | Step 1.5 后调用 final-media gate；HTML 走新管线                                              | **High**（主流程）                                                       | 门控阶段化后 preflight 不再阻断 sourcing；最坏后果：缺素材视频渲染出空洞 → gate 在渲染前 FAIL 拦截                                                           |
| `scripts/short-video/render-only.mjs`                                                | 渲染前调用同一 gate                                                                          | Medium                                                                   | 无 sourcing 阶段，直接按文件存在性判定                                                                                                                       |
| `scripts/short-video/lib/scene-rules.mjs`                                            | 预算降为 WARN + 推导；highlight 子串校验；缺媒体 pending                                     | Medium                                                                   | 门槛放松（FAIL→WARN）是有意的：真实判定交给几何层；由 F1 反证                                                                                                |
| `scripts/short-video/__tests__/remotion-timeline.test.mjs`                           | 重写（当前断言恒真）                                                                         | Low                                                                      | 纯测试文件                                                                                                                                                   |
| `content/qwen4-preview/scene-data.mjs`                                               | s9 改 `stacked-cards`；highlight 结构化                                                      | Low                                                                      | 内容包；重渲染冒烟验证                                                                                                                                       |
| `content/{doubao-work,light-society,qwen4-preview}/scene-data.mjs`                   | highlight 17 处迁移                                                                          | Low                                                                      | 迁移脚本 + 子串校验全通过才算完成                                                                                                                            |
| `scripts/short-video/verify-video.mjs` / `verify-remotion-frames.mjs`                | 接入共享 schedule；末帧检查；纯背景尾帧 FAIL                                                 | Medium                                                                   | 新增判定可能让历史成片变红 → 正是目的；先跑存量清单                                                                                                          |
| `scripts/short-video/lib/text-slots.mjs`（T5）                                       | SLOT_FIELDS 扩展（新字段 + 焦点数字统一 240/180）+ `REMOTION_SLOT_MAP` 四分类 + 实测宽度回填 | **High**（多消费者契约：Remotion/HTML/verifier/预算）                    | 决策 39 豁免存量视觉影响；渲染层 `getSlot` 抛错拦截未注册字段；契约单测锁完整性                                                                              |
| `scripts/short-video/remotion/src/scenes/*.tsx`（9 个）+ `FullscreenMedia.tsx`（T5） | 逐字段套 `TextGate` + 字号收敛契约值 + 容器挂 `data-text-container`                          | **High**（视觉变化，决策 39 豁免）                                       | 逐模板接入 + `scene-gate-fixture` 9 基线；T4 既有 8 测试兼回归哨兵                                                                                           |
| `scripts/short-video/remotion/src/components/text-gate.tsx`（T5）                    | 新增 `checkContainer` 容器断言                                                               | Medium（改 T4 核心组件）                                                 | 新 reason `container-overflow`；冒烟后断言语义有变更，见决策 56；T4 测试 + T5 新用例双向锁定                                                                 |
| `scripts/short-video/remotion/src/ShortVideo.tsx`（T5）                              | 未知 `visualType` 回退改 throw                                                               | Low                                                                      | 决策 45；无合法内容依赖回退路径                                                                                                                              |
| `scripts/short-video/remotion/src/scene-gate-fixture.tsx`（T5 新建）                 | 独立 `registerRoot` fixture：9 基线 + F1/F2/F3 + 未注册字段 + 容器越界                       | Low                                                                      | 测试载体，不进生产入口                                                                                                                                       |
| `scripts/short-video/measure-slot-widths.mjs`（T5 新建）                             | 一次性测量脚本：still + evaluate 读 `clientWidth` 回填宽度                                   | Low                                                                      | 工具脚本；决策 43                                                                                                                                            |
| `scripts/short-video/content/_gate-smoke/`（T5 新建）                                | 专用 smoke 内容包（未来内容冒烟载体）                                                        | Low                                                                      | 决策 47；`render-only` + 帧检查跑绿即冒烟通过                                                                                                                |

## Section 2: Behavioral Scenarios

| #   | Scenario                                                                           | Expected Behavior                                            | Risk                          | Mitigation                                 |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------- | ------------------------------------------ |
| 1   | s9 原始文案 + 固定 56px，绕过 Fit                                                  | 新 Assert gate FAIL（旧 gate PASS）                          | Gate 抓不住真实事故           | F1 强制反证                                |
| 2   | 同文案 + Fit 启用                                                                  | PASS，字号 ≥ `minSize`，帧上无裁切                           | 缩字后仍裁                    | F2 + 帧审计                                |
| 3   | 超长文案（minSize 也放不下）                                                       | 失败 + 机器可读错误，非静默非硬裁                            | 悄悄缩到不可读                | F3                                         |
| 4   | 文字合法但标注 SVG stroke 越 slot 边界                                             | Assert FAIL（scroll 指标合法）                               | 只测布局盒漏检                | F4                                         |
| 5   | scene-data 含未识别字段 / `rendered` 字段缺失                                      | 注册协议 FAIL                                                | 拼错字段被静默忽略            | F5                                         |
| 6   | media-split 形态 + `"1/9 THE TRAINING COST"` @52px（Remotion 真实 NarrativeScene） | Assert FAIL                                                  | 历史形态无法复现              | F6 写死确定性文案                          |
| 7   | Hook settled frame：`box="inside"` + 240px 圆                                      | 圆与 subject / numberLabel 各自重叠 ≤ 2%，ratio 被记录       | 圆压字                        | F7                                         |
| 8   | HTML 路径：Fit 未落盘                                                              | verifier FAIL（旧实现会绿）                                  | 验证产物 ≠ 录制产物           | F8                                         |
| 9   | HTML 路径：Fit 内联落盘                                                            | verifier PASS，recorder 消费同一 final 文件                  | 两产物漂移                    | F8                                         |
| 10  | Times italic `f` / `T`、`letter-spacing`、混合 span、多行                          | ink-bound 检出四方向外溢；旧错误公式 fixture 变红            | 字形墨迹外溢漏检              | F9                                         |
| 11  | `minSize` 触底后多字段总高仍超 `maxHeight`                                         | 失败，**不**突破 minSize（无 ×0.9）                          | 偷偷缩到不可读                | 单测 + F3                                  |
| 12  | 多字段组合：`context → action → company → result` 缩字                             | 按优先级缩到各自 minSize，再等比，仍超则失败                 | 缩错字段                      | 契约单测                                   |
| 13  | 入场动画中（StampIn 2× 起缩）                                                      | 逐帧校验不越 SAFE_ZONES；settled 后不越 slot content box     | 入场瞬间压到 UI 区            | 逐帧采样断言                               |
| 14  | `highlight.text` 非 `field` 文本子串（如 light-society 原值）                      | FAIL，提示改写                                               | 校验渲染器忽略的字符串        | 17 处迁移后全量校验                        |
| 15  | `highlight` 指向 action（qwen4 s6）                                                | 只高亮 action 内的 "LOOKS UP"                                | 框错字段                      | 子串切分单测                               |
| 16  | 标注字段（任意 field）                                                             | `maxLines: 1`、单行缩放                                      | 多行与 `white-space:pre` 冲突 | 契约单测                                   |
| 17  | preflight 阶段缺媒体（可 sourcing 修复）                                           | pending/WARN，**不阻断**                                     | 阻断自动搜图                  | gate 阶段化                                |
| 18  | Step 1.5c 后仍缺媒体（media 依赖型布局）                                           | 硬 FAIL                                                      | 渲染出空洞                    | gate 单测                                  |
| 19  | `mediaOptOut=true` + `media-overlay`                                               | 立即 FAIL（逻辑矛盾）                                        | 布局依赖 media 却声明不用     | gate 单测                                  |
| 20  | `mediaOptOut=true` + `stacked-cards`                                               | PASS，无 WARN                                                | 误报                          | gate 单测                                  |
| 21  | `render-only.mjs` 重渲染（无 sourcing）                                            | 渲染前调用同一 gate，缺媒体即 FAIL                           | 绕过校验                      | gate 单测                                  |
| 22  | 时间轴 A2 后成片                                                                   | 无黑帧尾；CTA 视觉到最后一帧；音画偏差 0                     | 时长/对齐回归                 | 末帧检查 + 帧抽样                          |
| 23  | 末幕是 CTA 且总时长 = `Σ clipFrames`                                               | CTA 视觉 1784→1953                                           | 尾部黑帧                      | 末帧检查 FAIL 纯背景                       |
| 24  | 字体加载超时 / 未 ready 就测量                                                     | Fit 等待 `document.fonts.ready`，超时 → 失败                 | 用错字体度量                  | 超时路径单测                               |
| 25  | final HTML 文件缺失                                                                | verifier FAIL（不允许自行重新生成）                          | 验了内存里的另一份            | F8                                         |
| 26  | Remotion 版本不一致（4.0.508 / 4.0.517 混用）                                      | 锁 4.0.517，`npx remotion versions` 校验通过                 | 依赖漂移                      | CI/本地校验                                |
| 27  | CI/无头环境字体缺失                                                                | Fit 走字体加载超时路径并失败（而非静默用回退字体）           | CI 与本地结果不一致           | 超时路径单测 + 文档标注                    |
| 28  | 空值：`stats: []`、空字符串字段、无标注字段                                        | 跳过几何校验，不 FAIL                                        | 空值误报                      | 单测覆盖 `""` / `[]` / `undefined`         |
| 29  | T5 F1：s9 原始文案 + `media-overlay` + `lockFontSize: 56`（绕过 Fit）              | 新 gate FAIL（`fit-bottom`，measured > available）           | Gate 抓不住真实事故           | `scene-gate-fixture` F1（写死原文案）      |
| 30  | T5 F2：同文案 + Fit 启用                                                           | PASS，选定字号 ≥ `minSize`（40）                             | 缩字后仍裁                    | `scene-gate-fixture` F2                    |
| 31  | T5 F3：超长文案（`minSize` 也放不下）                                              | FAIL `fit-bottom` @ `minSize`，机器可读错误                  | 悄悄缩到不可读                | `scene-gate-fixture` F3                    |
| 32  | T5：scene-data 含未注册字段（拼错）                                                | 渲染层 FAIL，错误信息含字段名 + 注册指引                     | 拼错字段静默渲染              | `getSlot` 抛错 → `cancelRender`（F5 形态） |
| 33  | T5：字段垂直总高超容器（被 `overflow:hidden` 裁）                                  | FAIL `container-overflow`（非假绿）                          | 容器裁切漏检                  | `data-text-container` 断言                 |
| 34  | T5：空值 `""` / `[]` / `undefined` 字段                                            | 跳过几何校验，不误报                                         | 空值误报                      | 契约单测 + fixture 空值场景                |
| 35  | T5：9 模板 + fullscreen 契约字号 + 合法文案                                        | 全部 PASS 基线（逐模板可寻址 `data-text-*`）                 | 接入破坏合法渲染              | `scene-gate-fixture` 9 基线                |
| 36  | T5：数组字段 `left[0]` / `points[0]` / `statCard[0]`                               | 索引 slot 独立可寻址 + 各自 gate（statCard 整卡，见决策 54） | 重复文本漏检                  | 契约单测 + fixture 数组场景                |
| 37  | T5：未知 `visualType`                                                              | dispatch 直接 throw（无静默回退）                            | 未识别模板静默降级            | 单测断言抛错                               |
| 38  | T5：`mediaOptOut: true` + 合法文本字段                                             | 文本照常校验，不因 `mediaOptOut` 误判省略                    | 媒体开关被误读为文本省略      | 契约单测（同 #20 口径）                    |
