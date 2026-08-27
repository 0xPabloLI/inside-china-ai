# Code Review: Framed Contain Composition (#119 Phase 2)

> **Date:** 2026-08-27
> **Commit:** `973ea43`
> **Fixed point:** `d7d93ba` (HEAD~1 at time of review)
> **Spec:** `docs/archive/spec-framed-contain-composition.md`
> **Reviewer:** Agent (code-review skill, two-axis)

## Standards

### Documented Standards (AGENTS.md Coding Conventions)

- ✅ TypeScript + functional React component — `MediaBackground` is a `React.FC<Props>`
- ✅ 2-space indentation — all new lines use 2-space indent
- ✅ `PascalCase` for components/types (`AbsoluteFill`), `camelCase` for vars (`isContain`, `showBrandedMatte`)
- ✅ No `useState` initialization trap — change does not involve state
- ✅ Comment style consistent — `───` section delimiter matches existing pattern in the file

### Smell Baseline

- **Mysterious Name**: `isContain` and `showBrandedMatte` clearly express intent. No issues.
- **Duplicated Code**: `isContain` used once, `showBrandedMatte` used once. No duplication.
- **Speculative Generality**: No extra abstraction, parameters, or hooks added beyond what spec requires.
- **Primitive Obsession**: No primitive standing in for a domain concept.
- Other smells not applicable (18-line change).

**Standards verdict: 0 findings.**

## Spec

### Requirements Coverage (Scenario Matrix)

| ID | Spec Requirement | Implementation | Status |
|----|-----------------|----------------|--------|
| FC-01 | `image + contain` → brand gradient matte | `showBrandedMatte = media.type === "image" && isContain` → `AbsoluteFill` with `radial-gradient(circle at 50% 50%, #0a0a14 0%, #050508 100%)` | ✅ |
| FC-02 | `image + cover` (regression) → no matte | `isContain = false` when `fit === "cover"` | ✅ |
| FC-03 | no `fit` field (default cover) (regression) → no matte | `media.fit ?? "cover"` → `isContain = false` | ✅ |
| FC-04 | `video + contain` (regression) → no matte, bare `#0a0a14` | `showBrandedMatte = media.type === "image" && ...` → `false` for video | ✅ |
| FC-06 | matte fades with image during transitions | `opacity` variable shared between `mediaStyle.opacity` and matte `AbsoluteFill` | ✅ |
| FC-07/08 | matte is static (no scale/translate/filter) | matte `AbsoluteFill` only sets `background` + `opacity`, no `transform` | ✅ |
| FC-09 | three-layer structure: matte → CanvasImage → overlay | JSX order: matte `AbsoluteFill` → `CanvasImage`/`Video` → overlay `div` | ✅ |
| FC-10 | `mode:"fullscreen"` (overlay=0) → matte still renders | `showBrandedMatte` does not depend on `overlay` or `mode` | ✅ |

### Non-Goals Compliance

- ✅ No `containStyle` field added to `types.ts` (Issue #119 comment feedback #2)
- ✅ No Python-side changes
- ✅ No blur/padded/video contain framing
- ✅ No palette gradient (Method B) — only Method A (CSS radial-gradient)

### Scope Creep Check

- No code changes outside `MediaBackground.tsx` for this ticket
- Spec/tickets files created and archived — no unrelated files modified

**Spec verdict: 0 findings. All 10 scenario matrix rows verified, all non-gools respected.**

## Summary

- **Standards**: 0 findings (0 hard, 0 judgement)
- **Spec**: 0 findings (all 10 acceptance matrix rows pass, no scope creep)
- No issues to address. Implementation is clean, minimal, and faithful to spec.
