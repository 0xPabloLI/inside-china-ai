/**
 * Scene Data Validation Rules — pure functions for testable scene-data checks.
 *
 * Used by verify-video.mjs in both --pre (pre-render) and post-render modes.
 * Each function takes `scenes` (and optionally `seriesMeta`) and returns an
 * array of result objects: { level, category, check, detail?, fix? }
 *
 * level: 'pass' | 'warn' | 'fail'
 *
 * All rule constants are imported from tiktok-rules.mjs (patterns/lists) and
 * the TikTok platform profile (numeric THRESHOLDS — #219 T02 removed the
 * tiktok-rules forwarding layer, no Middle Man).
 */

import { getPlatformProfile } from "./platforms/index.mjs";
// The TTS instruct coverage check (below) is a pre-render contract, so it reads
// the standard from its single source. tts/instruct.mjs is pure data + pure
// functions (no fs/child_process) — importing it does not drag the TTS stack in.
import { hasInstructStyle, validateInstructSignature } from "./tts/instruct.mjs";
// Digit↔word conversion lives in one module (#762 review): checkLoopClose uses
// the inverse direction so a spelled CTA number and a digit dataPoints entry
// compare equal without a second lexicon.
import { numericAnchors } from "./normalize-tts-text.mjs";
import {
  AI_BLACKLIST as _AI_BLACKLIST,
  DASH_PATTERN,
  DEAD_CLOSER_PATTERN,
  STRONG_WORD_PATTERN,
  WRITTEN_OPENER_PATTERN,
  SOURCE_PATTERN,
  CTA_PATTERN,
  CLICKBAIT_PATTERNS,
  WATERMARK_PATTERN,
  GREETING_PATTERN,
  NAMED_SOURCE_PATTERN,
  HOOK_SENTENCE_FAMILIES,
  HOOK_INTENSITY_PATTERN,
  HOOK_CONCRETE_FACT_PATTERN,
  HOOK_FAMILY_TESTS,
  HOOK_FAMILY_IDS,
  TARGET_KEYWORDS,
  KNOWN_COMPANIES,
} from "./tiktok-rules.mjs";

// Numeric thresholds: profile is the single source (tiktok-rules.mjs no
// longer re-exports them — #219 T02 Middle-Man removal).
const THRESHOLDS = getPlatformProfile("tiktok").thresholds;
import {
  REMOTION_SLOT_MAP,
  DEFAULT_NARRATIVE_LAYOUT,
  allowsContainFit,
  assertKnownTextFields,
  resolveRenderLayout,
  slotId,
  slotCharBudget,
  SLOT_FIELDS,
  textFieldValue,
} from "./text-slots.mjs";
import { EMPTY_FIELD, isEmptyField, tierForSize, TYPE_TIERS } from "./type-scale.mjs";
import { FOCUS_LIGHT, LIGHT_PLANS, lightPlanFor, validateLightPlan } from "./focus-light.mjs";
import { sceneClipFrames } from "./timeline.mjs";
import { MEDIA_DEPENDENT_LAYOUTS, NO_MEDIA_TYPES } from "./final-media-gate.mjs";
import { checkMediaFieldSchema } from "./media-field-schema.mjs";
import { skipsMediaSourcing, sceneClaimPhrases, isUsableSearchHints } from "./claim-keywords.mjs";
import {
  MEDIA_STRATEGIES,
  IMAGE_GENERATING_STRATEGIES,
  GENERATING_STRATEGIES,
  resolveMediaPlan,
} from "./media-strategies.mjs";
import { checkHookMediaQuality } from "./hook-media.mjs";
// SSOT passthrough (#199): NO_MEDIA_TYPES is defined once in claim-keywords.mjs
// and re-exported through final-media-gate — scene-rules must not hold a copy.
export { NO_MEDIA_TYPES };

// Re-export AI_BLACKLIST to maintain public API
export const AI_BLACKLIST = _AI_BLACKLIST;

// ─── Helpers ───

function sceneTexts(scene) {
  return JSON.stringify(scene.texts || "").toLowerCase();
}

function sceneVO(scene) {
  return (scene.voiceover || "").toLowerCase();
}

/**
 * Word-boundary term match (#763). Substring matching made "illegal" satisfy
 * "legal" and turned self-consistent scenes into contradictions.
 *
 * Scans for each occurrence and checks the neighbouring characters instead of
 * building a RegExp from the term: the table is trusted, but a dynamic pattern
 * is still a ReDoS shape the security scan must not have to reason about.
 */
function isAsciiWordChar(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

function hasTerm(haystack, term) {
  let index = haystack.indexOf(term);
  while (index !== -1) {
    const before = index === 0 ? "" : haystack[index - 1];
    const after = haystack[index + term.length];
    if (!isAsciiWordChar(before) && !isAsciiWordChar(after)) return true;
    index = haystack.indexOf(term, index + 1);
  }
  return false;
}

// ─── Check functions ───

/**
 * Scene count should be within THRESHOLDS range per SKILL.md.
 *
 * TikTok default: out-of-range is a FAIL (blocks the pipeline until the
 * content is split into parts or --long-form is explicitly passed).
 * opts.longForm (YouTube long-form opt-in) downgrades to warn.
 */
export function checkSceneCount(scenes, opts = {}) {
  const count = scenes.length;
  if (count >= THRESHOLDS.minScenes && count <= THRESHOLDS.maxScenes) {
    return [
      {
        level: "pass",
        category: "Structure",
        check: "Scene count (6-10)",
        detail: `${count} scenes`,
      },
    ];
  }
  return [
    {
      level: opts.longForm ? "warn" : "fail",
      category: "Structure",
      check: "Scene count (6-10)",
      detail: `${count} scenes`,
      fix: opts.longForm
        ? "SKILL.md recommends 6-10 scenes"
        : "Split into content/<dir>/pt1, pt2... (6-10 scenes each) or pass --long-form",
    },
  ];
}

/** Scene 1 must have visualType="hook" */
export function checkHookVisualType(scenes) {
  const hook = scenes[0];
  if (hook?.visualType === "hook") {
    return [
      {
        level: "pass",
        category: "Structure",
        check: "Hook scene type",
        detail: 'visualType="hook"',
      },
    ];
  }
  return [
    {
      level: "fail",
      category: "Structure",
      check: "Hook scene type",
      detail: `visualType="${hook?.visualType}"`,
      fix: 'Set Scene 1 visualType to "hook"',
    },
  ];
}

/**
 * Hook focal contract (HookScene, remotion/src/scenes/HookScene.tsx): Scene 1 must
 * carry EXACTLY one focal — bigNumber (number-led) or hookText (claim-led).
 * Both present or both absent = fail. Legacy line1/line2 shapes carry
 * neither key, so they fail with a migration pointer (spec:
 * docs/archive/spec-hook-opening-card.md §3).
 */
export function checkHookContract(scenes) {
  const hook = scenes[0];
  if (hook?.visualType !== "hook") {
    return [
      {
        level: "pass",
        category: "Structure",
        check: "Hook focal contract",
        detail: "No hook scene",
      },
    ];
  }
  const texts = hook.texts || {};
  const hasNumber = !!(texts.bigNumber ?? "").toString().trim();
  const hasClaim = !!(texts.hookText ?? "").toString().trim();
  if (hasNumber && hasClaim) {
    return [
      {
        level: "fail",
        category: "Structure",
        check: "Hook focal contract",
        detail: "bigNumber and hookText both present",
        fix: "Keep ONE focal: texts.bigNumber (number-led) or texts.hookText (claim-led) — see the HookScene docblock in remotion/src/scenes/HookScene.tsx (docs/archive/spec-hook-opening-card.md)",
      },
    ];
  }
  if (!hasNumber && !hasClaim) {
    return [
      {
        level: "fail",
        category: "Structure",
        check: "Hook focal contract",
        detail: "missing focal",
        fix: "Add texts.bigNumber (number-led) or texts.hookText (claim-led) — see the HookScene docblock in remotion/src/scenes/HookScene.tsx (docs/archive/spec-hook-opening-card.md). Legacy line1/line2 hooks must migrate to the hookText/revealText contract",
      },
    ];
  }
  return [
    {
      level: "pass",
      category: "Structure",
      check: "Hook focal contract",
      detail: hasNumber ? "bigNumber focal" : "hookText focal",
    },
  ];
}

/** Last scene must have visualType="cta" */
export function checkCTAVisualType(scenes) {
  const cta = scenes[scenes.length - 1];
  if (cta?.visualType === "cta") {
    return [
      { level: "pass", category: "Structure", check: "CTA scene type", detail: 'visualType="cta"' },
    ];
  }
  return [
    {
      level: "fail",
      category: "Structure",
      check: "CTA scene type",
      detail: `visualType="${cta?.visualType}"`,
      fix: 'Set last scene visualType to "cta"',
    },
  ];
}

/**
 * Last CTA scene must carry the standardized action slot (end-card contract,
 * see CtaScene in remotion/src/scenes/CtaScene.tsx): texts.action is the amber stamp
 * copy that renders on the final frame. Missing action = end card without a
 * call-to-action, which the shared template would render empty.
 */
export function checkCTAActionContract(scenes) {
  const cta = scenes[scenes.length - 1];
  if (cta?.visualType !== "cta") {
    return [
      {
        level: "pass",
        category: "Structure",
        check: "CTA action contract",
        detail: "No CTA scene",
      },
    ];
  }
  const action = (cta.texts?.action ?? "").trim();
  if (action) {
    return [
      {
        level: "pass",
        category: "Structure",
        check: "CTA action contract",
        detail: "texts.action present",
      },
    ];
  }
  return [
    {
      level: "fail",
      category: "Structure",
      check: "CTA action contract",
      detail: "Last CTA scene is missing texts.action",
      fix: 'Add `action: "FOLLOW FOR MORE"` (or the series variant, e.g. "FOLLOW FOR PART 2") to the last scene\'s texts — see the CtaScene docblock in remotion/src/scenes/CtaScene.tsx',
    },
  ];
}

const SENTENCE_FAMILY_BY_ID = new Map(HOOK_SENTENCE_FAMILIES.map((f) => [f.id, f]));

/**
 * Does `voiceover` execute `familyId`? Returns the label of the marker that
 * matched, or null.
 *
 * This answers "did you write the shape you named", not "is the hook good".
 * The markers are structural on purpose: a family whose only pass condition was
 * a fixed word list would rebuild the problem it replaces — the old gate
 * accepted a number or one of 13 words, so the writer optimised for those 13.
 */
export function matchHookFamily(familyId, voiceover) {
  const family = HOOK_FAMILY_TESTS[familyId];
  if (!family) return null;
  const vo = voiceover || "";
  for (const hintId of family.hints || []) {
    const hint = SENTENCE_FAMILY_BY_ID.get(hintId);
    if (hint && hint.pattern.test(vo)) return hint.label;
  }
  if (family.pattern && family.pattern.test(vo)) return family.label;
  return null;
}

/**
 * Hook must contain a compelling element.
 *
 * A declared `hookFamily` on the hook scene turns this into an execution check
 * for that family. Undeclared hooks keep the old acceptance surface and gain
 * the six family markers, so a legitimate non-number hook passes; only a hook
 * that matches nothing (or a bare nameplate like `V4.1`) fails.
 */
export function checkHookCompellingElement(scenes) {
  const hook = scenes[0];
  const hookVO = hook?.voiceover || "";
  const declared = typeof hook?.hookFamily === "string" ? hook.hookFamily.trim() : "";
  const check = "Hook has compelling element";

  if (declared) {
    const family = HOOK_FAMILY_TESTS[declared];
    if (!family) {
      return [
        {
          level: "fail",
          category: "Hook",
          check,
          detail: `unknown hookFamily "${declared}"`,
          fix: `Use one of: ${HOOK_FAMILY_IDS.join(", ")}`,
        },
      ];
    }
    const executed = matchHookFamily(declared, hookVO);
    if (executed) {
      return [
        {
          level: "pass",
          category: "Hook",
          check,
          detail: `declared ${declared}, executed (${executed})`,
        },
      ];
    }
    return [
      {
        level: "fail",
        category: "Hook",
        check,
        detail: `declared ${declared} (${family.label}) but the hook does not execute it`,
        fix: `${family.missing} — rewrite the hook to execute ${family.label}, or set hookFamily to the family you actually wrote. Do not bolt on a keyword.`,
      },
    ];
  }

  const matched = HOOK_FAMILY_IDS.filter((id) => matchHookFamily(id, hookVO));
  if (matched.length > 0 || STRONG_WORD_PATTERN.test(hookVO)) {
    return [
      {
        level: "pass",
        category: "Hook",
        check,
        detail: matched.length > 0 ? `matches ${matched.join(" / ")}` : "has strong word",
      },
    ];
  }
  return [
    {
      level: "fail",
      category: "Hook",
      check,
      detail: "no hook family marker in hook VO",
      fix: `Write one of the six families and declare it as hookFamily (${HOOK_FAMILY_IDS.join(", ")}), or use a number or strong word`,
    },
  ];
}

/**
 * First sentence of a hook, terminator included. Splitting on `[.!?]` alone
 * would cut decimals ("V4.1", "1.3 billion") — only a terminator followed by
 * whitespace or end-of-string closes the sentence.
 */
function firstHookSentence(voiceover) {
  const trimmed = (voiceover || "").trim();
  if (!trimmed) return "";
  // A terminator counts when whitespace, a closing quote/bracket, or the end
  // follows it — `He said "boom." Then…` ends at the period. Known
  // abbreviations (`U.S.`, `Dr.`) do not end the sentence; a standalone
  // capital (`Model X.`) does.
  const sentenceEnd = /[.!?](?=[\s"'”’)\]]|$)/g;
  const abbreviationEnd =
    /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Co|Corp|vs|etc|No|St|Ave|Rd|Fig|e\.g|i\.e|a\.m|p\.m)\.|(?:\b[A-Z]\.){2,})$/;
  let match;
  while ((match = sentenceEnd.exec(trimmed))) {
    const head = trimmed.slice(0, match.index + 1);
    if (abbreviationEnd.test(head)) continue;
    return head;
  }
  return trimmed;
}

/**
 * Hook opening sentence family (#1231).
 *
 * Advisory, not a gate (#763): sentence tension cannot be judged mechanically.
 * The check reports which corpus families the FIRST SENTENCE hits, and calls
 * out the two shapes the write-side rule downgrades — question-only openers
 * (4/35) and intensity words without a concrete fact behind them (4/35).
 * Source: docs/research/competitor-video-benchmarks-research.md §10.2.
 */
export function checkHookSentenceFamily(scenes) {
  const CHECK = "Hook sentence family (first sentence)";
  const CATEGORY = "Hook";
  const hook = scenes[0];
  if (hook?.visualType !== "hook") {
    return [{ level: "pass", category: CATEGORY, check: CHECK, detail: "No hook scene" }];
  }
  const vo = hook.voiceover || "";
  const opening = firstHookSentence(vo);
  const openingFamilies = HOOK_SENTENCE_FAMILIES.filter((f) => f.pattern.test(opening));
  const priority = openingFamilies.filter((f) => f.priority);
  // The fact backing an intensity word may sit in a later hook sentence (the
  // 303 shape: "just dropped a bombshell"), so the anchor search is hook-wide.
  // A named comparison ("beats GPT-5") is a concrete fact without a digit or a
  // priority family (research §10.4 P4), so it counts as backing too.
  const anchored =
    HOOK_SENTENCE_FAMILIES.some((f) => f.priority && f.pattern.test(vo)) ||
    HOOK_CONCRETE_FACT_PATTERN.test(vo);
  const questionLed = openingFamilies.some((f) => f.id === "question");
  const intensity = HOOK_INTENSITY_PATTERN.test(vo);
  const labels = openingFamilies.map((f) => f.label).join(" + ");

  if (priority.length > 0) {
    return [
      {
        level: "pass",
        category: CATEGORY,
        check: CHECK,
        detail: labels ? `首句命中 ${labels}` : "首句命中优先族",
      },
    ];
  }
  // A declared family that is actually executed is not second-guessed: the
  // three priority families came from one corpus's opener distribution, and
  // scoring every other shape down is what pushed 26/35 packs into the same
  // number-led hook. The advisory now reports the declared shape instead.
  const declaredFamily = typeof hook.hookFamily === "string" ? hook.hookFamily.trim() : "";
  if (declaredFamily && matchHookFamily(declaredFamily, vo)) {
    const family = HOOK_FAMILY_TESTS[declaredFamily];
    return [
      {
        level: "pass",
        category: CATEGORY,
        check: CHECK,
        detail: `声明 ${declaredFamily}（${family.label}）并已执行`,
      },
    ];
  }
  if (questionLed) {
    return [
      {
        level: "warn",
        category: CATEGORY,
        check: CHECK,
        detail: "首句是提问式（竞品 4/35，头三族各 9–11/35）",
        fix: "改用规模/最高级、数量锚点或 just + 事件开场；提问式只有在同句带具体数字锚点时保留（405 形状）",
      },
    ];
  }
  if (intensity && !anchored) {
    return [
      {
        level: "warn",
        category: CATEGORY,
        check: CHECK,
        detail: "强度词没有具体事实兜底（insane/massive 一类在竞品里只 4/35）",
        fix: "给强度词补一个具体事实锚点（数字、规模/最高级、just + 事件，或点名的对照如 beats GPT-5），否则删掉它",
      },
    ];
  }
  return [
    {
      level: "warn",
      category: CATEGORY,
      check: CHECK,
      detail: "首句未命中先头三族（规模/最高级、数量锚点、just + 事件）",
      fix: `两条路：把首句改成头族锚点（最大/最强/第一次、一个具体数字、[主体] just [事件]），或者写出六族中的另一族并在 hook 场景声明 hookFamily（${HOOK_FAMILY_IDS.join(", ")}）——声明后本项改判该族的执行情况，不再比较首句族分布`,
    },
  ];
}

/**
 * Hook duration against the competitor band (#1231).
 *
 * Measured on the voiceover take (`opts.sceneDurations` = post-render
 * `audio/scene-durations.json`, in voiceover seconds), not on the rendered
 * clip: the clip adds the 0.5s recording buffer (lib/timeline.mjs). Before TTS
 * the length is projected from the word count at the #252 budget rate, so the
 * write step sees the number while it can still change.
 *
 * Advisory, not a gate: the corpus p25–p75 band is 2.5s wide and long-narrative
 * accounts legitimately run 7–8s hooks (research §10.2 / §10.3).
 */
export function checkHookDuration(scenes, opts = {}) {
  const CHECK = `Hook duration (${THRESHOLDS.hookTargetMinSec.toFixed(1)}–${THRESHOLDS.hookTargetMaxSec.toFixed(1)}s target)`;
  const CATEGORY = "Hook";
  const hook = scenes[0];
  if (hook?.visualType !== "hook") {
    return [{ level: "pass", category: CATEGORY, check: CHECK, detail: "No hook scene" }];
  }
  const vo = hook.voiceover || "";
  const t = THRESHOLDS;
  const target = `${t.hookTargetMinSec}–${t.hookTargetMaxSec}s`;
  const observed = `${t.hookObservedMinSec}–${t.hookObservedMaxSec}s`;
  const wps = t.voiceoverEstimateWps;
  // Word bands are integer projections at the budget rate: the low edge is
  // ceil(min·wps) and the high edge floor(max·wps) so every word count in the
  // band still projects inside the seconds band (4.5–5.0s → 12 words;
  // 4.1–6.6s → 11–16 words).
  const wordBand = (minSec, maxSec) => {
    const lo = Math.ceil(minSec * wps);
    const hi = Math.floor(maxSec * wps);
    return lo === hi ? `约 ${lo} 词` : `约 ${lo}–${hi} 词`;
  };
  const targetWords = wordBand(t.hookTargetMinSec, t.hookTargetMaxSec);
  const acceptWords = wordBand(t.hookObservedMinSec, t.hookObservedMaxSec);

  const rows = Array.isArray(opts.sceneDurations) ? opts.sceneDurations : [];
  const row = rows.find((r) => r && Number.isFinite(r.duration) && r.sceneId === (hook.id ?? 1));
  if (row) {
    const sec = row.duration;
    if (sec >= t.hookTargetMinSec && sec <= t.hookTargetMaxSec) {
      return [
        {
          level: "pass",
          category: CATEGORY,
          check: CHECK,
          detail: `实测 ${sec.toFixed(2)}s — 目标 ${target}`,
        },
      ];
    }
    if (sec >= t.hookObservedMinSec && sec <= t.hookObservedMaxSec) {
      return [
        {
          level: "pass",
          category: CATEGORY,
          check: CHECK,
          detail: `实测 ${sec.toFixed(2)}s — 目标 ${target}，在实测带 ${observed} 内`,
        },
      ];
    }
    return [
      {
        level: "warn",
        category: CATEGORY,
        check: CHECK,
        detail: `实测 ${sec.toFixed(2)}s — 超出实测带 ${observed}（目标 ${target}）`,
        fix: `删/加 hook VO 到${targetWords}（可接受${acceptWords}；目标 ${target}），改完以 audio/scene-durations.json 复测`,
      },
    ];
  }

  const words = vo.split(/\s+/).filter(Boolean).length;
  if (words === 0) {
    return [{ level: "pass", category: CATEGORY, check: CHECK, detail: "No hook voiceover" }];
  }
  const projected = words / wps;
  const measured = `预估 ${projected.toFixed(1)}s（${words} 词 @${wps} 词/秒）`;
  if (projected >= t.hookTargetMinSec && projected <= t.hookTargetMaxSec) {
    return [
      { level: "pass", category: CATEGORY, check: CHECK, detail: `${measured} — 目标 ${target}` },
    ];
  }
  if (projected >= t.hookObservedMinSec && projected <= t.hookObservedMaxSec) {
    return [
      {
        level: "pass",
        category: CATEGORY,
        check: CHECK,
        detail: `${measured} — 目标 ${target}，在实测带 ${observed} 内`,
      },
    ];
  }
  return [
    {
      level: "warn",
      category: CATEGORY,
      check: CHECK,
      detail: `${measured} — 超出实测带 ${observed}（目标 ${target}）`,
      fix: `${projected > t.hookObservedMaxSec ? "删词" : "补词"}到${targetWords}（可接受${acceptWords}；目标 ${target}）；TTS 后以 audio/scene-durations.json 复测`,
    },
  ];
}

/** No em/en/double dashes in any scene's VO or texts */
export function checkNoEmDashes(scenes) {
  const found = [];
  for (const scene of scenes) {
    const vo = scene.voiceover || "";
    const texts = JSON.stringify(scene.texts || "");
    if (DASH_PATTERN.test(vo) || DASH_PATTERN.test(texts)) {
      found.push(scene.id);
    }
  }
  if (found.length === 0) {
    return [{ level: "pass", category: "De-AI", check: "No em/en/double dashes" }];
  }
  return [
    {
      level: "fail",
      category: "De-AI",
      check: "No em/en/double dashes",
      detail: `Found in scenes: ${found.join(", ")}`,
      fix: "Replace with space, period, or line break",
    },
  ];
}

/** No AI vocabulary blacklist words in voiceover */
export function checkNoAIVocabulary(scenes) {
  const hits = [];
  for (const scene of scenes) {
    const vo = sceneVO(scene);
    for (const word of AI_BLACKLIST) {
      if (vo.includes(word)) {
        hits.push({ scene: scene.id, word });
      }
    }
  }
  if (hits.length === 0) {
    return [{ level: "pass", category: "De-AI", check: "No AI vocabulary blacklist words" }];
  }
  const detail = hits.map((h) => `"${h.word}" (scene ${h.scene})`).join(", ");
  return [
    {
      level: "fail",
      category: "De-AI",
      check: "No AI vocabulary blacklist words",
      detail,
      fix: "Replace with spoken equivalent (leverage→use, delve→look at, etc.)",
    },
  ];
}

/** Hook must not start with written-style opener */
export function checkNoWrittenOpener(scenes) {
  const hookVO = scenes[0]?.voiceover || "";
  if (!WRITTEN_OPENER_PATTERN.test(hookVO)) {
    return [{ level: "pass", category: "De-AI", check: "Hook is spoken, not written" }];
  }
  return [
    {
      level: "fail",
      category: "De-AI",
      check: "Hook is spoken not written",
      detail: "Scene 1 opens with written-style opener",
      fix: "Open on the payoff, not a setup phrase",
    },
  ];
}

/** B4: Hook VO and on-screen text should use different words (three-tier) */
export function checkHookDiffersFromText(scenes) {
  const hook = scenes[0] || {};
  const hookVO = (hook.voiceover || "").toLowerCase();
  const hookTexts = sceneTexts(hook);
  const hookWords = hookVO.split(/\s+/).filter((w) => w.length > 3);
  if (hookWords.length === 0) {
    return [
      {
        level: "pass",
        category: "De-AI",
        check: "Hook VO differs from on-screen text",
        detail: "(no VO to compare)",
      },
    ];
  }
  const overlap = hookWords.filter((w) => hookTexts.includes(w));
  const overlapRatio = overlap.length / hookWords.length;
  if (overlapRatio >= THRESHOLDS.hookTextOverlapFailThreshold) {
    return [
      {
        level: "fail",
        category: "De-AI",
        check: "Hook VO differs from on-screen text",
        detail: `${overlap.length}/${hookWords.length} words overlap (${Math.round(overlapRatio * 100)}%)`,
        fix: "Use different words for on-screen text (different angle on same promise)",
      },
    ];
  }
  if (overlapRatio >= THRESHOLDS.hookTextOverlapWarnThreshold) {
    return [
      {
        level: "warn",
        category: "De-AI",
        check: "Hook VO vs on-screen text",
        detail: `${overlap.length}/${hookWords.length} words overlap (${Math.round(overlapRatio * 100)}%)`,
        fix: "Use different words for on-screen text (different angle on same promise)",
      },
    ];
  }
  return [
    {
      level: "pass",
      category: "De-AI",
      check: "Hook VO differs from on-screen text",
      detail: `${overlap.length}/${hookWords.length} words overlap`,
    },
  ];
}

/** Last scene must not have dead closer phrases */
export function checkNoDeadClosers(scenes) {
  const lastVO = (scenes[scenes.length - 1]?.voiceover || "").toLowerCase();
  if (!DEAD_CLOSER_PATTERN.test(lastVO)) {
    return [
      { level: "pass", category: "De-AI", check: "No dead closer ('thanks for watching' etc.)" },
    ];
  }
  return [
    {
      level: "fail",
      category: "De-AI",
      check: "No dead closer in last scene",
      detail: "Last scene ends on generic engagement bait",
      fix: "End on the loop-close line or one specific ask",
    },
  ];
}

/** B2 (partial): Hook must not start with a greeting */
export function checkNoGreeting(scenes) {
  const hookVO = (scenes[0]?.voiceover || "").toLowerCase();
  if (!hookVO) {
    return [{ level: "pass", category: "De-AI", check: "No greeting opener in hook" }];
  }
  const firstWords = hookVO.split(/\s+/).slice(0, THRESHOLDS.greetingCheckWords).join(" ");
  if (GREETING_PATTERN.test(firstWords)) {
    return [
      {
        level: "fail",
        category: "De-AI",
        check: "No greeting opener in hook",
        detail: "Hook starts with a greeting word",
        fix: "Open on the payoff, not a greeting. Cut 'hey', 'hi', 'what's up', etc.",
      },
    ];
  }
  return [{ level: "pass", category: "De-AI", check: "No greeting opener in hook" }];
}

/** SEO keywords must appear in >=2 scenes */
export function checkSEOKeywords(scenes) {
  const results = [];
  for (const kw of TARGET_KEYWORDS) {
    let count = 0;
    for (const scene of scenes) {
      const vo = sceneVO(scene);
      const texts = sceneTexts(scene);
      if (vo.includes(kw) || texts.includes(kw)) count++;
    }
    if (count >= 2) {
      results.push({
        level: "pass",
        category: "SEO",
        check: `Keyword "${kw}" in ≥2 scenes`,
        detail: `${count} scenes`,
      });
    } else {
      results.push({
        level: "fail",
        category: "SEO",
        check: `Keyword "${kw}" in ≥2 scenes`,
        detail: `${count} scenes`,
        fix: `Add "${kw}" to voiceover or on-screen text in more scenes`,
      });
    }
  }
  return results;
}

/** >=2 scenes must mention a source */
export function checkSourceAttribution(scenes) {
  let count = 0;
  for (const scene of scenes) {
    const vo = scene.voiceover || "";
    if (SOURCE_PATTERN.test(vo)) count++;
  }
  if (count >= 2) {
    return [
      {
        level: "pass",
        category: "Content",
        check: "Source attribution (≥2 scenes)",
        detail: `${count} scenes`,
      },
    ];
  }
  return [
    {
      level: "fail",
      category: "Content",
      check: "Source attribution (≥2 scenes)",
      detail: `${count} scenes`,
      fix: 'Add "Bloomberg reported..." or "Liang said..." to voiceover',
    },
  ];
}

/** >=50% of scenes should contain numbers/data points */
export function checkShareWorthyData(scenes) {
  let dataScenes = 0;
  for (const scene of scenes) {
    const vo = scene.voiceover || "";
    const texts = JSON.stringify(scene.texts || "");
    if (/\$?\d+[.,]?\d*/.test(vo + texts)) dataScenes++;
  }
  if (dataScenes >= scenes.length * 0.5) {
    return [
      {
        level: "pass",
        category: "Content",
        check: "Share-worthy data points (≥50% scenes have numbers)",
        detail: `${dataScenes}/${scenes.length} scenes`,
      },
    ];
  }
  return [
    {
      level: "fail",
      category: "Content",
      check: "Share-worthy data points",
      detail: `${dataScenes}/${scenes.length} scenes have numbers`,
      fix: "Add concrete numbers to more scenes",
    },
  ];
}

/** Total voiceover should fit the profile's duration ceiling (see maxVoiceoverWords) */
export function checkVoiceoverWordCount(scenes, opts = {}) {
  const totalWords = scenes.reduce(
    (sum, s) => sum + (s.voiceover || "").split(/\s+/).filter(Boolean).length,
    0,
  );
  if (totalWords <= THRESHOLDS.maxVoiceoverWords) {
    return [
      {
        level: "pass",
        category: "Duration",
        check: `Total voiceover words (≤${THRESHOLDS.maxVoiceoverWords})`,
        detail: `${totalWords} words (~${(totalWords / THRESHOLDS.voiceoverEstimateWps).toFixed(0)}s)`,
      },
    ];
  }
  return [
    {
      level: opts.longForm ? "warn" : "fail",
      category: "Duration",
      check: `Total voiceover words (≤${THRESHOLDS.maxVoiceoverWords})`,
      detail: `${totalWords} words`,
      fix: opts.longForm
        ? `May exceed 70s at 2.5 wps — consider trimming (limit: ${THRESHOLDS.maxVoiceoverWords} words)`
        : `Split VO across content/<dir>/pt1, pt2... (≤${THRESHOLDS.maxVoiceoverWords} words each) or pass --long-form`,
    },
  ];
}

/** Every voiceover line should be sayable in one breath (<=25 words per sentence) */
export function checkOneBreath(scenes) {
  const longLines = [];
  for (const scene of scenes) {
    const vo = scene.voiceover || "";
    const sentences = vo.split(/[.!?\n]+/).filter((s) => s.trim().length > 0);
    for (const sentence of sentences) {
      const wordCount = sentence.trim().split(/\s+/).length;
      if (wordCount > THRESHOLDS.maxOneBreathWords) {
        longLines.push({ scene: scene.id, words: wordCount });
      }
    }
  }
  if (longLines.length === 0) {
    return [
      {
        level: "pass",
        category: "De-AI",
        check: `All voiceover lines ≤${THRESHOLDS.maxOneBreathWords} words (one breath)`,
      },
    ];
  }
  const detail = longLines
    .slice(0, 3)
    .map((l) => `scene ${l.scene}: ${l.words}w`)
    .join(", ");
  return [
    {
      level: "warn",
      category: "De-AI",
      check: `One-breath check (≤${THRESHOLDS.maxOneBreathWords} words per sentence)`,
      detail: `${longLines.length} lines exceed 25 words (${detail})`,
      fix: "Split long lines at natural breath points",
    },
  ];
}

/**
 * Hook on-screen text should contain a company name for subject visibility.
 *
 * Company sources (in priority order):
 * 1. meta.keyEntities.companies — the video's own company list (dynamic)
 * 2. scene.texts.subject — hook template renders this field
 * 3. KNOWN_COMPANIES — hardcoded fallback (backwards compat when no meta)
 *
 * @param {Array} scenes - scene-data array
 * @param {Object} [meta] - video meta with keyEntities.companies array
 * @returns {Array} result objects
 */
export function checkSubjectVisibility(scenes, meta) {
  const hookTexts = sceneTexts(scenes[0] || {});

  // 1. Dynamic: meta.keyEntities.companies (primary source)
  const metaCompanies = meta?.keyEntities?.companies;
  if (Array.isArray(metaCompanies) && metaCompanies.length > 0) {
    const hasCompany = metaCompanies.some((c) => hookTexts.includes(c.toLowerCase()));
    if (hasCompany) {
      return [
        {
          level: "pass",
          category: "Hook",
          check: "Subject visibility in hook",
          detail: "Company name in on-screen text (from meta)",
        },
      ];
    }
  }

  // 2. Secondary: scene.texts.subject field (hook template renders this)
  if (hookTexts && scenes[0]?.texts?.subject) {
    return [
      {
        level: "pass",
        category: "Hook",
        check: "Subject visibility in hook",
        detail: "Company name in on-screen text (subject field)",
      },
    ];
  }

  // 3. Fallback: KNOWN_COMPANIES list (backwards compat when meta not passed)
  const hasKnownCompany = KNOWN_COMPANIES.some((c) => hookTexts.includes(c));
  if (hasKnownCompany) {
    return [
      {
        level: "pass",
        category: "Hook",
        check: "Subject visibility in hook",
        detail: "Company name in on-screen text",
      },
    ];
  }
  return [
    {
      level: "warn",
      category: "Hook",
      check: "Subject visibility in hook",
      detail: "No company name in hook on-screen text",
      fix: "Ensure logo + name are large enough (≥60px, white or brand color)",
    },
  ];
}

/** Series meta must be complete if present */
export function checkSeriesMeta(seriesMeta) {
  if (!seriesMeta) return [];
  if (seriesMeta.partNumber && seriesMeta.totalParts && seriesMeta.seriesId) {
    return [
      {
        level: "pass",
        category: "Series",
        check: "Series meta",
        detail: `Part ${seriesMeta.partNumber}/${seriesMeta.totalParts} of "${seriesMeta.seriesId}"`,
      },
    ];
  }
  return [
    {
      level: "fail",
      category: "Series",
      check: "Series meta",
      detail: "Missing required fields",
      fix: "Ensure partNumber, totalParts, seriesId are set",
    },
  ];
}

/** No clickbait patterns in any scene */
export function checkClickbait(scenes) {
  let count = 0;
  for (const scene of scenes) {
    const vo = scene.voiceover || "";
    if (CLICKBAIT_PATTERNS.some((p) => p.test(vo))) count++;
  }
  if (count === 0) {
    return [{ level: "pass", category: "Penalty", check: "No clickbait patterns in any scene" }];
  }
  return [
    {
      level: "fail",
      category: "Penalty",
      check: "No clickbait in any scene",
      detail: `${count} scenes contain clickbait language`,
      fix: "Rewrite to be factual but dramatic",
    },
  ];
}

/** No unverified "sources say" without attribution */
export function checkUnverifiedClaims(scenes) {
  let count = 0;
  for (const scene of scenes) {
    const vo = scene.voiceover || "";
    if (/\bsources say\b/i.test(vo) && !NAMED_SOURCE_PATTERN.test(vo)) count++;
  }
  if (count === 0) {
    return [{ level: "pass", category: "Penalty", check: "No unverified 'sources say' claims" }];
  }
  return [
    {
      level: "fail",
      category: "Penalty",
      check: "No unverified claims",
      detail: `${count} scenes use 'sources say' without attribution`,
      fix: "Replace with specific source: 'Bloomberg reported...'",
    },
  ];
}

/** No cross-platform watermark references */
export function checkNoWatermarks(scenes) {
  for (const scene of scenes) {
    const allText = JSON.stringify(scene);
    if (WATERMARK_PATTERN.test(allText)) {
      return [
        {
          level: "fail",
          category: "Penalty",
          check: "No cross-platform watermarks",
          detail: "Found platform reference in scene data",
          fix: "Remove cross-platform references",
        },
      ];
    }
  }
  return [
    {
      level: "pass",
      category: "Penalty",
      check: "No cross-platform watermark references in scene data",
    },
  ];
}

/** Voiceover lines should vary in length (not all teleprompter-uniform) */
export function checkTeleprompterRhythm(scenes) {
  const voLengths = scenes.filter((s) => s.voiceover).map((s) => s.voiceover.split(/\s+/).length);
  if (voLengths.length <= 2) {
    return [
      {
        level: "pass",
        category: "De-AI",
        check: "Voiceover line length variation",
        detail: "Too few lines to check",
      },
    ];
  }
  const avg = voLengths.reduce((a, b) => a + b, 0) / voLengths.length;
  const allSimilar = voLengths.every(
    (l) => Math.abs(l - avg) / avg < THRESHOLDS.teleprompterMaxDeviation,
  );
  if (allSimilar) {
    return [
      {
        level: "warn",
        category: "De-AI",
        check: "Teleprompter rhythm",
        detail: "All voiceover lines are similar length (~15% of each other)",
        fix: "Add a short punch line between long ones to break the rhythm",
      },
    ];
  }
  return [
    {
      level: "pass",
      category: "De-AI",
      check: "Voiceover line length variation",
      detail: "Lines vary in length (natural rhythm)",
    },
  ];
}

/** No CTA stacking (3+ CTAs in one scene) */
export function checkCTAStacking(scenes) {
  let stacks = 0;
  for (const scene of scenes) {
    const vo = scene.voiceover || "";
    const ctaCount = (vo.match(CTA_PATTERN) || []).length;
    if (ctaCount >= THRESHOLDS.ctaStackThreshold) stacks++;
  }
  if (stacks === 0) {
    return [
      {
        level: "pass",
        category: "De-AI",
        check: `No CTA stacking (≥${THRESHOLDS.ctaStackThreshold} CTAs in one scene)`,
      },
    ];
  }
  return [
    {
      level: "warn",
      category: "De-AI",
      check: "CTA stacking",
      detail: `${stacks} scenes have 3+ calls to action`,
      fix: "Use one clear ask per scene",
    },
  ];
}

/**
 * Video should target one primary goal (<=2 goal signals).
 *
 * Three explicit CTA verb categories (spec: removed "completion" category
 * which was too broad — "see", "look", "here is" are narration, not CTAs):
 * - engagement: follow, subscribe
 * - interaction: comment, tell, ask, question
 * - amplification: share, save
 */
export function checkPrimaryGoal(scenes) {
  const goalIndicators = {
    engagement: /\bfollow|subscribe\b/i,
    interaction: /\bcomment|tell|ask|question\b/i,
    amplification: /\bshare|save\b/i,
  };
  const allVO = scenes.map((s) => s.voiceover || "").join(" ");
  let goalCount = 0;
  for (const pattern of Object.values(goalIndicators)) {
    if (pattern.test(allVO)) goalCount++;
  }
  if (goalCount <= THRESHOLDS.maxGoalSignals) {
    return [
      {
        level: "pass",
        category: "De-AI",
        check: "Clear primary goal (≤2 goal signals)",
        detail: `${goalCount} goals detected`,
      },
    ];
  }
  return [
    {
      level: "warn",
      category: "De-AI",
      check: "Primary goal focus",
      detail: `${goalCount} goal signals detected`,
      fix: "Focus on one primary goal per video",
    },
  ];
}

/** Three-tier repetition: body scenes' on-screen text must not repeat a
 *  verbatim voiceover phrase (VO + subtitle + on-screen all-same = noise).
 *  Hook (scene 1) and CTA (last) are excluded — they carry their own rules. */
export function checkBodyTextVoRedundancy(scenes) {
  const minWords = THRESHOLDS.bodyTextDuplicateMinWords;
  const warns = [];

  for (let i = 1; i < scenes.length - 1; i++) {
    const scene = scenes[i];
    const vo = normalizeForCompare(scene.voiceover);
    const texts = normalizeForCompare(JSON.stringify(scene.texts || ""));
    if (!vo || !texts) continue;

    // Sliding window over VO words; any window appearing verbatim in the
    // on-screen text is a three-tier repetition.
    const words = vo.split(" ");
    for (let j = 0; j + minWords <= words.length; j++) {
      const phrase = words.slice(j, j + minWords).join(" ");
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`).test(texts)) {
        warns.push({
          level: "warn",
          category: "De-AI",
          check: "On-screen text duplicates VO (three-tier repetition)",
          detail: `Scene ${scene.id}: "${phrase}" appears verbatim in voiceover and on-screen text`,
          fix: "Vary the wording — VO, subtitle and on-screen text should each carry different words",
        });
        break;
      }
    }
  }

  if (warns.length === 0) {
    return [
      {
        level: "pass",
        category: "De-AI",
        check: "On-screen text differs from VO (body scenes)",
      },
    ];
  }
  return warns;
}

/** Lowercase, strip punctuation/symbols, collapse whitespace for comparison. */
function normalizeForCompare(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Semantic consistency check — detects contradictions between voiceover
 * and on-screen text within the same scene.
 *
 * Uses a curated contradiction table. Both sides are matched on WORD
 * BOUNDARIES: the previous substring matching let "illegal" satisfy the
 * "legal" term, so a scene that agreed with itself could still be flagged
 * (#763).
 *
 * Pairs that need entity scope to be a contradiction are deliberately absent:
 * "up"/"down" (`up 3%` alongside `costs down` is agreement, not contradiction)
 * and "restricted"/"available" (a chip can be export-restricted and available
 * in China in the same breath). What remains flips a fact, not a direction.
 *
 * Comparison scenes (texts containing "vs"/"VS") get WARN only — antonyms
 * are expected when contrasting two different entities. Non-comparison
 * scenes get FAIL — the VO and text should agree.
 *
 * Limitations:
 * - Rule-based, not semantic understanding. May miss subtle contradictions
 *   requiring world knowledge.
 * - The Agent should still do a manual cross-reference pass before running
 *   the pipeline. This check is a safety net, not a replacement.
 */
export function checkSemanticConsistency(scenes) {
  // [voTerm, textTerm, description]
  // voTerm: if found in voiceover (case-insensitive, word-boundary)
  // textTerm: if found in on-screen text (case-insensitive, word-boundary)
  const CONTRADICTION_PAIRS = [
    ["restricted", "can buy", "VO says 'restricted' but text says 'can buy'"],
    ["export-restricted", "can buy", "VO says 'export-restricted' but text says 'can buy'"],
    ["illegal", "can buy", "VO says 'illegal' but text says 'can buy'"],
    ["not allowed", "can buy", "VO says 'not allowed' but text says 'can buy'"],
    ["banned", "can buy", "VO says 'banned' but text says 'can buy'"],
    ["banned", "legal", "VO says 'banned' but text says 'legal'"],
    ["legal", "banned", "VO says 'legal' but text says 'banned'"],
    ["legal", "illegal", "VO says 'legal' but text says 'illegal'"],
    ["clean", "accused", "VO says 'clean' but text says 'accused'"],
    ["clean", "guilty", "VO says 'clean' but text says 'guilty'"],
    ["rejected", "accepted", "VO says 'rejected' but text says 'accepted'"],
    ["rejected", "approved", "VO says 'rejected' but text says 'approved'"],
    ["raises", "lowers", "VO says 'raises' but text says 'lowers'"],
    ["raises", "cuts", "VO says 'raises' but text says 'cuts'"],
    ["increases", "decreases", "VO says 'increases' but text says 'decreases'"],
    ["open source", "closed source", "VO says 'open source' but text says 'closed source'"],
    ["closed source", "open source", "VO says 'closed source' but text says 'open source'"],
  ];

  const results = [];

  for (const scene of scenes) {
    const vo = sceneVO(scene);
    const texts = sceneTexts(scene);
    const isComparison = /\bvs\b/i.test(texts);

    for (const [voTerm, textTerm, description] of CONTRADICTION_PAIRS) {
      if (hasTerm(vo, voTerm) && hasTerm(texts, textTerm)) {
        results.push({
          level: isComparison ? "warn" : "fail",
          category: "Fact-Check",
          check: "Semantic consistency (VO vs on-screen text)",
          detail: `Scene ${scene.id}: ${description}${isComparison ? " (comparison scene — verify entities differ)" : ""}`,
          fix: "Align the on-screen text with the voiceover claim, or correct the voiceover to match the factual label",
        });
      }
    }
  }

  if (results.length === 0) {
    return [
      {
        level: "pass",
        category: "Fact-Check",
        check: "Semantic consistency (VO vs on-screen text)",
      },
    ];
  }
  return results;
}

/**
 * Loop-close: last scene should reference the hook for natural rewatch.
 *
 * Pass state (spec: when CTA contains a core number from meta.dataPoints,
 * the loop-close is achieved — the ending recontextualizes the opening).
 * Real packs write dataPoints as a string[] ("$629M Series C at a $4.3B
 * valuation"), not the {value} shape this check originally read; `dp.value`
 * was always undefined, so the pass branch was dead code for every pack
 * (#762). Both shapes are accepted and compared through numericAnchors, which
 * normalizes digit and spelled forms (scale words and decimals included) onto
 * the same values — the lexicon lives in normalize-tts-text.mjs, the module
 * that already owns digit↔word conversion.
 *
 * @param {Array} scenes - scene-data array
 * @param {Object} [meta] - video meta with optional dataPoints array
 * @returns {Array} result objects
 */
export function checkLoopClose(scenes, meta) {
  const firstVO = (scenes[0]?.voiceover || "").toLowerCase();
  const lastVO = (scenes[scenes.length - 1]?.voiceover || "").toLowerCase();

  // New: check if CTA contains any core number from meta.dataPoints
  if (Array.isArray(meta?.dataPoints)) {
    const anchors = new Set();
    for (const dp of meta.dataPoints) {
      const text = typeof dp === "string" ? dp : String(dp?.value ?? "");
      for (const anchor of numericAnchors(text)) anchors.add(anchor);
    }
    if (anchors.size > 0) {
      const hasCoreNumber = numericAnchors(lastVO).some((anchor) => anchors.has(anchor));
      if (hasCoreNumber) {
        return [
          {
            level: "pass",
            category: "De-AI",
            check: "Loop-close design",
            detail: "Last scene references hook's core data point",
          },
        ];
      }
    }
  }

  // Fallback: word matching (legacy behavior, always warn)
  const firstWords = firstVO
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 5);
  const hasLoopClose = firstWords.some((w) => lastVO.includes(w));
  if (hasLoopClose) {
    return [
      {
        level: "warn",
        category: "De-AI",
        check: "Loop-close design",
        detail: "Last scene may reference the hook",
        fix: "Verify the last frame makes the first frame land differently on rewatch",
      },
    ];
  }
  return [
    {
      level: "warn",
      category: "De-AI",
      check: "Loop-close design",
      detail: "Last scene does not clearly reference the hook",
      fix: "End on a line that recontextualizes the opening for natural rewatch",
    },
  ];
}

/** Hook scene media contract (#299).
 *
 *  The hook is the opening 4.5–5 seconds, and asset-sourcer structurally skips it —
 *  so a missing hook file is never "a sourcing gap".  A hook must have one of:
 *
 *    (a) a manually bound `media` object (curated: cover fit, legible overlay,
 *        attribution),
 *    (b) `media: null` — an explicit CSS-only waiver, surfaced as a warning,
 *    (c) a strategy that can produce media after sourcing (b-roll /
 *        asset-then-broll / ai-image / asset-then-ai-image) — preflight warns,
 *        the final media gate enforces the landed file.
 *
 *  Anything else (`mediaStrategy` = "asset" or absent, no media) fails
 *  preflight: the author must bind from the curated library or waive it.
 */
export function checkHookMediaContract(scenes) {
  const CATEGORY = "Hook";
  const CHECK = "Hook media background";
  const hook = scenes[0];
  if (hook?.visualType !== "hook") {
    return [{ level: "pass", category: CATEGORY, check: CHECK, detail: "No hook scene" }];
  }

  if (hook.media) {
    const media = hook.media;
    // The binding itself passes (media exists); quality issues are reported as
    // their own checks so the author sees exactly what to fix. The contract is
    // shared with the final media gate (hook-media.mjs) so render-only /
    // rerender paths enforce the same fit/overlay/source rules.
    const results = [
      {
        level: "pass",
        category: CATEGORY,
        check: CHECK,
        detail: `${media.type}: ${media.path}`,
      },
    ];
    const quality = checkHookMediaQuality(media);
    for (const f of quality.failures) {
      results.push({
        level: "fail",
        category: CATEGORY,
        check: f.check,
        detail: f.detail,
        fix: f.fix,
      });
    }
    for (const w of quality.warnings) {
      results.push({
        level: "warn",
        category: CATEGORY,
        check: w.check,
        detail: w.detail,
        fix: w.fix,
      });
    }
    return results;
  }

  // Explicit `media: null` is a deliberate CSS-only hook, not an omission.
  // Distinguish it from a missing `media` key: `"media" in hook` survives the
  // null value, an absent key reads as falsy too.
  if (hook.media === null && "media" in hook) {
    return [
      {
        level: "warn",
        category: CATEGORY,
        check: CHECK,
        detail: "explicit media:null waiver — hook renders CSS-only by choice",
      },
    ];
  }

  // `mediaOptOut` predates this contract: generation (planScenes) skips
  // opt-outs, so a hook carrying it can never receive media — fail instead of
  // promising a generation that cannot happen.
  if (hook.mediaOptOut === true) {
    return [
      {
        level: "fail",
        category: CATEGORY,
        check: CHECK,
        detail:
          "Hook sets mediaOptOut:true but has no media — mediaOptOut is deprecated and generation skips opt-outs, so the opening hook would render CSS-only",
        fix: "mediaOptOut is deprecated: bind scene.media from the curated library, or use media: null for a deliberate CSS-only hook",
      },
    ];
  }

  // A generation strategy (b-roll / asset-then-broll / ai-image /
  // asset-then-ai-image) can still produce the file after sourcing: warn at
  // preflight, enforce the landed file in the final media gate.
  if (GENERATING_STRATEGIES.has(hook.mediaStrategy)) {
    return [
      {
        level: "warn",
        category: CATEGORY,
        check: CHECK,
        detail: `Hook media will be generated after sourcing (mediaStrategy: ${hook.mediaStrategy}); the final media gate enforces the result`,
      },
    ];
  }

  return [
    {
      level: "fail",
      category: CATEGORY,
      check: CHECK,
      detail:
        "Hook scene has no media (manual curation — asset-sourcer skips hooks) — the opening hook would render CSS-only",
      fix: 'Bind scene.media from the curated library (media: { type, path: "assets/<file>", source, fit: "cover" }), or set media: null deliberately for a CSS-only hook',
    },
  ];
}

/** Narrative scene media warning: warns when a sourcing-eligible scene has no
 *  usable search claim — no bound media, no generating strategy, and no
 *  `assetNeed` or voiceover that tokenizes into search phrases.
 *
 *  #354 made `assetNeed` an override: asset-sourcer derives a claim from the
 *  voiceover for every eligible scene without bound media, so "declares no
 *  assetNeed" is no longer a gap by itself. The remaining gap is a scene whose
 *  claim yields no query at all — sourcing cannot build a search from it, and
 *  the scene stays CSS-only unless it generates.
 *
 *  #760: shares `skipsMediaSourcing` with asset-sourcer. The two modules must
 *  agree on what counts as "intentionally no media" (media: null, CSS-only
 *  layouts, hooks, NO_MEDIA_TYPES, and the deprecated `mediaOptOut` waiver),
 *  otherwise this warning scolds scenes the sourcer skips by design. An
 *  `mediaOptOut` on a media-dependent layout is still a hard failure in
 *  final-media-gate, so realignment here does not soften the render gate.
 *  Preflight runs before Step 1.5, so a usable claim or generating strategy is
 *  a plan, not a gap — final-media-gate enforces the landed file at render
 *  time. */
function checkNarrativeMediaWarning(scenes, phrases = sceneClaimPhrases(scenes)) {
  const mediaScenes = scenes.filter(
    (s) => !skipsMediaSourcing(s) && !GENERATING_STRATEGIES.has(s.mediaStrategy),
  );
  const missing = mediaScenes.filter(
    (s) => !s.media?.path && (phrases.get(s.id) ?? []).length === 0,
  );
  if (missing.length === 0) {
    return [
      {
        level: "pass",
        category: "Media",
        check: "Narrative scene media coverage",
        detail:
          mediaScenes.length === 0
            ? "No scenes are missing a media plan"
            : `All ${mediaScenes.length} sourcing-eligible scenes have a usable search claim`,
      },
    ];
  }
  const missingIds = missing.map((s) => s.id).join(", ");
  return [
    {
      level: "warn",
      category: "Media",
      check: "Narrative scene media coverage",
      detail: `${missing.length} scene(s) without a usable stock claim: [${missingIds}] — the voiceover has no searchable content words and no assetNeed is declared, so sourcing cannot query and the scene may stay CSS-only`,
      fix: "Declare assetNeed (and optional searchHints) for Step 1.5 sourcing, bind scene.media, choose a generating strategy (b-roll / ai-image), or set media: null for a deliberate CSS-only scene",
    },
  ];
}

/** `searchHints` schema check (#354). The field is the writer override for
 *  the search phrases derived from a scene's claim; without a preflight look a
 *  typo would behave like "no hints" and silently fall back to tokenization —
 *  the #836 failure mode applied to the new field. That includes a misspelled
 *  key (`searchHint`, `search_hints`), which would otherwise leave the field
 *  invisible to every reader. */
const HINT_KEY_VARIANTS = /^search[_-]?hints?$/i;

function checkSearchHintsSchema(scenes, phrases = sceneClaimPhrases(scenes)) {
  const declared = (scenes ?? []).filter((scene) => scene?.searchHints !== undefined);
  const findings = [];
  for (const [index, scene] of (scenes ?? []).entries()) {
    const typo = Object.keys(scene ?? {}).find(
      (key) => key !== "searchHints" && HINT_KEY_VARIANTS.test(key),
    );
    if (typo) {
      findings.push({
        level: "fail",
        category: "Media",
        check: `Search hints schema: Scene ${scene.id ?? index + 1} key is spelled searchHints`,
        detail: `unknown key "${typo}" — nothing reads it, so the hints have no effect`,
        fix: "Rename the field to searchHints.",
      });
    }
  }
  for (const scene of declared) {
    if (!phrases.has(scene.id)) {
      findings.push({
        level: "fail",
        category: "Media",
        check: `Search hints schema: Scene ${scene.id} has a claim path`,
        detail: `searchHints is declared on a scene the sourcer never claims: hook, text-first layout, media: null, bound media without an explicit assetNeed, generation-only strategy (b-roll / ai-image; an assetNeed does not open a claim), or neither voiceover nor assetNeed — nothing reads it`,
        fix: "Remove searchHints from this scene, or make it sourcing-eligible first (hooks are curated by hand; text-first layouts cannot carry evidence — see #761).",
      });
      continue;
    }
    if (!isUsableSearchHints(scene.searchHints)) {
      findings.push({
        level: "fail",
        category: "Media",
        check: `Search hints schema: Scene ${scene.id} is a usable string array (max 4)`,
        detail: `searchHints must be an array of 1-4 retrievable phrases of at most 4 words each, got ${JSON.stringify(scene.searchHints)}`,
        fix: 'Write the phrases the stock indexes can retrieve, most specific first (e.g. ["unitree h1 humanoid robot", "humanoid robot factory"]), or omit the field to keep the claim-derived phrases. Style-only words ("cinematic close-up") and phrases over 4 words do not count.',
      });
    }
  }
  if (findings.length === 0) {
    return [
      {
        level: "pass",
        category: "Media",
        check: "Search hints schema",
        detail:
          declared.length === 0
            ? "No scene declares searchHints"
            : `searchHints usable on ${declared.length} scene(s)`,
      },
    ];
  }
  return findings;
}

/**
 * Currency dual-annotation check: warns when RMB amounts in voiceover/texts
 * do not have a USD equivalent nearby. This is a verify-time safety net —
 * normalizeSceneData() in main.mjs Step 0 should have already fixed them.
 * Detects ¥<number> or <number> (billion|million|thousand) yuan without
 * a $ within 30 chars before the match.
 */
function checkCurrencyDualAnnotation(scenes) {
  const YEN_RE = /¥[\d,.]+/gi;
  const YUAN_RE = /\d[\d,.]*\s*(?:billion|million|thousand)\s*yuan/gi;

  for (const scene of scenes) {
    const vo = scene.voiceover || "";
    const texts = JSON.stringify(scene.texts || "");
    const allText = vo + " " + texts;

    for (const re of [YEN_RE, YUAN_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(allText)) !== null) {
        const windowStart = Math.max(0, m.index - 30);
        const before = allText.substring(windowStart, m.index);
        if (!/\$\d/.test(before)) {
          return [
            {
              level: "warn",
              category: "Content",
              check: "Currency dual-annotation (¥ → $)",
              detail: `RMB amount "${m[0]}" without USD equivalent in scene ${scene.id}`,
              fix: "Run normalizeSceneData() in main.mjs Step 0 to auto-fix, or manually add $X (¥Y) format",
            },
          ];
        }
      }
    }
  }

  return [
    {
      level: "pass",
      category: "Content",
      check: "Currency dual-annotation (¥ → $)",
    },
  ];
}

/**
 * Text concatenation check: detects on-screen text fields where concatenated
 * title + titleHighlight produces two uppercase words joined without a space.
 * E.g. texts.title="STRATEGIC" + texts.titleHighlight="BACKERS" → "STRATEGICBACKERS"
 */
function checkTextConcatenation(scenes) {
  for (const scene of scenes) {
    const t = scene.texts;
    if (!t) continue;
    // Check known concatenation pairs
    const pairs = [
      ["title", "titleHighlight"],
      ["line1", "line2"],
    ];
    for (const [a, b] of pairs) {
      if (t[a] && t[b]) {
        const combined = String(t[a]) + String(t[b]);
        // Two uppercase words joined without space: ABCDEF + GHIJKL → ABCDEFGHIJKL
        // Heuristic: if both are all-caps and combined has no separator
        const aStr = String(t[a]);
        const bStr = String(t[b]);
        if (/^[A-Z]/.test(aStr) && /^[A-Z]/.test(bStr) && !/\s$/.test(aStr)) {
          // The template should add a space — if the raw data doesn't have one
          // at the boundary, the rendered output will concatenate without space
          return [
            {
              level: "warn",
              category: "De-AI",
              check: "Text concatenation spacing",
              detail: `Scene ${scene.id}: "${aStr}" + "${bStr}" may concatenate without space`,
              fix: `Add space between ${a} and ${b} in template, or add trailing space in scene-data`,
            },
          ];
        }
      }
    }
  }
  return [
    {
      level: "pass",
      category: "De-AI",
      check: "Text concatenation spacing",
    },
  ];
}

/**
 * Check the layout field only where the render layer actually reads it.
 *
 * resolveRenderLayout is the single authority (#190): narrative consumes
 * scene.layout, fullscreen forces "media", every other template forces
 * "hero-center". Requiring `layout` on those templates forced authors to write
 * a value checkTemplateContract then warned was ignored — one rule demanding
 * dead data, another scolding it (#763). Non-narrative scenes now pass whether
 * or not the field exists; a divergent value is still flagged by
 * checkTemplateContract for every template in REMOTION_SLOT_MAP.
 */
const VALID_LAYOUTS = [
  "hero-center",
  "media-bottom-bar",
  "media-split",
  "media-overlay",
  "stacked-cards",
  "cta",
];
function checkLayoutField(scenes) {
  const results = [];
  for (const scene of scenes) {
    const layout = scene.layout;
    if (scene.visualType !== "narrative") {
      results.push({
        level: "pass",
        category: "Structure",
        check: `Scene ${scene.id} layout field`,
        detail: layout
          ? `layout="${layout}" — ${scene.visualType} renders "${resolveRenderLayout(scene)}"`
          : `not required — ${scene.visualType} renders "${resolveRenderLayout(scene)}"`,
      });
      continue;
    }
    if (!layout) {
      results.push({
        level: "fail",
        category: "Structure",
        check: `Scene ${scene.id} layout field`,
        detail: "layout field missing (narrative reads it to pick a text-slot variant)",
        fix: `Add layout to scene ${scene.id} (one of: ${VALID_LAYOUTS.join(", ")})`,
      });
    } else if (!VALID_LAYOUTS.includes(layout)) {
      results.push({
        level: "fail",
        category: "Structure",
        check: `Scene ${scene.id} layout field`,
        detail: `invalid layout: ${layout}`,
        fix: `Use one of: ${VALID_LAYOUTS.join(", ")}`,
      });
    } else {
      results.push({
        level: "pass",
        category: "Structure",
        check: `Scene ${scene.id} layout field`,
        detail: `layout="${layout}"`,
      });
    }
  }
  return results;
}

/**
 * Template contract preflight (#190): run the render layer's
 * assertKnownTextFields against every scene BEFORE the TTS + render cycle.
 *
 * ShortVideo.tsx calls the same assert mid-render; a violation there wastes a
 * full TTS + render cycle (kimi-ipo shipped 4 categories of violations that
 * all passed this preflight and only blew up in Remotion). Layout resolution
 * goes through resolveRenderLayout so preflight and render judge the same
 * contract — hand-rolling the resolution here is how the drift started.
 */
export function checkTemplateContract(scenes) {
  const results = [];
  for (const scene of scenes) {
    // visualTypes outside the slot map belong to the dispatch whitelist
    // (checkVisualTypeWhitelist) — ShortVideo.tsx skips the assert for them too.
    if (!REMOTION_SLOT_MAP[scene.visualType]) continue;
    const layout = resolveRenderLayout(scene);
    try {
      assertKnownTextFields(scene.visualType, layout, scene.texts);
    } catch (e) {
      results.push({
        level: "fail",
        category: "Structure",
        check: `Scene ${scene.id} template contract`,
        detail: e.message,
        fix: "Fix the layout/field named above in scene-data — Remotion throws the same error mid-render, after TTS",
      });
    }
    // Non-narrative templates never read scene.layout (renderScene forces the
    // layout), so a divergent value is dead data that misleads authors.
    if (
      scene.visualType !== "narrative" &&
      typeof scene.layout === "string" &&
      scene.layout !== layout
    ) {
      results.push({
        level: "warn",
        category: "Structure",
        check: `Scene ${scene.id} template contract`,
        detail: `layout="${scene.layout}" is ignored — ${scene.visualType} templates always render "${layout}"`,
        // The layout FIELD is optional outside narrative (#763): this value is
        // dead data the template never reads, so delete it or set it to what
        // the template actually renders.
        fix: `Remove scene ${scene.id} layout (${scene.visualType} never reads it) or set it to "${layout}"`,
      });
    }
  }
  if (results.length === 0) {
    results.push({
      level: "pass",
      category: "Structure",
      check: "Template contract (REMOTION_SLOT_MAP)",
    });
  }
  return results;
}

// ─── Aggregate runner ───

/**
 * Run all scene-data checks and return categorized results.
 * @param {Array} scenes - scene-data.mjs scenes array
 * @param {Object|null} seriesMeta - optional series metadata
 * @returns {{ pass: Array, warn: Array, fail: Array }}
 */
/** Retention mechanism: open loop check (W7)
 *  Checks whether the scene-data declares an open-loop retention mechanism.
 *  Skips silently when no scene has retentionMechanism field (legacy scene-data compat).
 *  Warning W7 when: S2 has narrativeRole "T" but retentionMechanism is not "open-loop",
 *  or when retentionMechanism fields exist but none is "open-loop".
 *  Pass when: at least one scene has retentionMechanism "open-loop". */
export function checkOpenLoop(scenes) {
  const hasRetentionField = scenes.some((s) => s.retentionMechanism !== undefined);
  if (!hasRetentionField) return []; // skip for legacy scene-data

  const hasOpenLoop = scenes.some((s) => s.retentionMechanism === "open-loop");
  if (hasOpenLoop) {
    const openLoopScene = scenes.find((s) => s.retentionMechanism === "open-loop");
    return [
      {
        level: "pass",
        category: "Retention",
        check: "Open loop (W7)",
        detail: `Scene ${openLoopScene.id} declares open-loop retention`,
      },
    ];
  }

  const teaseScene = scenes.find((s) => s.narrativeRole === "T");
  const detail = teaseScene
    ? `Scene ${teaseScene.id} has narrativeRole T (Tease) but retentionMechanism is "${teaseScene.retentionMechanism || "unset"}" — should be "open-loop"`
    : 'No scene declares retentionMechanism "open-loop"';
  return [
    {
      level: "warn",
      category: "Retention",
      check: "Open loop (W7)",
      detail,
      fix: 'Add retentionMechanism: "open-loop" to the Tease scene (narrativeRole: "T")',
    },
  ];
}

/** Retention mechanism: pattern interrupt check (W8)
 *  Checks whether at least one scene declares pattern-interrupt.
 *  Skips silently when no scene has retentionMechanism field (legacy scene-data compat).
 *  Warning W8 when: retentionMechanism fields exist but none is "pattern-interrupt".
 *  Pass when: at least one scene has retentionMechanism "pattern-interrupt". */
export function checkPatternInterrupt(scenes) {
  const hasRetentionField = scenes.some((s) => s.retentionMechanism !== undefined);
  if (!hasRetentionField) return []; // skip for legacy scene-data

  const hasPatternInterrupt = scenes.some((s) => s.retentionMechanism === "pattern-interrupt");
  if (hasPatternInterrupt) {
    const piScene = scenes.find((s) => s.retentionMechanism === "pattern-interrupt");
    return [
      {
        level: "pass",
        category: "Retention",
        check: "Pattern interrupt (W8)",
        detail: `Scene ${piScene.id} declares pattern-interrupt retention`,
      },
    ];
  }

  return [
    {
      level: "warn",
      category: "Retention",
      check: "Pattern interrupt (W8)",
      detail: 'No scene declares retentionMechanism "pattern-interrupt"',
      fix: 'Add retentionMechanism: "pattern-interrupt" to a mid-video scene (around S5) to break attention decay',
    },
  ];
}

/** Retention mechanism: loop closure check (W9)
 *  Checks whether the penultimate content scene (before CTA) declares loop-closure.
 *  Skips silently when no scene has retentionMechanism field (legacy scene-data compat).
 *  Warning W9 when: penultimate content scene has wrong or missing retentionMechanism.
 *  Pass when: penultimate content scene has retentionMechanism "loop-closure". */
export function checkLoopClosureNarrative(scenes) {
  const hasRetentionField = scenes.some((s) => s.retentionMechanism !== undefined);
  if (!hasRetentionField) return []; // skip for legacy scene-data

  const contentScenes = scenes.filter((s) => s.visualType !== "cta");
  if (contentScenes.length < 2) return [];

  const penultimate = contentScenes[contentScenes.length - 1];
  if (penultimate.retentionMechanism === "loop-closure") {
    return [
      {
        level: "pass",
        category: "Retention",
        check: "Loop closure (W9)",
        detail: `Scene ${penultimate.id} declares loop-closure retention`,
      },
    ];
  }

  return [
    {
      level: "warn",
      category: "Retention",
      check: "Loop closure (W9)",
      detail: `Scene ${penultimate.id} (penultimate content scene) has retentionMechanism "${penultimate.retentionMechanism || "unset"}" — should be "loop-closure"`,
      fix: 'Add retentionMechanism: "loop-closure" to the last content scene before CTA to reference the hook',
    },
  ];
}

// ─── Text width budget (contract-derived hint, spec decision 14/71) ───

// Character budgets derive from the slot contract via slotCharBudget()
// (text-slots.mjs) — MEASURED_MAX_WIDTH (real content-box widths, measured in
// Chromium) ÷ SLOT_FIELDS preferredSize. The result is a warn-level creative
// hint only: the final judgment is TextGate's real per-line geometry, so this
// check neither gates nor blocks anything.

// Fields checked per scene type; hook/cta have their own structural contracts.
const WIDTH_CHECKED_TYPES = new Set([
  "narrative",
  "stat-reveal",
  "data",
  "info-card",
  "quote",
  "context",
  "contrast",
]);

export function checkTextWidthBudget(scenes) {
  const results = [];
  for (const scene of scenes) {
    if (!WIDTH_CHECKED_TYPES.has(scene.visualType)) continue;
    // Narrative without an explicit layout runs the runtime default
    // (text-slots DEFAULT_NARRATIVE_LAYOUT); other types are hero-center only.
    const layout =
      scene.visualType === "narrative" ? (scene.layout ?? DEFAULT_NARRATIVE_LAYOUT) : "hero-center";
    const declared = REMOTION_SLOT_MAP[scene.visualType]?.[layout] ?? null;
    if (!declared) continue;
    const checkable = new Set([...declared.rendered, ...declared.optional]);
    for (const field of checkable) {
      const value = scene.texts?.[field];
      if (typeof value !== "string" || value.length === 0) continue;
      // Contract rule: slotCharBudget returns null for unmeasured slots or
      // fields without a preferredSize — skip them, never guess.
      const budget = slotCharBudget({
        visualType: scene.visualType,
        layout,
        field,
      });
      if (budget == null) continue;
      if (value.length <= budget) continue;
      const slotLabel = slotId({ visualType: scene.visualType, layout, field });
      results.push({
        level: "warn",
        category: "Layout",
        check: `Text width budget — ${field} in ${scene.visualType}.${layout}`,
        detail: `${value.length} chars (contract budget ${budget} @ ${slotLabel}): "${value}"`,
        fix: `Consider shortening ${field} to ≤${budget} chars or moving to a wider layout — final judgment is the TextGate real-geometry gate.`,
      });
    }
  }
  if (results.length === 0) {
    results.push({
      level: "pass",
      category: "Layout",
      check: "Text width budget (contract-derived hint)",
    });
  }
  return results;
}

// ─── Information type scale + empty-field rule (#739) ───

const EMPTY_FIELD_TYPES = new Set(EMPTY_FIELD.visualTypes);

/**
 * Largest text object a governed scene declares, in px.
 *
 * Reads the template's own contract (`REMOTION_SLOT_MAP` for the layout the
 * renderer will resolve) so a field the template does not draw cannot make a
 * scene look full. Field values go through `textFieldValue` for the visualType
 * aliases (`data.statLabel` → `label`).
 *
 * @param {object} scene
 * @returns {{px: number, field: string}|null} null when nothing measurable renders
 */
function largestDeclaredObject(scene) {
  const layout = resolveRenderLayout(scene);
  const groups = REMOTION_SLOT_MAP[scene.visualType]?.[layout];
  if (!groups) return null;
  let largest = 0;
  let field = null;
  for (const name of [...groups.rendered, ...groups.optional]) {
    const value = textFieldValue(scene.visualType, scene.texts, name);
    if (value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    const preferred = SLOT_FIELDS[name]?.preferredSize;
    if (typeof preferred !== "number") continue;
    if (preferred > largest) {
      largest = preferred;
      field = name;
    }
  }
  return field === null ? null : { px: largest, field };
}

/**
 * Empty-field rule (#739): a governed information scene whose largest content
 * object stays under the supporting band's upper bound has no hero object —
 * the "small copy + small chip" defect the source survey names.
 *
 * Judged on the DECLARED type scale (`preferredSize`), not rendered pixels:
 * preflight runs before a frame exists, and the design sizes are the thing the
 * contract can enforce. Scenes carrying a media layer are skipped — the footage
 * is the content area's largest object, and a missing asset is the
 * final-media-gate's finding, not this rule's. `opts.sceneDurations` (the
 * post-render `audio/scene-durations.json` shape, in voiceover seconds)
 * supplies the real persistence window; the clip is what the viewer sees, so
 * the window is `sceneClipFrames()` — voiceover plus the recording buffer — not
 * the raw TTS second count. Without durations the scene itself is the window,
 * which is the same condition for every clip longer than 45 frames (voiceover
 * over ~1 s).
 *
 * Severity is WARN, matching the source's "mid-level defect": the layouts that
 * fix these scenes (the infographic layout topologies, #1215) are the deferred half
 * of #739, so this is a named design debt until they land, not a render block.
 *
 * @param {object[]} scenes
 * @param {{sceneDurations?: Array<{sceneId: number, duration: number}>}} [opts]
 * @returns {Array<{level: string, category: string, check: string, detail?: string, fix?: string}>}
 */
export function checkEmptyField(scenes, opts = {}) {
  // Tolerate a non-array payload (a legacy `{ scenes: [...] }` envelope read
  // from a persisted output dir): judge the whole shot instead of throwing.
  const rows = Array.isArray(opts.sceneDurations) ? opts.sceneDurations : [];
  const durations = new Map(
    rows
      .filter((row) => row && Number.isFinite(row.duration))
      .map((row) => [row.sceneId, row.duration]),
  );
  const warns = [];
  /** @type {Array<{px: number, field: string, frames: number|null}>} */
  const heroClear = [];
  /** Clip lengths of scenes that stay small but too short for the rule. */
  const shortSkips = [];
  let mediaHeroes = 0;
  let skipped = 0;
  scenes.forEach((scene, index) => {
    if (!EMPTY_FIELD_TYPES.has(scene.visualType)) return;
    // A rendered media layer IS the content area's largest object (background,
    // split or bottom band — every media layout gives it a large field). The
    // rule exists to catch "small copy + small chip", not a shot carried by
    // footage; media absence is the final-media-gate's job, not this rule's.
    // Only count a layer the run will actually draw: `data`/`stat-reveal` never
    // render media (#831 NO_MEDIA_TYPES), and an empty `media: {}` draws the CSS
    // fallback — exempting either would silence the rule without a hero.
    const drawsMedia =
      (scene.media?.mode === "fullscreen" || !NO_MEDIA_TYPES.has(scene.visualType)) &&
      typeof scene.media?.path === "string" &&
      scene.media.path.trim() !== "";
    if (drawsMedia) {
      mediaHeroes += 1;
      return;
    }
    const largest = largestDeclaredObject(scene);
    if (!largest) {
      skipped += 1;
      return;
    }
    const seconds = durations.get(scene.id ?? index + 1);
    const frames = seconds === undefined || seconds === null ? null : sceneClipFrames(seconds);
    if (!isEmptyField({ largestObjectPx: largest.px, frames })) {
      if (largest.px >= EMPTY_FIELD.maxObjectPx) heroClear.push({ ...largest, frames });
      else shortSkips.push(frames);
      return;
    }
    const tier = tierForSize(largest.px);
    const persistence = frames === null ? "whole-scene persistence" : `persists ${frames} frames`;
    warns.push({
      level: "warn",
      category: "Layout",
      check: `Empty field — ${scene.visualType} ${scene.id}`,
      detail:
        `largest declared object ${largest.px}px (${largest.field}, tier ${tier ?? "none"}) ` +
        `against the ${EMPTY_FIELD.maxObjectPx}px hero line, ${persistence}`,
      fix:
        `Give the shot a hero object at the hero tier (${TYPE_TIERS.hero.min}px+: stat / bigNumber / ` +
        "full-band media) and demote the small copy to supporting; the infographic layout topologies " +
        "(#1215, the deferred half of #739) — until they land this is named design debt, not a render block.",
    });
  });
  // One pass row for the whole check, not one per scene: the gate reports what
  // needs action, and a clean 29-scene pack should not add 12 rows (#763).
  // Each clause states what it actually knows — a scene skipped by the
  // persistence window did NOT clear the hero line, so it must not say so.
  if (warns.length > 0) return warns;
  const parts = [];
  if (heroClear.length > 0) {
    const smallest = heroClear.reduce((a, b) => (b.px < a.px ? b : a));
    const persistence = smallest.frames === null ? "" : `, clip ${smallest.frames} frames`;
    parts.push(
      `${heroClear.length} governed information scene(s) carry a hero object at or above the ` +
        `${EMPTY_FIELD.maxObjectPx}px hero line (smallest largest-object ${smallest.px}px ` +
        `${smallest.field}${persistence})`,
    );
  }
  if (shortSkips.length > 0) {
    parts.push(
      `${shortSkips.length} stayed under the line within the ${EMPTY_FIELD.minFrames}-frame ` +
        `window (longest clip ${Math.max(...shortSkips)} frames)`,
    );
  }
  if (mediaHeroes > 0) parts.push(`${mediaHeroes} carried by a media layer`);
  if (skipped > 0) parts.push(`${skipped} without a measurable text object`);
  return [
    {
      level: "pass",
      category: "Layout",
      check: "Empty field",
      detail: parts.length > 0 ? parts.join("; ") : "no governed information scenes in this pack",
    },
  ];
}

// ─── protagonist light (#738) ───

/**
 * Protagonist light gate (#738): does each scene light exactly one subject?
 *
 * The plans themselves are validated once (`validateLightPlan`); a plan that
 * breaks the budget also throws inside the renderer, so a `fail` row here is
 * the preflight copy of a render-time error, not a second opinion.
 *
 * The per-scene half is the content binding: a plan names contract fields
 * (`stat`, `result`, `points` …) and a pack may leave one out. What the gate
 * refuses is a shot with NO lit subject — the glare-free "small copy on a dark
 * frame" the visual review keeps naming. Candidates are in priority order
 * because some templates draw mutually exclusive heroes (the hook's number OR
 * claim); the first one the scene declares is the one the template renders, so
 * that, and only that, is the protagonist.
 *
 * A narrative card layout (`stacked-cards`) lights each card's own `result`;
 * the field is still declared, so the check holds without a per-layout branch.
 *
 * @param {object[]} scenes
 * @returns {Array<{level: string, category: string, check: string, detail?: string, fix?: string}>}
 */
export function checkFocusLight(scenes) {
  const planErrors = [];
  for (const [visualType, plan] of Object.entries(LIGHT_PLANS)) {
    for (const error of validateLightPlan(plan)) {
      planErrors.push({
        level: "fail",
        category: "Layout",
        check: `Protagonist light plan — ${visualType}`,
        detail: error,
        fix: `Fix LIGHT_PLANS.${visualType} in lib/focus-light.mjs — the renderer throws on the same budget`,
      });
    }
  }

  const warns = [];
  let governed = 0;
  let skipped = 0;
  for (const scene of scenes) {
    if (!REMOTION_SLOT_MAP[scene.visualType]) continue;
    // Fullscreen media draws no text frame: the footage is the subject and the
    // light system does not apply (final-media-gate owns that layer).
    if (scene.media?.mode === "fullscreen") {
      skipped += 1;
      continue;
    }
    // A template without a plan renders unlit; the contract test pins
    // LIGHT_PLANS against REMOTION_SLOT_MAP, so the missing plan fails CI
    // instead of turning every scene of the pack into a warning.
    const plan = lightPlanFor(scene.visualType);
    if (!plan) continue;
    governed += 1;
    const rendered = plan.protagonist.filter((field) => {
      const value = textFieldValue(scene.visualType, scene.texts, field);
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && String(value).trim() !== "";
    });
    if (rendered.length === 0) {
      warns.push({
        level: "warn",
        category: "Layout",
        check: `Protagonist light — ${scene.visualType} ${scene.id}`,
        detail:
          `no protagonist field is declared (${plan.protagonist.join(" / ")}), so the shot has ` +
          "no lit subject — the frame stays flat",
        fix: `Declare ${plan.protagonist[0]} on scene ${scene.id}, or change the template's plan if the subject moved.`,
      });
    }
  }
  if (planErrors.length > 0) return planErrors;
  if (warns.length > 0) return warns;
  return [
    {
      level: "pass",
      category: "Layout",
      check: "Protagonist light",
      detail:
        `${governed} scene(s) light one declared subject, ${Object.keys(LIGHT_PLANS).length} ` +
        `template plan(s) within budget (${FOCUS_LIGHT.maxConcurrent} focus per frame, ` +
        `${FOCUS_LIGHT.transferOffFrames}-frame extinguish)` +
        (skipped > 0 ? `; ${skipped} fullscreen media scene(s) skipped` : ""),
    },
  ];
}

// ─── visualType whitelist (Remotion dispatch table) ───
// The Remotion renderer dispatches on a fixed component set; an unknown
// visualType silently degrades to NarrativeScene and drops custom text
// fields (observed: "benchmark" scene rendered without its bars, qwen4-preview
// v1). The whitelist below mirrors scripts/short-video/remotion/src/ShortVideo.tsx.
const REMOTION_VISUAL_TYPES = new Set([
  "hook",
  "cta",
  "narrative",
  "data",
  "info-card",
  "quote",
  "context",
  "contrast",
  "stat-reveal",
]);

export function checkVisualTypeWhitelist(scenes, opts = {}) {
  // Remotion is the only renderer since the HTML/Playwright path was retired
  // (decision 59); the whitelist always applies. `opts` is kept for call-site
  // compatibility and no longer carries a renderer opt-out.
  void opts;
  const results = [];
  for (const scene of scenes) {
    if (REMOTION_VISUAL_TYPES.has(scene.visualType)) continue;
    results.push({
      level: "fail",
      category: "Structure",
      check: `Scene ${scene.id} visualType in Remotion dispatch table`,
      detail: `"${scene.visualType}" is not in the Remotion component set and will silently render as narrative`,
      fix: `Map scene ${scene.id} to one of: ${[...REMOTION_VISUAL_TYPES].join(", ")}.`,
    });
  }
  if (results.length === 0) {
    results.push({
      level: "pass",
      category: "Structure",
      check: "visualType whitelist (Remotion dispatch table)",
    });
  }
  return results;
}

// ─── TTS instruct coverage (#270, absorbing #273 P1.3) ───

// Every scene's style must resolve to an instruct in the single source
// (lib/tts/instruct.mjs). Two real failures motivated this gate:
//   1. #273: INSTRUCT_MAP covered only 4 of the 9 dispatched visualTypes, so
//      contrast / info-card / stat-reveal / quote / context reached the Kaggle
//      kernel with no instruct_text at all and fell into a method CosyVoice3
//      does not have ('CosyVoice3' object has no attribute 'inference').
//   2. #270: the engines that DID have a lookup carried drifting copies, so the
//      same style produced the pre-#234 read (no persona, no accent guidance)
//      depending on which engine ran. See the #270 baseline: 9/9 styles had
//      engine-divergent instruct.
// Both are decidable before any GPU time, so this fails preflight rather than
// surfacing as a TTS error or a quietly wrong accent.
export function checkInstructCoverage(scenes, opts = {}) {
  void opts;
  const results = [];

  // Contract first: the Remotion dispatch table must be covered by the standard.
  // This catches a NEW visualType at the moment it is added, before any content
  // uses it — the per-scene loop below can only see styles content already has.
  const uncoveredTypes = [...REMOTION_VISUAL_TYPES].filter((t) => !hasInstructStyle(t));
  for (const type of uncoveredTypes) {
    results.push({
      level: "fail",
      category: "TTS",
      check: `Instruct standard covers visualType "${type}"`,
      detail: `"${type}" is in the Remotion dispatch table but has no entry in lib/tts/instruct.mjs — TTS would run it without an instruct (or with a stale pre-#234 one)`,
      fix: `Add a "${type}" entry to INSTRUCT_STANDARD.styles in scripts/short-video/lib/tts/instruct.mjs (Persona + Accent + Emotion + Pacing).`,
    });
  }

  for (const scene of scenes) {
    const style = scene.refStyle || scene.visualType;
    if (!style) {
      results.push({
        level: "fail",
        category: "TTS",
        check: `Scene ${scene.id} has a TTS instruct style`,
        detail: "neither refStyle nor visualType is set, so no emotion instruct can be resolved",
        fix: `Set visualType (and refStyle if a styled reference audio is wanted) on scene ${scene.id}`,
      });
      continue;
    }
    if (!hasInstructStyle(style)) {
      results.push({
        level: "fail",
        category: "TTS",
        check: `Scene ${scene.id} TTS instruct style resolves`,
        detail: `style "${style}" has no entry in lib/tts/instruct.mjs — TTS would run this scene without an instruct`,
        fix: `Use a standard style, or add "${style}" to INSTRUCT_STANDARD.styles in scripts/short-video/lib/tts/instruct.mjs.`,
      });
      continue;
    }
    if (typeof scene.instruct === "string" && scene.instruct.trim() !== "") {
      const report = validateInstructSignature(scene.instruct);
      if (!report.ok) {
        results.push({
          level: "fail",
          category: "TTS",
          check: `Scene ${scene.id} instruct override meets the 4D standard`,
          detail: `hand-written instruct fails: ${report.hardIssues.map((i) => i.code).join(", ")}`,
          fix: `Delete scene ${scene.id}'s instruct override and rely on its style, or fix it to match lib/tts/instruct.mjs (#270).`,
        });
      }
    }
  }

  if (results.length === 0) {
    results.push({
      level: "pass",
      category: "TTS",
      check: "TTS instruct coverage (single source in lib/tts/instruct.mjs)",
    });
  }
  return results;
}

/**
 * B13: Inline [ASSET NEEDED: ...] markers must never leak into voiceover —
 * TTS would read them aloud. Asset requirements belong in the structured
 * `assetNeed` field, which asset-sourcer consumes.
 */
export function checkAssetNeedAnnotation(scenes) {
  const found = [];
  for (const scene of scenes) {
    const vo = scene.voiceover || "";
    if (/\[\s*asset\s+needed/i.test(vo)) {
      found.push(scene.id);
    }
  }
  if (found.length === 0) {
    return [{ level: "pass", category: "Structure", check: "Asset need annotation placement" }];
  }
  return [
    {
      level: "fail",
      category: "Structure",
      check: "Asset need annotation placement",
      detail: `Inline [ASSET NEEDED marker found in voiceover of scenes: ${found.join(", ")} — TTS would read it aloud`,
      fix: 'Move the asset requirement to the scene\'s `assetNeed` field (e.g. assetNeed: "architecture diagram") and remove the marker from voiceover',
    },
  ];
}

// The vocabulary lives in a leaf module so claim-keywords (#354) and the B-roll
// orchestrator can read it without cycling through scene-rules.
export {
  MEDIA_STRATEGIES,
  IMAGE_GENERATING_STRATEGIES,
  GENERATING_STRATEGIES,
} from "./media-strategies.mjs";

/**
 * True when an EXPLICIT strategy generates a static image rather than a video
 * clip. The default chain has no form until the orchestrator resolves one via
 * budget (media-strategies.selectAutoForm) — callers must branch on the
 * resolved form, not on this helper, for chain scenes (#355).
 */
export function isImageStrategy(strategy) {
  return IMAGE_GENERATING_STRATEGIES.has(strategy);
}

/**
 * Contract for the B-roll fields (`mediaStrategy` / `aiVideo.prompt`).
 * Silent for content that uses neither field, so existing scene-data is
 * never judged by a rule it does not opt into.
 */
/**
 * #191 mediaOptOut deprecation + explicit-null placement audit.
 *
 * - `mediaOptOut` is deprecated: CSS-only layouts (hero-center /
 *   stacked-cards) are auto-skipped by the sourcing filter, and
 *   `media: null` is the explicit "no media ever" declaration. The flag is
 *   still honored at runtime until removal.
 * - `media: null` on a media-dependent layout renders an empty band — warn
 *   so the deliberate contradiction stays visible at preflight.
 */
export function checkMediaOptOutDeprecation(scenes) {
  const CHECK = "mediaOptOut deprecation";
  const CATEGORY = "Media";
  const optedOut = [];
  const nullOnMediaLayout = [];
  for (const scene of scenes) {
    if (scene.mediaOptOut === true) optedOut.push(String(scene.id));
    if (scene.media === null && MEDIA_DEPENDENT_LAYOUTS.has(scene.layout)) {
      nullOnMediaLayout.push(String(scene.id));
    }
  }
  const results = [];
  if (optedOut.length > 0) {
    results.push({
      level: "warn",
      category: CATEGORY,
      check: CHECK,
      detail: `Scene(s) ${optedOut.join(", ")} set the deprecated mediaOptOut flag`,
      fix: 'Remove mediaOptOut — CSS-only layouts (hero-center / stacked-cards) are auto-skipped; for "no media ever" set media: null',
    });
  }
  if (nullOnMediaLayout.length > 0) {
    results.push({
      level: "warn",
      category: CATEGORY,
      check: CHECK,
      detail: `Scene(s) ${nullOnMediaLayout.join(", ")} set media: null on a media-dependent layout — the frame renders an empty band`,
      fix: "Use a CSS-only layout (hero-center / stacked-cards) if the scene is meant to be text-only",
    });
  }
  return results;
}

/**
 * Whether the scene renders one of the two text-first layouts (#761).
 *
 * `narrative/stacked-cards` and `contrast` (which always renders hero-center)
 * draw their text block over the full-bleed media layer. `media.mode:
 * "fullscreen"` is the exception: ShortVideo hands the scene to FullscreenMedia
 * before the layout dispatch, so the picture fills the frame with only the
 * source label on top — evidence stays readable there, whatever the layout.
 */
function isTextFirstLayoutScene(scene) {
  if (scene.media?.mode === "fullscreen") return false;
  return resolveRenderLayout(scene) === "stacked-cards" || scene.visualType === "contrast";
}

/**
 * #761 media routing for the two text-first layouts.
 *
 * `narrative/stacked-cards` and `contrast/hero-center` render `scene.media` as
 * a full-bleed ambient background; the cards / comparison columns sit on top of
 * it. Atmosphere works there, evidence structurally does not: a chart, table or
 * screenshot behind the text block cannot be read, so the beat ships as
 * text-only while claiming it asked for a picture.
 *
 * An `assetNeed` or an `evidence: true` binding on either layout is therefore a
 * contradiction. Fail it before Step 1.5 spends money and let the author choose
 * one of three resolutions (same shape as the #299 hook contract): route the
 * beat to a media-window layout or `mode: "fullscreen"`, drop the evidence
 * intent and ship it as ambient, or drop the intent AND declare `media: null`
 * as a deliberate text-only scene.
 *
 * Scoped to these two layouts on purpose: context / info-card / hook also use
 * hero-center but DO render media; #761 is about the two that cannot show it.
 */
export function checkLayoutMediaRouting(scenes) {
  const CHECK = "Text-first layout media routing";
  const CATEGORY = "Media";
  // Single source of truth for the layouts that DO carry their own media
  // window (final-media-gate.MEDIA_DEPENDENT_LAYOUTS) — a new one cannot leave
  // this fix text stale.
  const MEDIA_WINDOW_LAYOUTS = [...MEDIA_DEPENDENT_LAYOUTS]
    .map((layout) => `narrative ${layout}`)
    .join(" / ");
  const needOnTextFirst = [];
  const evidenceOnTextFirst = [];
  for (const scene of scenes) {
    if (!isTextFirstLayoutScene(scene)) continue;
    // Whitespace is not intent: a blank string sources nothing, so it cannot
    // be the contradiction this check is about.
    if (typeof scene.assetNeed === "string" && scene.assetNeed.trim() !== "") {
      needOnTextFirst.push(String(scene.id));
    }
    if (scene.media && scene.media.evidence === true) evidenceOnTextFirst.push(String(scene.id));
  }

  const results = [];
  if (needOnTextFirst.length > 0) {
    results.push({
      level: "fail",
      category: CATEGORY,
      check: CHECK,
      detail: `Scene(s) ${needOnTextFirst.join(", ")} declare assetNeed on a text-first layout (stacked-cards / contrast) — that layout only shows media as a dimmed background behind the text, so the requested picture cannot be read`,
      fix: `Choose one: move the beat to a media-window layout (${MEDIA_WINDOW_LAYOUTS}, or \`media.mode: "fullscreen"\`); OR drop assetNeed and ship it as ambient (bind a background image or leave it CSS-only); OR drop assetNeed AND set media: null for a deliberate text-only scene — assetNeed alone keeps the contradiction, so media: null does not waive this check`,
    });
  }
  if (evidenceOnTextFirst.length > 0) {
    results.push({
      level: "fail",
      category: CATEGORY,
      check: CHECK,
      detail: `Scene(s) ${evidenceOnTextFirst.join(", ")} bind evidence media on a text-first layout (stacked-cards / contrast) — the text block covers the evidence, so it is neither readable nor verifiable`,
      fix: `Move the evidence beat to a layout with its own media window (${MEDIA_WINDOW_LAYOUTS}, or \`media.mode: "fullscreen"\`) — or, if the asset is decoration and not page evidence, drop \`evidence: true\` and treat it as ambient. Evidence must not become a background texture`,
    });
  }
  return results;
}

/**
 * #1075: `fit: "contain"` needs somewhere to put its letterbox.
 *
 * A contained 16:9 picture keeps its whole frame but must be placed — and the
 * only placements that work are the ones with room for it: the contain band
 * (`hook`, `narrative/media-bottom-bar`, where the picture sits on the text
 * bar) and `media.mode: "fullscreen"` (whole frame, no text block over it).
 * Every other layout draws MediaBackground inside a full-frame container
 * behind the text, so `contain` letterboxes the picture into a framed box that
 * the text block sits on top of — the "框中套框" the 2026-11-05 decision ruled
 * out. (Before #1075 it was worse: the picture was bottom-anchored at
 * y 1312–1920 and simply disappeared behind the burned subtitles. Since the
 * render default became "center" the failure is quieter — still unreadable, no
 * longer buried.)
 *
 * The allocator no longer writes such a verdict (#1075 downgrades it to cover
 * and warns), so what this check catches is a hand-authored scene-data: the
 * writer asked for "完整展示" on a layout that cannot show it. Fails rather
 * than warns on purpose — cover still ships a picture, an unreadable one is
 * the defect being reported.
 *
 * `allowsContainFit` is the same predicate the allocator uses, so the writer
 * and the gate cannot drift apart.
 */
export function checkContainFitBand(scenes) {
  const CHECK = "contain fit has a band";
  const CATEGORY = "Media";
  const offenders = [];
  for (const scene of scenes || []) {
    if (scene?.media?.fit !== "contain") continue;
    if (allowsContainFit(scene)) continue;
    offenders.push(String(scene.id));
  }
  if (offenders.length === 0) return [];
  return [
    {
      level: "fail",
      category: CATEGORY,
      check: CHECK,
      detail: `Scene(s) ${offenders.join(", ")} declare media.fit = "contain" on a layout with no contain band — the picture is letterboxed inside the full-frame container as a framed box under the text block, which is neither readable as evidence nor usable as an ambient background`,
      fix: 'Use fit: "cover" (the frame default) if the beat is ambient, OR move the beat to a layout that owns a contain band (narrative with layout: "media-bottom-bar", or a hook), OR set media.mode: "fullscreen" so the picture owns the frame — fullscreen has no text block, so a centred contain is legal there',
    },
  ];
}

export function checkMediaStrategyContract(scenes) {
  const CHECK = "B-roll strategy contract";
  const CATEGORY = "Media";
  const invalid = [];
  const missingPrompt = [];
  const optedOut = [];
  let engaged = false;

  for (const scene of scenes) {
    // #355: omitting mediaStrategy is the default chain, not a missing
    // declaration — it is valid and needs no prompt (the chain derives one).
    if (!scene.mediaStrategy && !scene.aiVideo && !scene.aiImage) continue;
    engaged = true;
    const strategy = scene.mediaStrategy;
    if (strategy && !MEDIA_STRATEGIES.includes(strategy)) {
      invalid.push(`${scene.id}="${strategy}"`);
      continue;
    }
    if (!GENERATING_STRATEGIES.has(strategy)) continue;
    if (scene.mediaOptOut === true) {
      optedOut.push(scene.id);
      continue;
    }
    if (generatingPrompt(scene) === null) {
      missingPrompt.push([
        `${scene.id} (${strategy})`,
        { image: IMAGE_GENERATING_STRATEGIES.has(strategy) },
      ]);
    }
  }

  const results = [];
  if (invalid.length > 0) {
    results.push({
      level: "fail",
      category: CATEGORY,
      check: CHECK,
      detail: `mediaStrategy on scene(s) ${invalid.join(", ")} is not a known strategy`,
      fix: `Use one of: ${MEDIA_STRATEGIES.join(" | ")} — or omit the field for the default chain (source stock, then budgeted generation); use "source-only" to keep sourcing without generation`,
    });
  }
  // #155: image strategies fail on a missing aiImage.prompt with the same
  // semantics the video strategies have for aiVideo.prompt — the detail names
  // the field so the agent knows which prompt to write.
  const missingImagePrompt = missingPrompt.filter(([, entry]) => entry.image);
  const missingVideoPrompt = missingPrompt.filter(([, entry]) => !entry.image);
  if (missingImagePrompt.length > 0) {
    results.push({
      level: "fail",
      category: CATEGORY,
      check: CHECK,
      detail: `Scene(s) ${missingImagePrompt.map(([id]) => id).join(", ")} request AI image generation but have no aiImage.prompt`,
      fix: "Add aiImage.prompt using the 6-dimension template (SUBJECT / VISUAL METAPHOR / BRAND / REFERENCE / LIGHTING / NEGATIVE — the video template minus CAMERA/MOTION) — see docs/video-production-runbook.md → AI Image (T2I)",
    });
  }
  if (missingVideoPrompt.length > 0) {
    results.push({
      level: "fail",
      category: CATEGORY,
      check: CHECK,
      detail: `Scene(s) ${missingVideoPrompt.map(([id]) => id).join(", ")} request b-roll but have no aiVideo.prompt`,
      fix: "Add aiVideo.prompt using the 8-dimension template (SUBJECT / VISUAL METAPHOR / BRAND / REFERENCE / CAMERA / MOTION / LIGHTING / NEGATIVE) — see docs/video-production-runbook.md",
    });
  }
  if (optedOut.length > 0) {
    results.push({
      level: "warn",
      category: CATEGORY,
      check: CHECK,
      detail: `Scene(s) ${optedOut.join(", ")} set mediaOptOut on a generating strategy (b-roll / ai-image) — generation will be skipped`,
      fix: "mediaOptOut is deprecated (#191) — drop it to let the scene generate B-roll / ai-image, or use media: null for a deliberate no-media scene",
    });
  }
  if (results.length > 0) return results;

  return engaged
    ? [{ level: "pass", category: CATEGORY, check: CHECK, detail: "B-roll strategies valid" }]
    : [];
}

/**
 * NEGATIVE clauses the 8-dimension template treats as fixed defaults, grouped
 * by what each one guards against. Since #166 layer 2 these groups are
 * code-owned: lib/b-roll/prompt-injection.mjs injects a missing group's clause
 * at generation time, so declared prompts no longer need to carry them.
 *
 * FACE is deliberately absent: no existing prompt declares it, so requiring it
 * would warn on every scene and train the reader to ignore the warning. Add it
 * here once a real face artifact shows up in a generated clip.
 *
 * Key order is the reporting order, so a new group is a one-line change.
 */
export const NEGATIVE_GROUPS = {
  TEXT: [
    "no text",
    "no letters",
    "no words",
    "no captions",
    "no labels",
    "no writing",
    "no typography",
    "no lettering",
    "no signage",
  ],
  HANDS: ["no hands", "no hand", "no fingers", "no people", "no person"],
  ARTIFACT: ["no watermark", "no logo", "no signature", "no overlay"],
};

// Arabic numerals only — spelled-out counts ("Two parallel lanes") are a
// legitimate way to describe the number of things on screen.
const NUMERAL_PATTERN = /\d+(?:\.\d+)?/g;

// #289: the shot-direction signals a *declared* b-roll prompt is expected to
// state — a framing and/or a camera move. CAMERA / MOTION are never injected
// by code (#166 layer 2 — prompt-injection.mjs only *suggests* them via
// VISUAL_TYPE_DIMENSION_DEFAULTS), so their presence is the agent's job. A
// declared prompt that states neither is the subject-only "thin write" this
// gate warns on.
//
// Heuristic, not semantic. LIGHTING is deliberately excluded: the cited thin
// example ("futuristic AI data center with glowing server racks, cinematic
// vertical") carries a lighting word yet no shot direction, and on the real
// anthropic-distillation-7labs data a LIGHTING signal would let 4 of 7 thin
// prompts escape (measured 2026-10-18). VISUAL METAPHOR is left to the writing
// protocol — keywords cannot judge it.
export const BROLL_SHOT_SIGNALS = {
  CAMERA:
    /\b(close[- ]?up|wide shot|wide|medium shot|long shot|full shot|aerial|overhead|top[- ]?down|low angle|high angle|eye[- ]?level|macro|portrait|bust shot|framing|framed|vantage point)\b/i,
  MOTION:
    /\b(dolly|panning|pans|tracking|track|push[- ]?in|pull[- ]?out|zoom|crane|tilt|handheld|static|steady|sweep(?:ing)?|drift(?:ing)?|orbit(?:ing)?|fly[- ]?through|moving)\b/i,
};

// Word boundaries matter: a plain substring match would credit "no texture"
// with text protection.
export function coversNegativeGroup(prompt, phrases) {
  return phrases.some((phrase) => new RegExp(`\\b${phrase}\\b`, "i").test(prompt));
}

// The DECLARED prompt that will reach the generator, or null when the scene
// has no generating strategy / no declared prompt. Shared with the
// strategy-contract and prompt-dimension checks so both agree on which scenes
// they are judging. #355: a chain scene's derived prompt (assetNeed /
// voiceover) is deliberately absent — it is fallback text, not an authored
// 6/8-dimension write, and must not be warned on for being "thin". A chain
// scene's own DECLARED aiVideo/aiImage prompt is still a real generation input
// and stays in the sweep.
function generatingPrompt(scene) {
  if (!GENERATING_STRATEGIES.has(scene.mediaStrategy)) return null;
  const prompt = IMAGE_GENERATING_STRATEGIES.has(scene.mediaStrategy)
    ? scene.aiImage?.prompt
    : scene.aiVideo?.prompt;
  if (typeof prompt !== "string" || prompt.trim() === "") return null;
  return prompt;
}

/**
 * Every DECLARED prompt a scene may generate from, with its field name.
 * Explicit strategies yield exactly one; a #355 chain scene yields whichever
 * of aiVideo.prompt / aiImage.prompt the writer declared. Both are judged:
 * the chain can downgrade to the image form after the video budget is spent,
 * so checking only the currently-preferred prompt would let the prompt that
 * actually runs escape the sweep. Derived claim text is not an authored
 * 6/8-dimension write and is deliberately absent.
 */
function generatingPrompts(scene) {
  if (GENERATING_STRATEGIES.has(scene.mediaStrategy)) {
    const prompt = generatingPrompt(scene);
    if (prompt === null) return [];
    return [
      {
        prompt,
        field: IMAGE_GENERATING_STRATEGIES.has(scene.mediaStrategy)
          ? "aiImage.prompt"
          : "aiVideo.prompt",
      },
    ];
  }
  if (!resolveMediaPlan(scene).auto) return [];
  const prompts = [];
  if (typeof scene.aiVideo?.prompt === "string" && scene.aiVideo.prompt.trim() !== "") {
    prompts.push({ prompt: scene.aiVideo.prompt, field: "aiVideo.prompt" });
  }
  if (typeof scene.aiImage?.prompt === "string" && scene.aiImage.prompt.trim() !== "") {
    prompts.push({ prompt: scene.aiImage.prompt, field: "aiImage.prompt" });
  }
  return prompts;
}

/**
 * The machine-judgeable part of an opted-in b-roll prompt (#289 quality gate,
 * extending the #166 numeral sweep). Three warn-only criteria:
 *  a) stray Arabic numerals — move data values into texts;
 *  b) thin write — no framing and no camera move stated (subject-only);
 *  c) cross-scene verbatim reuse — the same normalized prompt on 2+ scenes.
 *
 * NEGATIVE group coverage is NOT checked here: since #166 layer 2 the constants
 * are injected at generation time (lib/b-roll/prompt-injection.mjs), so a
 * declared prompt without them is correct, not incomplete.
 *
 * Warn-only by design: preflight must keep exiting 0 (S21). Silent for scenes
 * that never generate (no generating strategy, or a blank prompt the contract
 * check already fails) and for clean prompts.
 */
export function checkBrollPromptDimensions(scenes) {
  const CHECK = "B-roll prompt dimensions";
  const CATEGORY = "Media";
  const results = [];
  const warn = (detail, fix) =>
    results.push({ level: "warn", category: CATEGORY, check: CHECK, detail, fix });

  // Normalized prompt → scene ids, for the cross-scene reuse sweep.
  const byPrompt = new Map();

  for (const scene of scenes) {
    const prompts = generatingPrompts(scene);
    if (prompts.length === 0) continue;
    const auto = resolveMediaPlan(scene).auto;
    for (const { prompt, field } of prompts) {
      // Explicit strategies keep their historical message shape; chain
      // scenes name the field so a two-prompt scene stays attributable.
      const subject = auto ? field : "prompt";

      // (a) numeral sweep.
      const numerals = [...new Set(prompt.match(NUMERAL_PATTERN) ?? [])];
      if (numerals.length > 0) {
        warn(
          `Scene ${scene.id} ${subject} contains Arabic numerals (${numerals.join(", ")})`,
          "Move data values into texts — T2V/T2I garbles glyphs; " +
            "an element count (e.g. '3 layers') is fine as-is",
        );
      }

      // (b) thin-write sweep — heuristic keyword probe, not a semantic read.
      const hasShotDirection = Object.values(BROLL_SHOT_SIGNALS).some((re) => re.test(prompt));
      if (!hasShotDirection) {
        warn(
          `Scene ${scene.id} ${subject} names no camera framing or camera move (subject-only thin write; heuristic)`,
          "State a framing and a camera move (e.g. 'medium shot, slow push-in'). " +
            "Protocol: docs/video-script-writing-guide.md → Declared b-roll prompt 写作协议",
        );
      }

      // (c) reuse bookkeeping.
      const key = prompt.trim().toLowerCase().replace(/\s+/g, " ");
      if (!byPrompt.has(key)) byPrompt.set(key, []);
      byPrompt.get(key).push(scene.id);
    }
  }

  // (c) emit reuse warnings once the whole pack is seen.
  for (const ids of byPrompt.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      warn(
        `Scene ${id} declared prompt is verbatim-reused across ${ids.length} scenes (ids: ${ids.join(", ")})`,
        "Rewrite each scene's prompt around its own subject — verbatim reuse defeats the scene→prompt adapter",
      );
    }
  }

  return results;
}

// ─── Avatar declaration contract (#214 ticket 01) ───

/**
 * Optional `scene.avatar` foreground layer (digital human). Declaration state
 * is `{}` — the generation step writes back `videoPath` after the package's
 * plan is approved. Fail-closed: an unknown key or malformed interval must be
 * caught HERE, before TTS spends money — not at render time.
 *
 * Schema (S2 spec, grill 定案 1/7):
 *   avatar: {
 *     videoPath?: string            — written back by the generation step
 *     position?: "right-card"       — default; the only rendered variant (1′)
 *     scale?: number > 0            — optional card scale override
 *     present?: [{ from, to }]      — on-screen seconds; omitted = full scene
 *   }
 */
const AVATAR_POSITIONS = ["right-card"];
const AVATAR_KEYS = ["videoPath", "position", "scale", "present"];
/** Advisory usage-strategy rows; the aggregate sends these to the editorial bucket. */
const AVATAR_USAGE_CHECK = "Avatar usage strategy";
// Present-interval overflow can only be estimated here (scene-rules runs
// pre-TTS): the platform budget rate is the established voiceover pace
// (checkVoiceoverWordCount). The generation step enforces the exact TTS
// duration; this check only catches obviously wrong declarations.
const AVATAR_WPS = THRESHOLDS.voiceoverEstimateWps;
const AVATAR_DURATION_TOLERANCE = 2;

function avatarIntervalProblems(scene, present) {
  const problems = [];
  if (!Array.isArray(present) || present.length === 0) {
    return [`present must be a non-empty array of {from, to} intervals`];
  }
  const valid = [];
  for (const iv of present) {
    if (
      iv === null ||
      typeof iv !== "object" ||
      Array.isArray(iv) ||
      typeof iv.from !== "number" ||
      typeof iv.to !== "number" ||
      !Number.isFinite(iv.from) ||
      !Number.isFinite(iv.to)
    ) {
      problems.push(`present interval ${JSON.stringify(iv)} must be {from: number, to: number}`);
      continue;
    }
    if (iv.from < 0) {
      problems.push(`present interval from=${iv.from} is negative`);
      continue;
    }
    if (iv.from >= iv.to) {
      problems.push(`present interval from=${iv.from} >= to=${iv.to}`);
      continue;
    }
    valid.push(iv);
  }
  // Overlap is order-independent: sort by `from` before comparing adjacent pairs
  const sorted = [...valid].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from < sorted[i - 1].to) {
      problems.push(
        `present intervals overlap: [{from: ${sorted[i - 1].from}, to: ${sorted[i - 1].to}}, {from: ${sorted[i].from}, to: ${sorted[i].to}}]`,
      );
      break;
    }
  }
  if (sorted.length > 0) {
    const estSec = (scene.voiceover || "").split(/\s+/).filter(Boolean).length / AVATAR_WPS;
    const maxTo = Math.max(...sorted.map((iv) => iv.to));
    if (maxTo > estSec * AVATAR_DURATION_TOLERANCE) {
      problems.push(
        `present ends at ${maxTo}s but scene voiceover is ~${estSec.toFixed(1)}s (${AVATAR_WPS} wps estimate; exact check happens post-TTS in the generation step)`,
      );
    }
  }
  return problems;
}

/**
 * Avatar declaration contract check. Skips silently when no scene declares
 * avatar (legacy scene-data compat — zero impact on existing packages).
 */
export function checkAvatarContract(scenes) {
  const avatarScenes = scenes.filter((s) => s.avatar !== undefined);
  if (avatarScenes.length === 0) return [];

  const CHECK = "Avatar declaration contract";
  const CATEGORY = "Structure";
  const results = [];
  for (const scene of avatarScenes) {
    const avatar = scene.avatar;
    if (avatar === null || typeof avatar !== "object" || Array.isArray(avatar)) {
      results.push({
        level: "fail",
        category: CATEGORY,
        check: CHECK,
        detail: `Scene ${scene.id}: avatar must be an object, got ${avatar === null ? "null" : Array.isArray(avatar) ? "array" : typeof avatar}`,
        fix: "Write avatar: {} to declare (generation step fills videoPath), or remove the field",
      });
      continue;
    }

    const unknown = Object.keys(avatar).filter((k) => !AVATAR_KEYS.includes(k));
    if (unknown.length > 0) {
      results.push({
        level: "fail",
        category: CATEGORY,
        check: CHECK,
        detail: `Scene ${scene.id}: unknown avatar field(s): ${unknown.join(", ")} — allowed: ${AVATAR_KEYS.join(", ")}`,
        fix: "Fix the field name spelled above (fail-closed: an unknown key would otherwise be silently ignored)",
      });
      continue;
    }

    let sceneFailed = false;

    if (avatar.position !== undefined && !AVATAR_POSITIONS.includes(avatar.position)) {
      results.push({
        level: "fail",
        category: CATEGORY,
        check: CHECK,
        detail: `Scene ${scene.id}: position="${avatar.position}" is not rendered — allowed: ${AVATAR_POSITIONS.join(", ")}`,
        fix: `Remove position (defaults to "${AVATAR_POSITIONS[0]}") or set it to "${AVATAR_POSITIONS[0]}"`,
      });
      sceneFailed = true;
    }

    if (
      avatar.scale !== undefined &&
      (typeof avatar.scale !== "number" || !Number.isFinite(avatar.scale) || avatar.scale <= 0)
    ) {
      results.push({
        level: "fail",
        category: CATEGORY,
        check: CHECK,
        detail: `Scene ${scene.id}: scale must be a positive number, got ${JSON.stringify(avatar.scale)}`,
        fix: "Remove scale to use the card default, or set a positive multiplier",
      });
      sceneFailed = true;
    }

    if (
      avatar.videoPath !== undefined &&
      (typeof avatar.videoPath !== "string" || avatar.videoPath.trim() === "")
    ) {
      results.push({
        level: "fail",
        category: CATEGORY,
        check: CHECK,
        detail: `Scene ${scene.id}: videoPath must be a non-empty string, got ${JSON.stringify(avatar.videoPath)}`,
        fix: "Remove videoPath (the generation step writes it back) or set the generated file path",
      });
      sceneFailed = true;
    }

    if (avatar.present !== undefined) {
      for (const problem of avatarIntervalProblems(scene, avatar.present)) {
        results.push({
          level: "fail",
          category: CATEGORY,
          check: CHECK,
          detail: `Scene ${scene.id}: ${problem}`,
          fix: "Fix the present interval(s) — seconds within this scene's voiceover duration",
        });
        sceneFailed = true;
      }
    }

    if (!sceneFailed) {
      if (avatar.videoPath === undefined) {
        results.push({
          level: "pass",
          category: CATEGORY,
          check: CHECK,
          detail: `Scene ${scene.id}: declared, pending generation`,
        });
        results.push({
          level: "warn",
          category: CATEGORY,
          check: "Avatar pending generation",
          detail: `Scene ${scene.id}: avatar declared but no videoPath yet`,
          fix: "Run the digital-human generation CLI (plan → approve → run) for this package before rendering",
        });
      } else {
        results.push({
          level: "pass",
          category: CATEGORY,
          check: CHECK,
          detail: `Scene ${scene.id}: videoPath="${avatar.videoPath}" (file existence checked at render time)`,
        });
      }
    }
  }

  // Usage-strategy warnings (docs/research/dh-presenter-usage-strategy-research.md,
  // executed as the guide's whitelist/blacklist subset that is mechanically
  // checkable). Warn-only — the semantic judgment stays with the script agent
  // and the plan dry-run HITL, never a fail. The aggregate routes these to the
  // editorial bucket (#763): a judgment call, not a render contract.
  if (scenes[0]?.avatar !== undefined && scenes[0]?.visualType === "hook") {
    results.push({
      level: "warn",
      category: CATEGORY,
      check: AVATAR_USAGE_CHECK,
      detail: `Scene ${scenes[0].id} (hook) declares an avatar — hook is on the declaration blacklist: a face in the first seconds adds little retention (30s retention turns negative; a human-voice hook is an order of magnitude stronger)`,
      fix: "Remove this avatar declaration, or scope present to exclude the first ~3s of the hook",
    });
  }
  if (avatarScenes.length > 4) {
    results.push({
      level: "warn",
      category: CATEGORY,
      check: AVATAR_USAGE_CHECK,
      detail: `${avatarScenes.length} scenes declare avatars — the evidence-based band for a 30-60s package is 2-4 on-screen segments (AI presenter is an accent, not the channel's backbone; news-explainer has the LOWEST AI-presenter acceptance)`,
      fix: "Trim to CTA / key-payoff / data-moment scenes per the script guide's avatar strategy section",
    });
  }
  for (const scene of avatarScenes) {
    for (const iv of scene.avatar?.present ?? []) {
      if (iv.to - iv.from > 8) {
        results.push({
          level: "warn",
          category: CATEGORY,
          check: AVATAR_USAGE_CHECK,
          detail: `Scene ${scene.id}: present interval ${iv.from}-${iv.to}s holds the avatar on screen for ${(iv.to - iv.from).toFixed(0)}s continuously — evidence supports cutting away within a few seconds (pattern-interrupt cadence)`,
          fix: "Split the interval or let the background run full-bleed mid-segment",
        });
      }
    }
  }
  return results;
}

export function runAllSceneDataChecks(scenes, seriesMeta, opts = {}) {
  const meta = opts.meta || null;
  const avatarResults = checkAvatarContract(scenes);
  // One claim map for both checks, so "has a usable claim" and "would hints be
  // read" can never disagree about the same scene (#354 review).
  const claimPhrases = sceneClaimPhrases(scenes);
  const gateChecks = [
    ...checkSceneCount(scenes, opts),
    ...checkHookVisualType(scenes),
    ...checkHookContract(scenes),
    ...checkCTAVisualType(scenes),
    ...checkCTAActionContract(scenes),
    ...checkNoEmDashes(scenes),
    ...checkHookDiffersFromText(scenes),
    ...checkSEOKeywords(scenes),
    ...checkSourceAttribution(scenes),
    ...checkVoiceoverWordCount(scenes, opts),
    ...checkOneBreath(scenes),
    ...checkSeriesMeta(seriesMeta),
    ...checkClickbait(scenes),
    ...checkUnverifiedClaims(scenes),
    ...checkNoWatermarks(scenes),
    ...checkSemanticConsistency(scenes),
    ...checkHookMediaContract(scenes),
    ...checkNarrativeMediaWarning(scenes, claimPhrases),
    ...checkTextConcatenation(scenes),
    ...checkLayoutField(scenes),
    ...checkTemplateContract(scenes),
    ...checkVisualTypeWhitelist(scenes, opts),
    ...checkInstructCoverage(scenes, opts),
    ...checkAssetNeedAnnotation(scenes),
    ...checkMediaFieldSchema(scenes),
    ...checkSearchHintsSchema(scenes, claimPhrases),
    ...checkMediaStrategyContract(scenes),
    ...checkMediaOptOutDeprecation(scenes),
    ...checkLayoutMediaRouting(scenes),
    ...checkContainFitBand(scenes),
    ...checkEmptyField(scenes, opts),
    ...checkFocusLight(scenes),
    ...checkBrollPromptDimensions(scenes),
    ...avatarResults.filter((r) => r.check !== AVATAR_USAGE_CHECK),
  ];

  // Editorial judgment (#763): assertions that need taste, context or world
  // knowledge the run cannot supply. They are reported as advice and never
  // reach pass/warn/fail, so they can't block a render or inflate the gate.
  const EDITORIAL_RUNNERS = [
    () => checkHookCompellingElement(scenes),
    () => checkHookSentenceFamily(scenes),
    () => checkHookDuration(scenes, opts),
    () => checkShareWorthyData(scenes),
    () => checkSubjectVisibility(scenes, meta),
    () => checkTeleprompterRhythm(scenes),
    () => checkCTAStacking(scenes),
    () => checkPrimaryGoal(scenes),
    () => checkLoopClose(scenes, meta),
    () => checkBodyTextVoRedundancy(scenes),
    () => checkOpenLoop(scenes),
    () => checkPatternInterrupt(scenes),
    () => checkLoopClosureNarrative(scenes),
    () => checkTextWidthBudget(scenes),
    () => checkNoAIVocabulary(scenes),
    () => checkNoWrittenOpener(scenes),
    () => checkNoDeadClosers(scenes),
    () => checkNoGreeting(scenes),
    () => checkCurrencyDualAnnotation(scenes),
    () => avatarResults.filter((r) => r.check === AVATAR_USAGE_CHECK),
  ];
  const editorial = EDITORIAL_RUNNERS.flatMap((run) =>
    run().map(({ level, ...rest }) => ({ ...rest, level: "advisory", severity: level })),
  );

  return {
    pass: gateChecks.filter((r) => r.level === "pass"),
    warn: gateChecks.filter((r) => r.level === "warn"),
    fail: gateChecks.filter((r) => r.level === "fail"),
    editorial,
  };
}
