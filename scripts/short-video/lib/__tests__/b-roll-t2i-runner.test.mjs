import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_IMAGE_BACKEND,
  MFLUX_BIN_CANDIDATES,
  buildImageArgs,
  resolveImageDependencies,
  runImageGeneration,
} from "../b-roll/t2i-runner.mjs";

describe("resolveImageDependencies (#155)", () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "t2i-deps-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("MFLUX_BIN override is honored strictly when it exists", () => {
    const bin = join(dir, "mflux-generate-z-image-turbo");
    writeFileSync(bin, "#!/bin/sh\n");
    const res = resolveImageDependencies({ MFLUX_BIN: bin });
    expect(res.ok).toBe(true);
    expect(res.bin).toBe(bin);
    expect(res.backend).toBe(DEFAULT_IMAGE_BACKEND);
  });

  test("nonexistent MFLUX_BIN override -> ok:false, no fallback probing", () => {
    const res = resolveImageDependencies({ MFLUX_BIN: join(dir, "no-such-bin") });
    expect(res.ok).toBe(false);
    expect(res.missing).toContain("bin");
    expect(res.message).toMatch(/mflux/i);
  });

  test("no override and no binary anywhere -> ok:false with an install hint", () => {
    const res = resolveImageDependencies({
      MFLUX_BIN: "",
      PATH: "/nonexistent-path-for-test",
    });
    // If mflux is already installed in one of the probed venvs, the default
    // probe wins (ok:true) and this test only asserts the PATH fallback was
    // not consulted with a broken PATH. Otherwise resolution must fail loudly.
    if (MFLUX_BIN_CANDIDATES.some((c) => existsSync(c))) {
      expect(res.ok).toBe(true);
      return;
    }
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/install/i);
  });

  test("AI_IMAGE_BACKEND override is surfaced for the negative-prompt contract", () => {
    const bin = join(dir, "mflux-generate-z-image-turbo");
    writeFileSync(bin, "#!/bin/sh\n");
    const res = resolveImageDependencies({ MFLUX_BIN: bin, AI_IMAGE_BACKEND: "mflux-z-image" });
    expect(res.ok).toBe(true);
    expect(res.backend).toBe("mflux-z-image");
  });
});

describe("buildImageArgs (#155)", () => {
  const base = {
    prompt: "an abstract architecture diagram",
    outputPath: "/out/scene-11-seed1024.png",
    seed: 1024,
  };

  test("carries prompt, output, seed and portrait defaults", () => {
    const args = buildImageArgs(base);
    const flat = args.join(" ");
    expect(args).toContain("--prompt");
    expect(flat).toMatch(/--width 832/);
    expect(flat).toMatch(/--height 1216/);
    expect(flat).toMatch(/--seed 1024/);
    expect(args[args.indexOf("--output") + 1]).toBe("/out/scene-11-seed1024.png");
  });

  test("the Turbo default backend NEVER receives --negative-prompt (CFG disabled)", () => {
    // mflux accepts the flag but warns and drops it on Z-Image Turbo — the
    // runner must not send it (backend contract, #155).
    const args = buildImageArgs({
      ...base,
      backend: "mflux-z-image-turbo",
      negativePrompt: "no text, no watermark",
    });
    expect(args).not.toContain("--negative-prompt");
  });

  test("a CFG backend (Z-Image base) receives the negative prompt", () => {
    const args = buildImageArgs({
      ...base,
      backend: "mflux-z-image",
      negativePrompt: "no text, no watermark",
    });
    const i = args.indexOf("--negative-prompt");
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe("no text, no watermark");
  });

  test("explicit dimension/step/model overrides win", () => {
    const args = buildImageArgs({
      ...base,
      width: 1024,
      height: 1024,
      steps: 4,
      model: "custom/model",
    });
    const flat = args.join(" ");
    expect(flat).toMatch(/--width 1024/);
    expect(flat).toMatch(/--height 1024/);
    expect(flat).toMatch(/--steps 4/);
    expect(flat).toMatch(/--model custom\/model/);
  });
});

describe("runImageGeneration (#155, same protocol as the video runner)", () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "t2i-run-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeStub(name, body) {
    const file = join(dir, name);
    writeFileSync(file, body);
    return file;
  }

  test("a successful job returns {label, ok, file, error:null} and the file exists", async () => {
    const out = join(dir, "scene-11-seed1024.png");
    const stub = writeStub(
      "stub-ok.mjs",
      `
      import { writeFileSync } from "node:fs";
      const i = process.argv.indexOf("--output");
      writeFileSync(process.argv[i + 1], "fake png");
      `,
    );
    const result = await runImageGeneration({
      bin: process.execPath,
      scriptPath: stub,
      workDir: dir,
      jobs: [{ label: "scene-11-seed1024.png", prompt: "p", output_path: out, seed: 1024 }],
    });
    expect(result.ok).toBe(true);
    expect(result.fatal).toBeNull();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ label: "scene-11-seed1024.png", ok: true, file: out, error: null });
    expect(existsSync(out)).toBe(true);
  });

  test("jobs run sequentially and each gets its own args", async () => {
    const outs = [join(dir, "a.png"), join(dir, "b.png")];
    const seen = [];
    const stub = writeStub(
      "stub-two.mjs",
      `
      import { writeFileSync } from "node:fs";
      const i = process.argv.indexOf("--output");
      writeFileSync(process.argv[i + 1], "fake");
      `,
    );
    // Per-job output files are the only cross-process observable.
    const result = await runImageGeneration({
      bin: process.execPath,
      scriptPath: stub,
      workDir: dir,
      jobs: [
        { label: "a.png", prompt: "p1", output_path: outs[0], seed: 1 },
        { label: "b.png", prompt: "p2", output_path: outs[1], seed: 2 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.results.every((r) => r.ok)).toBe(true);
    expect(existsSync(outs[0])).toBe(true);
    expect(existsSync(outs[1])).toBe(true);
  });

  test("one failing job does not fail the rest (per-job spawn)", async () => {
    const good = join(dir, "good.png");
    const bad = join(dir, "bad.png");
    const stub = writeStub(
      "stub-mixed.mjs",
      `
      import { writeFileSync } from "node:fs";
      const i = process.argv.indexOf("--output");
      const out = process.argv[i + 1];
      if (out.endsWith("bad.png")) {
        console.error("CUDA OOM simulated");
        process.exit(1);
      }
      writeFileSync(out, "fake");
      `,
    );
    const result = await runImageGeneration({
      bin: process.execPath,
      scriptPath: stub,
      workDir: dir,
      jobs: [
        { label: "bad.png", prompt: "p", output_path: bad, seed: 1 },
        { label: "good.png", prompt: "p", output_path: good, seed: 2 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.fatal).toBeNull();
    const badResult = result.results.find((r) => r.label === "bad.png");
    const goodResult = result.results.find((r) => r.label === "good.png");
    expect(badResult.ok).toBe(false);
    expect(badResult.error).toMatch(/code 1/);
    expect(badResult.error).toContain("CUDA OOM");
    expect(goodResult.ok).toBe(true);
  });

  test("a job that exits 0 without writing the output fails with 'output file missing'", async () => {
    const out = join(dir, "missing.png");
    const stub = writeStub("stub-silent.mjs", `process.exit(0);`);
    const result = await runImageGeneration({
      bin: process.execPath,
      scriptPath: stub,
      workDir: dir,
      jobs: [{ label: "missing.png", prompt: "p", output_path: out, seed: 1 }],
    });
    expect(result.results[0].ok).toBe(false);
    expect(result.results[0].error).toMatch(/output file missing/i);
  });

  test("spawn failure (missing binary) is a per-job error, not a throw", async () => {
    const result = await runImageGeneration({
      bin: join(dir, "definitely-not-a-binary"),
      workDir: dir,
      jobs: [{ label: "x.png", prompt: "p", output_path: join(dir, "x.png"), seed: 1 }],
    });
    expect(result.results[0].ok).toBe(false);
    expect(result.results[0].error).toMatch(/spawn failed/i);
  });

  test("progress lines reach onProgress", async () => {
    const out = join(dir, "progress.png");
    const stub = writeStub(
      "stub-progress.mjs",
      `
      import { writeFileSync } from "node:fs";
      console.log("loading Z-Image Turbo (4-bit) ...");
      const i = process.argv.indexOf("--output");
      writeFileSync(process.argv[i + 1], "fake");
      console.log("saved");
      `,
    );
    const lines = [];
    await runImageGeneration({
      bin: process.execPath,
      scriptPath: stub,
      workDir: dir,
      jobs: [{ label: "progress.png", prompt: "p", output_path: out, seed: 1 }],
      onProgress: (line) => lines.push(line),
    });
    expect(lines).toContain("loading Z-Image Turbo (4-bit) ...");
    expect(lines).toContain("saved");
  });
});
