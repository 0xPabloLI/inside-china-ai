/**
 * Attention budget audit (#1398).
 *
 * Two failure modes are cheap to detect mechanically and expensive to see in
 * a timeline:
 *
 * 1. A scene declares more than one attention cue. Amini et al.'s cue count
 *    is about attention direction, not decoration; two cues compete and
 *    neither wins.
 * 2. Three or more consecutive information scenes use the same
 *    visualType:layout. The pack stops changing shape even though the words
 *    change, which is the visual equivalent of a monotone voice.
 *
 * The audit is advisory first. It never blocks a render.
 */

import { resolveRenderLayout } from "./text-slots.mjs";

const CHECK = "Attention budget (one cue per scene, no 3× same layout)";
const CATEGORY = "Attention";

/** Visual types that own an information layout (#1215). */
const INFORMATION_VISUAL_TYPES = Object.freeze([
  "stat-reveal",
  "data",
  "contrast",
  "context",
  "info-card",
]);

const INFO_TYPES = new Set(INFORMATION_VISUAL_TYPES);

/**
 * Normalize a scene's declared attention cues.
 *
 * `attention.cue` is normally a single string. Arrays are accepted so the
 * audit can report an over-budget scene rather than silently taking the first
 * entry; empty/non-string entries are ignored.
 *
 * @param {{attention?: {cue?: string|string[]}}} scene
 * @returns {string[]}
 */
export function declaredCues(scene) {
  const cue = scene?.attention?.cue;
  if (typeof cue === "string") {
    const trimmed = cue.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(cue)) {
    return cue
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Group consecutive information scenes by `visualType:layout`.
 *
 * A non-information scene (narrative, quote, fullscreen, hook, cta) always
 * breaks the run: the viewer has seen a different kind of shot, so the layout
 * repetition is no longer three-in-a-row. The key includes visualType because
 * `data:set-piece` and `stat-reveal:set-piece` are different templates even
 * when the layout string matches.
 *
 * @param {Array<{visualType?: string, layout?: string}>} scenes
 * @returns {Array<{key: string, visualType: string, layout: string, startIndex: number, endIndex: number, sceneIds: Array<number|undefined>, length: number}>}
 */
export function layoutRun(scenes) {
  if (!Array.isArray(scenes)) return [];
  const runs = [];
  let current = null;
  for (const [index, scene] of scenes.entries()) {
    if (!INFO_TYPES.has(scene?.visualType)) {
      current = null;
      continue;
    }
    const layout = resolveRenderLayout(scene);
    const key = `${scene.visualType}:${layout}`;
    if (current && current.key === key) {
      current.endIndex = index;
      current.sceneIds.push(scene.id);
      current.length += 1;
      continue;
    }
    current = {
      key,
      visualType: scene.visualType,
      layout,
      startIndex: index,
      endIndex: index,
      sceneIds: [scene.id],
      length: 1,
    };
    runs.push(current);
  }
  return runs;
}

function row(level, detail, fix) {
  return { level, category: CATEGORY, check: CHECK, detail, ...(fix ? { fix } : {}) };
}

/**
 * Audit declared cues and layout repetition.
 *
 * @param {Array<{id?: number, visualType?: string, layout?: string, attention?: {cue?: string|string[]}, info?: {panelVariant?: string}}>} scenes
 * @returns {Array<{level: string, category: string, check: string, detail?: string, fix?: string}>}
 */
export function auditAttentionBudget(scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return [row("pass", "No scenes to audit")];
  }

  const findings = [];
  for (const [index, scene] of scenes.entries()) {
    const raw = scene?.attention?.cue;
    if (
      raw !== undefined &&
      typeof raw !== "string" &&
      !(Array.isArray(raw) && raw.every((value) => typeof value === "string"))
    ) {
      findings.push(
        row(
          "warn",
          `Scene ${scene.id ?? index + 1} has a non-string \`attention.cue\`; expected a string or an array of strings.`,
          'Declare at most one cue, e.g. `attention: { cue: "highlight" }`.',
        ),
      );
    }

    const cues = declaredCues(scene);
    if (cues.length > 1) {
      findings.push(
        row(
          "warn",
          `Scene ${scene.id ?? index + 1} declares ${cues.length} attention cues (${cues.join(", ")}); one per scene is the budget.`,
          "Keep the cue that carries the claim and remove the rest; a second cue competes rather than reinforces.",
        ),
      );
    }

    if (scene?.info?.panelVariant === "terminal" && cues.length > 0) {
      findings.push(
        row(
          "warn",
          `Scene ${scene.id ?? index + 1} combines the terminal chart panel with an additional cue (${cues.join(", ")}).`,
          "The terminal frame is already the decorated layer; use the clean panel for A/B comparison or remove the extra cue.",
        ),
      );
    }
  }

  for (const run of layoutRun(scenes)) {
    if (run.length < 3) continue;
    const ids = run.sceneIds.filter((id) => id !== undefined);
    findings.push(
      row(
        "warn",
        `${run.length} consecutive information scenes share ${run.key}${ids.length ? ` (scenes ${ids.join(", ")})` : ""}.`,
        "Change one scene's layout or insert a narrative/quote beat; three identical information shapes read as a template loop.",
      ),
    );
  }

  if (findings.length === 0) {
    return [
      row(
        "pass",
        `${scenes.length} scenes within the one-cue budget; no run of 3 information scenes shares a layout.`,
      ),
    ];
  }
  return findings;
}
