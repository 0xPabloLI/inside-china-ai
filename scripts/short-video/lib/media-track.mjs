/**
 * Media track (#225 optimization 1) — the media-side pipeline stages that
 * used to run serially before TTS, extracted verbatim from main.mjs so they
 * can run as a track concurrent with the voice track.
 *
 * Stages (in order): asset sourcing (1.5) → media-patch application (1.5c)
 * → media upscale (1.5b) → B-roll generation (1.5d).
 *
 * Contract preserved from main.mjs:
 *   - The track only touches scene media fields (media.path, b-roll
 *     assignments); it never reads or writes scene text, so it is safe to
 *     run against the same scenes array the voice track is consuming.
 *   - Every stage is non-blocking: a failure warns and continues. The track
 *     itself never rejects (unexpected errors keep each stage's try/catch).
 *   - The final media gate (1.6) is NOT part of the track — main.mjs runs
 *     it after both tracks join, when all media suppliers have had their
 *     turn.
 *
 * @module media-track
 */

import { existsSync, readFileSync } from "fs";
import { join, relative, resolve } from "path";
import { skipsMediaSourcing } from "./claim-keywords.mjs";

/**
 * Run the media track stages.
 *
 * @param {object} ctx
 * @param {Array} ctx.scenes - shared scene array (media fields mutated in memory)
 * @param {string} ctx.contentDir - content slug (e.g. "dh-pilot-qwen4")
 * @param {string} ctx.baseDir - scripts/short-video absolute dir (main.mjs __dirname)
 * @param {object|null} ctx.broll - loaded b-roll orchestrator module, or null
 * @param {object} [ctx.deps] - test seams overriding dynamic imports
 * @param {object} [ctx.prof] - optional profiler ({mark, end}) from main.mjs
 * @returns {Promise<void>}
 */
export async function runMediaTrack({ scenes, contentDir, baseDir, broll, deps = {}, prof = {} }) {
  const contentDirAbs = resolve(baseDir, "content", contentDir);

  // ── Stage 1.5: Asset sourcing (auto-search missing media) ──
  const scenesNeedingMedia = scenes.filter((s) => {
    if (skipsMediaSourcing(s)) return false;
    // A scene that chose pure b-roll must not spend the sourcing budget.
    if (broll && !broll.shouldSourceStock(s)) return false;
    if (!s.media?.path) return true; // No media field at all → needs sourcing
    const mediaPath = resolve(contentDirAbs, s.media.path);
    return !existsSync(mediaPath); // Media path set but file missing → needs sourcing
  });
  if (scenesNeedingMedia.length > 0) {
    console.log("🔍 Step 1.5: Auto-sourcing missing media assets...\n");
    prof.mark?.("step-1.5-sourcing", { track: "media" });
    try {
      const sourcerMain = deps.sourcerMain ?? (await import("./asset-sourcer.mjs")).main;
      await sourcerMain(["--content", contentDir]);
      console.log();
    } catch (e) {
      console.warn(`⚠️  Asset sourcing skipped: ${e.message}\n`);
    }
    prof.end?.("step-1.5-sourcing");
  }

  // ── Stage 1.5c: Apply media-patch.json to scenes (auto-assign sourced assets) ──
  // Memory-only mutation — does NOT write back to scene-data.mjs.
  {
    const patchPath = resolve(
      contentDirAbs,
      "..",
      "..",
      "output",
      contentDir,
      "media-patch.json",
    );
    prof.mark?.("step-1.5c-media-patch", { track: "media" });
    if (existsSync(patchPath)) {
      try {
        const patch = JSON.parse(readFileSync(patchPath, "utf-8"));
        // #199 2.5: normalizeMediaPatch accepts the {schemaVersion, patches}
        // envelope and the legacy top-level array.
        const { normalizeMediaPatch, applyAssignedMedia } = await import(
          "./apply-media-patch.mjs"
        );
        const assigned = normalizeMediaPatch(patch).filter(
          (p) => p.status === "assigned" && p.media?.path,
        );
        if (assigned.length > 0) {
          const r = applyAssignedMedia(scenes, assigned, contentDirAbs);
          for (const skip of r.skipped) {
            console.warn(
              `⚠️  Patched media skipped (scene ${skip.sceneId}): ${skip.reason}${skip.path ? ` — "${skip.path}"` : ""}`,
            );
          }
          for (const id of r.exhausted) {
            console.warn(
              `⚠️  Scene ${id}: mediaReject set and still no media (candidates rejected or none matched) — CSS-only fallback. Widen the search or clear the flag.`,
            );
          }
          if (r.applied > 0) {
            console.log(
              `📦 Step 1.5c: Applied ${r.applied} media assignments to scenes: ${r.appliedSceneIds.join(", ")}\n`,
            );
          } else {
            console.log(`📦 Step 1.5c: No new media to apply (all scenes already have media)\n`);
          }
        } else {
          console.log(
            `⚠️  Step 1.5c: 0 assets assigned in media-patch.json — continuing with CSS fallback\n`,
          );
        }
      } catch (e) {
        console.warn(`⚠️  Step 1.5c: Failed to apply media patch: ${e.message}\n`);
      }
    }
    prof.end?.("step-1.5c-media-patch");
  }

  // ── Stage 1.5b: Media upscale (auto-upscale sub-720p media) ──
  // Only processes confirmed media files (Cascade: selected first, then enhanced).
  const scenesWithMedia = scenes.filter((s) => s.media?.path);
  if (scenesWithMedia.length > 0) {
    console.log("🖼️ Step 1.5b: Checking media resolution for upscale...\n");
    prof.mark?.("step-1.5b-upscale", { track: "media" });
    try {
      const autoUpscaleIfNeeded =
        deps.autoUpscaleIfNeeded ?? (await import("./upscale.mjs")).autoUpscaleIfNeeded;
      let upscaledCount = 0;
      for (const scene of scenes) {
        if (!scene.media?.path) continue;
        const mediaPath = resolve(contentDirAbs, scene.media.path);
        const result = autoUpscaleIfNeeded(mediaPath);
        if (result.upscaled) {
          // Update scene to use the upscaled path (relative to content dir)
          scene.media.path = relative(contentDirAbs, result.path);
          upscaledCount++;
          console.log(`  Scene ${scene.id}: upscaled to ${result.path.split("/").pop()}`);
        }
      }
      if (upscaledCount === 0) {
        console.log("  All media already ≥720p — no upscale needed");
      }
      console.log();
    } catch (e) {
      console.warn(`⚠️  Media upscale skipped: ${e.message}\n`);
    }
    prof.end?.("step-1.5b-upscale");
  }

  // ── Stage 1.5d: B-roll generation (mediaStrategy opt-in scenes) ──
  // Runs after upscale on purpose: Tier A clips are 480x832 and must not be
  // handed to Real-ESRGAN. Winners are assigned in memory only — scene-data is
  // never rewritten.
  if (broll) {
    const pending = broll.scenesRequiringGeneration(scenes);
    if (pending.length > 0) {
      console.log(`🎬 Step 1.5d: Generating B-roll for ${pending.length} scene(s)...\n`);
      prof.mark?.("step-1.5d-broll", { track: "media" });
      try {
        const runBrollStage = deps.runBrollStage ?? broll.runBrollStage;
        const closeVisualAnalyzer =
          deps.closeVisualAnalyzer ?? (await import("./visual-analyzer.mjs")).closeVisualAnalyzer;
        let result;
        try {
          result = await runBrollStage({
            scenes,
            contentSlug: contentDir,
            contentDir: contentDirAbs,
            // Report lives beside media-patch.json, keyed by content dir (same
            // convention the standalone generate-broll.mjs entrypoint uses).
            outputDir: join(baseDir, "output", contentDir),
            onProgress: (line) => console.log(line),
          });
        } finally {
          await closeVisualAnalyzer();
        }
        if (result.depsError) {
          console.warn(`⚠️  Step 1.5d: B-roll skipped — ${result.depsError}\n`);
        } else {
          const { counts } = result;
          console.log(
            `🎬 Step 1.5d: B-roll ${counts.generated} generated, ${counts.cached} cached, ` +
              `${counts.failed} failed, ${counts.escalated} escalated, ${counts.skipped} skipped`,
          );
          if (result.reportFile)
            console.log(`   Report: ${relative(baseDir, result.reportFile)}`);
          if (counts.failed > 0 || counts.escalated > 0) {
            console.log(
              "   → Read the b-roll report, rewrite the failing prompts " +
                "(aiVideo.prompt 8-dimension / aiImage.prompt 6-dimension template) and rerun.",
            );
          }
          console.log();
        }
      } catch (e) {
        console.warn(`⚠️  Step 1.5d: B-roll stage failed: ${e.message}\n`);
      }
      prof.end?.("step-1.5d-broll");
    }
  }
}
