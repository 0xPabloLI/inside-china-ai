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

  // Only "cover" keeps the 9:16 frame filled; an omitted fit is valid because
  // the renderer defaults to cover. fill/none are CSS object-fit values that
  // distort the frame; anything else (e.g. "cvr") is a typo.
  if (m.fit != null && m.fit !== "cover") {
    failures.push({
      check: "Hook media fit",
      detail: `Hook media must use fit:"cover" — "${m.fit}" is not supported (contain letterboxes; fill/none and typos distort or crop the 9:16 frame)`,
      fix: 'Set fit:"cover" or omit fit (the renderer defaults to cover)',
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
