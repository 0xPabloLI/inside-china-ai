/**
 * TTS engine registry — selection + delegation.
 *
 * selectEngine() tries engines in priority order (or respects TTS_ENGINE
 * env override). generateTTS() delegates to the selected engine and runs
 * subtitle alignment afterwards.
 *
 * Engine priority (updated 2026-09-08):
 *   1. CosyVoice3-Kaggle-CUDA (DEFAULT — P100 GPU, full emotion fidelity, Apache-2.0, ~8-10min/batch)
 *   2. CosyVoice3-Modal-CUDA (PAID FALLBACK — A100 GPU, same CUDA emotion as Kaggle, ~$0.20-0.50/batch, used when Kaggle quota exhausted)
 *   3. CosyVoice3-NPU (FREE FALLBACK — Ascend 910B, emotion slightly flat vs CUDA similar to MPS, RTF ~2.2x, no Kaggle/Modal quota needed)
 *   4. CosyVoice3-MLX (LOCAL FALLBACK — emotion regression vs CUDA, but fast RTF 0.64-0.87x)
 *   5. F5-TTS-MLX (BACKUP — good rhythm, natural pacing, internal duration control, CC-BY-NC)
 *
 * Manual opt-in only — NOT part of automatic fallback (user rule 2026-09-10):
 * these engines never run unless TTS_ENGINE explicitly names them:
 *   6. Qwen3-TTS (good emphasis on data points, no duration control)
 *   7. edge-tts (Microsoft neural TTS, no cloning)
 *   8. macOS `say` (last resort, no cloning)
 *
 * Why CUDA engines first: MPS/MLX/NPU emotion regression verified 2026-09-08 —
 * CoreML EP + float32 patches + MPS fallback did NOT close the emotion gap vs
 * CUDA. NPU (Ascend 910B) emotion is similar to MPS (slightly flat hook/shock).
 * Kaggle P100 CUDA matches A100 emotion baseline exactly. Modal A100 is the same
 * CUDA EP — used when Kaggle's 30h/week quota runs out (Modal ~$30/mo).
 *
 * All local models run at MAX EFFORT by default (see docs/video-production-runbook.md).
 * Unified venv: ~/.video-tts-env (Python 3.12) — CosyVoice3 + F5 + Qwen + whisperx all in one.
 */

import { createCosyVoice3KaggleCudaEngine } from "./cosyvoice3-kaggle-cuda.mjs";
import { createCosyVoice3ModalCudaEngine } from "./cosyvoice3-modal-cuda.mjs";
import { createCosyVoice3NPUEngine } from "./cosyvoice3-npu.mjs";
import { createCosyVoice3MLXEngine } from "./cosyvoice3-mlx.mjs";
import { createF5MLXEngine } from "./f5-mlx.mjs";
import { createQwenTTSEngine } from "./qwen-tts.mjs";
import { createEdgeTTSEngine } from "./edge-tts.mjs";
import { createSayEngine } from "./say.mjs";
import { runForcedAlignment, getAtempo } from "./post-process.mjs";
import { planTtsScenes, writeSceneMeta, computeSceneKey } from "./cache.mjs";
import { resolveSceneSpeed } from "./pacing.mjs";

/**
 * Engine factory map. Keys are both the canonical name and TTS_ENGINE aliases.
 * @type {Record<string, () => Promise<TTSEngine|null>>}
 */
const ENGINE_FACTORIES = {
  "cosyvoice3-kaggle-cuda": createCosyVoice3KaggleCudaEngine,
  "cosyvoice3-cuda": createCosyVoice3KaggleCudaEngine,
  "cosyvoice3-modal-cuda": createCosyVoice3ModalCudaEngine,
  "cosyvoice3-npu": createCosyVoice3NPUEngine,
  npu: createCosyVoice3NPUEngine,
  "cosyvoice3-mlx": createCosyVoice3MLXEngine,
  cosyvoice3: createCosyVoice3MLXEngine,
  cv3: createCosyVoice3MLXEngine,
  "f5-mlx": createF5MLXEngine,
  f5: createF5MLXEngine,
  "qwen-tts": createQwenTTSEngine,
  qwen: createQwenTTSEngine,
  "edge-tts": createEdgeTTSEngine,
  say: createSayEngine,
};

/**
 * Priority order for AUTOMATIC selection (no TTS_ENGINE env).
 * Automatic fallback stops at f5-mlx — engines after it (qwen-tts, edge-tts,
 * say) are manual opt-in only and must never be selected by this loop
 * (user rule 2026-09-10).
 */
const PRIORITY = [
  "cosyvoice3-kaggle-cuda",
  "cosyvoice3-modal-cuda",
  "cosyvoice3-npu",
  "cosyvoice3-mlx",
  "f5-mlx",
];

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
    "No TTS engine available. Install Kaggle CLI (~/.kaggle/kaggle.json) or Modal CLI (modal token new), CosyVoice3-MLX + F5-TTS-MLX + Qwen3-TTS (~/.video-tts-env), edge-tts, or run on macOS.",
  );
}

/**
 * Generate TTS voiceover for all scenes.
 *
 * Delegates to the selected engine, then runs subtitle alignment.
 * Scene audio is cached across runs (see ./cache.mjs): scenes whose
 * (engine, engine config, text) key already has cached audio skip GPU
 * generation entirely. Set TTS_NO_CACHE=1 (or pass useCache:false) to
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
  console.log(`  TTS engine: ${engine.info}`);
  // Log actual post-processing based on engine config
  const steps = [];
  if (engine.useSilenceFilter) steps.push("silenceremove");
  if (engine.resample) steps.push("resample 44.1kHz");
  if (atempo) steps.push(`atempo ${atempo}x`);
  // loudnorm is always applied at video assembly stage
  steps.push("loudnorm (at assembly)");
  console.log(`  Post-process: ${steps.join(" + ")}`);

  // Split into cache hits and pending scenes (#198 Item 2). Results must be
  // reassembled in scene order — callers index-align ttsResults to scenes.
  let toGenerate = scenes;
  let cachedResults = [];
  if (useCache) {
    const plan = planTtsScenes(outputDir, scenes, engine);
    if (plan.cached.length > 0) {
      console.log(
        `  💾 TTS cache: ${plan.cached.length}/${scenes.length} scenes reused (TTS_NO_CACHE=1 to force)`,
      );
    }
    cachedResults = plan.cached.map(({ sceneId, audioPath, duration }) => ({
      sceneId,
      audioPath,
      duration,
      cached: true,
    }));
    toGenerate = plan.pending;
  }
  if (toGenerate.length === 0) {
    return cachedResults;
  }

  const generatedResults = await engine.generate(toGenerate, outputDir);

  // ── Step: TTS Quality Gate & Self-Healing Loop (#225, #230) ──
  let validatedResults = generatedResults;
  const isFakeEngine =
    (engine.name && engine.name.toLowerCase().includes("fake")) ||
    (engine.info && engine.info.toLowerCase().includes("fake"));
  const skipQualityGate = options.skipQualityGate ?? (isFakeEngine || process.env.TTS_SKIP_QUALITY_GATE === "1");

  if (!skipQualityGate && toGenerate.length > 0) {
    try {
      const { runTtsQualityGate } = await import("./quality-gate.mjs");
      let gateReport = await runTtsQualityGate(toGenerate, validatedResults, options.qualityGateOptions);

      // If any scene failed Quality Gate and retry is enabled
      const maxRetries = options.maxRetries ?? parseInt(process.env.TTS_RETRY_COUNT || "2", 10);
      let attempt = 1;
      while (!gateReport.passed && attempt <= maxRetries) {
        const failedSceneIds = new Set(gateReport.evaluations.filter((e) => !e.passed).map((e) => e.sceneId));
        console.warn(`\n  🔄 [TTS Self-Healing Loop] Attempt ${attempt}/${maxRetries}: Regenerating ${failedSceneIds.size} failed scene(s)...`);
        const retryScenes = toGenerate.filter((s) => failedSceneIds.has(s.id));

        let retryResults = [];
        try {
          retryResults = await engine.generate(retryScenes, outputDir);
        } catch (err) {
          console.warn(`  ⚠️ Retry generation error: ${err.message}`);
        }

        if (retryResults.length > 0) {
          const retryGate = await runTtsQualityGate(retryScenes, retryResults, options.qualityGateOptions);
          for (const res of retryResults) {
            const evalRes = retryGate.evaluations.find((e) => e.sceneId === res.sceneId);
            if (evalRes && evalRes.passed) {
              const idx = validatedResults.findIndex((g) => g.sceneId === res.sceneId);
              if (idx >= 0) validatedResults[idx] = res;
              else validatedResults.push(res);
            }
          }
        }

        gateReport = await runTtsQualityGate(toGenerate, validatedResults, options.qualityGateOptions);
        if (gateReport.passed) {
          console.log(`  🎉 [TTS Self-Healing Loop] All scenes healed and passed Quality Gate!`);
          break;
        }
        attempt++;
      }

      if (!gateReport.passed) {
        const failed = gateReport.evaluations.filter((e) => !e.passed);
        const failSummary = failed.map((f) => `Scene ${f.sceneId} (${f.issues.join(", ")})`).join("; ");
        const msg = `TTS Quality Gate failed after ${attempt} attempt(s): ${failSummary}`;
        if (options.strictQualityGate || process.env.TTS_STRICT_QUALITY_GATE === "1") {
          throw new Error(msg);
        } else {
          console.warn(`  ⚠️ ${msg} (Continuing in non-strict mode)`);
        }
      }
    } catch (gateErr) {
      if (options.strictQualityGate || process.env.TTS_STRICT_QUALITY_GATE === "1") {
        throw gateErr;
      }
      console.warn(`  ⚠️ TTS Quality Gate encountered error: ${gateErr.message}`);
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
    const missing = toGenerate.filter((s) => !generatedIds.has(s.id));
    if (missing.length > 0) {
      throw new Error(
        `TTS produced no audio for scene(s) ${missing.map((s) => s.id).join(", ")} ` +
          `after generation and self-heal retries. NOT continuing — a partial render ` +
          `would silently drop voiceover. Fix the failing scene(s) (retry, shorten the ` +
          `text, or set TTS_ENGINE) or set TTS_ALLOW_PARTIAL_TTS=1 to accept a partial run.`,
      );
    }
  }

  // Persist cache meta for freshly generated scenes.
  if (useCache) {
    for (const r of validatedResults) {
      const scene = scenes.find((s) => s.id === r.sceneId);
      if (scene) {
        writeSceneMeta(outputDir, r.sceneId, {
          key: computeSceneKey(engine, scene.ttsText || scene.voiceover, resolveSceneSpeed(scene)),
          duration: r.duration,
          engine: engine.name,
          audioPath: r.audioPath,
        });
      }
    }
  }

  // Reassemble in scene order; drop scenes the engine skipped.
  const byId = new Map(validatedResults.map((r) => [r.sceneId, r]));
  const merged = [];
  for (const scene of scenes) {
    const hit = cachedResults.find((r) => r.sceneId === scene.id);
    if (hit) merged.push(hit);
    else if (byId.has(scene.id)) merged.push(byId.get(scene.id));
  }

  // Run subtitle alignment for accurate timing
  if (runAlignment) {
    const alignment = await runForcedAlignment(scenes, merged, outputDir);
    // #232: guards log per-scene detail during alignment; aggregate one line
    // at generation end so the HITL listening pass knows which scenes to
    // spot-check (crushed words) and that tail cuts were applied.
    const guards = alignment?.guards;
    if (guards && (guards.cuts.length > 0 || guards.crushedWords.length > 0)) {
      const crushedScenes = [...new Set(guards.crushedWords.map((w) => w.sceneId))];
      console.log(
        `  🛡️ Alignment guards (#232): ${guards.cuts.length} tail cut(s), ` +
          `${guards.crushedWords.length} crushed word(s)` +
          (crushedScenes.length ? ` — spot-check scene(s) ${crushedScenes.join(", ")}` : ""),
      );
    }
  }

  return merged;
}
