# Spec — 多平台内容生产架构：平台 Profile 隔离（#219）

Status: active（2026-09-09，第三十 session） · Parent issue: #219 · Planning scale: S2（route 已由 grill 定案） · Risk: R3（核心管线 + 发布路径 + 跨组件契约）

## Problem Statement

内容管线只面向 TikTok 一种发布目标：发布包文件名硬编码（`tiktok-caption.txt` 等）、发布规则散落在发布工具模块（AIGC 标签、duet/stitch、150MB 上限、频道 URL）、verify 阶段用 TikTok 上限校验 caption。新增平台（视频号 #216/#217、抖音 #220）要么复制 TikTok 逻辑要么各自重写；平台差异没有统一的声明位置，TikTok 的"输入端"身份（素材/趋势/analytics 来源）与"发布端"身份混在同一批文件里。

## Solution

内容内核产一条平台中立成片（现状已成立：Scene Data/TTS/字幕/渲染无平台字段）。每个平台一份声明式 **Profile**，集中声明发布包规则（caption/hashtag/AI 声明/封面规格/文件限制/隐私与 commerce 设置）、发布方式与产物类型。发布包生成器按 Profile 把各平台发布包写入 `output/{pipelineId}/publish/{platform}/`，与内核产物分离；发布器 per-platform，各带独立发布 HITL。TikTok 作为第一个 Profile 迁移，行为保持等价。

## User Stories

1. As 内容运营者，I want 一条成片同时生成多个平台的发布包，so that 不手工改写 caption 与 AI 声明。
2. As agent，I want 平台规则集中声明在 Profile，so that 新增平台只加 Profile 不改内核。
3. As HITL 发布者，I want 每平台 manual guide 内含该平台的 AI 声明步骤与文案，so that 不漏法定标识（《标识办法》2025-09-01 起为法定义务）。
4. As 维护者，I want 内核 Scene Data schema 零平台字段，so that 平台差异文案不进内核（schema 冻结令可执行）。
5. As 发布者，I want 发布包落盘在按平台隔离的目录且与内核产物分离，so that 平台包可独立重生成而不触碰成片。
6. As 分析者，I want analytics 采集保持按平台各自进行，so that 不被过早的统一抽象绑死。
7. As 审计者，I want 每条数值规则（字数/大小/hashtag 数）可追溯到平台出处，so that 上游漂移可检测。
8. As 管线，I want caption/发布包校验使用目标平台自己的上限，so that 生成即合规。
9. As 维护者，I want 产物类型字段预留图文形态，so that 小红书图文立项（#223）时无需重构模型。
10. As 维护者，I want TikTok 迁移为行为等价重构，so that 现有发布流零回归。
11. As 发布者，I want 每个平台独立发布 HITL gate，so that 外部发布动作逐平台授权。
12. As 运营者，I want 封面规格进 Profile，so that #216 试点实测出的封面结论可直接落成规格。

## Implementation Decisions

1. **窄隔离**（grill Q1，2026-09-09 用户定案）：平台 Profile = {发布包规则, 发布方式, 产物类型}。视频平台（TikTok/视频号/抖音）共享同一条成片；内容内核与渲染层不分叉。产物类型字段预留 `video | image-thread`，本 spec 只实现 `video`。
2. **Profile 声明式配置**，每平台一份，内容包括：caption 结构与字数上限、hashtag/话题规则、AI 声明文案与入口步骤、封面规格、视频文件大小/时长/编码限制、隐私与 commerce 设置、manual guide 步骤序列、发布方式（`manual-guide` | `cdp` | `api`）。
3. **目录隔离**（Q2）：发布包写 `output/{pipelineId}/publish/{platform}/`；内核产物（成片/音频/字幕）原地不动；成片不复制，发布包引用。TikTok 发布包路径随迁移变更，消费方（发布器与手工流程文档）一并迁移，不留旧路径兼容 shim（内部脚本一次性迁移，避免双路径债）。
4. **发布器 per-platform**（Q3）：每平台独立入口，Profile 声明发布方式；`manual-guide` 为默认安全档；CDP/API 须逐平台授权 + 沙盒验证后才启用；每平台独立发布 HITL gate（发布是外部不可逆动作）。
5. **analytics 不抽象**（Q4）：属"来源回流"，与发布 Profile 正交；各平台独立采集，≥2 个平台有真实回流数据后再统一 schema。
6. **caption 生成时机不变**：仍挂 verify 阶段，按已注册 Profile 生成全部平台发布包；B6 校验按各平台上限执行。
7. **规则来源**：现有 TikTok 数值规则集（caption/title/hashtag 阈值等）迁为 TikTok Profile 的规则内容，平台出处注释保留，文档漂移同步测试机制沿用。
8. **平台启用模型**：发布包生成器按"已存在的 Profile"生成；视频号/抖音 Profile 由其实例票（#217/#220）落地时添加，即添加即启用。

## Modified Files Impact（R3）

- 新增：平台 Profile 模块目录（lib/platforms/）、发布包生成器（由 caption 生成器 Profile 化演化）。
- 修改：caption 生成器（Profile 化 + 输出路径）、发布工具模块（TikTok 专属设置迁入 Profile）、verify-video（B6 per-platform 上限）、TikTok 发布器（读新路径 + 设置读 Profile）、main.mjs（publish 目录接线）。
- 文档：video-workflow.md、content-pipeline.md、manual-ops.md 的平台段落；DOCS-INDEX 登记本 spec。

⚠️ 实施门：main.mjs 当前有并行会话未提交改动（voice/content 会话）。实施开工前置 = 工作区干净（并行改动落地后），或经用户裁决用 worktree 隔离并在合入时处理 main.mjs 冲突。Conflict Matrix：#219 与 #225 同碰 main.mjs，串行。

## Behavioral Scenarios（R3）

| # | 场景 | 期望 |
| --- | --- | --- |
| S1 | 单平台 TikTok 发布包生成 | 产物内容与迁移前等价，落 `publish/tiktok/` |
| S2 | 多 Profile 共存 | 各平台包互不影响，逐平台独立目录 |
| S3 | caption 超平台上限 | B6 fail-closed（行为与现状一致） |
| S4 | 场景数据未声明任何平台语义 | 内核照常出片，Profile 只在发布包层生效 |
| S5 | 发布包重生成 | 幂等，不触碰内核产物 |
| S6 | TikTok commerce 声明约束 | commercial 与 brand 标志约束在 Profile 层保持 |

## Testing Decisions

- 纯函数单测为先（prior art：publish-utils / caption-utils / series-meta 测试——vitest 纯函数 + 内联 fixture）。
- Profile 规则漂移同步测试（prior art：tiktok-rules-sync 测试——规则值与文档出处比对）。
- 行为保持验证：既有 publish/caption 测试全绿 + 真实内容包 dry-run 生成发布包，对比迁移前后产物内容一致。
- R3 失败基线：现行 caption/B6 测试在旧路径与旧上限下通过；迁移 ticket 以"旧断言被等价新断言替换后仍 red→green"为证据。

## Out of Scope

- 视频号/抖音 Profile 实例与发布器实现（#217/#220）。
- 图文产物类型（`image-thread`）实现——模型预留（#223/#208）。
- analytics 统一抽象（Q4 定案：延后）。
- 封面图片的实际生成逻辑（规格进 Profile，生成随实例票）。
- CDP/API 自动发布实现（#218）。

## Further Notes

- Grill 决策记录：Q1 窄隔离 / Q2 发布包目录隔离 / Q3 per-platform 发布器 + 独立 HITL / Q4 analytics 暂不抽象——2026-09-09 用户全部批准。
- 本 spec 为本地 active spec（项目覆写：GitHub 发布需另行授权）。tickets 本地发布于 `.scratch/platform-profile/issues/`。
