/**
 * SenseTime Saudi smart school bus news video.
 * Uses shared templates so the render path stays aligned with the short-video pipeline.
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { withWatermark } from "../../lib/base-styles.mjs";
import { ctaScene, hookScene } from "../../lib/scene-templates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function generateScene(scene, duration) {
  const html =
    scene.visualType === "hook" ? hookScene(scene, duration, __dirname) : ctaScene(scene, duration);
  return withWatermark(html);
}
