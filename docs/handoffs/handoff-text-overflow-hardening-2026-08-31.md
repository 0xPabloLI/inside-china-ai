# Handoff: 短视频文本溢出根治 — 实施进度 + 下一 session 启动

> **本文件是导航层，不是方案本身。** 它追踪 T1–T11 的实施进度、记录本 session 做了什么、告诉下一 session 从哪开始。
> 所有最终决策、验收标准、场景矩阵都在下面的「源文档」里 —— 读那些，别在这里找细节。
> 创建：2026-08-31 ｜ 父 issue #141 ｜ 本 session 关闭 #142/#143/#144/#148，余下 #145–#152 + #153/#154 开放。

---

## 0. TL;DR

- **进度：4 / 11 完成**（T1 / T2 / T3 / T7）。下一步 = **T4（Fit/Assert 几何 gate 核心，#145）** —— 全项目最细的一块，需要清醒的窗口。
- **全量测试：2748 passed，3 failed**。3 个失败全是 **#153 存量 preflight**（按依赖顺序刻意延后到 T7 之后）。
- 本 session 顺手修了 **OpenCV 冲突**（focus detector 已恢复）和 **Remotion 版本混用**（渲染不再崩）。
- 切换成本极低：spec / tickets / proposal / review 都在盘上，新 session 只需读「源文档」+ 对应 ticket。

---

## 1. 源文档（必读，按此顺序）

| 文档 | 角色 | 何时读 |
|---|---|---|
| `tickets-text-overflow-hardening.md` | **ticket 清单 + 逐条验收 checklist**（本 session 状态以它为准） | 第一 | 
| `spec-text-overflow-hardening.md` | 11-ticket 拆分依据 + 验收标准 | 接 T4 前 |
| `docs/handoffs/handoff-text-overflow-fix-proposal.md` | 方案 v3.3（自包含，方向已批准） | 想理解"为什么"时 |
| `docs/handoffs/review-text-overflow-fix-proposal-2026-08-30.md` | 五轮 review 存档（阻断项如何被解决） | 怀疑某决策时 |
| `docs/handoffs/handoff-qwen4-preview-r2-visual-audit.md` | R2：黑帧时间轴 A2 / 缺媒体门控 / 圆标注碰撞阈值 的**权威真源** | 改时间轴或媒体 gate 前 |
| `docs/brand-system.md` | 字号 / 字体栈 / 安全区契约 | 改样式前 |

---

## 2. 本 session 已完成（T1 / T2 / T3 / T7）

| Ticket | Issue | Commit | 验证了什么 |
|---|---|---|---|
| T1 Remotion 统一 4.0.517 | #142 ✅ | `632a96a` | `npx remotion versions` → 全 4.0.517；qwen4 渲染不再因版本混用崩 |
| T2 slot 契约 | #143 ✅ | `80e5bae` + `be0ae3e`（SPACING 导入修复）+ `e34ce06`（HTML 字号 64 对齐）+ `fc53381` | 契约单测 16 passed；9 个 final-media 单测 |
| T3 时间轴 A2 | #144 ✅ | `ed4560a` | remotion-timeline + frame-analysis 测试改写（旧断言恒真已删）；无黑尾、CTA 到末帧、音画对齐 |
| T7 共享 final-media gate | #148 ✅ | `632a96a` + `16a9a41` | 9 单测；gate 准确拦下 qwen4 Scene 9（media-overlay 无 media）；改 `stacked-cards` 后放行并渲染成功（71/0/0 帧检查） |

> **qwen4 Scene 9 已改为 `stacked-cards + mediaOptOut: true`**（T7 提交）。数据层正确，但 **Remotion 的 stacked-cards 分支仍透出上一幕媒体图** —— 视觉层未完，记在 T9。

---

## 3. 下一 session 启动：T4（#145）

**读这些文件**（按序）：`tickets-text-overflow-hardening.md` §T4 → `spec-text-overflow-hardening.md` §6.2 → `lib/text-slots.mjs`（`getSlot` / `fitCandidates` / `MEASURED_MAX_WIDTH`，T2 已落地的契约）→ `lib/safe-zones.mjs`（`CANVAS` / `SAFE_ZONES` / `BRAND_FONT_STACK`）→ `remotion/src/Root.tsx` + `remotion/src/scenes/NarrativeScene.tsx`（坐标变换需 `useCurrentScale()`）→ `rough-notation/dist/esm/index.mjs`（标注 Tracker 挂载时序）。

**第一个 RED 测试**建议从这三个独立维度各写一个（都来自 §T4 checklist，不依赖彼此）：

1. **ink-bound A 公式**（拦截静默裁切的核心）：用 `ctx.measureText` 测 italic `"f"`，断言 `actualBoundingBoxLeft > 0`，且一个按修正公式 `leftOverhang = max(0, actualBoundingBoxLeft)` 的函数标出左外溢 —— 而旧公式 `-actualLeft` 算成 0（漏报）。这是 F9 要抓的回归。
2. **坐标变换**：给定 rough-notation SVG `getBBox()` + `getScreenCTM()` 四角 + `useCurrentScale()`，断言 `screenCorners()` 返回的屏幕坐标 = CTM 变换后的四角。Spec §6.2 明确要求统一 composition 坐标。
3. **minSize 硬下限**：构造「preferredSize 降到 minSize 仍溢出」的输入，断言调用 `cancelRender()` 并抛出**机器可读**错误对象 `{ sceneId, slotId, field, measured, available, fontSize, inkPad }`（不是字符串、不是静默、不是硬裁切）。

**验收口径**（来自 §T4 checklist）：Fit 须字体 ready 后测、标注挂载后测；双轴 scroll/client 判定；触底 `cancelRender`；字体加载超时 → 失败（不静默回退字体度量）；Assert 四方向 ink 各 run 单独测；入场窗口逐帧校验安全区、settled 后不越 slot content box。

**已知坑（T4 特别容易踩）**：DOM 几何 ≠ 文字绘制边界 —— `getBoundingClientRect()` / Range / scroll 指标都可能漏掉字形 ink overhang；`overflow:hidden` 已把越界像素删掉，所以「slot 外侧有无非背景像素」这种反向探测会**假绿**（重复现有帧检查的老问题）。必须用 ink-bound（F9）或像素差分。

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

| Ticket | Issue | Blocked by | 一句话 |
|---|---|---|---|
| T4 Fit/Assert 核心 | #145 OPEN | T2 | 几何判定 + 触底 cancelRender |
| T5 Remotion 模板接入 + F1/F2/F3 | #146 OPEN | T2,T4 | 10 文本源接入契约 + `data-text-*` |
| T6 HTML 管线化 + F8 | #147 OPEN | T2,T4 | Chromium materialize/fit，单一 final 产物 |
| T8 highlight {field,text} + 17 处 | #149 OPEN | T2,T5 | 标什么亮什么，子串校验 |
| T9 media-overlay + s9 | #150 OPEN | T2,T5 | 补 action/context；s9 视觉待修 |
| T10 F4/F6/F7/F9 + 圆修复 | #151 OPEN | T4,T5 | 四 fixture；Hook 圆 `box="inside"` 240 |
| T11 端到端 + 归档 | #152 OPEN | 几乎全部 | qwen4 重渲染 + 存量清单 + 归档 |
| #153 存量 preflight 全红 | #153 OPEN | T2,T7 | 14/15 包缺 layout / visualType 不在派发表 |
| #154 字号路径不一致 | #154 OPEN | T2 | HTML 80px→64px 已做；模板未吃契约 |

---

## 5. 本 session 踩的坑（避免重蹈）

- **宽度必须实测，不能从 padding 推算。** NarrativeScene 的 `maxWidth` 作用在 content box（无 box-sizing 重置），再减 padding 会把 756px 算成 692px。T2 的 `MEASURED_MAX_WIDTH` 直接存实测值，**未测量的 slot 故意抛错**而非猜。
- **单测绿 ≠ 真绿。** 两个 bug 都是单测全过的：SPACING 从不存在的模块导入（16 单测过，真实渲染才炸）；以及更早的 timeline 测试断言恒真。任何关键路径改完，**必须跑真实渲染冒烟**（`node render-only.mjs --content qwen4-preview`）+ `verify-remotion-frames.mjs`。
- **缺媒体门控不能放 preflight。** preflight 在 Step 1.5 sourcing 之前，在那 FAIL 会挡住唯一能补媒体的机制。T7 改到 sourcing 之后（Step 1.6）才硬 FAIL。
- **验证器不能验证 `overflow:hidden` 内的真实溢出。** DOM/帧检查会假绿。见 §3 T4 坑。
- **Highlight 是 17 处不是 7 处**（qwen4 7 / doubao-work 9 / light-society 1）。T8 迁移别漏。
- **不要在 preflight 把 `mediaOptOut` 当文本省略**。它是媒体开关，与文本字段省略无关。

---

## 6. 开放项 / 待决

- **OpenCV（已收口，但留记录）**：`~/.video-tts-env` 原来同时装了 `opencv-python 5.0.0.93`（requirements 没它）和 `opencv-contrib-python 4.10.0.84`。5.x 移除 `CascadeClassifier`，导致 `focus_detector.py` 每次降级（main.mjs 只打 warning，管线静默失效）。本 session 卸载了 5.x、保留 contrib 4.10.0.84（CascadeClassifier/data/saliency 全 TRUE，34 个 focus 单测转 PASS）。**注意**：`mlx-vlm` 声明 `opencv-python>=4.12`，是 pip 元数据 floor，cv2 4.10 可正常 import，功能不受影响；若日后 VLM 分析真出问题，升级到 `opencv-contrib-python==4.12.0.88`（仍含 CascadeClassifier/saliency）—— 但本环境 PyPI 下载极慢，命令会 idle 超时，需后台或 curl 下载 wheel。
- **stacked-cards 视觉**（T9）：Remotion 的 stacked-cards 分支没清空媒体背景，s9 仍透出 s8 的 qwen-throughput 图。数据层已对，视觉层未完。
- **#153 回填规则**：有 media → media 依赖型布局（overlay/bottom-bar/split）；无 media → `stacked-cards`。回填前先确认 T7 的 gate 已就位（已就位）。
- **#154**：T2 定义了字号契约（`getSlot` / `fitCandidates`），但 HTML 模板仍硬编码字号、未消费契约。T6 落地 HTML Fit 时一并接。

---

## 7. 快速命令

```bash
# 全量测试
cd scripts/short-video && CI=true npx vitest run
# 单 ticket 测试
CI=true npx vitest run __tests__/text-slots.test.mjs __tests__/final-media-gate.test.mjs
# 真实渲染冒烟（必经，单测不足以证明正确）
node render-only.mjs --content qwen4-preview
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

- [x] T1/T2/T3/T7 实现 + 单测 + 验证 + issue 关闭
- [x] OpenCV 冲突收口（focus detector 恢复，34 单测 PASS）
- [x] Remotion 版本统一 4.0.517（渲染恢复）
- [x] 工作树干净（文档演进 + SPACING 修复已提交）
- [x] 本 handoff 文档创建
- [ ] 下一 session：从 T4 (#145) 起，建议新开 session（T4 最细，需清醒窗口）
