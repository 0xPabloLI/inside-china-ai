/**
 * DOM verification config for restraint/pt1.
 *
 * Loaded by verify-scene-dom.mjs. If this file is absent, the verifier
 * uses defaults (DEFAULT_ABSENT_CLASSES + empty singleOccurrence/wordFit).
 */
export const domConfig = {
  absentClasses: ["source-badge", "subscribe", "source-tag", "attribution"],
  singleOccurrence: { 4: ["PRICE CUT"] },
  wordFit: { 3: [".s3 .card .text"] },
};
