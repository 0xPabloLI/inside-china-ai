# Deep Research: 程序化视频生成的文本自动适配 — 有没有比自建测量更优雅的方案？

> 创建：2026-09-01 ｜ 触发：text-overflow hardening（T1–T5 已交付 ~1,650 行核心代码）后
> 质疑「是否过度设计、复杂度是否由 Remotion 引入」
> 方法：Standard tier，本地源码验证（Tier 1）优先，网络来源交叉印证；两轮（第二轮补官方能力利用审计与官方边界复核）
> **落地状态**：调研结论已转为 spec 决策 57–62（`spec-text-overflow-hardening.md`「T6 方向修订」章节）——Fit 内核换官方 `fitText`、HTML 路径退役、中文分词问题立 #165。本报告保留为决策依据存档。

## Executive Summary

**结论一：「自动缩字」这一层确实有官方现成方案，且已安装在本项目** —— `@remotion/layout-utils@4.0.517` 提供 `measureText` / `fitText` / `fillTextBox` / `fitTextOnNLines` 四个函数（合计 266 行，官方维护），Remotion 官方 skill 的 `measuring-text.md` 规则把「测量文本、适配容器、检查溢出」定义为标准模式。自建 `fitGroup` 与之功能高度重叠，存在用官方实现替换自建面、减少自维护代码的真实机会。

**结论二：但自建代码的大部分复杂度不在「缩字」，而在「验证」** —— ink 字形外溢、标注绘制越界、入场动画逐帧断言、容器溢出、结构化失败。这些在 Remotion 官方、其他框架（Motion Canvas）、CSS 原生（container queries）、社区库（auto-text-size/fitty）中**均无现成方案**，全部需要自建。行业内解决「文本不溢出」的通用模式就是「DOM 测量 + 迭代缩字 + 终态验证」，差别只在验证做到哪一层；我们的验证层恰好是 qwen4 事故证明必需的那一层。

**结论三：复杂度不是 Remotion 引入的** —— 旧 HTML/Playwright 路径同样零测量、同样 `overflow:hidden` 静默裁切（T6 存在的原因）。Remotion 反而是唯一自带文本适配工具的框架；它增加的只是少量框架胶水（`cancelRender` 错误传播、settledFrame 时序）。真正撑大复杂度的是：需求本身是「验证」而非「适配」、浏览器文本渲染模型的固有不确定性（字体异步加载/回退/亚像素）、以及流程重量。

## Key Findings

1. **官方 `fitText` 实现极简，且不做终态验证**（本地源码 [1]）：主体 13 行，用 100px 采样测宽后线性外推 `fontSize = withinWidth / width * 100`，算完直接返回——不验证应用该字号后文本是否真的放得下。其健壮性押在「宽度 ∝ 字号」的线性假设上（对字体渲染近似成立但不精确）。
2. **`fitTextOnNLines` 用二分搜索**（0.1px 精度）+ `text.split(' ')` 逐词拼行 [1]——**空格分词对中文无效**（中文无空格，整段视为一个词直接 `exceedsBox`）。本项目文案是英文大写，可分词；但若未来有中文文案则官方多行方案不可用。
3. **官方已知并解决的坑与我们撞过的坑完全一致**（官方 best-practices [2]）：必须等字体加载完再测量（对应我们的 `fonts.ready` + font-timeout）；`validateFontIsLoaded` 用 fallback 字体对照检测字体未加载（Remotion 5.0 起默认开启）；「avoid padding and border, use outline」（对应我们 `layoutContentBoxOf` 的 border 修正）。**方向独立收敛 = 不是过度设计，是问题的固有难度。**
4. **官方能力边界明确** [1][2][3]：只覆盖「给定文本+容器宽 → 求字号」。不提供：字形 ink 外溢（`actualBoundingBox*`）、标注（rough-notation）绘制边界、入场动画期间断言、容器垂直溢出、失败时的结构化机器可读错误。我们的 `text-geometry.mjs` ink 公式、TextGate 断言栈、`TextFitError` payload 全部落在官方边界之外。
5. **Motion Canvas（Canvas 路线）同样要自建** [4][5]：`Txt` 组件只有固定 `fontSize`，官方教程给的「动态字号」就是手写 `adjustFontSize` 自定义逻辑，或用 `maxWidth + textWrap` 换行数。没有框架级自动适配。
6. **CSS 原生无解** [6][7]：container queries + `clamp(min, Xcqw, max)` 只能按容器比例缩放，**不感知文本长度**——文本变长它不会缩，只是响应容器宽度。做不到「恰好放下这段文字」。
7. **社区库与我们的算法同构** [8]：`auto-text-size`（npm，零依赖）= 二分搜索 + `minFontSizePx`/`maxFontSizePx` + 收敛后**第二遍循环确认无溢出**（"Underflow is preferred since it doesn't look visually broken like overflow does"）+ Safari 亚像素修正。这与我们的 `fitGroup` + EPS + minSize 硬下限是同一个模式，独立第三方走到了同一个解。
8. **确定性渲染路线（Satori）理论最优雅但不适用** [9]：Satori（HTML/CSS → SVG，Yoga 布局，文本转 path）无 DOM、无字体竞态、测量确定。但：CSS 子集受限、无动画、需要重写全部场景模板、且我们的场景依赖真实浏览器渲染的动画与媒体——迁移成本远超收益，仅适合 OG image 类静态场景。

## Detailed Analysis

### 1. 我们自建了什么，官方已有什么

| 能力 | 官方/现成 | 我们自建 | 判定 |
|---|---|---|---|
| 单行文本求适配字号 | `fitText`（13 行，线性外推） | `fitGroup` 内的单字段缩字 | **可评估替换** |
| 多行限定行数求字号 | `fitTextOnNLines`（二分） | 无（场景基本单行） | 无需自建 |
| 字体未加载检测 | `validateFontIsLoaded` | `fonts.ready` + 10s timeout → TextFitError | 机制等价，可借鉴其对照检测 |
| 多字段缩字编排（shrinkOrder） | 无 | 有 | 必须自建 |
| minSize 硬下限 + EPS 容差 | 无（官方无下限概念） | 有 | 必须自建 |
| 应用后终态验证（Range 几何） | 无（官方不验证） | 有 | 必须自建 |
| ink 字形外溢（四方向） | 无 | 有（`actualBoundingBox*` 是浏览器原生 API [10]） | 必须自建 |
| 标注绘制越界 / 入场逐帧断言 / 容器溢出 | 无 | 有 | 必须自建 |
| 结构化失败 → 管线终止 | `cancelRender`（机制） | `TextFitError` payload 约定 | 胶水必要 |

结论：**可替换的只有「单字段求字号」这一小块**（对应 `text-geometry.mjs` 内的缩字阶梯部分，非全部 311 行）。替换收益 = 少维护约百行 + 官方持续维护；代价 = 官方 `fitText` 不做终态验证，我们仍要在其后跑自己的几何验证兜底——净简化有限但为正。

### 2. 复杂度是 Remotion 引入的吗？

否。三层证据：

- **旧路径同样有病**：Remotion 引入前的 HTML/Playwright 路径，`verify-scene-dom.mjs` 重新调用 `generateScene` 测量（假绿源头），`overflow:hidden` 一样静默裁切。T6 的存在本身就证明问题与渲染器无关。
- **Remotion 是解法供给方**：它是调查范围内唯一自带文本适配工具包的框架（`@remotion/layout-utils`）。框架本身没有制造问题；`cancelRender`/settledFrame 是任何逐帧渲染器都需要的确定性时序，属胶水而非复杂度。
- **行业同构**：auto-text-size、fitty、Motion Canvas 手写 adjustFontSize、CSS ResizeObserver 方案——所有人都在做「测量 → 缩 → 再验证」。这是浏览器文本渲染（异步字体、回退、亚像素、transform 影响测量）的固有难度，不是框架税。

真正让代码量显大的三个因素：(a) 需求是「验证正确性」（ink/标注/逐帧），验证永远比适配贵；(b) 五轮 review 抓出的错误（公式符号、假绿断言、分词、17 处迁移）都转化成了防御性代码与测试；(c) spec/ticket 流程重量（56 条决策）是流程成本，不是运行时复杂度。

### 3. 对当前架构的可执行建议（已落地为 spec 决策 57–62）

1. **Fit 内核换官方实现（→ 决策 57）**：`fitGroup` 的单字段缩字内核换官方 `fitText`（单行）/`fitTextOnNLines`（多行，如需），保留外层编排（shrinkOrder、minSize、EPS）与终态验证。补一条契约测试锁定「官方结果必须过我们的终态验证」。风险：官方 4.0.517 与未来版本的行为差异需测试锁定；替换前先实测 Times 900 大写连字场景的线性外推误差。
2. **Assert 层不动（→ 决策 58）**：ink/标注/逐帧/容器断言是防「成片截断」的唯一有效层，行业无现成替代，砍掉它 = 回到 qwen4 事故。
3. **不采纳**：Satori/确定性 SVG 路线（重写成本 ≫ 收益）；CSS container queries（机制上不感知文本长度，做不到「恰好放下」）。
4. **HTML（Playwright）路径退役（→ 决策 59）**：第二轮审计确认 15/15 内容包不使用 playwright renderer，该路径是零消费者 legacy；「Remotion 与 HTML 共享同一份几何判定」（自建 fit 内核的主要动机）随路径退役消解。原 T6「管线化 + F8」方案作废，改为退役票。
5. **中文空格分词（→ 决策 60 + #165）**：官方多行函数 `text.split(' ')` 对无空格文本整段判溢出；现文案英文不受影响，立独立 issue 最低优先级。

## Contrarian Views & Risks

- **「官方 fitText 够用」的反驳**：它不做终态验证、无字号下限、`fillTextBox` 按空格分词对中文失效。直接裸用官方函数仍会产生我们已修复过的那类问题——官方是积木，不是闸门。
- **替换官方实现的风险**：引入版本耦合（官方行为变更需跟测）；线性外推在特殊字体（连字、字距调整）下可能与我们当前阶梯搜索结果不同。若替换必须保留全部现有回归测试。
- **Tier 3 来源（CSDN 转载类）已剔除**，仅用于佐证方向，不作为事实依据。

## Open Questions

- 官方 `fitText` 在 Times New Roman 900 大写 + 连字场景下的线性外推误差范围（决策 57 实施时实测；超 EPS 则线性外推后接一步二分精化）。
- Remotion 5.x 后 `validateFontIsLoaded` 默认开启——项目锁 4.0.517，升级时需复查字体超时逻辑。
- opentype.js / fontkit 确定性字形测量（无 DOM）作为 ink 层未来备选记录在案（决策 61），仅当转向非 DOM 渲染时启用。

## Sources

1. 本地源码 `remotion/node_modules/@remotion/layout-utils/dist/cjs/layouts/*.js`（4.0.517：measure-text 95 行 / fit-text 25 行 / fill-text-box 71 行 / fit-text-on-n-lines 68 行）— Tier 1
2. https://www.remotion.dev/docs/layout-utils/best-practices — 官方测量最佳实践 — Tier 1
3. `.agents/skills/remotion-best-practices/remotion-markup/measuring-text.md` — Remotion 官方 skill 规则（测量/适配/溢出检查标准模式）— Tier 1
4. Motion Canvas 动态字号教程（blog.csdn.net/gitblog_00304）— 手写 adjustFontSize，无内置适配 — Tier 3
5. Motion Canvas Txt 排版（m.blog.csdn.net/gitblog_00145）— fontSize 固定 + maxWidth/textWrap — Tier 3
6. CSS Container Queries 实践（segmentfault.com/a/1190000048161406 等 ×3）— cqw 只响应容器宽，不感知文本长度 — Tier 2/3
7. MDN `<length>` cqw 定义（developer.mozilla.org）— Tier 1
8. https://www.npmjs.com/package/auto-text-size — 二分搜索 + 收敛后二次验证 + 亚像素修正，与自建模式同构 — Tier 2
9. https://github.com/vercel/satori — HTML/CSS → SVG 确定性渲染，文本转 path — Tier 1
10. Canvas TextMetrics `actualBoundingBox*`（MDN Drawing text / 华为 ArkUI 文档）— ink 测量浏览器原生支持 — Tier 1
11. https://www.remotion.dev/docs/api — layout-utils 官方 API 清单 — Tier 1
12. 第二轮：官方能力利用审计（本地取证）— `remotion/src/` 实际使用 `@remotion/transitions`（4 处）/ `@remotion/rough-notation`（7 处）/ `@remotion/effects`（1 处）/ `@remotion/media`（2 处）；`calculateMetadata` 已用于动态时长；`layout-utils` 是唯一被搁置的核心官方能力。`captions`/`media-parser` 已装未用，但属字幕/媒体解析域，与本 epic 无关，不计入搁置 — Tier 1（本地源码）
13. 第二轮：https://www.remotion.dev/docs/layout-utils/fit-text — 最新 fitText API 复核：仍无终态验证、无 minFontSize 参数 — Tier 1
