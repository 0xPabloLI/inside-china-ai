# Handoff: Documentation Hierarchy Review

> Created: 2026-08-15
> From session: F5 A/B test + last30days setup + architecture discussion
> To: Fresh session for documentation hierarchy audit

## Purpose

User wants to thoroughly review the project's documentation hierarchy:
1. Whether the current layer/tier system is being followed every time docs are written
2. Whether the current layer definitions need updating
3. Use `writing-for-agents` skill to check if it covers this requirement
4. User wants a custom local rule: split into "execution layer" vs "deep research layer"
5. User is unsure if this split is reasonable — needs discussion

## Current Documentation Hierarchy

Defined in `docs/DOCS-INDEX.md` Canonical Structure:

| Layer | What goes here | Who reads it |
|-------|---------------|-------------|
| **L0: AGENTS.md** (必读) | Pointers + top-level rules only. No technical details. | Agent every session start |
| **L1: Active reference** | `content-pipeline.md`, `video-workflow.md`, `brand-system.md`, `manual-ops.md`, `tanstack-lovable-conventions.md` | Loaded on-demand when doing that workflow |
| **L2: Deep technical** | `docs/tiktok/`, `docs/research/`, `docs/conventions/`, `docs/adr/` | Only when deep-diving into specific topic |
| **L3: Archive** | `docs/archive/` — completed work, no longer maintained | Historical reference only |

## Concrete Example That Triggered This Review

During F5 A/B testing, user asked where to record "potential unnaturalness points" (per-scene TTS generation → cross-scene coherence). Options:
- `docs/video-workflow.md` (L1) — too high-level, this is an observation/tracking item
- `docs/research/f5-tts-known-limitations.md` (L2) — appropriate level

User confirmed: L1 docs should only have "what params to use, how to configure". Observations/tracking belongs in L2.

## Questions To Discuss In Next Session

1. **Is the 4-layer model correct?** User proposes renaming to "execution layer" vs "deep research layer" — is this better than the current L0/L1/L2/L3 numbering?

2. **Is `writing-for-agents` skill sufficient?** Does it already require checking which layer a doc belongs to before writing? Or do we need a custom local rule?

3. **Compliance audit needed**: Review recent doc changes to see if the hierarchy was actually followed. Key files to check:
   - `docs/video-workflow.md` — does it contain content that should be in L2?
   - `docs/content-pipeline.md` — does it contain content that should be in L2?
   - `docs/research/` files — do any belong in L1?

4. **AGENTS.md pointers**: Are all L1 docs properly pointed to from AGENTS.md? Are L2 docs properly NOT pointed to (only referenced from L1 docs)?

## Suggested Skills

- `writing-for-agents` — load first, check if it covers doc hierarchy requirements
- `grill-with-docs` — use to stress-test the proposed layer model before committing

## Files Changed This Session (For Reference)

- `scripts/short-video/lib/assemble.mjs` — version retention 3→20, loudnorm toggle via TTS_NO_LOUDNORM
- `scripts/short-video/lib/tts/f5-mlx.mjs` — comments updated (prosody/highpass/denoise all disabled)
- `docs/research/media-asset-strategy.md` — B站/抖音 workaround updates
- `docs/handoffs/doc-hierarchy-review.md` — this handoff

## Context: A/B Test Results (For Reference)

| Version | highpass | denoise | loudnorm | mean_vol | max_vol | LUFS |
|---------|----------|---------|----------|----------|---------|------|
| f5-clean | ❌ | ❌ | ✅ | -16.9 dB | -1.3 dB | -16.76 |
| f5-ffmpeg | ✅ | ❌ | ✅ | -16.6 dB | -1.4 dB | -16.65 |
| f5-raw | ❌ | ❌ | ❌ | -19.8 dB | -0.4 dB | -19.63 |

Conclusion: highpass+denoise is no-op for F5. loudnorm solves inter-scene loudness inconsistency. **Best config = f5-clean (current default).**

## Context: last30days Setup Status

- `SETUP_COMPLETE=true` written to `~/.config/last30days/.env`
- Reddit + HN + GitHub + Polymarket: working (free, no API key)
- X: blocked on macOS Keychain popup (user needs to click "Always Allow" for "Chrome Safe Storage")
- Digg/arXiv/Techmeme CLI: failed (needs `brew install go`)
- ScrapeCreators key stored in `.env.local` (backup only, credits-based)
- last30days callable from CatPaw: `python3 ~/.agents/skills/last30days/scripts/last30days.py --emit=json --search "reddit,hackernews" --quick "话题"`

## Context: Architecture Decisions (For Reference)

- X search split by language: discover-trends.mjs searches X with Chinese keywords, last30days searches X with English keywords. Zero overlap.
- ScrapeCreators = backup only (limited credits). Not for daily use.
- Instagram has no free scraping method — only ScrapeCreators.
- TikTok content not scraped (we make TikTok videos, don't scrape TikTok).
