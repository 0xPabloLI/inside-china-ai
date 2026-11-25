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
 * - each beat has `{ id, at, role, weight }` and may add `screenAt`;
 * - `screenAt` is `{ field, text }`: the exact on-screen fragment to annotate
 *   when the screen copy differs from the voiceover wording. Optional; without
 *   it the bridge falls back to matching `at` verbatim in screen copy;
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

export const BEAT_SCHEMA_VERSION = 2;

import { annotatableTextFields, resolveRenderLayout } from "./text-slots.mjs";

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

/**
 * 六个新闻题材的推荐角色档（#733 S3）。
 *
 * The 26-role vocabulary stays closed and unchanged; a profile only *orders*
 * the roles an author should reach for first in a given story shape. It is an
 * authoring aid, not a validator: a beat using a role outside the profile is
 * legal, it just is not the recommended default. `main` is the expected
 * weight-`main` candidate set for that topic; `support` is the expected
 * `sub` set. Do not add roles here without a spec change.
 */
export const NEWS_BEAT_TOPIC_PROFILES = Object.freeze({
  "model-release": {
    label: "模型发布 / 新版本",
    main: ["hook", "claim", "delta", "comparison", "mechanism"],
    support: [
      "baseline",
      "metric",
      "stat",
      "timeline",
      "caveat",
      "evidence",
      "cause",
      "implication",
      "payoff",
    ],
  },
  "funding-ma": {
    label: "融资 / 并购 / 上市",
    main: ["hook", "claim", "delta", "consequence", "stake"],
    support: [
      "stat",
      "metric",
      "baseline",
      "timeline",
      "attribution",
      "forecast",
      "implication",
      "caveat",
    ],
  },
  "policy-regulation": {
    label: "政策 / 监管 / 合规",
    main: ["hook", "claim", "consequence", "timeline", "implication"],
    support: [
      "context",
      "quote",
      "attribution",
      "definition",
      "caveat",
      "counterpoint",
      "stake",
      "transition",
    ],
  },
  "benchmark-research": {
    label: "跑分 / 论文 / 评测",
    main: ["hook", "claim", "metric", "comparison", "delta", "mechanism"],
    support: [
      "baseline",
      "evidence",
      "definition",
      "caveat",
      "counterpoint",
      "implication",
      "stat",
    ],
  },
  "product-launch": {
    label: "产品 / 功能上线",
    main: ["hook", "claim", "comparison", "mechanism", "consequence", "payoff"],
    support: [
      "evidence",
      "example",
      "caveat",
      "context",
      "timeline",
      "implication",
      "cta",
      "transition",
      "recap",
    ],
  },
  "hardware-chips": {
    label: "芯片 / 硬件 / 算力",
    main: ["hook", "claim", "stat", "delta", "mechanism", "consequence"],
    support: [
      "metric",
      "baseline",
      "comparison",
      "timeline",
      "stake",
      "forecast",
      "caveat",
      "cause",
    ],
  },
});

export const NEWS_BEAT_TOPIC_IDS = Object.freeze(Object.keys(NEWS_BEAT_TOPIC_PROFILES));

/**
 * Return a topic profile, or `null` when the id is unknown. Callers that
 * accept author input should surface the allowed ids from the CLI rather than
 * guessing a fallback.
 * @param {string} topic
 */
export function beatTopicProfile(topic) {
  return Object.hasOwn(NEWS_BEAT_TOPIC_PROFILES, topic) ? NEWS_BEAT_TOPIC_PROFILES[topic] : null;
}

/**
 * Classify a role against a topic profile.
 * @param {string} topic
 * @param {string} role
 * @returns {"main"|"support"|"off-profile"|"unknown-topic"}
 */
export function roleFitForTopic(topic, role) {
  const profile = beatTopicProfile(topic);
  if (!profile) return "unknown-topic";
  if (profile.main.includes(role)) return "main";
  if (profile.support.includes(role)) return "support";
  return "off-profile";
}

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
    const allowed = ["at", "id", "role", "weight", "screenAt"];
    const unknown = keys.filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      errors.push({
        code: "beat-unknown-field",
        message: `${where} has unknown field(s) ${unknown.join(", ")}; allowed: ${allowed.join(", ")}`,
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
    if (beat.screenAt !== undefined) {
      if (beat.weight !== "main") {
        errors.push({
          code: "beat-screen-at-sub",
          message: `${where}.screenAt is only meaningful on the main beat`,
        });
      } else if (
        !beat.screenAt ||
        typeof beat.screenAt !== "object" ||
        Array.isArray(beat.screenAt) ||
        Object.keys(beat.screenAt).sort().join(",") !== "field,text"
      ) {
        errors.push({
          code: "beat-screen-at-invalid",
          message: `${where}.screenAt must be { field, text }`,
        });
      } else {
        const { field, text } = beat.screenAt;
        const wired = annotatableTextFields(scene.visualType, resolveRenderLayout(scene));
        if (typeof field !== "string" || !wired.includes(field)) {
          errors.push({
            code: "beat-screen-field-unsupported",
            message: `${where}.screenAt.field ${JSON.stringify(field)} is not annotated by the renderer; use ${wired.map((f) => `"${f}"`).join(", ") || "no field"}`,
          });
        } else if (typeof scene.texts?.[field] !== "string") {
          errors.push({
            code: "beat-screen-field-missing",
            message: `${where}.screenAt.field "${field}" has no string text in this scene`,
          });
        } else if (typeof text !== "string" || text.trim() === "") {
          errors.push({
            code: "beat-screen-at-empty",
            message: `${where}.screenAt.text must be a non-empty string`,
          });
        } else {
          const occurrences = countOccurrences(scene.texts[field], text);
          if (occurrences === 0) {
            errors.push({
              code: "beat-screen-at-missing",
              message: `${where}.screenAt.text ${JSON.stringify(text)} is not an exact substring of texts.${field}`,
            });
          } else if (occurrences > 1) {
            errors.push({
              code: "beat-screen-at-ambiguous",
              message: `${where}.screenAt.text ${JSON.stringify(text)} occurs ${occurrences} times in texts.${field}; include surrounding words`,
            });
          }
        }
      }
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

/**
 * Fields a beat may annotate: the renderer-wired list filtered through the
 * resolved layout's slots and the scene's actual string copy. T8 uses the
 * same `annotatableTextFields` authority, so validation and derivation cannot
 * disagree about which fields are live.
 */
function renderableAnnotatableFields(scene) {
  return annotatableTextFields(scene?.visualType, resolveRenderLayout(scene)).filter(
    (field) => typeof scene?.texts?.[field] === "string",
  );
}

/**
 * Derive the T8 highlight for a scene's single main beat. Write-side only:
 * returns a decision, never mutates the scene and never guesses.
 *
 * Statuses:
 * - `derived` — one main beat, its `at` occurs exactly once in exactly one
 *   annotatable string field; safe to write as `texts.highlight`.
 * - `already-set` — `texts.highlight` exists; `same` says whether it already
 *   matches the derived target.
 * - `no-main` / `invalid-beats` — nothing to derive or the beats are broken.
 * - `missing` / `ambiguous-field` / `ambiguous-occurrence` — no unique target;
 *   report only, do not write.
 *
 * @param {{visualType?: string, layout?: string, texts?: Record<string, unknown>,
 *   beats?: Array<{at?: string, weight?: string}>}} scene
 */
export function deriveHighlight(scene) {
  const validation = validateSceneBeats(scene);
  if (!validation.ok) return { status: "invalid-beats", errors: validation.errors };
  const beats = Array.isArray(scene?.beats) ? scene.beats : [];
  const mains = beats.filter((beat) => beat?.weight === "main");
  if (mains.length === 0) return { status: "no-main" };
  if (mains.length > 1) {
    return {
      status: "invalid-beats",
      errors: [{ code: "beat-main-duplicate", message: "a scene may carry at most one main beat" }],
    };
  }
  const main = mains[0];
  const screenAt = main.screenAt;
  const text = screenAt ? screenAt.text : main.at;
  const via = screenAt ? "screenAt" : "voiceover";
  const wired = annotatableTextFields(scene?.visualType, resolveRenderLayout(scene));
  const fields = renderableAnnotatableFields(scene);

  let field = screenAt ? screenAt.field : null;
  if (!screenAt) {
    const matches = fields.filter((candidate) => scene.texts[candidate].includes(text));
    if (matches.length > 1) return { status: "ambiguous-field", text, fields: matches };
    if (matches.length === 1) field = matches[0];
  }

  const existing = scene?.texts?.highlight;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    if (!wired.includes(existing.field)) {
      return {
        status: "unsupported-field",
        field: existing.field,
        text: existing.text,
        fields: wired,
      };
    }
    return {
      status: "already-set",
      same: field !== null && existing.field === field && existing.text === text,
      field: existing.field,
      text: existing.text,
    };
  }

  if (field === null) return { status: "missing", text, fields };
  const occurrences = countOccurrences(scene.texts[field], text);
  if (occurrences > 1) {
    return { status: "ambiguous-occurrence", text, field, occurrences };
  }
  return {
    status: "derived",
    field,
    text,
    ...(via === "screenAt" ? { via } : {}),
  };
}

/**
 * Write-side helper for `--write` (#733 S2). Inserts one `texts.highlight`
 * line into the scene's existing `texts` object without reformatting the rest
 * of the file. Textual insertion (not a full re-print) keeps comments, quote
 * style, and hand line-breaks reviewable in the diff.
 *
 * Refuses when the scene/texts/highlight already exists or the source shape
 * does not match the expected `export const scenes = [ { ... } ]` form. The
 * caller is responsible for only passing a `derived` decision.
 *
 * @param {string} source
 * @param {number|string} sceneId
 * @param {{field: string, text: string}} highlight
 * @returns {{source: string, line: string}}
 */
export function writeHighlightToSource(source, sceneId, highlight) {
  const code = (message) => Object.assign(new Error(message), { code: "highlight-write-refused" });
  const arrayMatch = /export\s+const\s+scenes\s*=\s*\[/.exec(source);
  if (!arrayMatch) throw code("scene-data must export `const scenes = [...]`");
  const arrayOpen = source.indexOf("[", arrayMatch.index);
  let cursor = arrayOpen + 1;
  let sceneSpan = null;
  while (cursor < source.length) {
    cursor = skipTrivia(source, cursor);
    if (source[cursor] === "]") break;
    if (source[cursor] === ",") {
      cursor += 1;
      continue;
    }
    if (source[cursor] !== "{") {
      throw code(`unexpected token ${JSON.stringify(source[cursor])} in scenes[]`);
    }
    const end = findMatching(source, cursor, "{", "}");
    if (end === -1) throw code("unclosed scene object");
    const head = source.slice(cursor, Math.min(end, cursor + 300));
    const idMatch = /\bid\s*:\s*(\d+|"[^"]*"|'[^']*')/.exec(head);
    if (idMatch) {
      const raw = idMatch[1];
      const value = raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : Number(raw);
      if (String(value) === String(sceneId)) {
        sceneSpan = { start: cursor, end };
        break;
      }
    }
    cursor = end + 1;
  }
  if (!sceneSpan) throw code(`scene ${sceneId} not found`);

  const sceneBody = source.slice(sceneSpan.start, sceneSpan.end);
  const textsMatch = /\btexts\s*:\s*\{/.exec(sceneBody);
  if (!textsMatch) throw code(`scene ${sceneId} has no texts object`);
  const textsOpen = sceneSpan.start + textsMatch.index + textsMatch[0].lastIndexOf("{");
  const textsClose = findMatching(source, textsOpen, "{", "}");
  if (textsClose === -1) throw code(`scene ${sceneId} texts object is unclosed`);
  const textsBody = source.slice(textsOpen + 1, textsClose);
  if (/\bhighlight\s*:/.test(textsBody)) {
    throw code(`scene ${sceneId} already has texts.highlight`);
  }

  const line = `highlight: { field: ${JSON.stringify(highlight.field)}, text: ${JSON.stringify(highlight.text)} },`;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lineEnd = source.indexOf("\n", textsOpen + 1);
  if (lineEnd === -1 || source.slice(textsOpen + 1, lineEnd).trim() !== "") {
    const baseIndent = /^[ \t]*/.exec(source.slice(source.lastIndexOf("\n", textsOpen) + 1))[0];
    const indent = `${baseIndent}  `;
    const next = `${source.slice(0, textsOpen + 1)}${newline}${indent}${line}${source.slice(textsOpen + 1)}`;
    return { source: next, line };
  }
  const firstLine = source.slice(lineEnd + 1, source.indexOf("\n", lineEnd + 1) + 1);
  const indent = /^[ \t]*/.exec(firstLine)[0];
  const next = `${source.slice(0, lineEnd + 1)}${indent}${line}${newline}${source.slice(lineEnd + 1)}`;
  return { source: next, line };
}

/** Skip whitespace and JS comments. */
function skipTrivia(source, index) {
  let i = index;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i += 1;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

/** Index of the matching close token, skipping strings and comments. */
function findMatching(source, open, openChar, closeChar) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      if (i === -1) return -1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i + 2);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (ch === openChar) depth += 1;
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Skip a quoted string; returns the index of its closing quote. */
function skipString(source, open) {
  const quote = source[open];
  for (let i = open + 1; i < source.length; i += 1) {
    if (source[i] === "\\") {
      i += 1;
      continue;
    }
    if (source[i] === quote) return i;
  }
  return -1;
}
