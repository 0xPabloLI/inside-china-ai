# 03 — ADR structural changes: merge 0001, archive 0006, rewrite 0016

**What to build:** Three structural changes to the ADR directory: (1) merge duplicate 0001 files into one, (2) move 0006 (refactor report) to archive, (3) rewrite 0016 (cascade filtering) as pure ADR.

**Blocked by:** 02 (content trimming must be done first — 0016 rewrite depends on knowing what was stripped from other ADRs for consistency).

**Status:** ready-for-agent

- [ ] `0001-widget-inline-embedding.md` contains merged content from both files, trimmed to ADR-FORMAT (1-3 sentences + optional sections). `0001-widget-inline-markers.md` deleted.
- [ ] `0006-architecture-deepening-completed.md` moved to `docs/archive/0006-architecture-deepening-completed.md`. No `docs/adr/0006-*` file remains.
- [ ] `0016-cascade-filtering-signal-density.md` rewritten: keep Rule 1 (cascade — cheap filters first) + Rule 2 (signal density — one call produces multiple signals) as the decision. Delete: "Status: Proposed", cost/throughput performance table, "Already applied (3 places)", "Applicable but not yet applied", P4-P8 guidance, paper citation, references section.
