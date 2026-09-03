/**
 * Scene Data Validation Rules — pure functions for testable scene-data checks.
 *
 * Used by verify-video.mjs in both --pre (pre-render) and post-render modes.
 * Each function takes `scenes` (and optionally `seriesMeta`) and returns an
 * array of result objects: { level, category, check, detail?, fix? }
 *
 * level: 'pass' | 'warn' | 'fail'
 *
 * All rule constants are imported from tiktok-rules.mjs (single source of truth).
 */

import {
  AI_BLACKLIST as _AI_BLACKLIST,
  DASH_PATTERN,
  DEAD_CLOSER_PATTERN,
  STRONG_WORD_PATTERN,
  NUMBER_PATTERN,
  WRITTEN_OPENER_PATTERN,
  SOURCE_PATTERN,
  CTA_PATTERN,
  CLICKBAIT_PATTERNS,
  WATERMARK_PATTERN,
  GREETING_PATTERN,
  NAMED_SOURCE_PATTERN,
  TARGET_KEYWORDS,
  KNOWN_COMPANIES,
  THRESHOLDS,
} from "./tiktok-rules.mjs";
import {
  REMOTION_SLOT_MAP,
  DEFAULT_NARRATIVE_LAYOUT,
  slotId,
  slotCharBudget,
} from "./text-slots.mjs";

// Re-export AI_BLACKLIST to maintain public API
export const AI_BLACKLIST = _AI_BLACKLIST;

// ─── Helpers ───

function sceneTexts(scene) {
  return JSON.stringify(scene.texts || "").toLowerCase();
}

function sceneVO(scene) {
  return (scene.voiceover || "").toLowerCase();
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

/** Hook must contain a number or strong word */
export function checkHookCompellingElement(scenes) {
  const hookVO = scenes[0]?.voiceover || "";
  const hasNumber = NUMBER_PATTERN.test(hookVO);
  const hasStrongWord = STRONG_WORD_PATTERN.test(hookVO);
  if (hasNumber || hasStrongWord) {
    return [
      {
        level: "pass",
        category: "Hook",
        check: "Hook has compelling element (number/strong word)",
        detail: hasNumber ? "has number" : "has strong word",
      },
    ];
  }
  return [
    {
      level: "fail",
      category: "Hook",
      check: "Hook has compelling element",
      detail: "no number or strong word in hook VO",
      fix: "Add a number or strong word to Scene 1 voiceover",
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

/** Total voiceover should be <=180 words for 60-70s target */
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
        detail: `${totalWords} words (~${(totalWords / 2.5).toFixed(0)}s)`,
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
 * Uses a curated antonym/contradiction pair table. When term A appears in
 * the VO and term B (its opposite) appears in the on-screen text, the check
 * flags it as a potential factual contradiction.
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
  // textTerm: if found in on-screen text (case-insensitive substring)
  const CONTRADICTION_PAIRS = [
    ["restricted", "can buy", "VO says 'restricted' but text says 'can buy'"],
    ["restricted", "available", "VO says 'restricted' but text says 'available'"],
    ["restricted", "legal", "VO says 'restricted' but text says 'legal'"],
    ["export-restricted", "can buy", "VO says 'export-restricted' but text says 'can buy'"],
    ["export-restricted", "available", "VO says 'export-restricted' but text says 'available'"],
    ["export-restricted", "legal", "VO says 'export-restricted' but text says 'legal'"],
    ["illegal", "can buy", "VO says 'illegal' but text says 'can buy'"],
    ["illegal", "legal", "VO says 'illegal' but text says 'legal'"],
    ["not allowed", "can buy", "VO says 'not allowed' but text says 'can buy'"],
    ["not allowed", "available", "VO says 'not allowed' but text says 'available'"],
    ["banned", "can buy", "VO says 'banned' but text says 'can buy'"],
    ["banned", "available", "VO says 'banned' but text says 'available'"],
    ["banned", "legal", "VO says 'banned' but text says 'legal'"],
    ["legal", "banned", "VO says 'legal' but text says 'banned'"],
    ["legal", "illegal", "VO says 'legal' but text says 'illegal'"],
    ["clean", "accused", "VO says 'clean' but text says 'accused'"],
    ["clean", "guilty", "VO says 'clean' but text says 'guilty'"],
    ["not on that list", "accused", "VO says 'not on that list' but text says 'accused'"],
    ["rejected", "accepted", "VO says 'rejected' but text says 'accepted'"],
    ["rejected", "approved", "VO says 'rejected' but text says 'approved'"],
    ["raises", "lowers", "VO says 'raises' but text says 'lowers'"],
    ["raises", "cuts", "VO says 'raises' but text says 'cuts'"],
    ["increases", "decreases", "VO says 'increases' but text says 'decreases'"],
    ["up", "down", "VO says 'up' but text says 'down'"],
    ["open source", "closed source", "VO says 'open source' but text says 'closed source'"],
    ["closed source", "open source", "VO says 'closed source' but text says 'open source'"],
  ];

  const results = [];

  for (const scene of scenes) {
    const vo = sceneVO(scene);
    const texts = sceneTexts(scene);
    const isComparison = /\bvs\b/i.test(texts);

    for (const [voTerm, textTerm, description] of CONTRADICTION_PAIRS) {
      if (vo.includes(voTerm) && texts.includes(textTerm)) {
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
 * Falls back to word matching when meta is not available (legacy behavior).
 *
 * @param {Array} scenes - scene-data array
 * @param {Object} [meta] - video meta with optional dataPoints array
 * @returns {Array} result objects
 */
export function checkLoopClose(scenes, meta) {
  const firstVO = (scenes[0]?.voiceover || "").toLowerCase();
  const lastVO = (scenes[scenes.length - 1]?.voiceover || "").toLowerCase();

  // New: check if CTA contains any core number from meta.dataPoints
  if (meta?.dataPoints && Array.isArray(meta.dataPoints)) {
    const coreNumbers = meta.dataPoints.map((dp) => String(dp.value ?? "")).filter(Boolean);
    if (coreNumbers.length > 0) {
      const hasCoreNumber = coreNumbers.some((num) => lastVO.includes(num.toLowerCase()));
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

/** Hook scene media warning (spec D5): warns when hook scene has no media
 *  background, reminding the creator that visual impact may be insufficient
 *  for the first 3 seconds. Passes when media is present or when there is no
 *  hook scene. */
export function checkHookMediaWarning(scenes) {
  const hook = scenes[0];
  if (hook?.visualType !== "hook") {
    return [
      {
        level: "pass",
        category: "Hook",
        check: "Hook media background",
        detail: "No hook scene",
      },
    ];
  }
  if (hook.media) {
    return [
      {
        level: "pass",
        category: "Hook",
        check: "Hook media background",
        detail: `${hook.media.type}: ${hook.media.path}`,
      },
    ];
  }
  return [
    {
      level: "warn",
      category: "Hook",
      check: "Hook media background",
      detail: "Hook scene has no media — visual impact may be insufficient for first 3 seconds",
      fix: "Add scene.media to hook scene, or run asset-sourcer to auto-assign a high-quality cover image",
    },
  ];
}

/** Narrative scene media warning: warns when any non-CTA scene (narrative,
 *  info-card, quote, hook) lacks a media background. This catches the scenario
 *  where scene-data.mjs was created without media fields, ensuring the pipeline
 *  doesn't silently produce all-CSS videos with no background imagery.
 *  CTA / data / stat-reveal scenes are exempt (they don't use media). */
const NO_MEDIA_TYPES = new Set(["cta", "data", "stat-reveal"]);
export function checkNarrativeMediaWarning(scenes) {
  const missing = scenes.filter((s) => !NO_MEDIA_TYPES.has(s.visualType) && !s.media?.path);
  if (missing.length === 0) {
    return [
      {
        level: "pass",
        category: "Media",
        check: "Narrative scene media coverage",
        detail: `All ${scenes.filter((s) => !NO_MEDIA_TYPES.has(s.visualType)).length} non-CTA scenes have media`,
      },
    ];
  }
  const missingIds = missing.map((s) => s.id).join(", ");
  return [
    {
      level: "warn",
      category: "Media",
      check: "Narrative scene media coverage",
      detail: `${missing.length} scene(s) missing media: [${missingIds}] — scenes will render with CSS-only background (no images/video)`,
      fix: "Run asset-sourcer to auto-search and assign media, or manually add scene.media fields to scene-data.mjs",
    },
  ];
}

/**
 * Currency dual-annotation check: warns when RMB amounts in voiceover/texts
 * do not have a USD equivalent nearby. This is a verify-time safety net —
 * normalizeSceneData() in main.mjs Step 0 should have already fixed them.
 * Detects ¥<number> or <number> (billion|million|thousand) yuan without
 * a $ within 30 chars before the match.
 */
export function checkCurrencyDualAnnotation(scenes) {
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
export function checkTextConcatenation(scenes) {
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

/** Check that non-cta scenes have a valid layout field. */
const VALID_LAYOUTS = [
  "hero-center",
  "media-bottom-bar",
  "media-split",
  "media-overlay",
  "stacked-cards",
  "cta",
];
export function checkLayoutField(scenes) {
  const results = [];
  for (const scene of scenes) {
    if (scene.visualType === "cta") continue; // CTA scenes don't need layout
    const layout = scene.layout;
    if (!layout) {
      results.push({
        level: "fail",
        category: "Structure",
        check: `Scene ${scene.id} layout field`,
        detail: "layout field missing",
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
      scene.visualType === "narrative"
        ? (scene.layout ?? DEFAULT_NARRATIVE_LAYOUT)
        : "hero-center";
    const declared =
      REMOTION_SLOT_MAP[scene.visualType]?.[layout] ?? null;
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

export const MEDIA_STRATEGIES = ["asset", "b-roll", "asset-then-broll"];
const GENERATING_STRATEGIES = new Set(["b-roll", "asset-then-broll"]);

/**
 * Contract for the B-roll fields (`mediaStrategy` / `aiVideo.prompt`).
 * Silent for content that uses neither field, so existing scene-data is
 * never judged by a rule it does not opt into.
 */
export function checkMediaStrategyContract(scenes) {
  const CHECK = "B-roll strategy contract";
  const CATEGORY = "Media";
  const invalid = [];
  const missingPrompt = [];
  const optedOut = [];
  let engaged = false;

  for (const scene of scenes) {
    if (!scene.mediaStrategy && !scene.aiVideo) continue;
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
      missingPrompt.push(`${scene.id} (${strategy})`);
    }
  }

  const results = [];
  if (invalid.length > 0) {
    results.push({
      level: "fail",
      category: CATEGORY,
      check: CHECK,
      detail: `mediaStrategy on scene(s) ${invalid.join(", ")} is not a known strategy`,
      fix: `Use one of: ${MEDIA_STRATEGIES.join(" | ")} (omitting the field means 'asset')`,
    });
  }
  if (missingPrompt.length > 0) {
    results.push({
      level: "fail",
      category: CATEGORY,
      check: CHECK,
      detail: `Scene(s) ${missingPrompt.join(", ")} request b-roll but have no aiVideo.prompt`,
      fix: "Add aiVideo.prompt using the 8-dimension template (SUBJECT / VISUAL METAPHOR / BRAND / REFERENCE / CAMERA / MOTION / LIGHTING / NEGATIVE) — see docs/video-workflow.md",
    });
  }
  if (optedOut.length > 0) {
    results.push({
      level: "warn",
      category: CATEGORY,
      check: CHECK,
      detail: `Scene(s) ${optedOut.join(", ")} set mediaOptOut with a b-roll strategy — generation will be skipped`,
      fix: "Drop mediaOptOut to let the scene generate B-roll, or keep it for a deliberate CSS-only scene",
    });
  }
  if (results.length > 0) return results;

  return engaged
    ? [{ level: "pass", category: CATEGORY, check: CHECK, detail: "B-roll strategies valid" }]
    : [];
}

/**
 * NEGATIVE clauses the 8-dimension template treats as fixed defaults, grouped
 * by what each one guards against. A prompt must cover every group.
 *
 * FACE is deliberately absent: no existing prompt declares it, so requiring it
 * would warn on every scene and train the reader to ignore the warning. Add it
 * here once a real face artifact shows up in a generated clip.
 *
 * Key order is the reporting order, so a new group is a one-line change.
 */
const NEGATIVE_GROUPS = {
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

// Word boundaries matter: a plain substring match would credit "no texture"
// with text protection.
function coversNegativeGroup(prompt, phrases) {
  return phrases.some((phrase) => new RegExp(`\\b${phrase}\\b`, "i").test(prompt));
}

// The prompt that will actually reach the generator, or null when the scene
// never generates. Shared with the strategy-contract check so both agree on
// which scenes they are talking about.
function generatingPrompt(scene) {
  if (!GENERATING_STRATEGIES.has(scene.mediaStrategy)) return null;
  const prompt = scene.aiVideo?.prompt;
  if (typeof prompt !== "string" || prompt.trim() === "") return null;
  return prompt;
}

/**
 * Check the two things about an opted-in b-roll prompt that a machine can
 * judge: NEGATIVE group coverage, and stray Arabic numerals. The other six
 * dimensions stay on the agent — a template cannot write them for you.
 *
 * Silent for scenes that never generate (no generating strategy, or a blank
 * prompt the contract check already fails) and for clean prompts: a warn-only
 * rule has nothing to say when nothing is wrong.
 */
export function checkBrollPromptDimensions(scenes) {
  const CHECK = "B-roll prompt dimensions";
  const CATEGORY = "Media";
  const results = [];

  for (const scene of scenes) {
    const prompt = generatingPrompt(scene);
    if (prompt === null) continue;

    const missing = Object.keys(NEGATIVE_GROUPS).filter(
      (group) => !coversNegativeGroup(prompt, NEGATIVE_GROUPS[group]),
    );

    const problems = [];
    const fixes = [];

    if (missing.length > 0) {
      const suggestions = missing
        .map((group) => {
          const words = NEGATIVE_GROUPS[group].slice(0, 2).map((w) => `"${w}"`);
          return `${group}: ${words.join(" / ")}`;
        })
        .join("; ");
      problems.push(`missing NEGATIVE coverage for: ${missing.join(", ")}`);
      fixes.push(`Add a NEGATIVE clause for each missing group — ${suggestions}`);
    }

    const numerals = [...new Set(prompt.match(NUMERAL_PATTERN) ?? [])];
    if (numerals.length > 0) {
      problems.push(`contains Arabic numerals (${numerals.join(", ")})`);
      fixes.push(
        "Move data values into texts — T2V garbles glyphs; " +
          "an element count (e.g. '3 layers') is fine as-is",
      );
    }

    if (problems.length === 0) continue;

    results.push({
      level: "warn",
      category: CATEGORY,
      check: CHECK,
      detail: `Scene ${scene.id} prompt ${problems.join("; ")}`,
      fix: fixes.join(" "),
    });
  }

  return results;
}

export function runAllSceneDataChecks(scenes, seriesMeta, opts = {}) {
  const meta = opts.meta || null;
  const allChecks = [
    ...checkSceneCount(scenes, opts),
    ...checkHookVisualType(scenes),
    ...checkHookContract(scenes),
    ...checkCTAVisualType(scenes),
    ...checkCTAActionContract(scenes),
    ...checkHookCompellingElement(scenes),
    ...checkNoEmDashes(scenes),
    ...checkNoAIVocabulary(scenes),
    ...checkNoWrittenOpener(scenes),
    ...checkHookDiffersFromText(scenes),
    ...checkNoDeadClosers(scenes),
    ...checkNoGreeting(scenes),
    ...checkSEOKeywords(scenes),
    ...checkSourceAttribution(scenes),
    ...checkShareWorthyData(scenes),
    ...checkVoiceoverWordCount(scenes, opts),
    ...checkOneBreath(scenes),
    ...checkSubjectVisibility(scenes, meta),
    ...checkSeriesMeta(seriesMeta),
    ...checkClickbait(scenes),
    ...checkUnverifiedClaims(scenes),
    ...checkNoWatermarks(scenes),
    ...checkTeleprompterRhythm(scenes),
    ...checkCTAStacking(scenes),
    ...checkPrimaryGoal(scenes),
    ...checkSemanticConsistency(scenes),
    ...checkLoopClose(scenes, meta),
    ...checkBodyTextVoRedundancy(scenes),
    ...checkHookMediaWarning(scenes),
    ...checkNarrativeMediaWarning(scenes),
    ...checkCurrencyDualAnnotation(scenes),
    ...checkTextConcatenation(scenes),
    ...checkLayoutField(scenes),
    ...checkOpenLoop(scenes),
    ...checkPatternInterrupt(scenes),
    ...checkLoopClosureNarrative(scenes),
    ...checkTextWidthBudget(scenes),
    ...checkVisualTypeWhitelist(scenes, opts),
    ...checkAssetNeedAnnotation(scenes),
    ...checkMediaStrategyContract(scenes),
    ...checkBrollPromptDimensions(scenes),
  ];

  return {
    pass: allChecks.filter((r) => r.level === "pass"),
    warn: allChecks.filter((r) => r.level === "warn"),
    fail: allChecks.filter((r) => r.level === "fail"),
  };
}
