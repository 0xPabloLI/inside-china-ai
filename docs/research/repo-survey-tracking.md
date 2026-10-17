# Repo Survey Tracking

追踪外部 repo 调研结论。每个 repo 调研后记录日期、结论、子 issue。

关联 issue：[#302](https://github.com/0xPabloLI/inside-china-ai/issues/302)（追踪）、[#291](https://github.com/0xPabloLI/inside-china-ai/issues/291)（总入口）

---

## A. 库存视频拼接

### MoneyPrinterTurbo (harry0703/MoneyPrinterTurbo, 123k★)

- **调研日期**: 2026-09-14
- **本地路径**: `docs/research/MoneyPrinterTurbo/`（gitignored, 1.0G）
- **技术栈**: Python + MoviePy + ffmpeg + PIL（不用 Remotion）
- **素材机制**: LLM 提取搜索词 → Pexels/Pixabay/Coverr API 搜视频 → 按方向/时长/分辨率过滤 → 下载 → ffmpeg 拼接
- **质感来源**: (1) 素材本身是专业实拍 1080×1920; (2) MoviePy 拼接去重 + 转场; (3) 字幕弹跳动画 + 圆角背景 + BGM
- **没有模板系统**: 全屏实拍视频 + 底部字幕条 + BGM

**值得吸收的**:

1. stock-video-first 路线：整个视频 = 库存实拍视频拼接
2. 搜索时 `orientation=portrait` + 精确分辨率匹配（不裁切）
3. `_prioritize_unique_source_clips`：同源去重，避免素材重复
4. sequential 模式：按叙事顺序选素材（适合新闻）
5. 长视频按 max_clip_duration 切段，持续补充到覆盖音频时长

**不适用的**:

- 字幕弹跳动画（偏娱乐风格，新闻需克制）
- 无模板设计（我们需要 Remotion 模板）

**子 issue**: [#301](https://github.com/0xPabloLI/inside-china-ai/issues/301)（库存视频策略改造）

---

## B. Remotion 模板设计

### locomotion (`locomotion-pro/locomotion`，17★)

- **调研日期**: 2026-10-17
- **Repo 修正**: 追踪文档原写 `remotion-dev/locomotion`（`gh api` 实测 404），实际仓库是 [`locomotion-pro/locomotion`](https://github.com/locomotion-pro/locomotion)
- **本地路径**: `/tmp/locomotion-survey/`（浅 clone，HEAD `d42711f9`，2026-04-01 "Update template count to 67"；会话临时目录，非仓库资产）
- **技术栈**: 纯 Remotion `^4.0.441` + React `^19.2.4` + TypeScript + Vite——**与我们 `scripts/short-video/remotion` 同主版本**，无需适配层即可对照
- **规模**: README 自述 67 个模板；实测 `src/templates/*/Composition.tsx` 共 **61 个模板**，每模板单文件 45–135 行（合计 3476 行），props 可编辑（text/color/variant）
- **许可**: ❌ **无 LICENSE 文件，`package.json` 无 `license` 字段且 `private: true` → 全权保留**。README 大字写「Copy the code」但**无许可即不可合法照搬代码**——只能吸收设计模式与实现思路，不得整文件 copy 进本仓（对比 `agent-video-skills-180-screening-2026-09.md` §2 许可口径）
- **档级判定**（按 180-screening §2 五口径）: **Tier B 只读**——许可 ✗、付费云绑定 ✓（纯本地 Remotion，无外部 API）、NVIDIA 假设 ✓（无）、活跃度 ✗（HEAD 停在 2026-04-01，近半年无提交）、能力重复 ✓
- **视觉系统（最值得吸收）**: 一个**正交风格层**——[styles.ts](https://github.com/locomotion-pro/locomotion/blob/d42711f950c2c6776056df4d9c7c729d4490ba50/src/lib/styles.ts) 定义 6 个 `StyleVariant`（default / brutalist / rounded / minimal / glass / neo），每个只声明一组视觉 overrides（`borderRadius` `fontWeight` `shadow` `borderWidth` `borderColor` `bgStyle` `bgGradient` `letterSpacing` `fontFamily`）；[useStyle.ts](https://github.com/locomotion-pro/locomotion/blob/d42711f950c2c6776056df4d9c7c729d4490ba50/src/lib/useStyle.ts) 的 `getCompositionStyles(variant)` 把这组 overrides 派生成卡片/文字样式并注入**每个模板**。**布局与风格彻底解耦**：同一模板切换 variant prop 即得 6 种外观，模板内不写死配色/圆角/字体
- **动画语言**: `grep` 实测——**57/61 用 `spring()`、60/61 用 `interpolate()`、0 处 `Math.random()`（全确定性）**、0 处 `Easing.*`（纯弹簧驱动，不混 bezier）。弹簧配置收敛为 **3 档 presets**：标题 `{stiffness:200, damping:20}`、逐项 stagger `{stiffness:180–200, damping:14–16}`、强调/徽章 `{stiffness:250, damping:12}`
- **我们现状差距（同一 grep 口径，证据）**: `scripts/short-video/remotion/src/` **0 处 `spring()`**、47 处 `interpolate()`、仅 2 处自定义 `Easing.bezier`（`components/shared.ts:36/39` 的 `easeOut`/`easeOutExpo`）；**无风格变体/token 层**（`getCompositionStyles`/`styleVariant` 零命中）→ 直接印证 #291 的两条根因假设（「动画缺节奏」与「缺统一视觉语言」），并给出可落地路径

**值得吸收的**:

1. **正交 style-token 层 + 单一派生入口**——`StyleVariant.overrides` 表 + `getCompositionStyles(variant)`，与我们的 `LayoutDescriptor` 思路同构，可用于 #291 建立配色/字体/圆角/阴影的统一语言
2. **spring 3 档 presets**——`{200,20}` 标题 / `{180–200,14–16}` 逐项 / `{250,12}` 强调；替换我们当前的 `Easing.bezier` 线性缓动，补上「节奏感」
3. **逐项 stagger delay 模式**——`delay = base + i * step`（如 StaggeredWords `i*6`、BarChartReveal `10+i*8`、MetricCard bar `20+i*3`），多元素依次入场
4. **数据动画技法**——`MetricCard` 的 rolling counter（`Math.round(interpolate(numberS,[0,1],[0,numericVal]))` + `toLocaleString()`）、sparkline 按进度切片采样点（`slice(0, ceil(len*progress))`）、确定性 confetti（三角函数派生，非随机）→ 对应 `StatRevealScene` / `DataScene`
5. **每模板单文件 + props 可编辑**的最小结构（无 package、无 wrapper）——与我们 scene 组件形态接近，便于对照

**场景映射**（对照我仓 `remotion/src/scenes/`）:

| locomotion 模板 | 我仓 scene | 可借鉴技法 |
| --------------- | ---------- | ---------- |
| StaggeredWords / BoldTextPunch | HookScene | 逐词 stagger 弹簧 + opacity/translateY |
| ConceptBreakdown / StepExplainer | ContextScene / ContrastScene | eyebrow 小标签 + 标题 + 逐条 bullet 弹簧 |
| QuoteCard | QuoteScene | 卡片/引文/作者三段错位弹簧 |
| BarChartReveal / StatsDashboard | DataScene | 逐柱 `10+i*8` 弹簧高度 |
| MetricCard / SalesCard | StatRevealScene | rolling counter + sparkline + 逐条 bar |

**不适用的**:

- 模板面向 SaaS / 产品营销（Product Hunt、confetti、销售卡片等娱乐化元素），新闻场景需克制——照搬会走向「营销腔」而非「信息型」
- 多数模板按 web 横屏预览编排（固定 480–520px 卡片宽度），**无 9:16 竖屏版式**，直接复用需自行改比例与安全区
- 无许可 → 代码不能复制；下列「吸收」均为**模式/技法重写**，非源码搬运

**子 issue**: 无（本轮纯调研）。是否将「引入 spring presets + 正交 style-token 层」落为实施票，属 **#291**（HITL wayfinder map）的收敛决策，不由本追踪票单方开票

**详细报告**: 本节即为结论（无独立报告文件；本地 clone 为会话临时目录，仓库不留资产）

### av/remotion-bits (491★)

- **调研日期**: 待调研
- **描述**: Remotion 组件库（charts/transitions/text reveals；`master` 分支，2026-09-15 有提交）
- **目标**: 可复用组件参考

---

## C. 信息可视化

### anything2explainer (1182★)

- **调研日期**: 待调研
- **描述**: 黑底+白线条+紫点缀风格，9 阶段管线+QC，PolyForm Noncommercial
- **目标**: 数据/对比 scene 的信息图设计参考
- **注意**: 只做横屏，许可限制

---

## D. 整体管线

### video-shotcraft (8435★)

- **调研日期**: 待调研
- **描述**: 最高星短视频生成 repo
- **目标**: 管线架构参考

### video-talkcraft (979★)

- **调研日期**: 待调研
- **描述**: 对话/讲解类视频生成
- **目标**: 叙事结构参考

### Pixelle-Video (ATH-MaaS/Pixelle-Video, 28.6k★)

- **调研日期**: 2026-10-01
- **本地路径**: `/private/tmp/pixelle-video-survey/`（浅 clone，HEAD 2026-06-14，会话临时目录非仓库资产）
- **技术栈**: Python + Streamlit + FastAPI + ComfyUI/RunningHub 工作流 + **HTML 模板经 Playwright 截屏出帧** + ffmpeg-python 拼接（不用 Remotion/MoviePy 做主合成）
- **素材机制**: LLM 写旁白（默认 5 分镜）→ 每句 AI 图或 AI 视频 → TTS 定时长 → 模板出帧 → 拼接
- **维护状态**: main 末次提交 2026-06-14、release 停在 v0.1.15（2026-01-27）、文档站部署停在 2026-01-08、open issue 146/closed 41；同 org 的 ComfyUI-Copilot 仍活跃，属注意力转移而非组织瓦解
- **档级判定**（按 `agent-video-skills-180-screening-2026-09.md` §2 五口径）: **Tier B 只读**——Apache-2.0 ✓、付费云绑定 ✗（15/23 类工作流仅 RunningHub，含全部数字人与动作迁移）、NVIDIA 假设 ✗、活跃度 △、能力重复 ✓

**值得吸收的**:

1. 25 个竖屏 HTML 版式（Apache-2.0 可改写）作为 `mediaStrategy` 模板候选清单
2. `static_*` / `image_*` / `video_*` 前缀即「是否需要 AI 素材」的受控分类，适合做门禁判据
3. 原子 REST 端点形态（`/frame/render`、`/tts/synthesize` 单独可调），比整条 `main.mjs` 跑到底更利于 agent 局部重试

**不适用的**:

- 出帧形态是「插画轮播 + 配音」，正是平台治理的重复性内容形态；我们的 Remotion 动画层不能退化过去
- 本地路线要求 NVIDIA 显卡，M2 Pro 32GB 走不通；云路线主推第三方付费实例
- 零测试 / 零 CI / 文件服务词法白名单（点段序列可绕，见报告 §Key Findings 7），不具备复用价值

**详细报告**: `docs/research/pixelle-video-research-2026-10-01.md`（无子 issue：本轮为纯调研，未授权实施）

- **2026-10-02 实跑验证**: 已在本机（M2 Pro）隔离跑通最低成本档——本地 Ollama 文案 + edge-tts + `static_default` 模板，**0 元、无 ComfyUI、无 RunningHub**；成片 1080×1920 / 27.04 s / 4 分镜 / 端到端 41 s，样片在 `scripts/short-video/experiments/pixelle-video-sample/`。帧差实测同场景 ≤0.008、仅 3 处分镜切换跳变 → 「卡片轮播」判词由推断升级为观测。三个部署坑（Playwright 内核缺失且报错点很深、thinking 模型空 content 仍继续、默认 `n_batch` 必崩）与 RunningHub《付费服务协议》二.2.2「**非商业用途**」条款均已核实——后者对我们是**条款级阻断**，不是价格问题。

---

## E. 完整分类索引

66 个 repo 的 7 类分类（A-G）在 #291 评论中。
