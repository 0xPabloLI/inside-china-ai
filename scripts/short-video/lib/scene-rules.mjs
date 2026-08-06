/**
 * Scene Data Validation Rules — pure functions for testable scene-data checks.
 *
 * Used by verify-video.mjs in both --pre (pre-render) and post-render modes.
 * Each function takes `scenes` (and optionally `seriesMeta`) and returns an
 * array of result objects: { level, category, check, detail?, fix? }
 *
 * level: 'pass' | 'warn' | 'fail'
 */

// ─── Constants (merged from preflight-check.mjs + verify-video.mjs) ───

export const AI_BLACKLIST = [
  "leverage",
  "utilize",
  "facilitate",
  "streamline",
  "robust",
  "seamless",
  "delve",
  "navigate",
  "unlock",
  "harness",
  "foster",
  "cultivate",
  "fundamentally",
  "essentially",
  "ultimately",
  "crucially",
  "notably",
  "myriad",
  "paradigm",
  "ecosystem",
  "landscape",
  "game-changer",
  "deep dive",
  "at the end of the day",
  "dive in",
  "hey guys",
  "without further ado",
];

const DEAD_CLOSER_PATTERN =
  /thanks for watching|don't forget to (like|subscribe)|subscribe for more|what do you think|drop your thoughts|let me know in the comments|hit subscribe/i;

const STRONG_WORD_PATTERN =
  /\b(leaked|paused|crash|surge|breakthrough|exclusive|secret|revealed|banned|crisis|first|never|only)\b/i;

const NUMBER_PATTERN = /\$?\d+[.,]?\d*\s*(billion|million|thousand|%|B|M|K)?/i;

const WRITTEN_OPENER_PATTERN =
  /in this video,? i will|today i want to talk about|in this video,? we will|today we're going to/i;

const DASH_PATTERN = /\u2014|\u2013|--/;

const SOURCE_PATTERN =
  /\b(reported|said|told|according to|revealed|stated|announced|confirmed|bloomberg|reuters|ft|wall street journal|sources?)\b/i;

const CTA_PATTERN =
  /follow|subscribe|like|comment|share|save|download|click|sign up|check out|visit/gi;

const CLICKBAIT_PATTERNS = [
  /\byou won't believe\b/i,
  /\bshocking truth\b/i,
  /\bthis will blow your mind\b/i,
  /\bclick here\b/i,
];

const TARGET_KEYWORDS = ["china", "ai", "deepseek"];

const KNOWN_COMPANIES = [
  "deepseek",
  "huawei",
  "zhipu",
  "moonshot",
  "kimi",
  "minimax",
  "baidu",
  "alibaba",
  "tencent",
  "bytedance",
];

const WATERMARK_PATTERN = /@instagram|@youtube|@facebook|tiktok watermark|repost from/i;

// ─── Helpers ───

function sceneTexts(scene) {
  return JSON.stringify(scene.texts || "").toLowerCase();
}

function sceneVO(scene) {
  return (scene.voiceover || "").toLowerCase();
}

// ─── Check functions ───

/** Scene count should be 6-10 per SKILL.md */
export function checkSceneCount(scenes) {
  const count = scenes.length;
  if (count >= 6 && count <= 10) {
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
      level: "warn",
      category: "Structure",
      check: "Scene count (6-10)",
      detail: `${count} scenes`,
      fix: "SKILL.md recommends 6-10 scenes",
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

/** Hook VO and on-screen text should use different words */
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
  if (overlap.length <= hookWords.length * 0.5) {
    return [
      {
        level: "pass",
        category: "De-AI",
        check: "Hook VO differs from on-screen text",
        detail: `${overlap.length}/${hookWords.length} words overlap`,
      },
    ];
  }
  return [
    {
      level: "warn",
      category: "De-AI",
      check: "Hook VO vs on-screen text",
      detail: `${overlap.length}/${hookWords.length} words overlap`,
      fix: "Use different words for on-screen text (different angle on same promise)",
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
export function checkVoiceoverWordCount(scenes) {
  const totalWords = scenes.reduce(
    (sum, s) => sum + (s.voiceover || "").split(/\s+/).filter(Boolean).length,
    0,
  );
  if (totalWords <= 180) {
    return [
      {
        level: "pass",
        category: "Duration",
        check: "Total voiceover words (≤180)",
        detail: `${totalWords} words (~${(totalWords / 2.5).toFixed(0)}s)`,
      },
    ];
  }
  return [
    {
      level: "warn",
      category: "Duration",
      check: "Total voiceover words (≤180)",
      detail: `${totalWords} words`,
      fix: "May exceed 70s at 2.5 wps — consider trimming",
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
      if (wordCount > 25) {
        longLines.push({ scene: scene.id, words: wordCount });
      }
    }
  }
  if (longLines.length === 0) {
    return [
      { level: "pass", category: "De-AI", check: "All voiceover lines ≤25 words (one breath)" },
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
      check: "One-breath check (≤25 words per sentence)",
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
const NAMED_SOURCE_PATTERN =
  /\b(according to|reported by|bloomberg|reuters|FT|wall street journal)\b/i;
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
  const allSimilar = voLengths.every((l) => Math.abs(l - avg) / avg < 0.15);
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
    if (ctaCount >= 3) stacks++;
  }
  if (stacks === 0) {
    return [{ level: "pass", category: "De-AI", check: "No CTA stacking (≥3 CTAs in one scene)" }];
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
  if (goalCount <= 2) {
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
export function runAllSceneDataChecks(scenes, seriesMeta) {
  const allChecks = [
    ...checkSceneCount(scenes),
    ...checkHookVisualType(scenes),
    ...checkCTAVisualType(scenes),
    ...checkHookCompellingElement(scenes),
    ...checkNoEmDashes(scenes),
    ...checkNoAIVocabulary(scenes),
    ...checkNoWrittenOpener(scenes),
    ...checkHookDiffersFromText(scenes),
    ...checkNoDeadClosers(scenes),
    ...checkSEOKeywords(scenes),
    ...checkSourceAttribution(scenes),
    ...checkShareWorthyData(scenes),
    ...checkVoiceoverWordCount(scenes),
    ...checkOneBreath(scenes),
    ...checkSubjectVisibility(scenes),
    ...checkSeriesMeta(seriesMeta),
    ...checkClickbait(scenes),
    ...checkUnverifiedClaims(scenes),
    ...checkNoWatermarks(scenes),
    ...checkTeleprompterRhythm(scenes),
    ...checkCTAStacking(scenes),
    ...checkPrimaryGoal(scenes),
    ...checkLoopClose(scenes),
  ];

  return {
    pass: allChecks.filter((r) => r.level === "pass"),
    warn: allChecks.filter((r) => r.level === "warn"),
    fail: allChecks.filter((r) => r.level === "fail"),
  };
}
