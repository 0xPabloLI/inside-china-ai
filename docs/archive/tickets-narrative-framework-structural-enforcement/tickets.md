# Tickets: 叙事框架结构化落实

> Source: `docs/spec-narrative-framework-structural-enforcement.md`

## Dependency graph

```
T-01 (scene-rules 新增检查函数) ──┐
                                  ├── T-02 (video-script-writing-guide.md 改回 S.T.A.R.T. 主框架)
T-01 ──────────────────────────────┘      │
                                            ├── T-03 (content-pipeline.md + DOCS-INDEX.md 调整)
                                            │
                                            └── T-04 (ADR-0018 + 归档)
```

T-01 无前置，可立即开始。T-02/T-03/T-04 都依赖 T-01（因为文档需要引用新的检查函数名）。T-02 和 T-03 可并行。T-04 最后做。

---

## T-01 — scene-rules.mjs 新增 W7/W8/W9 叙事留存检查

**What to build:** Agent 在 preflight (`verify-video.mjs --pre`) 运行时，如果 scene-data 含有 `retentionMechanism` 字段，自动检查 open loop (W7)、pattern interrupt (W8)、loop closure (W9) 是否存在；如果不含该字段，跳过检查（兼容旧 scene-data）。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] 新增 `checkOpenLoop(scenes)` 函数：如果所有 scene 都没有 `retentionMechanism` 字段 → 返回 skip（空 result）；如果有字段但无 `"open-loop"` → 返回 Warning W7；如果 S2 有 `narrativeRole: "T"` 但 `retentionMechanism` 不是 `"open-loop"` → 返回 Warning W7；有 `"open-loop"` → 返回 pass
- [x] 新增 `checkPatternInterrupt(scenes)` 函数：如果无 `retentionMechanism` 字段 → skip；有字段但无 `"pattern-interrupt"` → Warning W8；有 → pass
- [x] 新增 `checkLoopClosureNarrative(scenes)` 函数：如果无 `retentionMechanism` 字段 → skip；倒数第二个内容 scene（排除 CTA scene）的 `retentionMechanism` 不是 `"loop-closure"` → Warning W9；是 → pass
- [x] 三个函数在 `runAllSceneDataChecks` 中调用
- [x] 返回格式与现有检查函数一致（`{ level, category, check, detail, fix }`）（`{ code, message, severity }`）
- [x] 测试：`scene-rules.test.mjs` 新增 13 个测试用例（覆盖 scenario matrix 行 1-6, 10）（覆盖 scenario matrix 行 1-6, 10）
- [x] 回归测试：现有 scene-data 文件在 `runAllSceneDataChecks` 下不产生新 Warning（skip 逻辑生效）

---

## T-02 — video-script-writing-guide.md 改回 S.T.A.R.T. 主框架 + AI Outline 消费映射表

**What to build:** Agent 在 Stage 3 写 scene-data 时，参照的脚本写作指南以 S.T.A.R.T. 5 段为主框架（而非 AI Outline 6 段），AI Outline 降级为 HITL 工具输入，并有明确的 5 段消费映射表指导 Agent 如何消费用户抄回的 AI Outline 输出。

**Blocked by:** T-01（文档需要引用新的 W7/W8/W9 检查函数名）

**Status:** ready-for-agent

- [x] Step 3 标题改为"用 S.T.A.R.T. 框架搭建骨架"
- [x] 主框架说明改为"S.T.A.R.T. 5 段为主框架，AI Outline 为 HITL 工具输入"
- [x] S.T.A.R.T. vs AI Outline 对应关系表保留但标注"AI Outline 是工具输入不是结构参照"
- [x] Scene 模板中每个 scene 增加 `narrativeRole` 和 `retentionMechanism` 字段说明
- [x] 新增"AI Outline 消费映射表" section（5 段映射 + 消费规则）
- [x] 删除"融合公式"措辞，改为"S.T.A.R.T. 框架 + 留存引擎"
- [x] Step 7 MRL-2 自审中提及 W7/W8/W9
- [x] writing-for-agents 审查：单一权威来源、不重复、正面表述

---

## T-03 — content-pipeline.md + DOCS-INDEX.md 调整

**What to build:** content-pipeline.md Stage 3 的"脚本写作方法论"指针描述和 Step 5 描述与 video-script-writing-guide.md 的 S.T.A.R.T. 主框架定位一致。DOCS-INDEX.md 描述更新。

**Blocked by:** T-01（Step 5 描述需要引用 W7/W8/W9）

**Status:** ready-for-agent

- [x] content-pipeline.md Stage 3 "脚本写作方法论"指针描述更新
- [x] Step 5 描述从"按融合公式设计 scene"改为"按 S.T.A.R.T. 映射表设计 scene"
- [x] AI Outline 话题描述规则 section 中定位说明更新（"HITL 工具输入"）
- [x] DOCS-INDEX.md 中 video-script-writing-guide.md 描述更新
- [x] DOCS-INDEX.md L1 reference table 描述更新
- [x] writing-for-agents 审查：跨章节一致性、指针目标完整性

---

## T-04 — ADR-0018 + spec/tickets 归档

**What to build:** 记录"S.T.A.R.T. 主框架 + AI Outline HITL 工具"的架构决策。spec 和 tickets 归档到 `docs/archive/`。

**Blocked by:** T-02, T-03（文档修改完成后才能归档）

**Status:** ready-for-agent

- [x] 创建 `docs/adr/0018-start-primary-framework.md`（ADR-FORMAT：1-3 句决策 + 可选 sections）
- [x] DOCS-INDEX.md ADR table 新增 0018 条目
- [x] spec 文件移到 `docs/archive/spec-narrative-framework-structural-enforcement.md`
- [x] tickets 文件移到 `docs/archive/tickets-narrative-framework-structural-enforcement/`
- [x] 更新 `docs/archive/README.md` 归档清单
