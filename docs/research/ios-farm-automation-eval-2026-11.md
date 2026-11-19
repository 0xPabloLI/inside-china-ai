# 真机发布自动化阶段二：选型评估（#1352）

> **调研日期**：2026-11-15
> **目标**：按 `docs/agents/proposal-review.md` 口径，评估 `Git-Agni/prod-FARM-IOS-Core` × Appium XCUITest 这条真机发布路线能否进入本仓，给出可裁决的工具准入、硬件/iOS 权衡、工作量与风险底稿。
> **下游票**：#1183（真机 iPhone 自动化发布长期方案票；本报告的三选一建议与三项前置由它承接，采用与否仍待用户裁决）。
> **边界**：本票只产出报告。未 clone 该仓库、未安装 Appium / WDA / Xcode、未采购硬件、未触碰任何 TikTok 账号，也未跑过一次真机流程（票面「明确不做」）。因此下文所有「能否装起来」的判断都是**静态契约推导**，不是实测复现；凡未经实测处均显式标注。

> **路径记法**：下文形如 `Git-Agni/prod-FARM-IOS-Core/src/…` 的路径一律指该外部仓库 HEAD `3e936bab` 的文件，不是本仓路径；`appium/appium-xcuitest-driver/docs/…` 同理。

**结论速览**：三选一 = **「需要先解决 X」**（X 为 §5 的三项前置）。核心原因不是「真机路线不工作」，而是**上游仓库当前在 fresh clone 上装不起来，且其锁定的 WDA 补丁链与本机 2026-11 的 Xcode/macOS 组合不兼容**；叠加 ToS 与 #1181 裁决边界，现阶段不具备进入施工的条件。

---

## 1. 工具准入

### 1.1 `Git-Agni/prod-FARM-IOS-Core`

| 检查项 | 事实 | 判定 |
| --- | --- | --- |
| License / 存档状态 | Apache-2.0；`archived=false`、`disabled=false` [S1, 2026-11-15] | 通过 |
| 是否真有代码 | 仓库树 123 个 blob，`truncated=false`：70+ 个 `src/**/*.ts`（devices / scheduler / tiktok / api）、`drizzle/` 迁移、`test/`、`Patches/` 两个 WDA 补丁、`docs/` 4 份 [S2, HEAD `3e936bab`] | 通过：不是只有 README 的空壳 |
| 活跃度 | 创建 2026-08-27，**最后一次 push 2026-09-07**（距评估日 69 天），共 8 次可见提交、无 release / tag；`updated_at=2026-11-15` 是 star 等元数据变化，不是代码更新 [S1/S3] | **弱**：未超「6 个月不推荐」红线，但两个月零代码更新 |
| Issue / PR 健康度 | 4 open issues + 3 open PR，3 个 open PR 全为外部提交且**均未合并**：#6（依赖冲突修复，2026-09-14 开，挂 62 天）、#7（humanizer draft，有维护者 review 往返但仍是 draft）、#8（native publishing draft，自述未达生产）。#5「fresh-clone 安装失败」2026-09-23 关闭，但仓库 HEAD 仍停在 9-07 ⇒ **关票 ≠ 修复** [S3] | **弱**：维护者仍在回评论，但不合代码 |
| Fork 可维护性 | 328 forks；按 newest 取前 10 个，`pushed_at` **全部等于上游的 2026-09-07**，无一有自身新提交 [S3, 2026-11-15] | 无活跃 fork 维护者可依赖 |
| 规模信号 | 1,878 stars / 328 forks [S1]；writeup 称 9 台 iPhone、21 天、189 帖、3.78M 播放 [S4] | 热度与实测数字属**第三方单方陈述**，见 §4 |

**静态安装契约冲突（本报告最关键的准入发现）**：`package.json` 的 `appium:install-driver` 固定安装 `xcuitest@7.26.3`，而 `devDependencies.appium` 是 `^3.7.0`。npm registry 实测 `xcuitest@7.26.3` 的 peer 是 `appium ^2.5.4`、bundled `appium-webdriveragent ^8.9.1` [S6, 2026-11-15]。即 README 第 2 步 `npm install → npm run appium:install-driver` 必然失败，报错与外部 issue #5/#6 记录一致 [S3]。两条修法都有代价：

- 按 #6 把 Appium 降到 2.x ⇒ 保留 WDA 8.9.1 与现成补丁，但钉死在旧工具链；
- 升到 Appium 3 + driver ≥10 ⇒ 官方表显示 WDA 升到 10.x+ [S5]，而 `Patches/` 两个补丁按文件名与 `wda:prepare` 的硬编码路径都只针对 **WDA 8.9.1** [S2]，补丁需移植并重测。

### 1.2 Appium / XCUITest 官方工具链

| 检查项 | 事实 | 判定 |
| --- | --- | --- |
| `appium/appium` | Apache-2.0，22,220 stars，最后 push 2026-11-14；npm 最新稳定 `3.9.1` [S7/S6] | 通过（活跃） |
| `appium/appium-xcuitest-driver` | Apache-2.0，906 stars，最后 push 2026-11-13；npm 最新 `13.1.1`（2026-11-13），peer `appium ^4.0.0-beta.8` [S7/S6] | 通过（活跃） |
| 版本矩阵（Appium 官方 system-requirements 文档，master） | iOS 15.0–15.3 → driver 4.0.0–5.2.0 / WDA ≤5.8.5；iOS 16.0–16.7 → 4.7.4(4.21.7)–**7.26.3** / WDA ≤**8.9.1**；iOS 17 → ≤10.1.0；iOS 18 → 7.24.15–12.12.4 / WDA 8.9.1–16.12.8；iOS 26 → ≥9.5.0 / ≥10.23.2；iOS ≥27 → ≥11.1.2。driver→Appium server：4.0–9.10.5 ⇒ Appium 2；10.0–12.22.8 ⇒ Appium 3；≥13 ⇒ Appium 4 [S5, 2026-11-15] | #1183 票面录的「15.0–17.7」**方向正确但已不完整**：漏了 18/26/27，且漏了宿主侧约束（§2） |
| 长期通道风险 | 官方注：iOS/tvOS **<18 只能走临时 `usbmux` fallback**，依赖 Apple 预期移除的 legacy lockdown 服务；iOS 18+ 建议 Remote XPC tunnel [S5] | iOS 15/16 旧机是**有到期日的方案** |

### 1.3 与现有 CDP 发布路径的重叠度与隔离边界

本仓 `tiktok-upload-prep.mjs`（2,339 行）是 **CDP + Chrome DOM** 通道；`lib/human-input.mjs`（1,224 行）用第二 CDP session 造 `isTrusted` 输入；`lib/publish-throttle.mjs` 把节流状态放在自动化 Chrome profile 的 `publish-throttle.json`（3 次/日、5–10 分钟）；`lib/platforms/upload-prep-policy.mjs` 把 AI 声明与发布方法做成加载期契约；终态经 `pollFor(DRAFT_STATE)` 存草稿且**不重试**，重复投递风险靠「先查 Studio Drafts」的人工提示兜住 [S8, 基线 `b111f7ff`]。`docs/content-pipeline.md:704-710` 已把 FARM 三条做法的归属切开：PC 网页路径承接第一条，行为模型与坐标点击两条属真机 App 路径 [S8]。

| 层 | 是否重叠 | 说明 |
| --- | --- | --- |
| 发布产物契约 | **重叠** | 视频、`output/{slug}/publish/tiktok/tiktok-caption.txt`、`tiktok-metadata.json`、官方声音、AIGC 标签；FARM 侧对应 `PostManifest { files, musicUrl, caption, account, destination }` [S2/S8] |
| at-most-once 语义 | **重叠** | FARM「caption 之后绝不重试、Post 后保持 60s」[S2/S4] 与本仓草稿终态不重试 [S8] 同构，可复用判据，不可复用实现 |
| 驱动与输入 | 不重叠 | WDA/XCUITest 坐标 + 截图/OCR vs CDP DOM 选择器 + `humanClickElement()` |
| 状态与节流 | 不重叠 | FARM 是 Postgres + pg-boss 每设备队列；本仓是单次 CLI + `publish-log.jsonl` + profile 节流 |
| 裁决边界 | **冲突** | #1181（2026-11-13）判 CDP 只存草稿、公开点击归人；FARM 的 `destination: 'publish'` 会真的点 Post [S2/S8/S11] |

⇒ 两者应做成**并行独立通道**，共享的最小接缝是「发布产物适配层 + 幂等契约」，不是把真机接进现有 CDP 代码。票面写的「对接现有 `upload-prep` 任务队列」不成立：本仓没有任务队列，只有单次 CLI 与日志文件 [S8]；真要对接得**新建**适配层与队列，属于 §3 的工作量。

---

## 2. 硬件与 iOS 权衡

### 2.1 票面「iOS 16+ 直接复用补丁」的前提，在本机环境下不成立

| 约束 | 事实 | 来源 |
| --- | --- | --- |
| 补丁绑定版本 | `Patches/appium-webdriveragent-8.9.1-absolute-touch.patch` 与 `...-sessionless-buttons.patch`；`prepare.ts` 用 `/usr/bin/patch -p0` 打到 `.appium2/.../appium-webdriveragent`，并检查 `FBImportMedia` / `NSPhotoLibraryAddUsageDescription` / `withoutSession` 三个标记 [S2] | FARM 源码 |
| WDA 8.9.1 的宿主范围 | driver 7.24.15–7.26.3 全支持 **Xcode 14.0–16.x**（最早可能可用 Xcode 13）；支持 Xcode 26 需 driver ≥10.7（Xcode 16–26.x）或 ≥12.12.5（Xcode ≥26）；按同表 driver→Appium server 映射，10.0–12.22.8 属 Appium 3 带，只有 driver ≥13 才配 Appium 4 [S5] | Appium 官方 |
| 本机实测 | macOS **26.5.1**、Apple M2 Pro / 32 GB、Node v22.22.2；`xcode-select -p` = `/Library/Developer/CommandLineTools`，`/Applications` 无完整 Xcode，`xcodebuild -version` 直接报「requires Xcode」 [S9, 2026-11-15] | 本机只读检查 |
| 设备侧 | iPhone 8 class 上限 iOS 16.7；官方 Device-OS→Xcode 表给 iOS 15–16 的最后支持 Xcode 是 26.6（即设备本身可配新 Xcode） [S4/S5] | 官方 + writeup |

**推导**：本机装完整 Xcode 只能装 26.x，而 FARM 默认的 driver 7.26.3 / WDA 8.9.1 官方只支持到 Xcode 16.x；反向把宿主钉在 Xcode 16，又与 macOS 26 不匹配（官方注：某 Xcode 大版本要求 macOS X 时，一般到 X+2 就不再运行 [S5]）。因此两条路都必须二选一：

- **A｜旧工具链**：另找一台能跑 Xcode 16 的 Mac + Appium 2 + driver 7.26.3，直接复用两个补丁；代价是专用旧宿主机、且 iOS<18 的 usbmux 通道有到期风险。
- **B｜新工具链**：本机（或新 Mac）+ Xcode 26 + Appium 3 + driver ≥10.7，把两个补丁移植到 WDA 10.x+ 并重测 `/wda/import-media`（350 MB 上限）与 sessionless `/wda/pressButton`；代价是补丁移植与真机回归（§3 额外人天）。

iOS 15 旧机并不更省：driver 5.2.0 / WDA 5.8.5 / Xcode 13–15 [S5]，补丁移植跨度更大，且同样落在 <18 的 usbmux 兜底上。

### 2.2 最低可行硬件清单与预算区间（单台单账号，2026-11-15 检索）

| 项 | 区间 | 口径与冲突 |
| --- | --- | --- |
| iPhone 8 / SE2（64GB 二手） | **¥300–900** | 闲鱼个人 ¥300–450、转转/验机 ¥450–700（新浪转引 2026-08 转转+闲鱼数据 [S10]）；优安云 2026 报 ¥300–600；拔草哦 2026-10 报电池良好 ¥700–900。三源口径不一致，**并列不取中值**；SE2 ¥650–900 [S10] |
| 带独立供电 USB hub | **¥150–330** | 易点新媒 2026 群控成本 ¥150–300；Sabrent 10 口 60W ≈¥328（2026-04）；RSHTECH 60W $41.99（2026-11-11）[S10]。writeup 明确「无供电 hub 会 brown out，表现成随机 WDA 崩溃」[S4] |
| MFi 数据线 | ¥15–30 | 易点新媒 2026 [S10] |
| 常开 Mac | 复用本机 ¥0 / 独立机另计 | 本机规格够（M2 Pro 32GB）但**不建议复用**：需全量 Xcode、图形会话解锁 login keychain、禁睡眠/关显示睡眠/关磁盘睡眠、4 个 launchd 常驻进程（Appium / wda-service / worker / web）+ PostgreSQL + 提高 open-file 上限 [S2/S4]，并与本仓日常 Chrome CDP 自动化争用同一台机器 |
| 签名 | ¥0（免费 Apple 账号）或 **99 USD/年** | 官方中文页列 99 USD/年、Enterprise 299 USD/年 [S10, 2026-11-15]；FARM 文档：免费个人 team 单设备可用但设备列表每周过期，多设备需付费 team [S2]；writeup 记免费 Apple ID 100 UDID 上限 [S4] |

**合计（不含 Mac、不含人力）≈ ¥470–1,260**，取保守采购口径 **¥700–1,300**。价格是检索时点估算，采购前须按实机成色/电池健康复核；本报告未询价、未下单。

---

## 3. 工作量估计

### 3.1 先纠正票面三处口径（影响人天估算）

1. **「`wda:prepare` 八项检查」错配**：`Git-Agni/prod-FARM-IOS-Core/src/devices/wda/prepare.ts` 实际只做 6 个路径存在性检查（`access`）+ 2 个补丁幂等检查 + 每设备一次 `xcodebuild build-for-testing` [S2]。writeup 说的「八项检查」指注册向导 [S4]，而当前 `Git-Agni/prod-FARM-IOS-Core/src/devices/registration.ts` 的 `checkNames` 已是 **10 项**：`host / connection / signing / developer / wda / appium / video / touch / tiktok / accounts` [S2]。验收时应以源码为准。
2. **「现有 `upload-prep` 任务队列」不存在**：见 §1.3 [S8]。
3. **坐标档案不是「一份」**：`Git-Agni/prod-FARM-IOS-Core/docs/coordinates.md` 明确新增/修改版式要同步 `Git-Agni/prod-FARM-IOS-Core/src/devices/coordinates.ts` 与 `Git-Agni/prod-FARM-IOS-Core/src/tiktok/coordinates.ts` 两处；目前只内置 `iphone8` 375×667 points（兼容 SE2/3、iPhone 7），15 个可单点校准目标，picker 网格 / swipe 向量 / 锁屏键盘仍留在 profile 级 [S2]。

### 3.2 改造点清单与人天区间（估算，无实测基线）

| # | 改造点 | 依据 | 人天 |
| --- | --- | --- | --- |
| 1 | 宿主准备：全量 Xcode + `xcode-select` + Apple team 签名 + 设备信任/Developer Mode + DDI + 图形会话 keychain | [S2][S9] | 2–4 |
| 2 | FARM 起机：`npm install` → `appium:install-driver` 冲突消解（合并 #6 或升 Appium 3 + driver ≥10.7）+ Postgres/迁移 + 4 进程 launchd | [S1–S3][S6] | 1–3 |
| 3 | 坐标档案：实机校准 15 个 tap target、两份 coordinates 同步、像素 checkbox 判据与 swipe 向量回归 | [S2][S4] | 2–4 |
| 4 | OCR 账号识别：接本仓账号清单、验证 Tesseract TSV（`MIN_CONFIDENCE=40`）与 fuzzy 匹配的误命中日志 | [S2] | 1–2 |
| 5 | 产物适配 + at-most-once：`output/{slug}/publish/tiktok/*` → `PostManifest`，含 `musicUrl` 深链挂声音、AIGC 标签、发布回执与 `publish-log.jsonl` 对齐；新建队列/适配层（不是改现有队列） | [S2][S8] | 3–5 |
| 6 | 真机验收（注册 10 项、草稿、同任务重复投递必须被拦）+ 失败回滚与操作手册 | [S2][S8][S11] | 2–3 |
| | **合计（单台单账号最小可行）** | | **11–21 人天** |

若选 §2.1 的 B 路线，另加 **3–5 人天**用于两个 WDA 补丁移植到 10.x+ 与真机回归；硬件采购、账号准备、账号养号观察不计入。这是按代码面拆分的**估算区间**，不是承诺——本票没有跑过任何一步，实测后可能上修。

---

## 4. 风险登记

| # | 风险 | 事实与来源 | 可工程消除？ |
| --- | --- | --- | --- |
| R1 | **违反 TikTok ToS** | writeup FAQ 原文：*"Is this against TikTok's terms? Automating the app is."* [S4, 更新 2026-11-02] | **否**，只能由用户明确接受 |
| R2 | 账号历史脆弱期 | #1183 Stage 1 于 2026-11-15 判 PASS（3 条手发 288 / 443 / 189，2 条 ≥200），但样本仅 3 条、48h 归档读数排在 11-16，且账号此前有 CDP 0 播放历史 [S11] | 否，靠观察窗口 |
| R3 | 检测面陈述未复现 | 「真机只有行为 + 账号历史两个检测面」来自第三方单方实测（9 台 iPhone 8 + Mac mini，21 天 189 帖 3.78M 播放）；本仓零复现，且 TikTok 版本、地区、账号、宿主均不同 [S4] | 否，需自有小样本 |
| R4 | 上游停滞 + 安装破损 | 69 天无代码更新、#6 挂 62 天未合并、#5 关票但未修、328 forks 无活跃维护者 [S1/S3] | 可（自行 fork 维护），但等于接手一个仓库 |
| R5 | 宿主工具链不兼容 | macOS 26.5.1 + 无全量 Xcode vs driver 7.26.3 仅支持 Xcode ≤16 [S5/S9] | 可，代价见 §2.1 A/B |
| R6 | iOS<18 通道到期 | 官方注 legacy lockdown / usbmux fallback 预期被 Apple 移除 [S5] | 否，需 iOS 18+ 设备 |
| R7 | 签名过期 | 免费 team 设备列表每周过期；多设备需付费 [S2/S4] | 可（99 USD/年） |
| R8 | **与 #1181 裁决冲突** | 现行自动路径止于 web Studio 草稿、公开点击归人；FARM `destination: 'publish'` 是公开点击，且 web 草稿与 App 草稿不互通 [S2/S8/S11] | 否，需用户重裁 |
| R9 | **AI 声明缺口** | 本仓 `upload-prep-policy.mjs` 把 AI 声明作为加载期硬门、且注释记录「TikTok 发布后无法补标签」[S8]；FARM `post.ts` 全文未见 AIGC / disclosure 处理 [S2] | 可，但须在真机流程补一步，且发布后无补救 |
| R10 | 官方声音丢失 | 本仓草稿明确不保留挂声音、需人工在发布会话重挂 [S8]；FARM 靠 `musicUrl` 深链 + 「Use this sound」[S2] | 可，产物映射需重做 |

---

## 5. 建议（三选一）

> **选择：需要先解决 X**（不采用、也不是采用）。本票按 out of scope 不做「是否采用」裁决；下列三项是**重估前置**，全部满足后再由用户裁决采用/不采用、是否单独立项施工。

**X1 · 工具链可安装性（技术前置）**
在隔离环境（不得是日常开发机）按上游 README 走完安装链（install → driver install → migrate → WDA prepare），以 `xcodebuild` 输出 TEST BUILD SUCCEEDED 为唯一通过判据；同时按 §2.1 明确选 A（旧 Mac + Xcode 16 + Appium 2）还是 B（Xcode 26 + Appium 3 + 补丁移植），并把选定组合的 macOS / Xcode / Appium / driver / WDA 五个版本号写进决策记录。**当前静态推导的结论是「按 README 原样必失败」，这一点必须先被实测证实或推翻。**

**X2 · 裁决与合规（治理前置）**
用户明确：① 是否接受 R1 的 ToS 风险；② 是否重裁 #1181 的「自动路径止于草稿、公开点击归人」边界（R8）；③ AI 声明与官方声音在真机路径的处理方式（R9/R10）。三者都不能由 Agent 代拍板。

**X3 · 账号与硬件隔离（运行前置）**
独立常开 Mac + 独立 iPhone + 独立供电 hub，不与日常 Chrome CDP 共用宿主；账号范围由用户指定；等待 11-16 的 Stage 1 48h 归档读数，并保留至少两周的稳定分发观察（R2/R3）。

**为什么不是「采用」**：现有正面证据只证明「第三方 2026-09 的环境里存在一条拿到正常分发的真机自动化路径」[S4]，不证明「本仓 2026-11 的环境能装起来、能合规跑、能复现分发」；且上游仓库当前安装契约破损、无任何活跃维护者 [S1–S3]。
**为什么不是「不采用」**：Appium 官方工具链本身活跃且合规 [S5/S7]，FARM 有真实代码与可核对的 at-most-once / 坐标 / OCR 实现 [S2]，Stage 1 也已证明账号与内容能拿到分发 [S11]——直接否决会丢掉一条现存的可评估路径。把三项前置写成可核对的触发条件，比现在下结论更省工作量。

---

## 6. 来源清单

| 编号 | 来源 | 日期 |
| --- | --- | --- |
| S1 | GitHub REST `repos/Git-Agni/prod-FARM-IOS-Core`（license / pushed_at / stars / forks / archived） | 读取 2026-11-15 |
| S2 | 该仓 HEAD `3e936bab` 源码：`package.json`、`Git-Agni/prod-FARM-IOS-Core/src/devices/wda/prepare.ts`、`Git-Agni/prod-FARM-IOS-Core/src/devices/registration.ts`、`Git-Agni/prod-FARM-IOS-Core/src/tiktok/{post,ocr,post-manifest}.ts`、`Git-Agni/prod-FARM-IOS-Core/docs/{getting-started,coordinates}.md` | 代码 pushed 2026-09-07，读取 2026-11-15 |
| S3 | 该仓 issues/PR #5/#6/#7/#8、commits、releases、forks 列表 | 读取 2026-11-15 |
| S4 | `gethandler.ai/tiktok-iphone-farm` 工程 writeup（An Nayal） | Published 2026-09-07 / Updated 2026-11-02，抓取 2026-11-15 |
| S5 | Appium 官方 master 的 `appium/appium-xcuitest-driver/docs/getting-started/system-requirements.md`（raw）与 GitHub Pages 版 | 抓取 2026-11-15 |
| S6 | npm registry：`appium@latest`、`appium-xcuitest-driver@latest` 与 `@7.26.3` 的 version / peerDependencies / `appium-webdriveragent` | 查询 2026-11-15 |
| S7 | GitHub REST `repos/appium/appium`、`repos/appium/appium-xcuitest-driver` | 读取 2026-11-15 |
| S8 | 本仓基线 `b111f7ff`：`scripts/short-video/tiktok-upload-prep.mjs`、`lib/{human-input,publish-throttle}.mjs`、`lib/platforms/upload-prep-policy.mjs`、`docs/content-pipeline.md:704-710` | 基线 2026-11-14，读取 2026-11-15 |
| S9 | 本机只读命令 `sw_vers` / `sysctl` / `xcode-select -p` / `xcodebuild -version` / `node -v` | 执行 2026-11-15 |
| S10 | 价格与签名：新浪转引转转+闲鱼 2026-08 数据、优安云 2026、拔草哦 2026-10、TechPassive 2026-04、SpecPicks 2026-11-11、易点新媒 2026 群控成本表；Apple Developer Program 官方中文页 | 检索 2026-11-15 |
| S11 | GitHub issue #1181（2026-11-13 裁决）、#1183（2026-11-15 Stage 1 观察与阶段二启动评论）、#1186 归属注记 | 读取 2026-11-15 |

**事实双源口径**：工具准入用 GitHub API + 仓库源码 + npm registry 三源交叉；版本矩阵用官方文档 + registry；价格用 ≥2 个独立检索来源且口径冲突并列（未做二选一）；本仓接缝用源码 + 既有文档；本机环境用本地命令实测。**未做的验证**：无 clone、无安装、无真机 smoke test、无询价——这些正是 §5 X1 要求下一步补的实测面。
