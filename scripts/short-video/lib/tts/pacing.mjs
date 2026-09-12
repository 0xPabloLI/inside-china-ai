/**
 * Per-scene native TTS speed resolution + measured-WPM pacing feedback loop
 * (#235 decision table → #252 redesign).
 *
 * #252 policy (user-approved, supersedes the #235 static table):
 *
 * - Chinese scenes NEVER speed up: measured 236-288 chars/min is already the fast
 *   broadcast tier; 1.2x would break the ~300 chars/min ceiling (人民网/央广网).
 *   The #235 review note is explicit: 严禁全局统一提速.
 * - ALL English scenes baseline at 1.0. The #235 static pair (hook 1.0 /
 *   non-hook 1.2) is cancelled: it made narrative scenes measure FASTER than
 *   the hook (ant-lingbot-world-13b: hook 157 vs narrative 228/257 WPM — #246),
 *   inverting the energy curve. Whether a scene needs pace is decided by
 *   MEASURED WPM, not by scene class.
 * - Feedback loop (see planPacingResponse): first pass at 1.0 → Quality-Gate
 *   measured WPM → below 135 compensate with a per-scene `ttsSpeed` override
 *   (speed = 150/measured, clamp ≤1.2); above 225 reroll once (take drift
 *   ±10-20%, #234) and hard-block if the reroll still overshoots; in between
 *   keep. Hook vs narrative relative pace is an emergent property of
 *   measurement, not a static rule.
 * - TTS_SPEED env overrides the English baseline (escape hatch: 真包发赶 → 1.15).
 *   It never lifts the Chinese 1.0. An explicit scene.ttsSpeed (written by the
 *   loop, or set by hand in scene-data) beats the env.
 * - Everything clamps to [1.0, MAX_TTS_SPEED]: 1.5x native loses 36% spectral
 *   flux (transient smearing, STFT-measured); ElevenLabs' product ceiling is 1.2.
 *
 * The resolved speed feeds three consumers: the engine manifest (`speed`
 * entry, native kernel mel-interpolation — per-scene speed is honoured by the
 * cosyvoice3-kaggle-cuda engine; other engines currently apply a global speed
 * env), the scene cache key (cache.mjs — a speed change must not replay 1.0x
 * cached audio), and the scene meta (ttsSpeed field — keeps a compensated
 * take cache-stable across re-runs).
 */

/** Hard speed ceiling — spectral-flux and industry-product bound. */
export const MAX_TTS_SPEED = 1.2;

/** EN sweet-spot centre the loop compensates toward (#235 research: 140-160). */
export const WPM_TARGET = 150;

/**
 * Compensate below this measured WPM (not below the 140 sweet-spot edge —
 * measurement noise + take drift make chasing the edge oscillate; the
 * #252 review ladder fixes the trigger at 135 → native 1.1-1.2x).
 */
export const WPM_COMPENSATE_BELOW = 135;

/**
 * Hard ceiling. Above this the scene rerolls once and then hard-blocks
 * (#246: 257 WPM shipped as a warning; #252 acceptance forbids that).
 * Shares the value with quality-gate.mjs MAX_ACCEPTABLE_WPM.
 */
export const WPM_HARD_CEILING = 225;

/**
 * Detect a Chinese (CJK-dominant) scene text. CJK characters must make up at
 * least 30% of the letter count — mixed-script scenes with English product
 * names ("Qwen3.8-Flash-Next") stay classified by their prose language.
 * 0.3 is a classification guard, not a pacing constant: packages are
 * monolingual per scene (EN scripts quote CJK brand names only in passing),
 * and any threshold in (0.15, 0.6) classifies every scene in our packages
 * identically. No research source pins this number.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isChineseText(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cjk === 0) return false;
  const letters = (text.match(/[A-Za-z\u4e00-\u9fff]/g) || []).length;
  return letters > 0 && cjk / letters >= 0.3;
}

/** EN-detection aligned with quality-gate.mjs pacing checks. */
function isEnglishText(text) {
  return /[a-zA-Z]/.test(text || "");
}

function clampSpeed(speed) {
  return Math.min(Math.max(speed, 1.0), MAX_TTS_SPEED);
}

/** Whether the out-of-range TTS_SPEED warning has already been emitted. */
let warnedClamp = false;

/**
 * Resolve the native TTS speed for one scene.
 *
 * Precedence: explicit scene.ttsSpeed (feedback-loop compensation or a
 * hand-set scene field) > TTS_SPEED env (operator override) > baseline 1.0.
 * The env replaces the English baseline and never lifts the Chinese 1.0.
 *
 * @param {{id: number, voiceover?: string, ttsText?: string, visualType?: string, refStyle?: string, ttsSpeed?: number}} scene
 * @returns {number} speed multiplier in [1.0, 1.2]; 1.0 means "no compensation"
 */
export function resolveSceneSpeed(scene) {
  const text = scene?.ttsText || scene?.voiceover || "";
  // Chinese is already at the fast tier — never lift it, not even via env.
  if (isChineseText(text)) return 1.0;

  // Per-scene override: the feedback loop writes its measured compensation
  // here before the regeneration round; operators may set it by hand.
  const sceneSpeed = Number(scene?.ttsSpeed);
  if (Number.isFinite(sceneSpeed) && sceneSpeed > 0) {
    return clampSpeed(sceneSpeed);
  }

  const envSpeed = parseFloat(process.env.TTS_SPEED);
  if (Number.isFinite(envSpeed) && envSpeed > 0) {
    if ((envSpeed > MAX_TTS_SPEED || envSpeed < 1.0) && !warnedClamp) {
      console.warn(
        `  ⚠️ TTS_SPEED=${envSpeed} outside [1.0, ${MAX_TTS_SPEED}] (1.5x smears transients) — clamped`,
      );
      warnedClamp = true;
    }
    return clampSpeed(envSpeed);
  }

  return 1.0;
}

/**
 * Decide the pacing response for one scene from its MEASURED WPM
 * (Quality-Gate evaluation; the gate derives WPM from expected word count
 * over actual audio duration).
 *
 * Ladder (#252 review comment):
 *   measured >  WPM_HARD_CEILING (225) → "reroll"  (take drift first, #234)
 *   measured <  WPM_COMPENSATE_BELOW   → "compensate" (speed = 150/measured)
 *   otherwise                          → "keep"
 *
 * Only English scenes participate: whitespace WPM is not the ZH metric
 * (the Quality Gate likewise skips pacing checks for non-EN text).
 *
 * @param {{voiceover?: string, ttsText?: string}} scene
 * @param {number} measuredWpm - gate-measured WPM (expected words / audio duration)
 * @returns {{action: "keep"|"compensate"|"reroll", speed?: number, measuredWpm: number, reason: string}}
 */
export function planPacingResponse(scene, measuredWpm) {
  const text = scene?.ttsText || scene?.voiceover || "";
  const wpm = Number(measuredWpm);
  if (!isEnglishText(text) || !Number.isFinite(wpm) || wpm <= 0) {
    return { action: "keep", measuredWpm: wpm, reason: "no usable WPM measurement or non-EN scene" };
  }
  if (wpm > WPM_HARD_CEILING) {
    return {
      action: "reroll",
      measuredWpm: wpm,
      reason: `${wpm} WPM > ${WPM_HARD_CEILING} hard ceiling — reroll take (drift ±10-20%, #234)`,
    };
  }
  if (wpm < WPM_COMPENSATE_BELOW) {
    return {
      action: "compensate",
      speed: clampSpeed(WPM_TARGET / wpm),
      measuredWpm: wpm,
      reason: `${wpm} WPM < ${WPM_COMPENSATE_BELOW} — native speed compensation toward ${WPM_TARGET}`,
    };
  }
  return { action: "keep", measuredWpm: wpm, reason: `${wpm} WPM inside the keep band` };
}

/**
 * Batch-plan the feedback round from a Quality-Gate report. Only gate-PASSED
 * scenes are considered: gate-failed scenes are the self-heal loop's job, and
 * a double regeneration would race it.
 *
 * Advisory: flags a hook that still measures ≥15 WPM slower than the slowest
 * narrative — the #246 inversion pattern — as a write-side hint (no forced
 * regeneration; the loop never manufactures pace the script does not have).
 *
 * @param {Array<object>} scenes
 * @param {Array<{sceneId: number, passed: boolean, wpm?: number}>} evaluations
 * @returns {{
 *   compensations: Array<{scene: object, speed: number, measuredWpm: number, reason: string}>,
 *   rerolls: Array<{scene: object, measuredWpm: number, reason: string}>,
 *   advisory: string[],
 * }}
 */
export function planPacingResponses(scenes, evaluations) {
  const compensations = [];
  const rerolls = [];
  const advisory = [];

  const byId = new Map(scenes.map((s) => [s.id, s]));
  const hookWpms = [];
  const narrativeWpms = [];

  for (const ev of evaluations || []) {
    if (!ev?.passed) continue; // gate failures belong to the self-heal loop
    const scene = byId.get(ev.sceneId);
    if (!scene) continue;

    const plan = planPacingResponse(scene, ev.wpm);
    if (plan.action === "compensate") {
      compensations.push({ scene, speed: plan.speed, measuredWpm: plan.measuredWpm, reason: plan.reason });
    } else if (plan.action === "reroll") {
      rerolls.push({ scene, measuredWpm: plan.measuredWpm, reason: plan.reason });
    }

    // Relative-pace bookkeeping for the #246 advisory.
    const role = scene?.refStyle || scene?.visualType;
    if (Number.isFinite(ev.wpm) && ev.wpm > 0) {
      if (role === "hook") hookWpms.push(ev.wpm);
      else if (role && role !== "cta") narrativeWpms.push(ev.wpm);
    }
  }

  const slowestHook = hookWpms.length ? Math.min(...hookWpms) : null;
  const slowestNarrative = narrativeWpms.length ? Math.min(...narrativeWpms) : null;
  if (slowestHook !== null && slowestNarrative !== null && slowestHook < slowestNarrative - 15) {
    advisory.push(
      `hook measures ${slowestHook} WPM vs slowest narrative ${slowestNarrative} WPM — ` +
        `hook is the slowest part of the piece (#246 inversion). The loop only lifts scenes ` +
        `below ${WPM_COMPENSATE_BELOW} WPM; if both are in-band, tighten the hook script instead.`,
    );
  }

  return { compensations, rerolls, advisory };
}
