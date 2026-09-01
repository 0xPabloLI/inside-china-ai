import { describe, test, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

import { runBrollCli } from "../../generate-broll.mjs";
import { reportPath } from "../b-roll/report.mjs";

// CLI unit tests inject scene loading and the stage runner, so no real
// generation, VLM, or filesystem side effects beyond a temp output dir.

function fakeContent(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "broll-cli-"));
  return {
    root,
    slug: "demo",
    contentDir: join(root, "content", "demo"),
    outputDir: join(root, "output", "demo"),
    ...overrides,
  };
}

function collector() {
  const lines = [];
  return { lines, log: (s) => lines.push(String(s)) };
}

describe("runBrollCli", () => {
  test("--content missing -> exit 1", async () => {
    const c = collector();
    const { exitCode } = await runBrollCli({
      argv: [],
      loadScenes: async () => fakeContent(),
      log: c.log,
    });
    expect(exitCode).toBe(1);
    expect(c.lines.join("\n")).toMatch(/--content/);
  });

  test("--help lists the flags", async () => {
    const c = collector();
    const { exitCode } = await runBrollCli({ argv: ["--help"], log: c.log });
    expect(exitCode).toBe(0);
    const text = c.lines.join("\n");
    expect(text).toMatch(/--content/);
    expect(text).toMatch(/--scene/);
    expect(text).toMatch(/--force/);
    expect(text).toMatch(/--max-scenes/);
    expect(text).toMatch(/--threshold/);
  });

  test("#24 zero scenes needing generation -> clean exit, no report, no deps probe, stage not called", async () => {
    const dirs = fakeContent();
    let stageCalls = 0;
    try {
      const { exitCode } = await runBrollCli({
        argv: ["--content", "demo"],
        loadScenes: async () => ({
          ...dirs,
          scenes: [
            { id: "1", voiceover: "v" },
            { id: "2", voiceover: "v", mediaStrategy: "asset" },
          ],
        }),
        runStage: async () => {
          stageCalls += 1;
          return {
            counts: { generated: 0, cached: 0, failed: 0, escalated: 0, skipped: 2 },
            depsError: null,
            reportFile: null,
          };
        },
        log: () => {},
      });
      expect(exitCode).toBe(0);
      expect(stageCalls).toBe(0);
      expect(existsSync(reportPath(dirs.outputDir))).toBe(false);
    } finally {
      rmSync(dirs.root, { recursive: true, force: true });
    }
  });

  test("#20 --force, --scene, --threshold, --max-scenes are forwarded to the stage", async () => {
    const dirs = fakeContent();
    let stageOpts = null;
    try {
      const { exitCode, result } = await runBrollCli({
        argv: [
          "--content",
          "demo",
          "--scene",
          "6",
          "--force",
          "--threshold",
          "70",
          "--max-scenes",
          "1",
        ],
        loadScenes: async () => ({
          ...dirs,
          scenes: [
            { id: "5", voiceover: "v", aiVideo: { prompt: "p5" }, mediaStrategy: "b-roll" },
            { id: "6", voiceover: "v", aiVideo: { prompt: "p6" }, mediaStrategy: "b-roll" },
          ],
        }),
        runStage: async (opts) => {
          stageOpts = opts;
          return {
            counts: { generated: 1, cached: 0, failed: 0, escalated: 0, skipped: 0 },
            depsError: null,
            reportFile: null,
          };
        },
        log: () => {},
      });
      expect(exitCode).toBe(0);
      expect(stageOpts.force).toBe(true);
      expect(stageOpts.sceneFilter).toBe("6");
      expect(stageOpts.threshold).toBe(70);
      expect(stageOpts.maxScenes).toBe(1);
      expect(stageOpts.contentDir).toBe(dirs.contentDir);
      expect(stageOpts.outputDir).toBe(dirs.outputDir);
      expect(result.counts.generated).toBe(1);
    } finally {
      rmSync(dirs.root, { recursive: true, force: true });
    }
  });

  test("estimate is printed as sceneCount x 2 x 240s", async () => {
    const dirs = fakeContent();
    const c = collector();
    try {
      await runBrollCli({
        argv: ["--content", "demo"],
        loadScenes: async () => ({
          ...dirs,
          scenes: [
            { id: "5", voiceover: "v", aiVideo: { prompt: "p" }, mediaStrategy: "b-roll" },
            { id: "6", voiceover: "v", aiVideo: { prompt: "p" }, mediaStrategy: "b-roll" },
          ],
        }),
        runStage: async () => ({
          counts: { generated: 2, cached: 0, failed: 0, escalated: 0, skipped: 0 },
          depsError: null,
          reportFile: null,
        }),
        log: c.log,
      });
      const text = c.lines.join("\n");
      // 2 scenes x 2 candidates x 240s = 960s = 16min
      expect(text).toMatch(/960|16/);
    } finally {
      rmSync(dirs.root, { recursive: true, force: true });
    }
  });

  test("depsError -> exit 0 with warning (never blocks)", async () => {
    const dirs = fakeContent();
    const c = collector();
    try {
      const { exitCode } = await runBrollCli({
        argv: ["--content", "demo"],
        loadScenes: async () => ({
          ...dirs,
          scenes: [{ id: "5", voiceover: "v", aiVideo: { prompt: "p" }, mediaStrategy: "b-roll" }],
        }),
        runStage: async () => ({
          counts: { generated: 0, cached: 0, failed: 0, escalated: 0, skipped: 1 },
          depsError: "FastVideo repo not found at /nope",
          reportFile: null,
        }),
        log: c.log,
      });
      expect(exitCode).toBe(0);
      expect(c.lines.join("\n")).toMatch(/repo not found/);
    } finally {
      rmSync(dirs.root, { recursive: true, force: true });
    }
  });
});
