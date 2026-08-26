---
name: web-deep-research
description: >
  Multi-source web research with citation tracking, evidence persistence, and structured
  report generation. Combines deep-research methodology (8-phase pipeline) with web-access
  fetching (Chrome CDP proxy) for reliable web content retrieval.
  Use when the user wants deep research, comprehensive analysis, research report,
  compare X vs Y, analyze trends, state of the art, or thorough investigation.
  Not for simple lookups, debugging, or questions answerable with 1-2 searches.
---

# Web Deep Research

Three-layer research: **8-phase methodology** (claim verification, evidence
persistence) + **fetching** from web-access (Chrome CDP proxy, low anti-bot,
login state) + **code verification** from local source inspection (grep,
read_file, codebase_search against installed packages and repo code).

## Dependencies

- **Methodology**: The 8-phase structure (SCOPE → PLAN → RETRIEVE → TRIANGULATE →
  SYNTHESIZE → CRITIQUE → REFINE → PACKAGE) is self-contained in this file.
- **Fetching**: Uses `web-access` skill for all web content retrieval. Load
  web-access skill before Phase 3. web-access decides the actual tool (CDP, Jina,
  curl, WebFetch, WebSearch) based on the target — this skill does not override
  its tool selection.
- **Code verification**: When the research topic involves a library, framework, tool,
  or any claim that can be verified against source code, inspect the local installed
  package or repo code in parallel with web retrieval. Use `grep`, `read_file`,
  `codebase_search`, `pip show <package>`, `inspect.getsource()` etc. This follows
  the AGENTS.md "事实性陈述双源验证" principle: verify against source before
  trusting web claims.
- **Angle templates**: Load [references/angles.md](references/angles.md) during
  Phase 2 for angle templates.

## Depth Tiers

Infer from context or ask: "How deep should this go?"

| Tier | Phases | Sources | Time | Use when |
|------|--------|---------|------|----------|
| Quick | SCOPE, RETRIEVE, PACKAGE | 5-10 | ~5 min | Quick overview, one question |
| Standard | SCOPE, PLAN, RETRIEVE, TRIANGULATE, SYNTHESIZE, PACKAGE | 10-20 | ~15 min | Default — balanced depth |
| Deep | All 8 phases | 20-35 | ~30 min | Critical decisions, comprehensive |

Default: **Standard** unless the user says "exhaustive", "comprehensive", or the topic is complex.

## Phase 1 — SCOPE

Define: what question are we answering? What's the success criterion — what would
a complete answer look like? Identify key terms, entities, and the domain.

**Completion criterion**: A one-sentence research question + 3-5 search keywords written down.

## Phase 2 — PLAN

Decide research angles. Load [references/angles.md](references/angles.md).
If the topic matches a section in angles.md, use those angles.
Otherwise, use the General / Cross-Domain section or generate 3-5 angles
from default perspectives (overview, technical, market, contrarian, primary sources).
After research, append proven-useful angles back to angles.md (see its
"Creating Custom Angle Templates" section).

Map each angle to 2-4 search queries.

**Completion criterion**: A list of angles, each with 2-4 search queries.

## Phase 3 — RETRIEVE

> **MANDATORY**: Load `web-access` skill BEFORE any retrieval. All URL discovery,
> search, page fetching, and content extraction goes through web-access — it
> decides the tool (CDP, Jina, curl, WebFetch, WebSearch, Brave API) based on the
> target. Do not reimplement its API calls, override its tool selection, or
> hardcode tool bans at this layer. web-access already handles: login state,
> JS rendering, anti-bot mitigation, and token-efficient extraction.

**Retrieval strategy per angle** (what to retrieve, not how — web-access
decides the tool):
1. Search to discover sources (open search engines, extract top results)
2. Extract article content from discovered URLs
3. For paywalled / anti-bot / JS-rendered sites: follow web-access's guidance
4. For independent angles, use sub-agents to parallelize. Each sub-agent
   loads web-access independently — no race condition (shared Chrome, different
   targetIds)
5. **Code verification track** (run in parallel with web retrieval when the topic
   involves code-verifyable claims):
   - Locate installed package: `pip show <package>`, `npm ls <package>`,
     `which <tool>`
   - Read source: `inspect.getsource()` (Python), `read_file` on `node_modules/`,
     `grep` for API/function signatures
   - Write a minimal smoke test to verify the claim (does the API work as the
     web source says?)
   - Record the file path + line number as a "code source" (Tier 1, same as
     official docs)

**Source quality hierarchy**:
- Tier 1: Official docs, primary sources, first-party APIs, peer-reviewed,
  **local source code** (file path + line number)
- Tier 2: Reputable media (Bloomberg, Reuters, FT, trade publications)
- Tier 3: Blog posts, community discussions, secondary write-ups
- Flag tier for every source. Triangulate Tier 1 when available; never cite Tier 3 alone for a factual claim.
- **Code sources override web sources**: When a web claim about library behavior
  contradicts what the local source code shows, the code wins. Note the discrepancy
  in the report ("Documentation says X, but source code at line Y shows Z").
  Web discussions reflect *reported* issues, not necessarily *fixed* state.

**Completion criterion**: Every angle has ≥3 sources extracted, with raw content
saved or summarized. Source URLs and quality tiers recorded.

## Phase 4 — TRIANGULATE

Cross-reference claims across sources. For each key claim:
- How many independent sources confirm it?
- Are they truly independent (not all citing the same origin)?
- Any contradictions? Record both sides.
- **Code-vs-web contradictions**: If a web source claims a library behaves a
  certain way but the local source code shows otherwise, flag it explicitly.
  Use the code as ground truth. Common cases: API was renamed/removed in a newer
  version, a "bug" was already fixed, a feature exists but is undocumented.

Red flag: multiple sources repeating the same claim without independent verification
(circular citation). Downgrade confidence.

Red flag: a web source describes library behavior but no one has verified against
actual source code. If code verification is feasible (package is installed), it
must be done before the claim reaches High confidence.

**Completion criterion**: Each key claim has a confidence level (High/Medium/Low)
with source count and independence assessment.

## Phase 5 — SYNTHESIZE

Draft the report. Prose-first (≥80%), not bullet lists. Each finding cites sources
inline [N]. Identify patterns, implications, and emergent insights beyond what
individual sources said.

**Completion criterion**: A complete draft with inline citations and a Sources section.

## Phase 6 — CRITIQUE (Deep tier only)

Read the draft adversarially:
- What's the weakest claim? Can it be strengthened or must it be hedged?
- What's missing — what angle didn't we cover?
- Are there contrarian views we dismissed too quickly?

**Completion criterion**: A list of 3-5 critique points, each with a fix (strengthen,
hedge, add source, or flag as open question).

## Phase 7 — REFINE (Deep tier only)

Apply critique fixes. Re-retrieve if new gaps identified (loop back to Phase 3
for specific gaps only — don't restart).

**Completion criterion**: All critique points addressed — either fixed in the text
or moved to Open Questions.

## Phase 8 — PACKAGE

Final output structure:

```markdown
# Deep Research: [Topic]

## Executive Summary
[2-3 paragraphs, key findings up front]

## Key Findings
1. [Finding with evidence and citations]
2. ...

## Detailed Analysis
[Themed sections with synthesis, not scrape summaries]

## Contrarian Views & Risks
[Counterarguments, limitations, failure modes]

## Open Questions
[What remains uncertain]

## Sources
1. [URL] — [one-line note] — [Tier 1/2/3]
2. ...
```

Save to the repo's research notes directory. Priority:

1. If the repo defines a research docs directory (e.g. `docs/research/`), use it.
   This project's convention: `<repo>/docs/research/<topic>-research.md`.
2. If the repo has `docs/research/` but no specific convention, use that directory.
3. If no convention exists or the working directory is unclear, ask the user
   before writing. Never default to `~/Documents/`.

Filename: kebab-case topic slug (e.g., `tiktok-color-best-practices.md`).

Report language priority:
1. User's explicit request (e.g. "用中文写")
2. Repo's documentation language convention
3. Current conversation language

English technical terms, commands, code identifiers, model names, and original
quotations may remain in English regardless of report language.

**Completion criterion**: Report saved to file. Sources list complete — every URL
used, no placeholders. User told the file path.

## Anti-patterns

- **Scrape-summary listing**: Don't paste raw scraped content. Synthesize.
- **Single-source claims**: No factual claim on Tier 2/3 alone. Find a second independent source or hedge explicitly.
- **Web-only for code-verifyable claims**: If a claim is about how a library/tool
  works and the package is locally installed, citing only web sources is an
  anti-pattern. Read the source code. "Stack Overflow says X" is not sufficient
  when you can `grep` the actual implementation.
- **Token flooding**: Don't read full page content into context. Extract the relevant
  passage, summarize the rest. Use web-access's extraction methods (check its SKILL.md)
  rather than dumping raw page content into the conversation.
- **Premature completion**: The research isn't done when you have sources — it's done
  when every claim is triangulated and the report synthesizes, not just lists.
