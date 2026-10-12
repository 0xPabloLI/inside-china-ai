/**
 * Tests for the batch-engine offline seam (#394): the F5 and CosyVoice3-MLX
 * spawn commands must default to offline but honor an explicit
 * HF_HUB_OFFLINE override, and the F5 batch runner must annotate an offline
 * cache miss with the fetch hint before the error propagates.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildF5BatchCommand, runF5Batch } from "../lib/tts/f5-mlx.mjs";
import { buildCV3BatchCommand } from "../lib/tts/cosyvoice3-mlx.mjs";

const F5_ARGS = {
  manifestPath: "/o/f5-manifest.json",
  outputDir: "/o/audio",
  refText: "reference text",
};

const CV3_ARGS = {
  manifestPath: "/o/cv3-manifest.json",
  outputDir: "/o/audio",
  refText: "reference text",
};

describe("F5 batch command offline env (#394)", () => {
  it("defaults to HF_HUB_OFFLINE=1", () => {
    expect(buildF5BatchCommand({ ...F5_ARGS, env: {} })).toContain("HF_HUB_OFFLINE=1");
  });

  it("honors an explicit HF_HUB_OFFLINE=0 from the parent env", () => {
    const cmd = buildF5BatchCommand({ ...F5_ARGS, env: { HF_HUB_OFFLINE: "0" } });
    expect(cmd).toContain("HF_HUB_OFFLINE=0");
    expect(cmd).not.toContain("HF_HUB_OFFLINE=1");
  });

  it("keeps the xet-transport workaround and the batch script wiring", () => {
    const cmd = buildF5BatchCommand({ ...F5_ARGS, env: {} });
    expect(cmd).toContain("HF_HUB_DISABLE_XET=1");
    expect(cmd).toContain("f5_mlx_batch_tts.py");
    expect(cmd).toContain('--manifest "/o/f5-manifest.json"');
    expect(cmd).toContain('--output-dir "/o/audio"');
  });
});

describe("CosyVoice3-MLX batch command offline env (#394)", () => {
  it("defaults to HF_HUB_OFFLINE=1", () => {
    expect(buildCV3BatchCommand({ ...CV3_ARGS, env: {} })).toContain("HF_HUB_OFFLINE=1");
  });

  it("honors an explicit HF_HUB_OFFLINE=0 from the parent env", () => {
    const cmd = buildCV3BatchCommand({ ...CV3_ARGS, env: { HF_HUB_OFFLINE: "0" } });
    expect(cmd).toContain("HF_HUB_OFFLINE=0");
    expect(cmd).not.toContain("HF_HUB_OFFLINE=1");
  });
});

describe("runF5Batch offline cache-miss diagnosis (#394)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints the fetch hint when the batch dies on an offline cache miss", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const miss = new Error(
      "huggingface_hub.errors.LocalEntryNotFoundError: Cannot find an appropriate cached snapshot folder for the specified revision on the local disk and outgoing traffic has been disabled.",
    );

    await expect(runF5Batch("cmd", { exec: () => Promise.reject(miss) })).rejects.toThrow(
      "LocalEntryNotFoundError",
    );

    const text = errSpy.mock.calls.flat().join("\n");
    expect(text).toContain("Offline HF cache miss");
    expect(text).toContain("lucasnewman/vocos-mel-24khz");
    expect(text).toContain("HF_HUB_OFFLINE=0");
  });

  it("rethrows untouched when the failure is unrelated", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("No F5-MLX results parsed from batch output");

    await expect(runF5Batch("cmd", { exec: () => Promise.reject(boom) })).rejects.toThrow(
      "No F5-MLX results parsed",
    );
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("returns the exec result on success", async () => {
    const result = await runF5Batch("cmd", {
      exec: () => Promise.resolve({ stdout: "[{}]", stderr: "" }),
    });
    expect(result.stdout).toBe("[{}]");
  });
});
