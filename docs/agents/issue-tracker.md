# Issue Tracker: GitHub Issues

Issues are tracked in **GitHub Issues** on this repo using the `gh` CLI.

**Terminology**: this document uses _issue_ exclusively for a GitHub Issue (a tracker entry). _Ticket_ is reserved for the implementation tickets that `to-tickets` splits from a Spec in the S2 flow — the single definition source is `docs/DOCS-INDEX.md` §Spec/Ticket/Review Lifecycle. The two are not synonyms.

## Workflow

- **Create issue**: `gh issue create` with title, body, labels
- **List issues**: `gh issue list` (filter by `--label`, `--state`, `--assignee`)
- **Update issue**: `gh issue edit <number>` (add labels, assignees, update body)
- **Close issue**: `gh issue close <number>`
- **View issue**: `gh issue view <number>` (includes comments)
- **PRs as request surface**: off (external PRs are not triaged as issues)

## Conventions

- Use labels for triage (see `triage-labels.md`).
- One issue = one atomic task or bug.
- Link related issues in the body with `#number`.
- **Check the model-decision history before triaging or claiming a frontier issue**: an issue's premise can be stale — a model/approach named in the body may already have been demoted or superseded by a later user verdict recorded in `docs/research/` tables and inventory lines (2026-09-11 lesson: #221 proposed testing InfiniteTalk on NPU three days after the user confirmed 表情偏僵 → demoted to backup, then SoulX-FlashTalk won best talking body; issue triage and frontier pick both validated environment feasibility but nobody re-checked whether the model line was still wanted — the session worked through preparation before the user caught it). Before starting work on an issue that recommends a specific model/tool, grep `docs/research/` for that name's current verdict (✅ 最佳 / 备选 / ❌ 否决).
- **Issue body is write-once**: the body is authored at issue creation and never rewritten. GitHub replaces the entire body on every `PATCH`, so even a "small addition" clobbers content another session wrote (2026-09-10 lesson: evidence handoff to open #235 went in as a comment for exactly this reason). Delivery records go in the closing comment (see Session cognitive offload); new evidence for an open issue owned by another session goes in a comment too — appending never overwrites.
- **Body states the problem, not the plan**: undecided implementation directions go in an Open Questions section ("decided at implementation time"), and missing prerequisite facts get their own line (e.g. "first probe X at pickup"). Triage only validates the problem and assigns Tier/priority; the approach is chosen when the issue is picked up, against evidence gathered then (grilling/spec first if needed). Write-once makes a pre-authored option menu expensive to walk back — it takes a corrective comment (2026-09-12 lesson: #269 opened with a three-option "供 triage 裁决" menu that needed a same-day clarifying comment).
- **Read the comments before claiming**: an issue's body alone is not its full state — cross-session evidence, delivery records and user decisions accumulate in comments. A comment unread is a decision re-litigated. Three guards make the miss **decidable instead of a memory test**: **(a) the body says so** — every issue body opens with the fixed notice in "Body notice" below, so a reader who sees only the body is told, inside the very text they are reading, that the body is not the state; **(b) the count is one call away** — `gh api repos/0xPabloLI/inside-china-ai/issues/<N>/comments --jq 'length'` returns a number, and a non-zero count on an open issue means there is state the body does not carry. **(c) the label shows it** — CI auto-sets `comments-unread` on an open issue whenever a comment lands, so the signal rides in the `gh issue list` output triage already runs (see `triage-labels.md` → Signal Labels); clear it once the new state is incorporated. Full read: `gh issue view <N> --comments` (REST fallback per the GraphQL workaround above). **Claims go through `scripts/claim-issue.sh <N>`** — it prints the body + all comments into your context, surfaces `comments-unread`, assigns, and clears the signal in one step (rationale and the CI-backstop design: `docs/research/claim-gate-research-2026-09.md`); a bare `gh issue edit --add-assignee` claim skips the gate and is how the #221 stale-premise waste happens.
- Close issues via commit message (`fixes #N` / `closes #N`) or manually after verification.
- Closing a completed issue: keep its `enhancement` or `bug` category label (or `documentation`/`duplicate` where applicable), remove all state labels (`ready-for-agent`, `needs-triage`, etc.), priority labels (`P0`–`P3`), and signal labels (`comments-unread`). Priority labels guide pick-up order for open backlog work only; once an issue is closed, retaining P or signal labels creates filter noise. Do not use `wontfix` for completed work — `wontfix` is for rejected items only. A closed ticket missing its delivery record carries `delivery-record-missing` until a comment with the marker lands (see the machine-check note under Session cognitive offload).
- **Pickup queries filter `--state open`**, and CI now enforces the cleanup: state and signal labels used to linger on closed issues. **2026-09-20 audit（API 实测，排除 PR）**：68 张已闭 issue 带 `ready-for-agent`、4 张带 `needs-triage`、4 张带 `comments-unread`、3 张带 `P1`/`P2`。⚠️ 这推翻了本行原先「11 张… all swept same day」的自述 —— **那条自述自写下起即不成立**，因此「文档/ commit 标题里写着已清扫」不能当证据，核清扫结果一律回 `gh api`。同日落地机器兜底：`issue-tracker-signals.yml` 的 `strip-closed-labels` job（`issues.closed` 自动剥 state/`P0`–`P3`/`comments-unread`，保留 category 与 `wontfix`；`workflow_dispatch` + `sweep_closed` 做存量回填）；并修掉 `mark-unread` 的**晚到补刀** —— 它用事件 payload 里「评论创建那一刻」的 state 快照做守卫，会在「发交付记录评论 → 关票」之后给已关的票打上 `comments-unread`（#307/#309/#316/#317 全中），现改为打标前回读当前 state。**2026-09-20 存量回填已清零**：经 `workflow_dispatch`（`sweep_closed=true` + `apply=true`）扫描 252 张已闭票，84 张命中、剥掉 91 个标签；复核 `state=closed` 下 `ready-for-agent`/`needs-triage`/`needs-info`/`ready-for-human`/`dormant`/`comments-unread`/`P0`–`P3` 全部为 **0**，open 票侧各标签计数不变（19/3/17/41/21）。Pick work only from `gh issue list --state open ...` — a closed issue is never a pickup candidate regardless of its labels.
- **GraphQL timeout workaround**: `gh` CLI GraphQL calls (used by `gh issue view/edit/close`) intermittently time out through local proxy. Use REST API instead: `gh api repos/0xPabloLI/inside-china-ai/issues/<num>` for reads, `gh api .../issues/<num>/labels -X PUT` for label changes, `gh api .../issues/<num> -X PATCH -f state=closed` for closing. DELETE requests also time out — use PUT to overwrite the full label set instead.

### Body notice

Every issue body opens with this fixed block, written once at creation and never edited:

> **正文是创建时的规格（write-once，永不改写）。** 当前状态、跨 session 证据与交付记录都在评论里——读票必须带评论（`gh issue view <N> --comments`），只读正文会把已决策的问题重新问一遍。

Identical in every issue and never rewritten, so the notice itself cannot race. Issues created before this rule carry no notice — for those, guard (b) still applies.

## Scanner & Audit Intake Contract

扫描器产出（OCR、Semgrep、droid-review、一次性审计）分四态，各有唯一落点。混装是 #319 从 19 条发现长成 181 条长期账本的根因：票的生命周期被「扫描覆盖进度」而不是「缺陷是否修完」决定。

| 态 | 落点 | 生命周期 |
| --- | --- | --- |
| **Finding Report** — 原始候选 + 逐条裁决 | 入仓报告 `docs/reviews/<scanner>-<scope>-<date>.md`；一次性试验可放 `.scratch/`（gitignored）或 PR 评论 | 裁决完成且对应票（如有）全闭后移入 `docs/archive/reviews/` 并同步 `docs/DOCS-INDEX.md` |
| **Ruling** — 真/假阳性 + 证据 | 报告内联逐条写；对应票的评论只留汇总 | 与报告同寿命 |
| **Batch Issue** — 可交付修复批 | GitHub Issue，`ready-for-agent` | 开票即冻结：只含已确认真阳性、同一模块且同批可修完的条目，单票 ≤ 15 个可勾选原子项 |
| **Coverage Gap** — 扫描器没扫或扫不动 | 独立的扫描器 / 测试基础设施票（`bug` / `enhancement`） | 与业务修复票分开；「未扫区域」不写进修复票 |

裁决由执行该次扫描的 session 逐条落；只有「这条值不值得修」的产品取舍交用户拍板（HITL）。

**入口顺序**（全量扫描与增量审查共用）：

1. 先落报告、逐条裁决，再决定开不开票。假阳性与「真阳性但不修」都留在报告（后者写明取舍理由）；假阳性也可进既有排除名单（`knip.json`、eslint allowlist 等），不进实施票分母。
2. 只为已确认真阳性开票，按「同一模块、同批能修完」聚合；超过上限就拆批。
3. 票开出后不再追加条目。新扫描发现的新增项进新报告、新票；报告可以继续长，票面冻结。
4. 增量路径（OCR A/B 模式、per-PR 审查）通常只有几条：裁决与证据放 PR review，真阳性直接开票，不强制单独报告；同一批超过 15 条或需跨 PR 追踪时升级为报告。
5. 报告全量裁决完、对应票全闭后归档。未裁决的报告留在 `docs/reviews/`，避免「归档 = 已处理」的误读。

这是约定，不是 CI 门禁（#650 裁决）：门禁只能断言「票引用了报告路径」这类形式，判不了裁决真假，维护成本不抵收益。

## Wayfinding operations

Wayfinder is only for S3 work defined in `docs/agents/implementation-workflow.md`. Because its map and decision issues live in GitHub Issues (the wayfinder skill calls them "decision tickets"; they are child issues on this tracker, not implementation tickets), creating, editing, assigning, labelling or closing them requires user authorization for those remote writes. Without authorization, prepare a local draft or stop at the gate; do not claim that a tracker map exists.

### Map and decision issues

- Create one map issue labelled `wayfinder:map`. Its body holds Destination, Notes, Decisions so far, Not yet specified and Out of scope. It is an index, not a duplicate store of issue detail.
- Create one child issue per answerable decision, sized for one context. Add exactly one type label: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`.
- Keep the normal category/state labels from `triage-labels.md`. `research` or well-specified `task` issues may be `ready-for-agent`; HITL `grilling` and `prototype` issues are not AFK work.
- Fog stays in the map's Not yet specified section until it can be phrased as a decision question. Do not create vague placeholder issues.
- Claim an issue before work through `scripts/claim-issue.sh <number>` — it prints the body + all comments, then assigns with an explicit login and a read-back assertion before reporting success (#311: the REST assignees endpoint does not resolve `@me` and can return 201 with an empty assignees array). Concurrent sessions skip assigned issues.

Prefer GitHub's native sub-issue and blocking relationships when the available UI/API supports them. The installed `gh` 2.62.0 `issue create/edit` commands do not expose parent or blocking flags, so do not invent CLI options. If native relationships cannot be set through an authorized supported surface, use this body fallback:

```markdown
Parent map: <map issue URL>
Blocked by: #<issue>, #<issue>
```

Use `Blocked by: None` for an edge-free issue. In fallback mode, find children by their Parent map link and calculate the **frontier** as open, unassigned children whose listed blockers are all closed.

### Resolving the map

1. Choose one frontier issue and claim it.
2. Record the decision, evidence and implications in that issue; the decision has one detailed home.
3. Close the issue, then add only a one-line linked gist under the map's Decisions so far.
4. Promote newly answerable fog into decision issues and recalculate the frontier.
5. When fog is empty and no unresolved decision issue remains, synthesize the resulting route into the S2 Spec/Tickets flow. Do not hand decision issues directly to implementation.

## Querying current state

Run `gh issue list --label <state-label> --state open` to see issues in each state. Do not cache issue lists in this file — they go stale. The tracker is the source of truth.

## Session cognitive offload

The tracker is the session's external memory: a fresh session must be able to reconstruct everything from durable sources alone — never from a conversation. Before ending a session, every state the work produced has one offload home, and none of it may remain conversation-only:

| Produced state                                                                                                                                                                                                                | Home                                                                                     | Done when                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-issue delivery record (product impact — the user-visible problem it solved, what the user now sees, and which behaviour or boundary did not change; then commits, tests, live evidence, mechanisms discovered, leftovers) | Closing comment on the issue, **opening with the marker `交付记录` / `Delivery record` and carrying a `## 产品视角` section** | A reader who never saw the session can see what changed for users (or why nothing did), and resume or audit the work from the comment alone |
| Roadmap state (tier, wave, blockers, labels)                                                                                                                                                                                  | `docs/issue-roadmap.md` tier/wave rows                                                   | `gh issue list --state open` and the tables agree                                                                                           |
| Session narrative (what ran, in order)                                                                                                                                                                                        | inventory line atop `docs/issue-roadmap.md` + the pilot-log entry                        | The next session's "Last inventory" is the newest line and names the frontier                                                               |
| Commit provenance                                                                                                                                                                                                             | `Session-Id` trailer + pilot-log registration                                            | `git log --all --format=...trailers` resolves every session commit                                                                          |
| User decisions and constraints that outlive the task                                                                                                                                                                          | `docs/issue-roadmap.md` inventory, or agent memory for cross-task preferences            | The next session does not re-ask a decided question                                                                                         |
| Research conclusion and its downstream consumer (the doc, the ticket that will act on it, and any roadmap change it forces)                                                                                                   | Research doc header `> **下游票**：` + a comment on **each** declared issue + the roadmap row when tier/blockers change | The doc names every consumer by number, each named issue carries the conclusion comment, and the roadmap row matches the conclusion — `npm run lint:docs` rule 3b reads the field |

Completion criterion: close the terminal and imagine a colleague opens a fresh one — if they would need to ask you anything the tracker already could have answered, the offload is incomplete.

The final report quotes the record's product-view section instead of restating it: `scripts/product-view-section.mjs <N>` prints it, and the report pastes that output (why there is no third gate, and what remains unenforced: `implementation-workflow.md` §9 step 8 and §12).

That marker is machine-checked: `.github/workflows/issue-tracker-signals.yml` posts a reminder when a non-`wontfix` issue closes with no delivery-record comment, and (#315) the missing case is a ledger, not a one-shot reminder — the closed issue carries `delivery-record-missing`, a later user comment with the marker (or an explicit `无需交付记录` waiver) clears it, a daily recheck escalates once after 3 days, and the backlog is auditable via `gh issue list --label delivery-record-missing --state closed` (grandfathered: only issues closed on/after 2026-09-19, the gate's CI rollout date, participate).

A second ledger covers the record's content. A record that carries the marker but has no `## 产品视角` section, or fewer than three substantive sentences in it, puts `product-view-missing` on the issue — whether the record arrived before the close or was backfilled later, since a late record without the section would otherwise clear the missing-record ledger while saying nothing about users. A later comment carrying **both** the marker and a compliant section clears it (a section-only comment is not a record, so it cannot clear the ledger — the reminder text says the same), the daily recheck escalates once after 3 days, and the backlog is auditable via `gh issue list --label product-view-missing --state closed`. What bounds this ledger is **when a record is judged**, not when the issue closed: the close job judges new closures, the comment job judges a record written later, and neither labels an issue whose comments nobody touches. So a pre-gate issue whose record someone backfills today is held to today's standard — that is deliberate, because the record is read as of when it was written, and it is why the manual backlog sweep writes only the missing-record ledger. The three-sentence rule has one implementation in `scripts/check-product-view.mjs`, behind two entry points that share the section-and-unit counting: `evaluateProductView` for the PR body (bot authors and the `skip-product-view` label exempt it) and `evaluateCommentProductView` for a closing comment (neither exemption, deliberately — both are opt-outs an author could reach for to escape the surface being checked). Which labels to touch, how stale an entry may sit, which closures are grandfathered, and what the reminders and escalations say are decided in `scripts/issue-tracker-ledger.mjs`, which all four workflow jobs call as a CLI, so no job carries its own copy of the marker, the waiver or the prose.

## Roadmap & execution order

→ **[`docs/issue-roadmap.md`](../issue-roadmap.md)** — the single source of truth for open issues, execution waves, priority tiers, conflict matrix, and triage protocol.
