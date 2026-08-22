# 05 — Claim-Evidence Auditor (MRL-1 Evidence Gate)

**What to build:** A pure-function module that acts as the MRL-1 evidence audit gate. The auditor takes an `article-claim-map.json` and an `evidence-pack.json` and returns `{ passed, failures[] }`. It fails in these cases: a claim has no evidence mapping; a claim maps to a `rejected` or `stale` evidence item; a high-risk claim doesn't meet the routing tier's minimum evidence standard (Standard: ≥1 independent source; Deep: ≥2 independent sources + cross-verification); an evidence item's `validUntil` has passed (staleness check); a claim's numeric/date/entity values don't match the evidence statement. The auditor is called by the Agent during MRL-1 and blocks publication if `passed === false`.

**Blocked by:** 01 (Schema Contracts — needs validators to parse inputs), 02 (Research Workspace — to read artifacts)

**Status:** ready-for-agent

- [ ] `lib/research/claim-auditor.mjs` exports `auditClaims(claimMap, evidencePack, { researchTier })` → returns `{ passed, failures }`
- [ ] Fails when a material claim has no evidence mapping
- [ ] Fails when evidence status is `rejected` or `stale`
- [ ] Fails when high-risk claim doesn't meet tier minimum (Standard: ≥1 independent source; Deep: ≥2 independent + cross-verification)
- [ ] Fails when `validUntil` date has passed (staleness check)
- [ ] `analysis` claims pass without requiring external evidence (author opinion is allowed)
- [ ] Returns structured `failures[]` with `{ claimId, reason, evidenceId }` for each failure
- [ ] All tests in `__tests__/research/claim-auditor.test.mjs` pass, covering scenarios 4, 6, 7, 8, 11 from the spec's behavioral matrix
