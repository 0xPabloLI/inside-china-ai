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
  checkHookMediaContract,
  checkOpenLoop,
  checkPatternInterrupt,
  checkLoopClosureNarrative,
  checkAssetNeedAnnotation,
  checkMediaStrategyContract,
  MEDIA_STRATEGIES,
  checkMediaOptOutDeprecation,
  checkLayoutMediaRouting,
  checkBrollPromptDimensions,
  BROLL_SHOT_SIGNALS,
  checkInstructCoverage,
  runAllSceneDataChecks,
} from "../lib/scene-rules.mjs";
import { HOOK_SUPPORTED_FITS } from "../lib/hook-media.mjs";
import { VALID_FITS } from "../lib/media-bg.mjs";
import { scenes as bytedanceScenes } from "../content/bytedance-distillation/scene-data.mjs";
import { scenes as deepseekScenes } from "../content/deepseek/scene-data.mjs";
import { scenes as restraintScenes } from "../content/restraint/pt1/scene-data.mjs";
import { scenes as restraintPt3Scenes } from "../content/restraint/pt3/scene-data.mjs";
import { scenes as pt1Scenes } from "../content/distillation/pt1/scene-data.mjs";
import { scenes as pt2Scenes } from "../content/distillation/pt2/scene-data.mjs";
import { scenes as pt3Scenes } from "../content/distillation/pt3/scene-data.mjs";
import { scenes as qwenScenes } from "../content/qwen4-preview/scene-data.mjs";
// #289 real-data baseline: the series whose declared prompts are thin/verbatim-reused.
import { scenes as distill7labsPt1Scenes } from "../content/anthropic-distillation-7labs/pt1/scene-data.mjs";
import { scenes as distill7labsPt2Scenes } from "../content/anthropic-distillation-7labs/pt2/scene-data.mjs";
import { scenes as distill7labsPt3Scenes } from "../content/anthropic-distillation-7labs/pt3/scene-data.mjs";
import { scenes as distill7labsPt4Scenes } from "../content/anthropic-distillation-7labs/pt4/scene-data.mjs";

const distill7labsAll = [
  ...distill7labsPt1Scenes,
  ...distill7labsPt2Scenes,
  ...distill7labsPt3Scenes,
  ...distill7labsPt4Scenes,
];

// ── Mock scene data ──

const validScenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    voiceover: "A leaked memo reveals DeepSeek paused its 1.4 billion dollar round.",
    texts: { hookText: "DEEPSEEK PAUSED", revealText: "$1.4B ROUNDD" },
    // #299: a hook must bind curated media (or waive it). This fixture is the
    // clean manual binding, so unrelated aggregate assertions stay untouched.
    media: {
      type: "image",
      path: "assets/bg.jpg",
      fit: "cover",
      overlay: 0.5,
      source: "test",
    },
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

  // #762: every real pack writes meta.dataPoints as string[], so the pass
  // branch must read that schema instead of dead `dp.value` lookups.
  it("passes when the CTA echoes a number from a string[] dataPoints entry (#762)", () => {
    const scenes = [
      { id: 1, voiceover: "Unitree raised 629 million dollars." },
      { id: 2, voiceover: "Some context." },
      { id: 3, voiceover: "Remember that 629 million? Follow for more." },
    ];
    const meta = { dataPoints: ["$629M Series C at a $4.3B valuation"] };
    expect(checkLoopClose(scenes, meta)[0].level).toBe("pass");
  });

  it("passes when the CTA spells out a number that dataPoints record as digits (#762)", () => {
    const scenes = [
      { id: 1, voiceover: "China's DeepSeek just beat GPT-5.6 on nine of eleven benchmarks." },
      { id: 2, voiceover: "Same family, same endpoint, same price." },
      {
        id: 3,
        voiceover: "Follow China AI News. Nine of eleven, and the fine print on every score.",
      },
    ];
    const meta = {
      dataPoints: [
        "Official benchmark scores: HLE 42.6 vs 36.8; Terminal-Bench 4.0 42.3 vs 31.2 (all 11 higher)",
      ],
    };
    expect(checkLoopClose(scenes, meta)[0].level).toBe("pass");
  });

  it("matches a spelled scale word against a digit data point (#762 review)", () => {
    const scenes = [
      { id: 1, voiceover: "The cluster has 20,000 GPUs." },
      { id: 2, voiceover: "Some context." },
      { id: 3, voiceover: "Twenty thousand GPUs, and the gap to frontier. Follow for more." },
    ];
    const meta = { dataPoints: ["20,000 GPUs (need 200K for frontier)"] };
    expect(checkLoopClose(scenes, meta)[0].level).toBe("pass");
  });

  it("matches a spelled decimal and scale word against a suffixed data point (#762 review)", () => {
    const scenes = [
      { id: 1, voiceover: "Unitree raised 629 million dollars." },
      { id: 2, voiceover: "Some context." },
      { id: 3, voiceover: "A four point three billion valuation, remember? Follow for more." },
    ];
    const meta = { dataPoints: ["$629M Series C at a $4.3B valuation"] };
    expect(checkLoopClose(scenes, meta)[0].level).toBe("pass");
  });

  it("does not pass on a shared calendar date alone (#762 review follow-up)", () => {
    const scenes = [
      { id: 1, voiceover: "DeepSeek opened a test on Sep 8." },
      { id: 2, voiceover: "Some context." },
      { id: 3, voiceover: "A temporary test ending September 8. Follow for more." },
    ];
    const meta = { dataPoints: ["V4.1 Flash internal test opened Sep 8, 2026"] };
    expect(checkLoopClose(scenes, meta)[0].level).toBe("warn");
  });

  it("warns when no number from string[] dataPoints reaches the CTA (#762)", () => {
    const scenes = [
      { id: 1, voiceover: "Unitree raised 629 million dollars." },
      { id: 2, voiceover: "Some context." },
      { id: 3, voiceover: "Follow for more." },
    ];
    const meta = { dataPoints: ["$629M Series C", "20K GPUs (need 200K for frontier)"] };
    expect(checkLoopClose(scenes, meta)[0].level).toBe("warn");
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

  it("matches on word boundaries, so 'illegal' no longer satisfies 'legal' (#763)", () => {
    const scenes = [
      {
        id: 1,
        voiceover: "ByteDance says the practice was illegal.",
        texts: { label: "ILLEGAL PRACTICE" },
      },
    ];
    const results = checkSemanticConsistency(scenes);
    expect(results[0].level).toBe("pass");
  });

  it("does not flag 'up'/'down' without entity scope (#763)", () => {
    const scenes = [
      {
        id: 1,
        voiceover: "Robotaxi shipments are up 3% while unit costs go down.",
        texts: { action: "COSTS DOWN" },
      },
    ];
    const results = checkSemanticConsistency(scenes);
    expect(results[0].level).toBe("pass");
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

// ── checkLayoutField (#763: only narrative reads `layout`) ──

describe("checkLayoutField", () => {
  const layoutRow = (scenes, id) =>
    [...runAllSceneDataChecks(scenes).pass, ...runAllSceneDataChecks(scenes).fail].find(
      (r) => r.check === `Scene ${id} layout field`,
    );

  it("fails a narrative scene without layout (it picks the text-slot variant)", () => {
    const row = layoutRow([{ id: 2, visualType: "narrative", texts: {} }], 2);
    expect(row.level).toBe("fail");
  });

  it("does not require layout on a forced-layout template", () => {
    const row = layoutRow([{ id: 3, visualType: "info-card", texts: {} }], 3);
    expect(row.level).toBe("pass");
    expect(row.detail).toContain("not required");
  });

  it("does not fail an invalid layout on a template that ignores the value", () => {
    const results = runAllSceneDataChecks([
      { id: 4, visualType: "data", layout: "media-overlay", texts: {} },
    ]);
    expect(results.fail.map((r) => r.check)).not.toContain("Scene 4 layout field");
  });

  it("still accepts a valid narrative layout", () => {
    const row = layoutRow(
      [{ id: 5, visualType: "narrative", layout: "media-split", texts: {} }],
      5,
    );
    expect(row.level).toBe("pass");
  });
});

// ── runAllSceneDataChecks ──

describe("runAllSceneDataChecks", () => {
  it("returns { pass, warn, fail, editorial } arrays", () => {
    const results = runAllSceneDataChecks(validScenes, validSeriesMeta);
    expect(results).toHaveProperty("pass");
    expect(results).toHaveProperty("warn");
    expect(results).toHaveProperty("fail");
    expect(results).toHaveProperty("editorial");
    expect(Array.isArray(results.pass)).toBe(true);
    expect(Array.isArray(results.warn)).toBe(true);
    expect(Array.isArray(results.fail)).toBe(true);
    expect(Array.isArray(results.editorial)).toBe(true);
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

  it("includes checkNoGreeting in the editorial bucket (#763)", () => {
    const results = runAllSceneDataChecks(validScenes, validSeriesMeta);
    const greetingCheck = results.editorial.find((r) => r.check.toLowerCase().includes("greeting"));
    expect(greetingCheck).toBeDefined();
    expect(greetingCheck.level).toBe("advisory");
    expect(results.pass.concat(results.warn, results.fail)).not.toContain(greetingCheck);
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

  it("catches AI vocabulary (editorial, #763)", () => {
    const badScenes = [
      { ...validScenes[0], voiceover: "They leverage AI." },
      ...validScenes.slice(1),
    ];
    const results = runAllSceneDataChecks(badScenes, null);
    const aiAdvice = results.editorial.find(
      (f) => f.check.includes("blacklist") && f.severity === "fail",
    );
    expect(aiAdvice).toBeDefined();
    expect(results.fail.find((f) => f.check.includes("blacklist"))).toBeUndefined();
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

  it("catches dead closer (editorial, #763)", () => {
    const badScenes = [
      ...validScenes.slice(0, -1),
      { ...validScenes[5], voiceover: "Thanks for watching!" },
    ];
    const results = runAllSceneDataChecks(badScenes, null);
    const closerAdvice = results.editorial.find(
      (f) => (f.check.includes("closer") || f.check.includes("dead")) && f.severity === "fail",
    );
    expect(closerAdvice).toBeDefined();
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

// ── checkHookMediaContract (#299: hook media is curated, not sourced) ──

describe("checkHookMediaContract", () => {
  const hook = (over = {}) => ({
    id: 1,
    visualType: "hook",
    texts: { hookText: "TEST" },
    ...over,
  });
  const cleanMedia = {
    type: "image",
    path: "assets/bg.jpg",
    fit: "cover",
    overlay: 0.5,
    source: "official page",
  };

  it("passes when there is no hook scene", () => {
    const scenes = [{ id: 1, visualType: "narrative", voiceover: "test" }];
    const result = checkHookMediaContract(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("pass");
  });

  it("passes when the hook binds curated media with cover fit and attribution", () => {
    const result = checkHookMediaContract([hook({ media: cleanMedia })]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("pass");
    expect(result[0].category).toBe("Hook");
    expect(result[0].check).toContain("media");
  });

  it("FAILS when the hook has no media and no mediaStrategy (default asset)", () => {
    const result = checkHookMediaContract([hook()]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("fail");
    expect(result[0].category).toBe("Hook");
    expect(result[0].check).toContain("media");
    expect(result[0].fix).toContain("media: null");
    // Hooks are structurally skipped by sourcing — the old fix pointed at a
    // mechanism that can never fill this gap.
    expect(result[0].fix).not.toContain("asset-sourcer");
    expect(result[0].detail).toContain("manual curation");
  });

  it("FAILS when the hook declares mediaStrategy asset and no media", () => {
    const result = checkHookMediaContract([hook({ mediaStrategy: "asset" })]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("fail");
  });

  it("WARNS for explicit media:null (deliberate CSS-only hook)", () => {
    const result = checkHookMediaContract([hook({ media: null })]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
    expect(result[0].detail).toContain("media:null");
    expect(result[0].detail).toContain("CSS-only");
  });

  it("distinguishes explicit media:null from an absent media key", () => {
    const waived = checkHookMediaContract([hook({ media: null })])[0];
    const absent = checkHookMediaContract([hook()])[0];
    expect(waived.level).toBe("warn");
    expect(absent.level).toBe("fail");
  });

  for (const strategy of ["b-roll", "asset-then-broll", "ai-image", "asset-then-ai-image"]) {
    it(`WARNS without blocking when media will be generated (${strategy})`, () => {
      const result = checkHookMediaContract([hook({ mediaStrategy: strategy })]);
      expect(result).toHaveLength(1);
      expect(result[0].level).toBe("warn");
      expect(result[0].detail).toContain("generated");
      expect(result[0].detail).toContain("final media gate");
    });
  }

  // 2026-10-29: "contain" moved from fail to pass. The old rule rejected it
  // for letterboxing, but cover fills the frame by CUTTING it — for a 16:9
  // source in the hook's 1080x1920 box that discards 68.4% of the picture,
  // and the user rejected the crop outright ("这个是我不能接受的"). A
  // letterboxed hook that matches a letterboxed body is the coherent
  // alternative; a cover hook in front of a contain body switches composition
  // at t=3.4s, which is worse than either choice alone.
  it("PASSES hook media using contain (letterbox, full picture preserved)", () => {
    const result = checkHookMediaContract([hook({ media: { ...cleanMedia, fit: "contain" } })]);
    expect(result.filter((r) => r.level === "fail")).toHaveLength(0);
  });

  it("FAILS hook media whose fit is neither cover nor contain", () => {
    for (const fit of ["fill", "none", "cvr"]) {
      const result = checkHookMediaContract([hook({ media: { ...cleanMedia, fit } })]);
      const fails = result.filter((r) => r.level === "fail");
      expect(fails, `fit ${fit}`).toHaveLength(1);
      expect(fails[0].check).toContain("fit");
      expect(fails[0].detail).toContain(fit);
    }
  });

  it("PASSES when fit is omitted (the renderer defaults to cover)", () => {
    const media = { ...cleanMedia };
    delete media.fit;
    const result = checkHookMediaContract([hook({ media })]);
    expect(result.filter((r) => r.level === "fail")).toHaveLength(0);
    expect(result[0].level).toBe("pass");
  });

  it("FAILS a deprecated mediaOptOut hook instead of promising generation", () => {
    // b-roll planScenes skips opt-outs, so the old "will be generated" warning
    // was a lie: this combination can never receive media.
    for (const over of [{ mediaOptOut: true }, { mediaOptOut: true, mediaStrategy: "b-roll" }]) {
      const result = checkHookMediaContract([hook(over)]);
      expect(result).toHaveLength(1);
      expect(result[0].level).toBe("fail");
      expect(result[0].fix).toContain("mediaOptOut");
      expect(result[0].fix).toContain("deprecated");
      expect(result[0].fix).toContain("media: null");
      expect(result[0].detail).not.toContain("will be generated");
    }
  });

  it("WARNS when the explicit overlay is outside 0.4-0.9", () => {
    for (const overlay of [0.2, 0.39, 0.91, 1]) {
      const result = checkHookMediaContract([hook({ media: { ...cleanMedia, overlay } })]);
      const warns = result.filter((r) => r.level === "warn");
      expect(warns, `overlay ${overlay}`).toHaveLength(1);
      expect(warns[0].check).toContain("overlay");
    }
  });

  it("accepts the inclusive overlay bounds 0.4 and 0.9 (and a missing overlay)", () => {
    for (const overlay of [0.4, 0.9, undefined]) {
      const media = { ...cleanMedia };
      if (overlay === undefined) delete media.overlay;
      const result = checkHookMediaContract([hook({ media })]);
      expect(result, `overlay ${overlay}`).toHaveLength(1);
      expect(result[0].level).toBe("pass");
    }
  });

  it("WARNS when manually bound media has no source", () => {
    const media = { ...cleanMedia };
    delete media.source;
    const result = checkHookMediaContract([hook({ media })]);
    const warns = result.filter((r) => r.level === "warn");
    expect(warns).toHaveLength(1);
    expect(warns[0].check).toContain("source");
  });

  it("is included in runAllSceneDataChecks results (fail bucket for an unbound hook)", () => {
    const scenes = [hook()];
    const results = runAllSceneDataChecks(scenes, null);
    const mediaFail = results.fail.find((f) => f.check.includes("Hook media"));
    expect(mediaFail).toBeDefined();
  });

  it("owns hook media warnings: no narrative-coverage double warning for scene 1", () => {
    const coveredNarrative = {
      id: 2,
      visualType: "narrative",
      layout: "media-overlay",
      media: { type: "image", path: "assets/x.jpg" },
    };
    const results = runAllSceneDataChecks([hook(), coveredNarrative], null);
    expect(results.fail.find((f) => f.check === "Hook media background")).toBeDefined();
    expect(results.warn.find((w) => w.check === "Narrative scene media coverage")).toBeUndefined();

    // A media-less narrative still reports, but the hook is not listed.
    const gap = runAllSceneDataChecks([hook(), { ...coveredNarrative, media: undefined }], null);
    const mediaWarn = gap.warn.find((w) => w.check === "Narrative scene media coverage");
    expect(mediaWarn.detail).toContain("[2]");
    expect(mediaWarn.detail).not.toContain("[1");
  });

  it("does not block a generation-capable hook at preflight (aggregate)", () => {
    const results = runAllSceneDataChecks(
      [hook({ mediaStrategy: "asset-then-broll", aiVideo: { prompt: "SUBJECT: x" } })],
      null,
    );
    expect(results.fail.find((f) => f.check.includes("Hook media"))).toBeUndefined();
    expect(results.warn.find((w) => w.check.includes("Hook media"))).toBeDefined();
  });

  it("accepts exactly the fits media-bg.mjs validates", () => {
    // Two hand-maintained lists, one contract: hook-media.mjs cannot import
    // VALID_FITS (it is documented import-free), so this is what stops them
    // drifting. They already drifted once — the renderer took `contain` while
    // this gate still refused it — which is the bug the contract change fixed.
    expect([...HOOK_SUPPORTED_FITS].sort()).toEqual([...VALID_FITS].sort());
  });

  it("gates on membership, so every unsupported fit is refused", () => {
    for (const fit of ["fill", "none", "Contain", ""]) {
      const failures = checkHookMediaContract([hook({ media: { ...cleanMedia, fit } })]);
      const fitFailure = failures.find((f) => f.check.includes("Hook media fit"));
      expect(fitFailure?.detail, `fit ${JSON.stringify(fit)} should be refused`).toContain(
        `"${fit}"`,
      );
    }
  });
});

// ── checkNarrativeMediaWarning (#760: intent-aware, shares the sourcer predicate) ──

describe("narrative scene media coverage warning (#760)", () => {
  const scene = (over = {}) => ({
    id: 2,
    visualType: "narrative",
    layout: "media-overlay",
    voiceover: "test",
    ...over,
  });
  const coverageWarn = (scenes) =>
    runAllSceneDataChecks(scenes, null).warn.find(
      (w) => w.check === "Narrative scene media coverage",
    );

  it("does not warn for explicit media:null (deliberate CSS-only)", () => {
    expect(coverageWarn([scene({ media: null })])).toBeUndefined();
  });

  it("does not warn while Step 1.5 sourcing is still pending (assetNeed declared)", () => {
    expect(coverageWarn([scene({ assetNeed: "official benchmark table" })])).toBeUndefined();
  });

  it("does not warn for CSS-only layouts without assetNeed", () => {
    expect(coverageWarn([scene({ layout: "stacked-cards" })])).toBeUndefined();
    expect(coverageWarn([scene({ layout: "hero-center" })])).toBeUndefined();
  });

  for (const strategy of ["b-roll", "asset-then-broll", "ai-image", "asset-then-ai-image"]) {
    it(`does not warn when the scene generates media (${strategy})`, () => {
      const generated = scene({
        mediaStrategy: strategy,
        aiVideo: { prompt: "SUBJECT: x" },
        aiImage: { prompt: "SUBJECT: x" },
      });
      expect(coverageWarn([generated])).toBeUndefined();
    });
  }

  it("warns when a sourcing-eligible scene has no usable claim text", () => {
    const warn = coverageWarn([scene()]);
    expect(warn).toBeDefined();
    expect(warn.detail).toContain("[2]");
    expect(warn.fix).toContain("assetNeed");
    expect(warn.fix).toContain("media: null");
    // The old fix sent agents to asset-sourcer (evidence gap → generic stock)
    // and recommended the deprecated mediaOptOut flag.
    expect(warn.fix).not.toContain("mediaOptOut");
    expect(warn.fix).not.toContain("Run asset-sourcer");
  });

  it("does not warn for a media-less scene whose voiceover yields a claim (#354)", () => {
    expect(
      coverageWarn([
        scene({ voiceover: "Unitree's humanoid robot walks across a factory floor." }),
      ]),
    ).toBeUndefined();
  });

  it("warns when the voiceover has no searchable content words (#354)", () => {
    // "test" is a single generic token — claimToKeywords yields no phrase, so
    // sourcing cannot query for this scene.
    expect(coverageWarn([scene({ voiceover: "test" })])).toBeDefined();
  });
});

// ── checkSearchHintsSchema (#354: a typo must not silently mean "no hints") ──

describe("searchHints schema (#354)", () => {
  const scene = (over = {}) => ({
    id: 2,
    visualType: "narrative",
    layout: "media-overlay",
    voiceover: "A humanoid robot walks.",
    ...over,
  });
  const hintFails = (scenes) =>
    runAllSceneDataChecks(scenes, null).fail.filter((f) =>
      f.check.startsWith("Search hints schema"),
    );

  it("accepts usable phrase lists, including in-order specific→general hints", () => {
    expect(
      hintFails([scene({ searchHints: ["unitree h1 humanoid robot", "humanoid robot factory"] })]),
    ).toEqual([]);
  });

  it("fails a bare string instead of treating it as no hints", () => {
    const [fail] = hintFails([scene({ searchHints: "humanoid robot factory" })]);
    expect(fail.level).toBe("fail");
    expect(fail.check).toContain("Scene 2");
  });

  it("fails style-only phrases that the sanitiser would drop", () => {
    const [fail] = hintFails([scene({ searchHints: ["cinematic close-up"] })]);
    expect(fail.level).toBe("fail");
  });

  it("fails searchHints on a scene without a claim path (declared but no effect)", () => {
    const [hookFail] = hintFails([
      scene({ visualType: "hook", searchHints: ["humanoid robot factory"] }),
    ]);
    expect(hookFail.check).toContain("Scene 2 has a claim path");
    const [cssFail] = hintFails([
      scene({ layout: "stacked-cards", searchHints: ["humanoid robot factory"] }),
    ]);
    expect(cssFail.check).toContain("Scene 2 has a claim path");
    const [boundFail] = hintFails([
      scene({
        media: { type: "image", path: "assets/x.jpg" },
        searchHints: ["humanoid robot factory"],
      }),
    ]);
    expect(boundFail.check).toContain("Scene 2 has a claim path");
    const [generationFail] = hintFails([
      scene({ mediaStrategy: "b-roll", searchHints: ["humanoid robot factory"] }),
    ]);
    expect(generationFail.check).toContain("Scene 2 has a claim path");
  });

  it("fails a misspelled key instead of silently ignoring it", () => {
    const [fail] = hintFails([scene({ searchHint: ["humanoid robot factory"] })]);
    expect(fail.check).toContain("spelled searchHints");
    expect(fail.detail).toContain("searchHint");
  });

  it("fails empty and over-long lists", () => {
    expect(hintFails([scene({ searchHints: [] })])).toHaveLength(1);
    expect(
      hintFails([
        scene({
          searchHints: ["a robot arm", "b robot arm", "c robot arm", "d robot arm", "e robot arm"],
        }),
      ]),
    ).toHaveLength(1);
  });
});

// ── checkLayoutMediaRouting (#761: text-first layouts cannot carry evidence) ──

describe("checkLayoutMediaRouting (#761)", () => {
  const narrative = (over = {}) => ({
    id: 2,
    visualType: "narrative",
    layout: "stacked-cards",
    voiceover: "test",
    ...over,
  });
  const contrast = (over = {}) => ({
    id: 4,
    visualType: "contrast",
    layout: "hero-center",
    voiceover: "test",
    ...over,
  });
  const findings = (scenes) => checkLayoutMediaRouting(scenes);

  it("fails assetNeed on narrative stacked-cards", () => {
    const [fail] = findings([narrative({ assetNeed: "benchmark table screenshot" })]);
    expect(fail.level).toBe("fail");
    expect(fail.check).toBe("Text-first layout media routing");
    expect(fail.detail).toContain("Scene(s) 2 ");
    expect(fail.fix).toContain("media-bottom-bar");
  });

  it("fails assetNeed on contrast (it always renders hero-center)", () => {
    // The declared layout is irrelevant — resolveRenderLayout forces
    // hero-center for every non-narrative template.
    const [fail] = findings([contrast({ layout: "media-split", assetNeed: "official chart" })]);
    expect(fail.level).toBe("fail");
    expect(fail.detail).toContain("Scene(s) 4 ");
  });

  it("fails evidence media bound on stacked-cards", () => {
    const [fail] = findings([
      narrative({
        media: { type: "image", path: "assets/table.png", evidence: true, source: "SRC" },
      }),
    ]);
    expect(fail.level).toBe("fail");
    expect(fail.detail).toContain("evidence media");
  });

  it("passes ambient media on stacked-cards (no assetNeed, no evidence flag)", () => {
    expect(
      findings([
        narrative({
          media: { type: "image", path: "assets/dc.jpg", source: "PEXELS", overlay: 0.7 },
        }),
      ]),
    ).toEqual([]);
  });

  it("passes whitespace-only assetNeed (no intent declared)", () => {
    expect(findings([narrative({ media: null, assetNeed: "   " })])).toEqual([]);
  });

  it("does not waive on media: null while assetNeed still declares the need", () => {
    // The fix's third option is "drop assetNeed AND set media: null" — the
    // null alone leaves the contradiction (ask for a picture, promise none).
    const [fail] = findings([narrative({ media: null, assetNeed: "official chart" })]);
    expect(fail.level).toBe("fail");
  });

  it("passes fullscreen media mode (FullscreenMedia bypasses the layout)", () => {
    // ShortVideo routes media.mode:"fullscreen" to FullscreenMedia before the
    // layout dispatch, so the evidence fills the frame and stays readable.
    expect(
      findings([
        narrative({
          assetNeed: "benchmark table screenshot",
          media: {
            type: "image",
            path: "assets/table.png",
            mode: "fullscreen",
            evidence: true,
            source: "SRC",
          },
        }),
        contrast({
          assetNeed: "official chart",
          media: { type: "image", path: "assets/chart.png", mode: "fullscreen", source: "SRC" },
        }),
      ]),
    ).toEqual([]);
  });

  it("does not touch other hero-center templates that do render media", () => {
    // context / info-card use hero-center and render MediaBackground — their
    // assetNeed is legitimate (#761 is scoped to the two layouts that cannot).
    expect(
      findings([
        { id: 6, visualType: "context", layout: "hero-center", assetNeed: "company logo" },
        { id: 7, visualType: "info-card", layout: "hero-center", assetNeed: "product shot" },
      ]),
    ).toEqual([]);
  });

  it("is wired into runAllSceneDataChecks", () => {
    const { fail } = runAllSceneDataChecks([narrative({ assetNeed: "official chart" })], null);
    expect(fail.some((f) => f.check === "Text-first layout media routing")).toBe(true);
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

// ── B-roll prompt dimensions (spec S1-S20; NEGATIVE coverage moved to
//    code injection in #166 layer 2 — lib/b-roll/prompt-injection.mjs — so
//    this check owns the numeral sweep plus the declared-prompt quality gate
//    added by #289: thin-write and cross-scene verbatim reuse) ──

// Covers all three NEGATIVE groups and carries no digits. States both a
// framing and a camera move, so the #289 thin-write sweep stays silent.
const FULL_NEGATIVE_PROMPT =
  "One tall glowing bar shrinking beside a short one, dark reflective studio floor, " +
  "cinematic slow push-in, high detail, no text, no watermark, no hands";

// #289: a stated camera move keeps each numeral-focused fixture out of the
// thin-write sweep, so those cases still isolate the numeral dimension.
const CINEMATIC_CLAUSE = ", cinematic slow push-in";

describe("checkBrollPromptDimensions", () => {
  const broll = (prompt, overrides = {}) => ({
    id: 5,
    visualType: "narrative",
    voiceover: "Training cost just one ninth of the old flagship.",
    mediaStrategy: "b-roll",
    aiVideo: { prompt },
    ...overrides,
  });

  it("S1/S4: stays silent when the prompt carries no Arabic numerals", () => {
    expect(checkBrollPromptDimensions([broll(FULL_NEGATIVE_PROMPT)])).toEqual([]);
  });

  it("#166: a prompt without any NEGATIVE clause is clean — the constants are injected", () => {
    expect(
      checkBrollPromptDimensions([
        broll(`A glowing bar shrinking slowly${CINEMATIC_CLAUSE}, high detail`),
      ]),
    ).toEqual([]);
  });

  it("S21: never fails, so preflight keeps exiting 0", () => {
    const result = checkBrollPromptDimensions(qwenScenes);
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
      broll(`A glowing bar at 3 meters wide${CINEMATIC_CLAUSE}`, { id: 2 }),
      broll(`A flowing stream of data, 8.6 times faster${CINEMATIC_CLAUSE}`, { id: 7 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].detail).toContain("2");
    expect(result[1].detail).toContain("7");
  });

  it("S14: warns when the prompt carries an Arabic numeral", () => {
    const result = checkBrollPromptDimensions([
      broll(
        `A bar chart showing 8.6 times throughput, no text, no hands, no watermark${CINEMATIC_CLAUSE}`,
      ),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toContain("8.6");
  });

  it("S15: still warns on an element count, and the fix explains both readings", () => {
    const result = checkBrollPromptDimensions([
      broll(
        `Three glowing layers, say 3 layers, no text, no hands, no watermark${CINEMATIC_CLAUSE}`,
      ),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toContain("3");
    expect(result[0].fix).toContain("texts");
    expect(result[0].fix.toLowerCase()).toContain("count");
  });

  it("S16: ignores spelled-out numbers", () => {
    const result = checkBrollPromptDimensions([
      broll(
        `Two parallel lanes of glowing data, no text, no hands, no watermark${CINEMATIC_CLAUSE}`,
      ),
    ]);
    expect(result).toEqual([]);
  });

  it("S17: one warning per scene even with multiple numerals", () => {
    const result = checkBrollPromptDimensions([
      broll(`A bar shrinking to 1/9 of its height, high detail${CINEMATIC_CLAUSE}`),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toContain("1");
  });

  it("S20: pins the real qwen4-preview prompts", () => {
    // #166 layer 2: the hand-written NEGATIVE clauses were removed from the
    // qwen4-preview prompts — the constants are injected at generation time.
    // None of the three prompts carries an Arabic numeral, so the sweep is
    // silent on today's state.
    expect(checkBrollPromptDimensions(qwenScenes)).toEqual([]);
  });

  it("S19: is wired into runAllSceneDataChecks", () => {
    const result = runAllSceneDataChecks(
      [broll(`A glowing bar at 3 meters wide${CINEMATIC_CLAUSE}`)],
      null,
    );
    expect(result.warn.filter((r) => r.check === "B-roll prompt dimensions")).toHaveLength(1);
  });

  // ── #289 declared-prompt quality gate ──

  it("#289 thin-write: warns when a prompt names no framing and no camera move", () => {
    const result = checkBrollPromptDimensions([
      broll("data visualization dashboard, digital analytics, tech interface", { id: 3 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
    expect(result[0].detail).toContain("3");
    expect(result[0].detail.toLowerCase()).toContain("camera");
    expect(result[0].detail.toLowerCase()).toContain("heuristic");
    expect(result[0].fix).toContain("video-script-writing-guide.md");
  });

  it("#289 thin-write: a lighting word alone does not rescue a prompt (cited example)", () => {
    // The #289-cited debt: a lighting word ("glowing") plus no shot direction.
    const CITED = "futuristic AI data center with glowing server racks, cinematic vertical";
    expect(Object.values(BROLL_SHOT_SIGNALS).some((re) => re.test(CITED))).toBe(false);
    const result = checkBrollPromptDimensions([broll(CITED, { id: 14 })]);
    expect(result).toHaveLength(1);
    expect(result[0].detail.toLowerCase()).toContain("thin write");
  });

  it("#289 thin-write: stays silent once a framing or a camera move is stated", () => {
    expect(
      checkBrollPromptDimensions([
        broll("medium shot of a dim server hall, neon backlit racks, high detail"),
      ]),
    ).toEqual([]);
    expect(
      checkBrollPromptDimensions([broll("deep blue palette, slow dolly push-in, high detail")]),
    ).toEqual([]);
  });

  it("#289 reuse: warns per scene when a declared prompt is verbatim-reused", () => {
    const result = checkBrollPromptDimensions([
      broll(FULL_NEGATIVE_PROMPT, { id: 14 }),
      broll(FULL_NEGATIVE_PROMPT, { id: 16 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.level === "warn")).toBe(true);
    expect(result[0].detail).toContain("14");
    expect(result[0].detail).toContain("16");
    expect(result[0].detail.toLowerCase()).toContain("reuse");
  });

  it("#289 reuse: normalizes whitespace/case so near-duplicates still count", () => {
    const result = checkBrollPromptDimensions([
      broll("  Cinematic  slow push-in,  high detail ", { id: 2 }),
      broll("cinematic slow push-in, high detail", { id: 5 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].detail.toLowerCase()).toContain("reuse");
  });

  it("#289 real data: the anthropic-distillation-7labs debt surfaces as reuse + thin warns", () => {
    const result = checkBrollPromptDimensions(distill7labsAll);
    expect(distill7labsAll).toHaveLength(40);
    expect(result.every((r) => r.level === "warn")).toBe(true);
    expect(result.some((r) => r.detail.toLowerCase().includes("reuse"))).toBe(true);
    expect(result.some((r) => r.detail.toLowerCase().includes("thin write"))).toBe(true);
  });
});

// ─── #191: mediaOptOut deprecation + explicit-null-on-media-layout ───

describe("checkMediaOptOutDeprecation", () => {
  it("warns on every scene still setting mediaOptOut", () => {
    const result = checkMediaOptOutDeprecation([
      { id: 1, visualType: "narrative", layout: "stacked-cards", mediaOptOut: true },
      { id: 2, visualType: "hook", layout: "hero-center", mediaOptOut: true },
      { id: 3, visualType: "narrative", layout: "media-overlay" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
    expect(result[0].detail).toContain("1, 2");
    expect(result[0].detail).toContain("deprecated");
  });

  it("warns when media:null sits on a media-dependent layout (empty band)", () => {
    const result = checkMediaOptOutDeprecation([
      { id: 5, visualType: "narrative", layout: "media-split", media: null },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
    expect(result[0].detail).toContain("5");
    expect(result[0].detail).toContain("media-dependent");
  });

  it("no findings for clean scenes", () => {
    expect(
      checkMediaOptOutDeprecation([{ id: 1, visualType: "narrative", layout: "media-overlay" }]),
    ).toEqual([]);
  });
});

// ─── ai-image strategy contract (#155: T2I static image generation) ───

describe("ai-image strategy (#155)", () => {
  const imageScene = (overrides = {}) => ({
    id: 11,
    visualType: "narrative",
    voiceover: "Every four layers, three compress history with Gated DeltaNet.",
    mediaStrategy: "ai-image",
    aiImage: {
      prompt: "abstract architecture diagram of memory channels, slow push-in, high detail",
    },
    ...overrides,
  });

  it("MEDIA_STRATEGIES exposes the image tiers", () => {
    expect(MEDIA_STRATEGIES).toContain("ai-image");
    expect(MEDIA_STRATEGIES).toContain("asset-then-ai-image");
  });

  it("passes a well-formed ai-image scene", () => {
    const result = checkMediaStrategyContract([imageScene()]);
    expect(result[0].level).toBe("pass");
  });

  it("fails an ai-image scene with no aiImage.prompt (same semantics as aiVideo)", () => {
    const result = checkMediaStrategyContract([imageScene({ aiImage: undefined })]);
    expect(result[0].level).toBe("fail");
    expect(result[0].check).toBe("B-roll strategy contract");
    expect(result[0].detail).toContain("11");
    expect(result[0].detail).toContain("aiImage.prompt");
  });

  it("fails a blank aiImage.prompt", () => {
    const result = checkMediaStrategyContract([imageScene({ aiImage: { prompt: "   " } })]);
    expect(result[0].level).toBe("fail");
  });

  it("applies the same prompt requirement to asset-then-ai-image", () => {
    const result = checkMediaStrategyContract([
      imageScene({ mediaStrategy: "asset-then-ai-image", aiImage: undefined }),
    ]);
    expect(result[0].level).toBe("fail");
  });

  it("passes a well-formed asset-then-ai-image scene", () => {
    const result = checkMediaStrategyContract([
      imageScene({ mediaStrategy: "asset-then-ai-image" }),
    ]);
    expect(result[0].level).toBe("pass");
  });

  it("warns (not fails) on mediaOptOut with an ai-image strategy", () => {
    const result = checkMediaStrategyContract([
      imageScene({ mediaOptOut: true, aiImage: undefined }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
  });

  it("rejects an unknown image-ish strategy value", () => {
    const result = checkMediaStrategyContract([imageScene({ mediaStrategy: "aiimage" })]);
    expect(result[0].level).toBe("fail");
    expect(result[0].fix).toContain("ai-image");
  });

  it("the numeral sweep reads aiImage.prompt on image strategies", () => {
    const result = checkBrollPromptDimensions([
      imageScene({
        aiImage: { prompt: "A flow diagram with 8.6 times throughput, no text, slow push-in" },
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("warn");
    expect(result[0].detail).toContain("8.6");
  });

  it("the numeral sweep stays silent for a clean aiImage.prompt", () => {
    expect(checkBrollPromptDimensions([imageScene()])).toEqual([]);
  });

  it("the numeral sweep ignores an aiVideo.prompt on an ai-image scene", () => {
    expect(
      checkBrollPromptDimensions([
        imageScene({
          aiVideo: { prompt: "bars at 3 meters wide" },
          aiImage: { prompt: "clean, slow push-in" },
        }),
      ]),
    ).toEqual([]);
  });
});

// ── TTS instruct coverage (#270, absorbing #273 P1.3) ──
// A style with no instruct entry used to reach the Kaggle kernel with no
// instruct_text (→ 'CosyVoice3' object has no attribute 'inference'), and the
// engines that did have a lookup carried drifting pre-#234 copies. Both are
// decidable pre-render, so preflight fails instead of spending GPU time.
describe("checkInstructCoverage (#270)", () => {
  const scene = (over = {}) => ({
    id: 1,
    visualType: "narrative",
    layout: "hero-center",
    voiceover: "DeepSeek shipped a 1.4B parameter model.",
    ...over,
  });

  it("passes for every visualType the renderer dispatches on", () => {
    for (const style of [
      "hook",
      "cta",
      "narrative",
      "data",
      "info-card",
      "quote",
      "context",
      "contrast",
      "stat-reveal",
    ]) {
      const results = checkInstructCoverage([scene({ visualType: style })]);
      expect(results.map((r) => r.level)).toEqual(["pass"]);
    }
  });

  it("fails a style that has no entry in the single source", () => {
    const results = checkInstructCoverage([scene({ visualType: "benchmark" })]);
    expect(results).toHaveLength(1);
    expect(results[0].level).toBe("fail");
    expect(results[0].check).toBe("Scene 1 TTS instruct style resolves");
    expect(results[0].detail).toContain('"benchmark"');
    expect(results[0].fix).toContain("INSTRUCT_STANDARD.styles");
  });

  it("resolves through refStyle first, matching the engine adapters", () => {
    expect(checkInstructCoverage([scene({ visualType: "narrative", refStyle: "data" })])).toEqual([
      {
        level: "pass",
        category: "TTS",
        check: "TTS instruct coverage (single source in lib/tts/instruct.mjs)",
      },
    ]);
    expect(
      checkInstructCoverage([scene({ visualType: "data", refStyle: "shouty" })])[0].detail,
    ).toContain('"shouty"');
  });

  it("fails a scene with no style at all", () => {
    const results = checkInstructCoverage([{ id: 7, voiceover: "orphan scene" }]);
    expect(results[0].level).toBe("fail");
    expect(results[0].detail).toContain("neither refStyle nor visualType");
  });

  it("fails a hand-written instruct override that misses the standard", () => {
    const results = checkInstructCoverage([
      scene({ instruct: "Speak with a calm and measured tone, like a narrator." }),
    ]);
    expect(results[0].level).toBe("fail");
    expect(results[0].check).toBe("Scene 1 instruct override meets the 4D standard");
    expect(results[0].detail).toContain("missing_system_prefix");
    expect(results[0].detail).toContain("missing_accent_guidance");
  });

  it("accepts a compliant instruct override", () => {
    const results = checkInstructCoverage([
      scene({
        instruct:
          "You are a helpful assistant. You are a narrator. Speak in standard American English with a calm and steady tone.",
      }),
    ]);
    expect(results.map((r) => r.level)).toEqual(["pass"]);
  });

  it("is included in runAllSceneDataChecks results", () => {
    const results = runAllSceneDataChecks([scene({ visualType: "benchmark" })], null);
    expect(results.fail.some((r) => r.check === "Scene 1 TTS instruct style resolves")).toBe(true);
  });
});
