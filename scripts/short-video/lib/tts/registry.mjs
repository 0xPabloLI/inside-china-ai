/**
 * TTS engine registry — selection + delegation.
 *
 * selectEngine() tries engines in priority order (or respects TTS_ENGINE
 * env override). generateTTS() delegates to the selected engine and runs
 * subtitle alignment afterwards.
 *
 * Engine priority:
 *   1. CosyVoice3-Kaggle-CUDA (DEFAULT — P100 GPU, full emotion fidelity, Apache-2.0, ~8-10min/batch)
 *   2. CosyVoice3-Modal-CUDA (PAID FALLBACK — A100 GPU, same CUDA emotion as Kaggle, ~$0.20-0.50/batch, used when Kaggle quota exhausted)
 *   3. CosyVoice3-MLX (LOCAL FALLBACK — emotion regression vs CUDA, but fast RTF 0.64-0.87x)
 *   4. F5-TTS-MLX (BACKUP — good rhythm, natural pacing, internal duration control, CC-BY-NC)
 *
 * Manual opt-in only — NOT part of automatic fallback (user rule 2026-09-10):
 * these engines never run unless TTS_ENGINE explicitly names them:
 *   5. edge-tts (Microsoft neural TTS, no cloning)
 *   6. macOS `say` (last resort, no cloning)
 *
 * Why CUDA engines first: MPS/MLX emotion regression verified 2026-09-08 —
 * CoreML EP + float32 patches + MPS fallback did NOT close the emotion gap vs
 * CUDA. Kaggle P100 CUDA matches A100 emotion baseline exactly. Modal A100 is
 * the same CUDA EP — used when Kaggle's 30h/week quota runs out (Modal ~$30/mo).
 *
 * Why no Ascend NPU engine: the AtomGit NPU adapter produced the same
 * "slightly flat" emotion grade as MLX (ADR-0019 listening verification) while
 * being strictly worse on everything else — it needed a live session-scoped
 * Jupyter endpoint (COSYVOICE3_NPU_JUPYTER_URL/_TOKEN) and ran at RTF ~2.2x
 * against MLX's local 0.64-0.87x. A remote engine that is neither better nor
 * faster than the local one earns no slot in the chain.
 *
 * All local models run at MAX EFFORT by default (see docs/video-production-runbook.md).
 * Unified venv: ~/.video-tts-env (Python 3.12) — CosyVoice3 + F5 + whisperx all in one.
 */

import { existsSync } from "fs";
import { join } from "path";
import { createRegenStaging, acceptRegenTake, cleanupRegenStaging } from "./staging.mjs";
import { createCosyVoice3KaggleCudaEngine } from "./cosyvoice3-kaggle-cuda.mjs";
import { createCosyVoice3ModalCudaEngine } from "./cosyvoice3-modal-cuda.mjs";
import { createCosyVoice3MLXEngine } from "./cosyvoice3-mlx.mjs";
import { createF5MLXEngine } from "./f5-mlx.mjs";

import { createEdgeTTSEngine } from "./edge-tts.mjs";
import { createSayEngine } from "./say.mjs";
import { runForcedAlignment, getAtempo } from "./post-process.mjs";
import {
  planTtsScenes,
  writeSceneMeta,
  writeCandidateSceneMeta,
  refreshApprovedSceneMeta,
  refreshCandidateSceneMeta,
  sceneCacheKey,
} from "./cache.mjs";
import {
  FAILURE_CLASS,
  partitionGateFailures,
  infraBlockError,
  markFailClosed,
  qualityGateSkipped,
} from "./failure-class.mjs";
import {
  HOOK_MIN_SPEED,
  MAX_TTS_SPEED,
  WPM_HARD_CEILING,
  WPM_COMPENSATE_BELOW,
  resolveSceneSpeed,
} from "./pacing.mjs";
import { DEFAULT_SILENCE_FLOOR_MS } from "./silence-trim.mjs";

/**
 * Engine factory map. Keys are both the canonical name and TTS_ENGINE aliases.
 * @type {Record<string, () => Promise<TTSEngine|null>>}
 */
const ENGINE_FACTORIES = {
  "cosyvoice3-kaggle-cuda": createCosyVoice3KaggleCudaEngine,
  "cosyvoice3-cuda": createCosyVoice3KaggleCudaEngine,
  "cosyvoice3-modal-cuda": createCosyVoice3ModalCudaEngine,
  "cosyvoice3-mlx": createCosyVoice3MLXEngine,
  cosyvoice3: createCosyVoice3MLXEngine,
  cv3: createCosyVoice3MLXEngine,
  "f5-mlx": createF5MLXEngine,
  f5: createF5MLXEngine,

  "edge-tts": createEdgeTTSEngine,
  say: createSayEngine,
};

/**
 * Priority order for AUTOMATIC selection (no TTS_ENGINE env).
 * Automatic fallback stops at f5-mlx — engines after it (edge-tts,
 * say) are manual opt-in only and must never be selected by this loop
 * (user rule 2026-09-10).
 */
const PRIORITY = ["cosyvoice3-kaggle-cuda", "cosyvoice3-modal-cuda", "cosyvoice3-mlx", "f5-mlx"];

/**
 * Select a TTS engine.
 *
 * If TTS_ENGINE env is set to a known engine name, try that engine first.
 * If it's unavailable (or no env override), fall back to priority order.
 *
 * @returns {Promise<TTSEngine>}
 * @throws {Error} If no engine is available.
 */
export async function selectEngine() {
  const forceEngine = process.env.TTS_ENGINE || null;

  // Try forced engine first
  if (forceEngine && ENGINE_FACTORIES[forceEngine]) {
    const engine = await ENGINE_FACTORIES[forceEngine]();
    if (engine) return engine;
    console.log(
      `  ⚠️ Forced engine "${forceEngine}" not available, falling back to priority order...`,
    );
  }

  // Try engines in priority order
  for (const key of PRIORITY) {
    const engine = await ENGINE_FACTORIES[key]();
    if (engine) return engine;
  }

  throw new Error(
    "No TTS engine available. Install Kaggle CLI (~/.kaggle/kaggle.json) or Modal CLI (modal token new), CosyVoice3-MLX + F5-TTS-MLX (~/.video-tts-env), edge-tts, or run on macOS.",
  );
}

/**
 * Generate TTS voiceover for all scenes.
 *
 * Delegates to the selected engine, then runs subtitle alignment.
 * Scene audio is cached across runs (see ./cache.mjs): scenes whose
 * (engine, engine config, text) key already has APPROVED audio skip GPU
 * generation entirely; takes that exist but are not finally verified are
 * re-verified locally (#423). Set TTS_NO_CACHE=1 (or pass useCache:false) to
 * regenerate everything.
 *
 * @param {Array} scenes - Scene objects with {id, voiceover}
 * @param {string} outputDir - Audio output directory
 * @param {object} [options]
 * @param {boolean} [options.useCache=true] - reuse cached scene audio
 * @param {boolean} [options.runAlignment=true] - run forced alignment after TTS
 * @returns {Promise<TTSResult[]>}
 */
export async function generateTTS(scenes, outputDir, options = {}) {
  const engine = await selectEngine();
  return generateTTSWithEngine(scenes, outputDir, engine, options);
}

/**
 * Replace (or append) a scene's result in the validated set — used by the
 * pacing loop when a compensation/reroll take is accepted (#252).
 */
function replaceResult(results, res) {
  const idx = results.findIndex((g) => g.sceneId === res.sceneId);
  if (idx >= 0) results[idx] = res;
  else results.push(res);
}

/**
 * Build the #252 hard-block error: a scene still measures > 225 WPM after a
 * reroll. Fail-closed — rushed audio must not flow into rendering (#246).
 */
function pacingHardBlockError(detail) {
  return markFailClosed(
    new Error(
      `TTS_PACING_HARD_BLOCK: scene(s) exceed the ${225} WPM hard ceiling after reroll — ${detail}. ` +
        `NOT shipping rushed audio (#246/#252). Fix: trim the script for these scenes ` +
        `(docs/content-pipeline.md → 旁白语速预算 → 词密度预算), then re-run.`,
    ),
    "TTS_PACING_HARD_BLOCK",
  );
}

/**
 * #271 fail-closed: a phonetically clean but too-slow take is still below the
 * Quality-Gate WPM floor after native speed compensation. `MAX_TTS_SPEED` is
 * the spectral-flux ceiling, so no further compensation exists — the script,
 * not the take, has to change. Falling back to the original take is not an
 * option either: the gate had already rejected it.
 */
function pacingFloorBlockError(detail, failedScenes = []) {
  const err = markFailClosed(
    new Error(
      `TTS_PACING_FLOOR_BLOCK: pacing-class take(s) still measure below the minimum-acceptable ` +
        `WPM floor after native speed compensation (≤${MAX_TTS_SPEED}x) — ${detail}. ` +
        `NOT shipping slow audio (#271). Only the AUTOMATIC loop is capped at ${MAX_TTS_SPEED}x ` +
        `(quality-gate.mjs MIN_ACCEPTABLE_WPM is the floor it missed) — a block is not a dead ` +
        `end, pick a speed lever: TTS_ATEMPO env speeds the whole piece up after post-processing ` +
        `(ffmpeg atempo, pitch-preserving, NOT capped at ${MAX_TTS_SPEED}x), TTS_SPEED env lifts ` +
        `the native baseline instead (clamped to ${MAX_TTS_SPEED}x), or trim the script ` +
        `(docs/content-pipeline.md → 旁白语速预算 → 词密度预算). To ship anyway, bypass the ` +
        `gate explicitly with TTS_SKIP_QUALITY_GATE=1.`,
    ),
    "TTS_PACING_FLOOR_BLOCK",
  );
  // #704: the local-fallback gate needs to know WHICH scenes failed — the slow
  // take is repairable by another engine even though native speed is not.
  err.failedScenes = failedScenes;
  return err;
}

/**
 * #271 fail-closed: acoustic failures (truncation, missing tokens, low
 * similarity, missing audio) survived the whole reroll budget. Audio whose
 * words cannot be trusted must never reach rendering, and it is not
 * speed-fixable, so there is nothing left to compensate — blocking is the only
 * honest outcome in both strict and non-strict mode.
 */
function acousticBlockError(failed, attempts) {
  const detail = failed
    .map((f) => `scene ${f.sceneId} (${(f.issues || []).join("; ") || "acoustic failure"})`)
    .join("; ");
  const err = markFailClosed(
    new Error(
      `TTS_ACOUSTIC_HARD_BLOCK: ${failed.length} scene(s) still fail the acoustic checks after ` +
        `${attempts} generated take(s) — ${detail}. NOT shipping audio whose words cannot be ` +
        `trusted (#271). Fix the take (re-record, or revisit the reference audio / instruct — ` +
        `see #270), or set TTS_SKIP_QUALITY_GATE=1 to bypass the gate explicitly.`,
    ),
    "TTS_ACOUSTIC_HARD_BLOCK",
  );
  // #704: structured failure scene list — the local fallback regenerates only
  // these scenes on the other engine.
  err.failedScenes = failed.map((f) => ({ sceneId: f.sceneId, issues: f.issues ?? [] }));
  return err;
}

/**
 * #704: decide whether a fail-closed Quality-Gate result may be repaired by
 * the local F5-TTS-MLX engine.
 *
 * Only the CosyVoice3-MLX main engine opts in (its bad takes are an engine
 * defect, not a script defect) and only for the two take-level blocks —
 * acoustic failures and pacing-floor failures. `TTS_PACING_HARD_BLOCK` (a
 * rushed take), infra blocks (the verifier never ran) and every non-MLX main
 * engine keep their original fail-closed semantics.
 *
 * Pure and exported so the decision is unit-testable without an engine run.
 *
 * @param {object} params
 * @param {string} [params.engineName] - the main engine's `name`
 * @param {Error} [params.err] - the fail-closed error the gate raised
 * @param {NodeJS.ProcessEnv} [params.env=process.env]
 * @returns {boolean}
 */
export function shouldAttemptLocalFallback({ engineName, err, env = process.env }) {
  return (
    engineName === "cosyvoice3-mlx" &&
    err?.failClosed === true &&
    (err.code === "TTS_ACOUSTIC_HARD_BLOCK" || err.code === "TTS_PACING_FLOOR_BLOCK") &&
    Array.isArray(err.failedScenes) &&
    err.failedScenes.length > 0 &&
    env.TTS_DISABLE_LOCAL_FALLBACK !== "1"
  );
}

/**
 * #704: choose the scenes the local F5-MLX fallback has to regenerate.
 *
 * The decision set is each scene's LATEST verdict, not the raw gate report: the
 * report's evaluations are loaded first, then overwritten (keyed by sceneId)
 * by `verdictByScene`. `gateReport` is only refreshed by the re-gate at the top
 * of the self-heal loop, so a compensation/reroll accepted later in the pacing
 * loop is recorded in `verdictByScene` alone. The overlay fixes both
 * directions: a repaired scene is not sent to F5 (a wasted minute per scene,
 * and an F5 rejection would turn a run whose audio is already repaired into a
 * fail-closed false negative), and a stale high-WPM failure does not veto a
 * take that the latest verdict has already replaced.
 *
 * The target set is the UNION of the scenes the block error names and every
 * still-rejected latest verdict — minus any scene whose LATEST verdict passes.
 * A scene with NO verdict is kept — absence of evidence is not a repair.
 *
 * `extraEvaluations` carries takes that never pass through the gate at all:
 * APPROVED cache hits, measured for the pacing ladder (#786) into
 * `cachedPacing.evaluations` rather than into `gateReport`. Without them the
 * same fail-open reopens one level up — an approved 250 WPM hook alongside an
 * acoustically failing scene would be repaired on F5 while the acoustic block
 * short-circuits the ladder that would have rerolled it. They are loaded into
 * the decision set BEFORE the report, so the report and the newer recorded
 * verdicts both still win on conflict.
 *
 * The 225 WPM hard ceiling is vetoed here across the WHOLE decision set, passed
 * or not: the acoustic block is raised BEFORE the pacing ladder runs, so a take
 * that cleared the gate can still be over 225 WPM (e.g. scene 2 at 250 WPM
 * while scene 1 blocks acoustically). The fallback would repair scene 1 and
 * never reach the ladder, shipping the rushed take. Vetoing the attempt keeps
 * the original block and the pacing-hard red line intact.
 *
 * `ok=false` (no repair attempt, original block stands) when no failing latest
 * verdict exists, when any take exceeds the hard ceiling, when any failure is
 * not take-level repairable (infra, unclassified, or pacing above the hard
 * ceiling — only a script edit helps those), or when nothing is left to
 * regenerate.
 *
 * Pure and exported so the selection is unit-testable without an engine run.
 *
 * @param {object} params
 * @param {object|null} params.gateReport - latest Quality-Gate report
 * @param {Error} [params.gateErr] - the fail-closed error the gate raised
 * @param {Map<number, {evaluation?: {passed?: boolean}}>} [params.verdictByScene]
 * @param {Array<{sceneId: number, passed?: boolean, wpm?: number}>} [params.extraEvaluations]
 *   - takes measured outside the gate (approved cache hits, #786)
 * @param {number} [params.hardCeiling=WPM_HARD_CEILING]
 * @returns {{ok: boolean, sceneIds: number[]}}
 */
export function selectLocalFallbackTargets({
  gateReport,
  gateErr,
  verdictByScene,
  extraEvaluations = [],
  hardCeiling = WPM_HARD_CEILING,
} = {}) {
  // Latest verdict per scene: takes outside the gate first, then the report,
  // then the newer recorded verdicts (accepted compensation/reroll takes)
  // overwrite it.
  const latestByScene = new Map();
  for (const evaluation of extraEvaluations) {
    if (evaluation && evaluation.sceneId != null) {
      latestByScene.set(evaluation.sceneId, evaluation);
    }
  }
  for (const evaluation of gateReport?.evaluations ?? []) {
    if (evaluation && evaluation.sceneId != null) {
      latestByScene.set(evaluation.sceneId, evaluation);
    }
  }
  for (const [sceneId, verdict] of verdictByScene ?? []) {
    // The map key is the scene identity; stamp it on so downstream ID
    // collection cannot depend on the verdict object carrying its own copy.
    if (verdict?.evaluation) latestByScene.set(sceneId, { ...verdict.evaluation, sceneId });
  }
  const evaluations = [...latestByScene.values()];
  // No failing latest verdict means no evidence a take-level repair is safe —
  // fail closed.
  const failedEvaluations = evaluations.filter((e) => !e.passed);
  if (failedEvaluations.length === 0) return { ok: false, sceneIds: [] };

  // All-or-nothing over the shipped set: a fallback must never become the way a
  // rushed take reaches rendering, whether that take failed the gate or passed
  // it. The ladder that would catch it on the main path does not run after the
  // acoustic fallback (#246/#704).
  if (evaluations.some((e) => Number.isFinite(e.wpm) && e.wpm > hardCeiling)) {
    return { ok: false, sceneIds: [] };
  }

  const locallyRepairable = (e) => {
    if (e.failureClass === FAILURE_CLASS.ACOUSTIC) return true;
    // A missing/unmeasurable WPM is a pacing-floor case: F5 produces a new take
    // whose WPM can actually be measured. Above the hard ceiling only a script
    // edit helps, and infra/unclassified failures are not take defects.
    if (e.failureClass !== FAILURE_CLASS.PACING) return false;
    const wpm = Number(e.wpm);
    return !Number.isFinite(wpm) || wpm <= hardCeiling;
  };
  // All-or-nothing: one unrepairable failure vetoes the whole attempt — a
  // partial repair would leave that take in the shipped set.
  if (failedEvaluations.some((e) => !locallyRepairable(e))) return { ok: false, sceneIds: [] };

  const latestVerdictPassed = (sceneId) => latestByScene.get(sceneId)?.passed === true;

  const sceneIds = [
    ...new Set(
      [
        ...(gateErr?.failedScenes ?? []).map((f) => f.sceneId),
        ...failedEvaluations.map((e) => e.sceneId),
      ].filter((id) => !latestVerdictPassed(id)),
    ),
  ];
  // Every failure in the report was repaired after all — there is no take left
  // to regenerate, so the caller keeps the original block.
  if (sceneIds.length === 0) return { ok: false, sceneIds: [] };
  return { ok: true, sceneIds };
}

/**
 * Merge cache hits and freshly verified takes into SCENE ORDER and run the
 * alignment tail — the single exit path of generateTTSWithEngine (#421).
 *
 * Full cache hits take this path too: subtitle-timing.json is a required
 * artifact of a voiced run, and skipping it here is exactly how a second full
 * run (10/10 hits) shipped a video with no burned-in subtitles. The aligner's
 * own signature cache (scene text + audio bytes, #198) makes a matching reuse
 * free, so running the tail unconditionally costs nothing when timing is
 * already valid. The explicit low-level `runAlignment: false` escape hatch is
 * preserved.
 *
 * @param {Array} scenes - Scene objects with {id, voiceover}
 * @param {Array} cachedResults - approved hits from planTtsScenes
 * @param {Array} verifiedResults - fresh/candidate takes this run verified
 * @param {string} outputDir - Audio output directory
 * @param {{runAlignment: boolean, useCache: boolean}} options
 * @returns {Promise<TTSResult[]>} results in scene order
 */
async function finalizeTtsResults(
  scenes,
  cachedResults,
  verifiedResults,
  outputDir,
  { runAlignment, useCache },
) {
  // Reassemble in scene order; drop scenes the engine skipped.
  const byId = new Map(verifiedResults.map((r) => [r.sceneId, r]));
  const merged = [];
  for (const scene of scenes) {
    const hit = cachedResults.find((r) => r.sceneId === scene.id);
    if (hit) merged.push(hit);
    else if (byId.has(scene.id)) merged.push(byId.get(scene.id));
  }

  // Run subtitle alignment for accurate timing
  if (runAlignment) {
    const alignment = await runForcedAlignment(scenes, merged, outputDir);
    // #423: the tail-cut guard trims approved audio in place — re-bind those
    // entries to the bytes actually on disk, or every later run would demote
    // the scene to a candidate over the pipeline's own cut. Unverified takes
    // (skip-gate runs) get the same treatment on their sidecar so the next
    // run measures WPM against the bytes it will re-verify.
    const cuts = alignment?.guards?.cuts ?? [];
    if (useCache && cuts.length > 0) {
      const cutIds = new Set(cuts.map((c) => c.sceneId));
      for (const r of merged) {
        if (!cutIds.has(r.sceneId)) continue;
        if (!refreshApprovedSceneMeta(outputDir, r.sceneId, { duration: r.duration })) {
          refreshCandidateSceneMeta(outputDir, r.sceneId, { duration: r.duration });
        }
      }
    }
    // #232: guards log per-scene detail during alignment; aggregate one line
    // at generation end so the HITL listening pass knows which scenes to
    // spot-check (crushed words) and that tail cuts were applied.
    const guards = alignment?.guards;
    if (
      guards &&
      (guards.cuts.length > 0 ||
        guards.crushedWords.length > 0 ||
        (guards.refusedCuts?.length ?? 0) > 0)
    ) {
      const crushedScenes = [...new Set(guards.crushedWords.map((w) => w.sceneId))];
      console.log(
        `  🛡️ Alignment guards (#232): ${guards.cuts.length} tail cut(s), ` +
          `${guards.crushedWords.length} crushed word(s)` +
          (guards.refusedCuts?.length
            ? `, ${guards.refusedCuts.length} cut(s) refused by read-back`
            : "") +
          (crushedScenes.length ? ` — spot-check scene(s) ${crushedScenes.join(", ")}` : ""),
      );
    }
  }

  return merged;
}

/**
 * Measure APPROVED takes for the pacing ladder (#786).
 *
 * Approved scenes skip `verifyScenes` by design (no ASR, no GPU), which is how
 * the finished hook bypassed the #244 floor: the ladder only ever judged takes
 * generated in the current run. The duration recorded with the approval is
 * enough to reproduce the gate's own WPM metric (words / duration) — same
 * tokenizer, same rounding — so the cached take can be judged by the SAME
 * ladder without paying for verification again.
 *
 * @param {Array<object>} scenes
 * @param {Array<{sceneId: number, duration: number, ttsSpeed?: number}>} cachedResults
 * @returns {Promise<{scenes: Array<object>, evaluations: Array<object>, compensations: Array, rerolls: Array, advisory: string[]}>}
 */
async function planCachedPacing(scenes, cachedResults) {
  const empty = { scenes: [], evaluations: [], compensations: [], rerolls: [], advisory: [] };
  if (!Array.isArray(cachedResults) || cachedResults.length === 0) return empty;

  const { measureSceneWpm } = await import("./text-tokens.mjs");
  const cachedScenes = [];
  const evaluations = [];
  for (const hit of cachedResults) {
    const scene = scenes.find((s) => s.id === hit.sceneId);
    if (!scene || !(Number(hit.duration) > 0)) continue;
    // Same text resolution and rounding as the gate — a cached take must be
    // judged with the metric it was approved under.
    const wpm = measureSceneWpm(scene, hit.duration);
    if (wpm === 0) continue;
    cachedScenes.push(scene);
    evaluations.push({ sceneId: scene.id, passed: true, wpm });
  }
  if (evaluations.length === 0) return empty;

  const { planPacingResponses } = await import("./pacing.mjs");
  const plan = planPacingResponses(cachedScenes, evaluations);
  return { scenes: cachedScenes, evaluations, ...plan };
}

/**
 * generateTTS with an injected engine — the testable seam.
 *
 * @param {Array} scenes - Scene objects with {id, voiceover}
 * @param {string} outputDir - Audio output directory
 * @param {TTSEngine} engine
 * @param {object} [options] - see generateTTS
 * @returns {Promise<TTSResult[]>}
 */
export async function generateTTSWithEngine(scenes, outputDir, engine, options = {}) {
  const { useCache = process.env.TTS_NO_CACHE !== "1", runAlignment = true } = options;

  const atempo = getAtempo();
  // #270: hand the Quality Gate the SELECTED engine's instruct resolver so it
  // re-validates the exact instruct this engine produced — a hand-rolled engine
  // map shows up here instead of shipping silently. Merged once so every gate
  // call site (initial, self-heal, re-gate, pacing re-gate) sees it.
  const qualityGateOptions = {
    ...options.qualityGateOptions,
    instructForScene: engine.instructForScene ?? null,
  };
  console.log(`  TTS engine: ${engine.info}`);
  // Log actual post-processing based on engine config
  const steps = [];
  if (engine.useSilenceFilter) {
    // #786: internal pauses are capped (measured range mask), not
    // silenced-removed — the tail silence has to survive.
    steps.push(`pause cap ≤${engine.silenceFloorMs ?? DEFAULT_SILENCE_FLOOR_MS}ms`);
  }
  if (engine.resample) steps.push("resample 44.1kHz");
  if (atempo) steps.push(`atempo ${atempo}x`);
  // loudnorm is always applied at video assembly stage
  steps.push("loudnorm (at assembly)");
  console.log(`  Post-process: ${steps.join(" + ")}`);

  // Split into approved hits, candidates and pending scenes (#198 Item 2,
  // #423). Results must be reassembled in scene order — callers index-align
  // ttsResults to scenes.
  let toGenerate = scenes;
  let cachedResults = [];
  let candidateResults = [];
  let candidateSpeedById = new Map();
  if (useCache) {
    const plan = planTtsScenes(outputDir, scenes, engine);
    if (plan.approved.length > 0) {
      console.log(
        `  💾 TTS cache: ${plan.approved.length}/${scenes.length} scenes reused (TTS_NO_CACHE=1 to force)`,
      );
    }
    if (plan.candidates.length > 0) {
      console.log(
        `  ♻️ TTS candidates: ${plan.candidates.length}/${scenes.length} take(s) await local ` +
          `re-verification (no GPU): ${plan.candidates.map((c) => `scene ${c.sceneId} (${c.reason})`).join("; ")}`,
      );
    }
    cachedResults = plan.approved.map(({ sceneId, audioPath, duration, ttsSpeed }) => ({
      sceneId,
      audioPath,
      duration,
      // #786: the speed that produced the take on disk. The pacing ladder needs
      // it to tell "already at 1.1x" from "still at 1.0x" — dropping it here is
      // how a cached 1.0x hook kept being re-compensated (or never was).
      ttsSpeed,
      cached: true,
    }));
    // The cached take's speed joins the scene so resolveSceneSpeed() sees what
    // is actually on disk (hook floor / key resolution) instead of the 1.0
    // baseline a fresh scene object starts with.
    for (const hit of plan.approved) {
      const scene = scenes.find((s) => s.id === hit.sceneId);
      if (scene && Number.isFinite(hit.ttsSpeed)) scene.ttsSpeed = hit.ttsSpeed;
    }
    candidateSpeedById = new Map(plan.candidates.map((c) => [c.sceneId, c.ttsSpeed]));
    candidateResults = plan.candidates.map(({ sceneId, audioPath, duration }) => ({
      sceneId,
      audioPath,
      duration,
    }));
    toGenerate = plan.pending;
  }

  const isFakeEngine =
    (engine.name && engine.name.toLowerCase().includes("fake")) ||
    (engine.info && engine.info.toLowerCase().includes("fake"));
  const skipQualityGate = options.skipQualityGate ?? (isFakeEngine || qualityGateSkipped());

  // Everything this run must (re-)verify: fresh generations plus candidates
  // whose audio already exists on disk (#423).
  const verifyScenes = [
    ...toGenerate,
    ...candidateResults.map((r) => scenes.find((s) => s.id === r.sceneId)).filter(Boolean),
  ];

  // #786: approved takes never enter `verifyScenes`, so the pacing ladder used
  // to see only freshly generated scenes — a hook approved at 1.0x stayed at
  // 1.0x forever (v41-flash-1017: `ttsSpeed:1`, 163 WPM, `9/10 scenes reused`).
  // Measure cached takes from their recorded duration (no ASR, no GPU) and let
  // the same ladder judge them. A skip-gate run keeps the old behaviour: the
  // operator asked for no quality decisions at all.
  const cachedPacing = skipQualityGate ? null : await planCachedPacing(scenes, cachedResults);
  const cachedNeedsRepair =
    !!cachedPacing && (cachedPacing.compensations.length > 0 || cachedPacing.rerolls.length > 0);

  if (verifyScenes.length === 0 && !cachedNeedsRepair) {
    // #421: full cache hit — skip generation AND re-verification, but route
    // through the shared finalize so the alignment tail still runs. Returning
    // `cachedResults` here is how the second run of a pipeline silently lost
    // its subtitles.
    return finalizeTtsResults(scenes, cachedResults, [], outputDir, { runAlignment, useCache });
  }

  // The primary round writes DIRECTLY into the audio dir, unlike the regen
  // rounds below (#423): `toGenerate` holds only scenes with no reusable take
  // on disk (approved scenes are never regenerated), so there is nothing to
  // protect; engines derive per-pipeline identity from this path (Kaggle slug,
  // #267) and keep per-call bookkeeping under it (`.kaggle-kernel`, #420).
  const generatedResults =
    toGenerate.length > 0 ? await engine.generate(toGenerate, outputDir) : [];

  // ── Step: TTS Quality Gate & Self-Healing Loop (#225, #230) ──
  // Candidates join the same verification path as fresh takes: their audio
  // exists, so the gate + pacing ladder re-check them locally (no GPU).
  let validatedResults = [...generatedResults, ...candidateResults];

  // Native speed that produced each take on disk, keyed by the RESULT object.
  // Settling must key the cache on the take that EXISTS — keying by scene id
  // would let a compensation override (applied after the original take was
  // generated) label the original take with a key it can never hit (#423).
  const speedByResult = new Map();
  for (const res of validatedResults) {
    const scene = scenes.find((s) => s.id === res.sceneId);
    if (!scene) continue;
    // A candidate carries the speed that produced the take on disk (#252) —
    // re-promotion must keep it, or a compensated take gets relabelled 1.0x.
    const fromPlan = candidateSpeedById.get(res.sceneId);
    speedByResult.set(res, Number.isFinite(fromPlan) ? fromPlan : resolveSceneSpeed(scene));
  }

  // #423: sceneId → {result, evaluation} for the take currently on disk. Every
  // gate run refreshes it; an ACCEPTED reroll/compensation take replaces its
  // entry (a failed replacement never does — the original take's verdict
  // stands). Settling reads this map: passed → approved, else candidate.
  const verdictByScene = new Map();
  const recordVerdicts = (results, evaluations) => {
    for (const ev of evaluations ?? []) {
      const result = results.find((r) => r.sceneId === ev.sceneId);
      if (result) verdictByScene.set(ev.sceneId, { result, evaluation: ev });
    }
  };

  /** Write one take's trust state: approved when verified, else candidate. */
  const settleTake = (result, evaluation, fallbackReason) => {
    const scene = scenes.find((s) => s.id === result.sceneId);
    if (!scene) return;
    const speed = speedByResult.get(result) ?? resolveSceneSpeed(scene);
    // #704: the cache identity belongs to the take that EXISTS on disk — a
    // local-fallback take was produced by f5-mlx, so its key and meta must name
    // f5-mlx, not the main engine that failed it. This is provenance, not a
    // cross-run hit path: the next run plans against the MAIN engine's key, so
    // an F5 fallback take is never reused as an MLX hit (a different timbre
    // cannot be pinned into the cache for good).
    const takeEngine = result.engine ?? engine;
    const meta = {
      key: sceneCacheKey(takeEngine, scene, speed),
      duration: result.duration,
      engine: takeEngine.name,
      ...(result.fallbackFrom ? { fallbackFrom: result.fallbackFrom } : {}),
      audioPath: result.audioPath,
      ttsSpeed: speed,
    };
    if (evaluation?.passed) {
      if (!writeSceneMeta(outputDir, result.sceneId, meta)) {
        // Only reachable when the audio file is gone — the gate flags that as
        // a missing-audio failure, so surface the mismatch instead of letting
        // a "passed" take disappear from the cache silently.
        console.warn(
          `  ⚠️ Scene ${result.sceneId}: approved take has no audio at ${result.audioPath} — ` +
            `cache entry not written`,
        );
      }
    } else {
      writeCandidateSceneMeta(outputDir, result.sceneId, {
        ...meta,
        reason: evaluation ? `gate-failed:${evaluation.failureClass || "unknown"}` : fallbackReason,
      });
    }
  };

  /**
   * Settle every take the run holds (idempotent; last verdict wins). A take
   * with no verdict at all — the gate itself errored before evaluating it —
   * is recorded as an unverified candidate, not left meta-less: the bytes are
   * on disk, so the next run must re-verify them locally instead of paying
   * for them again.
   */
  const settleTakes = () => {
    if (!useCache) return;
    for (const res of validatedResults) {
      const verdict = verdictByScene.get(res.sceneId);
      settleTake(res, verdict?.evaluation ?? null, "gate-error");
    }
  };

  /** Settle takes the gate never evaluated (skipped / fake engine). */
  const settleTakesAsCandidates = (reason) => {
    if (!useCache) return;
    for (const res of validatedResults) settleTake(res, null, reason);
  };

  // #704: the LATEST gate report, hoisted out of the gate block so the local
  // fallback sees every scene the gate currently rejects — not just the
  // scene(s) the (earlier) block error happened to name.
  let gateReport = null;

  /**
   * #704: repair fail-closed CosyVoice3-MLX takes on the local F5-MLX engine.
   *
   * The repair targets are the UNION of the block error's scenes and every
   * still-rejected scene in the latest verdicts (gate report overlaid with
   * `verdictByScene`), MINUS scenes whose latest verdict passes — see
   * selectLocalFallbackTargets(), which owns that decision. The acoustic block
   * is raised BEFORE the pacing loop runs, so a run can hold an acoustic
   * failure on one scene and an uncompensated pacing-floor failure on another;
   * regenerating only the acoustic scene would let the slow take ship
   * (fail-open). The verdict overlay matters for the other direction: the
   * pacing loop repairs scene-by-scene, and `gateReport` is stale for any
   * compensation accepted after its last re-gate — re-generating a scene that
   * is already fixed burns a minute and can turn a repaired run into a block.
   *
   * All targets are regenerated into staging. The fallback takes are accepted
   * ONLY when every one of them passes the same Quality Gate AND stays at or
   * below the WPM hard ceiling. The pacing ladder does NOT run on the acoustic
   * path — the block fires before it — so the 225 ceiling has not been applied
   * to ANY take yet, including takes that already passed the gate; that veto
   * must happen here (inside selectLocalFallbackTargets) or a repaired run
   * would ship a rushed take. Any failure (unrepairable failure family, engine
   * unavailable, short batch, rejected take, exception) returns false and the
   * caller rethrows the original block. This path can rescue a run — it must
   * never weaken the fail-closed contract.
   *
   * Approved cache hits never enter `gateReport`; their WPM lives in
   * `cachedPacing.evaluations` (#786). They join the decision set too, or a
   * rushed approved take would be exempt from the 225 veto exactly like a
   * rushed freshly-gated one (#704).
   *
   * @param {Error} gateErr - the fail-closed error from the gate block
   * @returns {Promise<boolean>} true when replacement takes were accepted
   */
  const attemptLocalFallback = async (gateErr) => {
    if (!shouldAttemptLocalFallback({ engineName: engine.name, err: gateErr })) return false;

    // #704: the LATEST verdicts decide which failures are still real — a scene
    // repaired by an accepted compensation is not a fallback target.
    const { ok, sceneIds } = selectLocalFallbackTargets({
      gateReport,
      gateErr,
      verdictByScene,
      extraEvaluations: cachedPacing?.evaluations ?? [],
    });
    if (!ok) return false;

    const failedSceneIds = new Set(sceneIds);
    const fallbackScenes = verifyScenes.filter((s) => failedSceneIds.has(s.id));
    if (fallbackScenes.length === 0) return false;

    let fallbackEngine = null;
    try {
      fallbackEngine = await createF5MLXEngine();
    } catch (err) {
      console.warn(
        `  ⚠️ [TTS Local Fallback] f5-mlx init failed: ${err.message} — keeping the original block`,
      );
      return false;
    }
    if (!fallbackEngine) {
      console.warn(
        `  ⚠️ [TTS Local Fallback] f5-mlx is not available — keeping the original block. ` +
          `Install F5-TTS-MLX in ~/.video-tts-env, or set TTS_DISABLE_LOCAL_FALLBACK=1 to skip the attempt.`,
      );
      return false;
    }

    const staging = createRegenStaging(outputDir);
    try {
      let fallbackResults = [];
      try {
        fallbackResults = await fallbackEngine.generate(fallbackScenes, staging);
      } catch (err) {
        console.warn(
          `  ⚠️ [TTS Local Fallback] f5-mlx generation failed: ${err.message} — keeping the original block`,
        );
        return false;
      }

      // Every failed scene must come back — a short batch is not a repair.
      const returnedIds = new Set(fallbackResults.map((r) => r.sceneId));
      const covered =
        returnedIds.size === failedSceneIds.size &&
        [...failedSceneIds].every((id) => returnedIds.has(id));
      if (!covered) {
        console.warn(
          `  ⚠️ [TTS Local Fallback] f5-mlx returned ${returnedIds.size}/${failedSceneIds.size} ` +
            `scene(s) (${[...returnedIds].join(", ") || "none"}) — keeping the original block`,
        );
        return false;
      }

      const { runTtsQualityGate } = await import("./quality-gate.mjs");
      // F5 has no instruct resolver — never reuse the main engine's (#270).
      const fallbackGateOptions = {
        ...qualityGateOptions,
        instructForScene: fallbackEngine.instructForScene ?? null,
      };
      const fallbackGate = await runTtsQualityGate(
        fallbackScenes,
        fallbackResults,
        fallbackGateOptions,
      );

      // All-or-nothing: one rejected fallback take promotes nothing, and the
      // original fail-closed error stands.
      //
      // #704: the pacing ladder has NOT run on the acoustic path (the block is
      // raised before it), and a fallback take never passes through it either.
      // The ceiling therefore belongs in the acceptance criterion: an F5 take
      // that clears the gate but still speaks over 225 WPM is rushed audio
      // (#246) and must not be promoted.
      const rejected = fallbackResults.filter((res) => {
        const evalRes = fallbackGate.evaluations.find((e) => e.sceneId === res.sceneId);
        return !evalRes?.passed || (Number.isFinite(evalRes.wpm) && evalRes.wpm > WPM_HARD_CEILING);
      });
      if (rejected.length > 0) {
        for (const res of rejected) {
          const evalRes = fallbackGate.evaluations.find((e) => e.sceneId === res.sceneId);
          if (evalRes?.passed) {
            // Only the hard-ceiling clause can reject a passing evaluation.
            console.warn(
              `  ❌ [TTS Local Fallback] Scene ${res.sceneId} f5-mlx take passed the gate but ` +
                `measures ${evalRes.wpm} WPM (> ${WPM_HARD_CEILING} hard ceiling) — not promoting`,
            );
          } else {
            console.warn(
              `  ❌ [TTS Local Fallback] Scene ${res.sceneId} f5-mlx take rejected: ` +
                `${(evalRes?.issues ?? []).join("; ") || "no evaluation"}`,
            );
          }
        }
        console.warn(`  ⚠️ [TTS Local Fallback] no take promoted — keeping the original block`);
        return false;
      }

      for (const res of fallbackResults) {
        const evalRes = fallbackGate.evaluations.find((e) => e.sceneId === res.sceneId);
        acceptRegenTake(outputDir, res);
        // Cache identity follows the take's REAL engine (see settleTake).
        res.engine = fallbackEngine;
        res.fallbackFrom = engine.name;
        // F5 speaks at its natural pace — scene.ttsSpeed is not consumed.
        res.ttsSpeed = 1.0;
        replaceResult(validatedResults, res);
        verdictByScene.set(res.sceneId, { result: res, evaluation: evalRes });
        speedByResult.set(res, 1.0);
      }

      console.warn(
        `\n  🚨 [TTS Local Fallback] ${engine.name} failed for scene(s) ` +
          `${fallbackResults.map((r) => r.sceneId).join(", ")} — regenerated with ` +
          `${fallbackEngine.name} and accepted. Voice may differ from the rest of the video.`,
      );

      // #704: this path never runs the pacing ladder (the acoustic block fires
      // before it), so a take that already PASSED the gate but measures below
      // the compensation trigger ships at its current speed. Taking the
      // fallback path drops the compensation plan for those scenes — that is a
      // known boundary, but it must never be silent.
      const underCompensated = new Map();
      for (const evaluation of [
        ...(gateReport?.evaluations ?? []),
        ...(cachedPacing?.evaluations ?? []),
      ]) {
        if (
          evaluation?.passed === true &&
          Number.isFinite(evaluation.wpm) &&
          evaluation.wpm < WPM_COMPENSATE_BELOW
        ) {
          underCompensated.set(evaluation.sceneId, evaluation.wpm);
        }
      }
      if (underCompensated.size > 0) {
        const detail = [...underCompensated]
          .map(([sceneId, wpm]) => `scene ${sceneId} (${wpm} WPM)`)
          .join(", ");
        console.warn(
          `\n  🚨 [TTS Local Fallback] pacing compensation was not re-run on the fallback path; ` +
            `these takes ship at their current speed: ${detail} ` +
            `(below the ${WPM_COMPENSATE_BELOW} WPM compensation trigger).`,
        );
      }
      return true;
    } catch (err) {
      console.warn(
        `  ⚠️ [TTS Local Fallback] unexpected error: ${err.message} — keeping the original block`,
      );
      return false;
    } finally {
      cleanupRegenStaging(staging);
    }
  };

  if (!skipQualityGate) {
    try {
      const { runTtsQualityGate } = await import("./quality-gate.mjs");
      gateReport = await runTtsQualityGate(verifyScenes, validatedResults, qualityGateOptions);
      recordVerdicts(validatedResults, gateReport.evaluations);

      // If any scene failed Quality Gate and retry is enabled
      const maxRetries = options.maxRetries ?? parseInt(process.env.TTS_RETRY_COUNT || "2", 10);
      let attempt = 1;
      // #271: pacing-class failures do NOT consume the reroll budget. A reroll
      // regenerates the same text at the same speed, so it cannot lift WPM — it
      // only burns remote GPU time. Those takes belong to the compensation loop
      // below.
      // #415 ①: infra failures are non-retryable for the same reason — the
      // verifier itself is down, so a reroll cannot change the verdict.
      const isRetryable = (e) =>
        !e.passed &&
        e.failureClass !== FAILURE_CLASS.PACING &&
        e.failureClass !== FAILURE_CLASS.INFRA;
      while (!gateReport.passed && attempt <= maxRetries) {
        const failedSceneIds = new Set(
          gateReport.evaluations.filter(isRetryable).map((e) => e.sceneId),
        );
        if (failedSceneIds.size === 0) break; // only pacing-class left → compensation loop
        console.warn(
          `\n  🔄 [TTS Self-Healing Loop] Attempt ${attempt}/${maxRetries}: Regenerating ${failedSceneIds.size} failed scene(s)...`,
        );
        const retryScenes = verifyScenes.filter((s) => failedSceneIds.has(s.id));

        let retryResults = [];
        // #423: rerolls regenerate into staging — a take that fails the gate
        // must not overwrite the audio already on disk. The cleanup is in a
        // `finally`: a gate crash must not leave paid bytes in a staging dir
        // inside the audio output.
        const retryStaging = createRegenStaging(outputDir);
        try {
          try {
            retryResults = await engine.generate(retryScenes, retryStaging);
          } catch (err) {
            console.warn(`  ⚠️ Retry generation error: ${err.message}`);
          }

          if (retryResults.length > 0) {
            const retryGate = await runTtsQualityGate(
              retryScenes,
              retryResults,
              qualityGateOptions,
            );
            for (const res of retryResults) {
              const evalRes = retryGate.evaluations.find((e) => e.sceneId === res.sceneId);
              if (evalRes && evalRes.passed) {
                acceptRegenTake(outputDir, res);
                const idx = validatedResults.findIndex((g) => g.sceneId === res.sceneId);
                if (idx >= 0) validatedResults[idx] = res;
                else validatedResults.push(res);
                verdictByScene.set(res.sceneId, { result: res, evaluation: evalRes });
                const scene = scenes.find((s) => s.id === res.sceneId);
                if (scene) speedByResult.set(res, resolveSceneSpeed(scene));
              }
            }
          }
        } finally {
          cleanupRegenStaging(retryStaging);
        }

        gateReport = await runTtsQualityGate(verifyScenes, validatedResults, qualityGateOptions);
        recordVerdicts(validatedResults, gateReport.evaluations);
        if (gateReport.passed) {
          console.log(`  🎉 [TTS Self-Healing Loop] All scenes healed and passed Quality Gate!`);
          break;
        }
        attempt++;
      }

      if (!gateReport.passed) {
        const {
          failed,
          infra: infraFailed,
          acoustic: acousticFailed,
          pacing: pacingFailed,
        } = partitionGateFailures(gateReport.evaluations);

        // #415 ①: an unverifiable run stops here. The gate never checked the
        // words, so no take-level repair can make it green — and the reroll
        // budget above is already skipped for this family.
        if (infraFailed.length > 0) {
          throw infraBlockError(infraFailed);
        }

        // #271: acoustic failures get the reroll budget above; once it is spent
        // there is no take worth shipping, so this blocks in BOTH strict and
        // non-strict mode. The old warn-and-continue path here is exactly how a
        // take whose words were wrong reached rendering (#271 现象).
        if (acousticFailed.length > 0) {
          throw acousticBlockError(acousticFailed, attempt);
        }

        // #271: pacing-class failures are handed to the compensation loop below
        // — warn-and-continue is deliberately not used for them either. Only
        // failures the gate did not classify keep the legacy #225 semantics.
        if (pacingFailed.length === 0) {
          const failSummary = failed
            .map((f) => `Scene ${f.sceneId} (${(f.issues || []).join(", ")})`)
            .join("; ");
          const msg = `TTS Quality Gate failed after ${attempt} attempt(s): ${failSummary}`;
          if (options.strictQualityGate || process.env.TTS_STRICT_QUALITY_GATE === "1") {
            throw new Error(msg);
          } else {
            console.warn(`  ⚠️ ${msg} (Continuing in non-strict mode)`);
          }
        } else {
          console.log(
            `  ➡️ [TTS Quality Gate] ${pacingFailed.length} pacing-class scene(s) ` +
              `(slow but phonetically clean) routed to the speed-compensation loop (#271)`,
          );
        }
      }

      // ── Pacing feedback loop (#252 + #271): measured WPM drives repair ──
      // The #235 static pair (hook 1.0 / non-hook 1.2) inverted the energy
      // curve (#246: hook 157 vs narrative 228/257 WPM) and let Scene 5 ship
      // at 257 WPM as a mere warning. Now: gate-passed scenes are classified
      // by MEASURED WPM — below 135 → compensate with scene.ttsSpeed (clamp
      // ≤1.2); above 225 → one reroll (take drift ±10-20%, #234) then HARD
      // BLOCK; in between → keep. #271 extends the same ladder to gate-FAILED
      // pacing-class takes that the loop used to skip outright — that gap is
      // how a slow take shipped with no compensation at all.
      const { planPacingResponses } = await import("./pacing.mjs");
      // #786: cached approved takes join the ladder with their measured WPM —
      // otherwise the finished hook (#244 floor) and the >225 ceiling only ever
      // applied to takes generated in this very run.
      const pacing = planPacingResponses(
        [...verifyScenes, ...(cachedPacing?.scenes ?? [])],
        [...gateReport.evaluations, ...(cachedPacing?.evaluations ?? [])],
      );
      for (const note of pacing.advisory) {
        console.warn(`  💬 [Pacing] ${note}`);
      }

      // #271 fail-closed invariant: every gate-failed pacing-class scene that
      // reaches this point must own a repair plan. One the ladder could not
      // plan (e.g. no usable WPM measurement) would otherwise ship the take the
      // gate already rejected.
      const plannedIds = new Set(
        [...pacing.compensations, ...pacing.rerolls].map((p) => p.scene.id),
      );
      const unplanned = gateReport.evaluations.filter(
        (e) => !e.passed && e.failureClass === FAILURE_CLASS.PACING && !plannedIds.has(e.sceneId),
      );
      if (unplanned.length > 0) {
        throw pacingFloorBlockError(
          unplanned
            .map((e) => `scene ${e.sceneId} (${e.wpm ?? "unknown"} WPM, no repair plan)`)
            .join("; "),
          unplanned.map((e) => ({ sceneId: e.sceneId })),
        );
      }

      // #423: a PASSING take is shippable by definition, so the loop never
      // regenerates it at a speed it already meets (or below). This is the
      // candidate path: its bytes were generated at a recorded speed (e.g. a
      // 1.2x hook) and the ladder's floor must not "compensate" it down to a
      // slower take at GPU cost. A gate-REJECTED take is excluded — it has to
      // be repaired or fail closed, never kept.
      const takeSpeedById = new Map([
        ...validatedResults.map((r) => [r.sceneId, speedByResult.get(r)]),
        // #786: a cached approved take's speed matches its meta — that is what
        // lets "already at 1.1x" short-circuit instead of re-compensating every
        // run.
        ...cachedResults.map((r) => [r.sceneId, r.ttsSpeed]),
      ]);
      // #786: a repaired scene may have started from an approved cache hit.
      // finalizeTtsResults prefers the cache hit, so the stale entry must go
      // once the replacement take is accepted — otherwise the run would ship
      // the old audio after paying to regenerate it.
      const dropCachedHit = (sceneId) => {
        cachedResults = cachedResults.filter((r) => r.sceneId !== sceneId);
      };
      const compensationsToRun = [];
      for (const c of pacing.compensations) {
        const current = takeSpeedById.get(c.scene.id);
        if (c.originalPassed !== false && Number.isFinite(current) && c.speed <= current + 1e-9) {
          console.log(
            `  ⏭️ [Pacing Loop] Scene ${c.scene.id} take already at ${current.toFixed(2)}x ` +
              `(planned ${c.speed.toFixed(2)}x) — keeping the verified take`,
          );
          continue;
        }
        compensationsToRun.push(c);
      }

      const regenScenes = [
        ...compensationsToRun.map((c) => {
          c.scene.ttsSpeed = c.speed; // consumed by resolveSceneSpeed → engine manifest + cache key
          return c.scene;
        }),
        ...pacing.rerolls.map((r) => r.scene),
      ];
      if (regenScenes.length > 0) {
        const summary = [
          ...compensationsToRun.map(
            (c) =>
              `scene ${c.scene.id} ${c.measuredWpm}→${Math.round(c.measuredWpm * c.speed)} WPM @ ${c.speed.toFixed(2)}x`,
          ),
          ...pacing.rerolls.map(
            (r) => `scene ${r.scene.id} ${r.measuredWpm} WPM > ${WPM_HARD_CEILING} → reroll`,
          ),
        ].join("; ");
        console.log(
          `  🔁 [Pacing Loop] Regenerating ${regenScenes.length} scene(s) from measured WPM: ${summary}`,
        );

        let regenResults = [];
        // #423: compensation/reroll takes regenerate into staging; only an
        // accepted take is promoted into the audio directory.
        const pacingStaging = createRegenStaging(outputDir);
        try {
          try {
            regenResults = await engine.generate(regenScenes, pacingStaging);
          } catch (err) {
            console.warn(`  ⚠️ [Pacing Loop] Regeneration error: ${err.message}`);
          }

          if (regenResults.length === 0) {
            // No new takes: compensation overrides are meaningless without new
            // audio — drop them; rerolled scenes keep their >225 audio, which
            // is exactly what #252 forbids shipping.
            for (const c of compensationsToRun) delete c.scene.ttsSpeed;
            if (pacing.rerolls.length > 0) {
              throw pacingHardBlockError(
                pacing.rerolls
                  .map(
                    (r) => `scene ${r.scene.id} (${r.measuredWpm} WPM, reroll produced no audio)`,
                  )
                  .join("; "),
              );
            }
            // #271: a compensation whose SOURCE take had failed the gate has no
            // shippable fallback — the only audio left IS the take the gate
            // rejected. Block instead of quietly shipping it.
            const unfixable = compensationsToRun.filter((c) => c.originalPassed === false);
            if (unfixable.length > 0) {
              throw pacingFloorBlockError(
                unfixable
                  .map(
                    (c) =>
                      `scene ${c.scene.id} (${c.measuredWpm} WPM, compensation produced no audio)`,
                  )
                  .join("; "),
                unfixable.map((c) => ({ sceneId: c.scene.id })),
              );
            }
          } else {
            const regenGate = await runTtsQualityGate(
              regenScenes,
              regenResults,
              qualityGateOptions,
            );
            for (const res of regenResults) {
              const evalRes = regenGate.evaluations.find((e) => e.sceneId === res.sceneId);
              const scene = regenScenes.find((s) => s.id === res.sceneId);
              const rerolled = pacing.rerolls.find((r) => r.scene.id === res.sceneId);
              const compensation = compensationsToRun.find((c) => c.scene.id === res.sceneId);
              if (rerolled) {
                const measured = evalRes?.wpm ?? rerolled.measuredWpm;
                if (evalRes?.passed && measured <= WPM_HARD_CEILING) {
                  acceptRegenTake(outputDir, res);
                  dropCachedHit(res.sceneId);
                  replaceResult(validatedResults, res);
                  verdictByScene.set(res.sceneId, { result: res, evaluation: evalRes });
                  speedByResult.set(res, resolveSceneSpeed(scene));
                  console.log(
                    `  ✅ [Pacing Loop] Scene ${res.sceneId} reroll healed: ${measured} WPM ≤ ${WPM_HARD_CEILING}`,
                  );
                } else {
                  throw pacingHardBlockError(
                    `scene ${res.sceneId} still measures ${measured} WPM after a reroll ` +
                      `(first take ${rerolled.measuredWpm} WPM)`,
                  );
                }
              } else if (evalRes?.passed) {
                acceptRegenTake(outputDir, res);
                dropCachedHit(res.sceneId);
                replaceResult(validatedResults, res);
                verdictByScene.set(res.sceneId, { result: res, evaluation: evalRes });
                speedByResult.set(res, resolveSceneSpeed(scene));
                console.log(`  ✅ [Pacing Loop] Scene ${res.sceneId} compensated take accepted`);
              } else if (compensation && compensation.originalPassed === false) {
                // #271: the compensated take still fails AND the take it would
                // replace had already been rejected by the gate — nothing
                // shippable is left, so fail closed rather than fall back. Report
                // the family the COMPENSATED take actually failed in: a 1.2x take
                // can come back truncated, and "trim the script" is the wrong
                // remedy for that.
                if (evalRes?.failureClass === FAILURE_CLASS.ACOUSTIC) {
                  throw acousticBlockError(
                    [
                      {
                        sceneId: res.sceneId,
                        issues: evalRes.issues?.length ? evalRes.issues : ["acoustic failure"],
                      },
                    ],
                    attempt + 1,
                  );
                }
                throw pacingFloorBlockError(
                  `scene ${res.sceneId} measured ${compensation.measuredWpm} WPM, compensated at ` +
                    `${compensation.speed.toFixed(2)}x → still failing ` +
                    `(${evalRes?.issues?.join(", ") || "gate fail"})`,
                  [{ sceneId: res.sceneId }],
                );
              } else {
                // #252: a compensation of a gate-PASSED take may fall back to it —
                // that take is shippable by definition. Drop the override so the
                // cache meta stays consistent with the audio actually shipped.
                delete scene.ttsSpeed;
                console.warn(
                  `  ⚠️ [Pacing Loop] Scene ${res.sceneId} compensation take failed the gate ` +
                    `(${evalRes?.issues?.join(", ") || "unknown"}) — keeping the original take`,
                );
                // #786: say it out loud when the take we fall back to is below
                // the #244 hook floor. This is the one path where a finished
                // hook can still ship under 1.1x: the floor asked for a faster
                // take, the faster take failed the gate, and the approved audio
                // is all we have. Next run retries (the cache hit keeps its 1.0x
                // speed, so the ladder asks again), but the log must not read
                // like a normal fallback.
                const shipped = takeSpeedById.get(res.sceneId);
                if (
                  (scene.refStyle || scene.visualType) === "hook" &&
                  Number.isFinite(shipped) &&
                  shipped < HOOK_MIN_SPEED
                ) {
                  console.warn(
                    `  ⚠️ [Pacing Loop] Scene ${res.sceneId} is a hook and ships at ` +
                      `${shipped.toFixed(2)}x, below the ${HOOK_MIN_SPEED}x floor — ` +
                      `the only faster take was rejected by the gate`,
                  );
                }
              }
            }
          }
        } finally {
          cleanupRegenStaging(pacingStaging);
        }
      }
    } catch (gateErr) {
      if (gateErr?.failClosed) {
        // #252/#271 acceptance: hard blocks are never downgraded to
        // warning-and-continue (#246 shipped 257 WPM; #271 shipped unrepaired
        // slow takes). `markFailClosed` is the only producer of these errors,
        // so the marker is the whole test. They supersede non-strict mode; the
        // operator escape hatch is TTS_SKIP_QUALITY_GATE=1, which skips the
        // gate block above.
        //
        // #704: CosyVoice3-MLX is the one engine whose bad takes are an engine
        // defect rather than a script defect — the failed scenes get ONE
        // regeneration on the local F5-MLX engine. When that succeeds the run
        // continues (missing-audio guard + finalize below); when it does not,
        // the original block stands untouched.
        if (!(await attemptLocalFallback(gateErr))) throw gateErr;
      } else if (options.strictQualityGate || process.env.TTS_STRICT_QUALITY_GATE === "1") {
        throw gateErr;
      } else {
        console.warn(`  ⚠️ TTS Quality Gate encountered error: ${gateErr.message}`);
      }
    } finally {
      // #423: settle the trust state of every take the run evaluated — on the
      // success path and on every abort path (hard block, unexpected error).
      // A run that dies after paying for GPU takes must leave them
      // re-verifiable, never invisible.
      try {
        settleTakes();
      } catch (err) {
        console.warn(`  ⚠️ TTS cache settle failed: ${err.message}`);
      }
    }
  }

  // Cache trust settling (#423) lives with the verification block above:
  //   - `settleTakes()` runs in the block's finally and writes the
  //     approved/candidate state of every evaluated take on every exit path;
  //   - a run whose gate was skipped (fake engine / TTS_SKIP_QUALITY_GATE=1)
  //     never evaluated anything, so its takes are recorded as candidates —
  //     usable, explicitly unverified, re-checked by the next run.
  // Settling happens BEFORE the missing-audio guard below: that guard throws
  // on an incomplete run, and a skip-gate run that aborts there must still
  // leave the takes it paid for re-verifiable, not meta-less.
  if (skipQualityGate) {
    try {
      settleTakesAsCandidates("gate-skipped");
    } catch (err) {
      console.warn(`  ⚠️ TTS cache settle failed: ${err.message}`);
    }
  }

  // ── Missing-audio fail-closed guard (#241) ──
  // A scene that ends up with NO audio after generation + self-heal retries
  // must not be silently dropped: the video would render with a missing
  // voiceover segment (ant-lingbot-world-13b run: kernel timeout → non-strict
  // skip). Audio-present quality-gate failures keep the existing strict/
  // non-strict semantics above; absence of audio is always fatal unless the
  // operator explicitly opts out with TTS_ALLOW_PARTIAL_TTS=1.
  if (process.env.TTS_ALLOW_PARTIAL_TTS !== "1") {
    const generatedIds = new Set(validatedResults.map((r) => r.sceneId));
    const missing = verifyScenes.filter((s) => !generatedIds.has(s.id));
    if (missing.length > 0) {
      throw new Error(
        `TTS produced no audio for scene(s) ${missing.map((s) => s.id).join(", ")} ` +
          `after generation and self-heal retries. NOT continuing — a partial render ` +
          `would silently drop voiceover. Fix the failing scene(s) (retry, shorten the ` +
          `text, or set TTS_ENGINE) or set TTS_ALLOW_PARTIAL_TTS=1 to accept a partial run.`,
      );
    }
  }

  // Scene-order merge + alignment tail — shared with the full-cache-hit path
  // above so both exits of this function can never drift apart again (#421).
  return finalizeTtsResults(scenes, cachedResults, validatedResults, outputDir, {
    runAlignment,
    useCache,
  });
}
