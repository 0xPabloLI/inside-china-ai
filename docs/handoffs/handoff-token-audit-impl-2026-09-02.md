# Handoff: Agent 文档 token 审计实施（2026-09-02）

> 接手方（用户或下一 session）：本文档是 token 审计提案的实施总结 + 遗留 + 下一步选项。
> 提案见 `docs/research/agent-doc-token-audit-2026-09-02.md`；实施 diff 见 `git diff 3fbe561...HEAD`（6 commits）。

## 状态

实施完成，6 个 atomic commit 已 push 到 `origin/main`。每批 `npm run lint:docs` PASS + `git diff --check` 干净 + gitleaks clean。

## 实施汇总

| 批次 | Commit | 文档 | 节省 | 内容 |
|---|---|---|---|---|
| 1 | `37ea55c` | video-workflow.md | 3,234B | V1 Cloud GPU 章下沉到 cloud-gpu-options.md；V2 File Locations 树削减纯描述行；V5 正文尾部引用去重（保留尾部表） |
| 2 | `bf06ed9` | DESIGN.md | 521B | D1 删变更历史从句（保留原因）；D3 §6 Do/Don't 改为指向命名规则的一行引用 |
| 3 | `e2ff1bf` | content-pipeline.md | 772B | P1 修入口 3 重号；P2 加机器强制指针句（保守）；P3 rag query 去重；P4 AI Outline 细则去重；P5 删重复的 Agent 行为准则；P6 修 ASCII 图 `\n` |
| 4 | `b113b97` | CONTEXT.md | 299B | C1 删 Capabilities 实现史；C2 压缩 Playwright retired 词条；C3 删 Protected Region roadmap；C4 Max Effort/Reference Voice 留定义指向 video-workflow |
| 5 | `79a33ef` | AGENTS.md + tanstack-lovable-conventions.md | 279B | A1 删 Implementation 指针的 identity 尾句；T1 项目身份行去重 |
| 6 | （补做） | DESIGN + video-workflow + content-pipeline | 4,151B | D2 Key Characteristics 压缩为索引行；V3 TTS 参数去重（method='rk4' 并入表）；V4 Prosody F5/Qwen 重复说明删；V6 retired 装饰提及删；P2 深做删 MRL-2 表 + 同步改概览表 |
| | | **合计** | **9,256B** | |

cloud-gpu-options.md +2,234B（V1 迁入，内容未丢）。被审计文档净省 9,256B（约 5.6%；报告预估 7.6%）。

## 偏离报告预估

| 项 | 报告预估 | 实际 | 原因 |
|---|---|---|---|
| P2 | ~1,800B | 3,621B | 深做完成：删 MRL-2 表 + 同步改概览表（12→13, 6→9）+ 指针句指向 scene-rules.mjs |
| D1/D3 | ~1,900B | 521B | 保留原因语义（删数值对比但留原因句），行为风险更低 |
| A2/S1 | ~550B | 0 | A2 两处语义不同（索引 vs 行为规则）；S1 无法可靠区分 Experimental |

## 遗留问题

### 待用户裁决（1 项）
1. **Skill 卸载**（报告 §4）：候选清单已列（HarmonyOS、SDD、bug-fix、文档生成、Matt 实验组）。需选择卸载哪些组，再执行 `docs/installed-skills.md` Update Protocol。

### 已完成
2. **Push**：6 commits 已 push 到 origin/main。
3. **D2**（DESIGN Key Characteristics，191B）：压缩为索引行，§2–§4 已展开。
4. **V3/V4/V6**（video-workflow，339B）：V3 TTS 参数去重；V4 Prosody F5/Qwen 重复说明删；V6 retired 装饰提及删。
5. **P2 深做**（content-pipeline，3,621B）：删 MRL-2 表 + 同步改概览表 + 指针句。

### 已审视决定不做（2 项）
6. **A2**：Engineering References（索引）与 Content and Video（preflight 行为规则）语义不同，合并损失行为语义。
7. **S1**：installed-skills.md 未标 Experimental，无法可靠区分；改表结构风险高于收益。

**遗留合计：1 项待裁决 + 2 项已决定不做 = 3 项**（唯一需你决策的是 Skill 卸载）。

## 下一步选项

- **A. Skill 卸载**：指定要卸的组，执行 Update Protocol。
- **B. Review diff**：`git diff 3fbe561...HEAD` 或逐 commit `git show <sha>`。

## Review 入口

- 提案：`docs/research/agent-doc-token-audit-2026-09-02.md`
- 实施 diff：`git diff 3fbe561...HEAD`（baseline `3fbe561` → HEAD）
- 逐 commit：`37ea55c` `bf06ed9` `e2ff1bf` `b113b97` `79a33ef` + 补做 commit