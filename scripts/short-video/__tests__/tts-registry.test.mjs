import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock all engine adapter modules ───
// Each factory returns null (unavailable) by default; tests override per-scenario.

vi.mock("../lib/tts/cosyvoice3-kaggle-cuda.mjs", () => ({
  createCosyVoice3KaggleCudaEngine: vi.fn(),
}));

vi.mock("../lib/tts/cosyvoice3-modal-cuda.mjs", () => ({
  createCosyVoice3ModalCudaEngine: vi.fn(),
}));

vi.mock("../lib/tts/cosyvoice3-mlx.mjs", () => ({
  createCosyVoice3MLXEngine: vi.fn(),
}));

vi.mock("../lib/tts/f5-mlx.mjs", () => ({
  createF5MLXEngine: vi.fn(),
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
import { createCosyVoice3KaggleCudaEngine } from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";
import { createCosyVoice3ModalCudaEngine } from "../lib/tts/cosyvoice3-modal-cuda.mjs";
import { createCosyVoice3MLXEngine } from "../lib/tts/cosyvoice3-mlx.mjs";
import { createF5MLXEngine } from "../lib/tts/f5-mlx.mjs";

import { createEdgeTTSEngine } from "../lib/tts/edge-tts.mjs";
import { createSayEngine } from "../lib/tts/say.mjs";

// ─── Helpers ───

function mockEngine(name, info = name) {
  return { name, info, useSilenceFilter: true, resample: true, generate: vi.fn() };
}

function resetAllMocks() {
  vi.clearAllMocks();
  vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(null);
  vi.mocked(createCosyVoice3ModalCudaEngine).mockResolvedValue(null);
  vi.mocked(createCosyVoice3MLXEngine).mockResolvedValue(null);
  vi.mocked(createF5MLXEngine).mockResolvedValue(null);

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

  // S1: Kaggle CUDA available, no TTS_ENGINE set → Uses Kaggle CUDA (default)
  it("S1: selects CosyVoice3-Kaggle-CUDA when available and no TTS_ENGINE env", async () => {
    const kaggle = mockEngine("cosyvoice3-kaggle-cuda", "CosyVoice3-Kaggle-CUDA (default)");
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(kaggle);

    const engine = await selectEngine();

    expect(engine.name).toBe("cosyvoice3-kaggle-cuda");
    expect(engine).toBe(kaggle);
    expect(createCosyVoice3MLXEngine).not.toHaveBeenCalled();
  });

  // S2: Kaggle CUDA unavailable, Modal CUDA available → Falls back to Modal CUDA
  it("S2: falls back to CosyVoice3-Modal-CUDA when Kaggle CUDA unavailable", async () => {
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(null);
    const modal = mockEngine("cosyvoice3-modal-cuda", "CosyVoice3-Modal-CUDA (A100)");
    vi.mocked(createCosyVoice3ModalCudaEngine).mockResolvedValue(modal);

    const engine = await selectEngine();

    expect(engine.name).toBe("cosyvoice3-modal-cuda");
    expect(engine).toBe(modal);
    expect(createCosyVoice3MLXEngine).not.toHaveBeenCalled();
  });

  // S2a: Kaggle + Modal unavailable, CosyVoice3-MLX available → Falls back to MLX.
  // MLX is the direct fallback after the CUDA engines: local, RTF 0.64-0.87x,
  // and the best emotion grade available off CUDA (ADR-0019).
  it("S2a: falls back to CosyVoice3-MLX when Kaggle + Modal CUDA unavailable", async () => {
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3ModalCudaEngine).mockResolvedValue(null);
    const cv3 = mockEngine("cosyvoice3-mlx", "CosyVoice3-MLX (local fallback)");
    vi.mocked(createCosyVoice3MLXEngine).mockResolvedValue(cv3);

    const engine = await selectEngine();

    expect(engine.name).toBe("cosyvoice3-mlx");
    expect(engine).toBe(cv3);
    expect(createF5MLXEngine).not.toHaveBeenCalled();
  });

  // S2c: Kaggle + Modal + MLX unavailable, F5-MLX available → Falls back to F5
  it("S2c: falls back to F5-MLX when Kaggle + Modal + MLX unavailable", async () => {
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3ModalCudaEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3MLXEngine).mockResolvedValue(null);
    const f5 = mockEngine("f5-mlx", "F5-TTS-MLX (backup)");
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);

    const engine = await selectEngine();

    expect(engine.name).toBe("f5-mlx");
    expect(engine).toBe(f5);
  });

  // S2e: `npu` is no longer an engine name at all. The registry must not even
  // attempt it as a forced engine (the old code called the adapter and logged
  // "Forced engine ... not available" before falling back) — it resolves
  // straight through the priority chain.
  it("S2e: TTS_ENGINE=npu is not a known engine — no forced attempt, priority resolves", async () => {
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(
      mockEngine("cosyvoice3-kaggle-cuda"),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    process.env.TTS_ENGINE = "npu";
    const engine = await selectEngine();

    expect(engine.name).toBe("cosyvoice3-kaggle-cuda");
    expect(log.mock.calls.flat().join(" ")).not.toMatch(/Forced engine/);
    log.mockRestore();
  });

  // S3: TTS_ENGINE=f5-mlx → Uses F5 regardless of priority
  it("S3: uses F5-MLX when TTS_ENGINE=f5-mlx, even if Kaggle CUDA available", async () => {
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(
      mockEngine("cosyvoice3-kaggle-cuda"),
    );
    vi.mocked(createCosyVoice3MLXEngine).mockResolvedValue(mockEngine("cosyvoice3-mlx"));
    const f5 = mockEngine("f5-mlx", "F5-TTS-MLX (forced)");
    vi.mocked(createF5MLXEngine).mockResolvedValue(f5);

    process.env.TTS_ENGINE = "f5-mlx";
    const engine = await selectEngine();

    expect(engine.name).toBe("f5-mlx");
    expect(engine).toBe(f5);
    expect(createCosyVoice3KaggleCudaEngine).not.toHaveBeenCalled();
  });

  // S4: No engine available → Throws error with install hints
  it("S4: throws error with install hints when no engine available", async () => {
    await expect(selectEngine()).rejects.toThrow(/No TTS engine available/);
    await expect(selectEngine()).rejects.toThrow(/Kaggle CLI/);
    await expect(selectEngine()).rejects.toThrow(/Modal CLI/);
    await expect(selectEngine()).rejects.toThrow(/video-tts-env/);
  });

  // S3b: TTS_ENGINE=edge-tts forces edge-tts even when Kaggle CUDA available
  it("S3b: uses edge-tts when TTS_ENGINE=edge-tts, even if Kaggle CUDA available", async () => {
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(
      mockEngine("cosyvoice3-kaggle-cuda"),
    );
    vi.mocked(createCosyVoice3MLXEngine).mockResolvedValue(mockEngine("cosyvoice3-mlx"));
    const edge = mockEngine("edge-tts", "edge-tts (Microsoft)");
    vi.mocked(createEdgeTTSEngine).mockResolvedValue(edge);

    process.env.TTS_ENGINE = "edge-tts";
    const engine = await selectEngine();

    expect(engine.name).toBe("edge-tts");
    expect(createCosyVoice3KaggleCudaEngine).not.toHaveBeenCalled();
  });

  // S3d: Forced engine unavailable → falls back to priority order
  it("S3d: falls back to priority when forced engine unavailable", async () => {
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(null);
    const cv3 = mockEngine("cosyvoice3-mlx");
    vi.mocked(createCosyVoice3MLXEngine).mockResolvedValue(cv3);

    process.env.TTS_ENGINE = "f5-mlx";
    const engine = await selectEngine();

    expect(engine.name).toBe("cosyvoice3-mlx");
    expect(createF5MLXEngine).toHaveBeenCalled();
    expect(createCosyVoice3KaggleCudaEngine).toHaveBeenCalled();
    expect(createCosyVoice3MLXEngine).toHaveBeenCalled();
  });

  // S2b: automatic chain Kaggle CUDA → Modal CUDA → CosyVoice3-MLX → F5-MLX,
  // then FAILS CLOSED. edge-tts / say are manual opt-in only
  // (user rule 2026-09-10, commit 2a36a48) — the loop must never reach them.
  it("S2b: automatic chain stops at f5-mlx and throws without reaching manual-only engines", async () => {
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3ModalCudaEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3MLXEngine).mockResolvedValue(null);
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);

    vi.mocked(createEdgeTTSEngine).mockResolvedValue(mockEngine("edge-tts", "edge"));
    vi.mocked(createSayEngine).mockResolvedValue(mockEngine("say", "macOS say"));

    await expect(selectEngine()).rejects.toThrow(/No TTS engine available/);

    expect(createCosyVoice3KaggleCudaEngine).toHaveBeenCalled();
    expect(createCosyVoice3ModalCudaEngine).toHaveBeenCalled();
    expect(createCosyVoice3MLXEngine).toHaveBeenCalled();
    expect(createF5MLXEngine).toHaveBeenCalled();
    // Manual-only engines stay out of the automatic fallback loop.

    expect(createEdgeTTSEngine).not.toHaveBeenCalled();
    expect(createSayEngine).not.toHaveBeenCalled();
  });
});
