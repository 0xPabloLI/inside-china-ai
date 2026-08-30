# Proposal v3.3: 短视频文本溢出（截断）的根治方案

> Created: 2026-08-30 ｜ v2 / v3 / v3.1 / v3.2 同日 ｜ **v3.3（五轮 review 后修订，
> 方向已通过，无需再完整 review —— 修完进入 Grill）**
> Review 轨迹：v1 Request changes → v2 → RC（二轮）→ v3 → RC（三轮）→ v3.1（自包含）
> → RC（四轮）→ v3.2 → **RC（五轮：两处技术错误 + 同步遗漏）→ v3.3（本文）**
> 二/三/四/五轮 review 原文存档：`docs/handoffs/review-text-overflow-fix-proposal-2026-08-30.md`
> **已拍板项**：时间轴 = **A2**；Remotion 统一到 **4.0.517**；s9 改 **stacked-cards**
> **Grill 只剩 3 项**：ink-bound A/B、bigNumber 纳入 Fit、2% 阈值（见 §9）
> 下一步：**Grill → Spec → Tickets → TDD 实施**（不直接进 to-spec）
> 关联：`docs/handoffs/handoff-qwen4-preview-r2-visual-audit.md`（R2；黑帧时间轴 A/A2、
> 缺媒体门控、圆标注碰撞阈值的权威真源）、`docs/brand-system.md`、spec #130
> 说明：本文件与 R2 均 untracked；v1/v2 内容已被后续版本原地覆盖不可恢复。
> **本文自包含**——所有最终决策完整写回，不引用不存在的中间版本。

---

## 1. 三轮 review 的本地核实结果

按 Proposal Self-Review 规则逐条对照本地源码/CLI 验证。

### 1.1 一轮（v1 → v2，全部成立）

| 断言 | 证据 |
|---|---|
| Highlight 用 `inline-block; white-space:pre`，不自然换行 | `rough-notation/dist/esm/index.mjs:2538-2554`（Tracker span） |
| Remotion 版本混用 4.0.508 / 4.0.517 | node_modules 实测 |
| 字体基线已显式 `'Times New Roman', Times, serif` | `lib/safe-zones.mjs:112`；`docs/brand-system.md:99-103` |
| v1 几何重复扣 padding（content 宽 756px 非 692px） | `NarrativeScene.tsx:260`；帧证据 x≈848 = 60+32+756 |
| HTML 路径不能延期 | 采纳 |

### 1.2 二轮（v2 → v3）

| 断言 | 核实 | 证据 |
|---|---|---|
| CTA 时间换算错误（1694 帧 = 56.47s；CTA+HOLD = 259 帧 = 8.63s） | ✅ 成立 | R2 §1 已修正 |
| 新时间轴方案 A2（非末幕 `clipFrames + TRANSITION_FRAMES`） | ✅ 重算成立 | R2 §1；Grill 定夺，初判 A2 |
| `remotion-timeline.test.mjs` 假绿 | ✅ 成立 | `__tests__/remotion-timeline.test.mjs:52-56` 断言恒真 |
| rough-notation SVG `overflow:visible`，绘制可越界 | ✅ 成立 | `rough-notation/dist/esm/index.mjs:2620` |
| `useCurrentScale()` 需用于校正 | ✅ API 存在 | `remotion/dist/esm/index.mjs:12112` |
| verify-video 仅在 `renderer === "remotion"` 时跑帧检查 | ✅ 成立 | `verify-video.mjs:394` |
| 回归样本不稳（s5 已改 stacked-cards） | ✅ 成立 | §6.8 fixture 方案 |

### 1.3 三轮（v3 → v3.1，含对我方上一轮两条错误反驳的纠正）

| 断言 | 核实 | 证据 / 修正 |
|---|---|---|
| **`remotion add` 存在**，正确流程是 `upgrade --version <target>` 后再 `remotion add <pkg>` | ✅ **成立——我方上一轮反驳错误** | `npx remotion --help` 完整输出含 `remotion add <package-name...>`（"Add Remotion packages with the correct version."），CLI dist 含 `add.js`。我方上一轮用 `head -40` 截断输出导致漏见，已纠正（§6.0） |
| **生产目录实为 15 个 `content/**/scenes.mjs`，14 个含 font-size/fontSize；renderer 声明 5 个正确** | ✅ **成立——我方上一轮数字错误** | 递归实测 `find content -name scenes.mjs` = 16（含 `_test-fixtures/hook-standard`，剔除后 15）；`grep -lE "font-size\|fontSize"` = 14。我方上一轮用深度 1 的 shell 循环（漏 `distillation/pt1-3`、`restraint/pt1,pt3`）且只 grep `fontSize`（漏 HTML 侧 `font-size`）。已纠正（§8） |
| 缺媒体 FAIL 放在 preflight 会阻断自动 sourcing（preflight 在 Step 1.5 之前） | ✅ 成立 | `main.mjs:114-131`（Step 0 调 `verify-video.mjs --pre`）早于 `main.mjs:155+`（Step 1.5 asset sourcing）；且 Step 1.5 注释明确 "Triggers asset-sourcer when … has media path pointing to a missing file" |
| F6 用 scene-templates 复现 media-split 不成立（HTML 模板无此布局） | ✅ 成立 | `grep -c "media-split" lib/scene-templates.mjs` = **0**；真实 420px media-split 在 `NarrativeScene.tsx:165-203`（`width: 420` / `maxWidth: 420-2*SPACING.xl = 372`）。F6 改为渲染真实 Remotion NarrativeScene（§6.8） |
| Assert 重复计算随机余量；需统一坐标系 | ✅ 成立 | 随机偏移已烘焙进最终 SVG path `d`，取实际 path bbox 后不应再加 `maxRandomnessOffset`；只另算 stroke paint margin（§6.2） |
| 圆标注碰撞需可计算阈值 + 排除被标注目标本身 | ✅ 成立 | 新增 F7（§6.8）；阈值定义见 §6.8 F7 与 R2 §2 |
| Proposal 必须自包含，不得写"v2 不变" | ✅ 成立 | 本文所有最终决策完整写回 |

### 1.4 四轮（v3.1 → v3.2）

| 断言 | 核实 | 证据 / 处置 |
|---|---|---|
| `minSize` 自相矛盾（§5/F2 要求 ≥ minSize，§6.1 允许 ×0.9） | ✅ 成立 | **取消 0.9 降级**，`minSize` 为硬下限（§6.1） |
| HTML 路径假绿：main 写 HTML，verifier 重新 `generateScene`，recorder 录落盘文件 | ✅ 成立 | `main.mjs:286-288`（generate + writeFileSync）、`verify-scene-dom.mjs:114-123`（重新 import + `generateScene(scene, 8)`，连 duration 都不同）、`lib/record-scenes.mjs:30`（`page.goto(file://${scene.htmlPath})`）。处置：Fit 内联落盘 + verifier/recorder 同一产物（§6.2） |
| DOM 几何 ≠ 文字 ink 边界（Times 斜体 T/f 可超 advance box 5–11px） | ✅ 采纳 | 新增 ink-bound / 像素回归机制（§6.2 第 7 条） |
| GDN+QSA 的 G 未测出左 overhang，R2 §3.2 负 bearing 根因不成立 | ✅ 采纳 | R2 §3.2 降为"待调查现象"（本次修） |
| Highlight 契约与实现/数据冲突（s6 的 "LOOKS UP" 在 action 不在 result） | ✅ 成立 | 定为**结构化 `{field, text}` 局部标注** + 渲染器真正实现子串切分 + 存量迁移表（§6.4） |
| final media gate 未覆盖 `render-only.mjs`（无 sourcing 阶段） | ✅ 成立 | `render-only.mjs` Step 2/2.5/3 确无 sourcing；抽共享 final-media gate（§6.9 / R2 §5c.6） |
| `FullscreenMedia.tsx` 渲染动态 `media.source`，未纳入契约 | ✅ 成立 | `FullscreenMedia.tsx:22,34`；纳入 slot 契约，动态文本来源 9 → 10（§6.1、§8） |
| StampIn 从 2× 缩放，transient SAFE_ZONES 保证需定义逐帧采样 | ✅ 成立 | `entrance.tsx:97-105` `scale [2,1]`；逐帧采样口径（§6.2 第 6 条） |
| F6 "历史长文案"不可恢复，应写死确定性 fixture 文案 | ✅ 成立 | F6 文案全文写死（§6.8） |

### 1.5 五轮（v3.2 → v3.3）

| 断言 | 核实 | 处置 |
|---|---|---|
| `generateScene()` 是同步字符串生成，无法等 `fonts.ready` / 测 DOM | ✅ 成立 | HTML Fit 改为 raw → Chromium materialize/fit → inject → final 五步管线；**HTML 抛 `TextFitError` 终止管线，只有 Remotion 用 `cancelRender()`**（§6.2） |
| ink-bound 公式符号写反（`-actualLeft` 漏掉左外溢） | ✅ 成立（实测 Times italic f `actualBoundingBoxLeft = 9.76px`，旧公式得 0） | 改为四方向分别计算：`left = max(0, actualBoundingBoxLeft)`；`right = max(0, actualBoundingBoxRight − width)`（§6.2 第 7 条） |
| 方案 B 无法捕获静默裁切（`overflow:hidden` 已删像素） | ✅ 成立 | B 降级为**差分**辅助（诊断帧 vs 正常帧），不作阻断 gate（§6.2、§9.2） |
| highlight 迁移实为 **17 处**而非 7 处 | ✅ 成立 | 复核：`grep -rn "highlight:" content/*/scene-data.mjs` → qwen4-preview 7 / doubao-work 9 / light-society 1 = 17。逐处字段归属已盘点，light-society `4M beliefs rewritten` 非 `quote` 子串 → 改写 `{field:"quote", text:"4M beliefs"}`（§6.4b 完整表） |
| 文档未体现"只剩三项"；标题/正文版本不一致；F8 后仍写 F1–F7 | ✅ 成立 | 全文同步（§9、§8、§10、标题） |
| 生产最宽 Hook 数字 `"+629%"` 在 240px 下约 687px | ⚠️ 采信（reviewer 实测，待 F7/F9 复核） | 记录于 §6.1 与 §9.2，作为"纳入 Fit 不伤视觉"的依据 |

---

## 2. 版本变更汇总

### 2.1 v3 → v3.1

| # | 变更 |
|---|---|
| 1 | **全文自包含**：布局契约、字号 floor、换行策略、HTML Fit 时机、预算降级、Highlight 策略、media-overlay 补字段——全部完整写回，无"v2 不变"引用 |
| 2 | **版本流程修正**：`upgrade --version <target>` + `remotion add @remotion/layout-utils`（§6.0） |
| 3 | **Assert 几何算法可执行化**：统一坐标系、`getBBox()`→`getScreenCTM()` 四角变换、不重复计随机余量、只加 stroke paint margin、settled frame 与 transient 越界策略（§6.2） |
| 4 | **F6 修正**为渲染真实 Remotion `NarrativeScene` media-split；**新增 F7** Hook 稳定帧圆标注碰撞（可计算阈值、排除被标注目标） |
| 5 | 影响面数字修正为 15 内容包 / 14 含字号（§8） |
| 6 | 缺媒体门控阶段化 → 单一真源在 **R2 §3.5**，本文只定义与 slot 契约的接口（§6.9） |

### 2.2 v3.1 → v3.2

| # | 变更 |
|---|---|
| 1 | **取消 `minSize × 0.9` 降级**，`minSize` 统一为硬下限，§5/F2/§6.1 三处口径一致 |
| 2 | **HTML 路径去假绿**：Fit 结果内联落盘 → verifier 与 recorder 消费同一产物；新增 HTML 回归 fixture **F8**；定义 HTML 模板 → slot 契约映射（按 `visualType`，因 HTML renderer 不消费 `scene.layout`） |
| 3 | **ink overhang 机制**：DOM 几何测不到字形墨迹外溢，补 ink-bound（`actualBoundingBox*`）或像素回归 |
| 4 | **transient 越界采样口径**：入场窗口逐帧计算 AABB，越 SAFE_ZONES 即 FAIL |
| 5 | **Highlight 定为结构化 `{field, text}` 局部标注** + 渲染器实现子串切分 + 存量 7 处迁移表 |
| 6 | **final-media gate 抽为共享函数**：main 在 sourcing 后调、render-only 在渲染前调 |
| 7 | **`FullscreenMedia` 的动态 `media.source` 纳入契约**；动态文本来源 9 → 10 |
| 8 | **F6 确定性文案写死**（不依赖不可恢复的历史产物） |

### 2.3 v3.2 → v3.3

| # | 变更 |
|---|---|
| 1 | **HTML Fit 时序重写**为可执行的 `generateScene(raw)` → Chromium materialize/fit → inject 字号 → 写 final HTML；verifier 与 recorder 都 `page.goto(final)`；HTML 抛 `TextFitError` 终止管线，**只有 Remotion 用 `cancelRender()`** |
| 2 | **ink-bound 公式符号修正**为四方向分别计算；B 降级为差分辅助；新增 **F9** |
| 3 | **highlight 迁移补全为 17 处**（qwen4 7 / doubao 9 / light-society 1），含 light-society 非子串改写 |
| 4 | 新增 **bigNumber 焦点数字契约**（240/180、Fit→Circle→F7 顺序、碰撞即 FAIL） |
| 5 | §7 删除"放弃 canvas measureText"旧结论，改为"DOM 管布局盒 + canvas 管 ink，互补" |
| 6 | 全文版本/F1–F9 编号同步；§9 收敛为**只剩 3 项 Grill 输入**，已拍板项单独列出 |

---

## 3. 问题定义

场景文本超出容器 content 区域时被 `overflow:hidden` 静默裁切；现有全部验证层
（字符预算 PASS / Pre-render 60 PASS / 帧检查 69 PASS / 单测 48 PASS /
时间轴单测 12 PASS）**没有一个测量过真实几何或真实视觉时间轴**——全链路假绿。

**实测锚点**（三处事故，几何数字以三轮 review 实测为准）：

| 案例 | 场景 | 实测 | 裁掉 |
|---|---|---|---|
| 1 | qwen4 v1, media-split（Remotion `NarrativeScene:165-203`，栏宽 420/maxWidth 372） | 长文案超出半栏 | 尾部 ~8 字符 |
| 2 | qwen4 final, media-overlay s9 | 文本 766.67px vs content **756px** → 溢出 **10.67px** | 尾字母 "T" |
| 3 | qwen4 final, media-overlay s6/s8/s9 | action/context 字段未渲染 | 每屏主张句 |

---

## 4. 根因（四条）

1. 溢出被 `overflow:hidden` 静默化，零失败信号；验证层全部不测真实几何
2. 修复方法论"打锚点"而非"建模型"
3. 宽度/时间决定变量分散在两套渲染实现，无共享契约
4. 字体问题已由衬线基准化（spec #130）排除；跨机确定性是独立议题（§6.6）

---

## 5. 设计目标（渲染成功契约）

每个文本 slot 声明式契约，渲染成功必须同时满足：

1. 字体与标注（rough-notation）均已稳定后测量（settled frame，§6.2）；
2. 文本**四边**位于 slot content 区域内；
3. `scrollWidth ≤ clientWidth` 且 `scrollHeight ≤ clientHeight`；
4. 行数 ≤ `maxLines`；
5. 多字段组合后的 slot 总高度 ≤ `maxHeight`；
6. 字号 ≥ `minSize`（**硬下限，任何阶段不得突破**；v3.1 曾允许等比阶段
   ×0.9，四轮 review 判定与 F2 冲突，已取消——见 §6.1）；
7. 所有声明字段已渲染，或按注册协议明确标记"有意不渲染"
   ——**`mediaOptOut` 只控制媒体，不属于本条**（§6.9 接口）。

任一失败 → `cancelRender()` + 机器可读错误，不允许 `overflow:hidden` 掩盖。

---

## 6. 方案（自包含定稿）

### 6.0 【前置 T0】版本统一 + layout-utils

1. 选定目标版本 X（当前 `remotion`/`transitions`/`media` = 4.0.508、`rough-notation` = 4.0.517）
2. `npx remotion upgrade --version X` —— 把 remotion 系列包统一到 X
3. `npx remotion add @remotion/layout-utils` —— 按 X 安装匹配版本（CLI 保证版本一致）
4. 移除 `package.json` 中 `^` 前缀精确锁定；`npx remotion versions` 校验

`fitText` / `fitTextOnNLines` 定位：**Fit 层的候选字号选择器**。
Assert 层（标注绘制边界、多字段组合、slot 总高）它不覆盖，自研 DOM gate。

### 6.1 【核心】Slot 布局契约 + 可执行注册协议

**契约字段**（`lib/text-slots.mjs`，single source of truth）：

| 字段 | 含义 | 示例（`media-overlay.result`） |
|---|---|---|
| `container` | 布局变体 × 字段 → 容器几何 | `"media-overlay.result"` |
| `maxWidth` | **content box** 宽度（不得重复扣 padding） | 756 |
| `maxHeight` | 该 slot 可占最大高度（参与多字段组合） | 220 |
| `preferredSize` / `minSize` | 字号首选值 / 下限 | 56 / 40 |
| `maxLines` / `lineHeight` | 行数上限 / 行高 | 1 / 1.1 |
| `fontFamily` / `fontWeight` / `letterSpacing` | 字体度量三要素 | `BRAND_FONT_STACK` / 900 / 0 |
| `wrapPolicy` | `"none"`（单行缩字）或 `"wrap"` | `"none"`（带标注字段强制） |
| `annotationPolicy` | 标注类型，决定是否参与 Assert 绘制边界 | `"highlight-box"` \| `"circle"` \| `"none"` |
| `settledFrame` | 该模板动画与标注完全稳定的帧号 | 40（见 §6.2） |
| `required` | 是否必渲染 | true |

**字段默认值表**（契约未显式声明时的兜底，避免逐模板硬编码）：

- result 56/40、company 48/36、action 32/24、context 24/18、source 20/16
- 带 `annotationPolicy != "none"` 的字段：`maxLines: 1`、`wrapPolicy: "none"`
- 无标注的 action/context：`wrapPolicy: "wrap"`、`maxLines: 2`

**注册协议（DOM ↔ 契约的可执行对应）**：

- 每个动态文本节点携带 `data-text-slot="<slotId>"` + `data-text-field="<field>"`
- 数组/卡片/行等重复文本用带索引的 slot ID：`stacked-cards.card[0].value`
- 每个 `visualType + layout` 声明字段四分类：

| 分类 | 含义 | 校验行为 |
|---|---|---|
| `rendered` | 必渲染 | 缺失 → FAIL |
| `control` | 控制渲染行为（如 `highlight`、`numberHighlight`） | 不参与几何校验，校验取值合法性 |
| `optional` | 有值才渲染 | 有值则渲染 + 过几何校验 |
| `intentionallyOmitted` | 明确不渲染（逐字段声明 + 理由） | 出现在 DOM → FAIL |

- scene-data 出现**未识别字段**（不在四分类内）→ FAIL
- `mediaOptOut` 是媒体控制开关，**不得**用作 `intentionallyOmitted` 的例子

**slot 总高超限的确定性策略**（多字段组合后）：

1. 按 `shrinkPriority` 由低到高缩字：`context(18) → action(24) → company(36) → result(40)`，
   每个字段缩到自身 `minSize` 为止，每次缩字后重测总高；
2. 全部触底仍超 `maxHeight` → 对全部字段**等比再缩**（下限 = 各自 `minSize`，
   **不设额外降级**）；
3. 等比后仍超 → **`cancelRender()`**。

⚠️ **minSize 语义统一**（四轮 review 修正）：`minSize` 是**硬下限**。
v3.1 曾写"等比阶段允许缩至 `minSize × 0.9`"——与 §5 第 6 条和 F2 断言冲突，
**已取消**。任何情况下字号不得低于 `minSize`；放不下即内容问题，走 `cancelRender`。
优先级顺序与等比规则写死在契约里，不允许实现层自由发挥。

**动态文本来源清单（四轮 review 补充）**：除 9 个场景模板的文本字段外，
`FullscreenMedia.tsx:22,34` 渲染的动态 `media.source`（"SOURCE: …" 标签）
**必须纳入 slot 契约与几何验证**。即动态文本来源共 **10 个**，不是 9 个。

**焦点数字（bigNumber）的独立契约**（Grill 输入 #2，推荐纳入 Fit）：

```js
slot: {
  container: "hook.focus-number",
  wrapPolicy: "none", maxLines: 1,
  preferredSize: 240, minSize: 180,     // Hook：300 → 240，硬下限 180
  annotationPolicy: "circle",
  fitOrder: "number-first",             // ① Fit 数字 → ② 再生成 Circle → ③ F7 碰撞 Assert
}
```

- **顺序固定**：先 Fit 数字字号，**再**生成 Circle 标注，**最后**执行 F7 碰撞 Assert
- **碰撞失败不得偷偷继续缩字**：应 FAIL，让布局参数（间距/字号）显式调整
- 可行性：生产最宽的 Hook 数字是 unitree 的 `"+629%"`；在 240px 下实测约 **687px**，
  可放入 820px 内容区 → 纳入 Fit **不会伤害现有视觉**

**HTML 路径对齐**：`scene-templates.mjs`（~15 个模板函数，独立 CSS 块）+
`scene-layout.mjs` 的字号/容器尺寸改为取契约值；存量内容包逐包盘点对齐（§8）。

### 6.2 【核心】Fit / Assert 双层几何验证

**Fit 层（选字号，无 transform 的文本布局）**

1. 字体加载完成（`document.fonts.ready`）后测量；
2. rough-notation 标注 Tracker 挂载后测量（`inline-block` 会改变布局）；
3. 测 `scrollWidth vs clientWidth`、`scrollHeight vs clientHeight` 双轴 + 行数；
4. 溢出 → 在 `preferredSize → minSize` 区间降字号重测，取能容纳的最大字号；
5. 触底仍溢出 → **`cancelRender()`** + 机器可读错误
   （sceneId / slotId / measured vs available / 当前字号 / floor）。
   `delayRender` 只管时序等待，**失败语义只由 `cancelRender` 承担**。

**Assert 层（终局 DOM gate，settled frame 执行）**

坐标系与算法（三轮 review 要求可执行化）：

1. **统一坐标系**：slot 容器、文本元素、标注 SVG 全部转换到**同一 composition 坐标**
   （1080×1920 的设计坐标，即 Remotion 的 `useVideoConfig()` 空间）。
   渲染时若存在 scale，用 `useCurrentScale()` 校正 `getBoundingClientRect()` 结果。
2. **SVG 绘制 bbox**：对 slot 内的每个 rough-notation SVG 元素
   - `el.getBBox()` 取本地坐标 bbox 四角
   - `el.getScreenCTM()` 把四角变换到屏幕坐标
   - 再经 `useCurrentScale()` 换算回 composition 坐标
   - 取四角变换后的**轴对齐外接矩形**（AABB）作为绘制 bbox
3. **不得重复计入随机余量**：rough-notation 的随机偏移（roughness /
   `maxRandomnessOffset`）已烘焙进最终 SVG path 的 `d`，path bbox 已包含它；
   **只额外加真实 stroke paint margin = `strokeWidth / 2`**
   （默认 `Circle`/`Highlight` 的 strokeWidth 见契约；斜接/圆角连接若产生额外外扩，
   按 `strokeWidth` 的 miter 上限计入，实现时取 `strokeWidth` 保守值）。
4. **四边判定**：文本 AABB 与标注绘制 AABB 的并集四边均需落在 slot content box 内；
   任一越界 → `cancelRender()`。
5. **settled frame**：每个模板在契约里声明 `settledFrame`——该帧上所有入场动画已完成、
   标注 `progress` 已到 1（rough-notation progress 由 `interpolate` 驱动，
   取插值区间的上界帧 + 1 作为稳定帧起点）。Assert 只在此帧及之后执行。
6. **transient 越界策略 + 逐帧采样口径**（四轮 review 要求可执行）：
   入场动画中（frame < settledFrame）允许元素暂时超出 slot content box
   （位移/缩放中间态；实测 `StampIn` = `scale [2,1]`（`entrance.tsx:97-105`）、
   `scaleIn` = `[0.7,1]`（`:81-89`）），**但不允许超出 SAFE_ZONES**
   （y∈[220,1150]、x∈[60,880]）——越安全区会被 TikTok UI 遮挡或侵入字幕道。
   **采样口径**：对每个文本/标注元素，从其动画起点帧到 settledFrame **逐帧**
   计算 AABB（不抽稀）；任一帧越 SAFE_ZONES 即 `cancelRender`。
   成本可接受：入场窗口通常 ≤ 45 帧。settled frame 后一律不得越 slot content box。
7. **ink overhang（字形墨迹外溢）**：`getBoundingClientRect()` / `Range` / scroll
   指标只覆盖 advance box，**测不到字形 ink overhang**（Times 斜体 T/f 可超出
   advance box 约 5–11px 而 scroll 仍合法）。

   **A. Canvas ink-bound（阻断 gate，Grill 输入 #1 推荐采纳）**——四方向分别计算，
   **不使用单一对称 inkPad**：

   ```js
   const m = ctx.measureText(text);
   // canvas 的 actualBoundingBoxLeft 是"对齐点向左"的距离，正值即左外溢
   leftOverhang   = Math.max(0, m.actualBoundingBoxLeft);
   rightOverhang  = Math.max(0, m.actualBoundingBoxRight - m.width);
   ascentOverhang = Math.max(0, m.actualBoundingBoxAscent - fontAscent);
   descentOverhang= Math.max(0, m.actualBoundingBoxDescent - fontDescent);
   ```
   ⚠️ v3.2 写的 `inkPad = max(0, actualRight − width, −actualLeft)` **符号写反**：
   `-actualLeft` 会把真实左外溢算成 0（实测 Times italic f 的
   `actualBoundingBoxLeft = 9.76px` → 旧公式得 0，漏检）。已按上式修正。

   测量粒度与上下文同步要求：
   - 每个**实际渲染行**单独测量；行内每个**不同样式的 text run**（span / 高亮子串 /
     不同字重）单独测量后取并集
   - `measureText` 前必须把 canvas ctx 的 `font`、`letterSpacing`、`fontKerning`、
     `fontStretch`、`fontVariantCaps`、`textRendering` 与被测元素**逐项同步**
     （不同步即等于用另一套字体度量）
   - 结果并入 §6.2 的 AABB（与 stroke paint margin 取并集）

   **B. 像素回归（仅辅助，不能当阻断 gate）**：`overflow:hidden` 会**删除**
   越界像素，因此"检测 slot 外侧是否有非背景像素"在裁切生效时反而会 PASS——
   与现有帧检查同一个假绿模式。B 只有在做**差分**时才有效：
   渲染"关闭裁切的诊断帧"与"正常帧"，比对两者差异区域是否落在 slot 之外。
   即便如此也只作抽样辅助，不阻断。

**HTML 路径：Fit 持久化 + 单一产物（四轮 review：现状是假绿）**

现状问题（已核实）：

- `main.mjs:286-288` 调 `generateScene(scene, tts.duration, …)` 并 `writeFileSync` 落盘
- `verify-scene-dom.mjs:114-123` **重新 import 并 `generateScene(scene, 8)`**——
  验证的是另一份内存 HTML，且 duration 与实际不同
- `lib/record-scenes.mjs:30` `page.goto(\`file://${scene.htmlPath}\`)` 录制落盘文件
  → **验证产物 ≠ 录制产物**，Fit 结果还可能根本没落盘

**HTML Fit 的可执行时序**（五轮 review 修正：`generateScene()` 是**同步字符串生成**，
不可能 `await document.fonts.ready` 或测 DOM——v3.2 的写法不可执行）：

```
generateScene(scene, duration)      // ① 同步生成 RAW HTML（含 slot 标记，字号为契约 preferredSize）
  ↓  writeFileSync(rawPath)         //    落盘 raw（仅调试产物，不用于录制）
Chromium materialize                // ② Playwright 打开 raw，等 fonts.ready + settled
  ↓  Fit（页面内测 DOM/ink，算字号）
  ↓  Assert（同上；失败 → 抛 TextFitError）
inject fitted font sizes            // ③ 把 Fit 结果以内联 style 注入 DOM
  ↓  writeFileSync(finalPath)       // ④ 写 FINAL HTML（唯一产物）
Verifier page.goto(finalPath)       // ⑤ 只读校验，不再 generateScene
Recorder page.goto(finalPath)       // ⑥ 录制同一 final 文件
```

1. **单一产物**：verifier 与 recorder **都 `page.goto()` 同一个 final 文件**；
   `verify-scene-dom.mjs` **删除重新 `generateScene` 的逻辑**（现状 `:114-123`
   用 `generateScene(scene, 8)` 生成另一份内存 HTML，连 duration 都不同）。
   final 文件不存在 → FAIL
2. **失败语义分路径**：
   - **HTML 路径** → 抛结构化 **`TextFitError`**（含 sceneId / slotId / field /
     measured vs available / fontSize / inkPad），由 `main.mjs` / `render-only.mjs`
     捕获并**终止管线**（`process.exit(1)`）
   - **Remotion 路径** → `cancelRender()`（Remotion 的渲染阻塞机制）
   - 两者都输出同一结构的机器可读错误；**只有 Remotion 用 `cancelRender()`**
3. **HTML 模板 → slot 契约映射**：qwen 的 HTML renderer **不消费 `scene.layout`**
   （`scene-layout.mjs` 只有 Slot 布局系统，无 layout 派发），因此映射按
   **`visualType`** 建立：`hookScene → hook.*`、`narrativeScene → narrative.default.*`、
   `statRevealScene → stat-reveal.*`、`ctaScene → cta.*`、`calloutScene → callout.*` …
   每个 HTML 模板函数声明它渲染的 slot ID 全集。若将来要让 HTML 支持
   `media-split` 等布局变体，**须先实现布局等价性**再补映射
4. Assert 在 settled 时刻（模板 `settledFrame` 换算为 ms）执行；
   Playwright 截图取 settled 帧

### 6.3 【降级】字符预算 → 内容创作提示（WARN）

`checkTextWidthBudget` **降级为 WARN、不再作为放行门槛**：

- 保留，但预算值**从契约推导**而非手写锚点：
  `budget(layout, field) = floor(contentWidth(layout) × 0.95 / charW(fontSize, fontWeight))`
  `charW` 由 calibration 脚本在 Remotion still 渲染里用探针串实测（衬线基准字体下）
- 定位：scene-data 创作阶段的早期提示，帮作者避开明显超长文案
- **不放行、不阻断**；最终判定只认 §6.2 的真实几何
- 理由：平均字宽原理性无法覆盖实际字形序列、字重、letter-spacing、CJK/emoji、
  长无空格 token、标注 padding、多行高度——s9 已证明它会假绿

### 6.4 Highlight 策略与换行策略

rough-notation Tracker 是 `inline-block + white-space:pre`
（源码 `:2538-2554`），**带标注文本无法自然换行**。定案：

- **任何带标注字段**强制单行缩放（字段由 `highlight.field` 决定，
  **不只是 result**——qwen4 s6 标的就是 `action`）：`wrapPolicy: "none"`、
  `maxLines: 1`，溢出走 Fit 缩字 → 触底 → `cancelRender`
- **无标注字段**（action/context/company/hookText 等）按契约 `wrapPolicy: "wrap"`、
  `maxLines: 2`，先换行（≤ maxLines 且总高 ≤ maxHeight）、仍溢出再缩字
- 逐行标注（每行一个 Highlight 实例）作为未来扩展记录在案，本期不做；
  替换标注结构（自绘 SVG）同样不做——两者都无现有内容需求

### 6.4b `highlight` 语义定案（四轮 review：不得校验渲染器忽略的字符串）

**冲突现状**：`NarrativeScene.tsx:64-67` 只把 `txt.highlight` 当 truthy，
实际框住**整个 result**；v3 契约却要求它是 `result` 的子串——
**qwen Scene 6 实测违反**：`highlight = "LOOKS UP"` 位于 `action`
（"3 LAYERS REMEMBER, 1 LAYER LOOKS UP"），不在 result（"MICRO-BLOCK PRECISION"）中。

**选定：结构化局部标注 `{ field, text }`**

- scene-data 改为 `highlight: { field: "action", text: "LOOKS UP" }`
- 渲染器按 `field` 定位字段文本，对 `text` **做子串切分并只包裹该子串**
  （前/后片段原样渲染，兼容 `white-space:pre`）
- 校验规则：`highlight.text` **必须是 `highlight.field` 所指字段文本的子串**，
  否则 FAIL——渲染器真正消费它，不再是"校验一个被忽略的字符串"
- 被标注字段仍为 `wrapPolicy: "none"`、`maxLines: 1`（§6.4）
- Assert 层必须包含该子串标注的 SVG 绘制 bbox

**存量迁移表（完整 17 处，五轮 review 修正：v3.2 只列了 qwen4 的 7 处）**
盘点命令：`grep -rn "highlight:" content/*/scene-data.mjs`
→ **qwen4-preview 7 / doubao-work 9 / light-society 1**。字段归属按实际包含关系确定：

| 内容包 | 场景 | highlight | 归属 field | 子串校验 |
|---|---|---|---|---|
| qwen4-preview | s2 | QWEN4 | result（"QWEN4 PREVIEWED"） | ✅ |
| qwen4-preview | s3 | FREE | result（"FREE TO DOWNLOAD"） | ✅ |
| qwen4-preview | s4 | 6B | result（"6B ACTIVE PER TOKEN"） | ✅ |
| qwen4-preview | s5 | 1/9 | result（"1/9 THE TRAINING COST"） | ✅ |
| **qwen4-preview** | **s6** | **LOOKS UP** | **action**（"3 LAYERS REMEMBER, 1 LAYER LOOKS UP"） | ✅ |
| qwen4-preview | s8 | 8.6X | result（"8.6X FASTER"） | ✅ |
| qwen4-preview | s9 | POINT | result（"THAT'S THE WHOLE POINT"） | ✅ |
| doubao-work | s1 | OPERATES | **hookText**（"AI THAT OPERATES"） | ✅ |
| doubao-work | s2 | WHY | result（"WHY?"） | ✅ |
| doubao-work | s3 | BUILDS | result（"EVEN BUILDS APPS"） | ✅ |
| doubao-work | s4 | SLEEP | result（"WORKS WHILE YOU SLEEP"） | ✅ |
| doubao-work | s5 | MEETINGS | result（"CHATS, DOCS, MEETINGS"） | ✅ |
| doubao-work | s6 | SMARTER | result（"AGENT GETS SMARTER"） | ✅ |
| doubao-work | s7 | $28B | result（"AI SPEND: $28B/YEAR"） | ✅ |
| doubao-work | s8 | ALIBABA | result（"ALIBABA QIANWEN OFFICE"） | ✅ |
| doubao-work | s9 | STRATEGY | result（"NOT A PRODUCT. A STRATEGY."） | ✅ |
| **light-society** | callout | **4M beliefs rewritten** | quote（"…it did rewrite 4M beliefs at scale."） | ❌ **非子串** → 改写为 `{ field: "quote", text: "4M beliefs" }` |

迁移脚本需对 16 处 ✅ 自动填 `field`，对 light-society 按人工改写值处理；
迁移后跑子串校验，全部通过才算完成。

**放弃的选项**：whole-result boolean（`highlight: true`）——最省事，但丢弃作者
"强调特定关键词"的意图，且 s6 的关键词会落在错误的字段上。

### 6.5 media-overlay 补齐 action/context

- `MediaOverlay` 顶部容器补 `ActionText`（company 后）、底部补 `ContextText`（result 后、source 前）
- 补齐后垂直空间变化走 §6.1 契约：`media-overlay.*` 各 slot 的 `maxHeight`
  按补齐后的真实布局重新标定，验证器按 slot 总高检查（缩字优先级 §6.1）
- 顺带修复 s6 "GDN + QSA" 左缘裁切（同一布局契约）

### 6.6 字体确定性（措辞修正）

- 字体栈（`BRAND_FONT_STACK`）**只保证选择顺序**：同机外观稳定的前提是字体文件存在且不变；
  不同机器/容器的 Times 可能映射到不同衬线实现（如 Liberation Serif），存在度量差异
- 打包字体（`@remotion/fonts`）是**跨机确定性**的唯一彻底手段——维持独立 backlog，
  触发条件：渲染环境离开本机（云渲染 / CI 渲染）
- 本方案不受该决策影响：Assert 测真实渲染结果，字体度量变化由 Fit 自动吸收
  （缩字）或暴露（触底 cancelRender）

### 6.7 验证器修正

- DOM verifier：不再跳过 `overflow:hidden` 祖先内的溢出；按 §6.1 注册协议逐 slot 测量；
  Assert 层逻辑与渲染时 gate **共享同一实现**（避免两套判定）
- 帧启发式：维持观察项；**新增**：尾部纯背景（空 CTA）帧必须 FAIL 而非 WARN
  （归入 R2 §5c 的时间轴验证重构，同批交付）

### 6.8 确定性回归 Fixture（回归主断言）

目录：`scripts/short-video/__tests__/fixtures/text-overflow/`。
F1–F7、F9 用固定输入 + Remotion still 渲染，完全确定性、不依赖内容包现状
（s5 已改 stacked-cards，无法用重渲染复现历史事故）；
**F8 走 HTML 路径**（§6.2 的 raw → materialize/fit → inject → final 管线）。

| Fixture | 输入 | 断言 |
|---|---|---|
| **F1** 历史 fail 样本 | s9 文案 + 固定 56px（**绕过 Fit**） | 新 Assert gate **必须 FAIL**（证明假绿链路闭合；同一输入对旧 gate 会 PASS——证明 gate 变化真实） |
| **F2** Fit 吸收样本 | 同 F1 输入 + Fit 启用 | PASS，且帧上无裁切、字号 ≥ `minSize` |
| **F3** 触底样本 | 超长文案（minSize 仍放不下） | **cancelRender** + 机器可读错误，非静默非硬裁 |
| **F4** 标注越界样本 | 文字合法但标注 SVG stroke 越 slot 边界 | Assert FAIL（scroll 指标合法——专测二层验证必要性） |
| **F5** 字段完整性样本 | 未识别字段 / `rendered` 字段缺失 | 注册协议 FAIL |
| **F6** media-split 形态 | 真实 Remotion `NarrativeScene` 的 MediaSplit（`NarrativeScene.tsx:165-203`，栏宽 420 / `maxWidth: 372`），绕过 Fit。**确定性 fixture 文案全文写死**（不依赖不可恢复的 v1/v2 产物）：`layout: "media-split"`、`result: "1/9 THE TRAINING COST"`、`fontSize: 52`、`fontWeight: 900`、`fontFamily: BRAND_FONT_STACK`、`company: "THE COST"`、`action: "TRAINING COMPUTE VS QWEN3.7-PLUS (397B)"` | Assert gate FAIL（HTML 路径 `scene-templates.mjs` 无 media-split 布局，grep -c = 0，不可用 HTML 复现；若将来要做 HTML 等价布局，需先实现布局等价性并另立 fixture） |
| **F8** HTML 路径 Fit 持久化（新增） | ① 生成后落盘 HTML → ② `verify-scene-dom` **只读**落盘文件跑 DOM gate → ③ 断言 recorder `page.goto` 的是同一文件；并用超长文案验证 Fit 结果**出现在落盘 HTML 的内联字号中** | 旧实现红（verifier 重新 `generateScene` → Fit 未落盘也能绿）；新实现绿（Fit 内联落盘 + 单一产物） |
| **F7** Hook 圆标注碰撞 | Hook settled frame；**先 Fit 数字 → 再生成 Circle → 最后 F7** | **每个文字元素分别** ≤ 2%：圆标注绘制 AABB 与 subject 的重叠面积 ≤ subject AABB 的 2%，与 numberLabel 的重叠面积 ≤ numberLabel AABB 的 2%——**分开计算、不合并分母**；**被标注目标本身（bigNumber）不计入**（圆本就该覆盖它），但 bigNumber 自身必须完整可读（不越安全区、不被压字）。**记录实际 overlap ratio** 供 Grill 查看。碰撞失败 → FAIL，不偷偷继续缩字 |
| **F9** ink overhang（新增） | 覆盖：italic `f` / `T`、`letter-spacing`、混合 span、多行文本 | 采用 ink-bound（A）时必须检出左/右/上/下四方向外溢；每个渲染行、每个样式 text run 单独测量；ctx 属性（font / letterSpacing / fontKerning / fontStretch）与被测元素同步。旧的错误公式（`-actualLeft`）必须让本 fixture 变红 |

**阈值说明**：R2 §2 的"重叠面积 ≈ 0"改为本条的可计算阈值（2%），
并在 R2 §2 / §4 同步；F7 是 Hook 圆修复（R2 §2）的自动验收。

### 6.9 与缺媒体门控的接口（单一真源在 R2 §3.5）

缺媒体门控的阶段化规则（preflight WARN/pending → Step 1.5c 后硬 FAIL →
`mediaOptOut` + media 依赖布局立即 FAIL → `stacked-cards` + `mediaOptOut` PASS）
**不在本文定义**，权威定义在 **R2 §3.5 / §5c.6**。

**四轮补充：必须抽成共享 final-media gate**（避免只在 main 路径生效）：

- `lib/final-media-gate.mjs`：输入 = 最终场景数组 + content 目录，
  输出 = PASS / FAIL（含缺失文件清单）
- `main.mjs`：Step 1.5 sourcing **之后**调用
- `render-only.mjs`：**渲染前**调用（它只有 Step 2 生成 HTML / 2.5 DOM 校验 /
  3 录制 / 5 Remotion 渲染，**没有 sourcing 阶段**）
- 两处调用同一函数，判定口径一致
本文与该门控的接口约定：

- slot 契约的 `rendered` 字段判定发生在**渲染时**，与 media 门控的阶段无关；
- `mediaOptOut` 只表示"该场景有意不使用媒体"，**不表示任何文本字段可省略**；
  若某布局缺 media 导致文本排版无意义，那是 R2 §3.5 门控的职责（FAIL），
  不是 slot 契约的 `intentionallyOmitted`。

---

## 7. 考虑过并放弃的替代方案

| 替代 | 放弃原因 |
|---|---|
| 只靠 scroll 指标做 Assert | rough-notation SVG `overflow:visible`，绘制越界对 scroll 不可见 |
| 移除 `overflow:hidden` 让溢出可见 | 侵入字幕道 / TikTok UI 安全区 |
| 字符预算继续当门槛 | 平均字宽原理性不足，s9 假绿已证 |
| 逐行标注 / 替换标注结构 | 复杂度与需求不匹配，未来扩展 |
| 字体打包混入本批 | 根因已过时；跨机确定性独立决策 |
| ~~用 canvas measureText 取代 DOM 测量~~ | **（五轮删除）**该结论针对"以 canvas 替代 DOM 测量"，与本方案用法不同：canvas `measureText` 的 `actualBoundingBox*` 是**唯一能拿到 ink overhang 的渠道**，DOM 指标拿不到。现定位：**DOM 测量管布局盒，canvas ink-bound 管墨迹外溢，两者互补**（§6.2 第 7 条，F9 覆盖） |
| 只修 Remotion 路径 | HTML 路径不能延期 |
| 缺媒体门控写进本文 | 属管线门控，单一真源应在 R2 §3.5，本文只定义接口 |

---

## 8. 影响面

- **前置**：`remotion upgrade --version X` + `remotion add @remotion/layout-utils` +
  移除 `^` + `remotion versions` 校验
- **新增**：`lib/text-slots.mjs`（契约 + 注册协议 + 缩字优先级 + bigNumber 焦点数字契约）；
  fixture 目录（§6.8，**F1–F9**）
- **Remotion**：Fit/Assert 验证组件；**10 个动态文本来源**接入（9 个场景模板 +
  `FullscreenMedia` 的 `media.source`）+ `data-text-*` 注册标注；
  `MediaOverlay` 补 action/context；`highlight` 改为 `{field, text}` 并实现子串切分
- **管线**：共享 `lib/final-media-gate.mjs`（main 在 sourcing 后、render-only 在渲染前）；
  `verify-scene-dom.mjs` 改为只读落盘 HTML（删除重新 `generateScene`）
- **HTML**：`scene-templates.mjs`（~15 个模板函数的独立 CSS 块）+ `scene-layout.mjs`
  对齐契约；**内容包盘点：`content/**/scenes.mjs` 共 16 个（含 `_test-fixtures`
  1 个）→ 真实内容包 15 个，其中 14 个内嵌 `font-size`/`fontSize`；
  5 个显式声明 renderer**（逐包对齐清单在 spec 阶段出）
- **验证器**：DOM verifier（overflow:hidden 祖先 + 坐标统一 + 标注绘制 bbox）；
  `verify-remotion-frames.mjs` 接入共享 schedule + 末帧检查（R2 §5c）
- **测试**：`remotion-timeline.test.mjs` 重写（假绿修复，R2 §5c）；契约/注册协议测试；
  Fit/Assert 单测（含 ink-bound 四方向）；**F1–F9 fixture**（F8 HTML 路径、F9 ink）；
  存量回归
- **内容**：qwen4 端到端冒烟重渲染（s9 完整 + 无空洞、s6/8/9 补字段、无黑帧尾巴、
  CTA 到最后一帧；时间轴方案 A/A2 由 Grill 定夺）
- **文档**：`docs/content-pipeline.md`、`docs/brand-system.md`、`docs/video-workflow.md`

**风险点**：Remotion 9 模板 + HTML 15 个内容包的回归面 → 逐模板接入 + fixture 断言；
预算降级后早期提示变弱 → 创作侧 WARN + 几何验证兜底。

---

## 9. Grill 输入（只剩 3 项）+ 已拍板项

### 9.1 已拍板（五轮，不再进 Grill）

| 项 | 决定 |
|---|---|
| 时间轴方案 | **A2**（非末幕 `clipFrames + TRANSITION_FRAMES`；CTA 视觉 1784→1953，与总时长完全一致；音/字幕/`Root.tsx` 零改动）—— R2 §1 |
| Remotion 版本 | 统一到 **4.0.517**（`upgrade --version 4.0.517` + `remotion add`） |
| s9 布局 | 改 **stacked-cards**（R2 §3.5，配合缺媒体门控） |
| Q4 校准维护契约 | 随预算降为 WARN 提示，spec 细化（实施级事项，非 Grill） |
| Q7 存量内容处理 | 回归职责由 **F1–F9** fixture 承担；15 个生产内容包批量校验只出决策清单 |
| 换行 / floor / HTML 时机 / 方案 C / highlight 语义 | ✅ 已定（§6.3–6.5、§6.4b、§6.7） |

### 9.2 Grill 三项

**1. ink-bound：A / B（推荐 A）**

- **A（推荐）**：Canvas ink-bound 作为**阻断 gate**。四方向分别计算，
  **不使用单一对称 inkPad**；每个实际渲染行、每个不同样式 text run 单独测量；
  ctx 与被测元素同步 `font` / `letterSpacing` / `fontKerning` / `fontStretch` 等属性；
  **F9** 覆盖 italic f/T、letter-spacing、混合 span、多行文本
- **B（不推荐作 gate）**：仅保留为**少量像素回归辅助**；且必须是
  "关闭裁切的诊断帧 vs 正常帧"的**差分形式**——单独使用无法捕获静默裁切
  （`overflow:hidden` 已把越界像素删除，slot 外侧检测反而 PASS）

**2. bigNumber 纳入 Fit（推荐纳入）**

- 独立焦点数字契约：`wrapPolicy: "none"`、`maxLines: 1`、Hook `preferredSize: 240`、
  **硬下限 180**；执行顺序 = **Fit 数字 → 生成 Circle → F7 碰撞 Assert**
- 碰撞失败 → **FAIL**，不偷偷继续缩字（让布局参数显式调整）
- 影响评估：生产最宽的 Hook 数字 `"+629%"`（unitree）在 240px 下实测约 687px
  < 820px 内容区 → 纳入 Fit 不伤害现有视觉

**3. 2% 阈值（推荐先保持，不提前放宽）**

- 初始硬门槛：**每个文字元素分别** ≤ 2%（subject 与 numberLabel **分开计算、不合并分母**）
- 记录实际 overlap ratio 供 Grill 查看
- 若结果普遍 < 0.5% → 可收紧至 1%；若出现 2–3% 假阳性 → **改进几何算法**，
  而不是直接放宽门槛

---

## 10. 验收标准

1. **单测**：契约 schema + 注册协议；Fit/Assert 分层路径（mock 几何）；
   坐标变换与 stroke margin 计算；`cancelRender` 错误格式；预算 WARN 推导
2. **Fixture（回归主断言，F1–F9）**：F1 旧 gate 绿/新 gate 红、F2 Fit 后绿
   （且字号 ≥ `minSize`，硬下限）、F3 cancelRender、F4 标注越界红、F5 字段完整性红、
   F6 media-split 形态红（确定性文案）、F7 碰撞阈值绿（per-element ≤2%，记录 ratio）、
   F8 HTML Fit 落盘红→绿、F9 ink 四方向外溢检出（含 italic f/T、letter-spacing、
   混合 span、多行）。
   附加断言：**ink overhang**（若采用 A，F1/F4/F7 各加 `inkPad` 版本；
   若采用 B，加像素回归）、**transient 逐帧 SAFE_ZONES**（入场窗口逐帧不越界）、
   **`FullscreenMedia` 的 `media.source`** 纳入几何验证
3. **端到端冒烟**：qwen4 全片重渲染——s9 完整且无中部空洞、s6/8/9 action/context 上屏、
   无黑帧尾巴、CTA 到最后一帧、逐场景帧审计零裁切
4. **验证器自证**：F1 即自证（旧链路对真实事故样本假绿 → 新链路红）
5. **存量**：15 个内容包批量校验清单汇报（不作为回归门槛）
6. **文档**：MRL-2 / brand-system / video-workflow 就位

---

## 11. 过程修正与教训

1. **核实方法缺陷（本轮纠正）**：上一轮两条"反驳 review"均因方法错误——
   `npx remotion --help | head -40` 截断漏见 `add` 命令；
   深度 1 的 shell 循环（`content/*/scenes.mjs`）漏掉嵌套内容包，
   且只 grep `fontSize` 漏掉 HTML 侧 `font-size`。
   **教训：CLI 帮助要看完整输出；文件盘点用 `find` 递归；样式关键字需同时匹配
   连字符与驼峰两种写法。**
2. **文档自包含**：方案文档不得引用不存在的中间版本（"v2 不变"），
   每版都必须可独立实施。
3. **先 commit 再大改**：v1/v2 内容已不可恢复（文件 untracked 时被覆盖）。
4. 下一步为 **Grill**（A/A2、Q4/Q6/Q7、2% 阈值），之后 Spec → Tickets。
