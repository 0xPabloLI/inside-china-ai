/**
 * Per-scene native TTS speed resolution (#235 — voiceover pacing).
 *
 * Policy (user-approved decision table on #235, refined by #234 paired-experiment
 * evidence — see docs/research/voiceover-pacing-research.md):
 *
 * - Chinese scenes NEVER speed up: measured 236-288 chars/min is already the fast
 *   broadcast tier; 1.2x would break the ~300 chars/min ceiling (人民网/央广网).
 *   The #235 review note is explicit: 严禁全局统一提速.
 * - English hook scenes stay at 1.0: the four-dimension hook prompt already
 *   measures 152-160 WPM — the upper edge of the 140-160 sweet spot. Acceleration
 *   would overshoot ("hook 不吃加速", #234 session evidence).
 * - Other English visualTypes default to 1.2: the 130 WPM baseline lands at
 *   ~156 WPM (decision table; the paired experiment proved `speed` is faithful —
 *   nominal 1.2 measures 1.201x, no systematic overshoot).
 * - TTS_SPEED env overrides the English default (escape hatch: 真包发赶 → 1.15).
 *   It never lifts the Chinese 1.0.
 * - Everything clamps to [1.0, MAX_TTS_SPEED]: 1.5x native loses 36% spectral
 *   flux (transient smearing, STFT-measured); ElevenLabs' product ceiling is 1.2.
 *
 * The resolved speed feeds two consumers: the engine manifest (`speed` entry,
 * native kernel mel-interpolation) and the scene cache key (cache.mjs — a speed
 * change must not replay 1.0x cached audio).
 */

/** Hard speed ceiling — spectral-flux and industry-product bound. */
export const MAX_TTS_SPEED = 1.2;

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
function isChineseText(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cjk === 0) return false;
  const letters = (text.match(/[A-Za-z\u4e00-\u9fff]/g) || []).length;
  return letters > 0 && cjk / letters >= 0.3;
}

function clampSpeed(speed) {
  return Math.min(Math.max(speed, 1.0), MAX_TTS_SPEED);
}

/** Whether the out-of-range TTS_SPEED warning has already been emitted. */
let warnedClamp = false;

/**
 * Resolve the native TTS speed for one scene.
 *
 * TTS_SPEED is an explicit operator override: besides replacing the English
 * default it also lifts the hook exemption — the operator takes manual
 * control of pace. It never lifts the Chinese 1.0 (no global speedup).
 *
 * @param {{id: number, voiceover?: string, ttsText?: string, visualType?: string, refStyle?: string}} scene
 * @returns {number} speed multiplier in [1.0, 1.2]; 1.0 means "no compensation"
 */
export function resolveSceneSpeed(scene) {
  const text = scene?.ttsText || scene?.voiceover || "";
  // Chinese is already at the fast tier — never lift it, not even via env.
  if (isChineseText(text)) return 1.0;

  const envSpeed = parseFloat(process.env.TTS_SPEED);
  const hookExempt = (scene?.refStyle || scene?.visualType) === "hook";
  const fallback = hookExempt ? 1.0 : 1.2;
  const speed = Number.isFinite(envSpeed) && envSpeed > 0 ? envSpeed : fallback;
  if (Number.isFinite(envSpeed) && envSpeed > 0 && (envSpeed > MAX_TTS_SPEED || envSpeed < 1.0) && !warnedClamp) {
    console.warn(
      `  ⚠️ TTS_SPEED=${envSpeed} outside [1.0, ${MAX_TTS_SPEED}] (1.5x smears transients) — clamped`,
    );
    warnedClamp = true;
  }
  return clampSpeed(speed);
}
