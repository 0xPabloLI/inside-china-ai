import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveDependencies, buildPythonArgs, runGeneration } from "../b-roll/runner.mjs";

describe("resolveDependencies (scenario #11)", () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "broll-deps-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("missing repo -> ok:false with the offending path in the message", () => {
    const python = join(dir, "python3");
    writeFileSync(python, "#!/bin/sh\n");
    const res = resolveDependencies({
      FASTVIDEO_REPO: join(dir, "no-such-repo"),
      FASTVIDEO_PYTHON: python,
    });
    expect(res.ok).toBe(false);
    expect(res.missing).toContain("repo");
    expect(res.message).toMatch(/repo/i);
    expect(res.message).toContain("no-such-repo");
  });

  test("missing python -> ok:false naming python", () => {
    const repo = join(dir, "repo");
    writeFileSync(repo, "");
    const res = resolveDependencies({
      FASTVIDEO_REPO: repo,
      FASTVIDEO_PYTHON: join(dir, "no-such-python"),
    });
    expect(res.ok).toBe(false);
    expect(res.missing).toContain("python");
  });

  test("both present -> ok:true with resolved paths", () => {
    const repo = join(dir, "repo2");
    writeFileSync(repo, "");
    const python = join(dir, "python2");
    writeFileSync(python, "#!/bin/sh\n");
    const res = resolveDependencies({ FASTVIDEO_REPO: repo, FASTVIDEO_PYTHON: python });
    expect(res.ok).toBe(true);
    expect(res.repo).toBe(repo);
    expect(res.python).toBe(python);
  });

  test("#159 no model overrides -> null model paths, still ok", () => {
    const repo = join(dir, "repo3");
    writeFileSync(repo, "");
    const python = join(dir, "python3");
    writeFileSync(python, "#!/bin/sh\n");
    const res = resolveDependencies({ FASTVIDEO_REPO: repo, FASTVIDEO_PYTHON: python });
    expect(res.ok).toBe(true);
    expect(res.modelRoot).toBeNull();
    expect(res.mlxCheckpoint).toBeNull();
  });

  test("#159 BROLL_MODEL_ROOT pointing nowhere -> ok:false naming the path", () => {
    const repo = join(dir, "repo4");
    writeFileSync(repo, "");
    const python = join(dir, "python4");
    writeFileSync(python, "#!/bin/sh\n");
    const res = resolveDependencies({
      FASTVIDEO_REPO: repo,
      FASTVIDEO_PYTHON: python,
      BROLL_MODEL_ROOT: join(dir, "no-such-model"),
    });
    expect(res.ok).toBe(false);
    expect(res.missing).toContain("modelRoot");
    expect(res.message).toContain("no-such-model");
  });

  test("#159 BROLL_MLX_CHECKPOINT without mlx_dit.safetensors -> ok:false naming the file", () => {
    const repo = join(dir, "repo5");
    writeFileSync(repo, "");
    const python = join(dir, "python5");
    writeFileSync(python, "#!/bin/sh\n");
    const empty = mkdtempSync(join(dir, "ckpt-empty-"));
    const res = resolveDependencies({
      FASTVIDEO_REPO: repo,
      FASTVIDEO_PYTHON: python,
      BROLL_MLX_CHECKPOINT: empty,
    });
    expect(res.ok).toBe(false);
    expect(res.missing).toContain("mlxCheckpoint");
    expect(res.message).toContain("mlx_dit.safetensors");
  });

  test("#159 valid overrides -> forwarded verbatim", () => {
    const repo = join(dir, "repo6");
    writeFileSync(repo, "");
    const python = join(dir, "python6");
    writeFileSync(python, "#!/bin/sh\n");
    const modelRoot = mkdtempSync(join(dir, "model-"));
    const ckpt = mkdtempSync(join(dir, "ckpt-"));
    writeFileSync(join(ckpt, "mlx_dit.json"), "{}");
    writeFileSync(join(ckpt, "mlx_dit.safetensors"), "");
    const res = resolveDependencies({
      FASTVIDEO_REPO: repo,
      FASTVIDEO_PYTHON: python,
      BROLL_MODEL_ROOT: modelRoot,
      BROLL_MLX_CHECKPOINT: ckpt,
    });
    expect(res.ok).toBe(true);
    expect(res.modelRoot).toBe(modelRoot);
    expect(res.mlxCheckpoint).toBe(ckpt);
  });

  test("#159 model root without a packed DiT is fine (text encoder/VAE only)", () => {
    const repo = join(dir, "repo7");
    writeFileSync(repo, "");
    const python = join(dir, "python7");
    writeFileSync(python, "#!/bin/sh\n");
    const modelRoot = mkdtempSync(join(dir, "model-nodit-"));
    const res = resolveDependencies({
      FASTVIDEO_REPO: repo,
      FASTVIDEO_PYTHON: python,
      BROLL_MODEL_ROOT: modelRoot,
    });
    expect(res.ok).toBe(true);
    expect(res.modelRoot).toBe(modelRoot);
    expect(res.mlxCheckpoint).toBeNull();
  });
});

describe("buildPythonArgs (scenario #26)", () => {
  test("defaults to portrait 480x832 Tier A params", () => {
    const args = buildPythonArgs({
      repo: "/r",
      jobsFile: "/tmp/jobs.json",
    });
    const flat = args.join(" ");
    expect(args).toContain("--repo");
    expect(args).toContain("/r");
    expect(args).toContain("--jobs");
    expect(args).toContain("/tmp/jobs.json");
    expect(flat).toMatch(/--height 832/);
    expect(flat).toMatch(/--width 480/);
    expect(flat).toMatch(/--num-frames 81/);
    expect(flat).toMatch(/--mlx-quantization int8/);
    expect(flat).toMatch(/--decode-backend taehv/);
    expect(flat).toMatch(/--dmd-denoising-steps 1000,757,522/);
  });

  test("explicit overrides win", () => {
    const args = buildPythonArgs({
      repo: "/r",
      jobsFile: "/j.json",
      height: 480,
      width: 832,
    });
    const flat = args.join(" ");
    expect(flat).toMatch(/--height 480/);
    expect(flat).toMatch(/--width 832/);
  });

  test("#159 no model override -> no model flags (still resolves via the HF cache)", () => {
    const args = buildPythonArgs({ repo: "/r", jobsFile: "/j.json" });
    expect(args).not.toContain("--model-root");
    expect(args).not.toContain("--mlx-checkpoint");
  });

  test("#159 explicit model root + mlx checkpoint are forwarded to python", () => {
    const args = buildPythonArgs({
      repo: "/r",
      jobsFile: "/j.json",
      modelRoot: "/models/FastMetal-1.3B-QAD",
      mlxCheckpoint: "/models/FastMetal-1.3B-QAD",
    });
    const flat = args.join(" ");
    expect(flat).toMatch(/--model-root \/models\/FastMetal-1\.3B-QAD/);
    expect(flat).toMatch(/--mlx-checkpoint \/models\/FastMetal-1\.3B-QAD/);
  });

  test("#159 each model flag is forwarded independently", () => {
    const rootOnly = buildPythonArgs({ repo: "/r", jobsFile: "/j.json", modelRoot: "/root" });
    expect(rootOnly).toContain("--model-root");
    expect(rootOnly).not.toContain("--mlx-checkpoint");

    const ckptOnly = buildPythonArgs({ repo: "/r", jobsFile: "/j.json", mlxCheckpoint: "/ckpt" });
    expect(ckptOnly).toContain("--mlx-checkpoint");
    expect(ckptOnly).not.toContain("--model-root");
  });
});

describe("runGeneration (scenario #23 + fault tolerance)", () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "broll-run-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // The "python" binary is injectable: tests substitute node + a stub script
  // that speaks the batch runner's result protocol.
  function writeStub(name, body) {
    const file = join(dir, name);
    writeFileSync(file, body);
    return file;
  }

  test("progress lines reach onProgress; the results payload does not", async () => {
    const out = join(dir, "scene-7-seed1024.mp4");
    const stub = writeStub(
      "stub-progress.mjs",
      `
      import { writeFileSync } from "node:fs";
      console.log("[batch] loading MLX DiT (once) ...");
      console.log("[batch] job 1/1 [scene-7-seed1024]");
      writeFileSync(${JSON.stringify(out)}, "fake");
      console.log('[batch][results] ' + JSON.stringify({ ok: ["scene-7-seed1024"], failed: [] }));
      `,
    );
    const lines = [];
    const result = await runGeneration({
      python: process.execPath,
      scriptPath: stub,
      repo: dir,
      workDir: dir,
      jobs: [{ label: "scene-7-seed1024", prompt: "p", output_path: out, seed: 1024 }],
      onProgress: (line) => lines.push(line),
    });
    expect(result.ok).toBe(true);
    expect(lines).toEqual([
      "[batch] loading MLX DiT (once) ...",
      "[batch] job 1/1 [scene-7-seed1024]",
    ]);
  });

  test("child runs unbuffered so progress is not held until exit", async () => {
    const out = join(dir, "scene-9-seed1024.mp4");
    const stub = writeStub(
      "stub-unbuffered.mjs",
      `
      import { writeFileSync } from "node:fs";
      console.log("[batch] PYTHONUNBUFFERED=" + (process.env.PYTHONUNBUFFERED ?? "unset"));
      writeFileSync(${JSON.stringify(out)}, "fake");
      console.log('[batch][results] ' + JSON.stringify({ ok: ["scene-9-seed1024"], failed: [] }));
      `,
    );
    const lines = [];
    await runGeneration({
      python: process.execPath,
      scriptPath: stub,
      repo: dir,
      workDir: dir,
      jobs: [{ label: "scene-9-seed1024", prompt: "p", output_path: out, seed: 1024 }],
      onProgress: (line) => lines.push(line),
    });
    expect(lines).toContain("[batch] PYTHONUNBUFFERED=1");
  });

  test("child runs HF-offline by default so the local cache needs no version check", async () => {
    const out = join(dir, "scene-10-seed1024.mp4");
    const stub = writeStub(
      "stub-hfoffline.mjs",
      `
      import { writeFileSync } from "node:fs";
      console.log("[batch] HF_HUB_OFFLINE=" + (process.env.HF_HUB_OFFLINE ?? "unset"));
      writeFileSync(${JSON.stringify(out)}, "fake");
      console.log('[batch][results] ' + JSON.stringify({ ok: ["scene-10-seed1024"], failed: [] }));
      `,
    );
    const lines = [];
    await runGeneration({
      python: process.execPath,
      scriptPath: stub,
      repo: dir,
      workDir: dir,
      jobs: [{ label: "scene-10-seed1024", prompt: "p", output_path: out, seed: 1024 }],
      onProgress: (line) => lines.push(line),
    });
    expect(lines).toContain("[batch] HF_HUB_OFFLINE=1");
  });

  test("explicit HF_HUB_OFFLINE=0 from the parent is honored (opt-out)", async () => {
    const out = join(dir, "scene-11-seed1024.mp4");
    const stub = writeStub(
      "stub-hfoffline0.mjs",
      `
      import { writeFileSync } from "node:fs";
      console.log("[batch] HF_HUB_OFFLINE=" + (process.env.HF_HUB_OFFLINE ?? "unset"));
      writeFileSync(${JSON.stringify(out)}, "fake");
      console.log('[batch][results] ' + JSON.stringify({ ok: ["scene-11-seed1024"], failed: [] }));
      `,
    );
    const lines = [];
    await runGeneration({
      python: process.execPath,
      scriptPath: stub,
      repo: dir,
      workDir: dir,
      jobs: [{ label: "scene-11-seed1024", prompt: "p", output_path: out, seed: 1024 }],
      onProgress: (line) => lines.push(line),
      env: { HF_HUB_OFFLINE: "0" },
    });
    expect(lines).toContain("[batch] HF_HUB_OFFLINE=0");
  });

  test("#23 one job crashes -> the rest survive, structured per-job results", async () => {
    const outA = join(dir, "scene-6-seed1024.mp4");
    const outB = join(dir, "scene-6-seed2048.mp4");
    const stub = writeStub(
      "stub-partial.mjs",
      `
      import { writeFileSync } from "node:fs";
      const argv = process.argv.slice(2);
      const jobsFile = argv[argv.indexOf("--jobs") + 1];
      void jobsFile;
      writeFileSync(${JSON.stringify(outA)}, "fake");
      console.log('[batch][results] ' + JSON.stringify({
        ok: ["scene-6-seed1024"],
        failed: [{ label: "scene-6-seed2048", error: "denoise: OOM" }],
      }));
      `,
    );
    const result = await runGeneration({
      python: process.execPath,
      scriptPath: stub,
      repo: dir,
      workDir: dir,
      jobs: [
        { label: "scene-6-seed1024", prompt: "p", output_path: outA, seed: 1024 },
        { label: "scene-6-seed2048", prompt: "p", output_path: outB, seed: 2048 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.fatal).toBeNull();
    const byLabel = Object.fromEntries(result.results.map((r) => [r.label, r]));
    expect(byLabel["scene-6-seed1024"].ok).toBe(true);
    expect(byLabel["scene-6-seed2048"].ok).toBe(false);
    expect(byLabel["scene-6-seed2048"].error).toMatch(/OOM/);
    expect(existsSync(outA)).toBe(true);
  });

  test("result says ok but output file missing -> demoted to failed", async () => {
    const outA = join(dir, "ghost-seed1.mp4");
    const stub = writeStub(
      "stub-ghost.mjs",
      `console.log('[batch][results] ' + JSON.stringify({ ok: ["ghost-seed1"], failed: [] }));`,
    );
    const result = await runGeneration({
      python: process.execPath,
      scriptPath: stub,
      repo: dir,
      workDir: dir,
      jobs: [{ label: "ghost-seed1", prompt: "p", output_path: outA, seed: 1 }],
    });
    expect(result.results[0].ok).toBe(false);
    expect(result.results[0].error).toMatch(/missing/i);
  });

  test("fatal crash (non-zero exit) -> ok:false with stderr tail", async () => {
    const stub = writeStub(
      "stub-fatal.mjs",
      `console.error("[batch][fatal] repo not found: /wrong"); process.exit(2);`,
    );
    const result = await runGeneration({
      python: process.execPath,
      scriptPath: stub,
      repo: dir,
      workDir: dir,
      jobs: [{ label: "x-seed1", prompt: "p", output_path: join(dir, "x.mp4"), seed: 1 }],
    });
    expect(result.ok).toBe(false);
    expect(result.fatal).toMatch(/repo not found/);
  });

  test("jobs file is written to workDir and passed as an absolute path", async () => {
    const stub = writeStub(
      "stub-echo.mjs",
      `
      import { readFileSync, writeFileSync } from "node:fs";
      const argv = process.argv.slice(2);
      const jobsFile = argv[argv.indexOf("--jobs") + 1];
      const jobs = JSON.parse(readFileSync(jobsFile, "utf8"));
      for (const job of jobs) writeFileSync(job.output_path, "fake");
      console.log('[batch][results] ' + JSON.stringify({ ok: jobs.map(j => j.label), failed: [] }));
      `,
    );
    const result = await runGeneration({
      python: process.execPath,
      scriptPath: stub,
      repo: dir,
      workDir: dir,
      jobs: [{ label: "echo-seed1", prompt: "p", output_path: join(dir, "e.mp4"), seed: 5 }],
    });
    expect(result.results[0].ok).toBe(true);
    expect(result.results[0].label).toBe("echo-seed1");
  });

  test("#159 model overrides reach the python argv", async () => {
    const out = join(dir, "model-args.mp4");
    const stub = writeStub(
      "stub-model-args.mjs",
      `
      import { writeFileSync } from "node:fs";
      console.log("[batch] argv=" + process.argv.slice(2).join(" "));
      writeFileSync(${JSON.stringify(out)}, "fake");
      console.log('[batch][results] ' + JSON.stringify({ ok: ["model-args"], failed: [] }));
      `,
    );
    const lines = [];
    await runGeneration({
      python: process.execPath,
      scriptPath: stub,
      repo: dir,
      workDir: dir,
      jobs: [{ label: "model-args", prompt: "p", output_path: out, seed: 1 }],
      modelRoot: "/models/FastMetal-1.3B-QAD",
      mlxCheckpoint: "/models/FastMetal-1.3B-QAD",
      onProgress: (line) => lines.push(line),
    });
    const argv = lines.find((l) => l.startsWith("[batch] argv=")) ?? "";
    expect(argv).toContain("--model-root /models/FastMetal-1.3B-QAD");
    expect(argv).toContain("--mlx-checkpoint /models/FastMetal-1.3B-QAD");
  });

  test("#159 unpinned models -> no model flags in the python argv", async () => {
    const out = join(dir, "model-none.mp4");
    const stub = writeStub(
      "stub-model-none.mjs",
      `
      import { writeFileSync } from "node:fs";
      console.log("[batch] argv=" + process.argv.slice(2).join(" "));
      writeFileSync(${JSON.stringify(out)}, "fake");
      console.log('[batch][results] ' + JSON.stringify({ ok: ["model-none"], failed: [] }));
      `,
    );
    const lines = [];
    await runGeneration({
      python: process.execPath,
      scriptPath: stub,
      repo: dir,
      workDir: dir,
      jobs: [{ label: "model-none", prompt: "p", output_path: out, seed: 1 }],
      onProgress: (line) => lines.push(line),
    });
    const argv = lines.find((l) => l.startsWith("[batch] argv=")) ?? "";
    expect(argv).not.toContain("--model-root");
    expect(argv).not.toContain("--mlx-checkpoint");
  });
});
