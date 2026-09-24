# Issue Roadmap — Open Issues 依赖关系与执行顺序

> **本文件是放置与依赖索引，不是台账**（2026-09-24 Round J 结构精简，296KB → 约 35KB）：每票一行，只回答「在哪条 Wave / 哪层 Tier / 与谁冲突」。
> 票的实时状态与标签以 `gh issue list --state open` 为准，**本文件不缓存状态**；交付叙事与证据的唯一权威源是 **issue 评论**（`gh issue view <N> --comments`）。
> 历史叙事与已闭票行 → [`archive/roadmap-tables-archive-2026-09-24.md`](archive/roadmap-tables-archive-2026-09-24.md)；更早逐轮盘点 → [`archive/roadmap-inventory-history-2026-09-23.md`](archive/roadmap-inventory-history-2026-09-23.md)。
> **维护规则**：新票分流后加一行；**闭票即删行**（交付记录写进闭票评论）；每轮盘点只改「当前状态」的 Last inventory 一行。

## 当前状态

> **Last inventory**: 2026-09-24（**Round J**：#333 收口——36kr/guancha CDP 取证收敛，selector-health 双绿 95/239 + 抽样文章页 4/4 可达，无需改 registry；**#269 母票闭票**——卫星 #331/#332/#333/#336/#337/#330 全闭，遗留项归 #286/#346 与用户级裁决；本文件完成结构精简）。
>
> **frontier**：Tier 1 可立即开工 **#298**（P1）/ **#297**（P1）；#300/#302 并行调研（W3A）；#326/#346/#347 等 `needs-triage` 先分流再开工。
>
> 近轮一句话档案：**Round I + 续波**（源健康收口：polymarket 修复 / duckduckgo RETIRED / digg 降级 site: / xhs 登录修复 / SearXNG 复活）；**Round F**（URL 对齐审计 `registryPatches: 0`）；**#335 已撤销**（四轴定案：抽取层最权威）。全文见 [`archive/roadmap-tables-archive-2026-09-24.md`](archive/roadmap-tables-archive-2026-09-24.md) 与 issues/269 评论。

---

## Dominant & Satellite Issue Hierarchy（主导与卫星 Issue 层级）

在 Phase / Wave → Task → Issue 三层架构中，**Dominant Issue（主导 Issue / 锚点 Issue，标有 🎯）** 负责**定标准、定架构、立契约、设 Gate 或承接 Wayfinder Map**；**Satellite Issues（卫星 Issue / 子任务）** 围绕它展开并向其交付。

| Phase                                                | Dominant Issue (🎯 主导票)                                                                                                                                                                                                               | Satellite Issues (挂靠卫星票)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 架构定位与统领关系                                                                                                                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1: 管线可靠性与安全闭环**                    | ✅ **#271** TTS Quality Gate 语义分流与出片阻断 (P1, 已闭票)<br>✅ **#272** Avatar 唇同步时长一致性 Gate (P1, 已闭票)<br>✅ **#270** TTS instruct 标准机制级化 (P2, 已闭票)                                                              | → **#279** (语速整体上探与耦合, P2)<br>→ **#278** (Hook 文案句式规范, P2)<br>→ **#273** (并行经验与 CDP 并发锁, P2)<br>→ **#274** (Z-Image-Turbo 许可排查, P3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | #271 + #272 + #270 均已交付（Fail-closed 语义分流 + avatar 片段时长一致性 + instruct 单一来源三层门控）；#270 改动前实测 9/9 visualType instruct 跨引擎发散、5/9 无 instruct，现由 `lib/tts/instruct.mjs` 单一来源收口。 |
| **Phase 2: 检索体系与运行环境固化**                  | ✅ **#292** search-sources 体系性重审与通用/专用分流 (P1, 已闭票——grilling 裁决收口)<br>✅ **#287** 管线入口统一加载 .env.local (P1, 已闭票)<br>✅ **#309** 62 源用途定链审计 (P1, 已闭票——两条契约定链执行全部交付 `bc34f67`+`d0f2ea0`) | ✅ **#307** (Bigsong 直连 + Grok promptTemplate, P2, 已闭票)<br>✅ **#306** (brief-builder 测试日期衰减, P2 bug, 已闭票)<br>✅ **#311** (claim 脚本 @me assign 静默失败, P2 bug, 已闭票)<br>→ **#312** (coverr 下载链失效, P2 bug)<br>→ **#313** (youtube bot-check 验证 Chrome cookie, P2 bug)<br>→ **#315** (交付记录门禁软提醒闭环与复检机制, P2)<br>→ **#305** (pool 静默零结果 A/B, P2——并入统一 source-health)<br>→ **#275** (全链路不自载缺陷, 由 #287 闭环)<br>→ **#285** (needsAuth 403 探针放宽, P2)<br>→ **#284** (Route C 循环引用消除, P2)<br>→ **#276** (web-deep-research 路由接入, P2)<br>→ **#286** (trend 模式相关性护栏, P2——裁决并入 #309 新闻参数)<br>→ **#281** (Search Pool 引擎可用性复测, P2)<br>✅ **#269** (死源自动修复 Phase 2, P2——已闭票 2026-09-24，交付审计见票评)<br>→ **#231** (环境固化真机验收, P3) | #292 主导搜索链路宏观分流架构（已闭票，grilling 七项裁决落 #309/#307/#269/#310）；#287 主导环境变量单一入口加载契约，闭环 #275。                                                                                         |
| **Phase 3: 视觉设计系统与媒体素材重构**              | 🎯 **#291** 短视频模板视觉设计体系重做 (P1, `wayfinder:map`)<br>🎯 **#310** 素材库体系——统一素材库 + 文字描述索引 + 收获率 log (P2, 吸收 **#288**/**#301**)<br>🎯 **#298** B-roll T2V 模型画质评测升级 (P1)                              | → **#300** (外部赛道爆款解构基准, P2)<br>→ **#302** (外部开源 Repo 逐个深度追踪, P2)<br>→ **#301** (实拍库存视频优先策略改造, P2——并入 **#310**)<br>→ **#314** (douyin/xhs 视频素材源 + CDP 新闻源视频能力重构, P2)<br>→ **#299** (Hook 前 3 秒专属视觉策略, P2)<br>→ **#289** (Scene->Prompt->Video 适配层, P2)<br>→ **#293** (Stage 0 素材预获取与缺口回流, P2)<br>→ **#297** (素材匹配 Fail-closed 留空, P1)<br>→ **#294** (VLM borderline 二度校验, P2)<br>→ **#295** (写稿 scene-data 概念泛化, P2)<br>→ **#253** (行业坐标系+hook 版式, P2)<br>→ **#304** (T2I 工具横评, P3)                                                                                                                                                                                                                                       | #291 为视觉重做总指挥与 S3 Map，以 #300 竞品解构与 #302 开源调研为输入；#288 主导官方素材库结构；#298 主导生成画质横评与跃迁（吸收关闭 #290）；#297 守住不塞无关图底线。                                                 |
| **Phase 4: 多平台发布通道与中文内容生态 (最终阶段)** | 🎯 **#296** 中文多平台发布架构 (P2, `wayfinder:map`)<br>🎯 **#268** 中文内容轨首包产出 (P2)                                                                                                                                              | → **#216** (视频号人工扫码 5 项实测, P2)<br>→ **#217** (管线适配视频号发布包, P2)<br>→ **#218** (视频号 CDP 自动化发布, P2)<br>→ **#220** (抖音发布通道落地, P2)<br>→ **#223** (小红书图文频道立项, P2)<br>→ **#206** (Auto-Redbook 试点, P3)<br>→ **#208** (降级图文帖路径, P3)<br>→ **#210** (TikTok 官方 API 发布, P3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | #296 为全渠道发布总图与 S3 Map，主导自研 vs Relay 架构决策；#268 产出合规中文样片物料，作为 #216 扫码实测的必要物料。                                                                                                    |

---

---

## Duplicate & Absorption Notes

| Issue                                       | Absorbed by                                  | Status & Action                                                                                                                    |
| ------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **#283** (fallback 链语义重审)              | **#292** (search-sources 体系性重审)         | ✅ **CLOSED (Duplicate)**：全部议题由上游大盘票 #292 完整覆盖吸收。                                                                |
| **#290** (Wan1.3B 文字数字视频效果差)       | **#298** (B-roll T2V 模型画质评测升级)       | ✅ **CLOSED (Duplicate)**：文字与数字测试集并入 #298 评测矩阵统一推进。                                                            |
| **#275** (search-sources 不自载 .env.local) | **#287** (入口统一加载 .env.local)           | ✅ **CLOSED (Delivered)**：#287 落地（`lib/load-env.mjs` + 三入口），联动闭票。                                                    |
| **#247** (Hook bigNumber 缺乏上下文)        | **#253** (行业知识层 Ontology + hook 版式库) | ⏩ **Dormant**：待 #253 交付后覆盖关闭。                                                                                           |
| **#288** (媒体素材补全与 RAG 兜底 Catalog)  | **#310** (素材库体系)                        | ⏩ **并入**：2026-09-15 grilling 裁决——实体图库与官方肖像由 #310「统一素材库 + 文字描述索引」承接。待 #310 交付后覆盖关闭。        |
| **#301** (实拍库存视频优先策略改造)         | **#310** (素材库体系)                        | ⏩ **并入**：2026-09-15 grilling 裁决——stock-video-first 属素材获取策略，与 #288 同为 #310 的切片。待 #310 交付后覆盖关闭。        |
| **#286** (trend 模式相关性护栏盲区)         | **#309** (62 源用途定链审计)                 | ⏩ **并入**：2026-09-15 grilling 裁决——相关性护栏并入 #309 新闻参数（publishedAt 两档 + 7 天窗）一并落地。待 #309 交付后覆盖关闭。 |
| **#280** (search-sources 不自载 .env.local) | **#275**                                     | ✅ **CLOSED (Duplicate)**                                                                                                          |
| **#282** (search-pool skill 跨 repo 同步)   | —                                            | ✅ **CLOSED (Superseded)**：已由前序 commit 同步闭环。                                                                             |

---

---

## Execution Waves（执行波次总表）

每行只列 **open 票**（状态看 tracker，不看本表）；已闭 Wave 的结论在「并行/依赖」列留一行，细节见 archive。

| Wave | 主题 | 涉及目录 | open 票 | 并行 / 依赖 |
| --- | --- | --- | --- | --- |
| **W1A** | 管线可靠性安全门控 | `lib/tts/quality-gate.mjs` `main.mjs` | — | ✅ 完成（#271/#272 闭票） |
| **W1B** | 参数标准化与听感 | `lib/tts/` `docs/content-pipeline.md` | #279 #278（HITL）｜D：#228 | #270 已交付（instruct 单一来源） |
| **W2A** | 搜源可用性摸底与环境底座 | `skills/search-pool/` `main.mjs` `lib/load-env.mjs` | — | ✅ 完成（#287/#281 闭票），解锁 W2B |
| **W2B** | 搜源架构重审与修复闭环 | `lib/search-sources.mjs` `lib/source-*.mjs` `skills/web-access/` `.github/workflows/` | #326 #346 #347（先分流）｜#231｜D：#286 #322｜#348 待分流 | #292/#309/#269 及全部卫星已闭；registry / heal 判据改动见冲突矩阵 |
| **W3A** | 视觉与竞品深度调研（调研先行） | `docs/research/` `lib/b-roll/` | #291（🎯map）#298（🎯）#300 #302 #304 | 🟢 全部只读调研可并行；**先于任何视觉代码改动** |
| **W3B** | 媒体底座与素材体系 | `asset-sourcer.mjs` `knowledge/media-catalog.json` | #297 #310（🎯）#293 #314｜D：#288 #301 | #310 吸收 #288/#301；#309 定链审计结论已备 |
| **W3C** | 画面适配与智能写稿 | `scene-data.mjs` `lib/visual-analyzer.mjs` | #289 #299 #294 #295 #253 #244 #256 #263（多为 HITL） | 依赖 W3A 选型（#298）与 W3B 素材流 |
| **W4A** | 平台架构调研与中文首包 | 视频号后台 `docs/research/` `content/` | #296（🎯map）#268 #216（HITL）｜D：#210 | 真机实测先行 |
| **W4B** | 发布包适配与自动发布 | `lib/platforms/` | D：#217 #218 #220 #223 #206 #208 #222 | 🔴 硬前置：等 #216 实测数据 + 用户立项授权 |

### Execution Semantics（三层执行语义规范）

三层结构各司其职，紧密联动：

1. **Wave（波次）**：**执行摘要与全局推进顺序**。基于技术依赖、业务里程碑与「调研先行」原则合成。新 session 启动时，**首先查看当前最早未完成的 Wave**。
2. **Tier（分级）**：**完整 Issue 资产库的权威价值位置**。按对生产力与内容质量的实质推动力划分（Tier 1 核心底线 > Tier 2 能力增强 > Tier 3 工具合规 > Dormant 冻结）。同一 Wave 内选票时，**Tier 1 绝对优先于 Tier 2/3**。
3. **Conflict Risk Matrix（并发风险矩阵）**：**多 session 或跨 issue 并行的唯一终审裁决来源**。Wave 表中的并行说明仅为业务初筛；任何具体代码编写前，**必须核对文件级冲突矩阵**。

---

---

## Detailed Phase Roadmaps（阶段执行分解）

### Phase 1: 管线可靠性与核心安全门控 (Pipeline Stability & Core Guardrails)

- **阶段目标**：杜绝坏 take 静默出片，解决 TTS 与 Avatar 唇同步时长一致性，消除参数隐患，建立坚不可摧的生产安全底线。
- **划分波次**：
  - **Wave 1A（即时门控，✅ 本波次完成）**：✅ **#271**（TTS Quality Gate 语义分流与 fail-closed 阻断）+ ✅ **#272**（Avatar 视频有效时长 ≥ TTS 时长强校验 Gate）——出片双重保险到位，下一波次为 Wave 1B。
  - **Wave 1B（标准化与语速规范，✅ Dominant 已交付）**：✅ **#270**（TTS instruct 单一来源 `lib/tts/instruct.mjs` + manifest 抛错 / preflight 覆盖检查 / gate 签名告警三层门控，实测基线 9/9 发散已收口）+ **#279**（语速整体微调 + narrative 耦合，下一 frontier，`ready-for-human`）+ **#278**（Hook 文案具象化对比规范，`ready-for-human`）+ **#273**（CDP 并发锁与经验沉淀）+ ✅ **#274**（Z-Image-Turbo 许可核查，已交付：裁定误标、维持现状）。

---

### Phase 2: 检索体系与运行环境固化 (Search & Retrieval Architecture)

- **阶段目标**：理顺检索降级链，消除环境变量自载缺陷与 Agent 路由循环引用，固化跨平台运行环境。
- **划分波次**：
  - **Wave 2A（【调研先行】探针摸底与环境底座，✅ 本波次完成）**：✅ **#281**（Search Pool 引擎可用性复测：Serper 可用并修复 `parseArticles` 映射 bug、Brave TUN 故障未复现，绕行方法留档）+ ✅ **#287**（管线入口顶层统一加载 `.env.local`，彻底闭环 **#275**，已闭票）。
  - **Wave 2B（搜源分流架构与去环落地）**：✅ **#292**（专用源直连平台 MCP vs 通用源 L3 Pool 分流总图，吸收 **#283**，已闭票——grilling 七项裁决收口，执行移交 #309/#307/#269/#310）+ **#309**（62 源用途定链审计，✅ `bc34f67` + `d0f2ea0` 交付，已闭票）+ **#307**（Bigsong 直连 + Grok promptTemplate，✅ commit `2f97be9` 交付，已闭票）+ **#306**（brief-builder 测试日期衰减基线修复，✅ commit `f7e2731` 交付）+ **#305**（pool 静默零结果 A/B 告警与 streak，C 项 CI 自动开票待授权）+ ✅ **#285**（needsAuth 403 探针放宽，`47fbeaf` / `c957bdc` 交付，已闭票 2026-09-20）+ ✅ **#313**（youtube bot-check Chrome cookie 通道，`9760bda` 交付，已闭票 2026-09-20）+ ✅ **#284**（Route C 循环引用消除，`4c8e92c` + `0340949` 交付 2026-09-20，已推 main `3cdbec9..b13120d`）+ ✅ **#276**（web-deep-research 接入 Search Pool，stale premise 收口闭票 2026-09-21——方案被 #307 用户签字推翻）+ ✅ **#324**（ffmpeg 下载段系统代理 hand-off，`a94f1f3` + `a996821` + `3321cb2` + `4a318a2` 交付 2026-09-21，已推 main `6050db5..4a318a2`）+ **#286**（trend 模式相关性护栏）+ **#269**（死源自动修复 Phase 2）+ **#231**（Kaggle wheels 挂载真机终验）。

---

### Phase 3: 视觉设计系统与媒体素材重构 (Visual Redesign & Media Pipeline)

- **阶段目标**：重构短视频视觉体系达到顶尖商业新闻质感，引入实拍库存优先与实体 Catalog，升级 B-roll 生成模型画质。
- **划分波次**：
  - **Wave 3A（【深度调研先行，基准确立】）**：
    - **#300**：CDP 抓取头部竞品解构音视频分镜与节奏基准，产出分析报告；
    - **#302**：深度学习吸收外部开源项目（MoneyPrinterTurbo 等）在分镜和调度上的成熟经验；
    - 🎯 **#298**：本地 MLX → 免费云端（AtomGit/Kaggle）→ 付费云端（Modal L4）模型画质横评（吸收 **#290** 文字测试集）；
    - 🎯 **#291**：汇总调研成果，确立 S3 视觉重做 Wayfinder Map。
  - **Wave 3B（媒体底座与素材兜底）**：🎯 **#310**（素材库体系统一——统一素材库 + 文字描述索引 + **收获率搜索 log（第一交付物，可先行）** + 素材关键词体系；**吸收 #288 + #301**）+ **#297**（素材匹配 Fail-closed 留空绝不硬塞无关图）+ **#293**（Stage 0 素材预获取与缺口回流）。
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

---

## Execution Tiers（open 票放置）

只列 open 票；每票一行。状态标签看 tracker；叙事与证据看票评论。

### Tier 1 — 核心阻断与出片质量基线（优先攻坚）

| # | 标题 | Phase·Wave | 备注 |
| --- | --- | --- | --- |
| #298 | B-roll T2V 模型画质评测升级（替代 Wan1.3B） | P3·W3A | 🎯 Dominant；吸收 #290 |
| #297 | 素材匹配 Fail-closed 留空（杜绝无关图片） | P3·W3B | P1 bug |
| #291 | 短视频模板视觉设计体系重做 | P3·W3A | 🎯 wayfinder:map（HITL） |
| #216 | 视频号人工发布试点（实测 5 项规格） | P4·W4A | HITL；W4B 硬前置 |

### Tier 2 — 架构深化与能力增强（稳步推进）

| # | 标题 | Phase·Wave | 备注 |
| --- | --- | --- | --- |
| #279 | 语速整体上探 + narrative 速度耦合 | P1·W1B | HITL |
| #278 | Hook 文案句式规范（#244 后续） | P1·W1B | HITL |
| #326 | 本地 ML 栈安全升级（torch/transformers） | P2·W2B | security；需先分流 |
| #346 | detectAntiBot 抢跑假 anti_bot 判决 | P2·W2B | bug |
| #347 | package-lock.json 与 package.json 脱同步 | P2·W2B | bug |
| #300 | 头部竞品短视频分镜解构基准 | P3·W3A | feeding #291 |
| #302 | 外部开源 Repo 深度学习吸收追踪 | P3·W3A | documentation |
| #310 | 素材库体系（统一素材库+索引+收获率 log） | P3·W3B | 🎯 Dominant；吸收 #288/#301 |
| #293 | Stage 0 素材预获取 + 缺口回流 | P3·W3B | |
| #314 | douyin/xhs 视频素材源（发现入口 + 白名单） | P3·W3B | 2026-09-19 裁决：CDP 新闻源摘除 videos 声明 |
| #289 | Scene 数据与生成画面适配 | P3·W3C | |
| #299 | Hook 前 3 秒专属视觉策略 | P3·W3C | HITL |
| #294 | VLM asset relevance 复杂系统设计 | P3·W3C | |
| #295 | assetNeed 泛化：claim→搜索概念 | P3·W3C | |
| #253 | 行业知识层 Ontology + hook 版式库 | P3·W3C | HITL |
| #244 | Hook scene emotion 不足 | P3·W3C | HITL |
| #256 | 数字人决策权变更 + 白/黑名单重审 | P3·W3C | HITL |
| #263 | TikTok 成片时长目标重审 | P3·W3C | HITL |
| #296 | 中文多平台发布架构（AiToEarn 调研） | P4·W4A | 🎯 wayfinder:map |
| #268 | 中文内容轨首包产出 | P4·W4A | #216 前置物料 |
| #328 | yt-dlp chrome cookie node-spawn 挂起 | 待分流 | bug |

### Tier 3 — 低重要性 / 工具链与合规排查

| # | 标题 | Phase·Wave | 备注 |
| --- | --- | --- | --- |
| #231 | TTS/渲染环境固化（Kaggle Dataset + torch 锁版） | P2·W2B | |
| #304 | T2I 生成工具横评（mflux 协议适配度） | P3·W3A | 只读调研 |
| #348 | colima 替代品调研（OrbStack 等） | 待分流 | |

### Dormant — 触发条件未满足（暂缓占用排期）

| # | 标题 | Phase | 备注 |
| --- | --- | --- | --- |
| #286 | trend 模式关键词相关性护栏盲区 | P2 | 并入 #309 已交付，待覆盖关闭 |
| #322 | needsAuth 源零结果差异化计数语义 | P2 | |
| #228 | 管线提速二期（batch/daemon/并行） | P1 | |
| #21 | 多模态 RAG（图像/视频检索） | P3 | |
| #157 | B-roll 高质量模型横评 | P3 | |
| #158 | B-roll ComfyUI / MCP 迭代式后端 | P3 | |
| #224 | 数字人半身像支持 | P3 | |
| #230 | 字幕短 cue 两行版式合并 | P3 | |
| #288 | 媒体素材补全 catalog 进 RAG 兜底 | P3 | 并入 #310，待覆盖关闭 |
| #301 | 实拍库存视频优先策略 | P3 | 并入 #310，待覆盖关闭 |
| #247 | Hook scene bigNumber 缺乏上下文 | P2 | 待 #253 交付后覆盖关闭 |
| #217 | 管线适配视频号发布包 | P4 | |
| #218 | 视频号 CDP 自动化发布路线 | P4 | |
| #220 | 抖音发布通道落地 | P4 | |
| #222 | 抽象短视频引擎为独立 repo | P4 | |
| #223 | 小红书图文频道立项 | P4 | |
| #206 | Auto-Redbook 试点 | P4 | |
| #208 | 降级图文帖路径 | P4 | |
| #210 | TikTok Content Posting API 调研 | P4 | |

---

## Triage Inbox（待分流队列）

按 [`triage-labels.md`](agents/triage-labels.md) 定 Phase / Wave / Tier / P 标签后移入 Tier 表并摘 `needs-triage`。历史分流台账（含全部已闭票行）→ [`archive/roadmap-tables-archive-2026-09-24.md`](archive/roadmap-tables-archive-2026-09-24.md)。

| # | 标题 | 备注 |
| --- | --- | --- |
| #344 | SearXNG 覆盖面审计（registry ↔ SearXNG 引擎对照） | 与 #318 同域，建议合并分流 |
| #318 | SearXNG 全量引擎启用 + 逐引擎 fallback | 同上 |
| #319 | OCR 代码审查 4 high + 15 medium/low | security |
| #320 | 自建 wechat→RSS 实例（动察Beating 登记） | proposal |
| #325 | lib unused exports 清理 + 移除 knip ignore | scope 已刷新（2026-09-24 票评） |
| #326 | 本地 ML 栈安全升级 | security；AC 含 venv 重建 + 三真实 smoke |
| #327 | 统一本地模型存放位置 | 无标签 |
| #329 | yt-dlp 代理 hand-off 残余覆盖（#324 后续） | bug |
| #334 | VLM Prompt 优化（Fit/claim/Reason） | 无标签 |
| #339 | SEO monitor failing（structured data / robots.txt） | bug, seo-monitor |
| #351 | vlm 缓存 key 与实际产出模型脱钩（stale cache） | bug；PR #350 droid P2 已核实 |
| #352 | transformers 5.x 升级链评估（解除 3 条 High 告警） | enhancement；告警已 dismiss tolerable_risk |

---

## Conflict Risk Matrix（文件并发风险矩阵）

同时修改同一文件的 issue **严禁并行，必须串行执行**。只列仍有 open 票的文件组；已全部闭票的历史行 → archive。seam 约定不随闭票失效。

| 文件 / 模块 | open 票 | 风险与串行规则 |
| --- | --- | --- |
| `scripts/short-video/main.mjs` | #293（D：#228） | 🔴 管线生命周期入口，与 Stage 0 改动严格串行 |
| `lib/source-registry.mjs`<br>`lib/search-sources.mjs` | #314 | 🔴 核心搜源调度。#285 的探针不变量在 `lib/source-health.mjs` seam（`isProbeAuthoritative` 等）；registry 改动与判据改动同批，勿并行开 session |
| `lib/source-url-heal.mjs`<br>`source-url-sweep.mjs`<br>`source-url-discover.mjs` | —（#269 家族已闭） | 🟡 判据改动必须加在 `isFailureVerdict()` / `needsCdpSecondOpinion()` seam 上，不在调用点各写一份；sweep/discover 是只读消费者，可与 registry 并行；产物落 gitignored `output/` |
| `lib/video-downloaders.mjs` | #314 | 🟡 下载适配器层；douyin/xhs 适配器改动在此排队 |
| `asset-sourcer.mjs` | #297 #294 #299（D：#301） | 🟡 素材匹配评分流水线，串行 |
| `knowledge/media-catalog.json`<br>`asset-gaps.json` | #310 #297 #293 #294 #299 | 🟡 #310 为 W3B Dominant；收获率 log 与其余低耦合可先行 |
| `lib/b-roll/` | #298 #289 #304 | 🟡 #298 定选型 → #289 定 prompt 模板；#304 只读调研可并行 |
| `lib/source-health.mjs`<br>`lib/search-pool.mjs` | D：#286 #322 | 🟡 统一信号事实源；改动遵循 fail-open |
| `lib/tts/` | D：#228 | 🟡 instruct 文案改动只动 `lib/tts/instruct.mjs` 单一来源 |

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
  - TTS 出片门控（#271，已交付闭票）：失败按族分流后一律 fail-closed——**pacing 类**（音素正确、仅实测 WPM 偏低）先经 #252 补差，补差仍低于下限 → `TTS_PACING_FLOOR_BLOCK`；**acoustic 类**（截断/漏词/相似度低/无音频）禁入补差环、重抽 ≤2 次后 → `TTS_ACOUSTIC_HARD_BLOCK`。两类硬阻断均不受 strict/non-strict 影响（仅 gate 未分类的失败保留旧非 strict 语义），唯一逃生门 `TTS_SKIP_QUALITY_GATE=1`。用户裁决记录见 issue #271 交付记录。
  - 音频与视觉同步（#272，已交付）：avatar 片段时长 < 该 scene **当前** TTS 音频时长 → 阻断出片（`main.mjs` Step 2.5 与渲染 staging 双门控，单实现 `lib/avatar-guard.mjs`），杜绝唇同步 stale 流入渲染流水线。
  - 素材匹配（#297）：素材搜索无高置信度结果时严格 fail-closed 留空，交由下游 B-roll 生成或纯版式卡片承接，绝不强塞无关图片。

### 5. 统一环境加载入口，杜绝库模块自载

- **决策背景**：#275 暴露出库文件（如 `search-sources.mjs`）假定调用方未加载 `.env.local` 而缺乏必要环境变量的问题。
- **裁定规范**：采纳 #287 设计，由管线入口顶层（`main.mjs`, CLI 等）统一单次加载 `.env.local`，所有底层库模块严禁自载，消除隐式依赖与加载竞争。

### 6. 通用/专用源分流与平台保真链（#292，2026-09-15 终版裁决）

- **决策背景**：#292 重审发现 x_search 链条语义分裂——通用 pool 插进平台保真链中间，命中结果非 X 内容却挂 x_search 标签并抢占更高质量的 Bigsong 推文（smoke 实证）。
- **裁定规范**（用户裁决，2026-09-15）：
  - **平台保真链**：平台专用源（x_search/xhs/sogou_weixin/weibo_hot/bilibili 等）全链只用平台忠实层——x_search = `CDP → googleSiteFallback(site:x.com) → Bigsong 直连`，**不进通用 pool**；triage 规则 1 精神优先于 #65 的七源字面名单（该名单写于 #90 平台化之前，已过时）。googleSiteFallback 的死层根因（capabilities 遮蔽）已修复（#292，`f3d10ba`），真实 smoke 首次提取成功。
  - **pool 资格**：仅 `mcpFallback.toolName === "web_search"` 的 6 个通用源（youtube/arxiv/github/threads/google/mcp_grok_search）；pool（Serper > Brave > Tavily > Jina）先于 Grok MCP 兜底。
  - **Bigsong ≡ mcp-search-bridge 后端**（用户裁定，#90 实证：same upstream/system prompt/env，minus subprocess）；程序化抓取优先直连 API，MCP 协议保留给大模型/Agent 消费方——推广转换见 #307。
  - **不变量**：仅 x_search 携带 apiFallback（registry 级测试锁死）；apiFallback = 平台 Bigsong 桥专属槽位。

---

---

## 历史轮次下沉说明

- [`archive/roadmap-tables-archive-2026-09-24.md`](archive/roadmap-tables-archive-2026-09-24.md) —— 2026-09-24 结构精简前的全量版本：Execution Waves / Execution Tiers / Triage Inbox 三表的历史叙事行、已闭票行与历轮 Round 结论（Round A–J）。
- [`archive/roadmap-inventory-history-2026-09-23.md`](archive/roadmap-inventory-history-2026-09-23.md) —— 逐 session 盘点条目（2026-08 至 2026-09-23 Round E，78 行）。
- 交付细节的唯一权威源始终是 **issue 评论**（`gh issue view <N> --comments`）；archive 文件只作追溯，不作为现状依据。
