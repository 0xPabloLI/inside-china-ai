# Spec: Text Overflow Prevention & Verification

## Problem Statement

Rendered videos show text content exceeding safe zone boundaries — long strings in NarrativeScene layout variants overflow their containers because no `maxWidth` constraint is applied. The existing frame analysis checks (`checkSafeZoneTop/Right/Bottom`) detect content in the TikTok UI boundary bands, but cannot detect text that overflows its container *within* the safe zone. Additionally, `Highlight` annotations use excessive opacity (0.4) making text unreadable, and the static regression test has false positives from matching `padding` values.

## Solution

Two-layer defense against text overflow:

1. **Component layer (physical constraint)**: Add `maxWidth` + `overflow: hidden` to all text containers in NarrativeScene (4 layout variants) and HookScene. This makes overflow physically impossible at render time.

2. **Pixel layer (verification detection)**: Add `checkTextOverflow` to `frame-analysis.mjs` — a row-scan function that detects bright pixel spans exceeding the theoretical content width within the safe zone. Integrated into `verify-remotion-frames.mjs` as a `warn`-level check.

Additionally: centralize annotation (Highlight/Underline) parameters, fix the regression test regex, and confirm BGM default-off behavior.

## User Stories

1. As a video producer, I want text to never overflow its container, so that all on-screen text is fully visible and readable.
2. As a video producer, I want the frame analysis to detect text overflow, so that I am warned before publishing a video with layout issues.
3. As a video producer, I want `Highlight` annotations to be subtle enough that text remains readable underneath, so that key terms are emphasized without obscuring them.
4. As a video producer, I want the regression test to not produce false positives from `padding` values, so that I trust the test results.
5. As a video producer, I want BGM to be off by default, so that I must explicitly opt in with `--bgm`.
6. As a developer, I want annotation parameters centralized in one place, so that adjusting them doesn't require hunting through multiple scene components.
7. As a developer, I want the `checkTextOverflow` function to be a pure function, so that it is trivially testable with synthetic PixelBuffers.
8. As a developer, I want the `checkTextOverflow` to report which rows overflow and by how many pixels, so that I can quickly locate the problematic text element.

## Implementation Decisions

### D1: `maxWidth` constraints per layout variant

Each NarrativeScene layout variant gets a `maxWidth` on its text container, calculated as the available content width minus padding:

| Variant | Container width | Padding | maxWidth |
|---------|----------------|---------|----------|
| `media-bottom-bar` | 820px (left:60, right:200) | 2×24px (SPACING.xl) | 772px |
| `media-split` | 420px (fixed width) | 2×20px (SPACING.xl) | 380px |
| `media-overlay` | 820px (left:60, right:200) | 2×32px (SPACING.2xl) | 756px |
| `stacked-cards` | 820px (left:60, right:200) | 2×32px (SPACING.2xl) | 756px |

HookScene: `Slot` component sets `left: SAFE_ZONES.left, right: SAFE_ZONES.right` (820px). `hookText` (78px font) and `revealText` (80px font) get `maxWidth: 756` (820 - 2×32px padding equivalent).

All text containers also get `overflow: hidden` as a physical overflow barrier.

### D2: `checkTextOverflow` function in `frame-analysis.mjs`

```typescript
function checkTextOverflow(
  buf: PixelBuffer,
  safeZones: { left: number, right: number, top: number, bottom: number }
): AnalysisResult
```

Algorithm:
1. Define the content region: `x ∈ [safeZones.left, width - safeZones.right]`, `y ∈ [safeZones.top, height - safeZones.bottom]`
2. For each sampled row (step = `SAMPLE_STEP`), find the leftmost and rightmost bright pixel (luminance > `BRIGHT_THRESHOLD`)
3. Compute the bright pixel span width: `rightmost - leftmost`
4. Theoretical max content width = `(width - safeZones.left - safeZones.right)` — this is the full safe-zone content width (820px)
5. If any row's bright span exceeds the theoretical max content width, report `warn` with the row number and overflow amount

Level: `warn` (not `fail`) — text overflow within the safe zone is a visual quality issue, not a TikTok UI occlusion issue.

Exempt regions: same as existing checks (brand bar, watermark, frame glow).

### D3: Annotation parameter centralization

Create a shared constants object in `components/shared.ts`:

```typescript
export const ANNOTATION = {
  highlight: {
    color: "rgba(245,158,11,0.15)",
    padding: { top: 2, bottom: 2, left: 6, right: 6 },
    progressRange: [20, 40],
  },
  underline: {
    strokeWidth: 3,
    padding: { top: 4 },
    progressRange: [20, 40],
  },
  circle: {
    progressRange: [15, 30],
  },
} as const;
```

NarrativeScene and HookScene import from this single source instead of hardcoding.

### D4: Regression test regex fix

Current regex `content.match(/bottom:\s*(\d+)/g)` matches any `bottom:` in the source, including `padding: ${SPACING.lg}px ${SPACING.xl}px` (if SPACING values were numeric literals — they're not currently, but the regex is fragile).

Fix: only match `bottom:` that appears in a CSS property context (preceded by a newline or semicolon), not inside template string interpolations. Use `content.match(/[\n;]\s*bottom:\s*(\d+)/g)` or equivalent.

### D5: BGM default-off confirmation

Current behavior is already correct: `const useBGM = process.argv.includes("--bgm")` — default off, explicit opt-in. No code change needed. Document this in the spec for traceability.

### D6: `runFrameAnalysis` integration

Add `checkTextOverflow` to the `runFrameAnalysis` return array, after the existing 5 checks.

## Testing Decisions

### Test seam

Primary seam: `frame-analysis.mjs` pure functions. This is the existing test seam — `__tests__/frame-analysis.test.mjs` already tests all 5 existing check functions using synthetic PixelBuffers (`solidBuffer`, `bufferWithRect`). New `checkTextOverflow` tests follow the same pattern.

Secondary seam: `remotion-safezone-regression.test.mjs` — static code analysis. Tests that the regex correctly matches/negates.

### What makes a good test

- Test external behavior (does the function detect overflow?), not implementation details (how it iterates pixels)
- Use synthetic PixelBuffers with known bright-pixel layouts
- Test boundary conditions: span exactly at max width, span 1px over, span well under

### Prior art

- `frame-analysis.test.mjs` — exact same pattern (solidBuffer, bufferWithRect helpers)
- `safe-zones.test.mjs` — safe zone invariant tests

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `remotion/src/scenes/NarrativeScene.tsx` | Add `maxWidth` + `overflow: hidden` to 4 layout variants; import ANNOTATION constants | Medium | Changes visual rendering of all NarrativeScene outputs. Verified by: existing frame analysis checks + new `checkTextOverflow`. Worst case: text gets clipped (visible in frame analysis as missing content). |
| `remotion/src/scenes/HookScene.tsx` | Add `maxWidth` to `hookText`/`revealText`; import ANNOTATION constants | Medium | Changes HookScene rendering. Same verification as above. |
| `remotion/src/components/shared.ts` | Add `ANNOTATION` constants object | Low | Pure addition, no existing code modified. |
| `lib/frame-analysis.mjs` | Add `checkTextOverflow` function + add to `runFrameAnalysis` | Low | Pure addition (new function), only change to existing function is appending to return array. |
| `verify-remotion-frames.mjs` | No code change (new check auto-included via `runFrameAnalysis`) | Low | No modification needed. |
| `__tests__/frame-analysis.test.mjs` | Add `checkTextOverflow` tests | Low | Pure addition. |
| `__tests__/remotion-safezone-regression.test.mjs` | Fix regex false positive | Low | Only regex pattern change. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Text fits within maxWidth | `checkTextOverflow` returns `pass` | Low | Bright pixel span ≤ content width |
| 2 | Text exceeds maxWidth by 1px | `checkTextOverflow` returns `warn` with overflow=1px | Low | Span = content width + 1 |
| 3 | Text exceeds maxWidth by 64px (observed real case) | `checkTextOverflow` returns `warn` with overflow=64px | Medium | Row scan detects the overflow |
| 4 | No text in content area (empty scene) | `checkTextOverflow` returns `pass` (no bright pixels = no overflow) | Low | countBrightPixels = 0, span = 0 |
| 5 | Text spans full safe-zone width (edge case) | `checkTextOverflow` returns `pass` (span = max width, not exceeding) | Low | Exact boundary |
| 6 | `Highlight` annotation with opacity 0.15 | Text readable underneath annotation | Low | Centralized in ANNOTATION constant |
| 7 | `Underline` annotation with strokeWidth 3 | Text readable, underline visible | Low | Centralized in ANNOTATION constant |
| 8 | NarrativeScene `media-bottom-bar` with long `result` text | Text clipped by `overflow: hidden`, no visible overflow | Medium | `maxWidth: 772` + `overflow: hidden` |
| 9 | NarrativeScene `media-split` with long text | Text clipped within 380px container | Medium | `maxWidth: 380` + `overflow: hidden` |
| 10 | NarrativeScene `media-overlay` top overlay with long badge text | Badge clipped within maxWidth | Low | `maxWidth: 756` |
| 11 | NarrativeScene `stacked-cards` with long card value | Card text clipped within maxWidth | Low | `maxWidth: 756` |
| 12 | HookScene `hookText` (78px) very long string | Text clipped within 756px | Medium | `maxWidth: 756` + `overflow: hidden` |
| 13 | HookScene with no `hookText` (only `bigNumber`) | No overflow possible (number is centered, short) | Low | N/A |
| 14 | BGM not specified (no `--bgm` flag) | No BGM mixed in, no warning in verify report | Low | Already correct behavior |
| 15 | Regression test scans `padding: ${SPACING.lg}px` | Regex does not match (SPACING is a token, not a literal) | Low | Fixed regex or already safe |
| 16 | Regression test scans `bottom: SAFE_ZONES.bottom` | Regex correctly matches `SAFE_ZONES.bottom` (770) and passes | Low | Already working |
| 17 | Frame with brand bar exempt region | `checkTextOverflow` ignores bright pixels in brand bar region | Low | Uses same exemptRegions mechanism |
| 18 | Frame with frame glow border | `checkTextOverflow` ignores glow pixels on edges | Low | Uses frameGlowExemptRegions |

## Out of Scope

- Automatic font size reduction to fit text (future enhancement)
- Text wrapping logic changes (CSS `word-break` / `overflow-wrap` — separate concern)
- Playwright path verification (Remotion only)
- Highlight/Underline animation timing changes (only opacity/strokeWidth centralized)
- BGM selection algorithm changes (only default-off behavior confirmed)

## Further Notes

- The `checkTextOverflow` is a **second line of defense** — the primary defense is `maxWidth` + `overflow: hidden` at the component level. If both layers work correctly, `checkTextOverflow` should always return `pass` in production. It catches regressions if someone removes `maxWidth` in the future.
- BGM default-off is already correct in `main.mjs` (line: `const useBGM = process.argv.includes("--bgm")`). No code change needed, confirmed for traceability.
