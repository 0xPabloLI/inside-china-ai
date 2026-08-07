/**
 * hook-standard test fixture — every scene delegates to the shared
 * templates (hookScene for visualType "hook", ctaScene otherwise), so
 * verify-scene-dom.mjs measures the STANDARD template geometry instead of
 * a hand-written scene (spec: docs/specs/spec-hook-opening-card.md).
 */

import { withWatermark } from "../../../lib/base-styles.mjs";
import { ctaScene, hookScene } from "../../../lib/scene-templates.mjs";

export function generateScene(scene, duration) {
  const html = scene.visualType === "hook" ? hookScene(scene, duration) : ctaScene(scene, duration);
  return withWatermark(html);
}
