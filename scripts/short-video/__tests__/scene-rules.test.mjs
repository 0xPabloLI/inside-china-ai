import { describe, it, expect } from "vitest";
import {
  AI_BLACKLIST,
  checkNoGreeting,
  checkSceneCount,
  checkHookVisualType,
  checkHookContract,
  checkCTAVisualType,
  checkCTAActionContract,
  checkHookCompellingElement,
  checkNoEmDashes,
  checkNoAIVocabulary,
  checkNoWrittenOpener,
  checkHookDiffersFromText,
  checkNoDeadClosers,
  checkSEOKeywords,
  checkSourceAttribution,
  checkShareWorthyData,
  checkVoiceoverWordCount,
  checkOneBreath,
  checkSubjectVisibility,
  checkSeriesMeta,
  checkClickbait,
  checkUnverifiedClaims,
  checkNoWatermarks,
  checkTeleprompterRhythm,
  checkCTAStacking,
  checkPrimaryGoal,
  checkLoopClose,
  checkSemanticConsistency,
  checkBodyTextVoRedundancy,
  checkHookMediaWarning,
  checkOpenLoop,
  checkPatternInterrupt,
  checkLoopClosureNarrative,
  checkAssetNeedAnnotation,
  checkMediaStrategyContract,
  checkBrollPromptDimensions,
  runAllSceneDataChecks,
} from "../lib/scene-rules.mjs";
import { scenes as bytedanceScenes } from "../content/bytedance-distillation/scene-data.mjs";
import { scenes as deepseekScenes } from "../content/deepseek/scene-data.mjs";
import { scenes as restraintScenes } from "../content/restraint/pt1/scene-data.mjs";
import { scenes as restraintPt3Scenes } from "../content/restraint/pt3/scene-data.mjs";
import { scenes as pt1Scenes } from "../content/distillation/pt1/scene-data.mjs";
import { scenes as pt2Scenes } from "../content/distillation/pt2/scene-data.mjs";
import { scenes as pt3Scenes } from "../content/distillation/pt3/scene-data.mjs";
import { scenes as qwenScenes } from "../content/qwen4-preview/scene-data.mjs";

// ── Mock scene data ──

const validScenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    voiceover: "A leaked memo reveals DeepSeek paused its 1.4 billion dollar round.",
    texts: { hookText: "DEEPSEEK PAUSED", revealText: "$1.4B ROUNDD" },
  },
  {
    id: 2,
    name: "context",
    visualType: "context",
    layout: "hero-center",
    voiceover: "Bloomberg reported the news first. Liang Wenfeng confirmed it.",
    texts: { title: "BLOOMBERG EXCLUSIVE", context: "LIANG WENFENG CONFIRMED IT" },
  },
  {
    id: 3,
    name: "data",
    visualType: "data",
    layout: "hero-center",
    voiceover: "China AI spending hit 47 billion in 2024.",
    texts: { stat: "$47B" },
  },
  {
    id: 4,
    name: "analysis",
    visualType: "contrast",
    layout: "hero-center",
    voiceover: "DeepSeek chose open source. Others chose closed.",
    texts: { title: "OPEN VS CLOSED", left: ["OPEN"], right: ["CLOSED"] },
  },
  {
    id: 5,
    name: "analysis2",
    visualType: "data",
    layout: "hero-center",
    voiceover: "Tencent and Alibaba joined the race with rival models.",
    texts: { stat: "2X" },
  },
  {
    id: 6,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI news that matters.",
    // cta.hero-center contract: brand + tagline rendered, action per the CTA
    // action contract. `line1` is unknown to the slot map (template contract
    // check, #190) — the render resolves non-narrative layouts to hero-center,
    // so the per-type layout values below were replaced with hero-center.
    texts: {
      brand: "CHINA AI NEWS",
      tagline: "DAILY CHINA AI BRIEFING",
      action: "FOLLOW FOR MORE",
    },
  },
];

const validSeriesMeta = {
  seriesId: "restraint",
  partNumber: 1,
  totalParts: 3,
};

// ── checkSceneCount ──

// ── checkHookContract (standard hook focal) ──

describe("checkHookContract", () => {
  it("passes a claim-led hook (hookText focal)", () => {
    const results = checkHookContract([{ visualType: "hook", texts: { hookText: "0 KPIs" } }]);
    expect(results[0].level).toBe("pass");
    expect(results[0].detail).toContain("hookText focal");
  });

  it("passes a number-led hook (bigNumber focal)", () => {
    const results = checkHookContract([{ visualType: "hook", texts: { bigNumber: "$1.4B" } }]);
    expect(results[0].level).toBe("pass");
    expect(results[0].detail).toContain("bigNumber focal");
  });

  it("fails when both focals are present", () => {
    const results = checkHookContract([
      { visualType: "hook", texts: { bigNumber: "$1.4B", hookText: "0 KPIs" } },
    ]);
    expect(results[0].level).toBe("fail");
    expect(results[0].fix).toContain("hookText");
  });

  it("fails when no focal is present", () => {
    const results = checkHookContract([{ visualType: "hook", texts: { subject: "DEEPSEEK" } }]);
    expect(results[0].level).toBe("fail");
    expect(results[0].fix).toContain("HookScene");
  });

  it("fails when focal fields are empty/whitespace strings", () => {
    const results = checkHookContract([
      { visualType: "hook", texts: { hookText: "", bigNumber: "   " } },
    ]);
    expect(results[0].level).toBe("fail");
  });

  it("fails when texts is missing", () => {
    const results = checkHookContract([{ visualType: "hook", voiceover: "boom" }]);
    expect(results[0].level).toBe("fail");
  });

  it("passes when the first scene is not a hook", () => {
    const results = checkHookContract([{ visualType: "teaser" }]);
    expect(results[0].level).toBe("pass");
  });

  it("is included in runAllSceneDataChecks results", () => {
    const results = runAllSceneDataChecks(validScenes, null);
    const hookCheck = [...results.pass, ...results.warn, ...results.fail].find((r) =>
      r.check.includes("Hook focal contract"),
    );
    expect(hookCheck).toBeDefined();
  });

  it("locks current content reality: every content hook passes the focal contract (spec #17)", () => {
    // All seven content dirs now delegate scene 1 to the shared hookScene —
    // the legacy line1/line2 hook shape is fully migrated (2026-08-08).
    for (const [name, scenes] of [
      ["bytedance-distillation", bytedanceScenes],
      ["deepseek", deepseekScenes],
      ["restraint/pt1", restraintScenes],
      ["restraint/pt3", restraintPt3Scenes],
      ["distillation/pt1", pt1Scenes],
      ["distillation/pt2", pt2Scenes],
      ["distillation/pt3", pt3Scenes],
    ]) {
      expect(checkHookContract(scenes)[0].level, `${name} should pass`).toBe("pass");
    }
  });
});

// ── checkSceneCount ──

describe("checkSceneCount", () => {
  it("passes for 6-10 scenes", () => {
    for (const n of [6, 7, 8, 9, 10]) {
      const scenes = Array(n).fill(validScenes[0]);
      const results = checkSceneCount(scenes);
      expect(results[0].level).toBe("pass");
    }
  });

  it("fails for <6 scenes (TikTok default)", () => {
    const results = checkSceneCount(Array(5).fill(validScenes[0]));
    expect(results[0].level).toBe("fail");
  });

  it("fails for >10 scenes (TikTok default)", () => {
    const results = checkSceneCount(Array(11).fill(validScenes[0]));
    expect(results[0].level).toBe("fail");
  });

  it("warns for >10 scenes with --long-form opt-in", () => {
    const results = checkSceneCount(Array(11).fill(validScenes[0]), { longForm: true });
    expect(results[0].level).toBe("warn");
  });

  it("warns for <6 scenes with --long-form opt-in", () => {
    const results = checkSceneCount(Array(5).fill(validScenes[0]), { longForm: true });
    expect(results[0].level).toBe("warn");
  });

  it("still passes compliant count with --long-form", () => {
    const results = checkSceneCount(Array(8).fill(validScenes[0]), { longForm: true });
    expect(results[0].level).toBe("pass");
  });

  it("fail fix suggests splitting into parts", () => {
    const results = checkSceneCount(Array(11).fill(validScenes[0]));
    expect(results[0].fix).toMatch(/pt/i);
    expect(results[0].fix).toMatch(/split|拆分/i);
  });
});

// ── checkHookVisualType ──

describe("checkHookVisualType", () => {
  it("passes when Scene 1 has visualType=hook", () => {
    const results = checkHookVisualType(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when Scene 1 visualType is not hook", () => {
    const scenes = [{ ...validScenes[0], visualType: "narrative" }];
    const results = checkHookVisualType(scenes);
    expect(results[0].level).toBe("fail");
    expect(results[0].fix).toContain("hook");
  });
});

// ── checkCTAVisualType ──

describe("checkCTAVisualType", () => {
  it("passes when last scene has visualType=cta", () => {
    const results = checkCTAVisualType(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when last scene visualType is not cta", () => {
    const scenes = [...validScenes.slice(0, -1), { ...validScenes[5], visualType: "summary" }];
    const results = checkCTAVisualType(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkCTAActionContract ──
describe("checkCTAActionContract", () => {
  it("passes when the last CTA scene carries texts.action", () => {
    const results = checkCTAActionContract(validScenes);
    expect(results[0]).toEqual(
      expect.objectContaining({ level: "pass", check: "CTA action contract" }),
    );
  });

  it("fails when the last CTA scene misses texts.action", () => {
    const scenes = [
      ...validScenes.slice(0, -1),
      { ...validScenes[5], texts: { line1: "CHINA AI NEWS" } },
    ];
    const results = checkCTAActionContract(scenes);
    expect(results[0].level).toBe("fail");
    expect(results[0].fix).toContain("action");
  });

  it("fails when texts.action is an empty string", () => {
    const scenes = [...validScenes.slice(0, -1), { ...validScenes[5], texts: { action: "" } }];
    const results = checkCTAActionContract(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("fails when the last scene has no texts object", () => {
    const scenes = [...validScenes.slice(0, -1), { ...validScenes[5], texts: undefined }];
    const results = checkCTAActionContract(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("passes (no-op) when the last scene is not a CTA", () => {
    const scenes = [...validScenes.slice(0, -1), { ...validScenes[5], visualType: "summary" }];
    const results = checkCTAActionContract(scenes);
    expect(results[0].level).toBe("pass");
  });

  it("is included in runAllSceneDataChecks results", () => {
    const results = runAllSceneDataChecks(validScenes, validSeriesMeta);
    const actionCheck = [...results.pass, ...results.warn, ...results.fail].find((r) =>
      r.check.includes("CTA action contract"),
    );
    expect(actionCheck).toBeDefined();
  });
});

// ── checkHookCompellingElement ──

describe("checkHookCompellingElement", () => {
  it("passes when hook has a number", () => {
    const scenes = [{ ...validScenes[0], voiceover: "DeepSeek raised 1.4 billion." }];
    const results = checkHookCompellingElement(scenes);
    expect(results[0].level).toBe("pass");
  });

  it("passes when hook has a strong word", () => {
    const scenes = [{ ...validScenes[0], voiceover: "A leaked memo changed everything." }];
    const results = checkHookCompellingElement(scenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when hook has no number or strong word", () => {
    const scenes = [{ ...validScenes[0], voiceover: "DeepSeek is a company in China." }];
    const results = checkHookCompellingElement(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkNoEmDashes ──

describe("checkNoEmDashes", () => {
  it("passes when no dashes in any scene", () => {
    const results = checkNoEmDashes(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when em dash in voiceover", () => {
    const scenes = [{ ...validScenes[0], voiceover: "DeepSeek — the AI giant — paused." }];
    const results = checkNoEmDashes(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("fails when double dash in on-screen text", () => {
    const scenes = [{ ...validScenes[0], texts: { line1: "DEEPSEEK--PAUSED" } }];
    const results = checkNoEmDashes(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkNoAIVocabulary ──

describe("checkNoAIVocabulary", () => {
  it("passes when no blacklist words", () => {
    const results = checkNoAIVocabulary(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when leverage is used", () => {
    const scenes = [{ ...validScenes[0], voiceover: "They leverage AI for growth." }];
    const results = checkNoAIVocabulary(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("fails when seamless is used", () => {
    const scenes = [{ ...validScenes[1], voiceover: "A seamless integration." }];
    const results = checkNoAIVocabulary(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("catches multiple blacklist words across scenes", () => {
    const scenes = [
      { id: 1, voiceover: "They leverage the ecosystem." },
      { id: 2, voiceover: "A seamless paradigm shift." },
    ];
    const results = checkNoAIVocabulary(scenes);
    expect(results[0].level).toBe("fail");
    expect(results[0].detail).toContain("leverage");
    expect(results[0].detail).toContain("seamless");
  });
});

// ── checkNoWrittenOpener ──

describe("checkNoWrittenOpener", () => {
  it("passes when hook is spoken style", () => {
    const results = checkNoWrittenOpener(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when hook starts with 'In this video I will'", () => {
    const scenes = [{ ...validScenes[0], voiceover: "In this video I will show you DeepSeek." }];
    const results = checkNoWrittenOpener(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkHookDiffersFromText (B4 three-tier) ──

describe("checkHookDiffersFromText", () => {
  it("passes when hook VO and texts are different (< 50% overlap)", () => {
    const results = checkHookDiffersFromText(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("warns when hook VO and texts overlap moderately (50-80%)", () => {
    const scenes = [
      {
        ...validScenes[0],
        voiceover: "DeepSeek paused its funding round after leak.",
        texts: { line1: "DeepSeek paused its funding round", line2: "LEAKED" },
      },
      ...validScenes.slice(1),
    ];
    const results = checkHookDiffersFromText(scenes);
    expect(results[0].level).toBe("warn");
  });

  it("fails when hook VO and texts overlap heavily (>= 80%)", () => {
    const scenes = [
      {
        ...validScenes[0],
        voiceover: "DeepSeek paused its funding round.",
        texts: { line1: "DeepSeek paused its funding round.", line2: "EXCLUSIVE" },
      },
      ...validScenes.slice(1),
    ];
    const results = checkHookDiffersFromText(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkNoGreeting (B2 partial) ──

describe("checkNoGreeting", () => {
  it("passes when hook has no greeting", () => {
    const results = checkNoGreeting(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when hook starts with 'Hey guys'", () => {
    const scenes = [
      { ...validScenes[0], voiceover: "Hey guys, DeepSeek paused its round." },
      ...validScenes.slice(1),
    ];
    const results = checkNoGreeting(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("fails when hook starts with 'What's up everyone'", () => {
    const scenes = [
      { ...validScenes[0], voiceover: "What's up everyone, today we talk about DeepSeek." },
      ...validScenes.slice(1),
    ];
    const results = checkNoGreeting(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("passes when 'high' appears in hook (not a greeting)", () => {
    const scenes = [
      { ...validScenes[0], voiceover: "DeepSeek hit a high valuation." },
      ...validScenes.slice(1),
    ];
    const results = checkNoGreeting(scenes);
    expect(results[0].level).toBe("pass");
  });

  it("passes when hook is null or empty", () => {
    const scenes = [{ ...validScenes[0], voiceover: "" }, ...validScenes.slice(1)];
    const results = checkNoGreeting(scenes);
    expect(results[0].level).toBe("pass");
  });
});

// ── checkNoDeadClosers ──

describe("checkNoDeadClosers", () => {
  it("passes when no dead closer in last scene", () => {
    const results = checkNoDeadClosers(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when last scene has 'thanks for watching'", () => {
    const scenes = [
      ...validScenes.slice(0, -1),
      { ...validScenes[5], voiceover: "Thanks for watching!" },
    ];
    const results = checkNoDeadClosers(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkSEOKeywords ──

describe("checkSEOKeywords", () => {
  it("passes when all keywords appear in >=2 scenes", () => {
    const results = checkSEOKeywords(validScenes);
    expect(results.every((r) => r.level === "pass")).toBe(true);
  });

  it("fails when a keyword appears in <2 scenes", () => {
    const scenes = [
      { id: 1, voiceover: "China AI news.", texts: {} },
      { id: 2, voiceover: "Some other topic.", texts: {} },
      { id: 3, voiceover: "More news.", texts: {} },
    ];
    const results = checkSEOKeywords(scenes);
    const aiResult = results.find((r) => r.check.includes("ai"));
    expect(aiResult.level).toBe("fail");
  });
});

// ── checkSourceAttribution ──

describe("checkSourceAttribution", () => {
  it("passes when >=2 scenes mention sources", () => {
    const results = checkSourceAttribution(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when <2 scenes mention sources", () => {
    const scenes = [
      { id: 1, voiceover: "Something happened." },
      { id: 2, voiceover: "More things happened." },
      { id: 3, voiceover: "Even more." },
    ];
    const results = checkSourceAttribution(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkShareWorthyData ──

describe("checkShareWorthyData", () => {
  it("passes when >=50% scenes have numbers", () => {
    const results = checkShareWorthyData(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when <50% scenes have numbers", () => {
    const scenes = [
      { id: 1, voiceover: "Something happened.", texts: {} },
      { id: 2, voiceover: "More things.", texts: {} },
      { id: 3, voiceover: "Even more.", texts: {} },
      { id: 4, voiceover: "Still no numbers.", texts: {} },
    ];
    const results = checkShareWorthyData(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkVoiceoverWordCount ──

describe("checkVoiceoverWordCount", () => {
  it("passes when total words <=180", () => {
    const results = checkVoiceoverWordCount(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("passes at the 180-word boundary", () => {
    const longVO = Array(180).fill("word").join(" ");
    const scenes = [{ ...validScenes[0], voiceover: longVO }];
    const results = checkVoiceoverWordCount(scenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when total words >180 (TikTok default)", () => {
    const longVO = Array(181).fill("word").join(" ");
    const scenes = [{ ...validScenes[0], voiceover: longVO }];
    const results = checkVoiceoverWordCount(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("warns when total words >180 with --long-form opt-in", () => {
    const longVO = Array(200).fill("word").join(" ");
    const scenes = [{ ...validScenes[0], voiceover: longVO }];
    const results = checkVoiceoverWordCount(scenes, { longForm: true });
    expect(results[0].level).toBe("warn");
  });

  it("still passes compliant word count with --long-form", () => {
    const results = checkVoiceoverWordCount(validScenes, { longForm: true });
    expect(results[0].level).toBe("pass");
  });

  it("fail fix suggests splitting into parts", () => {
    const longVO = Array(200).fill("word").join(" ");
    const scenes = [{ ...validScenes[0], voiceover: longVO }];
    const results = checkVoiceoverWordCount(scenes);
    expect(results[0].fix).toMatch(/pt/i);
    expect(results[0].fix).toMatch(/split|拆分/i);
  });
});

// ── runAllSceneDataChecks aggregation (guard strictness) ──

describe("runAllSceneDataChecks guard strictness", () => {
  const overLimitScenes = Array(12)
    .fill(validScenes[0])
    .map((s, i) => ({
      ...s,
      id: i + 1,
      voiceover: i === 0 ? "word ".repeat(200).trim() : s.voiceover,
    }));

  it("defaults: scene count + word count land in fail bucket", () => {
    const res = runAllSceneDataChecks(overLimitScenes);
    const failedChecks = res.fail.map((r) => r.check);
    expect(failedChecks).toContain("Scene count (6-10)");
    expect(failedChecks).toContain("Total voiceover words (≤180)");
  });

  it("--long-form: scene count + word count downgrade to warn bucket", () => {
    const res = runAllSceneDataChecks(overLimitScenes, undefined, { longForm: true });
    const warnedChecks = res.warn.map((r) => r.check);
    expect(warnedChecks).toContain("Scene count (6-10)");
    expect(warnedChecks).toContain("Total voiceover words (≤180)");
    const failedChecks = res.fail.map((r) => r.check);
    expect(failedChecks).not.toContain("Scene count (6-10)");
    expect(failedChecks).not.toContain("Total voiceover words (≤180)");
  });

  it("compliant content stays 0 scene/word failures in both modes", () => {
    const resDefault = runAllSceneDataChecks(validScenes);
    const resLong = runAllSceneDataChecks(validScenes, undefined, { longForm: true });
    for (const res of [resDefault, resLong]) {
      const failedChecks = res.fail.map((r) => r.check);
      expect(failedChecks).not.toContain("Scene count (6-10)");
      expect(failedChecks).not.toContain("Total voiceover words (≤180)");
    }
  });
});

// ── checkOneBreath ──

describe("checkOneBreath", () => {
  it("passes when all lines <=25 words", () => {
    const results = checkOneBreath(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("warns when a line exceeds 25 words", () => {
    const longLine = Array(30).fill("word").join(" ");
    const scenes = [{ ...validScenes[0], voiceover: longLine }];
    const results = checkOneBreath(scenes);
    expect(results[0].level).toBe("warn");
  });
});

// ── checkSubjectVisibility ──

describe("checkSubjectVisibility", () => {
  it("passes when company name in hook on-screen text", () => {
    const results = checkSubjectVisibility(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("warns when no company name in hook on-screen text", () => {
    const scenes = [{ ...validScenes[0], texts: { line1: "BIG NEWS" } }];
    const results = checkSubjectVisibility(scenes);
    expect(results[0].level).toBe("warn");
  });

  // Scenario #1: new company not in KNOWN_COMPANIES → pass when meta has it
  it("passes when meta.keyEntities.companies has a company not in KNOWN_COMPANIES", () => {
    const scenes = [
      {
        id: 1,
        visualType: "hook",
        voiceover: "Unitree raised 1.5 billion.",
        texts: { subject: "UNITREE" },
      },
    ];
    const meta = { keyEntities: { companies: ["unitree"] } };
    const results = checkSubjectVisibility(scenes, meta);
    expect(results[0].level).toBe("pass");
    expect(results[0].detail.toLowerCase()).toContain("company");
  });

  // Scenario #1: subject field present → pass (secondary source)
  it("passes when scene.texts.subject is present even without meta", () => {
    const scenes = [
      {
        id: 1,
        visualType: "hook",
        voiceover: "Unitree raised 1.5 billion.",
        texts: { subject: "UNITREE" },
      },
    ];
    const results = checkSubjectVisibility(scenes);
    expect(results[0].level).toBe("pass");
  });

  // Scenario #2: no meta, no subject → warn
  it("warns when no meta and no subject field", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "Something happened.", texts: { line1: "BIG NEWS" } },
    ];
    const results = checkSubjectVisibility(scenes);
    expect(results[0].level).toBe("warn");
  });

  // Scenario #16: meta.keyEntities.companies is empty array → fallback to KNOWN_COMPANIES
  it("falls back to KNOWN_COMPANIES when meta.keyEntities.companies is empty array", () => {
    const scenes = [
      {
        id: 1,
        visualType: "hook",
        voiceover: "DeepSeek raised 1.4 billion.",
        texts: { hookText: "DEEPSEEK" },
      },
    ];
    const meta = { keyEntities: { companies: [] } };
    const results = checkSubjectVisibility(scenes, meta);
    expect(results[0].level).toBe("pass");
  });

  // Backwards compat: existing KNOWN_COMPANIES still work without meta
  it("passes for KNOWN_COMPANIES entry without meta (backwards compat)", () => {
    const scenes = [
      {
        id: 1,
        visualType: "hook",
        voiceover: "DeepSeek paused.",
        texts: { hookText: "DEEPSEEK PAUSED" },
      },
    ];
    const results = checkSubjectVisibility(scenes);
    expect(results[0].level).toBe("pass");
  });
});

// ── checkSeriesMeta ──

describe("checkSeriesMeta", () => {
  it("passes when seriesMeta is complete", () => {
    const results = checkSeriesMeta(validSeriesMeta);
    expect(results[0].level).toBe("pass");
  });

  it("returns empty when seriesMeta is null (single video)", () => {
    const results = checkSeriesMeta(null);
    expect(results).toEqual([]);
  });

  it("fails when seriesMeta is incomplete", () => {
    const results = checkSeriesMeta({ seriesId: "test", partNumber: 1 });
    expect(results[0].level).toBe("fail");
  });
});

// ── checkClickbait ──

describe("checkClickbait", () => {
  it("passes when no clickbait patterns", () => {
    const results = checkClickbait(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when 'you won't believe' is used", () => {
    const scenes = [{ ...validScenes[0], voiceover: "You won't believe what DeepSeek did." }];
    const results = checkClickbait(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkUnverifiedClaims ──

describe("checkUnverifiedClaims", () => {
  it("passes when no unverified 'sources say'", () => {
    const results = checkUnverifiedClaims(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when 'sources say' without attribution", () => {
    const scenes = [{ ...validScenes[0], voiceover: "Sources say DeepSeek is collapsing." }];
    const results = checkUnverifiedClaims(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkNoWatermarks ──

describe("checkNoWatermarks", () => {
  it("passes when no cross-platform references", () => {
    const results = checkNoWatermarks(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when @instagram reference found", () => {
    const scenes = [{ ...validScenes[0], texts: { line1: "Follow @instagram" } }];
    const results = checkNoWatermarks(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkTeleprompterRhythm ──

describe("checkTeleprompterRhythm", () => {
  it("passes when lines vary in length", () => {
    const results = checkTeleprompterRhythm(validScenes);
    expect(results[0].level).toBe("pass");
  });
});

// ── checkCTAStacking ──

describe("checkCTAStacking", () => {
  it("passes when no CTA stacking", () => {
    const results = checkCTAStacking(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("warns when 3+ CTAs in one scene", () => {
    const scenes = [
      { ...validScenes[5], voiceover: "Follow, like, comment, share, and subscribe now!" },
    ];
    const results = checkCTAStacking(scenes);
    expect(results[0].level).toBe("warn");
  });
});

// ── checkPrimaryGoal ──

describe("checkPrimaryGoal", () => {
  it("passes when <=2 goal signals", () => {
    const results = checkPrimaryGoal(validScenes);
    expect(results[0].level).toBe("pass");
  });

  // Scenario #3: "see" in narration context should not count as goal signal
  it("does not count 'see' as a goal signal (removed completion category)", () => {
    const scenes = [
      { id: 1, voiceover: "You see what happened here." },
      { id: 2, voiceover: "Look at this data." },
      { id: 3, voiceover: "Here is the thing." },
    ];
    const results = checkPrimaryGoal(scenes);
    expect(results[0].level).toBe("pass");
    expect(results[0].detail).toContain("0 goals");
  });

  // Scenario #4: "follow" only → pass (1 signal)
  it("passes with 1 goal signal (follow)", () => {
    const scenes = [{ id: 1, voiceover: "Follow for more China AI news." }];
    const results = checkPrimaryGoal(scenes);
    expect(results[0].level).toBe("pass");
    expect(results[0].detail).toContain("1 goal");
  });

  it("warns when >2 goal signals (3 categories)", () => {
    const scenes = [{ id: 1, voiceover: "Follow, comment, and share this video." }];
    const results = checkPrimaryGoal(scenes);
    expect(results[0].level).toBe("warn");
    expect(results[0].detail).toContain("3 goal");
  });
});

// ── checkLoopClose ──

describe("checkLoopClose", () => {
  it("returns a result (warn level is acceptable)", () => {
    const results = checkLoopClose(validScenes);
    expect(results).toHaveLength(1);
    expect(["warn"]).toContain(results[0].level);
  });

  // Scenario #5: CTA with "629" matching hook → loop-close pass
  it("passes when CTA contains hook's core number", () => {
    const scenes = [
      { id: 1, voiceover: "Unitree raised 629 million dollars." },
      { id: 2, voiceover: "Some context." },
      { id: 3, voiceover: "Remember that 629 million? Follow for more." },
    ];
    const meta = { dataPoints: [{ value: "629" }] };
    const results = checkLoopClose(scenes, meta);
    expect(results[0].level).toBe("pass");
  });

  // Scenario #6: CTA with no hook reference → warn
  it("warns when CTA does not reference hook", () => {
    const scenes = [
      { id: 1, voiceover: "Unitree raised 629 million dollars." },
      { id: 2, voiceover: "Some context." },
      { id: 3, voiceover: "Follow for more." },
    ];
    const meta = { dataPoints: [{ value: "629" }] };
    const results = checkLoopClose(scenes, meta);
    expect(results[0].level).toBe("warn");
  });

  // Without meta, falls back to word matching (unchanged behavior)
  it("warns without meta (no dataPoints to check)", () => {
    const scenes = [
      { id: 1, voiceover: "Unitree raised 629 million dollars." },
      { id: 2, voiceover: "Follow for more." },
    ];
    const results = checkLoopClose(scenes);
    expect(results[0].level).toBe("warn");
  });
});

// ── checkSemanticConsistency ──

describe("checkSemanticConsistency", () => {
  it("passes when VO and on-screen text are consistent", () => {
    const scenes = [
      {
        id: 1,
        voiceover: "ByteDance trained on H20 chips, the only Nvidia chip China can legally buy.",
        texts: { chip: "H20", label: "CHINA CAN BUY" },
      },
    ];
    const results = checkSemanticConsistency(scenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when VO says 'restricted' but text says 'can buy'", () => {
    const scenes = [
      {
        id: 1,
        voiceover: "ByteDance trained on export-restricted H20 chips.",
        texts: { chip: "H20", label: "CHINA CAN BUY" },
      },
    ];
    const results = checkSemanticConsistency(scenes);
    expect(results[0].level).toBe("fail");
    expect(results[0].category).toBe("Fact-Check");
    expect(results[0].detail).toContain("restricted");
    expect(results[0].detail).toContain("can buy");
  });

  it("warns (not fails) in comparison scenes with antonym pairs", () => {
    const scenes = [
      {
        id: 1,
        voiceover: "H20 is legal for China. B200 is banned.",
        texts: { left: "H20", leftLabel: "CAN BUY", right: "B200", rightLabel: "BANNED", vs: "VS" },
      },
    ];
    const results = checkSemanticConsistency(scenes);
    // Should find "legal" + "banned" pair → warn (comparison scene)
    const match = results.find((r) => r.level === "warn");
    expect(match).toBeDefined();
    expect(match.detail).toContain("comparison scene");
  });

  it("fails when VO says 'clean' but text says 'accused' (non-comparison)", () => {
    const scenes = [
      {
        id: 1,
        voiceover: "ByteDance was clean, not accused of distillation.",
        texts: { label: "ACCUSED BY ANTHROPIC" },
      },
    ];
    const results = checkSemanticConsistency(scenes);
    expect(results[0].level).toBe("fail");
    expect(results[0].detail).toContain("clean");
    expect(results[0].detail).toContain("accused");
  });

  it("passes when VO and text use consistent terminology", () => {
    const scenes = [
      {
        id: 1,
        voiceover: "DeepSeek raises API prices on strength.",
        texts: { company: "DeepSeek", action: "RAISES API PRICES" },
      },
    ];
    const results = checkSemanticConsistency(scenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when VO says 'raises' but text says 'lowers'", () => {
    const scenes = [
      {
        id: 1,
        voiceover: "DeepSeek raises API prices.",
        texts: { company: "DeepSeek", action: "LOWERS API PRICES" },
      },
    ];
    const results = checkSemanticConsistency(scenes);
    expect(results[0].level).toBe("fail");
    expect(results[0].detail).toContain("raises");
    expect(results[0].detail).toContain("lowers");
  });

  it("is included in runAllSceneDataChecks results", () => {
    const results = runAllSceneDataChecks(validScenes, validSeriesMeta);
    const factCheck = [...results.pass, ...results.warn, ...results.fail].find((r) =>
      r.check.includes("Semantic consistency"),
    );
    expect(factCheck).toBeDefined();
  });
});

// ── runAllSceneDataChecks ──

describe("runAllSceneDataChecks", () => {
  it("returns { pass, warn, fail } arrays", () => {
    const results = runAllSceneDataChecks(validScenes, validSeriesMeta);
    expect(results).toHaveProperty("pass");
    expect(results).toHaveProperty("warn");
    expect(results).toHaveProperty("fail");
    expect(Array.isArray(results.pass)).toBe(true);
    expect(Array.isArray(results.warn)).toBe(true);
    expect(Array.isArray(results.fail)).toBe(true);
  });

  it("produces 0 fails for valid scenes", () => {
    const results = runAllSceneDataChecks(validScenes, validSeriesMeta);
    expect(results.fail.length).toBe(0);
  });

  it("catches missing visualType=hook", () => {
    const badScenes = [{ ...validScenes[0], visualType: "narrative" }, ...validScenes.slice(1)];
    const results = runAllSceneDataChecks(badScenes, null);
    const hookFail = results.fail.find((f) => f.check.includes("Hook scene type"));
    expect(hookFail).toBeDefined();
  });

  it("includes checkNoGreeting in results", () => {
    const results = runAllSceneDataChecks(validScenes, validSeriesMeta);
    const greetingCheck = [...results.pass, ...results.warn, ...results.fail].find((r) =>
      r.check.toLowerCase().includes("greeting"),
    );
    expect(greetingCheck).toBeDefined();
  });

  it("catches missing visualType=cta", () => {
    const badScenes = [...validScenes.slice(0, -1), { ...validScenes[5], visualType: "summary" }];
    const results = runAllSceneDataChecks(badScenes, null);
    const ctaFail = results.fail.find((f) => f.check.includes("CTA scene type"));
    expect(ctaFail).toBeDefined();
  });

  it("catches em dashes", () => {
    const badScenes = [
      { ...validScenes[0], voiceover: "DeepSeek — paused." },
      ...validScenes.slice(1),
    ];
    const results = runAllSceneDataChecks(badScenes, null);
    const dashFail = results.fail.find((f) => f.check.includes("dash"));
    expect(dashFail).toBeDefined();
  });

  it("catches AI vocabulary", () => {
    const badScenes = [
      { ...validScenes[0], voiceover: "They leverage AI." },
      ...validScenes.slice(1),
    ];
    const results = runAllSceneDataChecks(badScenes, null);
    const aiFail = results.fail.find((f) => f.check.includes("blacklist"));
    expect(aiFail).toBeDefined();
  });

  it("catches expanded blacklist words (journey, realm, moreover)", () => {
    const scenes = [{ id: 1, voiceover: "This is a journey into the realm of AI." }];
    const results = checkNoAIVocabulary(scenes);
    expect(results[0].level).toBe("fail");
    expect(results[0].detail).toContain("journey");
    expect(results[0].detail).toContain("realm");
  });

  it("catches AI tool markers (oaicite)", () => {
    const scenes = [{ id: 1, voiceover: "The data shows oaicite references." }];
    const results = checkNoAIVocabulary(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("catches dead closer", () => {
    const badScenes = [
      ...validScenes.slice(0, -1),
      { ...validScenes[5], voiceover: "Thanks for watching!" },
    ];
    const results = runAllSceneDataChecks(badScenes, null);
    const closerFail = results.fail.find(
      (f) => f.check.includes("closer") || f.check.includes("dead"),
    );
    expect(closerFail).toBeDefined();
  });

  it("catches clickbait", () => {
    const badScenes = [
      { ...validScenes[0], voiceover: "You won't believe this!" },
      ...validScenes.slice(1),
    ];
    const results = runAllSceneDataChecks(badScenes, null);
    const clickbaitFail = results.fail.find((f) => f.check.includes("clickbait"));
    expect(clickbaitFail).toBeDefined();
  });

  it("works without seriesMeta (single video)", () => {
    const results = runAllSceneDataChecks(validScenes, null);
    expect(results.fail.length).toBe(0);
  });
});

// ── checkHookMediaWarning ──

describe("checkHookMediaWarning", () => {
  it("warns when hook scene has no media", () => {
    const scenes = [{ id: 1, visualType: "hook", texts: { hookText: "TEST" } }];
    const result = checkHookMediaWarning(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
    expect(result[0].category).toBe("Hook");
    expect(result[0].check).toContain("media");
  });

  it("passes when hook scene has media", () => {
    const scenes = [
      {
        id: 1,
        visualType: "hook",
        texts: { hookText: "TEST" },
        media: { type: "image", path: "assets/bg.jpg", animation: "ken-burns", overlay: 0.5 },
      },
    ];
    const result = checkHookMediaWarning(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("pass");
  });

  it("passes when there is no hook scene", () => {
    const scenes = [{ id: 1, visualType: "narrative", voiceover: "test" }];
    const result = checkHookMediaWarning(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("pass");
  });

  it("is included in runAllSceneDataChecks results", () => {
    const scenes = [{ id: 1, visualType: "hook", texts: { hookText: "TEST" } }];
    const results = runAllSceneDataChecks(scenes, null);
    const mediaWarn = results.warn.find((w) => w.check.includes("media"));
    expect(mediaWarn).toBeDefined();
  });
});

// ── checkOpenLoop (W7) ──

describe("checkOpenLoop", () => {
  it("passes when a scene has retentionMechanism open-loop", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "test hook" },
      {
        id: 2,
        visualType: "narrative",
        voiceover: "test",
        narrativeRole: "T",
        retentionMechanism: "open-loop",
      },
    ];
    const result = checkOpenLoop(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("pass");
  });

  it("warns when S2 has narrativeRole T but no open-loop", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "test hook" },
      {
        id: 2,
        visualType: "narrative",
        voiceover: "test",
        narrativeRole: "T",
        retentionMechanism: "curiosity-gap",
      },
    ];
    const result = checkOpenLoop(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
  });

  it("skips when no scene has retentionMechanism field (legacy scene-data)", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "test hook" },
      { id: 2, visualType: "narrative", voiceover: "test" },
    ];
    const result = checkOpenLoop(scenes);
    expect(result).toHaveLength(0);
  });

  it("warns when retentionMechanism exists but no open-loop anywhere", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "test hook" },
      { id: 2, visualType: "narrative", voiceover: "test", retentionMechanism: "curiosity-gap" },
    ];
    const result = checkOpenLoop(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
  });
});

// ── checkPatternInterrupt (W8) ──

describe("checkPatternInterrupt", () => {
  it("passes when a scene has retentionMechanism pattern-interrupt", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "test hook" },
      {
        id: 2,
        visualType: "narrative",
        voiceover: "test",
        retentionMechanism: "pattern-interrupt",
      },
    ];
    const result = checkPatternInterrupt(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("pass");
  });

  it("skips when no scene has retentionMechanism field (legacy scene-data)", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "test hook" },
      { id: 2, visualType: "narrative", voiceover: "test" },
    ];
    const result = checkPatternInterrupt(scenes);
    expect(result).toHaveLength(0);
  });

  it("warns when retentionMechanism exists but no pattern-interrupt", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "test hook" },
      { id: 2, visualType: "narrative", voiceover: "test", retentionMechanism: "open-loop" },
      { id: 3, visualType: "narrative", voiceover: "test", retentionMechanism: "curiosity-gap" },
    ];
    const result = checkPatternInterrupt(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
  });
});

// ── checkLoopClosureNarrative (W9) ──

describe("checkLoopClosureNarrative", () => {
  it("passes when penultimate content scene has retentionMechanism loop-closure", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "test hook" },
      { id: 2, visualType: "narrative", voiceover: "test", retentionMechanism: "open-loop" },
      { id: 3, visualType: "narrative", voiceover: "test", retentionMechanism: "loop-closure" },
      { id: 4, visualType: "cta", voiceover: "test cta" },
    ];
    const result = checkLoopClosureNarrative(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("pass");
  });

  it("skips when no scene has retentionMechanism field (legacy scene-data)", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "test hook" },
      { id: 2, visualType: "narrative", voiceover: "test" },
      { id: 3, visualType: "cta", voiceover: "test cta" },
    ];
    const result = checkLoopClosureNarrative(scenes);
    expect(result).toHaveLength(0);
  });

  it("warns when penultimate scene has wrong retentionMechanism", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "test hook" },
      { id: 2, visualType: "narrative", voiceover: "test", retentionMechanism: "open-loop" },
      { id: 3, visualType: "narrative", voiceover: "test", retentionMechanism: "curiosity-gap" },
      { id: 4, visualType: "cta", voiceover: "test cta" },
    ];
    const result = checkLoopClosureNarrative(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
  });

  it("handles single content scene before CTA", () => {
    const scenes = [
      { id: 1, visualType: "hook", voiceover: "test hook", retentionMechanism: "open-loop" },
      { id: 2, visualType: "narrative", voiceover: "test", retentionMechanism: "loop-closure" },
      { id: 3, visualType: "cta", voiceover: "test cta" },
    ];
    const result = checkLoopClosureNarrative(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("pass");
  });
});

// ── B13: checkAssetNeedAnnotation — voiceover must not carry [ASSET NEEDED markers ──

describe("checkAssetNeedAnnotation", () => {
  it("fails when voiceover contains an inline [ASSET NEEDED marker", () => {
    const scenes = [
      {
        id: 2,
        visualType: "narrative",
        voiceover: "It previews the architecture. [ASSET NEEDED: architecture diagram]",
      },
    ];
    const result = checkAssetNeedAnnotation(scenes);
    expect(result[0].level).toBe("fail");
    expect(result[0].detail).toContain("2");
  });

  it("passes when voiceover is clean regardless of assetNeed field", () => {
    const scenes = [
      { id: 1, visualType: "narrative", voiceover: "Clean narration.", assetNeed: "chip diagram" },
      { id: 2, visualType: "narrative", voiceover: "Also clean." },
      { id: 3, visualType: "narrative", voiceover: "Empty need.", assetNeed: "   " },
    ];
    const result = checkAssetNeedAnnotation(scenes);
    expect(result[0].level).toBe("pass");
  });

  it("flags every offending scene", () => {
    const scenes = [
      { id: 1, visualType: "narrative", voiceover: "[ASSET NEEDED: chart]" },
      { id: 2, visualType: "narrative", voiceover: "ok" },
      { id: 3, visualType: "quote", voiceover: "lowercase [asset needed: photo] marker" },
    ];
    const result = checkAssetNeedAnnotation(scenes);
    expect(result[0].level).toBe("fail");
    expect(result[0].detail).toContain("1");
    expect(result[0].detail).toContain("3");
    expect(result[0].detail).not.toContain("2");
  });

  it("is wired into runAllSceneDataChecks as a fail", () => {
    const scenes = [
      { id: 1, visualType: "narrative", voiceover: "text with [ASSET NEEDED: x] inside" },
    ];
    const result = runAllSceneDataChecks(scenes, null);
    const b13 = result.fail.filter((r) => r.check === "Asset need annotation placement");
    expect(b13).toHaveLength(1);
  });
});

// ── B-roll preflight contract (spec rows #3/#4/#5/#6/#7) ──

describe("checkMediaStrategyContract", () => {
  const broll = (overrides = {}) => ({
    id: 5,
    visualType: "narrative",
    voiceover: "The model ships with a native million-token context.",
    mediaStrategy: "b-roll",
    aiVideo: { prompt: "SUBJECT: a server rack dissolving into light" },
    ...overrides,
  });

  it("#3: fails an invalid mediaStrategy, naming the scene and the allowed values", () => {
    const result = checkMediaStrategyContract([broll({ mediaStrategy: "broll" })]);
    expect(result[0].level).toBe("fail");
    expect(result[0].detail).toContain("5");
    expect(result[0].detail).toContain("broll");
    expect(result[0].fix).toContain("asset-then-broll");
  });

  it("#4: fails a b-roll strategy with no aiVideo.prompt", () => {
    const result = checkMediaStrategyContract([broll({ aiVideo: undefined })]);
    expect(result[0].level).toBe("fail");
    expect(result[0].check).toBe("B-roll strategy contract");
    expect(result[0].detail).toContain("5");
  });

  it("#5: fails an empty or whitespace-only aiVideo.prompt", () => {
    const empty = checkMediaStrategyContract([broll({ aiVideo: { prompt: "" } })]);
    const blank = checkMediaStrategyContract([broll({ aiVideo: { prompt: "   \t " } })]);
    expect(empty[0].level).toBe("fail");
    expect(blank[0].level).toBe("fail");
  });

  it("applies the same prompt requirement to asset-then-broll", () => {
    const result = checkMediaStrategyContract([
      broll({ mediaStrategy: "asset-then-broll", aiVideo: null }),
    ]);
    expect(result[0].level).toBe("fail");
  });

  it("#7: mediaOptOut with a b-roll strategy warns instead of failing", () => {
    const result = checkMediaStrategyContract([broll({ mediaOptOut: true, aiVideo: undefined })]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
    expect(result[0].detail).toContain("5");
  });

  it("#6: ignores aiVideo when the strategy is asset or absent", () => {
    const explicit = checkMediaStrategyContract([broll({ mediaStrategy: "asset", aiVideo: {} })]);
    expect(explicit[0].level).toBe("pass");
  });

  it("#193: warns when scenes omit mediaStrategy (silent asset default skips b-roll)", () => {
    const result = checkMediaStrategyContract([
      { id: 3, visualType: "narrative", voiceover: "The cabin interior feels spacious." },
      { id: 7, visualType: "data", voiceover: "Rides grew 40 percent year over year." },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
    expect(result[0].check).toBe("B-roll strategy contract");
    expect(result[0].detail).toContain("3");
    expect(result[0].detail).toContain("7");
    expect(result[0].fix).toContain("asset-then-broll");
  });

  it("passes a well-formed b-roll scene", () => {
    const result = checkMediaStrategyContract([broll()]);
    expect(result[0].level).toBe("pass");
  });

  it("warns once for content without b-roll fields (supersedes spec #2 silence — #193)", () => {
    const result = checkMediaStrategyContract(validScenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
    // every scene id is named exactly once
    for (const scene of validScenes) {
      expect(result[0].detail).toContain(String(scene.id));
    }
  });

  it("passes the real qwen4-preview fixture scenes", () => {
    // Whole-file check against live scene-data: no FAIL results. Missing
    // mediaStrategy produces a warn (issue #193), never a fail.
    const result = checkMediaStrategyContract(qwenScenes);
    expect(result.every((r) => r.level !== "fail")).toBe(true);
  });

  it("is wired into runAllSceneDataChecks", () => {
    const result = runAllSceneDataChecks([broll({ mediaStrategy: "nope" })], null);
    expect(result.fail.filter((r) => r.check === "B-roll strategy contract")).toHaveLength(1);
  });
});

// ── B-roll prompt dimensions (spec S1-S20) ──

// Covers all three NEGATIVE groups and carries no digits.
const FULL_NEGATIVE_PROMPT =
  "One tall glowing bar shrinking beside a short one, dark reflective studio floor, " +
  "cinematic slow push-in, high detail, no text, no watermark, no hands";

describe("checkBrollPromptDimensions", () => {
  const broll = (prompt, overrides = {}) => ({
    id: 5,
    visualType: "narrative",
    voiceover: "Training cost just one ninth of the old flagship.",
    mediaStrategy: "b-roll",
    aiVideo: { prompt },
    ...overrides,
  });

  it("S1/S4: stays silent when every NEGATIVE group is covered", () => {
    expect(checkBrollPromptDimensions([broll(FULL_NEGATIVE_PROMPT)])).toEqual([]);
  });

  it("S2: warns and names the missing ARTIFACT group", () => {
    const result = checkBrollPromptDimensions([
      broll("A glowing bar shrinking slowly, no text, no hands"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
    expect(result[0].category).toBe("Media");
    expect(result[0].check).toBe("B-roll prompt dimensions");
    expect(result[0].detail).toContain("5");
    expect(result[0].detail).toContain("ARTIFACT");
    expect(result[0].detail).not.toContain("HANDS");
  });

  it("S3/S6: names every missing group when only HANDS is covered", () => {
    const result = checkBrollPromptDimensions([
      broll("Abstract layers compressing a stream of history, high detail, no hands"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toContain("TEXT");
    expect(result[0].detail).toContain("ARTIFACT");
    expect(result[0].detail).not.toContain("HANDS");
  });

  it("S5: names all three groups when the prompt has no NEGATIVE clause at all", () => {
    const result = checkBrollPromptDimensions([
      broll("A glowing bar shrinking slowly on a dark floor"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toContain("TEXT");
    expect(result[0].detail).toContain("HANDS");
    expect(result[0].detail).toContain("ARTIFACT");
  });

  it("US3: suggests concrete replacement words in the fix hint", () => {
    const result = checkBrollPromptDimensions([broll("A glowing bar, no hands")]);
    expect(result[0].fix).toContain("no watermark");
  });

  it("S21: never fails, so preflight keeps exiting 0", () => {
    const result = checkBrollPromptDimensions(qwenScenes);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.level === "warn")).toBe(true);
  });

  it("S7: stays silent for content that uses no b-roll fields", () => {
    expect(checkBrollPromptDimensions(validScenes)).toEqual([]);
  });

  it("S8: stays silent when the strategy is asset even if a prompt is present", () => {
    const result = checkBrollPromptDimensions([broll("A glowing bar", { mediaStrategy: "asset" })]);
    expect(result).toEqual([]);
  });

  it("S9/S10: skips empty and whitespace prompts — the contract check already fails those", () => {
    expect(checkBrollPromptDimensions([broll("")])).toEqual([]);
    expect(checkBrollPromptDimensions([broll("   \t ")])).toEqual([]);
  });

  it("S18: emits one warning per scene, in scene order", () => {
    const result = checkBrollPromptDimensions([
      broll("A glowing bar, no hands", { id: 2 }),
      broll("A flowing stream of data, no hands", { id: 7 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].detail).toContain("2");
    expect(result[1].detail).toContain("7");
  });

  it("S14: warns when the prompt carries an Arabic numeral", () => {
    const result = checkBrollPromptDimensions([
      broll("A bar chart showing 8.6 times throughput, no text, no hands, no watermark"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toContain("8.6");
  });

  it("S15: still warns on an element count, and the fix explains both readings", () => {
    const result = checkBrollPromptDimensions([
      broll("Three glowing layers, say 3 layers, no text, no hands, no watermark"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toContain("3");
    expect(result[0].fix).toContain("texts");
    expect(result[0].fix.toLowerCase()).toContain("count");
  });

  it("S16: ignores spelled-out numbers", () => {
    const result = checkBrollPromptDimensions([
      broll("Two parallel lanes of glowing data, no text, no hands, no watermark"),
    ]);
    expect(result).toEqual([]);
  });

  it("S17: merges a missing group and a numeral into one warning", () => {
    const result = checkBrollPromptDimensions([
      broll("A bar shrinking to 1/9 of its height, no hands"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toContain("ARTIFACT");
    expect(result[0].detail).toContain("1");
  });

  it("S11: does not credit 'no texture' with text protection", () => {
    const result = checkBrollPromptDimensions([
      broll("A bar with no texture and a smooth surface, no hands, no watermark"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toContain("TEXT");
  });

  it("S12: matches NEGATIVE clauses regardless of case", () => {
    const result = checkBrollPromptDimensions([
      broll("A glowing bar, No Text, No Hands, No Watermark"),
    ]);
    expect(result).toEqual([]);
  });

  it("S13: matches the singular 'no hand'", () => {
    const result = checkBrollPromptDimensions([
      broll("A glowing bar, no text, no hand, no watermark"),
    ]);
    expect(result).toEqual([]);
  });

  it("S20: pins the real qwen4-preview prompts", () => {
    // This pins today's state, not a desired end state — the two incomplete
    // prompts are the evidence this check exists for. If someone completes
    // them, update the expectation here rather than treating the red as a
    // regression.
    const result = checkBrollPromptDimensions(qwenScenes);
    const details = result.map((r) => r.detail);

    // Scene 5 covers text/letters/hands but never mentions a watermark.
    expect(details.some((d) => d.includes("Scene 5") && d.includes("ARTIFACT"))).toBe(true);
    // Scene 6 declares only "no hands".
    expect(details.some((d) => d.includes("Scene 6") && d.includes("TEXT"))).toBe(true);
    expect(details.some((d) => d.includes("Scene 6") && d.includes("ARTIFACT"))).toBe(true);
    // Scene 8 is the only prompt covering all three groups.
    expect(details.some((d) => d.includes("Scene 8"))).toBe(false);
    expect(result).toHaveLength(2);
  });

  it("S19: is wired into runAllSceneDataChecks", () => {
    const result = runAllSceneDataChecks([broll("A glowing bar, no hands")], null);
    expect(result.warn.filter((r) => r.check === "B-roll prompt dimensions")).toHaveLength(1);
  });
});
