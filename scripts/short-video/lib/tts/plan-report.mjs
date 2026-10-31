/**
 * TTS cache & cost preview (#953).
 *
 * The planner (cache.mjs / planTtsScenes) already knows which scenes will be
 * regenerated and why — it used to surface only an aggregate count, and only
 * inside generateTTSWithEngine, i.e. after the decision to push was made.
 * This module turns that plan into one human-readable statement of the spend:
 *
 *   - which scenes regenerate and why (text-changed / engine-changed / ...);
 *   - how much text that is and roughly how long it speaks;
 *   - a static per-engine time estimate (no network probe, no GPU);
 *   - the pacing precheck for takes that are already approved.
 *
 * One builder/formatter feeds all three surfaces — the pipeline log right
 * before engine.generate(), `main.mjs --tts-plan`, and
 * `verify-video.mjs --pre` — so they cannot drift into pricing different plans.
 *
 * Cost model sources:
 *   - Kaggle CUDA ~8-10 min/batch: docs/video-production-runbook.md (engine table).
 *   - CosyVoice3-MLX RTF 0.64-0.87x: docs/video-production-runbook.md.
 *   - F5-TTS-MLX RTF 1.78x: docs/research/voice-cloning-solutions-m2-pro.md.
 *   - Speech rate floors (~2.4 EN words/s, 4.4 CJK chars/s):
 *     docs/research/voiceover-pacing-research.md. Using the floor (slowest)
 *     keeps the estimate from under-pricing a run.
 *
 * Modal runs the same CUDA kernel as Kaggle; there is no measured Modal batch
 * baseline in the repo, so its estimate reuses the Kaggle range and says so.
 * Engines without any published baseline (edge-tts / say) return `unknown`
 * rather than a made-up number.
 */

/** @typedef {{id: number, voiceover?: string, ttsText?: string}} PlanScene */

const EN_WORDS_PER_SECOND = 2.4;
const CJK_CHARS_PER_SECOND = 4.4;
const LATIN_WORD_RE = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;
const CJK_RE = /[\u3400-\u9fff]/g;

const KAGGLE_BATCH = {
  kind: "batch",
  fixedSeconds: [480, 600],
  perSceneSeconds: [15, 15],
  note: "Kaggle batch: ~8-10 min cold start + ~15 s/scene; queue/retry not included",
};

/**
 * Static per-engine models. Deliberately data, not code: the numbers are the
 * documented baselines, and an engine without one falls through to `unknown`.
 */
const ENGINE_COST_MODELS = {
  "cosyvoice3-kaggle-cuda": KAGGLE_BATCH,
  "cosyvoice3-modal-cuda": {
    ...KAGGLE_BATCH,
    note: "same CUDA batch shape as Kaggle; no measured Modal baseline — order-of-magnitude only",
  },
  "cosyvoice3-mlx": {
    kind: "rtf",
    rtf: [0.64, 0.87],
    note: "local MLX generation only (model load excluded)",
  },
  "f5-mlx": {
    kind: "rtf",
    rtf: [1.78, 1.78],
    note: "local MLX generation only (model load excluded)",
  },
};

function textOf(scene) {
  return scene?.ttsText || scene?.voiceover || "";
}

/**
 * Rough spoken duration of the given scenes, from the documented rate floors.
 *
 * @param {Array<PlanScene>} scenes
 * @returns {number} seconds
 */
export function estimateSpeechSeconds(scenes) {
  let seconds = 0;
  for (const scene of scenes ?? []) {
    const text = textOf(scene);
    const words = (text.match(LATIN_WORD_RE) ?? []).length;
    const cjk = (text.match(CJK_RE) ?? []).length;
    seconds += words / EN_WORDS_PER_SECOND + cjk / CJK_CHARS_PER_SECOND;
  }
  return seconds;
}

/**
 * @param {string} engineName
 * @param {Array<PlanScene>} pendingScenes
 * @returns {{kind: "batch"|"rtf"|"unknown", minSeconds: number|null, maxSeconds: number|null, note: string, speechSeconds: number}}
 */
export function estimateTtsSpend(engineName, pendingScenes) {
  const scenes = pendingScenes ?? [];
  const speechSeconds = estimateSpeechSeconds(scenes);
  const model = ENGINE_COST_MODELS[engineName];
  if (!model) {
    return {
      kind: "unknown",
      minSeconds: null,
      maxSeconds: null,
      note: `no published baseline for ${engineName} — ${scenes.length} scene(s) pending`,
      speechSeconds,
    };
  }
  if (model.kind === "batch") {
    return {
      kind: "batch",
      minSeconds: model.fixedSeconds[0] + scenes.length * model.perSceneSeconds[0],
      maxSeconds: model.fixedSeconds[1] + scenes.length * model.perSceneSeconds[1],
      note: model.note,
      speechSeconds,
    };
  }
  return {
    kind: "rtf",
    minSeconds: speechSeconds * model.rtf[0],
    maxSeconds: speechSeconds * model.rtf[1],
    note: model.note,
    speechSeconds,
  };
}

/**
 * Build the structured report. `plan` is the planTtsScenes() result (or null
 * when the cache is disabled); `pacing` is the planCachedPacing() result when
 * the caller already has it.
 *
 * @param {object} args
 * @param {{name: string, info?: string}} args.engine
 * @param {Array<PlanScene>} args.scenes
 * @param {object|null} args.plan
 * @param {object|null} [args.pacing]
 * @param {boolean} [args.useCache]
 * @returns {object}
 */
export function buildTtsPlan({
  engine,
  scenes,
  plan,
  pacing = null,
  pacingSkipped = null,
  hints = [],
  useCache = true,
}) {
  const allScenes = scenes ?? [];
  const pendingScenes = useCache ? (plan?.pending ?? []) : allScenes;
  const approvedCount = useCache ? (plan?.approved?.length ?? 0) : 0;
  const candidateCount = useCache ? (plan?.candidates?.length ?? 0) : 0;
  const reasonById = new Map((plan?.misses ?? []).map((m) => [m.sceneId, m.reason]));
  const byId = new Map(allScenes.map((s) => [s.id, s]));

  const pending = pendingScenes.map((scene) => {
    const source = byId.get(scene.id) ?? scene;
    return {
      sceneId: scene.id,
      // Mocked plans (tests, future callers) may omit misses — say unknown
      // instead of crashing the run that was about to spend the money.
      reason: useCache ? (reasonById.get(scene.id) ?? "unknown") : "cache-disabled",
      chars: textOf(source).length,
    };
  });

  const candidates = useCache
    ? (plan?.candidates ?? []).map((c) => ({ sceneId: c.sceneId, reason: c.reason ?? "unknown" }))
    : [];

  const pendingSourceScenes = pending.map((p) => byId.get(p.sceneId)).filter(Boolean);
  return {
    engineName: engine?.name ?? "unknown",
    engineInfo: engine?.info ?? engine?.name ?? "unknown",
    useCache,
    totalScenes: allScenes.length,
    approvedCount,
    candidateCount,
    pendingCount: pending.length,
    pending,
    candidates,
    pendingChars: pending.reduce((sum, p) => sum + p.chars, 0),
    spend: estimateTtsSpend(engine?.name, pendingSourceScenes),
    pacing,
    pacingSkipped,
    hints,
  };
}

function formatMinutesRange(minSeconds, maxSeconds) {
  const low = Math.max(1, Math.round(minSeconds / 60));
  const high = Math.max(low, Math.round(maxSeconds / 60));
  return `~${low}–${high} min`;
}

function formatSecondsRange(minSeconds, maxSeconds) {
  const low = Math.max(1, Math.round(minSeconds));
  const high = Math.max(low, Math.round(maxSeconds));
  return `~${low}–${high} s`;
}

function formatSpendShort(spend) {
  if (spend.kind === "unknown") return `time unknown (${spend.note})`;
  if (spend.kind === "rtf") return formatSecondsRange(spend.minSeconds, spend.maxSeconds);
  return formatMinutesRange(spend.minSeconds, spend.maxSeconds);
}

function formatSpendLong(spend) {
  if (spend.kind === "unknown") return `unknown — ${spend.note}`;
  if (spend.kind === "rtf") {
    return `${formatSecondsRange(spend.minSeconds, spend.maxSeconds)} (${spend.note})`;
  }
  return `${formatMinutesRange(spend.minSeconds, spend.maxSeconds)} (${spend.note})`;
}

function formatPacingLines(pacing) {
  if (!pacing) return [];
  const compensations = pacing.compensations ?? [];
  const rerolls = pacing.rerolls ?? [];
  const lines = [];
  if (Array.isArray(pacing.evaluations) && pacing.evaluations.length === 0) {
    lines.push("   🧭 pacing precheck (approved takes): no approved takes to judge");
    return lines;
  }
  if (compensations.length === 0 && rerolls.length === 0) {
    lines.push("   🧭 pacing precheck (approved takes): no compensation/reroll planned");
    return lines;
  }
  lines.push(
    `   🧭 pacing precheck (approved takes): ${compensations.length} compensation(s), ` +
      `${rerolls.length} reroll(s) — locally planned, no extra GPU until accepted`,
  );
  for (const c of compensations) {
    lines.push(`      • scene ${c.scene?.id} — ${c.measuredWpm} WPM → ${c.speed}x (${c.reason})`);
  }
  for (const r of rerolls) {
    lines.push(`      • scene ${r.scene?.id} — ${r.measuredWpm} WPM → reroll (${r.reason})`);
  }
  for (const advisory of pacing.advisory ?? []) {
    lines.push(`      · advisory: ${advisory}`);
  }
  return lines;
}

/**
 * Multi-line preview for the dry-run surfaces (--tts-plan / --pre).
 *
 * @param {object} report - buildTtsPlan() result
 * @returns {string}
 */
export function formatTtsPlan(report) {
  const lines = [];
  lines.push("🎛️  TTS Cache & Cost Plan — no GPU started, no files written");
  lines.push(`   Engine: ${report.engineInfo}`);
  if (!report.useCache) {
    lines.push("   ⚠️  cache disabled (TTS_NO_CACHE=1) — every scene regenerates");
  } else {
    lines.push(
      `   Cache: ${report.approvedCount} approved · ${report.candidateCount} candidate · ` +
        `${report.pendingCount} to generate — ${report.totalScenes} scenes`,
    );
  }
  if (report.candidates.length > 0) {
    lines.push(
      `   ♻️  local re-verify (no GPU): ${report.candidates
        .map((c) => `scene ${c.sceneId} (${c.reason})`)
        .join(" · ")}`,
    );
  }
  if (report.pendingCount > 0) {
    lines.push(
      `   ⏳ generate: ${report.pending
        .map((p) => `scene ${p.sceneId} (${p.reason}, ${p.chars} chars)`)
        .join(" · ")}`,
    );
    lines.push(
      `   📝 pending text: ${report.pendingChars} chars ≈ ${report.spend.speechSeconds.toFixed(1)}s of speech`,
    );
    lines.push(`   ⏱️  estimated TTS cost: ${formatSpendLong(report.spend)}`);
    lines.push(
      "   💡 Every extra pipeline round pays the cold start again — merge script edits into one run.",
    );
  } else {
    lines.push("   ✅ nothing to generate — every scene is an approved cache hit.");
  }
  for (const hint of report.hints ?? []) {
    lines.push(`   📏 ${hint}`);
  }
  if (report.pacingSkipped) {
    lines.push(`   🧭 pacing precheck: skipped — ${report.pacingSkipped}`);
  }
  lines.push(...formatPacingLines(report.pacing));
  return lines.join("\n");
}

/**
 * Compact log emitted by generateTTSWithEngine right before engine.generate().
 *
 * @param {object} report - buildTtsPlan() result
 * @returns {string[]}
 */
export function formatPendingGenerationLog(report) {
  const header = report.useCache
    ? `  🧮 TTS spend plan: ${report.pendingCount}/${report.totalScenes} scene(s) will regenerate — ${formatSpendShort(report.spend)}`
    : `  🧮 TTS spend plan: cache disabled (TTS_NO_CACHE=1) — all ${report.totalScenes} scene(s) will regenerate — ${formatSpendShort(report.spend)}`;
  const lines = [header];
  for (const p of report.pending) {
    lines.push(`     • scene ${p.sceneId} — ${p.reason}, ${p.chars} chars`);
  }
  lines.push(
    `     📝 ${report.pendingChars} chars ≈ ${report.spend.speechSeconds.toFixed(1)}s of speech` +
      (report.useCache ? " — merge edits into one run to share the cold start" : ""),
  );
  return lines;
}

/**
 * Clone the authored scenes and apply the SAME in-memory normalizations the
 * pipeline applies before TTS (Steps 0.5 currency + 0.6 TTS text). Cache keys
 * are computed from the normalized spoken text, so planning on raw scene data
 * would report misses that the real run does not have (and vice versa).
 *
 * The clone is deliberate: verify-video's checks must keep judging authored
 * text, and --tts-plan must not mutate main.mjs's scenes.
 *
 * @param {Array<object>} scenes
 * @param {object} [meta]
 * @returns {Promise<Array<object>>}
 */
export async function prepareScenesForPlan(scenes, meta = {}) {
  const clone = structuredClone(scenes);
  const { normalizeSceneData } = await import("../normalize-currency.mjs");
  const { normalizeTtsText } = await import("../normalize-tts-text.mjs");
  normalizeSceneData(clone, meta);
  normalizeTtsText(clone, meta);
  return clone;
}
