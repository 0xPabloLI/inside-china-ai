# Agent Implementation Workflow Design

## Goal

Replace the current one-size-fits-all mandatory implementation chain with a risk-aware and context-aware workflow while preserving Matt Pocock's interactive engineering methods.

The workflow must:

1. Run automatically after the user authorizes implementation.
2. Avoid forcing Spec and Tickets onto work that fits one context window.
3. Preserve stronger controls for authentication, migrations, public contracts, publishing paths, cross-step data flow, and the core video pipeline.
4. Use Matt's installed skill files as the method source without editing those update-managed files.
5. Call Matt's model-invoked skills through the Skill tool where available.
6. Pause only for unresolved product decisions, consequential external actions, irreversible operations, and required visual or prototype choices.

## Upstream Baseline

Reviewed against `mattpocock/skills` version `1.2.3`, upstream commit `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76` from 2026-08-24.

Relevant upstream rules:

- User-invoked orchestrators: `ask-matt`, `grill-with-docs`, `wayfinder`, `to-spec`, `to-tickets`, and `implement`.
- Model-invoked capabilities: `grilling`, `domain-modeling`, `prototype`, `diagnosing-bugs`, `research`, `tdd`, `codebase-design`, and `code-review`.
- A user-invoked skill cannot be invoked through the Skill tool by an agent or another skill.
- `grill-with-docs` is the single-session planning path.
- `wayfinder` is only for planning that spans multiple sessions and still contains substantial fog.
- `to-spec` and `to-tickets` earn their cost when implementation spans multiple sessions.
- `implement` owns one ticket and calls `tdd` and `code-review`.

Sources:

- <https://github.com/mattpocock/skills/tree/main/skills/engineering>
- <https://www.aihero.dev/skills-ask-matt>
- <https://www.aihero.dev/skills-wayfinder>
- <https://www.aihero.dev/skills-to-spec>
- <https://www.aihero.dev/skills-to-tickets>
- <https://www.aihero.dev/skills-implement>

## Invocation Adaptation

The project intentionally delegates stage transitions to the agent.

For an installed user-invoked Matt skill, "execute `<skill>`" means:

1. Read the installed `SKILL.md` as the method source.
2. Follow its applicable process and completion criteria.
3. Apply the project overrides documented in the execution workflow.
4. Do not claim that the Skill tool invoked it.

For a model-invoked Matt skill, call it through the Skill tool.

This preserves the installed method while respecting invocation metadata. The installed files remain unmodified so `npx skills update` can refresh them.

## Two-Axis Routing

Planning scale and implementation risk are independent.

### Planning Scale

| Level | Condition | Planning route |
|---|---|---|
| S0 | Read-only analysis or no implementation requested | Inspect and report |
| S1 | The decisions and implementation fit one context window | Clarify only if needed, then implement directly |
| S2 | The route is clear, but implementation needs multiple context windows | Grill as needed, then Spec, Tickets, and one implementation run per ticket |
| S3 | The destination is known, but planning itself spans sessions and the route contains substantial fog | Wayfinder decision map, then Spec, Tickets, and one implementation run per ticket |

Single-session work may skip standalone Spec and Tickets even when it is high risk. It must still state acceptance criteria, test seams, and relevant risk scenarios in the active context before implementation.

### Risk

| Level | Condition | Required assurance |
|---|---|---|
| R0 | Read-only | No implementation gates |
| R1 | No behavior, contract, data flow, authorization, or release-path change | Targeted validation and diff self-review |
| R2 | Ordinary behavior change with bounded impact | Acceptance scenarios, TDD where behavior is testable, affected tests, review |
| R3 | Auth/RLS, migration, public contract, publishing, irreversible data effect, cross-step contract, or core video-pipeline change | Scenario and impact analysis, testable failure baseline, cumulative review, full relevant verification, and runtime or real-data evidence where applicable |

Risk controls change assurance depth. Planning scale decides whether durable Spec and Ticket artifacts are needed.

## Automatic Routes

### S1

1. Confirm authorization and scope.
2. If decisions remain, execute `grill-with-docs` by reference, which calls `grilling` and `domain-modeling`.
3. State acceptance criteria, test seams, and R2/R3 risks in context.
4. Execute the implementation method by reference and call `tdd` where behavior is testable.
5. Run affected tests and required runtime checks.
6. Create an atomic commit.
7. Run `code-review` against the pre-work baseline so the review can see the committed diff.
8. Return findings to implementation, revalidate, and commit the fixes.

### S2

1. Execute `grill-with-docs` by reference when decisions remain.
2. Execute `to-spec` by reference and create one durable implementation contract.
3. Execute `to-tickets` by reference. Tickets must be tracer-bullet slices with real blocking edges, a demo path, and acceptance criteria that fail at baseline.
4. Self-review the breakdown. Ask the user only when granularity or a product decision remains materially ambiguous.
5. Execute one ticket per fresh context, call `tdd`, verify, update ticket state, and commit.
6. Run cumulative `code-review` against the pre-work baseline.
7. Fix findings through the same implementation loop.
8. Run final verification, archive temporary artifacts, create a final documentation commit, then push if authorized.

### S3

1. Establish a bounded destination.
2. Use Wayfinder's map, fog, frontier, and decision-ticket model.
3. Keep implementation out of decision tickets.
4. Resolve each HITL decision with the user; research tickets may run without the user.
5. When the map is clear, collapse it through S2.

## Project Overrides for Known Upstream Gaps

| Upstream behavior or gap | Project override |
|---|---|
| User-invoked stages require manual slash commands | The agent executes their installed files by reference after implementation authorization |
| `to-tickets` always quizzes the user | The agent first performs the same granularity and blocking-edge review; it asks only when a material decision remains |
| `implement` calls review before commit, while review only sees committed `HEAD` | Commit the verified ticket first, then review the committed cumulative diff |
| `implement` does not act on review findings | Findings return to the implementation and verification loop |
| `implement` does not update ticket state | Reconcile acceptance criteria and status immediately after verification |
| `tdd` documentation describes red-green slices and defers refactoring | Keep each slice red-green; perform review-driven refactoring with tests green before completion |
| Wayfinder can over-plan | Use it only for multi-session planning with real fog and a bounded destination |

## Documentation Structure

- `AGENTS.md` remains L0: workflow router, hard safety rules, and pointers only.
- `docs/agents/implementation-workflow.md` becomes the L1 execution source.
- `docs/conventions/scenario-enumeration-checklist.md` remains an on-demand risk reference.
- `docs/conventions/scenario-matrix.md` defines evidence types, not a one-test-per-row mandate.
- `docs/installed-skills.md` records invocation classes and the automatic by-reference adaptation.

## Verification

The documentation change is complete when:

1. Every workflow branch has an unambiguous trigger and completion criterion.
2. GitHub is the only named issue tracker for this repository.
3. Spec and Tickets are conditional on planning scale.
4. Tests, documentation lint, runtime UI checks, and video real-data checks have explicit triggers.
5. Review runs against a committed diff and findings re-enter the implementation loop.
6. Hard gates, conditional N/A steps, and user-approved exceptions are distinct.
7. Every changed pointer resolves to an existing file.
8. `npm run lint:docs` passes.
