# Handoff: Agent 文档 token 审计实施（2026-09-02）

> 接手方（用户或下一 session）：本文档是 token 审计提案的实施总结 + 遗留 + 下一步选项。
> 提案见 `docs/research/agent-doc-token-audit-2026-09-02.md`；实施 diff 见 `git diff 3fbe561...79a33ef`（5 commits）。

## 状态

实施完成，5 个 atomic commit 在本地 `main`，未 push。每批 `npm run lint:docs` PASS + `git diff --check` 干净 + gitleaks clean。pre-commit hook 的 writing-for-agents WARN 是门禁正常输出（本 session 已载入该 skill）。

## 实施汇总

| 批次 | Commit | 文档 | 节省 | 内容 |
|---|---|---|---|---|
| 1 | `37ea55c` | video-workflow.md | 3,234B | V1 Cloud GPU 章下沉到 cloud-gpu-options.md；V2 File Locations 树削减纯描述行；V5 正文尾部引用去重（保留尾部表） |
| 2 | `bf06ed9` | DESIGN.md | 521B | D1 删变更历史从句（保留原因）；D3 §6 Do/Don't 改为指向命名规则的一行引用 |
| 3 | `e2ff1bf` | content-pipeline.md | 772B | P1 修入口 3 重号；P2 加机器强制指针句（保守）；P3 rag query 去重；P4 AI Outline 细则去重；P5 删重复的 Agent 行为准则；P6 修 ASCII 图 `\n` |
| 4 | `b113b97` | CONTEXT.md | 299B | C1 删 Capabilities 实现史；C2 压缩 Playwright retired 词条；C3 删 Protected Region roadmap；C4 Max Effort/Reference Voice 留定义指向 video-workflow |
| 5 | `79a33ef` | AGENTS.md + tanstack-lovable-conventions.md | 279B | A1 删 Implementation 指针的 identity 尾句；T1 项目身份行去重 |
| | | **合计** | **5,105B** | |

cloud-gpu-options.md +2,234B（V1 迁入，内容未丢）。被审计文档净省 5,105B（约 3.1%；报告预估 7.6%）。

## 偏离报告预估

| 项 | 报告预估 | 实际 | 原因 |
|---|---|---|---|
| P2 | ~1,800B | ~100B | 保守：删 MRL-2 表会连带影响 MRL 概览表与报告格式块，非孤立删减；只加指针句 |
| D1/D3 | ~1,900B | 521B | 保留原因语义（删数值对比但留原因句），行为风险更低 |
| A2/S1 | ~550B | 0 | A2 两处语义不同（索引 vs 行为规则）；S1 无法可靠区分 Experimental |

## 遗留问题

### 待用户裁决（2 项）
1. **Push**：5 commits 在本地 main（ahead），handoff 约束"不 push"。需授权才 push。
2. **Skill 卸载**（报告 §4）：候选清单已列（HarmonyOS、SDD、bug-fix、文档生成、Matt 实验组）。需选择卸载哪些组，再执行 `docs/installed-skills.md` Update Protocol。

### 可选补做（3 项，报告认可但本轮未做）
3. **D2**（DESIGN Key Characteristics，~800B）：报告 §5 标"涉及 Lovable 消费，先核对"。需确认 Lovable 是否依赖 Overview 摘要生成 UI。
4. **V3/V4/V6**（video-workflow，~650B）：报告 §5 第 1 条只列 V1/V2/V5。V3 TTS 参数去重、V4 Prosody 表压缩、V6 retired 装饰提及清理。
5. **P2 深做**（~1,700B 额外）：删 MRL-2 表 + 同步改 MRL 概览表和报告格式块。风险中。

### 已审视决定不做（2 项）
6. **A2**：Engineering References（索引）与 Content and Video（preflight 行为规则）语义不同，合并损失行为语义。
7. **S1**：installed-skills.md 未标 Experimental，无法可靠区分；改表结构风险高于收益。

**遗留合计：2 项待裁决 + 3 项可选补做 + 2 项已决定不做 = 7 项**（其中需你决策的是前 2 项，3-5 项你可选是否补做）。

## 下一步选项

- **A. 接受现状**：5 commits 留本地，skill 卸载另议。
- **B. Push**：授权 push 5 commits 到 origin/main（或开 PR）。
- **C. 补做**：指定 3/4/5 中的项，继续实施。
- **D. Skill 卸载**：指定要卸的组，执行 Update Protocol。
- **E. Review diff**：`git diff 3fbe561...79a33ef` 或逐 commit `git show <sha>`。

## Review 入口

- 提案：`docs/research/agent-doc-token-audit-2026-09-02.md`
- 实施 diff：`git diff 3fbe561...79a33ef`（baseline `3fbe561` → taskHead `79a33ef`）
- 逐 commit：`37ea55c` `bf06ed9` `e2ff1bf` `b113b97` `79a33ef`