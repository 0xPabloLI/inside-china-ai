# 02 — Add `maxWidth` + `overflow: hidden` to NarrativeScene text containers

**What to build:** Physical overflow prevention in all 4 NarrativeScene layout variants. Each text container gets a `maxWidth` calculated from its available width minus padding, plus `overflow: hidden` as a hard barrier.

**Blocked by:** None — can start immediately (independent of ticket 01).

**Status:** ready-for-agent

- [x] `media-bottom-bar` text container has `maxWidth` and `overflow: hidden`
- [x] `media-split` text container has `maxWidth` and `overflow: hidden`
- [x] `media-overlay` top overlay has `maxWidth` and `overflow: hidden`
- [x] `media-overlay` bottom overlay has `maxWidth` and `overflow: hidden`
- [x] `stacked-cards` container has `maxWidth` and `overflow: hidden`
- [x] All maxWidth values reference SAFE_ZONES and SPACING tokens (not hardcoded literals where possible)
- [x] Existing safe zone regression tests still pass
