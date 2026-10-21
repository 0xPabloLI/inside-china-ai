/**
 * Tests for TTS Quality Gate & Self-Healing Loop (#225, #230).
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  cleanText,
  tokenize,
  extractGuardedTokens,
  computeTokenSimilarity,
  detectPhoneticConfusion,
  evaluateSceneTts,
  runTtsQualityGate,
  isWordInAsr,
  buildExpandedAsrTokenSet,
  classifyFailure,
  collectInstructWarnings,
  INSTRUCT_WARNING_PREFIX,
  MIN_ACCEPTABLE_WPM,
  FAILURE_CLASS,
  partitionGateFailures,
  infraBlockError,
} from "../lib/tts/quality-gate.mjs";
import { WPM_COMPENSATE_BELOW, MAX_TTS_SPEED } from "../lib/tts/pacing.mjs";
import { INSTRUCT_FORMAT, buildInstruct, createInstructResolver } from "../lib/tts/instruct.mjs";
import { writeFileSync, unlinkSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("TTS Quality Gate - Token & Linguistic Helpers", () => {
  it("cleans and tokenizes text properly", () => {
    const raw = "On September 8, DeepSeek announced V4.1 Flash testing! The ID: expires on 0910.";
    const cleaned = cleanText(raw);
    expect(cleaned).toContain(
      "on september 8 deepseek announced v4 1 flash testing the id expires on 0910",
    );

    const tokens = tokenize(raw);
    expect(tokens).toContain("september");
    expect(tokens).toContain("0910");
  });

  it("extracts critical tokens and tail boundary tokens", () => {
    const text = "The model ID literally says expires on September tenth.";
    const { criticalWords, tailWords } = extractGuardedTokens(text);

    expect(tailWords).toEqual(["september", "tenth"]);
    expect(criticalWords).toContain("september");
    expect(criticalWords).toContain("tenth");
  });

  it("computes token similarity accurately", () => {
    const tokensA = ["deepseek", "announced", "v4", "flash"];
    const tokensB = ["deepseek", "announced", "v4", "flash"];
    expect(computeTokenSimilarity(tokensA, tokensB)).toBe(1.0);

    const tokensC = ["deepseek", "announced"];
    expect(computeTokenSimilarity(tokensA, tokensC)).toBe(0.5);
  });

  it("detects phonetic confusion between [v] and [b]", () => {
    const expected = "DeepSeek just dropped V4.1 Flash.";
    const asrWithB = "DeepSeek just dropped B4.1 Flash.";
    const issues = detectPhoneticConfusion(expected, asrWithB);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("'V4' pronounced as 'B4'");
  });
});

describe("TTS Quality Gate - Audio & ASR Evaluation", () => {
  const dummyAudio = join(tmpdir(), "dummy-test-audio.wav");

  it("flags incomplete speech when critical date/number is swallowed (the 0910 bug)", async () => {
    writeFileSync(dummyAudio, "RIFFdummydata");

    const scene = {
      id: 2,
      voiceover: "The model ID literally says expires on 0910.",
      ttsText: "The model ID literally says expires on September tenth.",
    };

    // Mock ASR returning truncated audio missing "tenth"
    const mockTranscriber = vi.fn().mockResolvedValue({
      ok: true,
      segments: [{ text: "The model ID literally says expires on September." }],
    });

    const res = await evaluateSceneTts(scene, dummyAudio, 3.5, {
      transcriber: mockTranscriber,
    });

    expect(res.passed).toBe(false);
    expect(
      res.issues.some((i) => i.includes("missing tail word") || i.includes("missing key token")),
    ).toBe(true);

    try {
      unlinkSync(dummyAudio);
    } catch {}
  });

  it("passes when all words and numbers match expected text", async () => {
    writeFileSync(dummyAudio, "RIFFdummydata");

    const scene = {
      id: 2,
      voiceover: "The model ID literally says expires on 0910.",
      ttsText: "The model ID literally says expires on September tenth.",
    };

    const mockTranscriber = vi.fn().mockResolvedValue({
      ok: true,
      segments: [{ text: "The model ID literally says expires on September 10th." }],
    });

    const res = await evaluateSceneTts(scene, dummyAudio, 3.2, {
      transcriber: mockTranscriber,
    });

    expect(res.passed).toBe(true);
    expect(res.issues).toEqual([]);

    try {
      unlinkSync(dummyAudio);
    } catch {}
  });

  it("flags pacing when WPM is below minimum acceptable threshold (Indian accent drag)", async () => {
    writeFileSync(dummyAudio, "RIFFdummydata");

    const scene = {
      id: 1,
      voiceover: "DeepSeek just dropped V4.1 Flash with a new architecture.",
    };

    // 9 words in 6.0 seconds -> 90 WPM (way below 115 WPM)
    const mockTranscriber = vi.fn().mockResolvedValue({
      ok: true,
      segments: [{ text: "DeepSeek just dropped V four point one Flash with a new architecture." }],
    });

    const res = await evaluateSceneTts(scene, dummyAudio, 6.0, {
      transcriber: mockTranscriber,
    });

    expect(res.passed).toBe(false);
    expect(res.issues.some((i) => i.includes("Pacing too slow"))).toBe(true);

    try {
      unlinkSync(dummyAudio);
    } catch {}
  });

  it("runs batch Quality Gate and returns overall pass/fail status", async () => {
    writeFileSync(dummyAudio, "RIFFdummydata");

    const scenes = [
      { id: 1, voiceover: "Hello world this is a test of TTS audio." },
      { id: 2, voiceover: "The model ID says expires on September tenth." },
    ];

    const ttsResults = [
      { sceneId: 1, audioPath: dummyAudio, duration: 3.0 },
      { sceneId: 2, audioPath: dummyAudio, duration: 3.0 },
    ];

    const mockTranscriber = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        segments: [{ text: "Hello world this is a test of TTS audio." }],
      })
      .mockResolvedValueOnce({
        ok: true,
        segments: [{ text: "The model ID says expires on September." }], // Missing tenth!
      });

    const gateResult = await runTtsQualityGate(scenes, ttsResults, {
      transcriber: mockTranscriber,
    });

    expect(gateResult.passed).toBe(false);
    expect(gateResult.failedCount).toBe(1);
    expect(gateResult.evaluations[0].passed).toBe(true);
    expect(gateResult.evaluations[1].passed).toBe(false);

    try {
      unlinkSync(dummyAudio);
    } catch {}
  });

  it("triggers self-healing retry loop in generateTTSWithEngine when quality gate fails", async () => {
    const { generateTTSWithEngine } = await import("../lib/tts/registry.mjs");
    const testDir = join(tmpdir(), `tts-healing-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    const sceneAudio = join(testDir, "scene-1.wav");
    writeFileSync(sceneAudio, "RIFFdummydata");

    let engineCalls = 0;
    const mockEngine = {
      name: "neural-tts-test",
      info: "Neural TTS engine (mock)",
      generate: vi.fn().mockImplementation(async (scenes) => {
        engineCalls++;
        return scenes.map((s) => ({
          sceneId: s.id,
          audioPath: sceneAudio,
          duration: 3.0,
        }));
      }),
    };

    const scenes = [{ id: 1, voiceover: "The model ID says expires on September tenth." }];

    // First attempt: missing "tenth", every later attempt: full sentence.
    // `mockResolvedValue` (not `...Once`) for the tail matters: the healing
    // flow runs the gate three times (initial, retry, final) and an exhausted
    // mock answers "ASR unavailable" — which is now fail-closed and would stop
    // the run for a reason the test never intended to exercise.
    const mockTranscriber = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        segments: [{ text: "The model ID says expires on September." }],
      })
      .mockResolvedValue({
        ok: true,
        segments: [{ text: "The model ID says expires on September tenth." }],
      });

    const results = await generateTTSWithEngine(scenes, testDir, mockEngine, {
      useCache: false,
      runAlignment: false,
      qualityGateOptions: {
        transcriber: mockTranscriber,
      },
    });

    expect(results.length).toBe(1);
    expect(results[0].sceneId).toBe(1);
    // Verified: engine was called twice (initial + 1 retry healing)
    expect(engineCalls).toBe(2);

    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });
});

// ─── #271: failure-family classification (pacing vs acoustic) ───
// The registry routes the two families differently: pacing → speed
// compensation, acoustic → reroll then fail-closed. `failureClass` is the
// contract it reads, so it must be pinned here.

describe("#271 failure classification", () => {
  it("classifyFailure maps pacing-only text to pacing and anything else to acoustic", () => {
    expect(classifyFailure(["Pacing too slow: 100 WPM (minimum acceptable: 115 WPM)"])).toBe(
      "pacing",
    );
    expect(classifyFailure(["Pacing very fast: 240 WPM (guideline max: 225 WPM)"])).toBe("pacing");
    expect(classifyFailure(["Truncation detected: missing tail word(s) [tenth]"])).toBe("acoustic");
    expect(classifyFailure(["Low text similarity: 12.0% (threshold: 75%)"])).toBe("acoustic");
    expect(classifyFailure(["Audio file missing or zero bytes"])).toBe("acoustic");
    // Mixed → acoustic: a take whose words cannot be trusted is not
    // speed-fixable, and compensating it could make the garble worse.
    expect(
      classifyFailure([
        "Pacing too slow: 90 WPM (minimum acceptable: 115 WPM)",
        "Truncation detected: missing tail word(s) [tenth]",
      ]),
    ).toBe("acoustic");
    expect(classifyFailure([])).toBe(null);
    expect(classifyFailure(undefined)).toBe(null);
  });

  const dummyAudio = join(tmpdir(), "dummy-classify-audio.wav");

  it("tags a phonetically clean but slow take as pacing", async () => {
    writeFileSync(dummyAudio, "RIFFdummydata");
    const scene = {
      id: 1,
      voiceover: "DeepSeek just dropped V4.1 Flash with a new architecture.",
    };
    // 10 tokens over 6.0s → 100 WPM (< 115 floor); ASR echoes the script, so
    // no truncation / similarity issue fires.
    const mockTranscriber = vi.fn().mockResolvedValue({
      ok: true,
      segments: [{ text: scene.voiceover }],
    });

    const res = await evaluateSceneTts(scene, dummyAudio, 6.0, { transcriber: mockTranscriber });

    expect(res.passed).toBe(false);
    expect(res.issues.some((i) => i.includes("Pacing too slow"))).toBe(true);
    expect(res.failureClass).toBe("pacing");

    try {
      unlinkSync(dummyAudio);
    } catch {}
  });

  it("tags truncation and similarity failures as acoustic", async () => {
    writeFileSync(dummyAudio, "RIFFdummydata");
    const scene = {
      id: 2,
      voiceover: "The model ID literally says expires on September tenth.",
    };
    // 9 tokens over 3.0s → 180 WPM (in band), so pacing cannot be blamed.
    const mockTranscriber = vi.fn().mockResolvedValue({
      ok: true,
      segments: [{ text: "The model ID literally says expires on September." }],
    });

    const res = await evaluateSceneTts(scene, dummyAudio, 3.0, { transcriber: mockTranscriber });

    expect(res.passed).toBe(false);
    expect(res.failureClass).toBe("acoustic");

    try {
      unlinkSync(dummyAudio);
    } catch {}
  });

  it("tags a mixed pacing + truncation failure as acoustic", async () => {
    writeFileSync(dummyAudio, "RIFFdummydata");
    const scene = {
      id: 3,
      voiceover: "The model ID literally says expires on September tenth.",
    };
    // Same truncation, but now 90 WPM — both families fire.
    const mockTranscriber = vi.fn().mockResolvedValue({
      ok: true,
      segments: [{ text: "The model ID literally says expires on September." }],
    });

    const res = await evaluateSceneTts(scene, dummyAudio, 6.0, { transcriber: mockTranscriber });

    expect(res.passed).toBe(false);
    expect(res.issues.some((i) => i.includes("Pacing too slow"))).toBe(true);
    expect(
      res.issues.some((i) => i.includes("missing tail") || i.includes("missing key token")),
    ).toBe(true);
    expect(res.failureClass).toBe("acoustic");

    try {
      unlinkSync(dummyAudio);
    } catch {}
  });

  it("tags missing audio as acoustic and a passing take as null", async () => {
    const missing = await evaluateSceneTts(
      { id: 4, voiceover: "Anything at all here." },
      join(tmpdir(), "definitely-not-there-271.wav"),
      3.0,
      { transcriber: vi.fn() },
    );
    expect(missing.passed).toBe(false);
    expect(missing.failureClass).toBe("acoustic");

    writeFileSync(dummyAudio, "RIFFdummydata");
    const mockTranscriber = vi.fn().mockResolvedValue({
      ok: true,
      segments: [{ text: "The model ID literally says expires on September 10th." }],
    });
    const ok = await evaluateSceneTts(
      { id: 5, voiceover: "The model ID literally says expires on September tenth." },
      dummyAudio,
      3.0,
      { transcriber: mockTranscriber },
    );
    expect(ok.passed).toBe(true);
    expect(ok.failureClass).toBe(null);

    try {
      unlinkSync(dummyAudio);
    } catch {}
  });
});

// ─── #251: roman-numeral version mishearing equivalence ───
// Real repro (deepseek-v41-flash-report scene-1, whisper.cpp large-v3-turbo):
// expected "DeepSeek V4.1" → ASR heard "DeepSeq VI 4.1" — the critical token
// "v4" must be satisfied by version-letter evidence ("v" from "vi") + digit.

describe("#251 roman-numeral version equivalence", () => {
  it("critical token v4 is satisfied by ASR 'vi' + '4'", () => {
    const asrSet = buildExpandedAsrTokenSet(
      tokenize("China's DeepSeq VI 4.1 flash beat the old Pro"),
    );
    expect(asrSet.has("v")).toBe(true); // "vi" unpacks to the version letter
    expect(isWordInAsr("v4", asrSet)).toBe(true);
  });

  it("non-version roman words are not unpacked", () => {
    // "vision" must not yield a bare "v" evidence token
    const asrSet = buildExpandedAsrTokenSet(tokenize("vision pro"));
    expect(asrSet.has("v")).toBe(false);
  });

  it("v4 is NOT satisfied without version-letter evidence", () => {
    const asrSet = buildExpandedAsrTokenSet(tokenize("the 4 runners"));
    expect(isWordInAsr("v4", asrSet)).toBe(false);
  });
});

// ─── #548: digit+unit merge mirror (expected "720 P" vs heard "720p") ───
// Real repro (ant-lingbot-world-13b scene 3, 2026-10-11; saved in
// qwen-native-acceptance-lingbot-20261011.log): #239 normalizes the expected
// side to "720 P", whisper.cpp re-merges the heard form to "720p", so the
// critical token "720" had no evidence and a CORRECT take hard-blocked with
// TTS_ACOUSTIC_HARD_BLOCK (4 takes, self-heal cannot fix a matching rule).
// Aliases must come from the SAME curated unit whitelist as
// normalize-tts-text (#239) — never a generic (\d+)([a-z]+) rule.
// The spoken track spells cardinals out ("one hundred fifteen thousand"), but
// whisper.cpp writes what it hears as digits ("115,000"). Without a digit →
// word expansion a CORRECT take looks truncated ("missing tail word(s)
// [thousand]") and the self-heal loop regenerates forever.
// Observed 2026-10-14: deepseek-flash-silent-update scene 3.
describe("cardinal integers: heard digits vs spoken-track words", () => {
  it("expands a heard thousands-grouped integer into its spoken words", () => {
    const heard = "That clip reached 115,000 views";
    const set = buildExpandedAsrTokenSet(tokenize(heard), heard);
    // tokenize() splits the comma, so the heard side is ["115","000"] — the
    // expansion is what supplies the spoken words the expected track carries.
    expect(set.has("115")).toBe(true);
    expect(set.has("000")).toBe(true);
    for (const w of ["one", "hundred", "fifteen", "thousand"]) {
      expect(isWordInAsr(w, set)).toBe(true);
    }
  });

  it("expands a bare heard integer too", () => {
    const heard = "it reached 40000 people";
    const set = buildExpandedAsrTokenSet(tokenize(heard), heard);
    expect(isWordInAsr("forty", set)).toBe(true);
    expect(isWordInAsr("thousand", set)).toBe(true);
  });

  it("covers spoken-track dates and years heard as digits", () => {
    const heard = "on October 12 the IPO was planned for 2027";
    const set = buildExpandedAsrTokenSet(tokenize(heard), heard);
    for (const w of ["twelve", "two", "thousand", "twenty", "seven"]) {
      expect(isWordInAsr(w, set)).toBe(true);
    }
  });

  it("does not invent word evidence from decimals or digit+unit tokens", () => {
    const heard = "cost 1.32 dollars at 720p output";
    const set = buildExpandedAsrTokenSet(tokenize(heard), heard);
    expect(set.has("thousand")).toBe(false);
    expect(set.has("hundred")).toBe(false);
    expect(set.has("seven")).toBe(false);
  });

  it("keeps the token-only contract when no transcript is supplied", () => {
    // #548 callers pass tokens alone; cardinal expansion needs the raw text.
    const set = buildExpandedAsrTokenSet(tokenize("That clip reached 115,000 views"));
    expect(set.has("thousand")).toBe(false);
  });

  it("end-to-end: a correct take of a cardinal-heavy line is not read as truncated", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-cardinal-"));
    const audio = join(dir, "scene-3.wav");
    writeFileSync(audio, "RIFFdummydata");
    const scene = {
      id: 3,
      voiceover:
        "A verified account reported the same prompt looking sharper on October 12. That clip reached 115,000 views.",
      ttsText:
        "A verified account reported the same prompt looking sharper on October twelve. That clip reached one hundred fifteen thousand views.",
    };
    const heard =
      "A verified account reported the same prompt looking sharper on October 12. That clip reached 115,000 views.";
    const transcriber = vi.fn().mockResolvedValue({ ok: true, segments: [{ text: heard }] });

    const report = await evaluateSceneTts(scene, audio, 7.68, { transcriber });
    rmSync(dir, { recursive: true, force: true });

    expect(report.issues.filter((i) => /truncation detected/i.test(i))).toEqual([]);
    expect(report.issues.filter((i) => /incomplete speech/i.test(i))).toEqual([]);
    expect(report.similarity).toBeGreaterThanOrEqual(0.75);
  });
});

describe("#548 digit+unit merge aliases", () => {
  // Verbatim saved evidence from the failed real run (log lines 421-423).
  const EXPECTED =
    "QbitAI reported that Lingbo open-sourced LingBot-World two point zero in July at 14 billion parameters. It hit 720 P at 60 frames per second.";
  const HEARD =
    "QubitEye reported that Lingbo open-sourced Lingbot World 2.0 in July, at 14 billion parameters. It hit 720p at 60 frames per second.";
  // The saved run measured 142 WPM for the 26-word scene → 10.99s.
  const SAVED_DURATION = 10.99;

  const dir = mkdtempSync(join(tmpdir(), "tts-548-"));
  const audio = join(dir, "scene-3.wav");
  beforeEach(() => writeFileSync(audio, "RIFFdummydata"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** Gate the saved scene 3 against one ASR transcript. */
  const gateSavedScene = (heardText) => {
    const scene = { id: 3, voiceover: EXPECTED, ttsText: EXPECTED };
    const transcriber = vi.fn().mockResolvedValue({ ok: true, segments: [{ text: heardText }] });
    return evaluateSceneTts(scene, audio, SAVED_DURATION, { transcriber });
  };

  it("expands a whitelisted merged token into digit + unit evidence, keeping the raw token", () => {
    const set = buildExpandedAsrTokenSet(tokenize("It hit 720p at 60 frames per second"));
    expect(set.has("720p")).toBe(true); // raw token kept
    expect(set.has("720")).toBe(true);
    expect(set.has("p")).toBe(true);
    expect(isWordInAsr("720", set)).toBe(true);
    expect(isWordInAsr("p", set)).toBe(true);
  });

  it("mirrors every whitelisted unit class", () => {
    // All 15 UNIT_SPOKEN classes, one token each.
    const set = buildExpandedAsrTokenSet(
      tokenize("720p 4k 120fps 5nm 512kb 8mb 16gb 2tb 5km 2kg 144hz 32bit 9g 3t 12m"),
    );
    const pairs = [
      ["720", "p"],
      ["4", "k"],
      ["120", "fps"],
      ["5", "nm"],
      ["512", "kb"],
      ["8", "mb"],
      ["16", "gb"],
      ["2", "tb"],
      ["5", "km"],
      ["2", "kg"],
      ["144", "hz"],
      ["32", "bit"],
      ["9", "g"],
      ["3", "t"],
      ["12", "m"],
    ];
    for (const [digits, unit] of pairs) {
      expect(set.has(digits)).toBe(true);
      expect(set.has(unit)).toBe(true);
    }
  });

  it("adds no evidence outside the whitelist (hex, multiplier, codenames, B suffix)", () => {
    const tokens = tokenize(
      "H100 and B200 run 0x12a hex kernels; the API costs $1.4B and usage grew 10x",
    );
    const set = buildExpandedAsrTokenSet(tokens);
    // Anchored whole-token match from the curated alternation: letter-prefixed
    // codenames, hex ("0x12a"), multipliers ("10x") and the B-suffix ("$1.4B"
    // → "4b") must pass through without generating any new evidence.
    expect([...set].sort()).toEqual([...new Set(tokens)].sort());
  });

  it("cannot cross-supply evidence: 7200p is not 720, 720k cannot yield p", () => {
    const over = buildExpandedAsrTokenSet(tokenize("it hit 7200p on the chip"));
    expect(isWordInAsr("720", over)).toBe(false);
    expect(over.has("p")).toBe(true); // its own unit still mirrors

    const kilo = buildExpandedAsrTokenSet(tokenize("priced at 720k units"));
    expect(kilo.has("720")).toBe(true);
    expect(kilo.has("k")).toBe(true);
    expect(kilo.has("p")).toBe(false);
  });

  it("alias matches cannot push similarity above 1 or below the pass floor", () => {
    expect(computeTokenSimilarity(["720", "p"], tokenize("720p"))).toBe(1);
    const full = computeTokenSimilarity(tokenize(EXPECTED), tokenize(HEARD));
    expect(full).toBeLessThanOrEqual(1);
    expect(full).toBeGreaterThan(0.75);
  });

  it("keeps the unsplit-expected boundary unchanged (production expected is always split)", () => {
    // Both sides merged → direct match, as before.
    expect(isWordInAsr("720p", buildExpandedAsrTokenSet(tokenize("It hit 720p at 60 fps")))).toBe(
      true,
    );
    // An expected merged token has no alias path to a split heard form — the
    // pre-#548 boundary, deliberate and unchanged. Production never relies on
    // it: normalizeTtsText (#239) splits every whitelisted unit on the
    // expected side, so only the heard side can arrive merged.
    expect(isWordInAsr("720p", buildExpandedAsrTokenSet(tokenize("It hit 720 p at 60 fps")))).toBe(
      false,
    );
  });

  it("end-to-end: the saved scene 3 take (expected '720 P' vs heard '720p') now passes", async () => {
    const res = await gateSavedScene(HEARD);
    expect(res.passed).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.wpm).toBe(142);
  });

  it("end-to-end negative: the same scene missing 720 still acoustic-blocks", async () => {
    const res = await gateSavedScene(HEARD.replace("It hit 720p at", "It hit at"));
    expect(res.passed).toBe(false);
    expect(res.issues.some((i) => i.includes("missing key token(s) [720]"))).toBe(true);
    expect(res.failureClass).toBe("acoustic");
  });

  it("end-to-end negative: a truncated tail still acoustic-blocks", async () => {
    // Drop both tail words. ("second" alone is masked by the pre-existing
    // "second" → "2" equivalence via "World 2.0" — out of scope here — so
    // "per" is what carries the truncation guard.)
    const res = await gateSavedScene(HEARD.replace("frames per second.", "frames"));
    expect(res.passed).toBe(false);
    expect(res.issues.some((i) => i.includes("missing tail word(s) [per]"))).toBe(true);
    expect(res.failureClass).toBe("acoustic");
  });
});

// ─── #271: cross-module threshold coupling ───
// The registry fail-closes a gate-failed pacing take it cannot plan, so the
// compensation trigger (pacing.mjs) is a hard lower bound for the gate floor:
// if MIN_ACCEPTABLE_WPM ever rose above WPM_COMPENSATE_BELOW, a take the gate
// rejected as "too slow" would have no repair plan at all and the pipeline
// would block on something that is in fact compensable.
describe("#271 gate floor vs compensation trigger", () => {
  it("keeps MIN_ACCEPTABLE_WPM strictly below WPM_COMPENSATE_BELOW", () => {
    expect(MIN_ACCEPTABLE_WPM).toBeLessThan(WPM_COMPENSATE_BELOW);
  });

  it("pins the failure-family strings the registry routes on", () => {
    expect(FAILURE_CLASS).toEqual({ PACING: "pacing", ACOUSTIC: "acoustic", INFRA: "infra" });
  });
});

// ─── #270: instruct-signature re-validation ───
// The Quality Gate is the last seam before rendering, so it re-validates the
// instruct the engine ACTUALLY resolved. It reports a warning, not an issue:
// blocking here would spend the #271 reroll budget on a take whose instruct is
// the defect and then report the wrong failure family. The hard stops live at
// manifest build (instruct.mjs throws) and in the pre-render gate.
describe("#270 instruct signature re-validation at the gate", () => {
  const LEGACY = "Speak with a calm and measured tone, like a narrator.";

  it("reports nothing when no resolver is supplied (engines without instruct)", () => {
    expect(collectInstructWarnings({ id: 1, visualType: "hook" }, undefined)).toEqual([]);
    expect(collectInstructWarnings({ id: 1, visualType: "hook" }, null)).toEqual([]);
  });

  it("accepts the standard instruct on every engine format", () => {
    for (const format of [INSTRUCT_FORMAT.PYTORCH, INSTRUCT_FORMAT.MLX]) {
      const resolve = createInstructResolver({ format });
      for (const style of ["hook", "narrative", "contrast"]) {
        expect(collectInstructWarnings({ id: 1, visualType: style }, resolve)).toEqual([]);
      }
    }
  });

  it("flags the pre-#234 wording a hand-rolled engine map would resolve", () => {
    const warnings = collectInstructWarnings({ id: 1, visualType: "narrative" }, () => LEGACY);
    expect(warnings).toHaveLength(2);
    expect(warnings.every((w) => w.startsWith(INSTRUCT_WARNING_PREFIX))).toBe(true);
    expect(warnings.join("\n")).toContain("missing_system_prefix");
    expect(warnings.join("\n")).toContain("missing_accent_guidance");
  });

  it("surfaces a resolver that refuses the scene instead of throwing through the gate", () => {
    const warnings = collectInstructWarnings({ id: 1, visualType: "narrative" }, () => {
      throw new Error('No TTS instruct for style "narrative"');
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("unresolvable_instruct");
  });

  it("keeps the warning advisory in evaluateSceneTts (take verdict unchanged)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-instruct-gate-"));
    const audio = join(dir, "scene-1.wav");
    writeFileSync(audio, "RIFFdummydata");
    const transcriber = vi.fn().mockResolvedValue({
      ok: true,
      segments: [{ text: "DeepSeek announced V4.1 on September tenth." }],
    });

    const scene = {
      id: 1,
      visualType: "narrative",
      voiceover: "DeepSeek announced V4.1 on September tenth.",
    };
    const withLegacy = await evaluateSceneTts(scene, audio, 3.0, {
      transcriber,
      instructForScene: () => LEGACY,
    });
    const withStandard = await evaluateSceneTts(scene, audio, 3.0, {
      transcriber,
      instructForScene: createInstructResolver({ format: INSTRUCT_FORMAT.PYTORCH }),
    });

    expect(withLegacy.passed).toBe(withStandard.passed);
    expect(withLegacy.failureClass).toBe(withStandard.failureClass);
    expect(withLegacy.warnings.join("\n")).toContain(INSTRUCT_WARNING_PREFIX);
    expect(withStandard.warnings.join("\n")).not.toContain(INSTRUCT_WARNING_PREFIX);

    // The gate accepts the same standard text the resolver builds, so a passing
    // engine can never be flagged for following the single source.
    expect(
      collectInstructWarnings({ id: 1, visualType: "narrative" }, () => buildInstruct("narrative")),
    ).toEqual([]);

    rmSync(dir, { recursive: true, force: true });
  });
});

// ─── #415 ①: the ASR leg must not be a silent no-op ───
// Before this, `transcribeVideo` returning null (missing ggml model / binary)
// only pushed a warning and the take PASSED — the WER-style checks never ran.
// An unverifiable take is now an infra failure: fatal, non-retryable (a reroll
// cannot fix a missing model) and clearly distinguishable from a bad take.
describe("#415 ① ASR infrastructure failures", () => {
  const dir = mkdtempSync(join(tmpdir(), "tts-asr-infra-"));
  const audio = join(dir, "scene-1.wav");
  // Written per test (and the dir removed only after the block runs): a
  // describe-body rmSync would delete the audio at collection time.
  beforeEach(() => writeFileSync(audio, "RIFFdummydata"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const scene = {
    id: 7,
    voiceover: "A clean sentence about robots.",
    ttsText: "A clean sentence about robots.",
  };
  const unavailable = () =>
    vi.fn().mockResolvedValue({ ok: false, segments: [], errorCode: "asr_unavailable" });

  it("fails the gate with the infra class when ASR cannot run", async () => {
    const res = await evaluateSceneTts(scene, audio, 2.2, { transcriber: unavailable() });
    expect(res.passed).toBe(false);
    expect(res.failureClass).toBe(FAILURE_CLASS.INFRA);
    expect(res.asrVerified).toBe(false);
    expect(res.issues.join(" ")).toMatch(/ASR unavailable/);
  });

  it("treats a thrown transcriber error as infra as well", async () => {
    const transcriber = vi.fn().mockRejectedValue(new Error("whisper-cli exploded"));
    const res = await evaluateSceneTts(scene, audio, 2.2, { transcriber });
    expect(res.passed).toBe(false);
    expect(res.failureClass).toBe(FAILURE_CLASS.INFRA);
    expect(res.issues.join(" ")).toMatch(/ASR unavailable/);
  });

  it("allowAsrUnavailable downgrades to a warning and records asrVerified:false", async () => {
    const res = await evaluateSceneTts(scene, audio, 2.2, {
      transcriber: unavailable(),
      allowAsrUnavailable: true,
    });
    expect(res.passed).toBe(true);
    expect(res.asrVerified).toBe(false);
    expect(res.warnings.join(" ")).toMatch(/ASR unavailable/);
  });

  it("marks asrVerified true when the ASR leg actually ran", async () => {
    const transcriber = vi.fn().mockResolvedValue({
      ok: true,
      segments: [{ text: "A clean sentence about robots." }],
    });
    const res = await evaluateSceneTts(scene, audio, 2.2, { transcriber });
    expect(res.passed).toBe(true);
    expect(res.asrVerified).toBe(true);
  });

  it("fails closed when ASR returns ok with no usable text", async () => {
    // whisper exits 0 on empty/unparsable JSON, so the adapter reports
    // {ok:true, segments:[]} — a pass here would ship a take that no
    // word-level check ever saw.
    const empty = vi.fn().mockResolvedValue({ ok: true, segments: [], errorCode: null });
    const res = await evaluateSceneTts(scene, audio, 2.2, { transcriber: empty });
    expect(res.passed).toBe(false);
    expect(res.failureClass).toBe(FAILURE_CLASS.INFRA);
    expect(res.asrVerified).toBe(false);
    expect(res.issues.join(" ")).toMatch(/empty_transcript/);
  });

  it("treats whitespace-only ASR segments as empty too", async () => {
    const blank = vi.fn().mockResolvedValue({ ok: true, segments: [{ text: "   " }] });
    const res = await evaluateSceneTts(scene, audio, 2.2, { transcriber: blank });
    expect(res.passed).toBe(false);
    expect(res.failureClass).toBe(FAILURE_CLASS.INFRA);
  });

  it("allowAsrUnavailable downgrades an empty transcript to a warning", async () => {
    const empty = vi.fn().mockResolvedValue({ ok: true, segments: [] });
    const res = await evaluateSceneTts(scene, audio, 2.2, {
      transcriber: empty,
      allowAsrUnavailable: true,
    });
    expect(res.passed).toBe(true);
    expect(res.asrVerified).toBe(false);
    expect(res.warnings.join(" ")).toMatch(/empty_transcript/);
  });

  it("classifies ASR-only issue lists as infra, mixed lists stay acoustic", () => {
    expect(
      classifyFailure(["ASR unavailable (asr_unavailable): back-transcription could not run"]),
    ).toBe(FAILURE_CLASS.INFRA);
    expect(
      classifyFailure([
        "ASR unavailable (asr_unavailable): back-transcription could not run",
        "Pacing too slow: 100 WPM (minimum acceptable: 115 WPM)",
      ]),
    ).toBe(FAILURE_CLASS.ACOUSTIC);
  });

  it("partitions gate failures into the three families", () => {
    const evals = [
      { sceneId: 1, passed: true },
      { sceneId: 2, passed: false, failureClass: FAILURE_CLASS.INFRA },
      { sceneId: 3, passed: false, failureClass: FAILURE_CLASS.ACOUSTIC },
      { sceneId: 4, passed: false, failureClass: FAILURE_CLASS.PACING },
      { sceneId: 5, passed: false },
    ];
    const p = partitionGateFailures(evals);
    expect(p.infra.map((e) => e.sceneId)).toEqual([2]);
    expect(p.acoustic.map((e) => e.sceneId)).toEqual([3]);
    expect(p.pacing.map((e) => e.sceneId)).toEqual([4]);
    expect(p.unclassified.map((e) => e.sceneId)).toEqual([5]);
  });

  it("infraBlockError names the scenes and the way out", () => {
    const err = infraBlockError([{ sceneId: 2, issues: ["ASR unavailable (asr_unavailable)"] }]);
    expect(err.message).toMatch(/Scene 2/);
    expect(err.message).toMatch(/ASR/);
    expect(err.message).toMatch(/TTS_QUALITY_ALLOW_NO_ASR=1/);
  });
});

// ─── #689: split / near-miss brand-name recognition ───
// Real repro (deepseek-flash-silent-update scene 10, 2026-10-21): whisper.cpp
// returned "Deep Seek" / "DeepSeq" for the brand "DeepSeek", so the gate
// hard-blocked a CORRECT take as a truncated tail. Recognition variance is
// evidence and a warning, never an issue; genuine truncation ("Deep",
// "DeepSee") must keep failing.
describe("#689 brand-word split / near-miss recognition", () => {
  const SCENE_TEXT = "Follow for the fingerprint check, every time DeepSeek ships.";
  // Real scene-10.tts-meta.json duration.
  const SCENE_DURATION = 2.8;
  const scene = { id: 10, voiceover: SCENE_TEXT };
  const dir = mkdtempSync(join(tmpdir(), "tts-689-"));
  const audio = join(dir, "scene-10.wav");
  beforeEach(() => writeFileSync(audio, "RIFFdummydata"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const gate = (heard, options = {}) => {
    const transcriber = vi.fn().mockResolvedValue({ ok: true, segments: [{ text: heard }] });
    return evaluateSceneTts(scene, audio, SCENE_DURATION, { transcriber, ...options });
  };

  it.each([
    "Follow for the fingerprint check, every time Deep Seek ships.",
    "Follow for the fingerprint check. Every time Deep Seek ships.",
  ])("passes the real split transcript: %s", async (heard) => {
    const res = await gate(heard);
    expect(res.passed).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.warnings).toContain('Recognition variance [split]: "deepseek" heard as "deep seek"');
    expect(res.failureClass).toBe(null);
  });

  it("passes the real near-miss transcript (DeepSeq) with a warning", async () => {
    const res = await gate("Follow for the fingerprint check, every time DeepSeq ships.");
    expect(res.passed).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.warnings).toContain(
      'Recognition variance [near-miss]: "deepseek" heard as "deepseq"',
    );
    expect(res.failureClass).toBe(null);
  });

  it("still passes an exact DeepSeek transcript without a variance warning", async () => {
    const res = await gate(SCENE_TEXT);
    expect(res.passed).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.warnings.filter((w) => w.startsWith("Recognition variance"))).toEqual([]);
  });

  it("keeps a truncated 'Deep' failing as a missing tail word", async () => {
    const res = await gate("Follow for the fingerprint check, every time Deep ships.");
    expect(res.passed).toBe(false);
    expect(res.issues.some((i) => i.includes("missing tail word(s) [deepseek]"))).toBe(true);
  });

  it("does not rescue a strict-prefix 'DeepSee'", async () => {
    const res = await gate("Follow for the fingerprint check, every time DeepSee ships.");
    expect(res.passed).toBe(false);
    expect(res.issues.some((i) => i.includes("missing tail word(s) [deepseek]"))).toBe(true);
  });

  it("applies near-miss only to declared or structurally protected names", async () => {
    const lowerScene = { id: 1, voiceover: "We tested Moonshot." };
    const run = (options = {}) =>
      evaluateSceneTts(lowerScene, audio, 1.2, {
        transcriber: vi.fn().mockResolvedValue({
          ok: true,
          segments: [{ text: "We tested Moonshoq." }],
        }),
        ...options,
      });

    // An ordinary lowercase word is not a protected name: no rescue.
    const undeclared = await run();
    expect(undeclared.passed).toBe(false);
    expect(undeclared.issues.some((i) => i.includes("moonshot"))).toBe(true);

    // The same word declared in keyEntities is authoritative.
    const declared = await run({ keyEntities: { companies: ["moonshot"] } });
    expect(declared.passed).toBe(true);
    expect(declared.issues).toEqual([]);
    expect(declared.warnings).toContain(
      'Recognition variance [near-miss]: "moonshot" heard as "moonshoq"',
    );
  });

  it("maps a merged ASR token back onto a hyphenated expected word", async () => {
    const hyphenScene = { id: 11, voiceover: "Please re-run." };
    const res = await evaluateSceneTts(hyphenScene, audio, 1.2, {
      transcriber: vi.fn().mockResolvedValue({ ok: true, segments: [{ text: "Please rerun." }] }),
    });
    expect(res.passed).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.warnings).toContain('Recognition variance [merged]: "re-run" heard as "rerun"');
  });

  it("join expansion runs only for expected tokens and stays off by default", () => {
    const asrTokens = tokenize("Deep seek ships now");
    const expectedTokens = tokenize("DeepSeek ships now");

    const expanded = buildExpandedAsrTokenSet(asrTokens, null, { expectedTokens });
    expect(expanded.has("deepseek")).toBe(true);
    expect(expanded.has("seekships")).toBe(false);

    // Three-token joins are allowed too, still gated by expected membership.
    const three = buildExpandedAsrTokenSet(asrTokens, null, {
      expectedTokens: ["seekshipsnow"],
    });
    expect(three.has("seekshipsnow")).toBe(true);

    // No expectedTokens contract → byte-for-byte the old set.
    const plain = buildExpandedAsrTokenSet(asrTokens);
    expect([...plain].sort()).toEqual([...new Set(asrTokens)].sort());
  });

  // Finding A: split evidence must also collapse the similarity denominator.
  // Without it "DeepSeek ships." vs "Deep Seek ships." scores 2/3 = 0.667 and
  // a correct take is still hard-blocked although the tail check passed.
  it("passes the short split scene with similarity 1 (join folds to one ASR unit)", async () => {
    const shortScene = { id: 12, voiceover: "DeepSeek ships." };
    const res = await evaluateSceneTts(shortScene, audio, 1.0, {
      transcriber: vi.fn().mockResolvedValue({
        ok: true,
        segments: [{ text: "Deep Seek ships." }],
      }),
    });

    expect(res.passed).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.similarity).toBe(1);
    expect(res.warnings).toContain('Recognition variance [split]: "deepseek" heard as "deep seek"');
  });

  it("keeps a hallucinated extra word in the split scene denominator", async () => {
    const shortScene = { id: 12, voiceover: "DeepSeek ships." };
    const res = await evaluateSceneTts(shortScene, audio, 1.0, {
      transcriber: vi.fn().mockResolvedValue({
        ok: true,
        segments: [{ text: "Deep Seek ships extra." }],
      }),
    });

    // Folding must collapse the evidence join only (3 units), never the extra
    // word: 2 matches / 3 units = 0.667, still below the floor.
    expect(res.passed).toBe(false);
    expect(res.similarity).toBeLessThan(0.75);
    expect(res.issues.some((i) => i.includes("Low text similarity"))).toBe(true);
  });

  it("uses asrUnits as the similarity denominator only when supplied", () => {
    const expected = tokenize("DeepSeek ships.");
    const heard = tokenize("Deep Seek ships.");
    const asrTokenSet = buildExpandedAsrTokenSet(heard, "Deep Seek ships.", {
      expectedTokens: expected,
    });

    // No options → the historical denominator (raw token count) is untouched.
    expect(computeTokenSimilarity(expected, heard)).toBeLessThan(0.75);
    expect(computeTokenSimilarity(expected, heard, null, { asrTokenSet })).toBeLessThan(0.75);
    // One folded join = one ASR unit, and the evidence now scores 1.
    expect(computeTokenSimilarity(expected, heard, null, { asrTokenSet, asrUnits: 2 })).toBe(1);
  });

  // Finding B: a split near-miss ("Deep Seq" / "Deep Sec") lives only in a
  // join, so the candidate search must scan adjacent joins, not just tokens.
  it("passes the CTA split near-miss 'Deep Seq' and names the joined heard form", async () => {
    const res = await gate("Follow for the fingerprint check, every time Deep Seq ships.");

    expect(res.passed).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.warnings).toContain(
      'Recognition variance [near-miss]: "deepseek" heard as "deep seq"',
    );
  });

  it("passes the CTA split near-miss 'Deep Sec'", async () => {
    const res = await gate("Follow for the fingerprint check, every time Deep Sec ships.");

    expect(res.passed).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.warnings).toContain(
      'Recognition variance [near-miss]: "deepseek" heard as "deep sec"',
    );
  });

  it("collapses a near-miss join into one ASR unit in a short scene", async () => {
    const shortScene = { id: 12, voiceover: "DeepSeek ships." };
    const res = await evaluateSceneTts(shortScene, audio, 1.0, {
      transcriber: vi.fn().mockResolvedValue({
        ok: true,
        segments: [{ text: "Deep Seq ships." }],
      }),
    });

    expect(res.passed).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.similarity).toBe(1);
    expect(res.warnings).toContain(
      'Recognition variance [near-miss]: "deepseek" heard as "deep seq"',
    );
  });

  it("still rejects a split near-miss that drifts past the prefix floor: 'Deep Sink'", async () => {
    // "deepsink" shares only "deeps" (5) with "deepseek"; minPrefix is 6, so
    // the join candidate must not be admitted.
    const res = await gate("Follow for the fingerprint check, every time Deep Sink ships.");

    expect(res.passed).toBe(false);
    expect(res.issues.some((i) => i.includes("missing tail word(s) [deepseek]"))).toBe(true);
  });
});
