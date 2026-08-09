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
  runAllSceneDataChecks,
} from "../lib/scene-rules.mjs";
import { scenes as bytedanceScenes } from "../content/bytedance-distillation/scene-data.mjs";
import { scenes as deepseekScenes } from "../content/deepseek/scene-data.mjs";
import { scenes as restraintScenes } from "../content/restraint/pt1/scene-data.mjs";
import { scenes as restraintPt3Scenes } from "../content/restraint/pt3/scene-data.mjs";
import { scenes as pt1Scenes } from "../content/distillation/pt1/scene-data.mjs";
import { scenes as pt2Scenes } from "../content/distillation/pt2/scene-data.mjs";
import { scenes as pt3Scenes } from "../content/distillation/pt3/scene-data.mjs";

// ── Mock scene data ──

const validScenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover: "A leaked memo reveals DeepSeek paused its 1.4 billion dollar round.",
    texts: { hookText: "DEEPSEEK PAUSED", revealText: "$1.4B ROUNDD" },
  },
  {
    id: 2,
    name: "context",
    visualType: "context",
    voiceover: "Bloomberg reported the news first. Liang Wenfeng confirmed it.",
    texts: { line1: "BLOOMBERG EXCLUSIVE" },
  },
  {
    id: 3,
    name: "data",
    visualType: "data",
    voiceover: "China AI spending hit 47 billion in 2024.",
    texts: { stat: "$47B" },
  },
  {
    id: 4,
    name: "analysis",
    visualType: "contrast",
    voiceover: "DeepSeek chose open source. Others chose closed.",
    texts: { left: "OPEN", right: "CLOSED" },
  },
  {
    id: 5,
    name: "analysis2",
    visualType: "data",
    voiceover: "Tencent and Alibaba joined the race with rival models.",
    texts: { stat: "2X" },
  },
  {
    id: 6,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI news that matters.",
    texts: { action: "FOLLOW FOR MORE", line1: "CHINA AI NEWS" },
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
    expect(results[0].fix).toContain("hookScene");
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

// ── runAllSceneDataChecks aggregation (T1 guard contract) ──

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
});

// ── checkLoopClose ──

describe("checkLoopClose", () => {
  it("returns a result (warn level is acceptable)", () => {
    const results = checkLoopClose(validScenes);
    expect(results).toHaveLength(1);
    expect(["warn"]).toContain(results[0].level);
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
