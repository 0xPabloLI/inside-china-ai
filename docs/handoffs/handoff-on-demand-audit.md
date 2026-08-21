# Handoff: On-Demand Content Audit Feature

> Created: 2026-08-19
> Parent discussion: `docs/research/pipeline-simplification-discussion.md` (Topic 1)
> Trigger: User wants to audit specific content on-demand after seeing a video

## Context

The Research Evidence Pipeline was initially designed as a mandatory Stage 0.5 audit gate (all claims must pass before pipeline continues). After discussion, the user decided:

1. **No mandatory audit** — confidence is annotation, not a gate
2. **Evidence modules are kept but not wired into the pipeline** — `claim-auditor.mjs`, `scene-claims.mjs`, `schemas.mjs` (evidence-pack + claim-map schemas), `research-pipeline.mjs` (audit phase)
3. **web-deep-research skill is NOT modified** — it's a general-purpose research skill, can't change its output format for evidence

## What the user wants

When the user sees a finished video and says something like "audit this content" or "verify the claims in this video", the agent should be able to:

1. Extract factual claims from the content (article + scene-data)
2. Generate an `evidence-pack.json` (structured evidence with verification status)
3. Generate an `article-claim-map.json` (claim → evidence mapping)
4. Run `auditClaims()` from `lib/research/claim-auditor.mjs`
5. Report which claims are well-supported vs need more evidence

## What exists already

- `lib/research/schemas.mjs` — Schema definitions for `evidence-pack.json` and `article-claim-map.json` ✅
- `lib/research/claim-auditor.mjs` — Pure function `auditClaims(claimMap, evidencePack, options)` ✅ (23 tests passing)
- `lib/research/scene-claims.mjs` — `claimIds` extraction from scene-data ✅ (20 tests passing)
- `lib/research/workspace.mjs` — Per-run artifact storage + manifest ✅ (28 tests passing)
- `research-pipeline.mjs` — CLI with `--audit-only` flag ✅ (but expects evidence-pack + claim-map to already exist)

## What's missing (the gap)

1. **Claim extraction logic** — No code that reads an article markdown or scene-data.mjs and extracts structured claims (claimId, type= fact/analysis, riskLevel, text). Currently spec says "author must create" but no generator exists.

2. **Evidence-pack generation logic** — No code that takes claims + research results (from search-sources or web-access) and structures them into `evidence-pack.json` format (evidenceId, statement, source, verification.status, etc.). web-deep-research skill outputs markdown, not JSON.

3. **Agent trigger mechanism** — No skill or AGENTS.md instruction that tells the agent: "when user says 'audit this content', run the audit pipeline". This is a context-pointer problem (see writing-for-agents skill).

## Constraints

- **Do NOT modify web-deep-research skill** — it's a general-purpose skill shared across workflows
- **Do NOT make audit mandatory** — it's on-demand only, user triggers it
- **Keep existing evidence code + tests as-is** — they're dormant but functional
- The audit should work on already-published content (article is on the website, video is made)

## Suggested approach for the next session

1. Design the claim extraction logic — either:
   - A Node.js script that parses article markdown for factual statements (regex/heuristic)
   - An agent prompt that asks the LLM to extract claims from article + scene-data
2. Design the evidence-pack generation — either:
   - A script that calls search-sources + web-access to find supporting evidence per claim
   - An agent prompt that does research per claim and outputs structured JSON
3. Add a context pointer in AGENTS.md or a skill: "When user says 'audit'/'verify claims'/'fact-check this content', load the audit pipeline"

## Suggested skills

- `grill-with-docs` — to stress-test the design before implementing
- `to-spec` — to turn the design into a spec
- `to-tickets` — to break the spec into tickets
- `implement` + `tdd` — for the actual implementation

## Relevant files

- `docs/research/pipeline-simplification-discussion.md` — Full discussion context
- `docs/archive/spec-research-evidence-pipeline.md` — Original spec (has the evidence schemas)
- `scripts/short-video/lib/research/` — All evidence modules
- `scripts/short-video/__tests__/research/` — All tests (143 passing)
- `scripts/short-video/research-pipeline.mjs` — CLI orchestrator with `--audit-only`
