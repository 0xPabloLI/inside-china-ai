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

- **调研日期**: 2026-10-17
- **本地路径**: `/tmp/remotion-bits-survey/`（浅 clone，HEAD `de35fda8`，2026-09-15 "chore: sync docs lockfile to v0.2.1"；会话临时目录，非仓库资产）
- **技术栈**: Remotion + React + TypeScript；npm 包 `remotion-bits@0.2.1`（monorepo：`src/` 组件 + `demo/` + `docs/` + `skills/`）
- **许可**: ✅ **MIT**（`package.json` `license: "MIT"`）→ **可合法吸收，含源码**（保留许可与署名）。与 locomotion 的无许可构成关键对比
- **规模**: `registry.json` 共 **66 个 bit**；`src/components/` 核心组件 10 个——AnimatedText、AnimatedCounter、StaggeredMotion、TypeWriter、MatrixRain、CodeBlock、GradientTransition、ScrollingImages、Scene3D（Element3D/Step/StepResponsive）、ParticleSystem（Behavior/Spawner/Particles）；其余为 `bit-*` 示例 composition（bar-chart / stat-rings / ken-burns / lower-third / list-reveal / typewriter 变体等）
- **档级判定**（按 180-screening §2 五口径）: **Tier A（可直接吸收）**——许可 ✓ MIT、付费云绑定 ✓（纯本地）、NVIDIA 假设 ✓（无）、活跃度 ✓（2026-09-15 有提交）、能力重复 ✓（组件库正好补我们缺的动效原语）

**最值得吸收的（超越 locomotion 的系统性设计）**:

1. **shadcn 式组件注册表 + Agent 摄取通道（可复制范式）**——`registry.json`（66 items）+ CLI `npx remotion-bits find/fetch/mcp` + jsrepo（`npx jsrepo add --registry https://unpkg.com/remotion-bits/registry.json <bit>`）+ **MCP server 仅暴露两个工具**（`find_remotion_bits` 发现 / `fetch_remotion_bit` 取全源码）+ 自带 [`skills/remotion-bits/SKILL.md`](https://github.com/av/remotion-bits/blob/de35fda84b7b6acbe549a0b302a82ef211e8ef1e/skills/remotion-bits/SKILL.md)（声明 fallback 链 MCP → CLI → package）。这是「外部设计资产 → 本仓」的**可复制摄取范式**，正对我们的调研-吸收流程
2. **契约驱动 catalog**——[contracts.ts](https://github.com/av/remotion-bits/blob/de35fda84b7b6acbe549a0b302a82ef211e8ef1e/src/catalog/contracts.ts) 的 `RemotionBitCatalogSummary` 自描述清单（`exportName`/`id`/`name`/`description`/`tags`/`duration`/`width`/`height`/`sourcePath`/`componentNames`/`registryDependencies`），与我们 `LayoutDescriptor` 单一真值源思路同构
3. **声明式动画原语层**——`src/utils/motion` 提供 `useMotionTiming` / `useStepTiming` / `buildMotionStyles` / `interpolateKeyframes` / `getEasingFunction` / `StepTimingContext` + 分组 typed props（`TransformProps` / `VisualProps` / `TimingProps` / `AnimatedValue`）；组件**不手写弹簧**，而以 keyframes + progress + delay 组合（如 `AnimatedCounter` 的 `interpolateKeyframes(values, progress, easingFn, duration)` 支持 keyframe 数组与 hold 帧）→ 比 locomotion 的「每模板各写 spring」更系统、可组合
4. **`Step` 声明式时序上下文**——`Scene3D.Step` 以 stagger 方向（`forward`/`reverse`/`center`/`random`）自动计算子元素错位，`random` 走 Remotion 确定性 seeded random

**与我仓最相关的 bit 清单**（供 #291 收敛选型）: `bit-lower-third`（下三分之一）、`bit-bar-chart`、`bit-stat-rings`、`bit-ken-burns`（对比 #357 刚把视频动效收敛到 fade——Ken Burns 是另一条慢速动效路线）、`bit-list-reveal`、`bit-staggered-fade-in`、`bit-word-by-word`、`animated-counter`、`Scene3D`/`bit-carousel-3d`（相机驱动演示）

**场景映射**（对照我仓 `remotion/src/scenes/`）:

| remotion-bits bit/组件 | 我仓 scene | 可借鉴技法 |
| ---------------------- | ---------- | ---------- |
| AnimatedText / bit-word-by-word / bit-char-by-char | HookScene / NarrativeScene | keyframe+stagger 文字动效原语 |
| AnimatedCounter / bit-bar-chart / bit-stat-rings | StatRevealScene / DataScene | 声明式数值插值与环形/柱状数据可视化 |
| bit-lower-third | InfoCardScene / CtaScene | 下三分之一信息条版式 |
| bit-ken-burns / Scene3D | FullscreenMedia | 慢速 Ken Burns 与相机驱动演示 |
| StaggeredMotion / bit-list-reveal | 通用入场 | StepTimingContext 方向化错位 |

**不适用的**:

- MatrixRain / glitch / particle-fountain 等偏娱乐化特效，新闻场景需克制
- Scene3D / ParticleSystem 依赖 3D/粒子栈，引入会增加渲染体积与 GPU 负担，非其值不进生产线
- 本轮为**只读源码调研**，未实跑 `npx remotion-bits`/MCP 摄取（授权边界内不做安装验证）——摄取通道结论基于其 README/SKILL.md/源码取证，实际接入成本未实测

**子 issue**: 无（纯调研）。是否引入「Agent 摄取通道（MCP/CLI）+ 声明式 motion 原语层 + 具体 bit」属 **#291**（HITL wayfinder map）的收敛决策

**详细报告**: 本节即为结论（无独立报告文件；本地 clone 为会话临时目录，仓库不留资产）

**维度 B 状态**: ✅ 完成（2026-10-17；两 repo `locomotion-pro/locomotion` 与 `av/remotion-bits` 均已调研并落结论）。跨 repo 综合：locomotion 提供「正交 style-token 层」思路但无许可；remotion-bits 提供「Agent 摄取通道 + 声明式 motion 原语 + 契约 catalog」且 MIT 可合法吸收——两者共同指向 #291 的两条根因（缺统一视觉语言、缺动画节奏），具体选型待 #291 收敛

---

## C. 信息可视化

### anything2explainer ([`Vincentwei1021/anything2explainer`](https://github.com/Vincentwei1021/anything2explainer)，2548★)

- **调研日期**: 2026-10-17
- **Repo 定位**: 追踪文档原只记「anything2explainer (1182★)」未记 owner；`gh search` 定位到唯一高星同名仓库，即上列 URL。**旧记的 1182★ 已过时**（现 2548★，forks 345）
- **本地路径**: `/tmp/anything2explainer-survey/`（浅 clone，HEAD `735c79c`，2026-09-18 "feat(overlay): 片尾默认署名…"；会话临时目录，非仓库资产）
- **技术栈**: 单文件 [`SKILL.md`](https://github.com/Vincentwei1021/anything2explainer/blob/735c79c8724e897e8971cd59dde7e5aa11e4d6ce/SKILL.md) 编排的 Claude Code / Codex skill + Remotion `4.0.507` 可编译模板（`template/`）+ Python 工具链（`tts_build.py` 配音与时间轴 / `frame_metrics.py` / `motion_check.py` / `selfcheck.py`）；TTS 默认 **edge-tts（中文云希）/ kokoro-82m（英文 `am_liam`）**——均免费或开源，**无付费 API 硬绑定，无 CUDA 假设**（M2 Pro 可本地跑）
- **形态与规模**: **1280×720@30fps 横屏**；黑底 + 白线条 MG + 紫色点缀，顶部紫胶囊 HUD、44px 白字黑边字幕、底部章节进度条；全片代码绘制（可选免版权 B-roll）；幕底三选（点阵波默认 / 星点+雾底）。`template/src` 实测 **39 个 `.ts/.tsx`、1932 行**——[`ui.tsx`](https://github.com/Vincentwei1021/anything2explainer/blob/735c79c8724e897e8971cd59dde7e5aa11e4d6ce/template/src/ui.tsx) 69 个图元 export、[`fx.tsx`](https://github.com/Vincentwei1021/anything2explainer/blob/735c79c8724e897e8971cd59dde7e5aa11e4d6ce/template/src/fx.tsx) 21 个光效/运镜 export、`common/` 82 个 export；`shots/G1–G8` 8 个构建组；样片《RAG 与知识库》4′35″ / 44 镜头 / 两轮 QC
- **管线**: **9 阶段**（阶段 0 建项目 → 1 调研 → 2 解说词与时间轴 → 3 分镜 → 4 覆盖层与图元 → 5a 打样/5b 并行构建 → 6 渲染 → 7 QC 与修复 → 8 交付）+ **4 个强制 HITL 确认点**（时长与语言 / 文案定稿 / 配音 / 前 30 秒样片）
- **许可**: ❌ [`LICENSE`](https://github.com/Vincentwei1021/anything2explainer/blob/735c79c8724e897e8971cd59dde7e5aa11e4d6ce/LICENSE) = **PolyForm Noncommercial 1.0.0** + 附加条款「非商用免费；**任何商用需作者事先授权**」+ `Required Notice: Copyright (c) 2026 Vincent Wei`（GitHub 识不出 SPDX → 显示 NOASSERTION）。**代码、模板、字体、样片帧一律不得复制进产线**，只吸收规则与版式（同 `video-talkcraft` / `OpenMontage` 先例）
- **维护状态**: created 2026-09-08、last push 2026-09-18（29 天）、7 open issues、单作者
- **档级判定**（按 `agent-video-skills-180-screening-2026-09.md` §2 五口径）: **Tier B 只读**——许可 ✗（PolyForm 非商用，代码不得进产线）、付费云绑定 ✓（默认 edge-tts / kokoro 本地免费）、NVIDIA 假设 ✓（无）、活跃度 ✓（29 天，在 90 天内）、能力重复 △（Remotion 管线 / 字幕 / 进度条我们已有；**帧级量化判据 + 数据/对比版式库 + 三闸门脚本不重复**）

**值得吸收的**:

1. **尺寸三档 + 空场判据**（`reference/composition-and-light.md` §1/§6）：主角 ≥170px（或大字 ≥96px 且整行宽 ≥300px）、配角 60–110、标签与说明 22–30，**三档之外无第四种尺寸**；内容区最大物体 <110px 持续 >45 帧即中级缺陷。这条对我们现有 24–96px 的文字块直接生效——`DataScene`/`ContrastScene` 现在正是「小字 + 小 chip」撑场
2. **光跟主角**（同文件 §2）：主角必带光（图形用双层紫柔光、大字用 `TEXT_GLOW` + 紫硬投影、橙色指标数字用 `GLOW_ORANGE`），配角默认不发光，一帧内紫色重点 ≤1 处，重点转移时前一处 8 帧灭灯；光只有三层——白 bloom（结构线条常驻）< 紫柔光（主角常亮 + 当前重点）< 白闪（3–6 帧事件）。我方 `FrameGlow variant="amber"` 是全屏泛光，**不是**「主角光」
3. **动词驱动的持续动作 + 落位停留**（§7）：每个字幕块讲的动词在画面上要有持续到下一拍的动作（数据流 / 光点沿箭头跑 / 逐格点亮 / 打字机 / 生长 / 旋紧队列）；元素入场后完全静止 ≤3s；**末拍落位后必须停 30–45 帧再离场**——「入场即停」与「落位即切」都判缺陷；并明确「不为凑指标给静止物体加漂浮 / 呼吸」。我方 scene 动画只有 `StampIn/SlideUp/FadeIn`（入场即停，无持续动作、无末拍稳定期），这是最直接的质量缺口
4. **数据/对比版式库**（我们缺的四种拓扑）：大数字型 set piece（`BigNumber`/`countTo` 20 帧计数落定 + 单位小字 + 对照物 + 结论文字 `GlitchIn`）；左右对比（左 x≈300–380 / 右 x≈900–1000、标签 Pill 在上 y≈250、中间 ≈ / vs / + 符号 46–60px）；图表卡（440×300 白边黑底 + 网格 #4A4A4A 1px + 坐标字 15–18px + 紫曲线 3px + 红重点）；流程/因果节点（Pill 150×44 或 Box 200×70、间距 200、箭头 shaft 3 headL 22–24）
5. **表现「多」用矩阵而非碎屑**（§1）：数量感用 ≥6px 的方点阵列或网格整齐排布、按节拍点亮；背景只留幕底，不撒氛围小图标
6. **三闸门量化脚本**（可直接对标的品类）——`frame_metrics.py`（逐镜头最大物体高度 / 主角区柔光面积 / 紫色碎片指数 / 碎屑计数 → 带严重度表）、`motion_check.py`（逐镜头最长静止 ≤3s、末拍稳定期 ≥30 帧；组级与成片两个口径，**成片 `fin_frames` 为准**）、`selfcheck.py`（静态：帧覆盖 vs 分镜表、`GlitchIn` 数 vs 闪烁白名单、扫光组件 vs 扫光白名单、画面字面量 vs 事实清单）。我方现存 `text-gate.tsx` / `annotation-collision-gate.tsx` / `final-media-gate.mjs` 只覆盖文字适配与最终媒体，**没有帧级视觉 / 节奏量化**
7. **白名单式门禁纪律**：「闪烁白名单」（每镜头 ≤1 处 `GlitchIn`）、「扫光白名单」（全片 `LightSweep`+`StageLine`+`GhostText` ≤2 处，只给核心概念首次登场），写进分镜全局约束并由脚本终检核对——把「贵的动效限量」做成可校验清单，值得照搬成我们的 manifest 式约束
8. **全片一个贯穿示例语境**（样片「差旅报销」），跨 8 个构建组一致——与我们 `brand-system` 的示例一致性要求同源
9. **4 个 HITL 确认点**与我们内容管线 HITL 同源，但其「**前 30 秒样片**」把手改成本从「整片重渲」压到「1 个构建组」，是可借鉴的成本控制点

**场景映射**（对照我仓 `scripts/short-video/remotion/src/scenes/`）:

| anything2explainer 版式 / 图元 | 我仓 scene | 可借鉴规则 |
| --- | --- | --- |
| 大数字型 set piece（`BigNumber`/`countTo` 计数落定 + 单位小字 + 对照物） | `StatRevealScene` | 数值滚动落定 + 必配对照物 + `GLOW_ORANGE`（我方现仅 `textShadow` 泛光） |
| 年份/出处型（`BigNumber` 96px 滚动 + 机构胶囊 + ≥240 宽卡在旁） | `DataScene` | 出处做成胶囊而非底层小字；年份/大数字不得独站空屏 >30 帧 |
| 左右对比版式（左 x≈300–380 / 右 x≈900–1000、标签在上、中间符号 46–60px） | `ContrastScene` | 中间符号 + 标签在上/说明在下；替代当前 `flex-wrap` 卡片堆 |
| 图表卡（440×300 白边黑底 + 网格 + 紫曲线 + 红重点） | `DataScene`（缺） | 量化图表版式，替代静态图 / 纯数字 |
| 卡片阵列（卡 150×92 r8、列距 24、2 帧错峰、≥12 张缩到 70 宽） | `InfoCardScene` | 尺寸三档 + 错峰入场 |
| 流程/因果节点（Pill 150×44 或 Box 200×70、间距 200、箭头） | `ContextScene`（缺） | 因果链 / 流程版式 |
| 「多」= ≥6px 方点阵列 / 网格按节拍点亮 | 通用背景 | 数量感用矩阵；背景只留幕底，禁碎屑 |
| 尺寸三档 + 空场判据（§1/§6） | 全部 scene | 直接约束现有 24–96px 文字块 |
| 光跟主角（§2） | 全部 scene | 主角光 ≠ 全屏泛光 |
| 持续动作 + 落位停留 30–45 帧（§7） | 全部 scene | 补上「入场即停」缺口 |
| `frame_metrics.py` / `motion_check.py` / `selfcheck.py` 三闸门 | `text-gate.tsx` / `annotation-collision-gate.tsx` / `final-media-gate.mjs` | 增补帧级视觉与节奏量化 |

**不适用的**:

- **许可阻断**：PolyForm Noncommercial + 商用需授权 → 代码、模板、字体、样片帧一律不得进产线（这是我方第三次遇同类许可，前两次 `video-talkcraft`、`OpenMontage`）；下列「吸收」均为**规则/版式重写**，非源码搬运
- **只做横屏 1280×720@30fps**：我们是 1080×1920 竖屏，其安全区与尺寸三档的像素阈值需按竖屏重算，不能直接搬
- **视觉体系不同**：它是「黑底 + 白线条 + 紫重点」，我们是 amber / blue 品牌令牌 + `GridBg`/`Scanlines`；只吸收**结构性规则**（尺寸档、光跟主角、持续动作、版式拓扑），不吸收其配色
- **重人工编排**：9 阶段 + 4 HITL + 8 构建组 + 两轮 QC ≈ 2 小时/条，是「精雕单片」的工作流，不是我们按题材批量出片的自动化管线；吸收其**判据与版式**，不吸收其**多 agent 编排与耗时模型**
- **样片示例数据非真值**：「差旅报销」是示例语境，其数字标注「示意」，不可当事实源

**交叉引用**: 其点阵波幕底明确标注**移植自 `video-talkcraft` 的 `motion-systems/backdrop.tsx`**（[README](https://github.com/Vincentwei1021/anything2explainer/blob/735c79c8724e897e8971cd59dde7e5aa11e4d6ce/README.md) 第 38 行），视觉语言致敬抖音 @图灵宇宙（画面全自绘）——`video-talkcraft` 是我们 **D 段目标 repo**，两段调研可互相印证

**子 issue**: 无（本轮为纯调研，未授权实施）。是否把「尺寸三档 / 光跟主角 / 持续动作 / 帧级闸门」落为实施票，属 **#291**（HITL wayfinder map）的收敛决策，不由本追踪票单方开票

**详细报告**: 本节即为结论（无独立报告文件；本地 clone 为会话临时目录，仓库不留资产）

**维度 C 状态**: ✅ 完成（2026-10-17；`anything2explainer` 已调研并落结论）。定性：这是**只读方法学**源——许可阻断代码复用，但其「尺寸三档 + 光跟主角 + 动词驱动持续动作 + 数据/对比版式库 + 三闸门量化脚本」正对着我方数据/对比 scene 的**信息图语法缺口**（现 `DataScene`/`StatRevealScene`/`ContrastScene` 仅入场动效、无量化图表、无主角光、无末拍停留）；具体选型待 #291 收敛

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
