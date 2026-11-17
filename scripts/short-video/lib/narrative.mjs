/**
 * Narrative arc audit — E/I/P/R over the whole pack (#1398).
 *
 * Amini et al. (CHI 2015) code professional data videos into Establish,
 * Initial, Peak and Release units. The useful part for this pipeline is not
 * the label set but two pack-level constraints: exactly one peak, and data
 * before that peak. Scene-level gates cannot see either.
 *
 * This module is advisory by design. `arcRole` is a new field rather than a
 * reuse of `narrativeRole`: the legacy field already carries S/T/A/R codes
 * (Setup, Tease, Argument, Resolution) that drive the retention checks, and
 * overloading it would silently change those checks' meaning.
 */

export const NARRATIVE_ARC_ROLES = Object.freeze(["establisher", "initial", "peak", "release"]);

const LEGACY_NARRATIVE_ROLES = Object.freeze(["S", "T", "A", "R", "T-Tell"]);

const CHECK = "Narrative arc (E/I/P/R, one peak at 35–65%)";
const CATEGORY = "Narrative";
const PEAK_MIN_RATIO = 0.35;
const PEAK_MAX_RATIO = 0.65;

/**
 * The v2 arc role on a scene, or null when absent/invalid. Legacy
 * `narrativeRole` values are deliberately not mapped: S/T/A/R does not encode
 * a peak, so pretending it does would manufacture a pass.
 *
 * @param {{arcRole?: string}} scene
 * @returns {"establisher"|"initial"|"peak"|"release"|null}
 */
export function sceneRole(scene) {
  const role = scene?.arcRole;
  return NARRATIVE_ARC_ROLES.includes(role) ? role : null;
}

function durationMap(opts = {}) {
  const rows = Array.isArray(opts.sceneDurations) ? opts.sceneDurations : [];
  const map = new Map();
  for (const row of rows) {
    if (row && Number.isFinite(row.duration) && row.duration > 0)
      map.set(row.sceneId, row.duration);
  }
  return map;
}

function durationFor(scene, index, map) {
  return map.get(scene.id) ?? map.get(index) ?? 1;
}

/**
 * Location of the single explicit peak as a fraction of pack duration.
 *
 * The reported position is the peak scene's midpoint, not its start: a 20 s
 * peak scene starting at 40% sits at 50%, and that is the number a reviewer
 * means by "the peak is mid-video". The ratio is inclusive at both edges.
 *
 * Returns null when there is not exactly one explicit peak or the pack has no
 * positive duration. A null duration map falls back to one unit per scene, so
 * callers without audio can still get a structural position.
 *
 * @param {Array<{id?: number, arcRole?: string}>} scenes
 * @param {{sceneDurations?: Array<{sceneId: number, duration: number}>}} [opts]
 * @returns {null | {index: number, sceneId: number|undefined, startRatio: number, endRatio: number, midpointRatio: number, duration: number, totalDuration: number}}
 */
export function peakPosition(scenes, opts = {}) {
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  const peaks = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => sceneRole(scene) === "peak");
  if (peaks.length !== 1) return null;

  const map = durationMap(opts);
  const durations = scenes.map((scene, index) => durationFor(scene, index, map));
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
  if (!(totalDuration > 0)) return null;

  const { scene, index } = peaks[0];
  const before = durations.slice(0, index).reduce((sum, duration) => sum + duration, 0);
  const duration = durations[index];
  const startRatio = before / totalDuration;
  const endRatio = (before + duration) / totalDuration;
  return {
    index,
    sceneId: scene.id,
    startRatio,
    endRatio,
    midpointRatio: (startRatio + endRatio) / 2,
    duration,
    totalDuration,
  };
}

function isChartScene(scene) {
  return Boolean(scene?.info) || Boolean(scene?.chart);
}

function row(level, detail, fix) {
  return { level, category: CATEGORY, check: CHECK, detail, ...(fix ? { fix } : {}) };
}

/**
 * Audit the pack's E/I/P/R arc.
 *
 * Output levels are pass/warn. The runner downgrades every editorial row to
 * `advisory`; keeping pass/warn here means the same function can be promoted
 * later without changing its contract.
 *
 * @param {Array<{id?: number, arcRole?: string, narrativeRole?: string, info?: object, chart?: object}>} scenes
 * @param {{sceneDurations?: Array<{sceneId: number, duration: number}>}} [opts]
 * @returns {Array<{level: string, category: string, check: string, detail?: string, fix?: string}>}
 */
export function auditNarrativeArc(scenes, opts = {}) {
  if (!Array.isArray(scenes) || scenes.length < 4) {
    return [row("pass", "Pack has fewer than 4 scenes — arc audit not applicable")];
  }

  const roles = scenes.map(sceneRole);
  const declaredCount = roles.filter(Boolean).length;
  if (declaredCount === 0) {
    const legacy = scenes
      .filter((scene) => LEGACY_NARRATIVE_ROLES.includes(scene?.narrativeRole))
      .map((scene) => scene.id)
      .filter((id) => id !== undefined);
    const detail = legacy.length
      ? `No explicit \`arcRole\`; legacy \`narrativeRole\` S/T/A/R found on scenes ${legacy.join(", ")}. Legacy codes do not encode a peak.`
      : "No scene declares `arcRole` (establisher / initial / peak / release).";
    return [
      row(
        "warn",
        detail,
        'Add `arcRole: "peak"` to one mid-video scene and `arcRole: "establisher"` / `"release"` to the hook / CTA. Keep `narrativeRole` for the legacy S/T/A/R retention checks.',
      ),
    ];
  }

  const findings = [];

  for (const [index, scene] of scenes.entries()) {
    if (scene?.arcRole !== undefined && !NARRATIVE_ARC_ROLES.includes(scene.arcRole)) {
      findings.push(
        row(
          "warn",
          `Scene ${scene.id ?? index + 1} has unknown arcRole "${scene.arcRole}".`,
          `Use one of: ${NARRATIVE_ARC_ROLES.join(", ")}.`,
        ),
      );
    }
  }

  const peaks = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => sceneRole(scene) === "peak");

  if (peaks.length === 0) {
    findings.push(
      row(
        "warn",
        'No scene declares `arcRole: "peak"`.',
        "Mark exactly one scene in the 35–65% duration band as the peak; the peak is the data point the pack exists to deliver.",
      ),
    );
  } else if (peaks.length > 1) {
    findings.push(
      row(
        "warn",
        `${peaks.length} scenes declare \`arcRole: \"peak\"\` (scenes ${peaks.map(({ scene }) => scene.id).join(", ")}); exactly one is allowed.`,
        "Keep the strongest single peak and move the others to `initial` or `release`.",
      ),
    );
  }

  const position = peakPosition(scenes, opts);
  if (peaks.length === 1 && !position) {
    findings.push(row("warn", "Peak position cannot be computed: pack duration is not positive."));
  } else if (position) {
    const percent = (position.midpointRatio * 100).toFixed(0);
    if (position.midpointRatio < PEAK_MIN_RATIO || position.midpointRatio > PEAK_MAX_RATIO) {
      findings.push(
        row(
          "warn",
          `Peak scene ${position.sceneId ?? position.index + 1} sits at ${percent}% of duration; the band is 35–65%.`,
          "Move the peak scene toward the middle of the pack (re-order scenes or change its duration), not just its label.",
        ),
      );
    }

    const chartBeforePeak = scenes.slice(0, position.index).some(isChartScene);
    const hasChart = scenes.some(isChartScene);
    if (hasChart && !chartBeforePeak) {
      findings.push(
        row(
          "warn",
          `Pack contains a chart, but no chart scene precedes the peak at ${percent}%.`,
          "Put the evidence before the payoff: move or add a native chart scene before the peak.",
        ),
      );
    }
  }

  if (roles[0] !== "establisher") {
    findings.push(
      row(
        "warn",
        `Hook scene ${scenes[0].id ?? 1} has arcRole "${roles[0] ?? "unset"}"; the hook is the establisher.`,
        'Set `arcRole: "establisher"` on the hook scene.',
      ),
    );
  }
  if (roles[roles.length - 1] !== "release") {
    findings.push(
      row(
        "warn",
        `Closing scene ${scenes[scenes.length - 1].id ?? scenes.length} has arcRole "${roles[roles.length - 1] ?? "unset"}"; the CTA/closing scene is the release.`,
        'Set `arcRole: "release"` on the closing scene.',
      ),
    );
  }

  if (findings.length === 0) {
    const percent = ((position?.midpointRatio ?? 0) * 100).toFixed(0);
    return [
      row(
        "pass",
        `One peak at ${percent}% with a chart before it; hook establishes and closing scene releases.`,
      ),
    ];
  }
  return findings;
}
