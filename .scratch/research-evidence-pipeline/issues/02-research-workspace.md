# 02 — Research Workspace & Manifest

**What to build:** A workspace module that creates and manages content-scoped research directories. Each content pipeline run gets its own `content/<slug>/research/` directory containing `discovery.json`, `research-brief.json`, `evidence-pack.json`, `evidence-pack.md`, and `article-claim-map.json`. A `research-manifest.json` tracks all runs for a given content slug, recording `contentId`, `researchRunId`, timestamps, and status. Concurrent runs for different content slugs get separate directories and never overwrite each other.

**Blocked by:** 01 (Schema Contracts & Validators — workspace needs schema constants for file naming)

**Status:** ready-for-agent

- [ ] `lib/research/workspace.mjs` exports `createResearchWorkspace(contentSlug, researchRunId)` → returns directory path, creates if needed
- [ ] `getResearchWorkspace(contentSlug)` → returns path to existing workspace or null
- [ ] `writeResearchArtifact(contentSlug, researchRunId, filename, data)` → writes JSON to workspace, validates against schema
- [ ] `readResearchArtifact(contentSlug, researchRunId, filename)` → reads and parses JSON from workspace
- [ ] `updateManifest(contentSlug, runId, updates)` → updates `research-manifest.json` with run metadata
- [ ] `getLatestRun(contentSlug)` → returns the most recent run ID from manifest
- [ ] Concurrent runs for different slugs get separate directories
- [ ] All tests in `__tests__/research/workspace.test.mjs` pass
