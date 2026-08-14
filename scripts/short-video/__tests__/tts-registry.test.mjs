import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock all engine adapter modules ───
// Each factory returns null (unavailable) by default; tests override per-scenario.

vi.mock("../lib/tts/f5-mlx.mjs", () => ({
  createF5MLXEngine: vi.fn(),
}));

vi.mock("../lib/tts/cosyvoice.mjs", () => ({
  createCosyVoiceEngine: vi.fn(),
}));

vi.mock("../lib/tts/qwen-tts.mjs", () => ({
  createQwenTTSEngine: vi.fn(),
}));

vi.mock("../lib/tts/edge-tts.mjs", () => ({
  createEdgeTTSEngine: vi.fn(),
}));

vi.mock("../lib/tts/say.mjs", () => ({
  createSayEngine: vi.fn(),
}));

// Mock post-process to avoid exec calls during registry tests
vi.mock("../lib/tts/post-process.mjs", () => ({
  runWhisperAlignment: vi.fn(),
  getAtempo: vi.fn(() => null),
}));

import { selectEngine } from "../lib/tts/registry.mjs";
import { createF5MLXEngine } from "../lib/tts/f5-mlx.mjs";
import { createCosyVoiceEngine } from "../lib/tts/cosyvoice.mjs";
import { createQwenTTSEngine } from "../lib/tts/qwen-tts.mjs";
import { createEdgeTTSEngine } from "../lib/tts/edge-tts.mjs";
import { createSayEngine } from "../lib/tts/say.mjs";

// ─── Helpers ───

function mockEngine(name, info = name) {
  return { name, info, useSilenceFilter: true, resample: true, generate: vi.fn() };
}

function resetAllMocks() {
  // Clear call history from previous tests
  vi.clearAllMocks();
  // Reset all factories to return null (unavailable) by default
  vi.mocked(createF5MLXEngine).mockResolvedValue(null);
  vi.mocked(createCosyVoiceEngine).mockResolvedValue(null);
  vi.mocked(createQwenTTSEngine).mockResolvedValue(null);
  vi.mocked(createEdgeTTSEngine).mockResolvedValue(null);
  vi.mocked(createSayEngine).mockResolvedValue(null);
}

// ─── Tests ───

describe("TTS Engine Registry — selectEngine()", () => {
  beforeEach(() => {
    resetAllMocks();
    delete process.env.TTS_ENGINE;
  });

  afterEach(() => {
    delete process.env.TTS_ENGINE;
  });

  // Scenario 1: CosyVoice available, no TTS_ENGINE set → Uses CosyVoice
  // (F5-MLX is priority #1 but mocked as unavailable)
  it("S1: selects CosyVoice when available and no TTS_ENGINE env", async () => {
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    const cosyvoice = mockEngine("cosyvoice", "CosyVoice 3 (best quality)");
    vi.mocked(createCosyVoiceEngine).mockResolvedValue(cosyvoice);

    const engine = await selectEngine();

    expect(engine.name).toBe("cosyvoice");
    expect(engine).toBe(cosyvoice);
    // Qwen3 factory should NOT have been called (priority short-circuit)
    expect(createQwenTTSEngine).not.toHaveBeenCalled();
  });

  // Scenario 2: CosyVoice unavailable, Qwen3 available → Falls back to Qwen3
  // (F5-MLX also unavailable)
  it("S2: falls back to Qwen3 when CosyVoice unavailable", async () => {
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoiceEngine).mockResolvedValue(null);
    const qwen = mockEngine("qwen-tts", "Qwen3-TTS (voice clone)");
    vi.mocked(createQwenTTSEngine).mockResolvedValue(qwen);

    const engine = await selectEngine();

    expect(engine.name).toBe("qwen-tts");
    expect(engine).toBe(qwen);
    // edge-tts should NOT have been called
    expect(createEdgeTTSEngine).not.toHaveBeenCalled();
  });

  // Scenario 3: TTS_ENGINE=qwen-tts → Uses Qwen3 regardless of priority
  it("S3: uses Qwen3 when TTS_ENGINE=qwen-tts, even if CosyVoice available", async () => {
    // CosyVoice is available — normally would be selected first
    vi.mocked(createCosyVoiceEngine).mockResolvedValue(mockEngine("cosyvoice"));
    // But Qwen3 is also available and forced
    const qwen = mockEngine("qwen-tts", "Qwen3-TTS (fast fallback)");
    vi.mocked(createQwenTTSEngine).mockResolvedValue(qwen);

    process.env.TTS_ENGINE = "qwen-tts";
    const engine = await selectEngine();

    expect(engine.name).toBe("qwen-tts");
    expect(engine).toBe(qwen);
    // CosyVoice factory should NOT have been called (forced engine takes priority)
    expect(createCosyVoiceEngine).not.toHaveBeenCalled();
  });

  // Scenario 4: No engine available → Throws error with install hints
  it("S4: throws error with install hints when no engine available", async () => {
    // All factories return null (default from resetAllMocks)
    await expect(selectEngine()).rejects.toThrow(/No TTS engine available/);
    await expect(selectEngine()).rejects.toThrow(/CosyVoice/);
    await expect(selectEngine()).rejects.toThrow(/Qwen3-TTS/);
  });

  // Extra: TTS_ENGINE=edge-tts forces edge-tts even when CosyVoice available
  it("S3b: uses edge-tts when TTS_ENGINE=edge-tts, even if CosyVoice available", async () => {
    vi.mocked(createCosyVoiceEngine).mockResolvedValue(mockEngine("cosyvoice"));
    const edge = mockEngine("edge-tts", "edge-tts (Microsoft)");
    vi.mocked(createEdgeTTSEngine).mockResolvedValue(edge);

    process.env.TTS_ENGINE = "edge-tts";
    const engine = await selectEngine();

    expect(engine.name).toBe("edge-tts");
    expect(createCosyVoiceEngine).not.toHaveBeenCalled();
  });

  // Extra: TTS_ENGINE=cosyvoice forces CosyVoice
  it("S3c: uses CosyVoice when TTS_ENGINE=cosyvoice", async () => {
    const cosyvoice = mockEngine("cosyvoice");
    vi.mocked(createCosyVoiceEngine).mockResolvedValue(cosyvoice);

    process.env.TTS_ENGINE = "cosyvoice";
    const engine = await selectEngine();

    expect(engine.name).toBe("cosyvoice");
  });

  // Extra: Forced engine unavailable → falls back to priority order
  it("S3d: falls back to priority when forced engine unavailable", async () => {
    // TTS_ENGINE=qwen-tts but Qwen3 not available
    vi.mocked(createQwenTTSEngine).mockResolvedValue(null);
    // F5-MLX unavailable (priority #1)
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    // CosyVoice available → should be selected after F5-MLX and Qwen3 fail
    const cosyvoice = mockEngine("cosyvoice");
    vi.mocked(createCosyVoiceEngine).mockResolvedValue(cosyvoice);

    process.env.TTS_ENGINE = "qwen-tts";
    const engine = await selectEngine();

    expect(engine.name).toBe("cosyvoice");
    expect(createQwenTTSEngine).toHaveBeenCalled();
    expect(createCosyVoiceEngine).toHaveBeenCalled();
  });

  // Extra: full fallback chain F5-MLX → CosyVoice → Qwen3 → edge-tts → say
  it("S2b: falls through entire priority chain to say", async () => {
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoiceEngine).mockResolvedValue(null);
    vi.mocked(createQwenTTSEngine).mockResolvedValue(null);
    vi.mocked(createEdgeTTSEngine).mockResolvedValue(null);
    const say = mockEngine("say", "macOS say");
    vi.mocked(createSayEngine).mockResolvedValue(say);

    const engine = await selectEngine();

    expect(engine.name).toBe("say");
    expect(createF5MLXEngine).toHaveBeenCalled();
    expect(createCosyVoiceEngine).toHaveBeenCalled();
    expect(createQwenTTSEngine).toHaveBeenCalled();
    expect(createEdgeTTSEngine).toHaveBeenCalled();
    expect(createSayEngine).toHaveBeenCalled();
  });
});
