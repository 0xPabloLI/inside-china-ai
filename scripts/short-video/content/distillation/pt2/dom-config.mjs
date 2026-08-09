/**
 * DOM verification config for distillation/pt2.
 *
 * Loaded by verify-scene-dom.mjs. If this file is absent, the verifier
 * uses defaults (DEFAULT_ABSENT_CLASSES + empty singleOccurrence/wordFit).
 */
export const domConfig = {
  absentClasses: ["source-badge", "subscribe"],
  singleOccurrence: {},
  wordFit: { 1: [".s1 .big-text"], 7: [".s7 .big-text"] },
};
