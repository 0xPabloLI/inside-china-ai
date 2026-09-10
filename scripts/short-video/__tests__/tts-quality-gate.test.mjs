/**
 * Tests for TTS Quality Gate & Self-Healing Loop (#225, #230).
 */
import { describe, it, expect, vi } from "vitest";
import {
  cleanText,
  tokenize,
  extractGuardedTokens,
  computeTokenSimilarity,
  detectPhoneticConfusion,
  evaluateSceneTts,
  runTtsQualityGate,
} from "../lib/tts/quality-gate.mjs";
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("TTS Quality Gate - Token & Linguistic Helpers", () => {
  it("cleans and tokenizes text properly", () => {
    const raw = "On September 8, DeepSeek announced V4.1 Flash testing! The ID: expires on 0910.";
    const cleaned = cleanText(raw);
    expect(cleaned).toContain("on september 8 deepseek announced v4 1 flash testing the id expires on 0910");

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
    expect(res.issues.some((i) => i.includes("missing tail word") || i.includes("missing key token"))).toBe(true);

    try { unlinkSync(dummyAudio); } catch {}
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

    try { unlinkSync(dummyAudio); } catch {}
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

    try { unlinkSync(dummyAudio); } catch {}
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

    const mockTranscriber = vi.fn()
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

    try { unlinkSync(dummyAudio); } catch {}
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

    const scenes = [
      { id: 1, voiceover: "The model ID says expires on September tenth." },
    ];

    // First attempt: missing "tenth", second attempt: full sentence
    const mockTranscriber = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        segments: [{ text: "The model ID says expires on September." }],
      })
      .mockResolvedValueOnce({
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

    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });
});
