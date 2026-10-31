/**
 * Pacing precheck over APPROVED cache hits (#786, extracted for #953).
 *
 * Approved scenes skip re-verification by design (no ASR, no GPU), so the
 * pacing ladder would otherwise only judge takes generated in the current run.
 * Their approved durations are enough to reproduce the gate's own WPM metric,
 * which is what lets the dry-run preview price a re-run without starting one.
 *
 * Pure: reads scene objects + durations, no I/O, no engine.
 */

/**
 * @param {Array<object>} scenes
 * @param {Array<{sceneId: number, duration: number, ttsSpeed?: number}>} cachedResults
 * @returns {Promise<{scenes: Array<object>, evaluations: Array<object>, compensations: Array, rerolls: Array, advisory: string[]}>}
 */
export async function planCachedPacing(scenes, cachedResults) {
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
