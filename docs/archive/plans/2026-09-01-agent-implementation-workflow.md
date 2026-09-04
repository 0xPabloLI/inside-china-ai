# Agent Implementation Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the monolithic mandatory workflow with an automatic, risk-aware and planning-scale-aware adaptation of Matt Pocock's engineering flow.

**Architecture:** Keep `AGENTS.md` as an L0 router and move execution detail into on-demand L1 documents. The project executes Matt's user-invoked skill files by reference, calls his model-invoked skills through the Skill tool, and explicitly records project overrides for automatic stage transitions and known upstream gaps.

**Tech Stack:** Markdown agent instructions, existing documentation hierarchy lint, Git diff checks.

---

### Task 1: Create the L1 implementation workflow

**Files:**

- Create: `docs/agents/implementation-workflow.md`
- Reference: `docs/archive/plans/2026-09-01-agent-implementation-workflow-design.md`
- Reference: `.agents/skills/ask-matt/SKILL.md`
- Reference: `.agents/skills/to-spec/SKILL.md`
- Reference: `.agents/skills/to-tickets/SKILL.md`
- Reference: `.agents/skills/implement/SKILL.md`

**Step 1: Record the invocation contract**

Define the difference between:

- executing an installed user-invoked Matt skill by reading its `SKILL.md`;
- invoking a model-invoked Matt skill through the Skill tool;
- applying a documented project override.

Require truthful reporting so an execute-by-reference stage is never described as a Skill-tool invocation.

**Step 2: Add the two-axis classifier**

Add planning scale S0-S3 and risk R0-R3. State the governing rule exactly:

> Planning scale decides whether Spec and Tickets exist. Risk decides assurance depth.

**Step 3: Add route completion criteria**

Document:

- S0 read-only;
- S1 single-context implementation, with optional grilling and no mandatory Spec/Tickets;
- S2 multi-context implementation through Spec and tracer-bullet Tickets;
- S3 Wayfinder only when planning spans sessions and contains real fog.

For each route, define its durable source, review baseline, verification evidence, and stop conditions.

**Step 4: Add assurance gates**

Define:

- R1 targeted verification;
- R2 acceptance scenarios, TDD where behavior is testable, affected tests, and review;
- R3 impact/scenario analysis, failure baseline, full relevant verification, and runtime or real-data evidence.

Distinguish hard gates, conditional N/A steps, and user-approved exceptions.

**Step 5: Add corrected execution order**

Use:

```text
authorize → classify → decide → implement/verify per ticket → atomic commit
→ cumulative review against baseline → fix/reverify → docs/archive
→ final commit → authorized push → GitHub issue update
```

**Step 6: Validate the new document**

Run:

```bash
test -f docs/agents/implementation-workflow.md
rg -n "Planning scale|Risk|execute.*by reference|code-review|GitHub" docs/agents/implementation-workflow.md
```

Expected: the file exists and each required contract is present.

**Step 7: Commit**

Stage only `docs/agents/implementation-workflow.md` together with the related router and index changes from Task 2 so no dangling pointer is committed.

### Task 2: Reduce AGENTS.md to an L0 router

**Files:**

- Modify: `AGENTS.md`
- Create: `docs/agents/git-workflow.md`
- Create: `docs/agents/proposal-review.md`
- Modify: `docs/DOCS-INDEX.md`

**Step 1: Preserve hard top-level rules**

Keep concise L0 rules for:

- workflow selection;
- explicit implementation authorization;
- never overwriting unrelated user work;
- no local branch switching;
- HITL publishing;
- session-start checks;
- learned collaboration preferences.

**Step 2: Replace the mandatory implementation body**

Replace the detailed chain with one trigger-rich pointer to `docs/agents/implementation-workflow.md`. The pointer must mention ordinary implementation, high-risk implementation, multi-session work, and Wayfinder.

**Step 3: Move Git execution detail**

Move commit cadence, staging rules, history protection, cross-branch worktrees, and session-boundary rules into `docs/agents/git-workflow.md`. Keep one L0 pointer that fires before staging, committing, pushing, switching context, or doing cross-branch work.

**Step 4: Move proposal checks**

Move evidence, impact, two-source factual verification, tool-maintenance checks, pricing checks, and model-parameter baselines into `docs/agents/proposal-review.md`. Keep one L0 pointer that fires before a change proposal or external-tool recommendation.

**Step 5: Collapse existing technical caches**

Replace duplicated media placement, audio conversion, model selection, content-pipeline, video-skill, and web-fetch details with trigger-rich pointers to their existing L1 sources. Retain only hard safety gates that must remain always loaded.

**Step 6: Update the index**

Add all new `docs/agents/` files and keep the plans entries current.

**Step 7: Validate information preservation**

Run:

```bash
rg -n "stash|checkout|force-with-lease|git add -A|Session Boundary" docs/agents/git-workflow.md
rg -n "因果依据|双源|维护状态|官方推荐" docs/agents/proposal-review.md
rg -n "implementation-workflow|git-workflow|proposal-review" AGENTS.md docs/DOCS-INDEX.md
```

Expected: every moved rule has a target and every target has a pointer.

**Step 8: Commit**

Commit Task 1 and Task 2 as one atomic documentation-hierarchy change.

### Task 3: Align supporting contracts

**Files:**

- Modify: `docs/conventions/scenario-enumeration-checklist.md`
- Modify: `docs/conventions/scenario-matrix.md`
- Modify: `docs/installed-skills.md`
- Modify: `docs/agents/issue-tracker.md`
- Modify: `docs/DOCS-INDEX.md`

**Step 1: Correct nullish-coalescing semantics**

State that `value ?? defaultValue` falls back only for `null` and `undefined`, while `value || defaultValue` also falls back for `0`, `false`, and `""`.

**Step 2: Replace one-row-one-test**

Require every scenario row to name one evidence type:

- automated test;
- static/type/lint check;
- runtime or real-data smoke test;
- human acceptance.

Require automation only for rows whose expected behavior is deterministic and testable at an agreed seam.

**Step 3: Document installed-skill adaptation**

Update `docs/installed-skills.md` with:

- current upstream baseline `1.2.3`;
- user-invoked versus model-invoked distinction;
- execute-by-reference project behavior;
- Wayfinder versus Grill trigger;
- instruction not to edit update-managed installed copies.

**Step 4: Add Wayfinding tracker operations**

Add a bounded section to `docs/agents/issue-tracker.md` describing map, decision tickets, frontier, and text-edge fallback. Do not claim unsupported local `gh` flags; the installed CLI help is the runtime authority.

**Step 5: Validate**

Run:

```bash
rg -n "\\?\\?|\\|\\|" docs/conventions/scenario-enumeration-checklist.md
rg -n "automated test|runtime|human acceptance" docs/conventions/scenario-matrix.md
rg -n "1\\.2\\.3|user-invoked|model-invoked|Wayfinder" docs/installed-skills.md
rg -n "Wayfinding|frontier|Blocked by" docs/agents/issue-tracker.md
```

Expected: corrected semantics and all adaptation contracts are present.

**Step 6: Commit**

Commit the supporting-contract alignment separately.

### Task 4: Repair lifecycle contradictions and run final verification

**Files:**

- Modify: `docs/DOCS-INDEX.md`
- Review: all files changed by Tasks 1-3

**Step 1: Fix the Spec/Ticket/Review lifecycle**

Remove the statement that no `specs/` directory persists while active specs are indexed there. State instead:

- artifacts exist only when planning scale requires them;
- active artifact location follows the current project convention;
- artifacts archive when the corresponding implementation or issue is complete;
- an incomplete or still-open effort remains active.

**Step 2: Run contradiction checks**

Run:

```bash
rg -n "Linear issue|不得跳步|每次改代码之前必须走完|矩阵每一行 = 一个测试用例|No `specs/`" \
  AGENTS.md docs/agents docs/conventions docs/DOCS-INDEX.md
```

Expected: no stale mandatory-workflow, Linear, one-row-one-test, or lifecycle contradiction remains.

**Step 3: Check pointers**

Resolve every changed pointer with `test -e` or repository search. Confirm the Matt skill paths named by the L1 workflow exist locally.

**Step 4: Run documentation validation**

Run:

```bash
npm run lint:docs
git diff --check
```

Expected: both pass.

**Step 5: Review the final diff**

Compare the final documentation against the approved design and verify that unrelated working-tree changes are absent from the staged set.

**Step 6: Commit**

Commit lifecycle and verification fixes. Do not push unless separately authorized by the user.
