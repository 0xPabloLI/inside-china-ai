# Handoff: 短视频文本溢出根治 — 实施进度 + 下一 session 启动

> **本文件是导航层，不是方案本身。** 它追踪 T1–T12 的实施进度、记录本 session 做了什么、告诉下一 session 从哪开始。
> 所有最终决策、验收标准、场景矩阵都在下面的「源文档」里 —— 读那些，别在这里找细节。
> 创建：2026-08-31 ｜ 父 issue #141 ｜ 已关闭 #142/#143/#144/#145/#146/#148/#150/#154（过时）/#175，余下 #147（已 pivot）/#149/#151/#152/#153 + #165（中文分词，最低优先级）开放。

---

## 0. TL;DR

- **进度：10 / 12 完成**（T1–T7 / T9 / T10 / T12 ✅；T9 = `15b4419` + `eed95d4`，issue #150 已关闭；T10 = `da2cacf` + `1c3aac7` + `c478935` 已推送（`284fb86..c478935`），#151 已关闭；T12 = `44fa8da`，issue #175）。**下一步 = T8 / T11 任选**（T11 已解除 T10/T12 阻塞，仅余 T8）。
- **2026-09-03 第五 session（T10：ink 逐行 + fail-closed 标注 + F6/F7/F9 + 口径统一，`da2cacf` + `1c3aac7` + `c478935` 已推送，#151 已关闭）**：
  `collectInkOverhangs` 逐渲染行×逐样式 run（决策 67b，既单节点公式留 fixture 反证 +
  活断言钉死判别力）；标注挂载/settled 轮询 fail-open 闭合（决策 67a：无 SVG/绘制框 →
  `annotation-missing`，稳定轮询 + delayRender 句柄 + 代际检查防缩字期间旧轮询误判）；
  `paintedBoxOfSvg` 路径线段采样修正 highlight 水平超绘误判；决策 70 实测口径统一 →
  `ANNOTATION_OVERDRAW_BY_TYPE {circle:96, default:16}`（annotation-overdraw-probe fixture）；
  新组件 `AnnotationCollisionAssert`（F7：圆 vs subject/numberLabel 每目标独立 ratio ≤2%，
  details 记录 ratios，声明未挂载 target fail-closed）；Hook 圆 `box="inside"` + 单谓词
  `circleAroundNumber` 三处统一门控；fixture 补 `f6-media-split-lock52`（s5 历史裁字事故
  @52px → 结构化 FAIL）。测试：tsc 全绿；text-geometry 21/21、text-gate+scene-gate 渲染
  62/62（新增 F6/F7/决策 70/F9/67a/67b 共 10 例）、text-slots+official-fit 55/55。
  review 双轴：spec 轴 spec-complete；standards 轴修复 4 项（debug 残留删除、missing-target
  fail-closed、catch 先 release 再 rethrow、ZERO_PAD/nextFrame 收敛导出）后复跑全绿。
  两个延后 nit 已随后处理（同日）：稳定轮询骨架提取为共享 `pollUntilStable`
  （text-gate 30/3 与 collision 90/5 共用）；`annotationOverdrawOf` 下沉
  lib/text-geometry.mjs 单一来源（单测镜像删除）。
- **2026-09-03 第四 session（T9 收尾：parent/group gate + overlay 补齐 + 重渲染）**：
  `TextGroupGate` 落地（band 容器本体，子 gate Fit 后交出字号与 `apply()`，全员报告后量
  band 内容高对 `getGroup()` 预算，超限沿契约 `shrinkOrder` 逐字段缩到 minSize、每步重测，
  仍超 `group-overflow` 结构化失败带 `steps` 轨迹）；`MEASURED_MAX_HEIGHT` 标定 top 594 /
  bottom 336；MediaOverlay top band 补 ActionText、bottom band 补 ContextText；
  `shrinkOrder()` 从此有生产调用者（决策 68 前置解除）。测试：契约单测 +2、渲染层 +2
  （`group-shrink-measure`：预算 116 落在 floors 高 ~102 与 preferred 高 124 之间，断言
  source→16、context→20、result 保持 Fit 所选 50；`group-overflow-fail`：预算 60 触底
  结构化失败，终态 source→context→result=40）；scene-gate 21/21、text-gate+official-fit
  17/17、纯层 53/53；qwen4 全管线 1953 帧 + 文本 gate 零取消 + 71/71 帧检查，s6/s8 抽帧
  action/context 上屏，s9 53.2/53.5/55.5s 复测无上一幕媒体透出（53.2s「MEMBER/CITY 缺头」
  = band 入场滑动中途帧，非泄漏）。全量哨兵 2259 passed / 12 failed——4 个失败文件
  （e2e-pipeline 双写路径 MODULE_NOT_FOUND、publish-utils 缺 fixture 视频、verify-guard、
  verify-lfs）均不 import T9 模块，属环境/并行遗留。⚠️ 同文件并行 hunk 处理：NarrativeScene
  的 stacked-cards MediaBackground、text-slots 的 `hook.hero-center.subtitle*` 宽度属并行
  session，T9 commit 用过滤 patch 排除。subtitle verification 仍为存量 2 coverage gap（§6）。
- **2026-09-02 第三 session（T12 收尾 + 验证链闭环 + tracker 补录）**：防漂移渲染契约探针 `official-fit-render.test.mjs` 落地 **6/6**（GLM-6.0 @820 官方预测 224px = 真值 9 次探测、宽 819.66px；等价性/精度/探测次数三轴全过）；**bigNumber 硬下限 180→150 经用户确认**（spec 决策 72：zhipu-glm6-self-training 的 7 字符焦点数字适配；stat 保持 180，契约单测按字段分断言）；纯层 65/65 + 门测试 30/30 + 全量 **2713 passed / 4 failed**（4 个失败均非 T12：3 个 #153 存量 preflight + 1 个 verify-lfs 环境 flake，该文件数月未改）；`_gate-smoke` 全管线复跑：1109 帧渲染 + 文本 gate 运行时零取消，**但 subtitle verification 音频同步段 FAIL（9 scene 偏移）——T12 未触碰音频/verify 代码，冒烟包音频资产由并行 session 当日 15:40–15:50 重新生成（f5-manifest + wav），失败归因待独立 triage**。tracker 补录 9 行达成 GitHub open 48 = tracker open 48 集合一致；#159 双侧 closed 同步。沙箱注意：**WorkBuddy fs shim 会弄挂 remotion 打包（EEXIST mkdir）**——跑 remotion still / 门测试须 `env -u NODE_OPTIONS -u CODEBUDDY_BROKERED_FS_HOOK_ENABLED`。
- **2026-09-02 第二 session（T9 首项，commit `15b4419` 已推送）**：badge 接入 + rendered 缺失 FAIL + mediaOptOut 归位 + `HTML_SLOT_MAP`/`htmlSlotsFor()` 清理（决策 65/66 + 决策 59 收尾）一次落地；qwen4 s9 全管线渲染通过（**P1 阻断解除**：1953 帧 + 71/71 帧检查 + badge chip 像素验证）；review 双轴完成（1 硬伤 JSDoc 误删已修，amend 并入）；全量 2651 passed / 3 failed（#153 存量不变）。⚠️ qwen4 冒烟时 subtitle verification 报 2 errors = **存量 coverage gap，与 T9 无关**（见 §6）。
- **2026-09-02 实施审计修订（决策 63–71，全部经用户确认；spec/tickets 已同步）**：
  - **P1 阻断**：① qwen4 等场景的 stacked-cards 数据含 `texts.badge`，但 `REMOTION_SLOT_MAP.stacked-cards` 未声明 badge、模板不渲染 → 渲染层立即 FAIL（`no measured maxWidth`）——T9 新首项；② T12 原目标 `fitGroup()` 无生产调用者（生产路径是 TextGate → `fitCandidates()`），按原样实施不改变生产行为——T12 接入点已改写。
  - **完成声明更正**：T5「rendered 字段缺失 → FAIL」未实现（`assertKnownTextFields` 只拒未知键）；标注挂载轮询 fail-open；ink 按整节点 `measureText()` 而非逐行；`mediaOptOut` 被错放进 texts control 列表（实际是 scene 顶层字段）。
  - **误诊更正**：s9「53s 透出上一幕媒体」实为转场窗口内抽帧（52.7667s 起 + 10 帧转场），53.2s 后复测；stacked-cards 五个现存 slot 宽度已实测（752/820）。
- **2026-09-01 调研驱动方向修订（决策 57–62，全部经用户确认）**：两轮 deep research + 官方能力利用审计 → 推翻决策 26（「layout-utils 本票不必用」）与原 T6 方向。依据：`docs/research/text-auto-fit-landscape-research.md`；决策全文：spec「T6 方向修订」章节。
- T5 交付：9 模板 + 全屏媒体 source 逐字段接入 TextGate；`REMOTION_SLOT_MAP` 四分类 + 实测宽度回填；`_gate-smoke` 冒烟包全管线渲染通过（1109 帧 / 37.1s）；commit `8a024e5`。
- T6 交付（2026-09-02，commit `830cd44`）：`lib/renderer-guard.mjs` fail-fast + HTML 积木归档 `retired-html-path/` + 17 `scenes.mjs`/4 `dom-config.mjs`/8 测试删除 + agent 文档同步到单渲染器世界（TextGate 取代 DOM gate）。**注（2026-09-02 审计）**：「全部文档已同步」不准确——README / content-pipeline / video-workflow / scripts README 的 HTML 残留已在审计修订中清理；活代码中的 `HTML_SLOT_MAP`/`htmlSlotsFor()`（text-slots.mjs）及其测试待迁入 retired archive（记入 T9/T11 执行时的清理项）。
- **全量测试：2645 passed，3 failed**。3 个失败仍是 **#153 存量 preflight**（verify-guard-cli，按依赖顺序刻意延后）。⚠️ **git 状态（2026-09-02 审计口径）：本地 ahead 15 / behind origin/main 21+，且存在并行 session 修改——不要自动 `pull --rebase`**。新 session 必须先 `git status` / `git log` 核实工作树与并行改动，再与用户确认 push/rebase 策略（见 §3）。
- 切换成本极低：spec / tickets / proposal / review 都在盘上，新 session 只需读「源文档」+ 对应 ticket。

---

## 1. 源文档（必读，按此顺序）

| 文档                                                            | 角色                                                            | 何时读                 |
| --------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------- |
| `tickets-text-overflow-hardening.md`                            | **ticket 清单 + 逐条验收 checklist**（本 session 状态以它为准） | 第一                   |
| `spec-text-overflow-hardening.md`                               | 12-ticket 拆分依据 + 验收标准（含「T6 方向修订」决策 57–62、「T12 方向修正」决策 63–71） | 接 T9/T12 前           |
| `docs/handoffs/handoff-text-overflow-fix-proposal.md`           | 方案 v3.3（自包含，方向已批准）                                 | 想理解"为什么"时       |
| `docs/research/text-auto-fit-landscape-research.md`             | 两轮 deep research：官方边界 + 行业方案 + 能力利用审计          | 接 T6 前（决策 57–62 依据） |
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
| T6 HTML 路径退役（pivot）        | #147 ✅ | `830cd44` + `9914777`（review fix，已推送）                                                           | renderer-guard fail-fast 7 tests（含两入口真实进程）；全量 2645/3（#153 存量）；render-only + main.mjs 双 `_gate-smoke` 冒烟 PASS；scoped eslint + 根/remotion 双 tsc + `npm run build` 全绿；#147/#154 已关闭；review 双轴完成（3 处文档硬伤已修 + retired-path lint ignore） |
| T9 首项（badge 接入 + rendered FAIL + mediaOptOut 归位 + HTML 清理） | #150 部分完成 | `15b4419`（已推送） | 契约 33/33 + gate 渲染 19/19（新增 baseline-narrative-stacked / missing-rendered 场景）；全量 2651/3（#153 存量不变）；qwen4 全管线 1953 帧 + 71/71 帧检查；badge 像素验证（amber 带 y≈464–476，8/31 旧渲染无此带）；measure 全表 ok（badge=820，无回归）；scoped eslint + remotion tsc 全绿 |
| T12 官方 `fitText` 接入 TextGate 生产路径 | #175 ✅（已关闭） | `44fa8da`（已推送） | 内核性质测试（任意 seed 下候选集合与旧阶梯全等）+ gate 真渲染 30/30（PASS 形状/FAIL 字号逐项保持）；官方线性外推实测 0.01px（≪EPS，不加精化步），fixed-px letterSpacing 官方炸 89.9px → 双测量精确求解 0.02px；fitGroup 连同单测退役；tsc/eslint 全绿；哨兵 2659 passed / 13 failed，失败均非本票（并行 session 10：official-fit-render 6 + text-slots 3 + used-asset 1；#153 存量 3）；qwen4 冒烟由用户豁免（2026-09-02）。**第三 session 补强（2026-09-02）：防漂移渲染契约探针 official-fit-render.test.mjs 6/6 落盘提交（GLM-6.0 @820 官方 224px = 真值）；bigNumber 硬下限 180→150 经用户确认（spec 决策 72）随契约定见提交** |

> **qwen4 Scene 9 已改为 `stacked-cards + mediaOptOut: true`**（T7 提交）。~~数据层正确，但渲染层
> 当前因 **badge 未注册而直接 FAIL**（决策 65，P1 阻断）——修复记在 T9 首项。~~
> **2026-09-02 T9 首项已修复（`15b4419`）：badge 渲染 + TextGate + 实测宽度 820 + s9 全管线通过，P1 阻断解除。**
> （2026-09-02 误诊更正：旧记录「Remotion stacked-cards 分支透出上一幕媒体图」实为
> 转场窗口内抽帧，见 §6。）

---

## 3. 下一 session 启动

**开场（git，先于一切实施）**：2026-09-02 T9 session 开场核实：**behind 0**（审计时的
behind 21+ 已通过 merge #173/#174 解决），`830cd44`/`9914777`/`4e1d3bc`/`0025f73` 四个
commit 均已在 origin/main，原 push/rebase 决策已消解。并行 session 仍活跃（工作树常驻
digital-human / leaptalk / f5-mlx / zhipu / didi-robotaxi 改动，且会话中途新增 commit）——
坚持：只显式列路径 stage 自己的文件，`git status --short` 核对 staged 清单后再 commit；
push 需用户授权，默认只 commit 不 push。

**主线：T9 全部 ✅（`15b4419` + `eed95d4`，#150 已关闭）→ T12 ✅（`44fa8da`）→ T10 ✅（`da2cacf` + `c478935` 已推送，#151 已关闭）→ 下一 session 顺序：T8 → T11**

1. ~~T9 首项：stacked-cards badge 接入~~ ✅ 已完成（2026-09-02，见 §2）。
2. ~~T12~~ ✅ 已完成（2026-09-02，`44fa8da`，issue #175 已关闭，冒烟由用户豁免）——原接入说明留存：
   读序：`tickets-...md` §T12 → `spec-...md`（决策 57/63/64/58/62）→
   `docs/research/text-auto-fit-landscape-research.md`（官方边界）→
   `text-gate.tsx`（生产 Fit 阶梯）+ `lib/text-slots.mjs`（`fitCandidates`）。**先建 issue**（T12 未建票）。
   要点：官方输出只作候选值，终态验证（Range + ink）与 Assert 层不动；
   替换前实测 Times 900 线性外推误差；**不开启 `validateFontIsLoaded`**（Times 栈与
   fallback 指标一致会被误判），保留 `document.fonts.ready` 超时门（决策 64）；
   `fitGroup` 若确认无消费者随票退役。

**要点（通用）**：

- **回归哨兵规范跑法**：从**仓库根**跑 `CI=true npx vitest run --root . --config scripts/short-video/vitest.config.mjs`（在 scripts/short-video 下直接跑会因部分测试的 cwd 依赖假红）。
- **单场景测试全绿 ≠ 全管线通过**——内核/断言类改动落地后必须跑一次全管线冒烟。
- T8/T10 已解除阻塞（只等 T5），可任选：T8 highlight 结构化（17 处迁移）、
  T10 ink 逐行修正 + F6/F7/F9 补齐 + 标注口径统一（scope 已审计修订）。
- 冒烟包再生：`node scripts/short-video/.scratch-gate-smoke-audio.mjs`（content 资产 gitignored，新机器需先跑它合成音频+占位图）→ `node render-only.mjs --content _gate-smoke`。

**已知坑（接人时注意）**：`remotion still` 不转发页面 console（只有视频 render 转发）；fail payload 后的附加调试串不能含花括号（提取正则贪婪止于最后一个 `}`）；单帧 still 跳过入场窗口，运动中的断言失败只能在全量顺序渲染复现；**转场窗口内抽帧会看到上一幕残留**（10 帧转场，抽帧点选视觉起点 + 0.3s 之后，见决策 69）。

---

## 4. 剩余 ticket 一览（依赖图 + issue）

```
T4(#145) ✅ ─┬─→ T5(#146) ✅ ─┬─→ T8(#149) ─┐
             │               ├─→ T9(#150，scope 已修订) ─┤
             │               └─→ T12(待建，scope 已修订) ─┤
             └─→ T6(#147) ✅                ├─→ T10(#151，scope 已修订) ─→ T11(#152)
                                            │
T7(#148, done) ────────────────────────────┘
#153(存量 preflight) ← 依赖 T2 已 done + T7 已 done，可现在回填；关闭 #141 前必须处理（决策 71）
#154(HTML/Remotion 字号契约) ← 已关闭为过时（决策 59，HTML 路径退役）
#165(中文空格分词) ← 最低优先级；决策 57（换官方内核）不阻塞任何票
```

| Ticket                            | Issue     | Blocked by | 一句话                                                          |
| --------------------------------- | --------- | ---------- | --------------------------------------------------------------- |
| T4 Fit/Assert 核心                | #145 ✅   | —          | 已完成（`080a6c2`）：几何判定 + 触底 cancelRender + 逐帧 Assert |
| T5 Remotion 模板接入 + F1/F2/F3   | #146 ✅   | T2✅,T4✅  | 已完成（`8a024e5`）：10 文本源接入 + 冒烟包全管线通过；**审计更正：rendered 缺失 FAIL 未实现（承接 T9）、mediaOptOut 注册位置错误（承接 T9）** |
| T6 HTML 路径退役（已 pivot）      | #147 ✅   | 无         | 已完成（`830cd44` + `9914777` 本地）：renderer-guard fail-fast + 归档 retired-html-path + 回归哨兵全绿 + review 双轴修复；**审计补充：`HTML_SLOT_MAP`/`htmlSlotsFor()` 仍在活代码（text-slots.mjs），待迁 retired archive** |
| T9 badge 接入 + rendered 门 + 垂直 gate + overlay 补齐 | #150 ✅ CLOSED | T2✅,T5✅  | **全部 checklist ✅（2026-09-03，`eed95d4` 已推送，#150 已关闭）**：首项三项（`15b4419`）+ 余项（TextGroupGate 垂直门 / `MEASURED_MAX_HEIGHT` 594/336 / `group-overflow` 结构化失败 / MediaOverlay 补 action+context / s6-s8-s9 重渲染验证） |
| T12 官方 `fitText` 接入 TextGate 生产路径 | 待建   | T5✅       | **scope 已修订（决策 63/64）**：接入 `fitCandidates()` 生产路径；官方输出只作候选值；不开启 validateFontIsLoaded；**先建 issue** |
| T8 highlight {field,text} + 17 处 | #149 OPEN | T2✅,T5✅  | 标什么亮什么，子串校验                                          |
| T10 ink 逐行修正 + F6/F7/F9 补齐 + 标注口径 | #151 ✅ CLOSED | T4✅,T5✅  | **全部 checklist ✅（2026-09-03，`da2cacf` + `c478935` 已推送，#151 已关闭）**：ink 逐行×逐 run（67b）+ 标注 fail-closed（67a）+ `paintedBoxOfSvg` 路径采样 + 决策 70 按类型容差 + `AnnotationCollisionAssert`（F7 各目标 ≤2%）+ Hook 圆 box="inside" 单谓词门控 + F6/F9 fixture；review 双轴过（standards 4 项 + 2 nit 已修） |
| T11 端到端 + 预算 WARN 化 + 归档   | #152 OPEN | T8,T9,T10,**T12** | **scope 已修订（决策 71）**：+字符预算契约推导 WARN 化；+#153 前置；+blocked-by T12 |
| #153 存量 preflight 全红          | #153 OPEN | T2,T7      | 14/15 包缺 layout / visualType 不在派发表                       |
| #165 中文空格分词                 | #165 OPEN | —          | 官方多行函数对无空格文本失效；现文案英文，最低优先级          |

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
- **（T6 session）全量回归哨兵必须从仓库根跑**：`CI=true npx vitest run --root . --config scripts/short-video/vitest.config.mjs`。部分测试（publish-utils / research e2e）有 cwd 依赖，在 scripts/short-video 下直接跑会假红 8 个（`validateVideoFile("package.json")`、双重前缀路径）。从仓库根跑这些全部通过。
- **（T6 session）归档≠删测试要看活路径覆盖**：build-mark-svg.test.mjs 只有最后一个 describe 绑已退役的 `BRAND_MARK_SVG`，前 89 行测的是仍在服役的 `build-mark-svg.mjs`——整文件删掉就丢活覆盖。退役退役批次里删测试前逐 describe 核对被测对象。
- **（T6 session）双 session 并行时的 index 竞争**：另一 session 在本地会话间并行 stage/commit。commit 前先 `git status --short` 确认 staged 内容只含自己的文件；混 hunk 文件用「临时还原对方行为 HEAD → add → 恢复」法分离（勿 stash，Git Safety 禁止）。push 被阻塞时只 commit 不 push，把状态写进 handoff。
- **（2026-09-02 审计）单测绿 ≠ 生产路径接入**：`fitGroup()` 有完整单测但零生产调用者（生产 Fit 阶梯是 TextGate → `fitCandidates()`）。判定「已实施」要看生产调用链，不看测试覆盖。
- **（2026-09-02 审计）`REMOTION_SLOT_MAP` 与数据字段漂移会直接阻断渲染**：数据含 `texts.badge` 而 SLOT_MAP 未声明 → 渲染层立即 FAIL。改数据或改模板时两侧必须同步核对。
- **（2026-09-02 审计）转场窗口内抽帧会看到上一幕残留**：10 帧转场 ≈0.33s，s9 53s 抽帧的「媒体透出」是转场正常现象而非泄漏。复测点 = 视觉起点 + 0.3s 之后（决策 69）。
- **（2026-09-02 审计）Times 字体栈与浏览器 fallback 指标一致**：`validateFontIsLoaded` 的对照启发式会误判未加载——字体验证靠 `fonts.ready` + 超时门即可（决策 64）。
- **（2026-09-02 T9 session）`--root .` 全量跑会收集 src/ 侧 4 个套件**（header-nav / reading-progress / posts.functions / structured-data）：`@/` alias 在 `scripts/short-video/vitest.config.mjs` 下无法解析 → 4 个 Failed Suites（0 test collected）。既有环境现象（该配置不带应用 alias），非回归——判定成败只看 `Tests` 行，Failed Suites 单列。
- **（2026-09-02 T9 session）真实 ffmpeg 集成测试偶发假红**：audio-diagnostics（silent.mp4 解码）与字幕对齐类断言在全量跑中可瞬断（一次 4 failed，复跑只剩 #153 的 3 failed）。先复跑再定性，勿立即回滚。
- **（2026-09-02 T9 session）rendered-FAIL 的存量缺口不新增破坏**：bytedance（s2/s4/s7）、kimi（s5/s6/s7）、zhipu（s3/s4/s6/s7）缺 rendered 字段，但这些包当前本就因未知 visualType（concept/timeline/…，决策 45 throw）或 narrative 非法 layout（zhipu 用了 hero-center）无法渲染。T11 存量清单统一处理，勿单独修文案。
- **（2026-09-02 T9 session）badge chip 与 media-overlay chip 逐字重复**（`glowColor === "red"` ternary 全文件 5 处）：review 判断级 smell。T9 余项给 MediaOverlay 补 action/context 时可一并提取共享 BadgeChip/glowStyles helper，暂不单独重构（避免无关 refactor）。

---

## 6. 开放项 / 待决

- **qwen4 subtitle verification 2 errors（存量，非 T9，2026-09-02 记录）**：T9 冒烟渲染成功（1953 帧、71/71 帧检查）但 `render-only.mjs` 末尾 verify FAIL —— coverage gap 两处（开头 0.45s、42.53→45.87s 落在 s7/s8 之间）。验证器最后改动 8/27（`04e66e5`），8/31 的旧渲染复验同样会 FAIL；cue 时轴来自 TTS 对齐产物，与文本契约无关。修复属内容/对齐层（合并短 cue 或调对齐），勿在 text-overflow 票内顺手改。

- **OpenCV（已收口，但留记录）**：`~/.video-tts-env` 原来同时装了 `opencv-python 5.0.0.93`（requirements 没它）和 `opencv-contrib-python 4.10.0.84`。5.x 移除 `CascadeClassifier`，导致 `focus_detector.py` 每次降级（main.mjs 只打 warning，管线静默失效）。本 session 卸载了 5.x、保留 contrib 4.10.0.84（CascadeClassifier/data/saliency 全 TRUE，34 个 focus 单测转 PASS）。**注意**：`mlx-vlm` 声明 `opencv-python>=4.12`，是 pip 元数据 floor，cv2 4.10 可正常 import，功能不受影响；若日后 VLM 分析真出问题，升级到 `opencv-contrib-python==4.12.0.88`（仍含 CascadeClassifier/saliency）—— 但本环境 PyPI 下载极慢，命令会 idle 超时，需后台或 curl 下载 wheel。
- **stacked-cards 视觉（T9，2026-09-02 误诊更正）**：旧记录「53s 透出上一幕媒体 = stacked-cards 未清空媒体背景」不成立——53s 落在 10 帧转场窗口内，且该布局无媒体层。53.2s 后复测；若转场首帧仍透出上一幕媒体，按转场策略决策处理（调转场或加不透明背景），不是媒体泄漏。
- **s9 左缘 ink overhang（待调查，非 ticket）**：R2 §3.3 报告 s9 左缘 `G` 字疑似 ink overhang（初版推测 = 衬线回退字体左 bearing 为负 + 容器 `overflow:hidden`）。本地浏览器实测**未复现** G 左侧 overhang，根因不成立，降为待调查现象。该现象将由 **T4 的 ink-bound（F9）机制**落地后照亮 —— T4 完成后回看本项：若 ink-bound 能稳定测到左 overhang 则据此修，否则维持待调查、不入 ticket（非阻断）。权威真源：`docs/handoffs/handoff-qwen4-preview-r2-visual-audit.md` §3.3。
- **ANNOTATION_OVERDRAW 口径（T10，决策 70）**：现值 64px 覆盖不了决策 56 自述的 91px 实测上界——先统一测量口径，再按 annotation 类型设容差或修布局，不直接全局放宽。
- **#153 回填规则**：有 media → media 依赖型布局（overlay/bottom-bar/split）；无 media → `stacked-cards`。回填前先确认 T7 的 gate 已就位（已就位）。
- **#154 已关闭为过时**（2026-09-01，决策 59）：HTML 路径退役后「字号契约统一」失去对象。
- **#165（最低优先级）**：官方 `fillTextBox`/`fitTextOnNLines` 按空格分词，中文文案会误判溢出；现文案英文不受影响，引入中文时才触发。
- **#164（环境）**：`npm run lint` 被 `experiments/fastvideo-spike/repo/.venv` 拖死（45+ 分钟不收敛）。在修复前，Step 6 用 scoped eslint（显式列改动路径）替代全量。
- **活代码 HTML 残留（T9/T11 执行时清理）**：`text-slots.mjs` 的 `HTML_SLOT_MAP`/`htmlSlotsFor()` 及 text-slots.test.mjs 对应测试仍在服役路径上——迁入 `retired-html-path/` 或删除（决策 59 收尾）。

---

## 7. 快速命令

```bash
# 全量测试（必须从仓库根跑——在 scripts/short-video 下跑会因 cwd 依赖假红 8 个，见 §5 T6 坑）
CI=true npx vitest run --root . --config scripts/short-video/vitest.config.mjs
# 单 ticket 测试（cd 到 scripts/short-video 下跑，限指定文件——无全量套件的 cwd 陷阱）
cd scripts/short-video && CI=true npx vitest run __tests__/text-slots.test.mjs __tests__/final-media-gate.test.mjs
# gate 门测试（T4/T5）
cd scripts/short-video && CI=true npx vitest run __tests__/text-gate-render.test.mjs __tests__/scene-gate-render.test.mjs
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
- [x] 调研修订 session（2026-09-01）：两轮 deep research + 官方能力审计 → 决策 57–62 落盘（spec/tickets）；#147 改名 pivot、#154 关闭、#165 立票；未改任何代码（用户要求文档先行，新 session 再实施）
- [x] T6 (#147) 实现 + renderer-guard 测试 + code-review 双轴 + 双冒烟 + scoped lint/tsc/build + issue 关闭（2026-09-02，`830cd44` 实现 + `9914777` review 修复 + `0025f73` review 归档，**全部已推送**）
- [x] 2026-09-02 实施审计修订（决策 63–71）：P1 阻断确认（badge + fitGroup 接入点）、T5/T6 完成声明更正、T9/T10/T11/T12 scope 重写、误诊更正（s9 转场）、文档同步（spec/tickets/handoff/README/pipeline/workflow/scripts README）；纯文档修订，未改代码
- [x] 2026-09-02 T9 首项 session：badge 接入 + rendered 缺失 FAIL + mediaOptOut 归位 + `HTML_SLOT_MAP`/`htmlSlotsFor()` 清理（commit `15b4419`，含 review 双轴修复 amend）；qwen4 冒烟 + 71/71 帧检查 + badge 像素验证通过；T12 未动（**先建 issue 的事留给下一 session**）；已推送
- [x] 2026-09-02 T12 session：建 issue #175 → 基线存档（96/96 门测试 @`b0250c0`）→ official-fit kernel/helper/text-gate 接入 + fitGroup 退役 → 内核单测 + gate 真渲染 30/30 + tsc/eslint + 误差探针 → commit `44fa8da`（只 stage 本 session 文件；text-slots 混合改动按「临时还原→add→恢复」法分离）。code-review 双轴完成（eeab5c→`44fa8da`）：Standards 零硬伤（2 条 judgement：kernel degenerate fallback 有文档属设计；text-slots 4 行注释即决策引用）；Spec 无缺失/无 scope creep/无实现错误（注：Spec 子代理误读 diff 只见测试文件，实际 commit 9 文件已由主 session 核对）。qwen4 冒烟先延后、后由用户豁免（2026-09-02「qwen 冒烟不做了」）；tickets §T12 冒烟项已标记豁免
- [ ] 后续 session（#3…N）：**开场 git 核实（勿自动 rebase，见 §3）→ T9 余项 (#150) → T10(#151) → T11(#152) + T8(#149) + #153，按 §4 依赖图推进。**预计多个 session**；每 session 完成若干 ticket 后更新 §2 完成表与本状态行，再交付下一 session（见 §8）。注意：并行 session 正在同epic上工作（其 official-fit-render 契约测试 + bigNumber minSize 150 改动在途，落地后 T12 的渲染契约轴即闭合）

---

## 10. 附录：_gate-smoke 音频同步 FAIL triage（2026-09-02 晚）

`_gate-smoke` 冒烟音频同步段报 9 scene 偏移。triage 拆出**两个根因**：

### 根因 1（已修）：音频同步验证器拿错代音频
- 装配 `render-only.mjs` Step 1 用 **.mp3 优先**选音频；验证器 `verifyAudioSync` 经 `resolveSceneAudio` 用 **.wav 优先**重解析。当内容包同场景并存旧 mp3 + 新 wav（并行 session 重生成）时，装配用 mp3、验证用 wav → 互相关乱飞，报 scattered 假失败。
- `main.mjs` 早已算好 `audioPaths` 传给 `renderRemotion`，但 `verifySubtitles` 签名未接该参数被静默吞掉。
- **修复 `bac686e`**：`verifyAudioSync` 接受可选 `audioPaths`（按 index 对齐 sceneDurations），优先用它（= 真正烧进成片的源文件）；`verifySubtitles` 透传；`main.mjs`/`render-only.mjs` 把装配 audioPaths 喂入。回归测试 `audio-sync.test.mjs` 加「stale mp3 + undecodable wav」用例：重解析 FAIL、audioPaths 透传 PASS。57/57 audio-sync+verify-subtitles 测试绿。**本地提交，未推送**（推送需用户授权）。

### 根因 2（新建 #176，未修）：Remotion 渲染 mp4 音频轨 ~93ms 前导静音
- 修好根因 1 后，9 scene 偏移从「乱飞」收敛为**统一 +93ms**（scene1 0.09 vs 0.00… 恒定）。`ffmpeg silencedetect` 证实成片音频轨**开头 93ms 真实前导静音**，源 mp3 无前导静音；三次历史渲染（09-01 至 09-02）全 86–93ms 确定性常量；音频流 `aac @96000, start_pts=0` → AAC 编码器 priming（mp3→Remotion 解码→AAC 重编码 double-encode）。字幕按 timeline 0.00 烧入视频帧（无该偏移），故字幕比音频早 93ms，超 `AUDIO_SYNC_TOLERANCE=0.08` 13ms → 校验 FAIL。**影响所有该管线产出短视频**。
- 修复方向（见 #176）：确认 93ms 来自 Remotion raw 还是 post-process；剥离 AAC priming（`-af aresample=async=1` / 去 edit list / 喂 WAV 避免 double-encode）；修复后 `audio-sync.test.mjs` + `_gate-smoke` 实跑回归。
- **注意**：根因 1 修复后 `_gate-smoke` 会因根因 2 恒为红——这是校验正确工作的结果（真实 desync），**不应为让冒烟变绿而放宽 80ms 容差**。
