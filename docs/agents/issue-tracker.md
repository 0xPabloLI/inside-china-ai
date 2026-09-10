# Issue Tracker: GitHub Issues

Issues are tracked in **GitHub Issues** on this repo using the `gh` CLI.

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
- **Issue body is write-once**: the body is authored at ticket creation and never rewritten. GitHub replaces the entire body on every `PATCH`, so even a "small addition" clobbers content another session wrote (2026-09-10 lesson: evidence handoff to open #235 went in as a comment for exactly this reason). Delivery records go in the closing comment (see Session cognitive offload); new evidence for an open ticket owned by another session goes in a comment too — appending never overwrites.
- **Read the comments before claiming**: a ticket's body alone is not its full state — cross-session evidence, delivery records and user decisions accumulate in comments. A comment unread is a decision re-litigated. Two guards make the miss **decidable instead of a memory test**: **(a) the body says so** — every issue body opens with the fixed notice in "Body notice" below, so a reader who sees only the body is told, inside the very text they are reading, that the body is not the state; **(b) the count is one call away** — `gh api repos/0xPabloLI/inside-china-ai/issues/<N>/comments --jq 'length'` returns a number, and a non-zero count on an open ticket means there is state the body does not carry. Full read: `gh issue view <N> --comments` (REST fallback per the GraphQL workaround above).
- Close issues via commit message (`fixes #N` / `closes #N`) or manually after verification.
- Closing a completed issue: keep its `enhancement` or `bug` category label, remove all state labels. Do not use `wontfix` for completed work — `wontfix` is for rejected items only.
- **GraphQL timeout workaround**: `gh` CLI GraphQL calls (used by `gh issue view/edit/close`) intermittently time out through local proxy. Use REST API instead: `gh api repos/0xPabloLI/inside-china-ai/issues/<num>` for reads, `gh api .../issues/<num>/labels -X PUT` for label changes, `gh api .../issues/<num> -X PATCH -f state=closed` for closing. DELETE requests also time out — use PUT to overwrite the full label set instead.

### Body notice

Every issue body opens with this fixed block, written once at creation and never edited:

> **正文是创建时的规格（write-once，永不改写）。** 当前状态、跨 session 证据与交付记录都在评论里——读票必须带评论（`gh issue view <N> --comments`），只读正文会把已决策的问题重新问一遍。

Identical in every ticket and never rewritten, so the notice itself cannot race. Tickets created before this rule carry no notice — for those, guard (b) still applies.

## Wayfinding operations

Wayfinder is only for S3 work defined in `docs/agents/implementation-workflow.md`. Because its map and decision tickets live in GitHub Issues, creating, editing, assigning, labelling or closing them requires user authorization for those remote writes. Without authorization, prepare a local draft or stop at the gate; do not claim that a tracker map exists.

### Map and decision tickets

- Create one map issue labelled `wayfinder:map`. Its body holds Destination, Notes, Decisions so far, Not yet specified and Out of scope. It is an index, not a duplicate store of ticket detail.
- Create one child issue per answerable decision, sized for one context. Add exactly one type label: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`.
- Keep the normal category/state labels from `triage-labels.md`. `research` or well-specified `task` tickets may be `ready-for-agent`; HITL `grilling` and `prototype` tickets are not AFK work.
- Fog stays in the map's Not yet specified section until it can be phrased as a decision question. Do not create vague placeholder tickets.
- Claim a ticket before work by assigning it to the active developer (`gh issue edit <number> --add-assignee "@me"` is supported by the installed CLI). Concurrent sessions skip assigned tickets.

Prefer GitHub's native sub-issue and blocking relationships when the available UI/API supports them. The installed `gh` 2.62.0 `issue create/edit` commands do not expose parent or blocking flags, so do not invent CLI options. If native relationships cannot be set through an authorized supported surface, use this body fallback:

```markdown
Parent map: <map issue URL>
Blocked by: #<issue>, #<issue>
```

Use `Blocked by: None` for an edge-free ticket. In fallback mode, find children by their Parent map link and calculate the **frontier** as open, unassigned children whose listed blockers are all closed.

### Resolving the map

1. Choose one frontier ticket and claim it.
2. Record the decision, evidence and implications in that ticket; the decision has one detailed home.
3. Close the ticket, then add only a one-line linked gist under the map's Decisions so far.
4. Promote newly answerable fog into decision tickets and recalculate the frontier.
5. When fog is empty and no unresolved decision ticket remains, synthesize the resulting route into the S2 Spec/Tickets flow. Do not hand decision tickets directly to implementation.

## Querying current state

Run `gh issue list --label <state-label> --state open` to see issues in each state. Do not cache issue lists in this file — they go stale. The tracker is the source of truth.

## Session cognitive offload

The tracker is the session's external memory: a fresh session must be able to reconstruct everything from durable sources alone — never from a conversation. Before ending a session, every state the work produced has one offload home, and none of it may remain conversation-only:

| Produced state | Home | Done when |
| --- | --- | --- |
| Per-issue delivery record (commits, tests, live evidence, mechanisms discovered, leftovers) | Closing comment on the issue | A reader who never saw the session can resume or audit the work from the comment alone |
| Roadmap state (tier, wave, blockers, labels) | `docs/issue-roadmap.md` tier/wave rows | `gh issue list --state open` and the tables agree |
| Session narrative (what ran, in order) | inventory line atop `docs/issue-roadmap.md` + the pilot-log entry | The next session's "Last inventory" is the newest line and names the frontier |
| Commit provenance | `Session-Id` trailer + pilot-log registration | `git log --all --format=...trailers` resolves every session commit |
| User decisions and constraints that outlive the task | `docs/issue-roadmap.md` inventory, or agent memory for cross-task preferences | The next session does not re-ask a decided question |

Completion criterion: close the terminal and imagine a colleague opens a fresh one — if they would need to ask you anything the tracker already could have answered, the offload is incomplete.

## Roadmap & execution order

→ **[`docs/issue-roadmap.md`](../issue-roadmap.md)** — the single source of truth for open issues, execution waves, priority tiers, conflict matrix, and triage protocol.
