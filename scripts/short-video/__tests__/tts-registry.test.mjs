import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock all engine adapter modules ───
// Each factory returns null (unavailable) by default; tests override per-scenario.

vi.mock("../lib/tts/cosyvoice3-kaggle-cuda.mjs", () => ({
  createCosyVoice3KaggleCudaEngine: vi.fn(),
}));

vi.mock("../lib/tts/cosyvoice3-modal-cuda.mjs", () => ({
  createCosyVoice3ModalCudaEngine: vi.fn(),
}));

vi.mock("../lib/tts/cosyvoice3-npu.mjs", () => ({
  createCosyVoice3NPUEngine: vi.fn(),
}));

vi.mock("../lib/tts/cosyvoice3-mlx.mjs", () => ({
  createCosyVoice3MLXEngine: vi.fn(),
}));

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
import { createCosyVoice3KaggleCudaEngine } from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";
import { createCosyVoice3ModalCudaEngine } from "../lib/tts/cosyvoice3-modal-cuda.mjs";
import { createCosyVoice3NPUEngine } from "../lib/tts/cosyvoice3-npu.mjs";
import { createCosyVoice3MLXEngine } from "../lib/tts/cosyvoice3-mlx.mjs";
import { createF5MLXEngine } from "../lib/tts/f5-mlx.mjs";
import { createQwenTTSEngine } from "../lib/tts/qwen-tts.mjs";
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
  vi.mocked(createCosyVoice3NPUEngine).mockResolvedValue(null);
  vi.mocked(createCosyVoice3MLXEngine).mockResolvedValue(null);
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
    expect(createCosyVoice3NPUEngine).not.toHaveBeenCalled();
  });

  // S2a: Kaggle + Modal unavailable, NPU available → Falls back to NPU
  it("S2a: falls back to CosyVoice3-NPU when Kaggle + Modal CUDA unavailable", async () => {
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3ModalCudaEngine).mockResolvedValue(null);
    const npu = mockEngine("cosyvoice3-npu", "CosyVoice3-NPU (Ascend 910B)");
    vi.mocked(createCosyVoice3NPUEngine).mockResolvedValue(npu);

    const engine = await selectEngine();

    expect(engine.name).toBe("cosyvoice3-npu");
    expect(engine).toBe(npu);
    expect(createCosyVoice3MLXEngine).not.toHaveBeenCalled();
  });

  // S2c: Kaggle + Modal + NPU unavailable, CosyVoice3-MLX available → Falls back to MLX
  it("S2c: falls back to CosyVoice3-MLX when Kaggle + Modal + NPU unavailable", async () => {
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3ModalCudaEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3NPUEngine).mockResolvedValue(null);
    const cv3 = mockEngine("cosyvoice3-mlx", "CosyVoice3-MLX (local fallback)");
    vi.mocked(createCosyVoice3MLXEngine).mockResolvedValue(cv3);

    const engine = await selectEngine();

    expect(engine.name).toBe("cosyvoice3-mlx");
    expect(engine).toBe(cv3);
    expect(createF5MLXEngine).not.toHaveBeenCalled();
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

  // S2b: full fallback chain Kaggle CUDA → Modal CUDA → NPU → CosyVoice3-MLX → F5 → Qwen3 → edge-tts → say
  it("S2b: falls through entire priority chain to say", async () => {
    vi.mocked(createCosyVoice3KaggleCudaEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3ModalCudaEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3NPUEngine).mockResolvedValue(null);
    vi.mocked(createCosyVoice3MLXEngine).mockResolvedValue(null);
    vi.mocked(createF5MLXEngine).mockResolvedValue(null);
    vi.mocked(createQwenTTSEngine).mockResolvedValue(null);
    vi.mocked(createEdgeTTSEngine).mockResolvedValue(null);
    const say = mockEngine("say", "macOS say");
    vi.mocked(createSayEngine).mockResolvedValue(say);

    const engine = await selectEngine();

    expect(engine.name).toBe("say");
    expect(createCosyVoice3KaggleCudaEngine).toHaveBeenCalled();
    expect(createCosyVoice3ModalCudaEngine).toHaveBeenCalled();
    expect(createCosyVoice3NPUEngine).toHaveBeenCalled();
    expect(createCosyVoice3MLXEngine).toHaveBeenCalled();
    expect(createF5MLXEngine).toHaveBeenCalled();
    expect(createQwenTTSEngine).toHaveBeenCalled();
    expect(createEdgeTTSEngine).toHaveBeenCalled();
    expect(createSayEngine).toHaveBeenCalled();
  });
});
