# 03 — Add `maxWidth` to HookScene text elements + centralize annotation params

**What to build:** Physical overflow prevention in HookScene for `hookText` (78px) and `revealText` (80px). Also: create a shared `ANNOTATION` constants object in `components/shared.ts` and refactor both HookScene and NarrativeScene to import from it instead of hardcoding.

**Blocked by:** 02 — NarrativeScene must be updated first (same file family, avoids merge conflicts).

**Status:** ready-for-agent

- [x] `ANNOTATION` constants object exists in `components/shared.ts` with `highlight`, `underline`, `circle` configs
- [x] `ANNOTATION.highlight.color` = `"rgba(245,158,11,0.15)"` (already the fixed value in NarrativeScene)
- [x] `ANNOTATION.highlight.padding` = `{ top: 2, bottom: 2, left: 6, right: 6 }`
- [x] `ANNOTATION.underline.strokeWidth` = `3`
- [x] `ANNOTATION.underline.padding` = `{ top: 4 }`
- [x] NarrativeScene imports `ANNOTATION` and uses it for `Highlight` component
- [x] HookScene imports `ANNOTATION` and uses it for `Underline` component
- [x] HookScene `hookText` container has `maxWidth: 756` and `overflow: hidden`
- [x] HookScene `revealText` container has `maxWidth: 756` and `overflow: hidden`
- [x] No hardcoded opacity/strokeWidth values remain in scene components
