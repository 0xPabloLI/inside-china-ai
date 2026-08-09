/**
 * DOM verification config for distillation/pt3.
 *
 * Loaded by verify-scene-dom.mjs. If this file is absent, the verifier
 * uses defaults (DEFAULT_ABSENT_CLASSES + empty singleOccurrence/wordFit).
 */
export const domConfig = {
  absentClasses: ["source-badge", "subscribe"],
  singleOccurrence: {},
  wordFit: { 1: [".s1 .big-text"], 8: [".s8 .line1", ".s8 .line2"] },
};
