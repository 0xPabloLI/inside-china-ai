# Triage Labels

The triage skill uses five canonical roles. Label strings match role names.

## Category Labels

| Label         | Meaning                    |
| ------------- | -------------------------- |
| `bug`         | Something is broken        |
| `enhancement` | New feature or improvement |

## State Labels

| Label             | Meaning                                  |
| ----------------- | ---------------------------------------- |
| `needs-triage`    | Maintainer needs to evaluate             |
| `needs-info`      | Waiting on reporter for more information |
| `ready-for-agent` | Fully specified, ready for an AFK agent  |
| `ready-for-human` | Needs human implementation               |
| `wontfix`         | Will not be actioned                     |

## Signal Labels (machine-managed)

| Label             | Meaning                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comments-unread` | Auto-set by CI whenever a comment lands on an **open** issue; cleared by whichever session incorporates the new state. Not a triage state — exempt from the rule below. |

## Triage Flow

```
New issue → needs-triage (needs evaluation)
          → needs-info (waiting for clarification)
          → ready-for-agent (agent-pickable)
          → wontfix (won't fix)

needs-triage + clarified → ready-for-agent / ready-for-human
needs-info + reporter replies → needs-triage
```

## Conventions

- Every triaged issue carries exactly one category label and one state label. **Signal labels** (machine-managed, above) are exempt — they carry mechanical state, not triage status.
- Clear `comments-unread` once you have read the ticket's comments and incorporated the new state (roadmap row / delivery record / your own work). Labels are removed by PUTting the remaining set, per the DELETE workaround in `issue-tracker.md`.
- `ready-for-agent` requires: (1) fully specified with acceptance criteria, (2) correct priority, (3) actionable by an agent without further human input.
- `wontfix` issues should be closed with an explanation comment.
