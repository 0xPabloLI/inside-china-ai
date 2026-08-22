# 03 — Brief Builder (Deterministic)

**What to build:** A pure-function module that transforms a `discovery.json` into a `research-brief.json`. The brief builder is deterministic: it only does URL normalization, cross-source deduplication, time-window filtering, source-metadata enrichment, priority sorting, and schema validation. It does NOT make fact judgments or write content. Priority sorting prefers primary sources (official announcements, technical docs, original press releases) over secondary media. The builder accepts a `researchQuestion`, `audience`, `claimsToVerify`, and `researchTier` from the caller (Agent provides these) and combines them with the processed candidate sources.

**Blocked by:** 01 (Schema Contracts), 02 (Research Workspace — for path resolution)

**Status:** ready-for-agent

- [ ] `lib/research/brief-builder.mjs` exports `buildBrief(discovery, { researchQuestion, audience, claimsToVerify, researchTier, knownFacts, openQuestions, userMaterials })`
- [ ] `normalizeUrl(url)` — strips tracking params, lowercases host, sorts query params
- [ ] `deduplicateSources(sources)` — groups by normalized URL, keeps highest-priority
- [ ] `filterByTimeWindow(sources, daysBack)` — filters out sources older than time window
- [ ] `prioritizeSources(sources)` — primary > authoritative-secondary > independent-secondary > community
- [ ] Output passes `validateBrief()` from Ticket 01
- [ ] Builder does NOT access network or make fact judgments
- [ ] All tests in `__tests__/research/brief-builder.test.mjs` pass, including dedup fixtures and primary-source preference
