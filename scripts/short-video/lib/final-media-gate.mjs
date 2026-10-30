/**
 * Shared final-media gate.
 *
 * Media-dependent layouts (media-overlay / media-bottom-bar / media-split) build
 * their typography around a media layer; without media the frame collapses into
 * an empty middle band — which is exactly what qwen4 Scene 9 shipped.
 *
 * The gate runs AFTER the asset-sourcing step, never at preflight: preflight
 * (verify-video.mjs --pre) sits before Step 1.5, so failing there would block
 * the one mechanism that can supply the missing file. Every render entry point
 * (main.mjs after sourcing, render-only.mjs, rerender.mjs, rerender-full.mjs,
 * realign-render.mjs before rendering) calls this same function so the paths
 * cannot drift apart.
 *
 * The hook (#299) is enforced independently of its layout: preflight only warns
 * for generation strategies, so this gate is where "generation did not land"
 * becomes a failure. An explicit `media: null` hook passes with a warning.
 *
 * Existence is not integrity (#759): once a file is present this gate opens it
 * and judges the bytes (zero-byte, truncated, placeholder, wrong container),
 * then validates any declared `media.provenance` geometry and, since #758,
 * reconciles its `clip × scale` with the file's real pixel size. Provenance is
 * demanded only from media the scene marks as evidence (`media.evidence: true`)
 * — #758 is the producer that attaches one; an unmarked asset without
 * provenance keeps its current pass-through behaviour, while one that declares
 * provenance is judged like any other. A scene type that renders no media
 * layout is still checked when it declares a file, because
 * `mode: "fullscreen"` bypasses the layout dispatch.
 */
import { existsSync } from "fs";
import { resolve, sep } from "path";
import { DEFAULT_NARRATIVE_LAYOUT } from "./text-slots.mjs";
import { NO_MEDIA_TYPES } from "./claim-keywords.mjs";
import { checkHookMediaQuality } from "./hook-media.mjs";
import {
  inspectMediaFile,
  shown,
  validateProvenance,
  validateProvenancePixels,
} from "./media-integrity.mjs";
// Re-export: existing consumers import NO_MEDIA_TYPES from this module.
export { NO_MEDIA_TYPES };

/** Layouts whose text placement assumes a media layer fills the frame. */
export const MEDIA_DEPENDENT_LAYOUTS = new Set([
  "media-overlay",
  "media-bottom-bar",
  "media-split",
]);

/** Resolve the layout a scene will actually render with. */
function effectiveLayout(scene) {
  if (scene.layout) return scene.layout;
  return scene.visualType === "narrative" ? DEFAULT_NARRATIVE_LAYOUT : null;
}

/**
 * Absolute path for a scene's `media.path`, or null when it leaves the pack.
 *
 * Existence used to be the gate's only question, so a joined `existsSync` was
 * harmless. The gate now opens and reads the file (#759), which turns a `../`
 * or an absolute path in scene data into "read some other file and report on it
 * as if it were the asset" — so the path has to stay inside `contentDir`.
 */
function mediaAbsolutePath(contentDir, mediaPath) {
  const root = resolve(contentDir);
  const abs = resolve(root, mediaPath);
  return abs === root || abs.startsWith(root + sep) ? abs : null;
}

/** The three states a declared media path can be in. */
function mediaPathState(contentDir, mediaPath) {
  const abs = mediaAbsolutePath(contentDir, mediaPath);
  if (abs === null) return "escaping";
  return existsSync(abs) ? "present" : "absent";
}

const escapeFinding = (path, contentDir) => ({
  reason: "broken-media",
  code: "path-escapes-content-dir",
  path,
  detail: `media.path resolves outside the content dir (${contentDir}) — the gate reads the asset, so it will not follow the path out of the pack`,
});

/**
 * Judge a media file that is already present on disk: bytes first, then the
 * provenance geometry the scene declares for it.
 *
 * `assetNeed` is deliberately not a marker: `claim-keywords`, `vlm-cache` and
 * `vlm_analyzer.py` all read it as a search-query string, so an object shape
 * here would fork a contract #758 has not decided.
 *
 * @returns {{failures: Array<{reason: string, code?: string, path: string, detail: string}>,
 *            warnings: Array<{reason: string, path: string, detail: string}>}}
 *          failures are empty when the asset is usable.
 */
function inspectPresentMedia(scene, contentDir, probeVideo) {
  const media = scene.media;
  const path = media.path;
  const abs = mediaAbsolutePath(contentDir, path);
  if (abs === null) return { failures: [escapeFinding(path, contentDir)], warnings: [] };
  const verdict = inspectMediaFile(abs, {
    declaredType: media.type,
    probeVideo,
  });
  if (!verdict.ok) {
    return {
      failures: [{ reason: "broken-media", code: verdict.code, path, detail: verdict.detail }],
      warnings: [],
    };
  }

  // Flag integrity before geometry: a marker that reads as "evidence" to an
  // author but means nothing to this check would switch the requirement off
  // silently, and a valid provenance next to it must not hide that (#759 r3).
  // Absent, `null` and `false` all mean "not evidence" — the falsey pair matches
  // the `media: null` waiver idiom (#191), so an explicit "no" stays a no.
  if (media.evidence === true) {
    if (!media.provenance) {
      return {
        failures: [
          {
            reason: "missing-provenance",
            path,
            detail:
              "a capture marked evidence:true must record sourceUrl, selector, rect, clip and scale so its geometry can be verified",
          },
        ],
        warnings: [],
      };
    }
  } else if (media.evidence !== undefined && media.evidence !== null && media.evidence !== false) {
    return {
      failures: [
        {
          reason: "invalid-evidence-flag",
          path,
          detail: `media.evidence must be the boolean true, got ${shown(media.evidence)} (${typeof media.evidence}) — anything else silently switches the provenance requirement off`,
        },
      ],
      warnings: [],
    };
  }

  const warnings = [];
  if (media.provenance) {
    const { ok, errors } = validateProvenance(media.provenance);
    if (!ok) {
      return {
        failures: [{ reason: "invalid-provenance", path, detail: errors.join("; ") }],
        warnings: [],
      };
    }
    // #758: the declaration must also match the pixels. Applied whenever
    // provenance is present, not only for evidence media — #759 already
    // validates any declared provenance, and a wrong geometry on an unmarked
    // scene is the same wrong claim a reader would see in the frame.
    const pixels = validateProvenancePixels(media.provenance, verdict);
    if (!pixels.ok) {
      return {
        failures: [{ reason: "provenance-pixel-mismatch", path, detail: pixels.errors.join("; ") }],
        warnings: [],
      };
    }
    if (media.provenance.composed === true) {
      // The legacy opt-out passes by design; a silent skip is how it survives
      // forever, so every run names the scene that bypassed the reconciliation.
      warnings.push({
        reason: "composed-provenance",
        path,
        detail:
          "pixel reconciliation is skipped for a declared composition (composed: true) — the file is a hand-composed banner, not a raw element capture",
      });
    }
  }

  return { failures: [], warnings };
}

/**
 * Push one scene's media findings into the failure list. One writer for the
 * layout branches, so they cannot drift; the hook branch reads the list itself
 * because only an unreadable file lets it skip the curation contract.
 *
 * @returns {number} findings pushed — truthy means "this scene is done".
 */
function pushMediaFindings(failures, warnings, scene, layout, contentDir, probeVideo) {
  const found = inspectPresentMedia(scene, contentDir, probeVideo);
  for (const f of found.failures) failures.push({ sceneId: scene.id, layout, ...f });
  for (const w of found.warnings) warnings.push({ sceneId: scene.id, layout, ...w });
  return found.failures.length;
}

/**
 * Check that every scene has the media its layout needs.
 *
 * @param {{scenes: Array<Record<string, any>>, contentDir: string,
 *          probeVideo?: (absPath: string) => {width: number, height: number}|null}} input
 *        `probeVideo` is a test seam; production uses the real ffprobe probe.
 * @returns {{pass: boolean, failures: Array<{sceneId: number, layout: string|null, reason: string, code?: string, path?: string, detail?: string}>, warnings: Array<object>}}
 */
export function checkFinalMedia({ scenes, contentDir, probeVideo }) {
  const failures = [];
  const warnings = [];

  for (const scene of scenes ?? []) {
    // Scene types that render no media layout are still checked when they
    // declare a file: `ShortVideo.tsx` dispatches `media.mode:"fullscreen"`
    // before any layout branch, so a broken asset here reaches the frame (#759).
    // An *absent* file stays the CSS fallback it always was — the renderer's own
    // `validateMedia` warns and paints a background, so demanding presence here
    // would change #191-era behaviour beyond this ticket.
    if (NO_MEDIA_TYPES.has(scene.visualType)) {
      if (scene.media?.path) {
        const state = mediaPathState(contentDir, scene.media.path);
        if (state === "escaping") {
          failures.push({
            sceneId: scene.id,
            layout: null,
            ...escapeFinding(scene.media.path, contentDir),
          });
        } else if (state === "present") {
          pushMediaFindings(failures, warnings, scene, null, contentDir, probeVideo);
        }
      }
      continue;
    }

    const layout = effectiveLayout(scene);
    const mediaPath = scene.media?.path;
    const optOut = scene.mediaOptOut === true;

    // Hook enforcement is layout-independent (#299). The hook is the first 3
    // seconds: a CSS-only hook is acceptable only as an explicit waiver, so it
    // passes with a warning; anything else without a landed file fails — this
    // is the last chance after sourcing/generation has run.
    if (scene.visualType === "hook") {
      if (scene.media === null) {
        warnings.push({ sceneId: scene.id, layout, reason: "explicit-null-on-hook" });
        continue;
      }
      const hookState = mediaPath ? mediaPathState(contentDir, mediaPath) : "absent";
      if (hookState === "escaping") {
        failures.push({ sceneId: scene.id, layout, ...escapeFinding(mediaPath, contentDir) });
        continue;
      }
      if (!mediaPath || hookState === "absent") {
        failures.push({
          sceneId: scene.id,
          layout,
          reason: "missing-hook-media",
          path: mediaPath,
        });
        continue;
      }
      // An unreadable hook file is the more specific failure — reporting the
      // curation contract on top of it sends the fix the wrong way. Declaration
      // findings (provenance, evidence flag) do NOT excuse the contract: a hook
      // with intact bytes must still fail fit:"contain" (#759 round 3).
      const mediaFindings = inspectPresentMedia(scene, contentDir, probeVideo);
      for (const f of mediaFindings.failures) failures.push({ sceneId: scene.id, layout, ...f });
      for (const w of mediaFindings.warnings) warnings.push({ sceneId: scene.id, layout, ...w });
      if (mediaFindings.failures.some((f) => f.reason === "broken-media")) continue;
      // The file landed — now enforce the same curation contract as preflight
      // (#299), so a fit:"contain" hook cannot render through the paths that
      // skip scene-rules (render-only / rerender / rerender-full / realign).
      const quality = checkHookMediaQuality(scene.media);
      for (const f of quality.failures) {
        failures.push({
          sceneId: scene.id,
          layout,
          reason: "hook-media-quality",
          detail: f.detail,
        });
      }
      for (const w of quality.warnings) {
        warnings.push({
          sceneId: scene.id,
          layout,
          reason: "hook-media-quality",
          detail: w.detail,
        });
      }
      continue;
    }

    if (MEDIA_DEPENDENT_LAYOUTS.has(layout)) {
      // Explicit media:null is a deliberate "no media ever" declaration
      // (#191): it passes, but the frame will render an empty band — warn so
      // the choice stays visible.
      if (scene.media === null) {
        warnings.push({ sceneId: scene.id, layout, reason: "explicit-null-on-media-layout" });
        continue;
      }
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
      const layoutState = mediaPath ? mediaPathState(contentDir, mediaPath) : "absent";
      if (layoutState === "escaping") {
        failures.push({ sceneId: scene.id, layout, ...escapeFinding(mediaPath, contentDir) });
        continue;
      }
      if (!mediaPath || layoutState === "absent") {
        failures.push({ sceneId: scene.id, layout, reason: "missing-media", path: mediaPath });
        continue;
      }
      pushMediaFindings(failures, warnings, scene, layout, contentDir, probeVideo);
      continue;
    }

    // CSS-only layouts are legitimate without media — an explicit opt-out must
    // pass cleanly, with no lingering warning. A media path that IS declared
    // still has to be a usable file (#759).
    if (mediaPath) {
      const cssState = mediaPathState(contentDir, mediaPath);
      if (cssState === "escaping") {
        failures.push({ sceneId: scene.id, layout, ...escapeFinding(mediaPath, contentDir) });
      } else if (cssState === "absent") {
        failures.push({ sceneId: scene.id, layout, reason: "missing-media", path: mediaPath });
      } else {
        pushMediaFindings(failures, warnings, scene, layout, contentDir, probeVideo);
      }
    }
  }

  return { pass: failures.length === 0, failures, warnings };
}

/**
 * Per-scene provenance for a missing-media failure (#986).
 *
 * `mediaStrategy` comes from the scene; the b-roll report says how the
 * generation rung ended. Both are optional: render-only entry points pass
 * neither, so their failure lines stay exactly as they were. The report is
 * keyed by String(scene.id) — the shape the orchestrator writes.
 */
function sceneMediaContext(failure, { scenes = null, brollReport = null } = {}) {
  // No context = render-only / rerender caller: keep the bare line.
  if (!scenes && !brollReport) return "";
  // Only layouts that require media can be judged this way: a CSS-only layout
  // that still declares a stale path also fails as missing-media, but it does
  // not need sourcing/generation and must not be labelled as a chain scene.
  if (failure.reason !== "missing-media" || !MEDIA_DEPENDENT_LAYOUTS.has(failure.layout)) {
    return "";
  }
  const scene = (scenes ?? []).find((s) => String(s.id) === String(failure.sceneId));
  const entry = brollReport?.scenes?.[String(failure.sceneId)] ?? null;
  // A chain entry carries `auto: true`; its scene may have no mediaStrategy at
  // all. `asset` is the legacy spelling of the same default chain (#355).
  const declared = scene?.mediaStrategy ?? null;
  const strategy = !declared || declared === "asset" ? "default chain" : declared;
  const bits = [];
  if (strategy) bits.push(`mediaStrategy: ${strategy}`);
  if (entry?.status) {
    bits.push(`b-roll: ${entry.status}${entry.round ? ` · round ${entry.round}` : ""}`);
  }
  return bits.length > 0 ? ` [${bits.join("; ")}]` : "";
}

/**
 * Recovery paths for a Step 1.6 miss (#986). Every rung has already run, so
 * the operator needs the next action, not a restatement of the symptom.
 * Only missing media earns this block: a hook waiver, a broken file or an
 * invalid provenance each already name their own fix, and adding "regenerate"
 * there would point at the wrong repair.
 *
 * Returned as lines (not part of the failure list) so callers without context
 * — render-only / rerender / realign — keep the previous output.
 */
function mediaRecoveryLines(
  failures,
  { contentDir = null, scenes = null, brollReport = null } = {},
) {
  // No context means a render-only / rerender entry point. Those callers print
  // the same gate result with the old, bare wording; the recovery block is a
  // Step 1.6 affordance, not a change to every failure surface.
  if (!scenes && !brollReport && !contentDir) return [];
  // A CSS-only layout with a stale media.path fails as missing-media too, but
  // rerunning sourcing/generation cannot fix it — the path should be removed.
  // The recovery ladder only applies to layouts that actually need media.
  const missing = failures.filter(
    (f) => f.reason === "missing-media" && MEDIA_DEPENDENT_LAYOUTS.has(f.layout),
  );
  if (missing.length === 0) return [];
  const dir = contentDir || "<dir>";
  const firstId = missing[0].sceneId;
  const missingIds = new Set(missing.map((f) => String(f.sceneId)));
  // "source-only" is the one strategy step 2 cannot honour: it never generates.
  // Say so instead of sending the operator into a stage that will plan zero jobs.
  const sourceOnly = (scenes ?? []).some(
    (s) => missingIds.has(String(s.id)) && s.mediaStrategy === "source-only",
  );
  // Escalated means the round cap is spent: rerunning the stage refuses before
  // any GPU work, so the message must give the reset instead of repeating the
  // action that already failed.
  const escalated = missing.some(
    (f) => brollReport?.scenes?.[String(f.sceneId)]?.status === "escalated",
  );
  return [
    "",
    "Recovery:",
    ...(escalated
      ? [
          "  Escalated scenes have spent the 3-round cap: remove the scene's entry from the b-roll report (or delete the report) before rerunning — the stage refuses without this reset.",
        ]
      : []),
    "  1. Rerun the pipeline — Step 1.5 re-enters sourcing for chain / asset-then-* scenes and generation for b-roll / ai-image scenes.",
    `  2. Rewrite the prompt, then regenerate: node scripts/short-video/generate-broll.mjs --content ${dir} --scene ${firstId} [--approve-auto]`,
    "     A chain scene (no explicit mediaStrategy) needs --approve-auto (and a larger --auto-budget if the plan marked it budget-skipped). BROLL_MODEL=fastmetal-1.3b switches tiers manually — there is no automatic 5B → 1.3B failover.",
    ...(sourceOnly
      ? [
          "     Source-only scenes never generate: change mediaStrategy to b-roll / ai-image (or bind scene.media) before this step.",
        ]
      : []),
    "  3. Move the scene to a CSS-only layout (hero-center / stacked-cards) if it does not need media.",
  ];
}

/**
 * Human-readable report for the CLI.
 *
 * @param {object} result - `checkFinalMedia` output.
 * @param {object} [context] - Step 1.6 context (`scenes`, `brollReport`,
 *   `contentDir`). main.mjs passes it, so a missing-media line names the
 *   scene's strategy / b-roll status and the report ends with recovery paths.
 *   Render-only / rerender / realign callers omit it and keep byte-identical
 *   wording.
 */
export function formatFinalMediaFailures(result, context = {}) {
  if (result.pass) return "All scenes have the media they need.";

  const lines = result.failures.map((f) => {
    if (f.reason === "opt-out-on-media-layout") {
      return `  Scene ${f.sceneId}: layout "${f.layout}" needs media but the scene sets mediaOptOut — remove the opt-out or use a CSS-only layout`;
    }
    if (f.reason === "missing-hook-media") {
      if (f.path) {
        return `  Scene ${f.sceneId}: hook (first 3 seconds) media "${f.path}" not found — bind scene.media from the curated library, or set media:null for a deliberate CSS-only hook`;
      }
      return `  Scene ${f.sceneId}: hook (first 3 seconds) has no media — bind scene.media from the curated library, or set media:null for a deliberate CSS-only hook`;
    }
    if (f.reason === "hook-media-quality") {
      return `  Scene ${f.sceneId}: ${f.detail}`;
    }
    if (f.reason === "broken-media") {
      return `  Scene ${f.sceneId}: media "${f.path}" failed the integrity check — ${f.code}: ${f.detail}`;
    }
    if (f.reason === "invalid-provenance") {
      return `  Scene ${f.sceneId}: media "${f.path}" has invalid provenance — ${f.detail} (fix the declaration or recapture the element)`;
    }
    if (f.reason === "provenance-pixel-mismatch") {
      return `  Scene ${f.sceneId}: media "${f.path}" does not match its declared capture — ${f.detail} (recapture the element or correct clip/scale to the file's real size)`;
    }
    if (f.reason === "missing-provenance") {
      return `  Scene ${f.sceneId}: media "${f.path}" has no provenance — ${f.detail}`;
    }
    if (f.reason === "invalid-evidence-flag") {
      return `  Scene ${f.sceneId}: media "${f.path}" has an unusable evidence flag — ${f.detail} (only the boolean true demands provenance)`;
    }
    return `  Scene ${f.sceneId}: layout "${f.layout}" needs media${f.path ? ` — "${f.path}" not found` : " — no media declared"}${sceneMediaContext(f, context)}`;
  });

  return [
    `${result.failures.length} scene(s) would render without the media they need:`,
    ...lines,
    ...mediaRecoveryLines(result.failures, context),
  ].join("\n");
}

/**
 * Human-readable report for deliberate no-media declarations that still pass.
 * Returns "" when there are no warnings, so callers can `if (warnings.length)`.
 */
export function formatFinalMediaWarnings(result) {
  return (result.warnings ?? [])
    .map((w) => {
      if (w.reason === "explicit-null-on-hook") {
        return `Scene ${w.sceneId}: hook renders CSS-only (explicit media:null waiver)`;
      }
      if (w.reason === "explicit-null-on-media-layout") {
        return `Scene ${w.sceneId}: layout "${w.layout}" renders an empty band (explicit media:null)`;
      }
      if (w.reason === "hook-media-quality") {
        return `Scene ${w.sceneId}: ${w.detail}`;
      }
      if (w.reason === "composed-provenance") {
        return `Scene ${w.sceneId}: media "${w.path}" — ${w.detail}`;
      }
      return `Scene ${w.sceneId}: ${w.reason}`;
    })
    .join("\n");
}

/**
 * Print the gate's warnings through one reporter. Every entry point must call
 * this instead of re-implementing the `if (warnings.length) console.warn(...)`
 * block — a drifted copy is how a warning once went dead (#299 review).
 *
 * @param {object} gate - result from checkFinalMedia
 * @param {(text: string) => void} [warn] - injectable for tests
 * @returns {boolean} true when a warning block was printed
 */
export function reportFinalMediaWarnings(gate, warn = console.warn) {
  const text = formatFinalMediaWarnings(gate);
  if (!text) return false;
  warn(`⚠️  Media warnings:\n${text}\n`);
  return true;
}
