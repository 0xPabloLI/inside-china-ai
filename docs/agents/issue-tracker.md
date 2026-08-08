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
