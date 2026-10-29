/**
 * Hook media quality checks (#299).
 *
 * The hook is the first 3 seconds and asset-sourcer structurally skips it, so
 * its media is curated by hand. Two gates judge it: preflight
 * (`scene-rules.mjs` → `checkHookMediaContract`, before sourcing) and the
 * final media gate (`final-media-gate.mjs`, after sourcing/generation). Both
 * must apply the same fit/overlay/source contract — render-only / rerender /
 * realign-render only see the latter, so a `fit:"contain"` hook must not slip
 * through there.
 *
 * Pure: no filesystem, no imports. `media` is a non-null MediaField object
 * (the callers handle the missing / `media: null` cases).
 *
 * @module hook-media
 */

/**
 * Check one hook's media binding against the curation contract.
 *
 * @param {Record<string, any>} media - non-null scene.media object
 * @returns {{failures: Array<{check: string, detail: string, fix: string}>,
 *            warnings: Array<{check: string, detail: string, fix: string}>}}
 */
export function checkHookMediaQuality(media) {
  const failures = [];
  const warnings = [];
  const m = media ?? {};

  // "cover" keeps the 9:16 frame filled and stays the default; an omitted fit
  // is valid because the renderer defaults to cover. "contain" was a FAILURE
  // until 2026-10-29 and is now allowed — see below.
  //
  // The old rule rejected contain because it "letterboxes". That premise only
  // holds when cover is available as the alternative: cover fills the frame by
  // CUTTING it, and for a 16:9 source in the hook's full-frame 1080x1920 box
  // that means scaling 1.78x and showing 31.6% of the source width — 68.4% of
  // the picture is discarded. The user rejected that outright ("这个是我不能
  // 接受的"), so for a film whose body is already composed as a letterbox the
  // hook must be allowed to match it. A letterboxed hook is consistent with a
  // letterboxed body; a cover hook in front of a contain body is not, and that
  // inconsistent switch at t=3.4s is worse than either choice alone.
  //
  // fill/none remain failures: they distort the frame rather than fitting it.
  if (m.fit != null && m.fit !== "cover" && m.fit !== "contain") {
    failures.push({
      check: "Hook media fit",
      detail: `Hook media fit "${m.fit}" is not supported (fill/none distort the frame; anything else is likely a typo)`,
      fix: 'Set fit:"cover" (fills the frame by cropping) or fit:"contain" (letterboxes the whole picture), or omit fit to default to cover',
    });
  }

  // A missing overlay uses the renderer's 0.7 default; an explicit value
  // outside the legibility band risks the bigNumber/numberLabel text.
  if (
    m.overlay !== undefined &&
    m.overlay !== null &&
    (typeof m.overlay !== "number" ||
      !Number.isFinite(m.overlay) ||
      m.overlay < 0.4 ||
      m.overlay > 0.9)
  ) {
    warnings.push({
      check: "Hook media overlay",
      detail: `Hook media overlay ${m.overlay} is outside [0.4, 0.9] — bigNumber/numberLabel legibility is at risk`,
      fix: "Set overlay between 0.4 and 0.9 (the renderer defaults to 0.7 when omitted)",
    });
  }

  if (!m.source) {
    warnings.push({
      check: "Hook media source",
      detail: "Hook media has no source — a manually bound file needs attribution",
      fix: "Add media.source (official page, model card, or stock provider)",
    });
  }

  return { failures, warnings };
}
