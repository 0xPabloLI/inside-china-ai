# Retired HTML/Playwright render path (frozen archive)

The short-video pipeline originally rendered scenes twice: HTML/CSS templates
recorded by Playwright, and React components rendered by Remotion. On
2026-09-01 the HTML path was **retired** (decision 59,
`docs/archive/spec-text-overflow-hardening.md`, issue #147): an audit found 15/15 content
packs already on the Remotion renderer, making this path zero-consumer legacy.

These files are kept for reference only — **they are not imported, tested, or
maintained, and their relative imports/asset paths were not fixed up after the
move**. The live pipeline fails fast on any attempt to opt back in
(`--playwright` flag or `meta.renderer = "playwright"` — see
`lib/renderer-guard.mjs`).

| File                    | Former role                                                                |
| ----------------------- | -------------------------------------------------------------------------- |
| `scene-templates.mjs`   | HTML scene templates (hook/cta/narrative/…) + shared brand chrome           |
| `base-styles.mjs`       | Shared CSS bundle: keyframes, watermark, brand bar                          |
| `record-scenes.mjs`     | Playwright headless recording of each scene HTML to WebM                    |
| `verify-scene-dom.mjs`  | Step 2.5 DOM geometry gate (safe zones, overflow) — superseded by TextGate  |
| `load-dom-config.mjs`   | Per-content `dom-config.mjs` loader for the DOM verifier                    |
| `verify-template-sync.mjs` | CSS parity diff between HookScene.tsx and the HTML template              |

Remotion-side geometry enforcement now lives in `remotion/src/` TextGate +
`lib/text-geometry.mjs` (T4/T5 of the text-overflow hardening epic); scene
contracts live in `lib/text-slots.mjs`.
