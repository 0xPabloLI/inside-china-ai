/**
 * Human pacing for the TikTok Studio publish path (#1013).
 *
 * The defect this replaces: every wait in `tiktok-upload-prep.mjs` was a bare
 * literal (700 / 2500 / 9000 / 10000 / 1200 / …). Human pauses are random;
 * fixed intervals are a fingerprint. Keeping the values here instead of inline
 * makes the "no naked duration" rule machine-checkable: the test suite asserts
 * every entry is `[base, spread]` with a spread of at least 20% of the base,
 * and that the driver references each key. A new literal in the driver has no
 * home here, so it fails the shape test.
 *
 * Durations are milliseconds. `spread` is a symmetric ± around `base`.
 */

/** Every fixed-duration wait in the upload driver, as [base, spread]. */
export const PUBLISH_PACING = Object.freeze({
  dryRunReachability: [9000, 2000],
  uploadPageOpen: [10000, 2500],
  captionFieldSelect: [600, 200],
  captionSettleAfterTyping: [900, 250],
  aigcExpand: [1200, 350],
  aigcTagSettle: [800, 250],
  aigcConfirmSettle: [1500, 400],
  soundAttached: [3000, 800],
  clipSelect: [2500, 700],
  volumeClick: [1500, 400],
  publishScroll: [1500, 400],
  warmupPageLoad: [4500, 1500],
  warmupDwell: [3500, 1200],
  warmupToUpload: [8000, 2000],
  poll: [4000, 1200],
  reviewLeadIn: [1200, 400],
  /** Standing still on the player before pressing play, like a person sizing up the clip. */
  reviewBeforePlay: [1500, 500],
});

/**
 * Bounds for the pre-publish review playback. A creator watches a stretch of
 * the finished clip, not a fixed number of seconds.
 */
export const REVIEW_WATCH_MS = Object.freeze([5000, 15000]);
