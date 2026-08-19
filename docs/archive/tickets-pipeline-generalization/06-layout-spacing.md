# 06 — Vertical layout space-evenly + text concatenation fix

**What to build:** Scene layouts use `space-evenly` to distribute content across vertical bands instead of clumping in center. Text concatenation templates always include proper spacing between title and highlight spans.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `scene-layout.mjs` `slotCss()`: change `.slot-hero` and `.slot-kicker` from `justify-content: center` to `justify-content: space-evenly`
- [x] `.slot-support` stays `center` (usually single source line)
- [x] Fix `scene-templates.mjs`: add space between `${title}` and `<span class="card-highlight">` in all templates
- [x] Fix per-content `scenes.mjs` files: same space fix in per-content templates
- [x] New `checkTextConcatenation()` in `scene-rules.mjs`: detect on-screen text fields that when concatenated produce two uppercase words joined without space
- [x] Tests: title "STRATEGIC" + titleHighlight "BACKERS" → rendered as "STRATEGIC BACKERS" with space
- [x] Tests: layout uses space-evenly (CSS check in generated HTML)
- [x] Tests: checkTextConcatenation catches "STRATEGICBACKERS" pattern
- [x] Scenario matrix row 12 covered
