/**
 * #1028 — AI_IMAGE_BACKEND must select the whole backend: the mflux CLI that
 * is probed, the default checkpoint, the default step count and the
 * negative-prompt contract. Unknown values fail closed (same ruling as
 * BROLL_MODEL in #922) instead of silently generating with Boogu.
 *
 * This suite is the red baseline: it imports the module as a namespace so an
 * absent export fails on the specific assertion, not at import time.
 */
import { describe, test, expect } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as t2i from "../b-roll/t2i-runner.mjs";
import { runBrollStage } from "../b-roll/orchestrator.mjs";

const BOOGU_MODEL = "Boogu/Boogu-Image-0.1-Turbo";
const Z_IMAGE_MODEL = "z-image";
const SD35_MODEL = "stabilityai/stable-diffusion-3.5-medium";

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

describe("IMAGE_BACKEND_SPECS (#1028 single source of truth)", () => {
  test("every backend declares its own CLI, checkpoint, steps and CFG contract", () => {
    const specs = t2i.IMAGE_BACKEND_SPECS;
    expect(Object.keys(specs)).toEqual(["mflux-boogu", "mflux-z-image", "sd3.5"]);
    expect(specs["mflux-boogu"]).toMatchObject({
      binName: "mflux-generate-boogu",
      defaultModel: BOOGU_MODEL,
      defaultSteps: 4,
      supportsNegativePrompt: false,
    });
    expect(specs["mflux-z-image"]).toMatchObject({
      binName: "mflux-generate-z-image",
      defaultModel: Z_IMAGE_MODEL,
      defaultSteps: 50,
      supportsNegativePrompt: true,
    });
    expect(specs["sd3.5"]).toMatchObject({
      binName: "mflux-generate-sd3.5",
      defaultModel: SD35_MODEL,
      defaultSteps: 20,
      supportsNegativePrompt: true,
    });
    expect(Object.isFrozen(specs)).toBe(true);
  });

  test("resolveImageBackend rejects unknown keys instead of falling back to Boogu", () => {
    expect(t2i.resolveImageBackend({})).toBe("mflux-boogu");
    expect(t2i.resolveImageBackend({ AI_IMAGE_BACKEND: "mflux-z-image" })).toBe("mflux-z-image");
    expect(() => t2i.resolveImageBackend({ AI_IMAGE_BACKEND: "flux-dev" })).toThrow(
      /Unknown AI_IMAGE_BACKEND "flux-dev"/,
    );
  });

  test("resolveImageModel defaults to the backend checkpoint; AI_IMAGE_MODEL still wins", () => {
    expect(t2i.resolveImageModel({})).toBe(BOOGU_MODEL);
    expect(t2i.resolveImageModel({ AI_IMAGE_BACKEND: "mflux-z-image" })).toBe(Z_IMAGE_MODEL);
    expect(t2i.resolveImageModel({ AI_IMAGE_BACKEND: "sd3.5" })).toBe(SD35_MODEL);
    expect(
      t2i.resolveImageModel({ AI_IMAGE_BACKEND: "mflux-z-image", AI_IMAGE_MODEL: "org/custom" }),
    ).toBe("org/custom");
    expect(t2i.resolveImageModel({ AI_IMAGE_BACKEND: "mflux-z-image", AI_IMAGE_MODEL: "  " })).toBe(
      Z_IMAGE_MODEL,
    );
  });
});

describe("backend-specific dependency probing (#1028)", () => {
  let dir;
  let home;
  let binDir;

  const setup = () => {
    dir = mkdtempSync(join(tmpdir(), "t2i-backend-"));
    home = join(dir, "home");
    binDir = join(dir, "bin");
    mkdirSync(home);
    mkdirSync(binDir);
  };
  const teardown = () => rmSync(dir, { recursive: true, force: true });

  test("candidate paths are derived from the backend's CLI name", () => {
    setup();
    try {
      expect(t2i.mfluxBinCandidates("mflux-z-image", home)).toEqual([
        join(home, ".video-t2i-env", "bin", "mflux-generate-z-image"),
        join(home, ".video-tts-env", "bin", "mflux-generate-z-image"),
      ]);
      expect(t2i.mfluxBinCandidates("sd3.5", home)).toEqual([
        join(home, ".video-t2i-env", "bin", "mflux-generate-sd3.5"),
        join(home, ".video-tts-env", "bin", "mflux-generate-sd3.5"),
      ]);
      // The legacy exported constant stays the default backend's candidate list.
      expect(t2i.mfluxBinCandidates("mflux-boogu", home)[0]).toMatch(/mflux-generate-boogu$/);
    } finally {
      teardown();
    }
  });

  test("PATH fallback probes the backend CLI, not the Boogu one", () => {
    setup();
    try {
      const bin = join(binDir, "mflux-generate-z-image");
      writeFileSync(bin, "#!/bin/sh\n");
      chmodSync(bin, 0o755);
      const res = t2i.resolveImageDependencies({
        HOME: home,
        PATH: `${binDir}:/usr/bin:/bin`,
        AI_IMAGE_BACKEND: "mflux-z-image",
      });
      expect(res.ok).toBe(true);
      expect(res.backend).toBe("mflux-z-image");
      expect(res.bin).toBe(bin);
    } finally {
      teardown();
    }
  });

  test("sd3.5 cannot accidentally resolve the Boogu or Z-Image CLI", () => {
    setup();
    try {
      for (const name of ["mflux-generate-boogu", "mflux-generate-z-image"]) {
        const bin = join(binDir, name);
        writeFileSync(bin, "#!/bin/sh\n");
        chmodSync(bin, 0o755);
      }
      const res = t2i.resolveImageDependencies({
        HOME: home,
        PATH: binDir,
        AI_IMAGE_BACKEND: "sd3.5",
      });
      expect(res.ok).toBe(false);
      expect(res.missing).toContain("bin");
      expect(res.message).toMatch(/mflux-generate-sd3\.5/);
    } finally {
      teardown();
    }
  });

  test("MFLUX_BIN remains the explicit override, but unknown backends still fail closed", () => {
    setup();
    try {
      const bin = join(binDir, "my-mflux");
      writeFileSync(bin, "#!/bin/sh\n");
      const ok = t2i.resolveImageDependencies({
        HOME: home,
        PATH: `${binDir}:/usr/bin:/bin`,
        MFLUX_BIN: bin,
        AI_IMAGE_BACKEND: "sd3.5",
      });
      expect(ok.ok).toBe(true);
      expect(ok.bin).toBe(bin);
      expect(() =>
        t2i.resolveImageDependencies({
          HOME: home,
          PATH: `${binDir}:/usr/bin:/bin`,
          MFLUX_BIN: bin,
          AI_IMAGE_BACKEND: "nope",
        }),
      ).toThrow(/Unknown AI_IMAGE_BACKEND/);
    } finally {
      teardown();
    }
  });
});

describe("buildImageArgs defaults follow the backend (#1028)", () => {
  const base = { prompt: "an abstract diagram", outputPath: "/out/a.png", seed: 7 };
  const argsFor = (backend, extra = {}) => t2i.buildImageArgs({ ...base, backend, ...extra });

  test("Boogu keeps the exact pre-#1028 generation parameters", () => {
    expect(argsFor("mflux-boogu")).toEqual([
      "--prompt",
      "an abstract diagram",
      "--output",
      "/out/a.png",
      "--seed",
      "7",
      "--width",
      "832",
      "--height",
      "1216",
      "--steps",
      "4",
      "--model",
      BOOGU_MODEL,
      "--quantize",
      "4",
    ]);
  });

  test("Z-Image gets its own checkpoint, step count and negative prompt", () => {
    const args = argsFor("mflux-z-image", { negativePrompt: "no text" });
    expect(argValue(args, "--model")).toBe(Z_IMAGE_MODEL);
    expect(argValue(args, "--steps")).toBe("50");
    expect(argValue(args, "--negative-prompt")).toBe("no text");
  });

  test("SD3.5 gets its own checkpoint and step count", () => {
    const args = argsFor("sd3.5", { negativePrompt: "no text" });
    expect(argValue(args, "--model")).toBe(SD35_MODEL);
    expect(argValue(args, "--steps")).toBe("20");
    expect(argValue(args, "--negative-prompt")).toBe("no text");
  });

  test("Turbo still never receives --negative-prompt", () => {
    expect(argsFor("mflux-boogu", { negativePrompt: "no text" })).not.toContain(
      "--negative-prompt",
    );
  });

  test("explicit model/steps overrides still win", () => {
    const args = argsFor("mflux-z-image", { model: "org/custom", steps: 9 });
    expect(argValue(args, "--model")).toBe("org/custom");
    expect(argValue(args, "--steps")).toBe("9");
  });

  test("an unknown backend fails closed at argument construction", () => {
    expect(() => argsFor("flux-dev")).toThrow(/Unknown AI_IMAGE_BACKEND/);
  });
});

describe("runImageGeneration resolves defaults from the backend (#1028)", () => {
  let dir;

  const captureStub = () => {
    dir = mkdtempSync(join(tmpdir(), "t2i-capture-"));
    const capture = join(dir, "args.json");
    const stub = join(dir, "capture.mjs");
    writeFileSync(
      stub,
      `import { writeFileSync } from "node:fs";
       writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2)));
       const i = process.argv.indexOf("--output");
       writeFileSync(process.argv[i + 1], "fake png");`,
    );
    return { stub, capture, out: join(dir, "out.png") };
  };

  const run = (stub, out, overrides = {}) =>
    t2i.runImageGeneration({
      bin: process.execPath,
      scriptPath: stub,
      workDir: dir,
      jobs: [{ label: "out.png", prompt: "p", output_path: out, seed: 1 }],
      ...overrides,
    });

  test("the default backend produces byte-identical CLI args to pre-#1028", async () => {
    const { stub, capture, out } = captureStub();
    try {
      await run(stub, out);
      const args = JSON.parse(readFileSync(capture, "utf8"));
      expect(args).toEqual([
        "--prompt",
        "p",
        "--output",
        out,
        "--seed",
        "1",
        "--width",
        "832",
        "--height",
        "1216",
        "--steps",
        "4",
        "--model",
        BOOGU_MODEL,
        "--quantize",
        "4",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an env-selected backend changes checkpoint and steps in the spawned CLI", async () => {
    const { stub, capture, out } = captureStub();
    try {
      await run(stub, out, {
        backend: "mflux-z-image",
        env: { AI_IMAGE_BACKEND: "mflux-z-image", PATH: process.env.PATH },
      });
      const args = JSON.parse(readFileSync(capture, "utf8"));
      expect(argValue(args, "--model")).toBe(Z_IMAGE_MODEL);
      expect(argValue(args, "--steps")).toBe("50");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("AI_IMAGE_STEPS / AI_IMAGE_MODEL overrides still win for any backend", async () => {
    const { stub, capture, out } = captureStub();
    try {
      await run(stub, out, {
        backend: "mflux-z-image",
        env: {
          AI_IMAGE_BACKEND: "mflux-z-image",
          AI_IMAGE_MODEL: "org/custom",
          AI_IMAGE_STEPS: "9",
          PATH: process.env.PATH,
        },
      });
      const args = JSON.parse(readFileSync(capture, "utf8"));
      expect(argValue(args, "--model")).toBe("org/custom");
      expect(argValue(args, "--steps")).toBe("9");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an unknown backend refuses to spawn any generation job", async () => {
    const { stub, out } = captureStub();
    try {
      expect(() =>
        run(stub, out, { env: { AI_IMAGE_BACKEND: "nope", PATH: process.env.PATH } }),
      ).toThrow(/Unknown AI_IMAGE_BACKEND/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a process-level unknown backend still fails closed without opts.env", () => {
    const { stub, out } = captureStub();
    const prev = process.env.AI_IMAGE_BACKEND;
    process.env.AI_IMAGE_BACKEND = "flux-dev";
    try {
      expect(() =>
        t2i.runImageGeneration({
          bin: process.execPath,
          scriptPath: stub,
          workDir: dir,
          jobs: [{ label: "out.png", prompt: "p", output_path: out, seed: 1 }],
        }),
      ).toThrow(/Unknown AI_IMAGE_BACKEND/);
    } finally {
      if (prev === undefined) delete process.env.AI_IMAGE_BACKEND;
      else process.env.AI_IMAGE_BACKEND = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("provenance and stage-level fail-closed (#1028)", () => {
  test("the source label follows the backend-derived checkpoint", () => {
    const label = t2i.imageModelSourceLabel(
      t2i.resolveImageModel({ AI_IMAGE_BACKEND: "mflux-z-image" }),
    );
    expect(label).toBe("AI-generated (mflux z-image)");
    expect(t2i.isImageSourceLabel(label)).toBe(true);
    expect(t2i.imageModelSourceLabel(t2i.resolveImageModel({}))).toBe(
      "AI-generated (mflux Boogu Turbo)",
    );
  });

  test("runBrollStage refuses an unknown AI_IMAGE_BACKEND before generating", async () => {
    const root = mkdtempSync(join(tmpdir(), "t2i-stage-"));
    try {
      const contentDir = join(root, "content");
      const outputDir = join(root, "output");
      mkdirSync(contentDir, { recursive: true });
      mkdirSync(outputDir, { recursive: true });
      await expect(
        runBrollStage({
          scenes: [],
          contentSlug: "demo",
          contentDir,
          outputDir,
          env: { AI_IMAGE_BACKEND: "flux-dev" },
        }),
      ).rejects.toThrow(/Unknown AI_IMAGE_BACKEND/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a run with real image scenes refuses a bad backend with zero generation calls", async () => {
    const root = mkdtempSync(join(tmpdir(), "t2i-stage-"));
    let generateCalls = 0;
    try {
      const contentDir = join(root, "content");
      const outputDir = join(root, "output");
      mkdirSync(contentDir, { recursive: true });
      mkdirSync(outputDir, { recursive: true });
      await expect(
        runBrollStage({
          scenes: [
            {
              id: 1,
              mediaStrategy: "ai-image",
              aiImage: { prompt: "abstract diagram" },
              voiceover: "v",
            },
          ],
          contentSlug: "demo",
          contentDir,
          outputDir,
          env: { AI_IMAGE_BACKEND: "flux-dev" },
          generate: async () => {
            generateCalls += 1;
            return { ok: true, fatal: null, results: [] };
          },
        }),
      ).rejects.toThrow(/Unknown AI_IMAGE_BACKEND/);
      expect(generateCalls).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
