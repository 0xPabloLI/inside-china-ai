/**
 * Evaluate stock image relevance against scene content using VLM.
 *
 * For each scene with media.type === "image", runs analyzeAssetSemantics with
 * the scene's claim and reports a verdict. #294 changed three things:
 *
 *   1. The claim is `assetNeed` when the scene declares one — the same
 *      statement asset-sourcer scores — not a re-synthesis from texts. The old
 *      version asked the VLM a different question than asset-sourcer asked, so
 *      its verdicts could not explain the assignment decision.
 *   2. `null` is reported as UNAVAILABLE (tool outcome), not a failed image.
 *   3. A 40-59 score gets the same second-pass subject check the sourcer runs,
 *      and a `match` admits the image.
 *
 * A package may declare a repo-visible waiver:
 *
 *   export const metadata = {
 *     stockRelevanceExemption: {
 *       reason: "…why the bound images are deliberate…",
 *       scenes: [2, 3, 7],   // omit → whole package; one id or a list
 *     },
 *   };
 *
 * A malformed scene id is dropped and warned about; it never widens the
 * waiver to the whole package.
 *
 * Exempted scenes are still listed, but they leave the pass/fail tally. This
 * is the channel the 2026-10-14 decision asked for: the reason lives in
 * scene-data (reviewed with the code), not in the gitignored pipeline-status.
 *
 * The script still exits 0 on a failed verdict. Wiring a non-zero exit is a
 * separate decision (#294 comment, 2026-10-14): a hard gate on an
 * unsatisfiable criterion would block every package that uses general stock
 * photos for a specific claim.
 *
 * Usage: node scripts/short-video/evaluate-stock-relevance.mjs --content <slug>
 */
import { realpathSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeAssetSemantics, closeVisualAnalyzer } from "./lib/visual-analyzer.mjs";
import {
  BORDERLINE_FLOOR,
  DEFAULT_RELEVANCE_THRESHOLD,
  POOL_VERDICT,
  RELEVANCE_BAND,
  admissionSource,
  classifyPool,
  classifyRelevance,
  needsSecondPass,
} from "./lib/relevance-verdict.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const THRESHOLD = DEFAULT_RELEVANCE_THRESHOLD;
const REPORT_SCHEMA_VERSION = 2;

/** Report status per admission source. Anything unadmitted is a FAIL. */
const STATUS_BY_ADMISSION = { score: "PASS", "second-pass": "PASS (second-pass)" };

function getArg(argv, name) {
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : null;
}

/**
 * Build the claim for a scene that already has a bound image.
 *
 * `assetNeed` is the same statement of visual intent asset-sourcer scores, so
 * it wins whenever the scene declares one. The remaining branches exist only
 * for hand-bound legacy scenes the sourcer never touched (it sources nothing
 * without an `assetNeed`): a generation prompt is the next best statement of
 * intent, and texts are the last resort. This precedence describes the report,
 * not a sourcer fallback chain — the sourcer has none.
 *
 * @param {Object} scene
 * @returns {{claim: {voiceover: string, assetNeed: string}, claimSource: string}}
 */
export function buildClaim(scene) {
  const voiceover = scene?.voiceover ?? "";
  const assetNeed = typeof scene?.assetNeed === "string" ? scene.assetNeed.trim() : "";
  if (assetNeed) return { claim: { voiceover, assetNeed }, claimSource: "assetNeed" };

  const imagePrompt = typeof scene?.aiImage?.prompt === "string" ? scene.aiImage.prompt.trim() : "";
  if (imagePrompt) {
    return { claim: { voiceover, assetNeed: imagePrompt }, claimSource: "aiImage.prompt" };
  }

  const videoPrompt = typeof scene?.aiVideo?.prompt === "string" ? scene.aiVideo.prompt.trim() : "";
  if (videoPrompt) {
    return { claim: { voiceover, assetNeed: videoPrompt }, claimSource: "aiVideo.prompt" };
  }

  const t = scene?.texts || {};
  const parts = [
    t.badge,
    t.company,
    t.context,
    t.action,
    t.result,
    t.title,
    t.titleHighlight,
    t.detail,
  ].filter(Boolean);
  return { claim: { voiceover, assetNeed: parts.join(". ") }, claimSource: "texts" };
}

/**
 * Normalize `metadata.stockRelevanceExemption`.
 *
 * A string is a whole-package reason. An object requires a non-empty `reason`.
 * `scenes` omitted → whole package; a positive integer or an array of them →
 * exactly those scenes; `scenes: []` → explicitly no scenes.
 *
 * Malformed entries never widen the waiver: a non-integer id is dropped and
 * reported via `dropped`, so `scenes: ["6"]` waives nothing and says so
 * instead of quietly exempting the whole package.
 *
 * @param {Object|null|undefined} metadata
 * @returns {{reason: string, scenes: number[]|null, dropped: number}|null}
 */
export function normalizeExemption(metadata) {
  const raw = metadata?.stockRelevanceExemption;
  if (!raw) return null;
  const reason =
    typeof raw === "string" ? raw.trim() : typeof raw?.reason === "string" ? raw.reason.trim() : "";
  if (!reason) return null;

  const declared = typeof raw === "string" ? undefined : raw?.scenes;
  if (declared === undefined) return { reason, scenes: null, dropped: 0 };

  const list = Array.isArray(declared) ? declared : [declared];
  const scenes = list.filter((value) => Number.isInteger(value) && value > 0);
  return { reason, scenes, dropped: list.length - scenes.length };
}

/**
 * @param {number} sceneId
 * @param {{reason: string, scenes: number[]|null}|null} exemption
 */
export function isExemptScene(sceneId, exemption) {
  if (!exemption) return false;
  if (exemption.scenes === null) return true;
  return exemption.scenes.includes(sceneId);
}

/**
 * Evaluate one scene's bound image. The analyzer is injected so tests can
 * exercise the verdict logic without a VLM.
 *
 * @param {Object} scene
 * @param {string} contentDir
 * @param {(path: string, opts?: Object) => Promise<Object>} analyze
 */
export async function evaluateScene(scene, contentDir, analyze) {
  const assetPath = resolve(contentDir, scene.media.path);
  const { claim, claimSource } = buildClaim(scene);

  let first = null;
  let firstError = null;
  try {
    first = await analyze(assetPath, { claim });
  } catch (error) {
    firstError = error?.message ?? String(error);
  }

  const relevance = typeof first?.relevance === "number" ? first.relevance : null;
  const reason = first?.relevanceReason ?? first?.reason ?? null;
  const band = classifyRelevance(relevance, { threshold: THRESHOLD });

  let relevanceCheck = null;
  if (needsSecondPass({ relevanceScore: relevance }, { threshold: THRESHOLD })) {
    try {
      const check = await analyze(assetPath, { claim, relevanceCheck: true });
      relevanceCheck = {
        verdict: check?.subjectMatch ?? null,
        reason: check?.reason ?? check?.error ?? null,
      };
    } catch (error) {
      relevanceCheck = { verdict: null, reason: error?.message ?? String(error) };
    }
  }

  const admittedBy = admissionSource(
    { relevanceScore: relevance, relevanceCheck },
    { threshold: THRESHOLD },
  );
  const status =
    band === RELEVANCE_BAND.UNAVAILABLE
      ? "UNAVAILABLE"
      : (STATUS_BY_ADMISSION[admittedBy] ?? "FAIL");

  return {
    sceneId: scene.id,
    sceneName: scene.name,
    asset: scene.media.path,
    claimSource,
    relevance,
    reason: reason ?? firstError,
    band,
    subjectMatch: relevanceCheck?.verdict ?? null,
    subjectReason: relevanceCheck?.reason ?? null,
    admittedBy,
    passed: admittedBy !== null,
    status,
  };
}

/**
 * Package-level rollup. The satisfiability question is the same one
 * asset-sourcer asks of a scene pool, so it is answered by the same function:
 * "at least one candidate is admissible" versus "scores exist but none is
 * admissible" (a criterion problem) versus "no score at all" (a tool problem).
 *
 * @param {Array<Object>} results
 */
export function summarizeResults(results) {
  const evaluated = results.filter((entry) => !entry.exempted);
  const pool = classifyPool(
    evaluated.map((entry) => ({
      relevanceScore: entry.relevance,
      relevanceCheck: entry.subjectMatch ? { verdict: entry.subjectMatch } : null,
    })),
    { threshold: THRESHOLD },
  );
  const passed = evaluated.filter((entry) => entry.admittedBy === "score").length;
  const borderlineAdmitted = evaluated.filter((entry) => entry.admittedBy === "second-pass").length;
  const unavailable = evaluated.filter((entry) => entry.band === RELEVANCE_BAND.UNAVAILABLE).length;
  const failed = evaluated.filter(
    (entry) => !entry.admittedBy && entry.band !== RELEVANCE_BAND.UNAVAILABLE,
  ).length;

  return {
    evaluated: evaluated.length,
    passed,
    borderlineAdmitted,
    failed,
    unavailable,
    exempted: results.length - evaluated.length,
    ceiling: pool.ceiling,
    // A fully exempted package has nothing to judge. Reporting `unavailable`
    // would read as "the analyzer failed" and send the caller to fix an engine
    // that was never asked.
    verdict: evaluated.length === 0 ? null : pool.verdict,
  };
}

/**
 * Load scene-data by slug. Returns the module namespace so `metadata` rides
 * along with `scenes`.
 */
async function loadScenes(contentSlug) {
  const contentDir = join(__dirname, "content", contentSlug);
  const sceneDataPath = join(contentDir, "scene-data.mjs");
  // Indirection keeps Vite from trying to resolve the runtime URL at build
  // time (the path is per-content and must stay dynamic).
  const url = `file://${sceneDataPath}`;
  const mod = await import(url);
  return { scenes: mod.scenes, metadata: mod.metadata ?? null, contentDir };
}

function printResult(result) {
  if (result.exempted) {
    console.log(`  ⏭️  EXEMPT — ${result.exemptionReason}`);
    return;
  }
  console.log(
    `  → ${result.status} — relevance: ${result.relevance ?? "null"} (band: ${result.band})`,
  );
  if (result.reason) console.log(`    reason: ${result.reason}`);
  if (result.subjectMatch !== null || result.subjectReason) {
    console.log(
      `    subject check: ${result.subjectMatch ?? "unavailable"}${result.subjectReason ? ` — ${result.subjectReason}` : ""}`,
    );
  }
}

async function main(argv = process.argv.slice(2)) {
  const contentSlug = getArg(argv, "content");
  if (!contentSlug) {
    console.error("Usage: node evaluate-stock-relevance.mjs --content <slug>");
    process.exit(1);
  }

  const { scenes, metadata, contentDir } = await loadScenes(contentSlug);
  const exemption = normalizeExemption(metadata);
  if (metadata?.stockRelevanceExemption && !exemption) {
    console.warn(
      "⚠️  metadata.stockRelevanceExemption is present but has no non-empty `reason` — ignored (a waiver must be reviewable).",
    );
  }
  if (exemption?.dropped) {
    console.warn(
      `⚠️  metadata.stockRelevanceExemption.scenes dropped ${exemption.dropped} malformed id(s) — a waiver never widens to the whole package by accident.`,
    );
  }

  console.log(`\n=== Stock Image Relevance Evaluation ===`);
  console.log(`Content: ${contentSlug}`);
  console.log(
    `Threshold: ${THRESHOLD} (borderline band: ${BORDERLINE_FLOOR}-${THRESHOLD - 1}, second-pass subject check)`,
  );
  if (exemption) {
    console.log(
      `Waiver: ${exemption.scenes === null ? "whole package" : `scenes ${exemption.scenes.join(", ")}`} — ${exemption.reason}`,
    );
  }
  console.log();

  const results = [];

  for (const scene of scenes) {
    if (!scene.media || scene.media.type !== "image") {
      console.log(`Scene ${scene.id} (${scene.name}): skip (no stock image)`);
      continue;
    }

    if (isExemptScene(scene.id, exemption)) {
      const result = {
        sceneId: scene.id,
        sceneName: scene.name,
        asset: scene.media.path,
        exempted: true,
        exemptionReason: exemption.reason,
        relevance: null,
        reason: null,
        band: null,
        subjectMatch: null,
        subjectReason: null,
        admittedBy: null,
        passed: false,
        status: "EXEMPT",
      };
      results.push(result);
      console.log(`Scene ${scene.id} (${scene.name}): ${scene.media.path}`);
      printResult(result);
      console.log();
      continue;
    }

    console.log(`Scene ${scene.id} (${scene.name}): evaluating ${scene.media.path}...`);
    const result = await evaluateScene(scene, contentDir, analyzeAssetSemantics);
    results.push(result);
    console.log(`  claim source: ${result.claimSource}`);
    printResult(result);
    console.log();
  }

  await closeVisualAnalyzer();

  const summary = summarizeResults(results);
  console.log(`\n=== Summary ===`);
  console.log(`Evaluated: ${summary.evaluated}`);
  console.log(`Passed: ${summary.passed} (${summary.passed}/${summary.evaluated})`);
  if (summary.borderlineAdmitted > 0) {
    console.log(`Admitted by second-pass subject check: ${summary.borderlineAdmitted}`);
  }
  console.log(`Failed: ${summary.failed}/${summary.evaluated}`);
  if (summary.unavailable > 0) {
    console.log(`Unavailable (analysis failed / unparseable): ${summary.unavailable}`);
  }
  if (summary.exempted > 0) {
    console.log(`Exempted: ${summary.exempted}`);
  }
  console.log(`Pool ceiling: ${summary.ceiling ?? "none"}`);
  console.log(`Verdict: ${summary.verdict ?? "n/a (nothing to evaluate)"}`);

  if (summary.evaluated === 0) {
    console.log("\nNo bound stock image is outside the waiver — nothing to judge.");
  } else if (summary.verdict === POOL_VERDICT.UNSATISFIABLE) {
    console.log(
      "\n⚠️  No evaluated image is admissible. Treat this as an unsatisfiable criterion for the package,",
    );
    console.log(
      "    not as N individual mistakes: replace the approach (B-roll / layout) or record a repo-visible",
    );
    console.log("    `metadata.stockRelevanceExemption` with the reason.");
  } else if (summary.verdict === POOL_VERDICT.UNAVAILABLE) {
    console.log(
      "\n⚠️  No image produced a parseable score. This is a tool outcome, not a content verdict —",
    );
    console.log("    fix the analyzer/engine before changing images.");
  }

  const failedEntries = results.filter((entry) => !entry.exempted && !entry.admittedBy);
  if (failedEntries.length > 0) {
    console.log(`\n=== Scenes not admitted ===`);
    for (const entry of failedEntries) {
      console.log(
        `  Scene ${entry.sceneId} (${entry.sceneName}): ${entry.asset} — relevance ${entry.relevance ?? "null"} (${entry.band})`,
      );
    }
  }

  const reportPath = join(contentDir, "stock-relevance-report.json");
  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        schemaVersion: REPORT_SCHEMA_VERSION,
        threshold: THRESHOLD,
        borderlineFloor: BORDERLINE_FLOOR,
        summary,
        results,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nReport saved: ${reportPath}`);
  return summary;
}

// Auto-run when invoked as a script (symlink-safe, same guard as the rest of
// the short-video CLIs). Importing this module for its pure helpers must not
// start a VLM session.
const isMainModule = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === __filename;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
