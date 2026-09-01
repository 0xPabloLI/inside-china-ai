# Handoff: 短视频文本溢出根治 — 实施进度 + 下一 session 启动

> **本文件是导航层，不是方案本身。** 它追踪 T1–T11 的实施进度、记录本 session 做了什么、告诉下一 session 从哪开始。
> 所有最终决策、验收标准、场景矩阵都在下面的「源文档」里 —— 读那些，别在这里找细节。
> 创建：2026-08-31 ｜ 父 issue #141 ｜ 已关闭 #142/#143/#144/#145/#146/#148，余下 #147/#149–#152 + #153/#154 开放。

---

## 0. TL;DR

- **进度：6 / 11 完成**（T1 / T2 / T3 / T4 / T5 / T7）。下一步 = **T6（HTML 管线化 + F8，#147）**；T8/T9/T10 已解除阻塞（只等 T5）可任选。
- T5 交付：9 模板 + 全屏媒体 source 逐字段接入 TextGate；`REMOTION_SLOT_MAP` 四分类 + 实测宽度回填；`_gate-smoke` 冒烟包全管线渲染通过（1109 帧 / 37.1s）；commit `8a024e5`。
- T5 冒烟暴露并修复 **6 类失败**（入场/转场假阳性 → 断言改无 transform 布局盒；QuoteScene verified badge 反转嵌套），全部有回归测试锁定；28 门测试全绿。
- **全量测试：2394 passed，3 failed**。3 个失败仍是 **#153 存量 preflight**（verify-guard-cli，按依赖顺序刻意延后）。
- 切换成本极低：spec / tickets / proposal / review 都在盘上，新 session 只需读「源文档」+ 对应 ticket。

---

## 1. 源文档（必读，按此顺序）

| 文档                                                            | 角色                                                            | 何时读                 |
| --------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------- |
| `tickets-text-overflow-hardening.md`                            | **ticket 清单 + 逐条验收 checklist**（本 session 状态以它为准） | 第一                   |
| `spec-text-overflow-hardening.md`                               | 11-ticket 拆分依据 + 验收标准                                   | 接 T4 前               |
| `docs/handoffs/handoff-text-overflow-fix-proposal.md`           | 方案 v3.3（自包含，方向已批准）                                 | 想理解"为什么"时       |
| `docs/handoffs/review-text-overflow-fix-proposal-2026-08-30.md` | 五轮 review 存档（阻断项如何被解决）                            | 怀疑某决策时           |
| `docs/handoffs/handoff-qwen4-preview-r2-visual-audit.md`        | R2：黑帧时间轴 A2 / 缺媒体门控 / 圆标注碰撞阈值 的**权威真源**  | 改时间轴或媒体 gate 前 |
| `docs/brand-system.md`                                          | 字号 / 字体栈 / 安全区契约                                      | 改样式前               |

---

## 2. 已完成（T1 / T2 / T3 / T4 / T5 / T7）

| Ticket                          | Issue   | Commit                                                                               | 验证了什么                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1 Remotion 统一 4.0.517        | #142 ✅ | `632a96a`                                                                            | `npx remotion versions` → 全 4.0.517；qwen4 渲染不再因版本混用崩                                                                                                                                                                                                                                                               |
| T2 slot 契约                    | #143 ✅ | `80e5bae` + `be0ae3e`（SPACING 导入修复）+ `e34ce06`（HTML 字号 64 对齐）+ `fc53381` | 契约单测 16 passed；9 个 final-media 单测                                                                                                                                                                                                                                                                                      |
| T3 时间轴 A2                    | #144 ✅ | `ed4560a`                                                                            | remotion-timeline + frame-analysis 测试改写（旧断言恒真已删）；无黑尾、CTA 到末帧、音画对齐                                                                                                                                                                                                                                    |
| T7 共享 final-media gate        | #148 ✅ | `632a96a` + `16a9a41`                                                                | 9 单测；gate 准确拦下 qwen4 Scene 9（media-overlay 无 media）；改 `stacked-cards` 后放行并渲染成功（71/0/0 帧检查）                                                                                                                                                                                                            |
| T4 Fit/Assert 几何 gate 核心    | #145 ✅ | `080a6c2`                                                                            | 纯层 24 单测（ink 公式 A 四方向、CTM 坐标变换、EPS 0.5、minSize 硬下限、fitGroup 三阶段）；运行时层 8 真实 Chromium 集成（F1 固定字号反证 / F2 缩字 / F3 触底 / F4 标注越界 / ink 运行时反证 / 字体超时 / 入场越安全区）；`FIT_REASONS` 共享常量；重渲染冒烟 + 71/0/0 帧检查通过                                               |
| T5 Remotion 模板接入 + F1/F2/F3 | #146 ✅ | `8a024e5`                                                                            | 10 文本源全接入（契约字号 + `data-text-*` 寻址 + 容器断言）；`REMOTION_SLOT_MAP` 四分类 + 未注册字段渲染层 throw；`measure-slot-widths.mjs` 实测宽度回填（修 5 处估算）；`scene-gate-fixture` 10 基线 + F1/F3；`_gate-smoke` 9 场景全管线冒烟通过（6 类失败全修：入场/转场假阳性→布局盒断言、badge 反转嵌套等）；28 门测试全绿 |

> **qwen4 Scene 9 已改为 `stacked-cards + mediaOptOut: true`**（T7 提交）。数据层正确，但 **Remotion 的 stacked-cards 分支仍透出上一幕媒体图** —— 视觉层未完，记在 T9。

---

## 3. 下一 session 启动：T6（#147）

**读这些文件**（按序）：`tickets-text-overflow-hardening.md` §T6 → `spec-text-overflow-hardening.md`（§ T4 Implementation Refinement 决策 18–38 + § T5 Implementation Refinement 决策 39–56，**含冒烟驱动修正**）→ `lib/text-geometry.mjs`（纯几何层，HTML 路径直接复用）→ `lib/text-slots.mjs`（`HTML_SLOT_MAP` + `REMOTION_SLOT_MAP`）→ `lib/render-remotion.mjs`（TextFitError payload 提取通道，HTML 路径照抄此格式）。

**要点**：

- HTML 路径直接 throw 同一 `TextFitError` 类（不用 `cancelRender`）；纯层 `fitGroup`/`FIT_REASONS` 已就位。
- T5 冒烟的最大教训：**单场景测试全绿 ≠ 全管线通过**（入场动画在 settledFrame 后仍在运动、场景转场横移都只在顺序全量渲染中暴露）。T6 落地后同样需要一次全管线冒烟。
- TextGate 断言已定稿为「入场窗口 + settled 容器断言用无 transform 布局盒，settled 文本/标注用 drawn 几何」（见 spec 决策 56）；HTML 路径无入场动画，可直接用 drawn 几何。
- T8/T9/T10 也已解除阻塞（只等 T5），可任选：T8 highlight 结构化（17 处迁移）、T9 media-overlay + s9 视觉（含 stacked-cards 背景透出问题）、T10 剩余 fixture + Hook 圆修复。
- 冒烟包再生：`node scripts/short-video/.scratch-gate-smoke-audio.mjs`（content 资产 gitignored，新机器需先跑它合成音频+占位图）→ `node render-only.mjs --content _gate-smoke`。

**已知坑（接人时注意）**：`remotion still` 不转发页面 console（只有视频 render 转发）；fail payload 后的附加调试串不能含花括号（提取正则贪婪止于最后一个 `}`）；单帧 still 跳过入场窗口，运动中的断言失败只能在全量顺序渲染复现。

---

## 4. 剩余 ticket 一览（依赖图 + issue）

```
T4(#145) ─┬─→ T5(#146) ─┬─→ T8(#149) ─┐
           │             ├─→ T9(#150) ─┤
           └─→ T6(#147) ─┘             ├─→ T10(#151) ─→ T11(#152)
                                         │
T7(#148, done) ─────────────────────────┘
#153(存量 preflight) ← 依赖 T2 已 done + T7 已 done，可现在回填
#154(HTML/Remotion 字号契约统一) ← T2 已定义契约但 HTML 模板未消费，待 T6 落地
```

| Ticket                            | Issue     | Blocked by | 一句话                                                          |
| --------------------------------- | --------- | ---------- | --------------------------------------------------------------- |
| T4 Fit/Assert 核心                | #145 ✅   | —          | 已完成（`080a6c2`）：几何判定 + 触底 cancelRender + 逐帧 Assert |
| T5 Remotion 模板接入 + F1/F2/F3   | #146 ✅   | T2✅,T4✅  | 已完成（`8a024e5`）：10 文本源接入 + 冒烟包全管线通过           |
| T6 HTML 管线化 + F8               | #147 OPEN | T2✅,T4✅  | Chromium materialize/fit，单一 final 产物                       |
| T8 highlight {field,text} + 17 处 | #149 OPEN | T2✅,T5✅  | 标什么亮什么，子串校验                                          |
| T9 media-overlay + s9             | #150 OPEN | T2✅,T5✅  | 补 action/context；s9 视觉待修                                  |
| T10 F4/F6/F7/F9 + 圆修复          | #151 OPEN | T4✅,T5✅  | 四 fixture；Hook 圆 `box="inside"` 240                          |
| T11 端到端 + 归档                 | #152 OPEN | 几乎全部   | qwen4 重渲染 + 存量清单 + 归档                                  |
| #153 存量 preflight 全红          | #153 OPEN | T2,T7      | 14/15 包缺 layout / visualType 不在派发表                       |
| #154 字号路径不一致               | #154 OPEN | T2         | HTML 80px→64px 已做；模板未吃契约                               |

---

## 5. 本 session 踩的坑（避免重蹈）

- **宽度必须实测，不能从 padding 推算。** NarrativeScene 的 `maxWidth` 作用在 content box（无 box-sizing 重置），再减 padding 会把 756px 算成 692px。T2 的 `MEASURED_MAX_WIDTH` 直接存实测值，**未测量的 slot 故意抛错**而非猜。
- **单测绿 ≠ 真绿。** 两个 bug 都是单测全过的：SPACING 从不存在的模块导入（16 单测过，真实渲染才炸）；以及更早的 timeline 测试断言恒真。任何关键路径改完，**必须跑真实渲染冒烟**（`node render-only.mjs --content qwen4-preview`）+ `verify-remotion-frames.mjs`。
- **缺媒体门控不能放 preflight。** preflight 在 Step 1.5 sourcing 之前，在那 FAIL 会挡住唯一能补媒体的机制。T7 改到 sourcing 之后（Step 1.6）才硬 FAIL。
- **验证器不能验证 `overflow:hidden` 内的真实溢出。** DOM/帧检查会假绿。见 §3 T4 坑。
- **Highlight 是 17 处不是 7 处**（qwen4 7 / doubao-work 9 / light-society 1）。T8 迁移别漏。
- **不要在 preflight 把 `mediaOptOut` 当文本省略**。它是媒体开关，与文本字段省略无关。
- **（T4 session）`useCurrentScale()` / `useVideoConfig` 只属于 Player 上下文**：Composition 渲染（remotion still / 成片）中调用会 throw。scale 一律用元素自身 `getBoundingClientRect().width / offsetWidth` 比率恢复，入场变换自动抵消。
- **（T4 session）wrapper 的 `scrollWidth/Height` 会把绝对定位的标注 SVG 算进去**：Fit 的布局溢出判定改用 Range 几何（`textExtentLocal`：TreeWalker 只测文本节点 → `getClientRects()` 并集），标注绘制边界归 Assert 管。混用会造成 Fit 误杀合法文案。
- **（T4 session）vitest node 环境解析不到 remotion 工作区的 node_modules**：程序化 `@remotion/renderer.renderStill` 不可行；集成测试用 `execFileSync("npx remotion still")` CLI 驱动（cwd = remotion 目录，真实 Chromium，单场景约 3–25s）。
- **（T4 session）`cancelRender(err)` 只把 `error.message` 第一行传回调用方**（经 `window.remotion_cancelledError`）：机器可读错误的 message 必须是 `[TextFitError] ${JSON.stringify(payload)}` 格式，单行。
- **（T4 session）测试文案长度必须按真实字体宽度验证**：大写 Times 900 约 0.6em/字符；拍脑袋的“应该溢出/应该容得下”文案会造成假红/假绿。
- **（T5 session）入场/转场动画的 drawn rect 会假阳性**：StampIn 2× 起缩、场景转场横移、SlideUp 在 settledFrame 后仍在运动——这些都不改变布局。入场窗口与 settled 容器断言一律用无 transform 布局盒（offset 链 + clientWidth，含 border 修正）；文本⊆slot 与标注断言继续用 drawn 几何。布局盒含 `layoutContentBoxOf` border 修正（StatCard 1px 侧边/5px 顶边）。
- **（T5 session）单场景测试全绿 ≠ 全管线通过**：单帧 still/单帧 render 直接挂载目标帧（跳过入场窗口），部分失败只在顺序全量渲染中暴露。断言类改动必须跑一次全量渲染冒烟。
- **（T5 session）取证通道陷阱**：`remotion still` 不转发页面 console（只有视频 render 转发）；fail payload 后的附加调试串不能含花括号（`/\[TextFitError\] (\{.*\})/` 贪婪止于最后一个 `}`）。
- **（T5 session）inline-fit 容器居中会位移块级 gate**：820px 块塞进 880 宽 `inline-flex` badge 被 `text-align:center` 右移 30px——gate 包 badge，不是 badge 包 gate（quote-7 回归）。

---

## 6. 开放项 / 待决

- **OpenCV（已收口，但留记录）**：`~/.video-tts-env` 原来同时装了 `opencv-python 5.0.0.93`（requirements 没它）和 `opencv-contrib-python 4.10.0.84`。5.x 移除 `CascadeClassifier`，导致 `focus_detector.py` 每次降级（main.mjs 只打 warning，管线静默失效）。本 session 卸载了 5.x、保留 contrib 4.10.0.84（CascadeClassifier/data/saliency 全 TRUE，34 个 focus 单测转 PASS）。**注意**：`mlx-vlm` 声明 `opencv-python>=4.12`，是 pip 元数据 floor，cv2 4.10 可正常 import，功能不受影响；若日后 VLM 分析真出问题，升级到 `opencv-contrib-python==4.12.0.88`（仍含 CascadeClassifier/saliency）—— 但本环境 PyPI 下载极慢，命令会 idle 超时，需后台或 curl 下载 wheel。
- **stacked-cards 视觉**（T9）：Remotion 的 stacked-cards 分支没清空媒体背景，s9 仍透出 s8 的 qwen-throughput 图。数据层已对，视觉层未完。
- **s9 左缘 ink overhang（待调查，非 ticket）**：R2 §3.3 报告 s9 左缘 `G` 字疑似 ink overhang（初版推测 = 衬线回退字体左 bearing 为负 + 容器 `overflow:hidden`）。本地浏览器实测**未复现** G 左侧 overhang，根因不成立，降为待调查现象。该现象将由 **T4 的 ink-bound（F9）机制**落地后照亮 —— T4 完成后回看本项：若 ink-bound 能稳定测到左 overhang 则据此修，否则维持待调查、不入 ticket（非阻断）。权威真源：`docs/handoffs/handoff-qwen4-preview-r2-visual-audit.md` §3.3。
- **#153 回填规则**：有 media → media 依赖型布局（overlay/bottom-bar/split）；无 media → `stacked-cards`。回填前先确认 T7 的 gate 已就位（已就位）。
- **#154**：T2 定义了字号契约（`getSlot` / `fitCandidates`），但 HTML 模板仍硬编码字号、未消费契约。T6 落地 HTML Fit 时一并接。

---

## 7. 快速命令

```bash
# 全量测试
cd scripts/short-video && CI=true npx vitest run
# 单 ticket 测试
CI=true npx vitest run __tests__/text-slots.test.mjs __tests__/final-media-gate.test.mjs
# gate 门测试（T4/T5）
CI=true npx vitest run __tests__/text-gate-render.test.mjs __tests__/scene-gate-render.test.mjs
# 真实渲染冒烟（必经，单测不足以证明正确）
node render-only.mjs --content qwen4-preview
# gate 全管线冒烟包（新机器先跑 .scratch-gate-smoke-audio.mjs 再生资产）
node render-only.mjs --content _gate-smoke
# 末帧/逐帧几何检查
node verify-remotion-frames.mjs --content qwen4-preview
# 单个场景抽帧看（例：s9 ≈ 53s）
ffmpeg -ss 53 -i output/qwen4-preview/<file>.mp4 -frames:v 1 -y /tmp/s9.png
```

---

## 8. Suggested skills（下一 session 加载）

- **writing-for-agents** —— 改任何 agent 消费文档（spec / tickets / brand-system / 本文件）前强制加载。
- **frontend-design / polishing** —— T9/T10 涉及视觉质量（圆不压字、中部无洞）时参考。
- **handoff** —— 本文件即其产物；交付下一 session 前再跑一次更新状态。

---

## 9. 收尾清单（本 session 已做）

- [x] T1/T2/T3/T7 实现 + 单测 + 验证 + issue 关闭（2026-08-31 第一 session）
- [x] T4 (#145) 实现 + 双层测试 + code-review + 冒烟 + issue 关闭（2026-08-31 第二 session，commit `080a6c2`）
- [x] T5 (#146) 实现 + 28 门测试 + code-review + `_gate-smoke` 全管线冒烟 + issue 关闭（2026-09-01，commit `8a024e5`）
- [x] OpenCV 冲突收口（focus detector 恢复，34 单测 PASS）
- [x] Remotion 版本统一 4.0.517（渲染恢复）
- [x] 工作树干净（文档演进 + SPACING 修复已提交）
- [x] 本 handoff 文档创建（每 session 更新）
- [x] 下一 session（#1）：从 T4 (#145) 起 —— 已完成，见 §2/§3
- [ ] 后续 session（#2…N）：T6(#147)→T10(#151)→T11(#152) + T8/T9(#149/#150) + #153/#154，按 §4 依赖图推进。**预计多个 session**（每个 ticket 都是 substantial 改动，不是 1 个 session 能收口）；每 session 完成若干 ticket 后更新 §2 完成表与本状态行，再交付下一 session（见 §8）
