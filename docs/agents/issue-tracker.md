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
- Close issues via commit message (`fixes #N` / `closes #N`) or manually after verification.
- Closing a completed issue: keep its `enhancement` or `bug` category label, remove all state labels. Do not use `wontfix` for completed work — `wontfix` is for rejected items only.
- **GraphQL timeout workaround**: `gh` CLI GraphQL calls (used by `gh issue view/edit/close`) intermittently time out through local proxy. Use REST API instead: `gh api repos/0xPabloLI/inside-china-ai/issues/<num>` for reads, `gh api .../issues/<num>/labels -X PUT` for label changes, `gh api .../issues/<num> -X PATCH -f state=closed` for closing. DELETE requests also time out — use PUT to overwrite the full label set instead.

## Querying current state

Run `gh issue list --label <state-label> --state open` to see issues in each state. Do not cache issue lists in this file — they go stale. The tracker is the source of truth.

## Roadmap & execution order

→ **[`docs/issue-tracker.md`](../issue-tracker.md)** — the single source of truth for open issues, execution waves, priority tiers, conflict matrix, and triage protocol.
