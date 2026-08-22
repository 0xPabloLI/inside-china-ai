# 01 — Schema Contracts & Validators

**What to build:** Define and validate the four canonical data contracts (`discovery.json`, `research-brief.json`, `evidence-pack.json`, `article-claim-map.json`) as pure functions. Each schema has a `schemaVersion`, required fields, and type constraints. The validator modules accept a parsed JSON object and return `{ valid: boolean, errors: string[] }`. Unknown schema versions are explicitly rejected. This ticket establishes the data layer that all subsequent tickets depend on.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `lib/research/schemas.mjs` exports `DISCOVERY_SCHEMA`, `BRIEF_SCHEMA`, `EVIDENCE_PACK_SCHEMA`, `CLAIM_MAP_SCHEMA` as plain objects describing field types and required flags
- [ ] `lib/research/validate.mjs` exports `validateDiscovery(obj)`, `validateBrief(obj)`, `validateEvidencePack(obj)`, `validateClaimMap(obj)` — each returns `{ valid, errors }`
- [ ] Each validator rejects unknown `schemaVersion` values
- [ ] Evidence pack validation checks that `verification.status` is one of: `verified`, `context`, `analysis`, `conflicted`, `rejected`, `stale`
- [ ] Evidence pack validation checks that `sourceType` is one of: `primary`, `authoritative-secondary`, `independent-secondary`, `community`, `analysis`
- [ ] Claim map validation checks that each claim's `evidenceId` is non-empty
- [ ] All tests in `__tests__/research/schema-validation.test.mjs` pass
