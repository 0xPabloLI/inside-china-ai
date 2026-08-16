import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock all engine adapter modules ───
// Each factory returns null (unavailable) by default; tests override per-scenario.
// CosyVoice removed (2026-08-16): no longer in the registry.

vi.mock("../lib/tts/f5-mlx.mjs", () => ({
  createF5MLXEngine: vi.fn(),
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

  // Scenario 1: F5-MLX available, no TTS_ENGINE set → Uses F5-MLX
  it("S1: selects F5-MLX when available and no TTS_ENGINE env", async () => {
    const f5 = mockEngine("f5-mlx", "F5-TTS-MLX (default)");
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);

    const engine = await selectEngine();

    expect(engine.name).toBe("f5-mlx");
    expect(engine).toBe(f5);
    // Qwen3 factory should NOT have been called (priority short-circuit)
    expect(createQwenTTSEngine).not.toHaveBeenCalled();
  });

  // Scenario 2: F5-MLX unavailable, Qwen3 available → Falls back to Qwen3
  it("S2: falls back to Qwen3 when F5-MLX unavailable", async () => {
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    const qwen = mockEngine("qwen-tts", "Qwen3-TTS (voice clone)");
    vi.mocked(createQwenTTSEngine).mockResolvedValue(qwen);

    const engine = await selectEngine();

    expect(engine.name).toBe("qwen-tts");
    expect(engine).toBe(qwen);
    // edge-tts should NOT have been called
    expect(createEdgeTTSEngine).not.toHaveBeenCalled();
  });

  // Scenario 3: TTS_ENGINE=qwen-tts → Uses Qwen3 regardless of priority
  it("S3: uses Qwen3 when TTS_ENGINE=qwen-tts, even if F5-MLX available", async () => {
    // F5-MLX is available — normally would be selected first
    vi.mocked(createF5MLXEngine).mockResolvedValue(mockEngine("f5-mlx"));
    // But Qwen3 is also available and forced
    const qwen = mockEngine("qwen-tts", "Qwen3-TTS (forced)");
    vi.mocked(createQwenTTSEngine).mockResolvedValue(qwen);

    process.env.TTS_ENGINE = "qwen-tts";
    const engine = await selectEngine();

    expect(engine.name).toBe("qwen-tts");
    expect(engine).toBe(qwen);
    // F5-MLX factory should NOT have been called (forced engine takes priority)
    expect(createF5MLXEngine).not.toHaveBeenCalled();
  });

  // Scenario 4: No engine available → Throws error with install hints
  it("S4: throws error with install hints when no engine available", async () => {
    // All factories return null (default from resetAllMocks)
    await expect(selectEngine()).rejects.toThrow(/No TTS engine available/);
    await expect(selectEngine()).rejects.toThrow(/video-tts-env/);
    await expect(selectEngine()).rejects.toThrow(/Qwen3-TTS/);
  });

  // Extra: TTS_ENGINE=edge-tts forces edge-tts even when F5-MLX available
  it("S3b: uses edge-tts when TTS_ENGINE=edge-tts, even if F5-MLX available", async () => {
    vi.mocked(createF5MLXEngine).mockResolvedValue(mockEngine("f5-mlx"));
    const edge = mockEngine("edge-tts", "edge-tts (Microsoft)");
    vi.mocked(createEdgeTTSEngine).mockResolvedValue(edge);

    process.env.TTS_ENGINE = "edge-tts";
    const engine = await selectEngine();

    expect(engine.name).toBe("edge-tts");
    expect(createF5MLXEngine).not.toHaveBeenCalled();
  });

  // Extra: Forced engine unavailable → falls back to priority order
  it("S3d: falls back to priority when forced engine unavailable", async () => {
    // TTS_ENGINE=qwen-tts but Qwen3 not available
    vi.mocked(createQwenTTSEngine).mockResolvedValue(null);
    // F5-MLX available → should be selected after Qwen3 fails
    const f5 = mockEngine("f5-mlx");
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);

    process.env.TTS_ENGINE = "qwen-tts";
    const engine = await selectEngine();

    expect(engine.name).toBe("f5-mlx");
    expect(createQwenTTSEngine).toHaveBeenCalled();
    expect(createF5MLXEngine).toHaveBeenCalled();
  });

  // Extra: full fallback chain F5-MLX → Qwen3 → edge-tts → say
  it("S2b: falls through entire priority chain to say", async () => {
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    vi.mocked(createQwenTTSEngine).mockResolvedValue(null);
    vi.mocked(createEdgeTTSEngine).mockResolvedValue(null);
    const say = mockEngine("say", "macOS say");
    vi.mocked(createSayEngine).mockResolvedValue(say);

    const engine = await selectEngine();

    expect(engine.name).toBe("say");
    expect(createF5MLXEngine).toHaveBeenCalled();
    expect(createQwenTTSEngine).toHaveBeenCalled();
    expect(createEdgeTTSEngine).toHaveBeenCalled();
    expect(createSayEngine).toHaveBeenCalled();
  });
});
