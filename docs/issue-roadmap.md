# Issue Roadmap — Open Issues 依赖关系与执行顺序

GitHub Issues 依赖关系 + 执行波次（Wave）+ 价值分层（Tier）+ 主导层级（Dominant/Satellite）+ 状态追踪。每次 triage 后更新。

> **Last inventory**: 2026-09-14（Wave-Tier 架构固化与「调研先行」原则落地 session）
> - **Wave-Tier 权威架构落地**：全面恢复并升级 Wave-Tier 双维执行体系——**Wave 为时序推进波次，Tier 为业务价值分级**。
> - **「深入调研与基准先行」（Research-First）原则确立**：杜绝盲目改码与凭空重构。在视觉升级（Phase 3）、多平台分发（Phase 4）及搜源体系（Phase 2）中，**严谨的前置调研、竞品分镜解构、模型横评与真机实测统一编入各阶段 A 波次（Wave 2A / Wave 3A / Wave 4A），作为下游代码实现的硬前置门控**。
> - **Dominant Issue 架构锚定**：各 Wave 确立 Dominant Issue（🎯）作为规范与 Gate 锚点，统领挂靠的 Satellite Issues。
> - **S3 Wayfinder Map 确立**：#291（视觉体系重做）与 #296（多平台发布架构）作为 S3 规划总图，分别在 Wave 3A 与 Wave 4A 统领调研与决策收敛。
> - **重复项吸收闭票**：#283（吸收进 #292）与 #290（吸收进 #298）已在 GitHub 关闭并回填理由；Triage Inbox 隔离区全量清零。

---

## Dominant & Satellite Issue Hierarchy（主导与卫星 Issue 层级）

在 Phase / Wave → Task → Issue 三层架构中，**Dominant Issue（主导 Issue / 锚点 Issue，标有 🎯）** 负责**定标准、定架构、立契约、设 Gate 或承接 Wayfinder Map**；**Satellite Issues（卫星 Issue / 子任务）** 围绕它展开并向其交付。

| Phase | Dominant Issue (🎯 主导票) | Satellite Issues (挂靠卫星票) | 架构定位与统领关系 |
| --- | --- | --- | --- |
| **Phase 1: 管线可靠性与安全闭环** | 🎯 **#271** TTS Quality Gate 语义分流与出片阻断 (P1)<br>🎯 **#270** TTS instruct 标准机制级化 (P2) | → **#272** (Avatar 唇同步时长一致性 Gate, P1)<br>→ **#279** (语速整体上探与耦合, P2)<br>→ **#278** (Hook 文案句式规范, P2)<br>→ **#273** (并行经验与 CDP 并发锁, P2)<br>→ **#274** (Z-Image-Turbo 许可排查, P3) | #271 主导出片安全底线（Fail-closed 兜底与语义分流）；#270 主导多 TTS 引擎单一来源规范与参数校验。#272 配合 #271 形成出片双重保险。 |
| **Phase 2: 检索体系与运行环境固化** | 🎯 **#292** search-sources 体系性重审与通用/专用分流 (P1)<br>🎯 **#287** 管线入口统一加载 .env.local (P1) | → **#275** (全链路不自载缺陷, 由 #287 闭环)<br>→ **#285** (needsAuth 403 探针放宽, P2)<br>→ **#284** (Route C 循环引用消除, P2)<br>→ **#276** (web-deep-research 路由接入, P2)<br>→ **#286** (trend 模式相关性护栏, P2)<br>→ **#281** (Search Pool 引擎可用性复测, P2)<br>→ **#269** (死源自动修复 Phase 2, P2)<br>→ **#231** (环境固化真机验收, P3) | #292 主导搜索链路宏观分流架构（专用源直连平台 MCP vs 通用源进 Search Pool L3 兜底，吸收关闭 #283）；#287 主导环境变量单一入口加载契约，闭环 #275。 |
| **Phase 3: 视觉设计系统与媒体素材重构** | 🎯 **#291** 短视频模板视觉设计体系重做 (P1, `wayfinder:map`)<br>🎯 **#288** 媒体素材补全与 RAG 兜底 Catalog (P2)<br>🎯 **#298** B-roll T2V 模型画质评测升级 (P1) | → **#300** (外部赛道爆款解构基准, P2)<br>→ **#302** (外部开源 Repo 逐个深度追踪, P2)<br>→ **#301** (实拍库存视频优先策略改造, P2)<br>→ **#299** (Hook 前 3 秒专属视觉策略, P2)<br>→ **#289** (Scene->Prompt->Video 适配层, P2)<br>→ **#293** (Stage 0 素材预获取与缺口回流, P2)<br>→ **#297** (素材匹配 Fail-closed 留空, P1)<br>→ **#294** (VLM borderline 二度校验, P2)<br>→ **#295** (写稿 scene-data 概念泛化, P2)<br>→ **#253** (行业坐标系+hook 版式, P2) | #291 为视觉重做总指挥与 S3 Map，以 #300 竞品解构与 #302 开源调研为输入；#288 主导官方素材库结构；#298 主导生成画质横评与跃迁（吸收关闭 #290）；#297 守住不塞无关图底线。 |
| **Phase 4: 多平台发布通道与中文内容生态 (最终阶段)** | 🎯 **#296** 中文多平台发布架构 (P2, `wayfinder:map`)<br>🎯 **#268** 中文内容轨首包产出 (P2) | → **#216** (视频号人工扫码 5 项实测, P2)<br>→ **#217** (管线适配视频号发布包, P2)<br>→ **#218** (视频号 CDP 自动化发布, P2)<br>→ **#220** (抖音发布通道落地, P2)<br>→ **#223** (小红书图文频道立项, P2)<br>→ **#206** (Auto-Redbook 试点, P3)<br>→ **#208** (降级图文帖路径, P3)<br>→ **#210** (TikTok 官方 API 发布, P3) | #296 为全渠道发布总图与 S3 Map，主导自研 vs Relay 架构决策；#268 产出合规中文样片物料，作为 #216 扫码实测的必要物料。 |

---

## Duplicate & Absorption Notes

| Issue | Absorbed by | Status & Action |
| --- | --- | --- |
| **#283** (fallback 链语义重审) | **#292** (search-sources 体系性重审) | ✅ **CLOSED (Duplicate)**：全部议题由上游大盘票 #292 完整覆盖吸收。 |
| **#290** (Wan1.3B 文字数字视频效果差) | **#298** (B-roll T2V 模型画质评测升级) | ✅ **CLOSED (Duplicate)**：文字与数字测试集并入 #298 评测矩阵统一推进。 |
| **#275** (search-sources 不自载 .env.local) | **#287** (入口统一加载 .env.local) | ⏩ **In Progress**：根因与设计已定案，由 #287 代码落地后联动闭票。 |
| **#247** (Hook bigNumber 缺乏上下文) | **#253** (行业知识层 Ontology + hook 版式库) | ⏩ **Dormant**：待 #253 交付后覆盖关闭。 |
| **#280** (search-sources 不自载 .env.local) | **#275** | ✅ **CLOSED (Duplicate)** |
| **#282** (search-pool skill 跨 repo 同步) | — | ✅ **CLOSED (Superseded)**：已由前序 commit 同步闭环。 |

---

## Execution Waves（执行波次总表 — 含调研先行架构）

**工作模式与选票规则**：
- **每个 session 集中攻坚一个 issue**。
- **波次序次（Wave Sequence）**：严格按照 **Wave 1A → 1B → 2A → 2B → 3A → 3B → 3C → 4A → 4B** 推进。
- **调研先行（Research-First）**：每阶段的 **A 波次（Wave 2A / 3A / 4A）为深度调研、基准测试与真机摸底**，未产生明确输入与标准前，严禁盲目开工下游 B/C 波次的代码重构。
- **选票规则**：从最早未完成的 Wave 中，选取无 hard blocker 且 Tier 最高的候选 issue（同 Wave 内 Tier 1 优先于 Tier 2）。
- **并发仲裁**：跨 issue 或跨 session 并行前，**必须以文末 Conflict Risk Matrix 为准**。

| Wave | 阶段与主题 | Shared Context | Session Candidates (含 Tier) | Dependencies & 前置调研要求 | 并行与冲突规则 |
| --- | --- | --- | --- | --- | --- |
| **W1A** | **Phase 1: 管线可靠性即时门控** | `scripts/short-video/lib/tts/quality-gate.mjs`<br>`scripts/short-video/main.mjs` | 🎯 **#271** (TTS Quality Gate 语义分流与出片阻断, **T1**)<br>**#272** (Avatar 唇同步时长一致性 Gate, **T1**) | 无 hard blocker，即刻可开工。两票均为阻断脏出片的紧急安全门控。 | ⚠️ 串行修改：#271 动 quality-gate.mjs，#272 动 main.mjs，建议同一会话连续落地。 |
| **W1B** | **Phase 1: 参数标准化与语速规范** | `lib/tts/`<br>`docs/content-pipeline.md`<br>`skills/web-access/scripts/cdp-proxy.mjs` | 🎯 **#270** (TTS instruct 标准机制级化, **T2**)<br>**#279** (语速整体上探与 narrative 耦合, **T2**)<br>**#278** (Hook 文案句式规范, **T2**)<br>**#273** (管线并行经验总结与 CDP 并发锁, **T2**)<br>**#274** (Z-Image-Turbo 许可与量化调研, **T3**) | #270 继承 #271 的参数校验逻辑；#279 与 #278 为文案与语速协同；#274 核验上游许可。 | 文档与规范类（#278, #273, #274）可与代码类（#270, #279）跨 session 并行。 |
| **W2A** | **Phase 2: 搜源可用性摸底与环境入口**<br>*(【调研先行】探针与底座)* | `skills/search-pool/`<br>`scripts/short-video/main.mjs`<br>`lib/load-env.mjs` | **#281** (Search Pool 引擎可用性复测调研, **T3**)<br>🎯 **#287** (管线入口统一加载 .env.local, **T1** — 覆盖 **#275**) | **【调研先行】**#281 必须先通过独立 curl/CLI 摸底 Serper 与 Brave DNS 真实连通性；#287 确立全局单一入口加载底座。 | 零代码冲突：#281 仅为调研脚本测试，与 #287 环境变量改造完全解耦，可并行。 |
| **W2B** | **Phase 2: 搜源架构重审与分流落地** | `scripts/short-video/lib/search-sources.mjs`<br>`skills/search-pool/SKILL.md`<br>`skills/web-access/` | 🎯 **#292** (search-sources 体系性重审与通用/专用分流, **T1**)<br>**#285** (login-gated 站点 403 探针放宽, **T2**)<br>**#284** (Route C 循环引用消除, **T2**)<br>**#276** (web-deep-research 接入 Search Pool CLI, **T2**)<br>**#286** (trend 模式相关性护栏, **T2**)<br>**#269** (死源自动修复 Phase 2, **T2**)<br>**#231** (TTS/渲染环境固化真机验收, **T3**) | 依赖 W2A 的 #287 确保环境变量正常；#292 为搜索分流大盘票（吸收 #283）；#285 依赖 #292 结构。 | ⚠️ `search-sources.mjs`（#292, #285）高冲突须串行；技能文档（#284, #276）可独立并行。 |
| **W3A** | **Phase 3: 视觉与竞品深度调研**<br>*(【深度调研先行，基准确立】)* | `docs/research/`<br>`skills/web-access/`<br>`scripts/short-video/lib/b-roll/` | **#300** (头部竞品短视频分镜解构基准, **T2**)<br>**#302** (外部开源 Repo 逐个深度学习吸收追踪, **T2**)<br>🎯 **#298** (B-roll T2V 模型画质评测升级, **T1** — 吸收 **#290**)<br>🎯 **#291** (短视频视觉体系重做 S3 Wayfinder Map, **T1**) | **【深度调研先行】**在改动任何视觉代码前：<br>1. **#300** 抓取头部竞品解构音视频分镜与节奏基准；<br>2. **#302** 深度拆解外部开源项目的模板设计与图层调度；<br>3. **#298** 完成本地/免费云/付费云 T2V 模型横评；<br>4. **#291** 汇总上述三项调研产出，形成新视觉规范总图。 | 🟢 **全部支持并行**：#300, #302, #298 均为只读调研与实验评估，相互无文件冲突，可多 session 并发推进。 |
| **W3B** | **Phase 3: 媒体底座与素材兜底** | `scripts/short-video/asset-sourcer.mjs`<br>`knowledge/media-catalog.json`<br>`knowledge/asset-gaps.json` | **#297** (素材匹配 Fail-closed 留空, **T1**)<br>🎯 **#288** (媒体素材补全与 RAG 兜底 Catalog, **T2**)<br>**#293** (Stage 0 素材预获取与缺口回流, **T2**)<br>**#301** (实拍库存视频优先策略改造, **T2**) | 依赖 W3A 的视觉规范输入；#288 建立标准实体库，由 #293 接入 Stage 0；#297 与 #301 重构素材流水线。 | 数据文件（#288, #293）与代码逻辑解耦；`asset-sourcer.mjs`（#297, #301）必须串行改动。 |
| **W3C** | **Phase 3: 画面适配与智能生成** | `scripts/short-video/scene-data.mjs`<br>`lib/visual-analyzer.mjs`<br>`lib/data/industry-knowledge.json` | **#289** (Scene->Prompt->Video 适配层, **T2**)<br>**#299** (Hook 场景前 3 秒专属视觉策略, **T2**)<br>**#294** (VLM borderline 二度校验, **T2**)<br>**#295** (写稿 scene-data 概念泛化, **T2**)<br>**#253** (行业知识层 Ontology + hook 版式, **T2**)<br>**#244** / **#256** / **#263** (策略与创意 HITL, **T2**) | 依赖 W3A 模型选型（#298）与 W3B 素材流；#289 针对胜出 T2V 定制 prompt 模板；#299 承接 #300 留存结论。 | Prompt 模板与知识层（#289, #253）可并行；渲染与写稿联动改动需核对 Scene Data 契约。 |
| **W4A** | **Phase 4: 平台架构调研与真机实测**<br>*(【架构与真机摸底先行】)* | 微信视频号后台<br>`docs/research/`<br>`content/` 首包目录 | 🎯 **#296** (中文多平台发布架构 S3 Wayfinder Map, **T2**)<br>🎯 **#268** (中文内容轨首包样片物料产出, **T2**)<br>**#216** (微信视频号 5 项规格人工扫码实测, **T1/T2**) | **【真机实测先行】**：<br>1. **#296** 深度调研 AiToEarn Relay 与自研 CDP 混合架构；<br>2. **#268** 跑通管线产出合规 zh-CN 样片；<br>3. **#216** 用户扫码实测 200MB 限制、封面裁切、AI 声明 5 项真实参数。 | #296 架构研究与 #268 内容制作互不干扰，可并行推进。 |
| **W4B** | **Phase 4: 发布包适配与渠道接入** | `scripts/short-video/lib/platforms/`<br>`publish-wechat-channels.mjs` | **#217** (管线适配视频号发布包, **T2**)<br>**#218** (视频号 CDP 自动化发布沙盒, **T2**)<br>**#220** (抖音发布通道落地, **T2**)<br>**#223** (小红书图文频道立项, **T2**)<br>**#206** / **#208** / **#210** (图文与官方 API 扩展, **T3**) | **严格硬前置**：必须等待 W4A 的 #216 扫码实测数据完整出炉，且获得用户明确立项授权后方可解锁。 | 各平台独立适配器（#217, #220, #223）可并行开发，实测发布必须单会话串行。 |
| **Dormant** | **未达触发条件 / 等待外部输入** | 跨模块 | #21/#157/#158（素材规模/高质量需求）· #224（等用户半身照）· #230（等渲染停手）· #228（等冷跑瓶颈）· #222（等独立 repo 阶段） | 见各 Issue 触发条件，未满足前绝不进入执行 Wave。 | 不占用实现排期。 |

---

### Execution Semantics（三层执行语义规范）

三层结构各司其职，紧密联动：

1. **Wave（波次）**：**执行摘要与全局推进顺序**。基于技术依赖、业务里程碑与「调研先行」原则合成。新 session 启动时，**首先查看当前最早未完成的 Wave**。
2. **Tier（分级）**：**完整 Issue 资产库的权威价值位置**。按对生产力与内容质量的实质推动力划分（Tier 1 核心底线 > Tier 2 能力增强 > Tier 3 工具合规 > Dormant 冻结）。同一 Wave 内选票时，**Tier 1 绝对优先于 Tier 2/3**。
3. **Conflict Risk Matrix（并发风险矩阵）**：**多 session 或跨 issue 并行的唯一终审裁决来源**。Wave 表中的并行说明仅为业务初筛；任何具体代码编写前，**必须核对文件级冲突矩阵**。

---

## Detailed Phase Roadmaps（阶段执行分解）

### Phase 1: 管线可靠性与核心安全门控 (Pipeline Stability & Core Guardrails)
- **阶段目标**：杜绝坏 take 静默出片，解决 TTS 与 Avatar 唇同步时长一致性，消除参数隐患，建立坚不可摧的生产安全底线。
- **划分波次**：
  - **Wave 1A（即时门控）**：🎯 **#271**（TTS Quality Gate 语义分流与 fail-closed 阻断）+ **#272**（Avatar 视频有效时长 ≥ TTS 时长强校验 Gate）。
  - **Wave 1B（标准化与语速规范）**：🎯 **#270**（TTS instruct 单一 builder 与签名拦截）+ **#279**（语速整体微调 + narrative 耦合）+ **#278**（Hook 文案具象化对比规范）+ **#273**（CDP 并发锁与经验沉淀）+ **#274**（Z-Image-Turbo 许可核查）。

---

### Phase 2: 检索体系与运行环境固化 (Search & Retrieval Architecture)
- **阶段目标**：理顺检索降级链，消除环境变量自载缺陷与 Agent 路由循环引用，固化跨平台运行环境。
- **划分波次**：
  - **Wave 2A（【调研先行】探针摸底与环境底座）**：**#281**（Search Pool 引擎单项可用性与 DNS 摸底调研）+ 🎯 **#287**（管线入口顶层统一加载 `.env.local`，彻底闭环 **#275**）。
  - **Wave 2B（搜源分流架构与去环落地）**：🎯 **#292**（专用源直连平台 MCP vs 通用源 L3 Pool 分流总图，吸收 **#283**）+ **#285**（needsAuth 403 探针放宽）+ **#284**（Route C 循环引用消除）+ **#276**（web-deep-research 接入 Search Pool）+ **#286**（trend 模式相关性护栏）+ **#269**（死源自动修复 Phase 2）+ **#231**（Kaggle wheels 挂载真机终验）。

---

### Phase 3: 视觉设计系统与媒体素材重构 (Visual Redesign & Media Pipeline)
- **阶段目标**：重构短视频视觉体系达到顶尖商业新闻质感，引入实拍库存优先与实体 Catalog，升级 B-roll 生成模型画质。
- **划分波次**：
  - **Wave 3A（【深度调研先行，基准确立】）**：
    - **#300**：CDP 抓取头部竞品解构音视频分镜与节奏基准，产出分析报告；
    - **#302**：深度学习吸收外部开源项目（MoneyPrinterTurbo 等）在分镜和调度上的成熟经验；
    - 🎯 **#298**：本地 MLX → 免费云端（AtomGit/Kaggle）→ 付费云端（Modal L4）模型画质横评（吸收 **#290** 文字测试集）；
    - 🎯 **#291**：汇总调研成果，确立 S3 视觉重做 Wayfinder Map。
  - **Wave 3B（媒体底座与素材兜底）**：**#297**（素材匹配 Fail-closed 留空绝不硬塞无关图）+ 🎯 **#288**（官方实体媒体 Catalog 构建）+ **#293**（Stage 0 素材预获取与缺口回流）+ **#301**（实拍库存视频优先策略）。
  - **Wave 3C（画面适配与智能生成）**：**#289**（专属 aiVideo.prompt 适配层）+ **#299**（Hook 前 3 秒专属视觉）+ **#294**（VLM borderline 二度校验）+ **#295**（写稿 scene-data 概念泛化）+ **#253**（行业坐标系与版式库）+ **#244**/**#256**/**#263**（策略与创意 HITL）。

---

### Phase 4: 多平台发布通道与中文内容生态 (Multi-Platform Publishing - 最终阶段)
- **阶段目标**：在内核稳定与画质达标后，打通国内主流短视频发布渠道（视频号、抖音、小红书），完成首发中文包与实测闭环。
- **划分波次**：
  - **Wave 4A（【平台架构调研与真机实测先行】）**：
    - 🎯 **#296**：调研自研 CDP 与 AiToEarn Relay 混合调度架构（S3 Wayfinder Map）；
    - 🎯 **#268**：产出首个 zh-CN 旁白中文短视频样片物料；
    - **#216**：用户用样片在微信视频号人工扫码实测 5 项关键技术参数（200MB、封面、AI 声明等）。
  - **Wave 4B（发布包适配与渠道接入）**：依据 #216 实测结论解锁 **#217**（视频号发布包适配）→ **#218**（CDP 自动化发布沙盒）→ **#220**（抖音发布通道）→ **#223**（小红书图文频道）→ **#206**/**#208**/**#210**（扩展通道）。

---

## Execution Tiers（权威资产分类清单）

按对生产管线的实质推动力分层。**新增、关闭或调整 Issue 时首先在此更新**。

### Tier 1 — 核心阻断与出片质量基线（优先攻坚）

| # | Issue | Phase & Wave | Role | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| **#271** | TTS Quality Gate fail 绕过语速补差出脏片 | Phase 1 · **W1A** | 🎯 Dominant | `ready-for-agent` | P1 bug：语义分流处理，阻断坏音频出片。 |
| **#272** | TTS 音频重生成后数字人 avatar 视频不失效 | Phase 1 · **W1A** | Satellite | `ready-for-agent` | P1 bug：用户已终审定案方案 B（main.mjs 强校验时长一致性）。 |
| **#287** | 入口统一加载 .env.local（彻底解决 #275） | Phase 2 · **W2A** | 🎯 Dominant | `ready-for-agent` | P1 bug：入口顶层单次加载，库代码绝不自载。 |
| **#275** | search-sources 全链路不自载 .env.local | Phase 2 · **W2A** | Satellite | `ready-for-agent` | P1 bug：由 #287 代码落地后联动关闭。 |
| **#292** | search-sources 体系性重审与通用/专用分流 | Phase 2 · **W2B** | 🎯 Dominant | `ready-for-agent` | P1 enhancement：专用源平台 MCP vs 通用源 L3 Pool，已吸收 #283。 |
| **#291** | 短视频模板视觉设计体系重做 | Phase 3 · **W3A** | 🎯 Dominant | `wayfinder:map` | P1 enhancement：S3 视觉重做总指挥 Map，统领全套视觉升级。 |
| **#298** | B-roll T2V 模型画质评测升级（替代 Wan1.3B） | Phase 3 · **W3A** | 🎯 Dominant | `ready-for-agent` | P1 enhancement：梯队横评，吸收 #290 文字与数字测试集。 |
| **#297** | 素材匹配 Fail-closed 留空（杜绝无关图片） | Phase 3 · **W3B** | Satellite | `ready-for-agent` | P1 bug：无高置信度结果禁止字符匹配强塞，留空触发 B-roll。 |
| **#216** | 视频号人工发布试点（实测 5 项规格） | Phase 4 · **W4A** | Satellite | `ready-for-human` | P2 enhancement：等开通与 #268 中文首包后用户扫码实测。 |

---

### Tier 2 — 架构深化与能力增强（稳步推进）

| # | Issue | Phase & Wave | Role | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| **#270** | TTS instruct 标准机制级化（单一来源+校验） | Phase 1 · **W1B** | 🎯 Dominant | `ready-for-agent` | P2 enhancement：统一 builder + quality gate 签名拦截。 |
| **#279** | 语速整体上探与 narrative 速度耦合 | Phase 1 · **W1B** | Satellite | `ready-for-human` | P2 enhancement：写稿控词 + 1.05~1.1x 微调 + 85% 速度门。 |
| **#278** | Hook 文案句式规范与情感驱动写稿 | Phase 1 · **W1B** | Satellite | `ready-for-human` | P2 enhancement：首句 1.5s 冲突 + 核心数字具象化对比。 |
| **#273** | 短视频管线并行运行经验总结与并发锁 | Phase 1 · **W1B** | Satellite | `documentation` | P2 docs：CDP 并发锁与 runbook 并行文档规范。 |
| **#285** | login-gated 站点 403 探针误杀面放宽 | Phase 2 · **W2B** | Satellite | `ready-for-agent` | P2 enhancement：复用 needsAuth 避免知乎等登录源被误杀。 |
| **#284** | Route C 与 web-access 双向引用消除 | Phase 2 · **W2B** | Satellite | `ready-for-agent` | P2 bug：消除 Agent 路由指令循环引用。 |
| **#276** | web-deep-research 接入 search-pool CLI | Phase 2 · **W2B** | Satellite | `ready-for-agent` | P2 enhancement：统一降级链并补回 Grok 桥。 |
| **#286** | trend 模式关键词相关性护栏盲区 | Phase 2 · **W2B** | Satellite | `ready-for-agent` | P2 enhancement：保持探针判死，相关性交 Stage 1 语义层。 |
| **#269** | 搜索源失效自动修复闭环 (Phase 2) | Phase 2 · **W2B** | Satellite | `ready-for-agent` | P2 enhancement：基于 quarantine 证据沉淀自动化修复。 |
| **#300** | 头部竞品短视频音视频分镜结构解构基准 | Phase 3 · **W3A** | Satellite | `ready-for-agent` | P2 enhancement：【调研先行】CDP 抓取 + Whisper + VLM 解构报告。 |
| **#302** | 外部开源 Repo 逐个深度学习吸收追踪 | Phase 3 · **W3A** | Satellite | `ready-for-agent` | P2 docs：【调研先行】追踪 A-E 维度研究结论，沉淀经验。 |
| **#288** | 媒体素材补全与 RAG 兜底 Catalog | Phase 3 · **W3B** | 🎯 Dominant | `ready-for-agent` | P2 enhancement：结构化实体图库与官方肖像。 |
| **#293** | Stage 0 素材预获取与缺口回流机制 | Phase 3 · **W3B** | Satellite | `ready-for-agent` | P2 enhancement：Stage 0 预热 + 720p 超分 + 缺口回流。 |
| **#301** | 实拍库存视频优先策略改造 | Phase 3 · **W3B** | Satellite | `ready-for-agent` | P2 enhancement：pixabay-video 接入 + 叙事全屏库存优先。 |
| **#289** | Scene 数据与生成视频画面适配 | Phase 3 · **W3C** | Satellite | `ready-for-agent` | P2 enhancement：Stage 2/3 LLM 生成专属 aiVideo.prompt。 |
| **#299** | Hook 场景前 3 秒专属视觉策略 | Phase 3 · **W3C** | Satellite | `ready-for-human` | P2 enhancement：官方主视觉 / 暗调库存 / 定制 T2V 优先。 |
| **#294** | VLM borderline 评分二度校验与降级 | Phase 3 · **W3C** | Satellite | `ready-for-agent` | P2 enhancement：40-60 分构图主体复核，不通过降级。 |
| **#295** | 写稿 scene-data 概念泛化 searchHints | Phase 3 · **W3C** | Satellite | `ready-for-agent` | P2 enhancement：LLM 写稿时注入搜索实体提示词。 |
| **#253** | 行业知识层 Ontology + hook 版式库 | Phase 3 · **W3C** | Satellite | `ready-for-human` | P2 enhancement：行业坐标系 + hook ≥3 版式（覆盖 #247）。 |
| **#244** | Hook scene emotion 不足（听感/文案） | Phase 3 · **W3C** | Satellite | `ready-for-human` | P2 enhancement：情感表现力写稿规范与 ref 音频选型。 |
| **#256** | 数字人决策权变更与白/黑名单重审 | Phase 3 · **W3C** | Satellite | `ready-for-human` | P2 enhancement：Agent 自主判断 + 理由义务。 |
| **#263** | TikTok 成片时长目标重审（双轨机制） | Phase 3 · **W3C** | Satellite | `ready-for-human` | P2 enhancement：30-45s 快讯 vs 60-75s 拆解双轨方案。 |
| **#296** | 中文多平台发布架构（Wayfinder Map） | Phase 4 · **W4A** | 🎯 Dominant | `wayfinder:map` | P2 enhancement：【调研先行】S3 混合调度引擎架构决策。 |
| **#268** | 中文内容轨首包产出（首个 zh-CN 样片包） | Phase 4 · **W4A** | 🎯 Dominant | `ready-for-human` | P2 enhancement：首期中文选题与成品包，解锁 #216。 |

---

### Tier 3 — 低重要性 / 工具链与合规排查

| # | Issue | Phase & Wave | Role | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| **#274** | Z-Image-Turbo 许可矛盾排查 | Phase 1 · **W1B** | Satellite | `ready-for-agent` | P3 enhancement：上游许可核实与 4bit 替代方案。 |
| **#281** | Search Pool 引擎可用性复测 | Phase 2 · **W2A** | Satellite | `ready-for-agent` | P2 enhancement：【调研先行】单独 curl/CLI 复测记录定性。 |
| **#231** | TTS/渲染环境固化（余真机构建验证） | Phase 2 · **W2B** | Satellite | `ready-for-agent` | P3 enhancement：Kaggle wheels dataset 真机挂载验证。 |
| **#257** | Spark-TTS MLX 情绪验证（等听感 HITL） | Phase 1 · **W1B** | Satellite | `ready-for-human` | 客观实验已完成，等用户听感定去留。 |

---

### Dormant — 触发条件未满足（暂缓占用排期）

| # | Issue | Phase | Blocked by / Trigger condition |
| --- | --- | --- | --- |
| **#224** | 数字人半身像支持 | Phase 3 | 等用户提供合适半身照，到位后转 ready-for-agent |
| **#230** | 字幕短 cue 两行版式合并救援 | Phase 3 | 等并行渲染停手 + 工作区干净 |
| **#217** | 管线适配视频号发布包 | Phase 4 | Blocked by #216 试点规格确认 |
| **#218** | 视频号 CDP 自动化发布路线 | Phase 4 | Blocked by #216/#217 + 需另行授权 |
| **#220** | 抖音发布通道落地 | Phase 4 | Blocked by 大陆实名资源配置决策 |
| **#223** | 小红书图文频道立项 | Phase 4 | Blocked by 账号资源与发布方式决策 |
| **#206** | Auto-Redbook 试点与发布链路 | Phase 4 | Blocked by 小红书立项与 dry-run 授权 |
| **#208** | 视频降级图文帖路径 | Phase 4 | 等小红书图文频道立项（#223） |
| **#210** | 调研 TikTok Content Posting API | Phase 4 | 等扩分发/自动化授权时解锁 |
| **#21** | 多模态 RAG | Phase 3 | 等素材库规模达到多模态检索门槛 |
| **#157** | B-roll 高质量模型横评 | Phase 3 | 等高质量 B-roll 需求触发 |
| **#158** | B-roll ComfyUI / MCP 迭代式后端 | Phase 3 | 等 #157 横评定案 |
| **#228** | 管线提速二期（scene batch/daemon） | Phase 1 | 数据驱动触发：等下次真实冷跑 profile 出现新瓶颈 |
| **#222** | 抽象短视频引擎为独立 repo | Phase 4 | 前置：落地并行工作 → Email POC 视频跑通 → 再抽取 |

---

## Triage Inbox（隔离区）

新开 issue 必须先带 `needs-triage` 标签登记在此。分流后迁入对应 Phase、Wave 与 Tier。

| # | 开票日 | 一句话描述 | 分流结果 |
| --- | --- | --- | --- |
| — | — | *当前隔离区全量已清空，所有存量 open issues 已完成分流排期* | ✅ 全部已分流 |

---

## Conflict Risk Matrix（文件并发风险矩阵）

同时修改同一文件的 Issue **严禁并行，必须串行执行**：

| 文件 / 模块 | 涉及 Issues | 风险与并发控制规则 |
| --- | --- | --- |
| `scripts/short-video/main.mjs` | **#272**, **#287**, **#293**, #228 | 🔴 **最高**——管线生命周期入口。#287（env 加载最顶层）、#272（avatar 视频时长一致性 Gate）、#293（Stage 0 素材预获取）修改逻辑紧密相邻，**必须严格串行执行**。 |
| `scripts/short-video/lib/search-sources.mjs` | **#292**, **#287**, **#285**, **#301** | 🔴 **最高**——核心搜源调度器。#287（顶层加载 env）、#292（L0-L3 分流架构）、#285（needsAuth 放宽）、#301（实拍库存源接入）共享核心 collect 流程，**必须串行推进**。 |
| `scripts/short-video/lib/tts/quality-gate.mjs` | **#271**, **#270** | 🟡 **中**——TTS 质量防线。#270（参数校验）、#271（语义分流与 fail-closed）建议合并在同一开发会话内落地。 |
| `scripts/short-video/asset-sourcer.mjs` | **#297**, **#301**, **#294**, **#299** | 🟡 **中**——素材匹配与评分。#297（留空 fail-closed）、#301（实拍视频优先）、#294（borderline 二度校验）修改同一套评分流水线，须串行推进。 |
| `scripts/short-video/lib/source-health.mjs` | **#285**, **#286**, **#269** | 🟢 **低**——健康度与探针模块。改动轻量，遵循 fail-open 原则。 |
| `skills/search-pool/` / `skills/web-access/` | **#284**, **#276**, **#281** | 🟢 **低**——Agent 技能文档与工具定义。零代码风险，注意同步各 repo。 |
| `knowledge/media-catalog.json` / `asset-gaps.json` | **#288**, **#293** | 🟢 **低**——独立数据配置文件，无运行时逻辑交叉。 |
| `scripts/short-video/lib/b-roll/` | **#298**, **#289** | 🟡 **中**——视频生成模型调用。#298 确定模型选型后，#289 定制专有 prompt 模板，顺序推进。 |

---

## Design Decisions

### 1. 深度调研与基准先行（Research-First 驱动）
- **决策背景**：在复杂的多模态管线演进中，若未摸清竞品分镜节奏、外部开源经验及模型真实生成画质，直接动手修改业务代码会导致频繁推倒重来。
- **裁定规范**：
  - 视觉升级线（Phase 3）：必须先在 **Wave 3A** 完成 **#300**（竞品分镜结构解构）、**#302**（外部开源 Repo 深度学习）及 **#298**（T2V 模型横评），将调研结论凝练为 **#291** S3 Map 规范后，方可开展 Wave 3B（素材底座）与 Wave 3C（代码与模板适配）。
  - 多平台发布线（Phase 4）：必须先在 **Wave 4A** 完成 **#296**（调度架构调研）与 **#216**（微信视频号 5 项核心技术规格人工扫码实测），摸清真机限制与封号风控线后，方可解锁 Wave 4B 的自动化发布脚本。
  - 检索体系（Phase 2）：必须先在 **Wave 2A** 完成 **#281**（单引擎连通性与 DNS 摸底），再推进 Wave 2B 的搜源分流大盘改造。

### 2. Wave-Tier 双维协同架构
- **决策背景**：单维度的列表无法同时兼顾“时序推进次序（When to do）”与“业务价值高低（Why it matters）”。
- **裁定规范**：
  - **Wave 为全局推进时序**：按前置依赖与调研门控组织，定义从 Wave 1A 到 Wave 4B 的线性波次。
  - **Tier 为业务价值与出片保障分层**：Tier 1 聚焦阻断脏数据与出片硬底线，Tier 2 聚焦能力提升，Tier 3 聚焦工具排查。同 Wave 内选票严格遵循 Tier 1 > Tier 2 > Tier 3。
  - **Conflict Risk Matrix 为最终裁决**：任何跨票并行必须以文件冲突矩阵为准。

### 3. Dominant Issue (🎯) 统领与契约设立
- **决策背景**：单 session 逐票推进时，若无阶段性标准锚点，卫星任务容易各行其是。
- **裁定规范**：每个阶段设立 Dominant Issue 作为质量门禁或架构总图（如 #271 出片门控、#292 搜源分流、#291 视觉 Map、#296 发布 Map），卫星票必须向其交付具体切片并遵循其设立的接口契约。

### 4. Fail-Closed 门控底线优先于功能扩充
- **决策背景**：此前偶发 TTS 失败 take 或音画失步依然出片的问题，以及素材搜索在无匹配时强塞无关图片的降级行为。
- **裁定规范**：
  - 音频与视觉同步（#271, #272）：音画时长不一致或声学质检失败强行阻断出片，杜绝脏数据流入渲染流水线。
  - 素材匹配（#297）：素材搜索无高置信度结果时严格 fail-closed 留空，交由下游 B-roll 生成或纯版式卡片承接，绝不强塞无关图片。

### 5. 统一环境加载入口，杜绝库模块自载
- **决策背景**：#275 暴露出库文件（如 `search-sources.mjs`）假定调用方未加载 `.env.local` 而缺乏必要环境变量的问题。
- **裁定规范**：采纳 #287 设计，由管线入口顶层（`main.mjs`, CLI 等）统一单次加载 `.env.local`，所有底层库模块严禁自载，消除隐式依赖与加载竞争。

---

## 历史轮次下沉说明

历史轮次（第三十八 session 及更早共 56 轮轮换历史与已关闭的 100+ issues 清单）已规范下沉至：
- `docs/archive/tracker-rotation-history-2026-09-06.md`
- `docs/archive/reviews/issue-roadmap-review-2026-09-10.md`
