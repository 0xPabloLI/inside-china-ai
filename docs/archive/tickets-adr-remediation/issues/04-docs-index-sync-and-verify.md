# 04 — DOCS-INDEX sync + final verification

**What to build:** Sync DOCS-INDEX ADR table with actual files, then run writing-for-agents three checks (cross-section contradictions, pointer target completeness, file existence) + ADR-FORMAT compliance + three-criteria check.

**Blocked by:** 03 (all structural changes must be done before index sync).

**Status:** ready-for-agent

- [ ] DOCS-INDEX ADR table: remove 0006 row (mark "moved to archive"), add 0016 row, fix 0001 to show single merged file
- [ ] `ls docs/adr/` shows 15 files: 0001 (merged), 0002, 0003, 0004, 0005, 0007, 0008, 0009, 0010, 0011, 0012, 0013, 0015, 0016 (was 17)
- [ ] DOCS-INDEX ADR table matches `ls docs/adr/` output
- [ ] Every ADR Consequences pointer target file exists (`ls` each path)
- [ ] No ADR has parameter tables, API surfaces, performance tables, bug fix logs, or implementation tracking
- [ ] Every ADR has ≤ 1-3 sentences for decision (not counting optional sections)
- [ ] No cross-section contradictions: same rule consistent across all ADRs
- [ ] `npm run lint` passes
