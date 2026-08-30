/**
 * Shared final-media gate.
 *
 * Media-dependent layouts (media-overlay / media-bottom-bar / media-split) build
 * their typography around a media layer; without media the frame collapses into
 * an empty middle band — which is exactly what qwen4 Scene 9 shipped.
 *
 * The gate runs AFTER the asset-sourcing step, never at preflight: preflight
 * (verify-video.mjs --pre) sits before Step 1.5, so failing there would block
 * the one mechanism that can supply the missing file. Both entry points —
 * main.mjs after sourcing, render-only.mjs before rendering — call this same
 * function so the two paths cannot drift apart.
 */
import { existsSync } from "fs";
import { join } from "path";
import { DEFAULT_NARRATIVE_LAYOUT } from "./text-slots.mjs";

/** Layouts whose text placement assumes a media layer fills the frame. */
export const MEDIA_DEPENDENT_LAYOUTS = new Set([
  "media-overlay",
  "media-bottom-bar",
  "media-split",
]);

/** Scene types that never render media (kept in sync with main.mjs Step 1.5). */
export const NO_MEDIA_TYPES = new Set(["cta", "data", "stat-reveal"]);

/** Resolve the layout a scene will actually render with. */
function effectiveLayout(scene) {
  if (scene.layout) return scene.layout;
  return scene.visualType === "narrative" ? DEFAULT_NARRATIVE_LAYOUT : null;
}

/**
 * Check that every scene has the media its layout needs.
 *
 * @param {{scenes: Array<Record<string, any>>, contentDir: string}} input
 * @returns {{pass: boolean, failures: Array<{sceneId: number, layout: string|null, reason: string, path?: string}>, warnings: Array<object>}}
 */
export function checkFinalMedia({ scenes, contentDir }) {
  const failures = [];
  const warnings = [];

  for (const scene of scenes ?? []) {
    if (NO_MEDIA_TYPES.has(scene.visualType)) continue;

    const layout = effectiveLayout(scene);
    const mediaPath = scene.media?.path;
    const optOut = scene.mediaOptOut === true;

    if (MEDIA_DEPENDENT_LAYOUTS.has(layout)) {
      // Opting out of media on a layout that depends on it is a contradiction,
      // not a gap sourcing could fix — surface it as its own reason.
      if (optOut) {
        failures.push({
          sceneId: scene.id,
          layout,
          reason: "opt-out-on-media-layout",
        });
        continue;
      }
      if (!mediaPath || !existsSync(join(contentDir, mediaPath))) {
        failures.push({ sceneId: scene.id, layout, reason: "missing-media", path: mediaPath });
      }
      continue;
    }

    // CSS-only layouts are legitimate without media — an explicit opt-out must
    // pass cleanly, with no lingering warning.
    if (mediaPath && !existsSync(join(contentDir, mediaPath))) {
      failures.push({ sceneId: scene.id, layout, reason: "missing-media", path: mediaPath });
    }
  }

  return { pass: failures.length === 0, failures, warnings };
}

/** Human-readable report for the CLI. */
export function formatFinalMediaFailures(result) {
  if (result.pass) return "All scenes have the media their layout needs.";

  const lines = result.failures.map((f) => {
    if (f.reason === "opt-out-on-media-layout") {
      return `  Scene ${f.sceneId}: layout "${f.layout}" needs media but the scene sets mediaOptOut — remove the opt-out or use a CSS-only layout`;
    }
    return `  Scene ${f.sceneId}: layout "${f.layout}" needs media${f.path ? ` — "${f.path}" not found` : " — no media declared"}`;
  });

  return [
    `${result.failures.length} scene(s) would render without the media their layout needs:`,
    ...lines,
  ].join("\n");
}
