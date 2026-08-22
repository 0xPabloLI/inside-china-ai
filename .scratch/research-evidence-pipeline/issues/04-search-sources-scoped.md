# 04 — Search Sources Run-Scoped Output

**What to build:** Modify `search-sources.mjs` to accept `--content-id <slug>` and `--research-run-id <id>` CLI args. When provided, the script writes its output to `content/<slug>/research/discovery.json` instead of the global `research-results.json` / `trending-topics.json`. The output conforms to the `discovery.json` schema (with `schemaVersion`, `contentId`, `researchRunId`, `sources[]`, `failedSources[]`, `sourceCount`, `timeWindow`, `locale`). The existing global output paths remain as fallback when no content-id is provided (backward compatibility). The script also records `failedSources[]` with failure reasons for observability.

**Blocked by:** 01 (Schema Contracts), 02 (Research Workspace — for path resolution)

**Status:** ready-for-agent

- [ ] `search-sources.mjs` accepts `--content-id <slug>` and `--research-run-id <id>` args
- [ ] When content-id is provided, output written to `content/<slug>/research/discovery.json` in discovery schema format
- [ ] When no content-id, falls back to existing global output (backward compat)
- [ ] `discovery.json` includes `failedSources[]` with `{ name, reason }` entries
- [ ] `discovery.json` includes `sourceCount` and run metadata
- [ ] Existing `trending-topics.json` output preserved for trend mode
- [ ] Existing tests in `source-registry.test.mjs` and `trends-utils.test.mjs` still pass (regression)
- [ ] New tests in `__tests__/research/search-sources-scoped.test.mjs` cover the content-id path
