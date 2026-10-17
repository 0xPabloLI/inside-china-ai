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

| locomotion 模板                  | 我仓 scene                   | 可借鉴技法                               |
| -------------------------------- | ---------------------------- | ---------------------------------------- |
| StaggeredWords / BoldTextPunch   | HookScene                    | 逐词 stagger 弹簧 + opacity/translateY   |
| ConceptBreakdown / StepExplainer | ContextScene / ContrastScene | eyebrow 小标签 + 标题 + 逐条 bullet 弹簧 |
| QuoteCard                        | QuoteScene                   | 卡片/引文/作者三段错位弹簧               |
| BarChartReveal / StatsDashboard  | DataScene                    | 逐柱 `10+i*8` 弹簧高度                   |
| MetricCard / SalesCard           | StatRevealScene              | rolling counter + sparkline + 逐条 bar   |

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

| remotion-bits bit/组件                             | 我仓 scene                  | 可借鉴技法                          |
| -------------------------------------------------- | --------------------------- | ----------------------------------- |
| AnimatedText / bit-word-by-word / bit-char-by-char | HookScene / NarrativeScene  | keyframe+stagger 文字动效原语       |
| AnimatedCounter / bit-bar-chart / bit-stat-rings   | StatRevealScene / DataScene | 声明式数值插值与环形/柱状数据可视化 |
| bit-lower-third                                    | InfoCardScene / CtaScene    | 下三分之一信息条版式                |
| bit-ken-burns / Scene3D                            | FullscreenMedia             | 慢速 Ken Burns 与相机驱动演示       |
| StaggeredMotion / bit-list-reveal                  | 通用入场                    | StepTimingContext 方向化错位        |

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
3. **动词驱动的持续动作 + 落位停留**（§7）：每个字幕块讲的动词在画面上要有持续到下一拍的动作（数据流 / 光点沿箭头跑 / 逐格点亮 / 打字机 / 生长 / 旋紧队列）；元素入场后完全静止 ≤3s；**末拍落位后必须停 30–45 帧再离场**——「入场即停」与「落位即切」都判缺陷；并明确「不为凑指标给静止物体加漂浮 / 呼吸」。我方现状：`components/animations/entrance.tsx` 的 8 种原语（`FadeIn`/`SlideUp`/`SlideLeft`/`SlideDown`/`ScaleIn`/`StampIn`/`SlideRight`/`SlideUpFromBottom`）**全是入场即停**、无末拍稳定期；同目录 `loops.tsx` 另有 5 个环境循环原语（`PulseDot`/`NumberPulse`/`LogoPulse`/`ScanSweep`/`GlitchFlash`），但属氛围循环、非「按字幕块动词驱动的持续动作」，也无「落位后停 30–45 帧」的预算概念——两者合计仍是本段最直接的质量缺口
4. **数据/对比版式库**（我们缺的四种拓扑）：大数字型 set piece（`BigNumber`/`countTo` 20 帧计数落定 + 单位小字 + 对照物 + 结论文字 `GlitchIn`）；左右对比（左 x≈300–380 / 右 x≈900–1000、标签 Pill 在上 y≈250、中间 ≈ / vs / + 符号 46–60px）；图表卡（440×300 白边黑底 + 网格 #4A4A4A 1px + 坐标字 15–18px + 紫曲线 3px + 红重点）；流程/因果节点（Pill 150×44 或 Box 200×70、间距 200、箭头 shaft 3 headL 22–24）
5. **表现「多」用矩阵而非碎屑**（§1）：数量感用 ≥6px 的方点阵列或网格整齐排布、按节拍点亮；背景只留幕底，不撒氛围小图标
6. **三闸门量化脚本**（可直接对标的品类）——`frame_metrics.py`（逐镜头最大物体高度 / 主角区柔光面积 / 紫色碎片指数 / 碎屑计数 → 带严重度表）、`motion_check.py`（逐镜头最长静止 ≤3s、末拍稳定期 ≥30 帧；组级与成片两个口径，**成片 `fin_frames` 为准**）、`selfcheck.py`（静态：帧覆盖 vs 分镜表、`GlitchIn` 数 vs 闪烁白名单、扫光组件 vs 扫光白名单、画面字面量 vs 事实清单）。我方现存 `text-gate.tsx` / `annotation-collision-gate.tsx` / `final-media-gate.mjs` 只覆盖文字适配与最终媒体，**没有帧级视觉 / 节奏量化**
7. **白名单式门禁纪律**：「闪烁白名单」（每镜头 ≤1 处 `GlitchIn`）、「扫光白名单」（全片 `LightSweep`+`StageLine`+`GhostText` ≤2 处，只给核心概念首次登场），写进分镜全局约束并由脚本终检核对——把「贵的动效限量」做成可校验清单，值得照搬成我们的 manifest 式约束
8. **全片一个贯穿示例语境**（样片「差旅报销」），跨 8 个构建组一致——与我们 `brand-system` 的示例一致性要求同源
9. **4 个 HITL 确认点**与我们内容管线 HITL 同源，但其「**前 30 秒样片**」把手改成本从「整片重渲」压到「1 个构建组」，是可借鉴的成本控制点

**场景映射**（对照我仓 `scripts/short-video/remotion/src/scenes/`）:

| anything2explainer 版式 / 图元                                           | 我仓 scene                                                                 | 可借鉴规则                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 大数字型 set piece（`BigNumber`/`countTo` 计数落定 + 单位小字 + 对照物） | `StatRevealScene`                                                          | 数值滚动落定 + 必配对照物 + `GLOW_ORANGE`（我方现仅 `textShadow` 泛光） |
| 年份/出处型（`BigNumber` 96px 滚动 + 机构胶囊 + ≥240 宽卡在旁）          | `DataScene`                                                                | 出处做成胶囊而非底层小字；年份/大数字不得独站空屏 >30 帧                |
| 左右对比版式（左 x≈300–380 / 右 x≈900–1000、标签在上、中间符号 46–60px） | `ContrastScene`                                                            | 中间符号 + 标签在上/说明在下；替代当前 `flex-wrap` 卡片堆               |
| 图表卡（440×300 白边黑底 + 网格 + 紫曲线 + 红重点）                      | `DataScene`（缺）                                                          | 量化图表版式，替代静态图 / 纯数字                                       |
| 卡片阵列（卡 150×92 r8、列距 24、2 帧错峰、≥12 张缩到 70 宽）            | `InfoCardScene`                                                            | 尺寸三档 + 错峰入场                                                     |
| 流程/因果节点（Pill 150×44 或 Box 200×70、间距 200、箭头）               | `ContextScene`（缺）                                                       | 因果链 / 流程版式                                                       |
| 「多」= ≥6px 方点阵列 / 网格按节拍点亮                                   | 通用背景                                                                   | 数量感用矩阵；背景只留幕底，禁碎屑                                      |
| 尺寸三档 + 空场判据（§1/§6）                                             | 全部 scene                                                                 | 直接约束现有 24–96px 文字块                                             |
| 光跟主角（§2）                                                           | 全部 scene                                                                 | 主角光 ≠ 全屏泛光                                                       |
| 持续动作 + 落位停留 30–45 帧（§7）                                       | 全部 scene                                                                 | 补上「入场即停」缺口                                                    |
| `frame_metrics.py` / `motion_check.py` / `selfcheck.py` 三闸门           | `text-gate.tsx` / `annotation-collision-gate.tsx` / `final-media-gate.mjs` | 增补帧级视觉与节奏量化                                                  |

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

### video-shotcraft ([`Vincentwei1021/video-shotcraft`](https://github.com/Vincentwei1021/video-shotcraft), 12260★)

- **调研日期**: 2026-10-17
- **Repo 坐标修正**: 追踪文档原记「video-shotcraft (8435★)」未记 owner、未记仓库坐标。`gh search` 定位唯一同名高星仓库 → [`Vincentwei1021/video-shotcraft`](https://github.com/Vincentwei1021/video-shotcraft)；**旧记 8435★ 已过时**（现 12260★，forks 1096，open issues 12）。与 C 段的 `anything2explainer`、本段的 `video-talkcraft` **同作者（Vincentwei1021）**，三仓互为系列（talkcraft 自述为 shotcraft 系列的口播篇；anything2explainer 的点阵波幕底移植自 talkcraft）。
- **本地路径**: `/tmp/video-shotcraft-survey/`（浅 clone，HEAD `310330ca`，2026-10-16 "docs(readme): add APIMart sponsor and list AWS last"；会话临时目录、非仓库资产）
- **技术栈**: 纯 **Remotion + React + TypeScript**（横屏产品宣传片 1920×1080@30fps；`template/` 为可渲基底）；辅助 **Python**（BGM 节拍分析 `librosa` 一次性脚本、剪映工程导出 `pyJianYingDraft`、社交发布 stdlib）；静态捕获用 `puppeteer`。主链**全本地渲染，无外部付费 API**（发布可选 Upload-Post）。
- **形态与规模**: **124 张镜头配方卡 / 150 shots / 10 个功能类目**（opening 11 · camera 13 · transition 19 · typography 25 · ui-entrance 22 · interaction 13 · data 9 · effects 23 · rhythm 8 · outro 7）；卡在 `references/shots/<category>/<card>.md`，可跑 demo 在 `demos/<category>/<card>/`；**`gallery/api/library.json` 是卡名/style-key 的单一真值索引**；`assets/lib/` 可复制组件 + helpers；`assets/audio/` 149 SFX/16 类 + BGM；`template/` 完整可渲模板；`workbench/` 剪映式后期台；`publish/` 社交发布。
- **许可**: ✅ **Apache-2.0**（`LICENSE`，Copyright 2026 Wei Yihao，标准全文无附加条款；`gh api` spdx=Apache-2.0）。`assets/audio/` 各文件自带许可（Mixkit free，见 `assets/audio/ATTRIBUTION.md`）；Remotion 自身许可独立（个人/小团队免费，公司可能需付费）。
- **维护状态**: created 2026-07-19、last push 2026-10-16（1 天）、forks 1096、open issues 12；**CI 齐备**（[`pr-checks.yml`](https://github.com/Vincentwei1021/video-shotcraft/blob/310330cadcf41f5d2b15ee1c908d629e26d0a324/.github/workflows/pr-checks.yml) 跑 tsc 严格编译全部 demo + vitest + 冒烟渲染，另有 deploy-pages / showcase-publish）。
- **档级判定**（按 `agent-video-skills-180-screening-2026-09.md` §2 五口径）: **Tier A（许可允许吸收代码）**——许可 ✓ Apache-2.0、付费云绑定 ✓（主链全本地，发布 Upload-Post 可选）、NVIDIA 假设 ✓（无）、活跃度 ✓（1 天）、能力重复 △（Remotion 管线/字幕/音效已有；**镜头配方卡库 + 单一真值索引 + 品牌→动效 token 推导 + 分段渲染/工作台/剪映导出不重复**）。**与同作者的 talkcraft / anything2explainer 的 PolyForm 阻断形成关键对照——本仓代码可合法吸收（带 Apache 署名与 NOTICE）。**

**值得吸收的**（管线架构）:

1. **镜头配方卡 + 单一真值索引 `library.json`**——124 张卡按功能类目组织，卡名/style-key 以 `library.json` 为单一真值，卡 ↔ demo 目录 1:1。与我们 `scripts/short-video/remotion/src/scenes/`（10 个场景组件）相比，我们的场景是**按叙事角色**分（Hook/Data/Contrast…），缺少**同角色内可复用的"镜头配方"层**；可把配方卡作为 `mediaStrategy` / scene 内部的选型源。
2. **"最便宜的产物先定方向"**——风格帧（styleframe，静态 HTML 截图，不渲视频）先于分镜、分镜先于实现、实现先于终检；方向争论前置到零成本产品上。
3. **品牌→动效 token 推导**——风格包（10 套：paper/film/light/data/scifi/mech/glass/fluid/crowd/counter）由**能量轴 × 调性轴**映射到同一套动效参数；品牌变更只改 token，不动卡。
4. **三模式分流**——模板（照卡渲）/ 自主（无卡自由编排）/ 共同创作（人给风格帧，agent 落分镜）；按用户授权程度选路。
5. **hold / rest 帧预算**——品牌字标 ≥1s、批量收尾 0.5s、开场主体 ≥3s 等**显式停留预算**，正对我方"入场即停/无末拍停留"缺口（同 C 段结论）。
6. **确定性渲染铁律**——禁 `Date.now()`/`Math.random()`，用 seeded `mulberry32`；`assets/lib/helpers/__tests__/helpers.test.ts` 对随机做确定性断言，保证 frame-identical 重渲。
7. **SFX 钉帧表用相对帧表达式**——`SHOTS.x.from + offset` 记 SFX 落点，卡调整后自动跟随。
8. **BGM 布尔 inputProp**——同一套 markup 一次出「带 BGM / 无 BGM」两版。
9. **逐镜头静帧验收 + 每轮整片重渲**——每镜写死 2 个验收帧号，`remotion still` 逐镜出静帧核对。
10. **交付后独立 subagent 终检**——独立评审器产出**带帧号的证据报告**（非自评）。
11. **Motion Workbench + 剪映工程导出**——交付产物可在剪映二次编辑，交付即"可继续加工"。
12. **CI 门禁形制**——tsc 全 demo 严格编译 + vitest 纯函数 + 冒烟渲染三闸。

**场景映射**: opening/outro → `HookScene`/`CtaScene` 停留预算 · data → `DataScene`/`StatRevealScene` 量化图表（同 C 段）· typography → `QuoteScene`/`InfoCardScene` 字效 · ui-entrance/interaction → `FullscreenMedia` 转录屏运镜 · transition → 场景间承接转场（我方现无共享转场层）。

**不适用的**:

- 片种是 16:9 产品宣传片（1920×1080@30fps）；我们是 1080×1920 竖屏新闻短视频，尺寸/版式阈值需按竖屏重算。
- 重度依赖**真实产品页面截图 + 2.5D 运镜**；新闻题材多无"可拍摄的自家产品页面"，素材形态不同。
- 是"逐支精雕"的多模式人工编排（styleframe → 映射 → 分镜 → 放行），非按题材批量出片的自动化管线；吸收其**结构纪律**，不吸收其**耗时模型**。
- 卡语汇面向产品营销（exploded-view、营销卡片等），新闻场景需克制。
- 发布走 Upload-Post（需 `UPLOAD_POST_API_KEY`）——我们已有自己的发布链，不接。

**交叉引用**: 与 C 段 `anything2explainer`、本段 `video-talkcraft` 同作者互为系列。

**详细报告**: 本节即结论（字段化记录，未另立报告文件）。

### video-talkcraft ([`Vincentwei1021/video-talkcraft`](https://github.com/Vincentwei1021/video-talkcraft), 1621★)

- **调研日期**: 2026-10-17
- **Repo 坐标修正**: 原记「video-talkcraft (979★)」未记 owner → [`Vincentwei1021/video-talkcraft`](https://github.com/Vincentwei1021/video-talkcraft)；**旧记 979★ 已过时**（现 1621★，forks 161，open issues 1）。
- **本地路径**: `/tmp/video-talkcraft-survey/`（浅 clone，HEAD `a7c29edf`，2026-10-12；会话临时目录、非仓库资产）
- **技术栈**: **Remotion + React + TypeScript**（口播/解说）；**Python 管线**（字级时间戳 `timestamps_cpu.py` 默认 FireRedASR2-CTC int8 经 sherpa-onnx、备选 faster-whisper；人脸安全区 `face_bbox.py` 用 OpenCV YuNet；静止/抖动检测 `freeze_probe.py`/`motion_check.py`；音效在场 `sfx_check.py`；QA 抽帧拼图 `contact_sheet.py`）；**Node 渲染脚本**（`render_shots.mjs` 分段并行渲、`render_stills.mjs` 批量静帧、`pipeline_state.mjs` 状态机）。默认本机 CPU 对齐；Fish Audio（免费层）为可选外部服务、非主链。
- **形态与规模**: **108 张动效配方卡**（`references/cards/*.md` ↔ `template/cards/*.tsx` 1:1）+ `references/cards-index.json` 索引；`template/motion-systems/`（camera/backdrop/life/longtake/transitions/env/schematic）+ `template/components/`；`scripts/`（~35 个管线工具 + Python/Node 单测 + `preflight.py`/`card_lint.py`/`beat_lint.py`）；`workbench/` 剪映式后期台；SKILL.md 载八步管线。
- **许可**: ❌ **PolyForm Noncommercial 1.0.0**（`LICENSE` 顶部 Required Notice + "非商用免费；**任何商用需事先授权**"；`gh api` spdx=NOASSERTION）。**代码/卡/模板/字体一律不得进入产线**（`agent-video-skills-180-screening-2026-09.md` §2 口径 1 明确点名本仓为该类先例）——只吸收规则与结构。
- **维护状态**: created 2026-08-22、last push 2026-10-12（5 天）、forks 161、open issues 1、单作者；有 Python 单测（[`test_tts_fishaudio.py`](https://github.com/Vincentwei1021/video-talkcraft/blob/a7c29edfb2404612dde6a5a1c8aa94232e85625b/scripts/test_tts_fishaudio.py) 等）与 Node 单测（[`render_shots.test.mjs`](https://github.com/Vincentwei1021/video-talkcraft/blob/a7c29edfb2404612dde6a5a1c8aa94232e85625b/scripts/render_shots.test.mjs) 等）及 lint 工具。
- **档级判定**（同一份 §2 五口径）: **Tier B 只读**——许可 ✗（PolyForm 非商用 + 商用需授权）、付费云绑定 ✓（默认本机 CPU 对齐，Fish Audio 可选免费层）、NVIDIA 假设 ✓（无）、活跃度 ✓（5 天）、能力重复 △（Remotion 管线/字幕已有；**七层反 PPT 系统 + 语义拍分镜 + 三重验收 + 分段渲染/状态看板不重复**）。

**值得吸收的**（叙事结构 + 口播管线）:

1. **SHOTBOOK 语义拍分镜**——以"语义拍"（26 词**封闭语义词表** + weight=main/sub）为单位、每拍锚在**确切字**上，配层矩阵与排版预算；先评审 SHOTBOOK 再进实现。我方 scene 已到场景粒度，但无"拍"这一级语义分镜与受控词表。
2. **七层反 PPT 镜头系统**——每场景一条**极缓推拉相机曲线** + 让位生命周期 + 六式运动承接转场；"静止帧在结构上不可能出现"，漏网者由 `freeze_probe.py`/`motion_check.py` 抓。正对我方"入场即停"缺口（同 B 段 `spring(` 计数为 0 的观察）。
3. **排版纪律用真实检测而非目测**——`face_bbox.py` 用 **OpenCV YuNet** 量人脸安全区；`layout.md` 12 栏栅格 + 包围盒不相交自检 + 同屏元素预算 + 留白锚 + 枢轴句切镜。直接印证我方 **#396（focus_detector Haar→YuNet）** 的方向。
4. **渲染提速：分段渲染母版制**——`render_shots.mjs` 按镜头切段并行渲、段内单进程保光栅一致，拼装 + 整条音轨混入 + 帧数断言；**改一镜只重渲该段 ± 邻段**。实测（201s 竖屏片）：全片首渲 13min→9min、改一镜出有声新片 53s、43 张静帧 11min→~1min。我方 `rerender.mjs`/`render-only.mjs` 走 `renderRemotion` 整片重渲，分段可显著降迭代成本。
5. **QA 帧拼图省 token**——`contact_sheet.py` 把 QA 帧拼 3×4 网格给评审子代理整版浏览（160 张 QA 帧 ≈16 万 token/21min → ≈4 万 token/7min）。
6. **三重验收**——画面健康双判定（静止段 + 并发光栅抖动）+ 纯音效轨逐 cue 能量验证 + 独立评审拼图；机器闸全过 → 1 轮独立审片修完 P0/P1 即交付（累计封顶 3 轮）。
7. **管线状态看板 + 状态机**——`pipeline_state.mjs`（按盘上产物自动推 + `--pass/--issue` 只补人工判定）+ 工作台实时看板（每镜 占位/已实现/已渲/已过闸/过期/红点）。直接对应我方 **#462（管线状态单文件覆盖式、无历史）**。
8. **配音预剪 `voice_trim.py`**——以口播稿为真值剪掉口水词/结巴重说/过长停顿再对齐时间戳（**只剪稿子里没有的插入段，ASR 听错的字永不剪**）。
9. **确定性幕底**——`template/motion-systems/backdrop.tsx` 12 款 frame 驱动零随机幕底（即 C 段 `anything2explainer` 明确移植的那一份）。

**场景映射**: 语义拍分镜 → 我方 scene → shot 层级的设计输入 · 七层相机/转场 → 场景间承接 · face_bbox → `focus_detector`（#396）· contact_sheet + 三重验收 → 我方 QA 抽帧/独立审片 · render_shots 分段 → 我方渲染提速 · pipeline_state → #462 状态历史。

**不适用的**:

- 许可阻断（PolyForm 非商用 + 商用需授权）→ 代码/卡/模板/字体一律不得进产线，下列仅为**规则/结构重写**。
- 定位是**横屏口播/解说**（科普/评测/解读），我方主打竖屏 TikTok 快节奏；其"极缓推拉 + 每拍锚字"的节奏需按竖屏重定阈值（其自身实测片为 201s 竖屏，说明竖屏可用但节奏设定需另配）。
- 依赖"成品配音 + 口播稿"双输入；其字级对齐层（FireRedASR2-CTC）与我方 whisperx wav2vec2 强制对齐（`text-align.py` → `audio/subtitle-timing.json`，~20–25ms 网格）**能力有重叠**，故字级同步**不是我方缺口**；可对标的是其**语义拍分镜**与**配音预剪**。
- 视觉体系（Apple 范式默认、手绘铅笔/荧光笔）需按我品牌令牌蒙皮，不吸收其配色。
- Fish Audio 为可选外部服务（免费层），非主链，不引入。

**交叉引用**: 与 shotcraft 同作者互为系列（shotcraft README 将 talkcraft 列为口播姊妹篇；talkcraft 从 shotcraft 移植 19 张卡；其 `motion-systems/backdrop.tsx` 被 C 段 `anything2explainer` 移植）。

**详细报告**: 本节即结论（字段化记录，未另立报告文件）。

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

**维度 D 状态**: ✅ 完成（2026-10-17；`video-shotcraft` + `video-talkcraft` 均已调研并落结论，`Pixelle-Video` 已在本节早前记录）。定性：`video-shotcraft` 是**可吸收代码**的源（Apache-2.0）——其「镜头配方卡 + 单一真值索引 + 品牌→动效 token 推导 + hold/rest 帧预算 + 确定性渲染 + 逐镜静帧验收 + 分段渲染/工作台/剪映导出」正对我方**"入场即停 / 无停留预算 / 无配方层 / 整片重渲"**一揽子缺口；`video-talkcraft` 是**只读方法学**源（PolyForm 非商用阻断）——其「语义拍分镜 + 七层反 PPT 相机 + 真实人脸安全区检测（YuNet）+ 三重验收 + 管线状态看板」分别印证并细化我方 **#396（YuNet）/ #462（状态历史）**。两仓均指向 #291 收敛项：配方卡/索引层、品牌→动效 token 推导、hold 预算、分段渲染母版制、状态看板、真实几何检测。

---

## E. 字幕与动态排版

本维度 = **烧录字幕的逐词/逐行动效** + **画面文字的排版纪律**。三条线各取一源：字幕版式引擎（vshukla7）、字幕动效原语与分页算法（Fats403）、动态排版方法学（iart-ai skill packs）。

我方基线（对照口径，逐项实测）：`scripts/short-video/lib/subtitles/ass.mjs` —— ASS 逐词 karaoke（`\kt` 绝对偏移 + `\kf` 填充），仅两色「未读 #F5F5F5 → 已读 Dispatch Blue #4d8bff」，单一硬编码样式；`cues.mjs` —— `MAX_WORDS=6`、`HARD_PX` 硬上限、`SENTENCE_END=/[.!?:;]$/`、`MIN_DURATION=0.8`、Netflix CPS 口径 + `mergeTrailingOrphan`；`lib/safe-zones.mjs` —— `SUBTITLE_LANE{marginV:570, fontSize:60, maxLines:2, maxWidth:720}`，`SAFE_ZONES.bottom=770`（内容底 1150，字幕带 1188–1350）；`remotion/src/components/animations/entrance.tsx` —— 8 个**整块**入场原语，`spring()` 实测 **0 处**。

### vshukla7/remotion-captions-themes (8★)

- **调研日期**: 2026-10-18
- **Repo 坐标修正**: 无修正（owner/名与旧记一致，8★ 实测仍 8★）；forks 1、open issues 0、archived false、lang TypeScript。
- **本地路径**: `/tmp/rct-src/vshukla7-remotion-captions-themes-c2cfe29/`（tarball 取包，HEAD `c2cfe29` 2026-06-23；会话临时目录、非仓库资产）
- **技术栈**: 纯 **Remotion 4 + React 18 + TS 的组件包**（不是 Remotion 工程：`src/` 内 0 处 `Composition`/`registerRoot`）；peerDeps `remotion ^4.0.0`，runtime `dependencies: {}` 零依赖。
- **形态与规模**: `src/` **13 套主题**（`src/themes/*.tsx`，文件树实测：aarit / beast / gaming-stream / grape / hustle / karaoke / kinetic-01 / kinetic-02 / podcast / pop / poppin / simple-one-word / soft-ai）+ **`src/layout/` 5 文件的 relation 版式引擎** + [registry.ts](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/registry.ts) + [CaptionTheme.tsx](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/CaptionTheme.tsx)（唯一入口）+ `src/utils/`。另有 `plan.md`（早于实现的旧设计稿，含从未落地的 fadeSlide/typewriter/bounce）。
- **许可**: ✅ **MIT**（`gh api` 实测 `spdx_id = MIT`）→ **Tier A：代码可吸收**（保留署名）。
- **维护状态**: created 2026-06-21、pushed **2026-06-23**、提交全挤在 3 天内、单作者、1 fork → **近 4 个月零提交**；**零测试零 CI**（文件树实测无 `*.test.*`、无 `.github/`）。README 主题清单与 `registry.ts` 不一致（README 漏列 `kinetic-02`/`podcast`）→ 文档不可信，以代码为准。
- **档级判定**: **Tier A**（许可 ✓ / 纯本地无付费云 ✓ / NVIDIA 假设 ✓ / 活跃度 ✗ / 能力重复 △）。

**值得吸收的**:

1. **逐词强调的 spring 三档参数**（可直接抄）：[pop.tsx](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/themes/pop.tsx) `{damping:10, mass:0.4, stiffness:150}` → 活动词 `scale(1 + 0.2·p)`；[beast.tsx](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/themes/beast.tsx) `{damping:10, stiffness:180}` → `scale(1 + 0.15·p)` + `rotate(-2deg)`；[podcast.tsx](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/themes/podcast.tsx) `{damping:12, mass:0.4, stiffness:150}` → scale 0.8→1 + 淡入。与 B 段 locomotion 的 presets 同构（`{150}` 弹跳 / `{180}` 冲击）。
2. **活动词强调「非对称且克制」**：活动词上 `secondaryColor`、非活动词压到 `opacity 0.6`；[gaming-stream.tsx](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/themes/gaming-stream.tsx) 只有当前词带 `textShadow 0 0 20·p secondaryColor`（**发光只给当前词**）—— 可直接当字幕「强调预算」规则。
3. **逐字母 stagger**（我方完全没有）：[aarit.tsx](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/themes/aarit.tsx) `letterStartFrame = wordStartFrame + letterIndex*1.5`，`containerScale 1.0→1.15` 跨整行。
4. **relation 版式引擎（独立可复用模块）**：[layoutEngine.ts](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/layout/layoutEngine.ts)（`computeLayout` / `measureText`） + [anchors.ts](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/layout/anchors.ts)（9 锚点）+ [relations.ts](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/layout/relations.ts)（`above|below|leftOf|rightOf|anchorTo` + gap）+ [collision.ts](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/layout/collision.ts)（重叠率 = 重叠面积/较小盒面积，0..1）；量宽用 Canvas 2D `actualBoundingBox*` 真测（`measureText`）；[kinetic-01.tsx](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/themes/kinetic-01.tsx) 以「最长词」为主词、余词按锚点散布并做两轮水平去重。
5. **确定性纪律**：`seededRandom` 由 `Math.sin` 派生，全 `src/` **0 处 `Math.random()`/`Date.now()`**；动画类别按行号取模（`kinetic-01` `activeLineIdx % 3`）。
6. 响应式基准 `scaleFactor = width / 1080` —— 与我方 1080×1920 画布天然对齐。

**不适用的**:

- 13 套主题的字体/字重/阴影/描边**逐套硬编码**（Outfit / Dancing Script / Impact / Rajdhani / Poppins / Komika Axis），唯一共享层 [resolveColors.ts](https://github.com/vshukla7/remotion-captions-themes/blob/c2cfe29cb732bf01aac2a92b84f58fda28fc182e/src/utils/resolveColors.ts) 只给 2 个色值 → **不是正交 token 层**，补不了我方「缺统一视觉语言」。
- 多处用 CSS `transition:` 驱动动画 → **帧不确定**，与 Remotion 逐帧渲染铁律冲突，作**反例**记录（不是可抄优点）。
- 分页/断行弱于我方（其 `kinetic-01` 按 ≤3/4 词成页；我方 `cues.mjs` 已含词数/像素/句末/孤儿回并 + Netflix CPS）。
- 横屏/通用社媒覆盖层定位，无竖屏安全区与车道概念 → 我方 `SUBTITLE_LANE` 须自行保留。
- 输入契约（`lines[].words[].start/end` 绝对秒）与我方 `words[{text,start,end}]` 兼容 → 非缺口。

### Fats403/remotion-captions-kit (5★)

- **调研日期**: 2026-10-18
- **Repo 坐标**: `Fats403/remotion-captions-kit`（5★ / forks 0 / open issues 0 / archived false / TypeScript）；坐标与旧记一致。
- **本地路径**: `/tmp/rck/`（tarball 取包，HEAD `9723227` 2026-08-15 v0.2.0「whitespace-agnostic input, abbreviation-aware sentence breaks, char cap, flash-page merging, orphan control」；会话临时目录、非仓库资产）
- **技术栈**: 纯 Remotion/React/TS。peerDeps `remotion >=4.0.0` + **`@remotion/captions >=4.0.0`**（建立在官方 `Caption` / `TikTokPage` / `TikTokToken` 之上），tsup 构建。
- **形态与规模**: `src/` 18 文件（含 **7 个 `.test.*`**）+ [index.ts](https://github.com/Fats403/remotion-captions-kit/blob/97232270364bd6bba4ca8d11180c350409495e95/src/index.ts) 唯一导出入口 + [demo/Root.tsx](https://github.com/Fats403/remotion-captions-kit/blob/97232270364bd6bba4ca8d11180c350409495e95/demo/Root.tsx) 6 个 1080×1920@30fps composition。
- **许可**: ✅ **MIT**（实测 `spdx_id = MIT`）→ **Tier A：代码可吸收**（保留署名）。
- **维护状态**: created 2026-08-01、pushed **2026-08-15**、单作者；**有 CI**（[ci.yml](https://github.com/Fats403/remotion-captions-kit/blob/97232270364bd6bba4ca8d11180c350409495e95/.github/workflows/ci.yml)：typecheck → test → build）与 7 个测试文件（实测文件名：`create-caption-pages`、`create-caption-pages.invariants`、`sentence-boundaries`、`emphasis`、`normalize-captions`、`split-captions-into-words`、`captions-from-words`）。
- **档级判定**: **Tier A**（许可 ✓ / 纯本地 ✓ / NVIDIA 假设 ✓ / 活跃度 △ / 能力重复 △）。

**值得吸收的**:

1. **分页算法 `createCaptionPages`**（[create-caption-pages.ts](https://github.com/Fats403/remotion-captions-kit/blob/97232270364bd6bba4ca8d11180c350409495e95/src/create-caption-pages.ts)，默认 `maxDurationMs 1200` / `silenceGapMs 400` / `breakOnPunctuation` / `maxCharsPerPage 42` / `minDurationMs 300` / `minWordsPerPage 2`）：暂停 ≥400ms 断 → 超限时回退到**最近分句标点**（`clauseSplit`）→ 句末断 → 后处理 `mergeShortPages`（闪页合并）+ `fixOrphans`（孤儿回并，否则借一词）+ `displayDurations`（每页显示到下一页 start）。**正对我方 `cues.mjs` 缺「回退到分句标点」这一层**。
2. **缩写感知的句末判定**（[sentence-boundaries.ts](https://github.com/Fats403/remotion-captions-kit/blob/97232270364bd6bba4ca8d11180c350409495e95/src/sentence-boundaries.ts)）：`NEVER_ENDS`（缩写表，如 `Dr.`/`U.S.`）+ `MAYBE_ENDS` + `DOTTED_ACRONYM` + `SINGLE_INITIAL` + `BARE_NUMBER` 五类判据。**直接命中我方 `SENTENCE_END = /[.!?:;]$/` 的朴素判据**（会把 `Dr.`/`U.S.` 误断）。
3. **6 个逐词动效预设**（`src/presets/*.tsx`）：`karaoke-fill`（`clipPath inset(0 (1-progress)*100% 0 0)` 扫填）、`kinetic-slam`（`SLAM_MS=180`，uppercase/weight 900，`scale 0.4+0.6p` + `easeOutBack`）、`neon-glow`（`GLOW_MS=150`，三层光 8/24/56px、残留 0.35、`scale 1+0.05·ignite`）、`pill-karaoke`（胶囊 `borderRadius = fontSize*0.45`，入场 160ms `scale 0.92→1`）、`weight-shift`（`SHIFT_MS=160`，`WebkitTextStroke (fontSize/40)·lift`）、`editorial-emphasis`（`PAGE_IN_MS=240` 整行上浮 + `UNDERLINE_MS=200` 下划线 `scaleX` 扫过）。
4. **唯一 token 层 [theme.ts](https://github.com/Fats403/remotion-captions-kit/blob/97232270364bd6bba4ca8d11180c350409495e95/src/theme.ts)**：`defaultTheme` 给 fontFamily / fontSize / textColor / activeColor / pillColor / position / edgeOffset / paddingX / maxWidth，`resolveTheme` + `placementStyle` 统一出样式 —— 可作我方字幕 token 的结构模板（动效毫秒数与阴影仍是逐组件硬编码，这点别学）。
5. **确定性捷径**：全 repo **0 处 `spring()`、0 处 `interpolate()`、0 处 CSS `transition`**；[use-token-states.ts](https://github.com/Fats403/remotion-captions-kit/blob/97232270364bd6bba4ca8d11180c350409495e95/src/use-token-states.ts) 用 `useCurrentFrame()/fps` 换算**绝对 ms**，再由 [ease.ts](https://github.com/Fats403/remotion-captions-kit/blob/97232270364bd6bba4ca8d11180c350409495e95/src/ease.ts) 手写缓动（`easeOutCubic` / `easeOutBack` / `windowProgress`）驱动 —— 因「帧→ms」是决定论，仍保持帧级确定性。
6. **测试口径**：7 个测试文件（分页 / 分页不变量 / 句末判定 / 强调 / 归一 / 切词 / 词→Caption 各一组）+ CI 三闸 —— 可对标我方字幕模块的测试覆盖口径。

**不适用的**:

- **英文空格分词假设**：`normalizeCaptions` / `splitCaptionsIntoWords` / `captionsFromWords` 全部以空格定词界，缩写表全英文 → **中文无空格，不可直接搬**，须另设中文分句/分词规则。
- **渲染路径不同**：全部 `AbsoluteFill` + CSS（`textShadow` / `WebkitTextStroke` / `clipPath`），我方是 ffmpeg + libass 烧 ASS，这些属性在 libass 无对应物 → 只能取参数与规则，不能取实现。
- 默认 `fontSize 72` + `edgeOffset 0.1`（比例制）与我方 `fontSize 60` + `marginV 570` 竖屏契约不同 → 须重标定。

**与 vshukla7 的关系**: **互补为主、部分重复**。vshukla7 给**视觉皮**（13 套成品主题），本 repo 给**骨架**（分页算法 + 6 个动效原语 + token 层），两者同以 `@remotion/captions` 的 `TikTokPage` 为接口 → 可分工会话：分页/原语用本 repo，主题皮可选 vshukla7。重复面仅在「主题/样式皮」与高亮色。

### iart-ai skill packs（索引仓 motion-skills 865★ + kinetic-typography-skills 14★ + tiktok-video-skills 14★）

- **调研日期**: 2026-10-18
- **Repo 坐标修正**: 旧记「motion-skills 451★ / 50 skill」**星数与形态双向失实**。实测 `iart-ai/motion-skills` = **865★ / forks 77 / MIT / created 2026-06-22 / pushed 2026-10-14**；`kinetic-typography-skills` = **14★**（旧记 12★）/ MIT；`tiktok-video-skills` = 14★ / MIT。**形态修正：motion-skills 是「索引/门户仓」，不是 skill 内容仓** —— 实测本仓文件树无任何 `SKILL.md`，只有 `README.md` + `showcase.gif` + `showcase.html` + `tools/verify/`；**真正的资产在各 pack 仓**（`gh api orgs/iart-ai/repos` 实测该 org 共 21 仓，全部 MIT，含 `motion-design-skills` 136★ / `web-animation-skills` 45★ / `explainer-video-skills` 38★ / `lower-thirds-skills` / `b-roll-skills` 等）。
- **本地路径**: `/tmp/ms-tar/`、`/tmp/kts-tar/`、`/tmp/iart-verify/`（tarball / contents API 取件；会话临时目录、非仓库资产）
- **技术栈**: **纯文档型 skill**（无运行时代码）；reveal 规则给 CSS / GSAP / Framer Motion / **Remotion** 四通道代码片段（我方只取 Remotion 通道）。`scripts/` 内 3 个 POSIX bash。
- **形态与规模**: `kinetic-typography-skills/skills/kinetic-typography/`（[SKILL.md](https://github.com/iart-ai/kinetic-typography-skills/blob/fccc94bd325d824235ee9e715e65abde57b6513a/skills/kinetic-typography/SKILL.md) + [reveal-recipes.md](https://github.com/iart-ai/kinetic-typography-skills/blob/fccc94bd325d824235ee9e715e65abde57b6513a/skills/kinetic-typography/references/reveal-recipes.md)）与 `tiktok-video-skills/skills/`（[caption-animation/](https://github.com/iart-ai/tiktok-video-skills/blob/2a775336b5a638cbf8a61dbd785f9a1b649be016/skills/caption-animation/SKILL.md)（+`references/word-timed-captions.md`）、`lower-thirds/`、`countdown-video/`、`short-form-video/`）（文件树实测）。
- **许可**: ✅ **MIT**（三仓 `spdx_id = MIT` 实测）；tree 内 **0 个字体/图片/视频素材**（推荐字体仅作建议、不捆绑）→ **无二级许可风险**。→ **Tier A**。
- **维护状态**: 索引仓活跃（pushed 2026-10-14）；**各 pack 多停在 2026-06-22**（含本次三个），属 org 级批量发布后未再更新；无 CI、无 tests。
- **档级判定**: **Tier A**（许可 ✓ / 无外部付费云 ✓ / NVIDIA 假设 ✓ / 活跃度 △ / 能力重复 △）。

**值得吸收的**（下列参数已逐条回原文核对，非 README 转述）:

1. **三档分词粒度的 stagger 时序表**（[reveal-recipes.md](https://github.com/iart-ai/kinetic-typography-skills/blob/fccc94bd325d824235ee9e715e65abde57b6513a/skills/kinetic-typography/references/reveal-recipes.md) 首行）：line **60–100ms** / word **40–70ms** / char **20–40ms**；enter 统一 `cubic-bezier(0.16, 1, 0.3, 1)`。
2. **Remotion 逐字 reveal 参数**（同上文件 Remotion 代码块）：`delay = i * 2`（2 帧/字 ≈ 33ms@60fps）；`spring({config:{damping:200, stiffness:200, mass:0.5}})`；`translateY(110%) → 0`。
3. **四种 workhorse reveal**：mask（`translateY(110%)→0`，最稳）/ blur-in（`blur(12px)→0`，有 fringe 风险）/ clip-path wipe / char stagger —— **我方 `entrance.tsx` 8 原语里没有 mask 抬升、wipe 扫过这两式**。
4. **逐词 pop-in 参数**（[caption-animation/SKILL.md](https://github.com/iart-ai/tiktok-video-skills/blob/2a775336b5a638cbf8a61dbd785f9a1b649be016/skills/caption-animation/SKILL.md)）：`spring({config:{damping:12, mass:0.6}})`，`scale 0.6 → 1`（微 overshoot 即「活」感），opacity 同驱。
5. **活动词高亮的两条硬规则**：单一 accent 色或 box 底；`transition: color 80ms linear`；**「永不整排同时变色」**。
6. **先锁静态排版再动**（[kinetic-typography/SKILL.md](https://github.com/iart-ai/kinetic-typography-skills/blob/fccc94bd325d824235ee9e715e65abde57b6513a/skills/kinetic-typography/SKILL.md) §开头）：display headline `line-height 1.1–1.2`、body `1.4–1.6`；**display tracking 收紧 −1%~−3%**（如 `letter-spacing: -0.02em`）。
7. **分页粒度**：**1–4 词/页**；`combineTokensWithinMilliseconds` ≈ 200–500ms（真逐词）/ 1000–1500ms（短语）。
8. **lower-thirds 手法**（[lower-thirds/SKILL.md](https://github.com/iart-ai/tiktok-video-skills/blob/2a775336b5a638cbf8a61dbd785f9a1b649be016/skills/lower-thirds/SKILL.md)）：栏 → 名 → 角色各错 3–6 帧；名 : 角色字号 **≥1.6×**；hold 3–5s、exit 约 ⅔ 更快；9:16 上移避开底部 UI。
9. **竖屏字幕安全区三档**（`caption-animation/SKILL.md`）：字号 **56–80px（≈8% 屏高，最低 45px）** / 描边 **2–6px** + 软阴影 / 垂直 **center band 62–70%** / 底部清 ~280px（15%）/ 侧向居中 80% 宽。
10. **「渲染→冻结→截图→核验」三脚本**（MIT：[seek-shot.sh](https://github.com/iart-ai/tiktok-video-skills/blob/2a775336b5a638cbf8a61dbd785f9a1b649be016/scripts/seek-shot.sh) / [contact-sheet.sh](https://github.com/iart-ai/tiktok-video-skills/blob/2a775336b5a638cbf8a61dbd785f9a1b649be016/scripts/contact-sheet.sh) / [probe-mp4.sh](https://github.com/iart-ai/tiktok-video-skills/blob/2a775336b5a638cbf8a61dbd785f9a1b649be016/scripts/probe-mp4.sh)）—— 与我方 QA 抽帧范式同源。

**不适用的**:

- **索引仓本身不可当 skill 使用**；坐标必须按 pack 走（旧记录把索引仓当成了内容仓）。
- GSAP SplitText / Framer Motion / After Effects 表达式三通道 → 我方栈是 Remotion + libass ASS，**仅取规则不引入这些运行时**。
- variable-font weight 动画 → 我方无 variable font（Helvetica Neue / Times）。
- 其字幕实现是 **Remotion 合成帧驱动 spring**，我方是 **libass 烧录**：逐词 scale overshoot 只能落成 ASS `\t` / `\fscx` 变换，**不能直接搬 spring 代码**。
- 安全区阈值与我方 `SUBTITLE_LANE` 互证（我方更严），**非新信息**。

### 缺口汇总（E 段）

| 缺口               | 我方现状（证据）                                                                                                                                                         | 外部做法                                               | 判定                                                 | 来源               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------- | ------------------ |
| 逐词强调手法单一   | `ass.mjs` 仅双色 `\kf` 填充，无 scale / 发光 / 下划线 / 胶囊                                                                                                             | spring scale/rotate/glow 三档 + 6 个动效预设           | **真缺口**                                           | vshukla7 · Fats403 |
| 动画粒度 = 整块    | `entrance.tsx` 8 原语全为**整块**入场，`spring()` 为 0                                                                                                                   | line/word/char 三档 stagger 表；逐字母 stagger         | **真缺口（核心）**                                   | iart-ai · vshukla7 |
| 缺弹簧参数表       | 0 `spring()`，仅 2 处 bezier                                                                                                                                             | `{10,0.4,150}` / `{10,180}` / `{200,200,0.5}` 三档已列 | **真缺口**（与 B 段同根因）                          | vshukla7 · iart-ai |
| reveal 原语不齐    | 8 原语，无 mask 抬升 / wipe 扫过                                                                                                                                         | mask / blur-in / wipe / char stagger 四式              | **真缺口（部分重合）**                               | iart-ai            |
| 句末判定过朴素     | `SENTENCE_END = /[.!?:;]$/`，`Dr.` / `U.S.` 会误断                                                                                                                       | 缩写感知五类判据（`sentence-boundaries.ts`）           | **真缺口**                                           | Fats403            |
| 断行无分句回退     | 仅「词数 / 硬像素 / 句末 flush」 + 尾部孤儿合并                                                                                                                          | 超限回退到最近逗号/分号（`clauseSplit`）               | **真缺口**                                           | Fats403            |
| 分页偏大           | `MAX_WORDS=6`                                                                                                                                                            | 1–4 词/页、`combineTokensWithinMilliseconds` 200–500ms | **真缺口**（须按中文重标定）                         | iart-ai · Fats403  |
| 视觉 token 层缺失  | 单一硬编码样式；位置契约在 `safe-zones.mjs`                                                                                                                              | `theme.ts` token 结构；vshukla7 13 主题（但非正交层）  | **部分缺口**                                         | Fats403            |
| 字幕带安全区       | `SUBTITLE_LANE` 1188–1350、底留 570px                                                                                                                                    | caption band 62–70%、底清 ~280–320px                   | **非缺口**（互证，我方更严）                         | iart-ai            |
| 字级对齐           | wav2vec2 强制对齐（~20–25ms 网格）                                                                                                                                       | `@remotion/captions` 的 `timestampMs`                  | **非缺口**（D 段已证）                               | —                  |
| 字幕模块测试       | **已有** 7 个测试文件（`subtitle-ass` / `subtitle-cues` / `subtitle-measure` / `subtitle-compliance` / `verify-subtitles` / `subtitle-timing-guard` / `restore-tokens`） | 7 文件 + CI 三闸                                       | **非缺口**（纠正本轮调研中「我方无字幕单测」的误判） | 本仓实测           |
| 排版 tracking 纪律 | label 层 +2~+4px、display hook −10px（两档均已合理）                                                                                                                     | display −1%~−3%、body line-height 1.4–1.6              | **非缺口**（仅未 token 化）                          | 本仓实测           |
| 输入契约           | `words[{text,start,end}]` 绝对秒                                                                                                                                         | `lines[].words[].start/end` 绝对秒 / `Caption`         | **非缺口**（兼容）                                   | —                  |

**场景映射**: 字幕链（`ass.mjs` / `cues.mjs`）← 分页算法 + 句末判据 + 逐词动效参数 · `HookScene` ← kinetic-slam / 逐字 stagger · `QuoteScene` · `NarrativeScene` ← editorial-emphasis 下划线扫过 · `InfoCardScene` / `QuoteScene` ← lower-thirds 层级与字号比 · `components/animations/` ← mask / wipe 新原语 + spring 参数表 · QA ← `contact-sheet.sh` 类拼图核验。

**交叉引用**: 逐字母/逐词 stagger 与 **B 段 locomotion** 的 `spring()` 观察同根因（B 段记「`spring(` 计数为 0」）；「活动词只给一处强调」与 **D 段 talkcraft** 的「同屏元素预算」同向；字幕安全区三档与 **D 段 talkcraft 的 12 栏栅格 + 留白锚**互证。

**详细报告**: 本节即结论（字段化记录，未另立报告文件）。

### E 段索引核实（#291 的 66 repo 分类索引）

66 个 repo 的 7 类分类（A-G）在 #291 评论中。本轮对其中「字幕 / 动态排版」相关候选做了**坐标 + 许可实测核实**（旧索引只记星数、未记许可，故许可档级为本轮新增字段）：

| repo                                     | 实测 ★ | 许可(spdx)                                                                       | Remotion?              | pushed_at  | 档级       | 定位与适配性                                                            |
| ---------------------------------------- | ------ | -------------------------------------------------------------------------------- | ---------------------- | ---------- | ---------- | ----------------------------------------------------------------------- |
| Fats403/remotion-captions-kit            | 5      | MIT                                                                              | 是                     | 2026-08-15 | **A**      | 本节已深读：字幕骨架（分页 + 动效原语 + token）                         |
| vshukla7/remotion-captions-themes        | 8      | MIT                                                                              | 是                     | 2026-06-23 | **A**      | 本节已深读：字幕视觉皮（13 主题 + relation 引擎）                       |
| iart-ai/kinetic-typography-skills        | 14     | MIT                                                                              | 是（Remotion 通道）    | 2026-06-22 | **A**      | 本节已深读：动态排版规则与参数                                          |
| AleBrito124356/remotion-video-templates  | 4      | MIT                                                                              | 是                     | 2026-07-18 | A          | 待深读：单仓同含 KineticText + 1080×1920 逐词 karaoke（CaptionedShort） |
| notivn/AIEV                              | 136    | MIT                                                                              | 是（Remotion 组装）    | 2026-10-09 | A          | 只作参考：全栈 AI 剪辑应用，可定点读 karaoke 字幕层                     |
| DojoCodingLabs/remotion-superpowers      | 136    | MIT                                                                              | 是（Claude Code 插件） | 2026-10-03 | A          | 只作参考：字幕/转场/配音包，能力依赖外部付费 API                        |
| marioecg/codrops-kinetic-typo            | 182    | MIT                                                                              | 否（Three.js demo）    | 2022-12-12 | A          | 只作参考：已停更教学 demo                                               |
| codrops/KineticTypePageTransition        | 127    | MIT                                                                              | 否                     | 2025-05-30 | **无关**   | 网页「页面转场」概念，与视频管线无交集                                  |
| DanteAlighieri13210914/pv-tool           | 448    | ❌ 自定义**非商用**（"PV Tool — Non-Commercial License"，实测 LICENSE 原文）     | 否（PixiJS）           | 2026-05-18 | **B 只读** | 只作参考：动态排版引擎，非 Remotion + 非商用双阻断                      |
| SeonmiP/KineTy                           | 59     | ❌ NOASSERTION\|Other（非 OSI 自定义；CC-BY-NC 说法本轮**未取到 LICENSE 原文**） | 否（扩散模型）         | 2025-01-11 | **B 只读** | 无关：科研扩散模型生成动态排版视频                                      |
| ali-abassi/remotion-templates            | 37     | ❌ **无 LICENSE**                                                                | 是                     | 2026-08-23 | **B 只读** | 只作参考：模板 catalog，无许可只能吸规则与版式                          |
| shreefentsar/remotion-video-toolkit      | 25     | ❌ **无 LICENSE**                                                                | 是（skill 文档）       | 2026-01-29 | **B 只读** | 只作参考：Remotion 创作 skill 文档                                      |
| pablostanley/typexperiments              | 33     | ❌ **无 LICENSE**                                                                | 否（Canvas）           | 2026-03-29 | **B 只读** | 只作参考：逐字形动画效果实现参考                                        |
| httpstersk/kinetic-typography-playground | 33     | ❌ **无 LICENSE**                                                                | 否（three.js）         | 2021-06-18 | **B 只读** | 只作参考：2021 停更原型工具                                             |

**坐标修正（旧索引 → 实测）**: `DojoCodingLabs/remotion-superpowers` 119→136 · `notivn/AIEV` 114→136 · `ali-abassi/remotion-templates` 19→37 · `DanteAlighieri13210914/pv-tool` 417→448 · `iart-ai/kinetic-typography-skills` 12→14 · `marioecg/codrops-kinetic-typo` 181→182 · `codrops/KineticTypePageTransition` 126→127 · `httpstersk/kinetic-typography-playground` 32→33 · `pablostanley/typexperiments` 32→33 · `AleBrito124356/remotion-video-templates` 3→4 · `shreefentsar/remotion-video-toolkit` 24→25 · `iart-ai/motion-skills` 451→**865（且形态为索引仓）**。

**许可档级修正（本轮新增实测字段）**: 旧索引未记许可 → `pv-tool`（自定义非商用）与 `KineTy`（非 OSI）**曾按「开源即可吸收」处理属误判**，`ali-abassi` / `shreefentsar` / `pablostanley` / `httpstersk` **均无 LICENSE 文件**，六者一并定为 **Tier B 只读**（只吸规则与版式，代码不得进产线）。

**维度 E 状态**: ✅ 完成（2026-10-18）。定性：**vshukla7（Tier A/MIT）可吸收代码**但活跃度与 token 层俱弱，定位是「13 套视觉皮」；**Fats403（Tier A/MIT）可吸收代码**且骨架最完整——分页算法、缩写感知句末判定、6 个动效原语、token 结构、7 文件测试 + CI，正对我方 `cues.mjs`（句末判据 `/[.!?:;]$/`、无分句回退）与「逐词强调仅双色」两处缺口；**iart-ai skill packs（Tier A/MIT）为只吸规则的参数源**——补齐「整块入场 → 逐词/逐行 kinetic」的核心缺口（与 B 段 `spring()` 为 0 同根因）。三源共同指向 #291 收敛项：**逐词/逐行动效原语与其参数表、字幕分页与句末判据升级、字幕 token 层**。本轮为纯调研、未授权实施，**未开实施票**。
