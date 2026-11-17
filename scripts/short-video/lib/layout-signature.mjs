/**
 * Layout identity for experiment attribution.
 *
 * A pack's layout signature is the ordered list of each scene's visual
 * topology plus the information grammar it used. Two publishes with the same
 * signature rendered the same layout system; a signature change means the
 * comparison is no longer only about copy or footage.
 */

import { createHash } from "node:crypto";

export const INFO_LAYOUT_VERSION = "v2";

/**
 * One scene's identity segment.
 *
 * @param {object} scene
 * @returns {string}
 */
export function sceneLayoutKey(scene) {
  const visualType = scene?.visualType || "unknown";
  const layout = scene?.layout || "auto";
  const base = `${visualType}:${layout}`;
  if (scene?.info && typeof scene.info === "object") {
    const relationship = scene.info.relationship || "?";
    const chart = scene.info.chart || "?";
    return `${base}:${relationship}/${chart}`;
  }
  if (scene?.chart && typeof scene.chart === "object") return `${base}:pin`;
  return base;
}

/**
 * Stable 12-hex signature of the ordered layout keys.
 *
 * @param {Array<object>} scenes
 * @returns {string}
 */
export function layoutSignature(scenes) {
  const keys = (Array.isArray(scenes) ? scenes : []).map(sceneLayoutKey);
  return createHash("sha256").update(keys.join("|")).digest("hex").slice(0, 12);
}
