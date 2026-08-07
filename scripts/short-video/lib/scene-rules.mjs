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
 * see ctaScene() in lib/scene-templates.mjs): texts.action is the amber stamp
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
      fix: 'Add `action: "FOLLOW FOR MORE"` (or the series variant, e.g. "FOLLOW FOR PART 2") to the last scene\'s texts — see ctaScene() contract in lib/scene-templates.mjs',
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

/** Hook on-screen text should contain a company name for subject visibility */
export function checkSubjectVisibility(scenes) {
  const hookTexts = sceneTexts(scenes[0] || {});
  const hasCompany = KNOWN_COMPANIES.some((c) => hookTexts.includes(c));
  if (hasCompany) {
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

/** Video should target one primary goal (<=2 goal signals) */
export function checkPrimaryGoal(scenes) {
  const goalIndicators = {
    completion: /watch|see|look|here is|this is/i,
    saves: /save|remember|note|keep|reference/i,
    comments: /comment|tell|ask|question|what do/i,
    shares: /share|send|forward|tag/i,
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

/** Loop-close: last scene should reference the hook for natural rewatch */
export function checkLoopClose(scenes) {
  const firstVO = (scenes[0]?.voiceover || "").toLowerCase();
  const lastVO = (scenes[scenes.length - 1]?.voiceover || "").toLowerCase();
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

// ─── Aggregate runner ───

/**
 * Run all scene-data checks and return categorized results.
 * @param {Array} scenes - scene-data.mjs scenes array
 * @param {Object|null} seriesMeta - optional series metadata
 * @returns {{ pass: Array, warn: Array, fail: Array }}
 */
export function runAllSceneDataChecks(scenes, seriesMeta, opts = {}) {
  const allChecks = [
    ...checkSceneCount(scenes, opts),
    ...checkHookVisualType(scenes),
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
    ...checkSubjectVisibility(scenes),
    ...checkSeriesMeta(seriesMeta),
    ...checkClickbait(scenes),
    ...checkUnverifiedClaims(scenes),
    ...checkNoWatermarks(scenes),
    ...checkTeleprompterRhythm(scenes),
    ...checkCTAStacking(scenes),
    ...checkPrimaryGoal(scenes),
    ...checkSemanticConsistency(scenes),
    ...checkLoopClose(scenes),
    ...checkBodyTextVoRedundancy(scenes),
  ];

  return {
    pass: allChecks.filter((r) => r.level === "pass"),
    warn: allChecks.filter((r) => r.level === "warn"),
    fail: allChecks.filter((r) => r.level === "fail"),
  };
}
