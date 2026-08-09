/**
 * DOM verification config for _test-fixtures/hook-standard.
 *
 * Loaded by verify-scene-dom.mjs. If this file is absent, the verifier
 * uses defaults (DEFAULT_ABSENT_CLASSES + empty singleOccurrence/wordFit).
 */
export const domConfig = {
  absentClasses: ["source-badge", "subscribe", "source-tag", "attribution"],
  singleOccurrence: {},
  wordFit: { 1: [".s-hook .focal-claim"], 2: [".s-hook .focal-number-label"] },
};
