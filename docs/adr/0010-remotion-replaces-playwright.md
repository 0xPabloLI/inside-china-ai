# Video Rendering: Remotion Replaces Playwright Recording

The short video pipeline needs frame-accurate rendering of 9:16 vertical scenes (1080×1920) with animated text overlays, background media, brand watermark, burned-in subtitles, BGM, and scene transitions. Playwright screencast caused timing drift (50-200ms per scene), making karaoke subtitles impossible.

> **Status update (2026-09-02, decision 59, #147)**: the HTML/Playwright fallback described below has been fully retired — tooling archived to `scripts/short-video/retired-html-path/`, Remotion is the only renderer.

**Migrate to Remotion** as the video rendering engine. Remotion renders frames deterministically via server-side rendering (frame-accurate), supports composition of video/audio/images/animations in a single timeline, and provides `TransitionSeries` for scene transitions.

## Considered Options

- **FFmpeg-only rendering**: Maximum control, but text animation and layout in FFmpeg `drawtext`/`ass` filters is extremely limited. Complex layouts need CSS.
- **HTML + Playwright** (kept as legacy fallback): Frame-accurate timing is impossible with Playwright screencast — the API captures frames at variable intervals. Dual-track rendering: `--remotion` flag or `meta.renderer === "remotion"` → Remotion path; default → Playwright legacy path.
- **Motion Canvas**: Similar to Remotion but smaller community and ecosystem.

## Consequences

- Remotion project lives at `scripts/short-video/remotion/` with its own `package.json`.
- `render-remotion.mjs` orchestrates: build scene props JSON → `npx remotion render` → return MP4 path.
- `main.mjs` checks `meta.renderer` or `--remotion` flag to select rendering path.
- Post-processing (subtitles, BGM, loudness) is shared between both paths.
- Future scene types must be implemented as Remotion components (Playwright fallback optional).
