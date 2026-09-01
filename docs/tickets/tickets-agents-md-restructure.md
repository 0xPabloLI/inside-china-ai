# Tickets: AGENTS.md 结构重构

> 来源 spec：`docs/specs/spec-agents-md-restructure.md`。tracer-bullet 顺序，同文件（AGENTS.md）ticket 串行避免 diff 冲突。
> 测试方式（Grill Q3 裁定）：每 ticket 先写走查清单 → 对改动前文本确认 red → 改后 green；T3-T6 附加文档审查三查。
> 规则：每个 ticket 完成后立即把已完成项打 `[x]` 落盘（/compact 安全的唯一状态来源）。

## T0a — tools-catalog Tavily 表述改回指

**What to build:** Tavily fallback 硬规则唯一活在 AGENTS.md；tools-catalog 不再出现任何可绕过它的规范性表述，只留费用/配置/credits 操作细节并回指。

**Blocked by:** None — can start immediately.

- [x] red 走查：grep 全文 Tavily，确认 3 处规范性表述（L100 Context7「何时不用」、L101 Context7「容错」、L112 主条目「容错」）与 AGENTS.md 硬规则冲突
- [x] L112 主条目「容错」改为回指 AGENTS.md fallback 链
- [x] L100「何时不用」去掉「用 Tavily」的规范性指向
- [x] L101「容错」去掉「→ Tavily 搜库名」的规范性指向
- [x] green 走查：grep 全文无规范性 fallback 表述残留；AGENTS.md（未改前）硬规则仍是唯一权威
- [x] commit（显式列路径）

## T0b — video-workflow 过期路径修正

**What to build:** TTS 相关路径与 media-asset-management.md 权威一致。

**Blocked by:** None — can start immediately.

- [x] red 走查：L105 `assets/voice-sample-ref-text.txt`、L350-351 `assets/voice-sample-24k.wav` 与 voice-samples 规则冲突
- [x] 按 `docs/media-asset-management.md` 修正全部过期路径（含 voice-samples gitignored 标注一致性）
- [x] green 走查：grep `assets/voice` 无残留
- [x] commit（显式列路径）

## T1 — AGENTS.md 路由三档 + 流程同步

**What to build:** Step 1 三档判定 + 升级协议；L41 与 Step 9 限定为 Substantial session；High-Risk Areas 增「Agent 治理文件」条目。

**Blocked by:** None（AGENTS.md 首个 ticket，后续 AGENTS.md tickets 串行在其后）。

- [ ] red 走查：场景 1-8、11、12、14（对现行文本）——现行「Lightweight（常规工作）」不可检查、L41「每次」与三档冲突
- [ ] Step 1 重写（按 spec §Implementation Decisions 路由节全文）
- [ ] L41 限定 Substantial；Step 9 限定 + Trivial/Small 结束验证行
- [ ] High-Risk Areas 增治理文件条目；Small 判定引用不枚举
- [ ] green 走查：场景 1-8、11、12、14 全过；`grep -n "每次改代码"` 无冲突残留
- [ ] commit（显式列路径；触发 pre-commit doc-hierarchy lint 属预期）

## T2 — 单一 PSR 章节 + fact-verification.md

**What to build:** `## PSR` 单章节（触发范围 + Preflight + 发布 Gate + 五条）原位替换 Proposal Self-Review；workflow 内两处短指针；新建 fact-verification.md 接收第 4 条操作程序。

**Blocked by:** T1。

- [x] red 走查：场景 9、10、15（对现行文本）——「给出修改方案前」触发不到研究/建议场景
- [x] `## PSR` 章节按 spec 草案改写（co-location，单章节）
- [x] Grill 入口 + Spec 前两处短指针
- [x] 新建 `docs/conventions/fact-verification.md`（第 4 条操作程序全量：源码链/CLI 链/定价查询/维护状态 4 步）
- [x] 三查：PSR 措辞两处指针与章节一致；fact-verification.md 信息点逐字段来自原第 4 条；`ls` 验证
- [x] green 走查：场景 9、10、15 全过
- [x] commit（显式列路径）

## T3 — media/audio 外移 + assets 消歧

**What to build:** Media Asset Placement + Audio File Handling 压成 2 行消歧指针。

**Blocked by:** T0b, T2。

- [ ] red 走查：场景 18（对现行文本确认信息点清单）+ 三查基线
- [ ] 压成 2 行指针（触发词 front-load；两个 `assets/` 显式消歧；`LibsndfileError` 触发词保留）
- [ ] 三查：指针目标完整性——原 13+3 行每个信息点在 media-asset-management.md / video-workflow.md 可找到（缺则先补目标文档）
- [ ] green 走查：场景 18 过；信息点逐字段覆盖确认
- [ ] commit（显式列路径）

## T4 — Content Pipeline 指针化（不复制概述）

**What to build:** AGENTS.md 压成 ~7 行：概述指针、skill 触发规则 3 行 in-file、HITL 强制规则 + preflight 硬规则 in-file。

**Blocked by:** T3。

- [ ] red 走查：场景 16 + 信息点清单（HITL 强制规则、preflight、--draft 用法、RAG reindex 触发点、skill 矩阵、remotion-markup vs impeccable）
- [ ] 核对 content-pipeline.md 对概述类信息点的覆盖（L6 管线概览、L61 HITL 已确认存在）；缺口先补目标文档再改指针
- [ ] skill 矩阵表 + 分工注外移 video-workflow.md；触发规则 3 行留 in-file
- [ ] 三查
- [ ] green 走查：场景 16 过；HITL/preflight 仍 in-file 可见
- [ ] commit（显式列路径）

## T5 — Web Scraping 外移（Tavily 硬规则留 in-file）

**What to build:** 压成 ~4 行：Tavily fallback 硬规则一行 + 工具表指针 + 工具发现指针。

**Blocked by:** T0a, T4。

- [ ] red 走查：场景 17 + 三查基线
- [ ] 工具表外移 tools-catalog（T0a 已完成，目标无规范性冲突）
- [ ] Tavily 硬规则留 in-file（唯一权威）
- [ ] 三查
- [ ] green 走查：场景 17 过
- [ ] commit（显式列路径）

## T6 — Core Commands 删除 + Snapshot/Cadence 压缩

**What to build:** 删 Core Commands；Snapshot 压 4 行（App 一句话 + Auth model + conventions 指针）；Commit Cadence 删 TL;DR 段。

**Blocked by:** T5。

- [ ] red 走查：`wc -w` 基线记录；三查基线
- [ ] 三项修改按 spec 执行
- [ ] 三查：Core Commands 信息点确认 package.json 全覆盖；TL;DR 与六条规则无信息点丢失
- [ ] green：words 度量记录（目标 ≤1,330）
- [ ] commit（显式列路径）

## T7a — DOCS-INDEX 同步 + rollout tracker

**What to build:** DOCS-INDEX 登记 pointer 关系变化；GitHub Issue 作为 rollout tracker（观察期数据 + 回滚阈值）。

**Blocked by:** T6。

- [ ] DOCS-INDEX.md 更新（受影响文档的 pointer 关系）
- [ ] `gh issue create`：rollout tracker（PSR 发布 Gate 出现率、路由命中率；回滚阈值 = Gate 未执行 ≥2 次或路由误判 ≥3 次）
- [ ] PR 创建（worktree 分支 → main），PR body 仅总结相对 origin/main 的 commits，英文
- [ ] `npm run lint && npm run lint:docs` 通过
- [ ] commit + push（普通 push，不改写历史）

## T7b — 观察期 + 归档（PR merge 后）

**What to build:** 2-3 个真实 session 观察 → 达标归档 / 触阈值回滚。

**Blocked by:** T7a。

- [ ] session 1 观察记录（tracker issue 打勾）
- [ ] session 2 观察记录
- [ ] session 3 观察记录（如前两次均达标可提前判定）
- [ ] 达标：proposal + spec + tickets 移 `docs/archive/`（reviews 移 `docs/archive/reviews/`），README 清单更新，关闭 issue
- [ ] 触阈值：回滚 AGENTS.md 至实施前 commit，重审
