/**
 * Dry-run TTS preview pipeline (#953).
 *
 * One entry for both dry-run surfaces (`main.mjs --tts-plan` and
 * `verify-video.mjs --pre`) so they cannot drift into pricing different plans —
 * the duplication this replaces had already produced three divergences from
 * the real run: `TTS_NO_CACHE` ignored, `TTS_SKIP_QUALITY_GATE` ignored, and
 * approved takes judged before their recorded `ttsSpeed` was applied.
 *
 * Mirrors generateTTSWithEngine's plan step exactly, minus every write:
 *   1. clone + apply Steps 0.5/0.6 normalizations (cache keys use ttsText);
 *   2. select the engine (local CLI probes only — no GPU, no network);
 *   3. plan the cache with TTS_NO_CACHE honoured;
 *   4. seed approved takes' recorded speed, then run the same pure pacing
 *      precheck the run uses (skipped under TTS_SKIP_QUALITY_GATE, as there);
 *   5. static word/breath hints for pending scenes (no prosody probe).
 */

import { planTtsScenes } from "./cache.mjs";
import { qualityGateSkipped } from "./failure-class.mjs";
import { planCachedPacing } from "./pacing-plan.mjs";
import { buildTtsPlan, prepareScenesForPlan } from "./plan-report.mjs";
import { selectEngine } from "./registry.mjs";

/**
 * @param {object} args
 * @param {Array<object>} args.scenes - authored scenes (never mutated)
 * @param {object} [args.meta]
 * @param {string} args.audioDir - output/<pipelineId>/audio
 * @param {object} [args.env] - env source (test seam); defaults to process.env
 * @param {object|null} [args.engine] - pre-selected engine (test seam)
 * @returns {Promise<{engine: object, scenes: Array<object>, plan: object|null, pacing: object|null, report: object}>}
 */
export async function previewTtsPlan({
  scenes,
  meta = {},
  audioDir,
  env = process.env,
  engine = null,
}) {
  const useCache = env.TTS_NO_CACHE !== "1";
  const plannedScenes = await prepareScenesForPlan(scenes, meta);
  const selectedEngine = engine ?? (await selectEngine());
  const plan = useCache ? planTtsScenes(audioDir, plannedScenes, selectedEngine) : null;

  const pacingSkipped = !useCache
    ? "cache disabled (TTS_NO_CACHE=1)"
    : qualityGateSkipped(env)
      ? "quality gate skipped (TTS_SKIP_QUALITY_GATE=1)"
      : null;

  let pacing = null;
  if (useCache && plan && !pacingSkipped) {
    // Mirror generateTTSWithEngine: an approved take must be judged at the
    // speed recorded on disk, or the preview plans a compensation (e.g. a
    // 1.2x hook shown as "→ 1.1x") the run would never execute.
    for (const hit of plan.approved) {
      const scene = plannedScenes.find((s) => s.id === hit.sceneId);
      if (scene && Number.isFinite(hit.ttsSpeed)) scene.ttsSpeed = hit.ttsSpeed;
    }
    pacing = await planCachedPacing(plannedScenes, plan.approved);
  }

  const hints = plan ? await pendingWordHints(plan) : [];
  const report = buildTtsPlan({
    engine: selectedEngine,
    scenes: plannedScenes,
    plan,
    pacing,
    useCache,
    pacingSkipped,
    hints,
  });
  return { engine: selectedEngine, scenes: plannedScenes, plan, pacing, report };
}

/**
 * Static breath/word hints for the scenes about to be (re)generated — the
 * OQ2 decision: `scene-rules.mjs` checks only, no prosody-probe subprocess.
 * Long lines are the ones that come back needing a pacing reroll, i.e. a
 * second batch; naming them before the first batch is the point.
 *
 * @param {{pending: Array<object>}} plan
 * @returns {Promise<string[]>}
 */
async function pendingWordHints(plan) {
  if (!plan || plan.pending.length === 0) return [];
  const { checkOneBreath } = await import("../scene-rules.mjs");
  const result = checkOneBreath(plan.pending)[0];
  if (!result || result.level !== "warn") return [];
  return [`${result.check} — ${result.detail}; split long lines before paying for a batch`];
}
