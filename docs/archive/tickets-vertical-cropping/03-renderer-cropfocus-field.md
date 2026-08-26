# 03 — Renderer `cropFocus` Field + Validation

**What to build:** Add `cropFocus?: { x: number; y: number }` to `MediaField` in `types.ts`. Update `MediaBackground.tsx` to consume `cropFocus` for `objectPosition` (priority over deprecated `focus`). Update `media-bg.mjs` `validateMedia` to validate `cropFocus` numeric bounds `[0, 1]`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `types.ts`: added `cropFocus?: { x: number; y: number }` to `MediaField` with JSDoc.
- [x] `MediaBackground.tsx`: `objectPosition` = `cropFocus ? \`${cropFocus.x * 100}% ${cropFocus.y * 100}%\` : FOCUS_MAP[media.focus ?? "center"] ?? "center"`. When `cropFocus` absent, falls back to existing `focus` logic (backward compat).
- [x] `media-bg.mjs` `validateMedia`: added `cropFocus` validation — type check (object), numeric check (x and y numbers), range check ([0, 1]).
- [x] `media-bg.test.mjs` extended: 8 new `cropFocus` tests — valid, boundary, out-of-range (x>1, x<0, y>1), string type, non-object. (58 total passing)
- [x] `MediaBackground.tsx` typecheck passes: `npx tsc --noEmit` in `remotion/` dir — no errors.
- [x] All tests pass: `npx vitest run scripts/short-video/__tests__/media-bg.test.mjs` (58 passed)
