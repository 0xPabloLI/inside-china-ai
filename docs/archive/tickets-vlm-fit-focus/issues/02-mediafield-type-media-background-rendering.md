# 02 — MediaField type + MediaBackground rendering

**What to build:** Extend `MediaField` with optional `fit` and `focus` fields. Update `MediaBackground.tsx` to consume them: `objectFit` reads `media.fit ?? "cover"`, `objectPosition` maps `media.focus` to CSS position values. Existing scene-data without these fields renders identically (backward compatible).

**Blocked by:** None — can start immediately (parallel with 01).

**Status:** ready-for-agent

- [ ] `types.ts`: `MediaField` adds `fit?: "cover" | "contain"` and `focus?: "top" | "center" | "bottom"`
- [ ] `MediaBackground.tsx`: `objectFit` from `media.fit ?? "cover"`
- [ ] `MediaBackground.tsx`: `objectPosition` from `focusMap[media.focus ?? "center"]`
- [ ] `focusMap` constant: `{ top: "center top", center: "center", bottom: "center bottom" }`
- [ ] Verify: existing scene-data (no fit/focus) renders identically to current behavior
- [ ] Verify: `fit: "contain"` produces letterbox with `#0a0a14` fill (no extra div)
- [ ] Verify: `focus: "top"` + `fit: "cover"` crops to preserve top of asset
