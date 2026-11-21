/**
 * Semantic beats — the News SHOTBOOK contract (#733 S2).
 *
 * A beat is a scene-internal unit: it anchors one closed-vocabulary role to an
 * exact substring of the scene's voiceover and declares whether it carries the
 * scene's main point or supports it. Beats do not choose a layout (that stays
 * with `shot-recipes.mjs`) and they do not render anything yet — this module is
 * the authoring/validation seam the future emphasis layer will consume.
 *
 * Why anchor to exact text instead of offsets:
 * - offsets rot silently when a sentence is edited; an exact substring fails
 *   closed at validation time, before a render can drift.
 * - the same beat survives translation as long as the voiceover is re-authored
 *   in the target language; it is a semantic anchor, not a timecode.
 *
 * Contract: `scene.beats` is optional. Packs without it stay valid (opt-in),
 * so the 37 existing packs do not need a migration. If present:
 * - each beat has `{ id, at, role, weight }`;
 * - `id` is unique within the scene, kebab-case;
 * - `at` is a non-empty exact substring occurring exactly once in
 *   `scene.voiceover` (add surrounding words when a phrase repeats);
 * - `role` is one of `NEWS_BEAT_ROLES` (26 news roles, rewritten from
 *   talkcraft's structure — its marketing vocabulary is not copied);
 * - `weight` is `main` or `sub`, with at most one `main` per scene.
 *
 * The vocabulary is a closed set on purpose: an open list drifts into synonyms
 * and the layer matrix stops being reviewable. Extending it is a spec change.
 */

export const BEAT_SCHEMA_VERSION = 1;

/**
 * 26 news roles. `id` is stable; `label` is the author-facing name; `use` is
 * the one-line selection rule shown by the CLI.
 */
export const NEWS_BEAT_ROLES = Object.freeze({
  hook: { label: "Hook", use: "开场承诺或反差，决定观众是否留下" },
  claim: { label: "Claim", use: "本片要证明的核心断言" },
  evidence: { label: "Evidence", use: "支撑断言的来源、截图或实测" },
  stat: { label: "Stat", use: "一个可核对的数字" },
  metric: { label: "Metric", use: "数字的口径、单位或对比基线" },
  comparison: { label: "Comparison", use: "两个对象之间的直接对照" },
  baseline: { label: "Baseline", use: "对照的起点或上一代产品" },
  delta: { label: "Delta", use: "变化量、倍数或百分比" },
  mechanism: { label: "Mechanism", use: "它为什么成立的机制" },
  cause: { label: "Cause", use: "导致结果的原因" },
  consequence: { label: "Consequence", use: "对用户、行业或成本的实际后果" },
  context: { label: "Context", use: "理解本片所需的背景" },
  timeline: { label: "Timeline", use: "发布时间、版本或阶段" },
  quote: { label: "Quote", use: "直接引语" },
  attribution: { label: "Attribution", use: "引语或数据的归属" },
  caveat: { label: "Caveat", use: "限制、反例或尚未证实的部分" },
  counterpoint: { label: "Counterpoint", use: "反面观点或竞争解释" },
  definition: { label: "Definition", use: "术语或指标的定义" },
  example: { label: "Example", use: "具体案例或场景" },
  forecast: { label: "Forecast", use: "对后续走向的预测" },
  implication: { label: "Implication", use: "对读者决策的含义" },
  stake: { label: "Stake", use: "谁受益、谁受损" },
  cta: { label: "CTA", use: "关注、评论或下一步动作" },
  transition: { label: "Transition", use: "场景之间的语义桥" },
  recap: { label: "Recap", use: "对已讲内容的压缩复述" },
  payoff: { label: "Payoff", use: "兑现开场承诺的落点" },
});

export const NEWS_BEAT_ROLE_IDS = Object.freeze(Object.keys(NEWS_BEAT_ROLES));

const WEIGHTS = new Set(["main", "sub"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

/**
 * Validate one scene's beats.
 * @param {{id?: number|string, voiceover?: string, beats?: unknown}} scene
 * @returns {{ok: boolean, errors: Array<{code: string, message: string}>}}
 */
export function validateSceneBeats(scene) {
  const errors = [];
  const beats = scene?.beats;
  if (beats === undefined || beats === null) return { ok: true, errors };
  if (!Array.isArray(beats)) {
    return {
      ok: false,
      errors: [{ code: "beats-not-array", message: "beats must be an array when present" }],
    };
  }

  const voiceover = typeof scene.voiceover === "string" ? scene.voiceover : "";
  if (beats.length > 0 && !voiceover) {
    errors.push({
      code: "voiceover-missing",
      message: "beats anchor to scene.voiceover, but the scene has no voiceover text",
    });
  }

  const seenIds = new Set();
  let mainCount = 0;
  beats.forEach((beat, index) => {
    const where = `beats[${index}]`;
    if (!beat || typeof beat !== "object" || Array.isArray(beat)) {
      errors.push({ code: "beat-not-object", message: `${where} must be an object` });
      return;
    }
    const keys = Object.keys(beat).sort();
    const expected = ["at", "id", "role", "weight"];
    if (keys.join(",") !== expected.join(",")) {
      errors.push({
        code: "beat-unknown-field",
        message: `${where} must have exactly ${expected.join(", ")}; got ${keys.join(", ") || "(none)"}`,
      });
    }
    if (typeof beat.id !== "string" || !ID_PATTERN.test(beat.id)) {
      errors.push({
        code: "beat-id-invalid",
        message: `${where}.id must be kebab-case (a-z, 0-9, single dashes)`,
      });
    } else if (seenIds.has(beat.id)) {
      errors.push({ code: "beat-id-duplicate", message: `${where}.id "${beat.id}" is repeated` });
    } else {
      seenIds.add(beat.id);
    }
    if (typeof beat.at !== "string" || beat.at.trim() === "") {
      errors.push({ code: "beat-at-empty", message: `${where}.at must be a non-empty string` });
    } else if (voiceover) {
      const occurrences = countOccurrences(voiceover, beat.at);
      if (occurrences === 0) {
        errors.push({
          code: "beat-at-missing",
          message: `${where}.at is not an exact substring of scene.voiceover: ${JSON.stringify(beat.at)}`,
        });
      } else if (occurrences > 1) {
        errors.push({
          code: "beat-at-ambiguous",
          message: `${where}.at occurs ${occurrences} times in scene.voiceover; add surrounding words to make it unique`,
        });
      }
    }
    if (typeof beat.role !== "string" || !NEWS_BEAT_ROLE_IDS.includes(beat.role)) {
      errors.push({
        code: "beat-role-invalid",
        message: `${where}.role must be one of the 26 news roles; got ${JSON.stringify(beat.role)}`,
      });
    }
    if (typeof beat.weight !== "string" || !WEIGHTS.has(beat.weight)) {
      errors.push({
        code: "beat-weight-invalid",
        message: `${where}.weight must be "main" or "sub"`,
      });
    } else if (beat.weight === "main") {
      mainCount += 1;
    }
  });

  if (mainCount > 1) {
    errors.push({
      code: "beat-main-duplicate",
      message: `a scene may carry at most one main beat; found ${mainCount}`,
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a pack's scenes.
 * @param {Array} scenes
 * @returns {{ok: boolean, scenesWithBeats: number, beatCount: number,
 *   errors: Array<{sceneId: unknown, code: string, message: string}>}}
 */
export function validatePackBeats(scenes) {
  const errors = [];
  let scenesWithBeats = 0;
  let beatCount = 0;
  for (const scene of Array.isArray(scenes) ? scenes : []) {
    const result = validateSceneBeats(scene);
    if (Array.isArray(scene?.beats) && scene.beats.length > 0) {
      scenesWithBeats += 1;
      beatCount += scene.beats.length;
    }
    for (const error of result.errors) {
      errors.push({ sceneId: scene?.id ?? scene?.name ?? null, ...error });
    }
  }
  return { ok: errors.length === 0, scenesWithBeats, beatCount, errors };
}
