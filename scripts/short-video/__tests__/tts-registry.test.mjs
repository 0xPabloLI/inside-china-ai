import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock all engine adapter modules ───
// Each factory returns null (unavailable) by default; tests override per-scenario.

vi.mock("../lib/tts/f5-mlx.mjs", () => ({
  createF5MLXEngine: vi.fn(),
}));

vi.mock("../lib/tts/xtts.mjs", () => ({
  createXTTSEngine: vi.fn(),
}));

vi.mock("../lib/tts/kokoro.mjs", () => ({
  createKokoroEngine: vi.fn(),
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
import { createXTTSEngine } from "../lib/tts/xtts.mjs";
import { createKokoroEngine } from "../lib/tts/kokoro.mjs";
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
  vi.mocked(createXTTSEngine).mockResolvedValue(null);
  vi.mocked(createKokoroEngine).mockResolvedValue(null);
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
    const f5 = mockEngine("f5-mlx", "F5-TTS-MLX (best quality)");
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);

    // XTTS etc. should NOT be called (lazy evaluation — F5 found first)
    const engine = await selectEngine();

    expect(engine.name).toBe("f5-mlx");
    expect(engine).toBe(f5);
    // XTTS factory should NOT have been called (priority short-circuit)
    expect(createXTTSEngine).not.toHaveBeenCalled();
  });

  // Scenario 2: F5 unavailable, XTTS available → Falls back to XTTS
  it("S2: falls back to XTTS when F5 unavailable", async () => {
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    const xtts = mockEngine("xtts", "XTTS v2 (voice clone)");
    vi.mocked(createXTTSEngine).mockResolvedValue(xtts);

    const engine = await selectEngine();

    expect(engine.name).toBe("xtts");
    expect(engine).toBe(xtts);
    // Kokoro should NOT have been called
    expect(createKokoroEngine).not.toHaveBeenCalled();
  });

  // Scenario 3: TTS_ENGINE=kokoro → Uses Kokoro regardless of priority
  it("S3: uses Kokoro when TTS_ENGINE=kokoro, even if F5 available", async () => {
    // F5 is available — normally would be selected first
    vi.mocked(createF5MLXEngine).mockResolvedValue(mockEngine("f5-mlx"));
    // But Kokoro is also available and forced
    const kokoro = mockEngine("kokoro", "Kokoro neural TTS");
    vi.mocked(createKokoroEngine).mockResolvedValue(kokoro);

    process.env.TTS_ENGINE = "kokoro";
    const engine = await selectEngine();

    expect(engine.name).toBe("kokoro");
    expect(engine).toBe(kokoro);
    // F5 factory should NOT have been called (forced engine takes priority)
    expect(createF5MLXEngine).not.toHaveBeenCalled();
  });

  // Scenario 4: No engine available → Throws error with install hints
  it("S4: throws error with install hints when no engine available", async () => {
    // All factories return null (default from resetAllMocks)
    await expect(selectEngine()).rejects.toThrow(/No TTS engine available/);
    await expect(selectEngine()).rejects.toThrow(/F5-TTS-MLX/);
    await expect(selectEngine()).rejects.toThrow(/XTTS/);
    await expect(selectEngine()).rejects.toThrow(/Kokoro/);
  });

  // Extra: TTS_ENGINE=xtts forces XTTS even when F5 available
  it("S3b: uses XTTS when TTS_ENGINE=xtts, even if F5 available", async () => {
    vi.mocked(createF5MLXEngine).mockResolvedValue(mockEngine("f5-mlx"));
    const xtts = mockEngine("xtts", "XTTS v2");
    vi.mocked(createXTTSEngine).mockResolvedValue(xtts);

    process.env.TTS_ENGINE = "xtts";
    const engine = await selectEngine();

    expect(engine.name).toBe("xtts");
    expect(createF5MLXEngine).not.toHaveBeenCalled();
  });

  // Extra: TTS_ENGINE=f5 forces F5
  it("S3c: uses F5 when TTS_ENGINE=f5", async () => {
    const f5 = mockEngine("f5-mlx");
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);

    process.env.TTS_ENGINE = "f5";
    const engine = await selectEngine();

    expect(engine.name).toBe("f5-mlx");
  });

  // Extra: Forced engine unavailable → falls back to priority order
  it("S3d: falls back to priority when forced engine unavailable", async () => {
    // TTS_ENGINE=kokoro but Kokoro not available
    vi.mocked(createKokoroEngine).mockResolvedValue(null);
    // F5 available → should be selected after Kokoro fails
    const f5 = mockEngine("f5-mlx");
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);

    process.env.TTS_ENGINE = "kokoro";
    const engine = await selectEngine();

    expect(engine.name).toBe("f5-mlx");
    expect(createKokoroEngine).toHaveBeenCalled();
    expect(createF5MLXEngine).toHaveBeenCalled();
  });

  // Extra: full fallback chain F5 → XTTS → Kokoro → edge-tts → say
  it("S2b: falls through entire priority chain to say", async () => {
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    vi.mocked(createXTTSEngine).mockResolvedValue(null);
    vi.mocked(createKokoroEngine).mockResolvedValue(null);
    vi.mocked(createEdgeTTSEngine).mockResolvedValue(null);
    const say = mockEngine("say", "macOS say");
    vi.mocked(createSayEngine).mockResolvedValue(say);

    const engine = await selectEngine();

    expect(engine.name).toBe("say");
    expect(createF5MLXEngine).toHaveBeenCalled();
    expect(createXTTSEngine).toHaveBeenCalled();
    expect(createKokoroEngine).toHaveBeenCalled();
    expect(createEdgeTTSEngine).toHaveBeenCalled();
    expect(createSayEngine).toHaveBeenCalled();
  });
});
