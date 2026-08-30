# Review 存档：text-overflow-fix-proposal 二轮 / 三轮 / 四轮意见（2026-08-30）

> 本文按轮次追加存档：
> - **二轮**（针对 v2）→ Verdict: Request changes，核实见 Proposal §1.2
> - **三轮**（针对 v3）→ Verdict: Request changes（接近可批准），核实见 Proposal §1.3
> - **四轮**（针对 v3.1）→ Verdict: Request changes（**非常接近可进入 Grill**），核实见 Proposal §1.4
>
> Reviewer: 第三方（用户提供原文）。接收方对每条事实断言的本地核实标注写在
> `docs/handoffs/handoff-text-overflow-fix-proposal.md` 对应小节。

---

## 结论

方向正确，但当前文档不适合直接实施。
它能降低溢出概率，却还不能兑现"杜绝静默裁切"。我的审查结论是：Request changes。

## 主要阻断项

### P0：最终验证仍然可能假绿

已在真实的 qwen4-preview Scene 9 上复现：

- "THAT'S THE WHOLE POINT" 实际超出容器约 10.67px
- 现有字符预算检查：PASS
- Pre-render：60 PASS / 0 FAIL
- 成品帧检查：69 PASS / 0 FAIL
- 相关单测：48/48 PASS
- DOM verifier 还会跳过位于 overflow:hidden 祖先内的真实溢出

因此，截图启发式和现有 DOM gate 都不能作为最终正确性证明。
HTML 路径也不能在宣称"根治"时延期处理。

### P0：FitText 生命周期和失败语义不完整

提案没有明确保证：

- 字体加载完成后才测量；
- Rough Notation 标注完成后再次测量；
- 最终帧已经稳定；
- 达到最小字号仍放不下时，渲染必须失败。

delayRender() 只负责等待，本身不会报告失败。应明确使用渲染阻塞机制，
并在字号下限仍溢出时调用 cancelRender()，输出机器可读错误。

同时必须验证：水平宽度、垂直高度、最大行数、多字段组合后的 slot 总高度。

### P0："先换行再缩字"与当前 Highlight 不兼容

@remotion/rough-notation 的 Highlight 使用：

```css
display: inline-block;
white-space: pre;
```

所以当前高亮结果文本不会按提案设想自然换行。必须明确选择：

- 高亮文本只允许单行缩放；
- 将标注拆成逐行标注；
- 或替换当前标注结构。

无论哪种，都要在标注后的真实 DOM 上再次验证。

### P0：Slot 契约还没有可执行的注册方式

"Remotion、HTML、预算器、验证器共同消费"目前只是目标，没有说明 DOM 元素如何对应契约。

建议明确规定：

- 每个动态文本节点携带 data-text-slot、data-text-field；
- 每个 visualType + layout 声明：rendered fields、control fields（例如 highlight）、
  optional fields、intentionally omitted fields；
- 未识别或未消费的动态字段直接 FAIL；
- 数组、card、row 等重复文本使用带索引的 slot ID；
- mediaOptOut 不能作为"文本明确不渲染"的例子，它只控制媒体。

同时补上 slot 总高超限时的确定性策略：缩哪个字段、是否统一缩放、优先级是什么、
何时直接 cancelRender()。

## 其他必须修正

### R2 内部的旧结论

以下内容仍与 Proposal v2 冲突：

- §3.1 的 maxWidth: 660 应改为实际文本可用宽度约 756px
- §5b 的 756−64=692px 仍是重复扣 padding
- "字体回退是根因""推荐 A+B+D""预算表作为 fail-fast 门槛"均已被 v2 撤销
- §5c 仍说 highlight 语义待定，但 v2 已选择 result 子串语义
- R1 链接应改为 `docs/archive/handoffs/handoff-qwen4-preview-pipeline-hardening.md`

若要完整保留原始诊断，建议把旧内容明确标为"历史判断，已被 v2 supersede"，
不要让它继续像有效实施指令。

### （二轮补充）R2 的 CTA 时间换算有误

按文档自己的帧表重新计算：

- CTA 视觉开始：1694 帧 = 56.47s，不是 59.5s
- CTA 音频开始：1784 帧 = 59.47s
- 因此前 9 场语音压在 CTA 上约 3.0s，不是 1.5s
- CTA 原始视觉时长：169 帧 = 5.63s
- 再加 CTA_HOLD=90 后，CTA 共显示 8.63s，不是 5.6–6.6s

需要修正 R2 §1 的秒数、方案 A 描述及 §1.4 的持帧结论。

而且当前"三选一"漏了一个可能更简单的方案：

```
除最后一幕外：visualDuration = clipFrames + transitionFrames
TransitionSeries 再扣除 transitionFrames
```

这样每幕视觉起点自然恢复为 Σ clipFrames，总时长仍为 1953 帧，音频和字幕可以
完全不移动，也不需要额外 CTA hold。应在 Grill 中和现有方案 A 比较后重新确认选择。

### （二轮补充）时间轴测试本身是假绿

remotion-timeline.test.mjs 当前 12/12 PASS，但测试注释声称
"ShortVideo visual Sequence uses from={cumulativeOffsetFrames}"——实际 ShortVideo.tsx
中只有音频使用该 offset，视觉仍由 TransitionSeries 排布。测试只比较几个来自同一函数
的数字，没有覆盖真实视觉时间轴。

R2 应明确要求：

- 用一个共享 schedule 同时驱动 ShortVideo、Root、字幕、音频和帧抽样；
- 重写该测试，使其真正覆盖 TransitionSeries 起止位置；
- verify-remotion-frames.mjs 改用同一 schedule，并检查最后一帧；
- 空 CTA/尾部纯背景必须 FAIL，而不是 WARN。

另外，main.mjs 默认使用 Remotion，但 verify-video.mjs 只有 meta.renderer === "remotion"
才运行帧检查。现有内容包中有默认走 Remotion 却跳过该检查的，也应纳入 R2 影响面。

### （二轮补充）Proposal 的"真实几何"仍未覆盖标注绘制边界

scrollWidth/clientWidth 只能检查布局盒。Rough Notation 的 SVG 是绝对定位且
overflow:visible，画笔、stroke 和随机偏移可能越界，而 scroll 指标仍然合法。

应将验证拆成两层：

- Fit：根据无 transform 的文本布局选择字号；
- Assert：在动画和标注稳定帧检查：文本实际 bbox；SVG/path 的绘制 bbox、stroke
  和随机余量；四边相对于 slot content box 的位置。

Remotion 的 getBoundingClientRect() 还需要用 useCurrentScale() 校正。
layout-utils 可以帮助选择候选字号，但不能替代标注及多字段组合的最终 DOM gate。

### Proposal 的回归样本不够稳定

当前 qwen4 Scene 5 已是 stacked-cards，无法通过重渲染验证历史 media-split 事故。
自动 Fit 后，"原始 s9 必须让 verifier FAIL"与"缩字后成功"存在阶段冲突。

应保存独立、确定性的 fixture：

- 固定字号历史失败样本，证明旧 gate 会红；
- 同样输入接入 Fit 后 PASS；
- minSize 下仍放不下的样本必须 cancelRender()；
- 单独验证 Highlight 绘制边界。

## 文档元信息

- Proposal 下一步必须是 Grill → Spec → Tickets，不能直接进入 to-spec。
- 两份文件目前均未进入 Git 历史，因此"v1 在 git 历史""review 已存档于文末"不成立。
- Remotion 版本统一应明确为移除 ^、精确锁定同一版本（接收方核实：CLI 无 `add`
  命令，正确命令为 `npx remotion upgrade`）。
- 当前有 15 个真实 HTML 内容包，其中 14 个 scenes.mjs 含独立字号
  （接收方实测为 10 个内容包含 scenes.mjs、4 个内嵌 fontSize——见 proposal §1.2）。
- "显式字体栈保证本机确定性"表述过强，它只保证选择顺序，不保证机器间存在相同字体文件。

## 最终判断

R2 暂时还不能作为完全可靠的单一事实来源，主要因为时间轴秒数和旧 overflow 结论
相互冲突。Proposal v2 的总体架构正确，但标注绘制边界、DOM 注册协议、字段完整性
和红色回归样本仍未闭环。

---

# 三轮 review（2026-08-30 追加，针对 v3）

> Verdict: **Request changes**，但已接近可批准。v3 修复了多数上一轮阻断项，
> 仍不能直接交给实施 Agent。接收方核实标注见 Proposal §1.3。

## 阻断项

### P0：Proposal v3 不自包含

§6.1、§6.3–6.5 多次写"v2 不变"，但仓库没有独立 v2，当前章节也未保留布局契约、
字号 floor、换行策略、HTML Fit 时机等内容。必须把最终决策完整写回 v3。

### P0：缺媒体 FAIL 放错阶段

R2 要求在 scene-rules preflight 直接 FAIL，但 preflight 位于自动素材搜索之前
（`main.mjs:114-130` 与 `:155-230`）。这样会阻止自动 sourcing 修复缺失媒体。应改为：

- preflight：可修复的缺媒体为 pending/WARN；
- Step 1.5c 后：按最终场景和文件存在性硬 FAIL；
- `mediaOptOut=true` 与媒体依赖布局组合立即 FAIL；
- `stacked-cards` + `mediaOptOut=true` 应 PASS，不应继续 WARN。

### P1：F6 不能复现所声称的布局

scene-templates 没有 media-split，qwen4 的 HTML renderer 也忽略 scene.layout。
真正的 420px media-split 在 `NarrativeScene.tsx:162-203`。F6 应直接渲染真实
Remotion NarrativeScene，或者先实现 HTML 布局等价性。

### P1：Assert 几何算法仍不够可执行

没有统一坐标系，也重复计算随机余量。rough-notation 的随机偏移已写入最终 SVG path d，
取实际 path bbox 后不应再次加 maxRandomnessOffset。应明确：

- `getBBox()` → `getScreenCTM()` 转换四角；
- slot、文本、SVG 全部统一到 viewport 或 composition 坐标；
- 只另算真实 stroke paint margin；
- 明确定义每个模板的 settled frame，以及 transient animation 是否允许暂时越界。

### P1：两项"反驳 review"本身是错的

- `npx remotion add` 确实存在（本地 CLI、CLI 源码、官方文档均确认）。正确流程是
  选定目标版本后执行 `upgrade --version <target>`，再用 `remotion add @remotion/layout-utils`
  安装匹配版本。
- 生产目录实际有 15 个 `content/**/scenes.mjs`，其中 14 个包含 font-size 或 fontSize，
  不是 10/4。5 个显式声明 renderer 这一项正确。

### P1：圆标注碰撞仍没有自动验收

F4 只检查标注是否越 slot，不检查圆是否压到 subject 或 numberLabel。R2 又同时写
"A+B"和"推荐 A+C"，且 `box="inside"` 不能自动保证目标数字本身可读。应增加 Hook
稳定帧碰撞 fixture，并把"重叠面积≈0"改成可计算阈值，明确排除被标注目标本身。

### P2：R2 仍有过时结论

§4 仍推荐方案 A，而 §1 初判 A2；仍推荐"字符分档降字号 + 预算收紧"，与 Proposal 的
真实几何 Fit/WARN 定位冲突；圆修复章节标题与最终推荐组合不一致。R2 应只保留视频级
结论，文本方案只链接 Proposal，避免两个真源。

## 最终判断（三轮）

仍是 Request changes，但已接近可批准。

---

# 四轮 review（2026-08-30 追加，针对 v3.1）

> Verdict: **Request changes，但已非常接近可进入 Grill**。
> 接收方核实标注见 Proposal §1.4。

已确认修正：A2、阶段化媒体门控、真实 MediaSplit F6、SVG 坐标换算、F7、CLI 与 15/14 盘点。

## 剩余阻断项

### minSize 自相矛盾

§5/F2 要求 fontSize ≥ minSize，§6.1 又允许缩至 minSize × 0.9。
应取消 0.9 降级，或明确拆成 softMinSize / hardMinSize，同步所有验收条件。

### HTML 路径仍可能假绿

main.mjs 先写入 HTML；verify-scene-dom.mjs 却重新调用 generateScene() 验证另一份内存 HTML；
record-scenes.mjs 最后录制之前写入的文件。F1–F7 又明确全部使用 Remotion still，
没有 HTML 红绿 fixture。必须让 Fit 结果作用于并持久化到实际录制文件，
Verifier 与 Recorder 消费同一产物，并增加 HTML 路径回归测试。
还需定义 HTML 模板到 slot contract 的映射，因为 qwen HTML renderer 不处理 scene.layout。

### DOM 几何仍不等于文字绘制边界

getBoundingClientRect()、Range、scroll 指标都可能漏掉字形 ink overhang。
本地浏览器测试中，Times italic T / f 可超出 advance box 约 5–11px，而 scroll 指标仍合法。
需要补充 ink-bound/inset 或像素回归机制。
同时，GDN + QSA 的 G 未测出左侧 overhang，R2 §3.2 的负 bearing 根因目前不能成立，
只能保留为待调查现象。

### Highlight 契约与实现、现有数据冲突

NarrativeScene 只把 highlight 当 truthy，实际框住整个 result。新契约却要求它是 result 子串。
qwen Scene 6 实测违反契约：LOOKS UP 位于 action，不在 MICRO-BLOCK PRECISION 中。
应选择并真正实现一种语义：结构化 {field, text} 局部标注，或 whole-result boolean。
不要校验一个渲染器实际上忽略的字符串。

### 最终媒体 gate 未覆盖 render-only.mjs

R2 只指定 Step 1.5c 后检查，但 render-only 没有 sourcing 阶段。
应抽成共享 final-media gate：main 在 sourcing 后调用，render-only 在渲染前调用。

### 验收覆盖仍有缺口

- transient SAFE_ZONES 保证没有定义逐帧采样或可见性阈值，StampIn 又会从 2× 缩放。
  要么删除该保证，要么明确测试全部入口帧。
- Proposal 写 9 个 Remotion 模板，但 FullscreenMedia.tsx 还渲染动态 media.source，
  必须纳入 slot/几何契约。
- F6 使用"历史长文案"，但 v1/v2 已明确不可恢复。应把确定性的完整 fixture 文案
  直接写入方案。

### R2 仍需清理的旧文本

§5：≈0 → ≤ 2%；§5c.2：10 个内容包 → 15 个生产 scenes.mjs；§5c.6：直接 WARN→FAIL →
阶段化门控；圆字号：220 与 240 二选一；Proposal v3 → v3.1；
Review archive 标题应覆盖"二、三轮"，与实际追加内容一致。

## 最终判断（四轮）

完成这些文档修订后，我会批准进入 Grill。
