/**
 * Tests for the evidence-capture runner (#758).
 *
 * No real browser: the fake page exposes the same surface the producer uses
 * (goto / locator / CDP session) and returns a real PNG, so the byte and pixel
 * verification in `captureFromPage` runs for real.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { PNG } from "pngjs";
import { buildClip, buildProvenance } from "../lib/evidence-capture.mjs";
import {
  captureEvidenceShot,
  captureFromPage,
  findUncoveredEvidenceScenes,
  loadCaptureManifest,
  planEvidenceCaptures,
  runEvidenceCaptures,
} from "../lib/evidence-capture-runner.mjs";

const RECT = { x: 0, y: 284, w: 932, h: 453 };
const CLIP = buildClip(RECT, 16);
const SCALE = 2;

const RECIPE_ENTRY = {
  url: "https://example.com/changelog",
  selector: "table",
  padding: 16,
  deviceScaleFactor: SCALE,
  viewport: { width: 1280, height: 900 },
  waitUntil: "load",
  timeoutMs: 30000,
};

const provenanceFor = (rect = RECT, padding = 16) =>
  buildProvenance({
    sourceUrl: RECIPE_ENTRY.url,
    selector: RECIPE_ENTRY.selector,
    rect,
    clip: buildClip(rect, padding),
    scale: SCALE,
  });

function pngBytes(width, height) {
  const png = new PNG({ width, height });
  png.data.fill(0xcc);
  return PNG.sync.write(png);
}

function pngSize(absPath) {
  const png = PNG.sync.read(readFileSync(absPath));
  return { width: png.width, height: png.height };
}

/**
 * Fake page. `counts` is consumed in order so one page can return 0 then 1 if a
 * test ever needs that; the producer only asks once. `url()` reports the final
 * URL after navigation — the same URL unless a test simulates a redirect.
 */
function fakePage({ count = 1, rect = RECT, sizeOffset = 0, finalUrl = RECIPE_ENTRY.url } = {}) {
  const state = { goto: null, pageOptions: null };
  const locator = {
    count: async () => count,
    waitFor: async (options) => {
      state.waitFor = options;
    },
    scrollIntoViewIfNeeded: async () => {
      state.scrolled = true;
    },
    evaluate: async () => rect,
  };
  const session = {
    send: async (method, params) => {
      state.method = method;
      state.clip = params.clip;
      const width = Math.round(params.clip.width * params.clip.scale) + sizeOffset;
      const height = Math.round(params.clip.height * params.clip.scale) + sizeOffset;
      return { data: pngBytes(width, height).toString("base64") };
    },
  };
  const page = {
    goto: async (url, options) => {
      state.goto = { url, options };
    },
    url: () => finalUrl,
    locator: () => locator,
    context: () => ({ newCDPSession: async () => session }),
  };
  return { page, state };
}

function makePack() {
  const dir = mkdtempSync(join(tmpdir(), "evidence-runner-"));
  mkdirSync(join(dir, "assets"), { recursive: true });
  return dir;
}

const writeManifest = (dir, manifest) =>
  writeFileSync(join(dir, "evidence-captures.json"), `${JSON.stringify(manifest, null, 2)}\n`);

function evidenceScene(id, over = {}) {
  return {
    id,
    visualType: "narrative",
    layout: "media-overlay",
    media: {
      type: "image",
      path: `assets/scene-${id}.png`,
      evidence: true,
      provenance: provenanceFor(),
      ...over,
    },
  };
}

describe("evidence-capture-runner", () => {
  const dirs = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const pack = () => {
    const dir = makePack();
    dirs.push(dir);
    return dir;
  };

  describe("loadCaptureManifest", () => {
    it("returns null when the pack has no manifest", () => {
      expect(loadCaptureManifest(pack())).toBeNull();
    });

    it("loads the JSON object keyed by scene id", () => {
      const dir = pack();
      writeManifest(dir, { 3: RECIPE_ENTRY });
      expect(loadCaptureManifest(dir)).toEqual({ 3: RECIPE_ENTRY });
    });

    it("rejects a top-level value that is not an object", () => {
      const dir = pack();
      writeManifest(dir, []);
      expect(() => loadCaptureManifest(dir)).toThrow(/object keyed by scene id/);
    });

    it("rejects invalid JSON with the file path", () => {
      const dir = pack();
      writeFileSync(join(dir, "evidence-captures.json"), "{ not json");
      expect(() => loadCaptureManifest(dir)).toThrow(/evidence-captures\.json is not valid JSON/);
    });
  });

  describe("planEvidenceCaptures", () => {
    it("plans a valid manifest entry with the normalized recipe", () => {
      const dir = pack();
      const plan = planEvidenceCaptures({
        scenes: [evidenceScene(3)],
        contentDirAbs: dir,
        manifest: { 3: { url: RECIPE_ENTRY.url, selector: "table" } },
      });
      expect(plan.errors).toEqual([]);
      expect(plan.skipped).toEqual([]);
      expect(plan.planned).toHaveLength(1);
      expect(plan.planned[0]).toMatchObject({
        sceneId: 3,
        outputAbs: resolve(dir, "assets/scene-3.png"),
        recipe: {
          url: RECIPE_ENTRY.url,
          selector: "table",
          padding: 16,
          deviceScaleFactor: 2,
          waitUntil: "load",
        },
      });
      expect(plan.planned[0].declared).toEqual(provenanceFor());
    });

    it("reports an unknown scene id", () => {
      const plan = planEvidenceCaptures({
        scenes: [evidenceScene(3)],
        contentDirAbs: pack(),
        manifest: { 99: RECIPE_ENTRY },
      });
      expect(plan.planned).toEqual([]);
      expect(plan.errors).toHaveLength(1);
      expect(plan.errors[0]).toContain("99");
      expect(plan.errors[0]).toContain("no scene");
    });

    it("reports a scene not marked as evidence", () => {
      const plan = planEvidenceCaptures({
        scenes: [evidenceScene(3, { evidence: false })],
        contentDirAbs: pack(),
        manifest: { 3: RECIPE_ENTRY },
      });
      expect(plan.errors).toHaveLength(1);
      expect(plan.errors[0]).toContain("scene 3");
      expect(plan.errors[0]).toContain("media.evidence");
    });

    it("reports a missing media path", () => {
      const plan = planEvidenceCaptures({
        scenes: [evidenceScene(3, { path: "" })],
        contentDirAbs: pack(),
        manifest: { 3: RECIPE_ENTRY },
      });
      expect(plan.errors[0]).toContain("scene 3");
      expect(plan.errors[0]).toContain("media.path");
    });

    it("rejects a media path that escapes the content dir", () => {
      const dir = pack();
      const plan = planEvidenceCaptures({
        scenes: [evidenceScene(3, { path: "../outside.png" })],
        contentDirAbs: dir,
        manifest: { 3: RECIPE_ENTRY },
      });
      expect(plan.planned).toEqual([]);
      expect(plan.errors[0]).toContain("outside the content dir");
      expect(plan.errors[0]).toContain("../outside.png");
    });

    it("reports a scene without provenance", () => {
      const scene = evidenceScene(3);
      delete scene.media.provenance;
      const plan = planEvidenceCaptures({
        scenes: [scene],
        contentDirAbs: pack(),
        manifest: { 3: RECIPE_ENTRY },
      });
      expect(plan.errors[0]).toContain("scene 3");
      expect(plan.errors[0]).toContain("media.provenance");
    });

    it("reports an invalid recipe without throwing", () => {
      const plan = planEvidenceCaptures({
        scenes: [evidenceScene(3)],
        contentDirAbs: pack(),
        manifest: { 3: { url: RECIPE_ENTRY.url, selector: "" } },
      });
      expect(plan.planned).toEqual([]);
      expect(plan.errors[0]).toContain("scene 3");
      expect(plan.errors[0]).toContain("selector");
    });

    it.each([
      ["url", { url: "https://example.com/other" }, "provenance.sourceUrl"],
      ["selector", { selector: "table.results" }, "provenance.selector"],
      ["deviceScaleFactor", { deviceScaleFactor: 3 }, "provenance.scale"],
    ])("reports a recipe %s that disagrees with the declared provenance", (_field, over, needle) => {
      const plan = planEvidenceCaptures({
        scenes: [evidenceScene(3)],
        contentDirAbs: pack(),
        manifest: { 3: { ...RECIPE_ENTRY, ...over } },
      });
      expect(plan.planned).toEqual([]);
      expect(plan.errors).toHaveLength(1);
      expect(plan.errors[0]).toContain("scene 3");
      expect(plan.errors[0]).toContain(needle);
    });

    it("skips an existing output unless forced", () => {
      const dir = pack();
      const outputAbs = join(dir, "assets/scene-3.png");
      writeFileSync(outputAbs, "already here");
      const scenes = [evidenceScene(3)];

      const skipped = planEvidenceCaptures({
        scenes,
        contentDirAbs: dir,
        manifest: { 3: RECIPE_ENTRY },
      });
      expect(skipped.planned).toEqual([]);
      expect(skipped.skipped).toEqual([{ sceneId: 3, outputAbs, reason: "exists" }]);

      const forced = planEvidenceCaptures({
        scenes,
        contentDirAbs: dir,
        manifest: { 3: RECIPE_ENTRY },
        force: true,
      });
      expect(forced.planned).toHaveLength(1);
      expect(forced.skipped).toEqual([]);
    });

    it("collects every error instead of stopping at the first", () => {
      const plan = planEvidenceCaptures({
        scenes: [evidenceScene(3), evidenceScene(4, { evidence: false })],
        contentDirAbs: pack(),
        manifest: { 3: { url: "not a url", selector: "table" }, 4: RECIPE_ENTRY },
      });
      expect(plan.errors).toHaveLength(2);
    });
  });

  describe("captureFromPage", () => {
    it("writes the clip at clip × scale and returns the measured provenance", async () => {
      const dir = pack();
      const outputAbs = join(dir, "assets", "capture.png");
      const { page, state } = fakePage();

      const shot = await captureFromPage(page, RECIPE_ENTRY, provenanceFor(), outputAbs);

      expect(state.goto).toEqual({
        url: RECIPE_ENTRY.url,
        options: { waitUntil: "load", timeout: 30000 },
      });
      expect(state.method).toBe("Page.captureScreenshot");
      expect(state.clip).toEqual({
        x: CLIP.x,
        y: CLIP.y,
        width: CLIP.w,
        height: CLIP.h,
        scale: SCALE,
      });
      expect(state.scrolled).toBe(true);
      expect(shot.provenance).toEqual(provenanceFor());
      expect(shot.width).toBe(Math.round(CLIP.w * SCALE));
      expect(shot.height).toBe(Math.round(CLIP.h * SCALE));
      expect(pngSize(outputAbs)).toEqual({ width: shot.width, height: shot.height });
      expect(readdirSync(join(dir, "assets"))).toEqual(["capture.png"]);
    });

    it("fails when the selector matches zero elements, naming the count", async () => {
      const dir = pack();
      const outputAbs = join(dir, "assets", "capture.png");
      const { page } = fakePage({ count: 0 });
      await expect(captureFromPage(page, RECIPE_ENTRY, provenanceFor(), outputAbs)).rejects.toThrow(
        /matched 0 element/,
      );
      expect(readdirSync(join(dir, "assets"))).toEqual([]);
    });

    it("fails when the selector matches more than one element", async () => {
      const dir = pack();
      const outputAbs = join(dir, "assets", "capture.png");
      const { page } = fakePage({ count: 2 });
      await expect(captureFromPage(page, RECIPE_ENTRY, provenanceFor(), outputAbs)).rejects.toThrow(
        /matched 2 element/,
      );
      expect(readdirSync(join(dir, "assets"))).toEqual([]);
    });

    it("fails on declared geometry drift, prints the new block, and leaves the file untouched", async () => {
      const dir = pack();
      const outputAbs = join(dir, "assets", "capture.png");
      writeFileSync(outputAbs, "previous capture");

      const declared = provenanceFor();
      declared.clip = { ...declared.clip, w: declared.clip.w - 20 };
      const { page } = fakePage();

      const error = await captureFromPage(page, RECIPE_ENTRY, declared, outputAbs).catch((e) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain("clip.w drifted");
      expect(error.message).toContain("provenance: {");
      expect(error.message).toContain("https://example.com/changelog");
      expect(readFileSync(outputAbs, "utf8")).toBe("previous capture");
      expect(readdirSync(join(dir, "assets"))).toEqual(["capture.png"]);
    });

    it("fails when the screenshot size does not match the measured clip", async () => {
      const dir = pack();
      const outputAbs = join(dir, "assets", "capture.png");
      const { page } = fakePage({ sizeOffset: 5 });
      await expect(captureFromPage(page, RECIPE_ENTRY, null, outputAbs)).rejects.toThrow(
        /geometry does not match/,
      );
      expect(readdirSync(join(dir, "assets"))).toEqual([]);
    });

    it("fails when the page redirected, naming the final URL", async () => {
      const dir = pack();
      const outputAbs = join(dir, "assets", "capture.png");
      const { page } = fakePage({ finalUrl: "https://example.com/login?next=/changelog" });
      const error = await captureFromPage(page, RECIPE_ENTRY, null, outputAbs).catch((e) => e);
      expect(error.message).toContain("page redirected to https://example.com/login?next=/changelog");
      expect(error.message).toContain("use the final URL in the recipe");
      expect(readdirSync(join(dir, "assets"))).toEqual([]);
    });

    it("closes the page and browser even when the capture fails", async () => {
      const dir = pack();
      const outputAbs = join(dir, "assets", "capture.png");
      const { page } = fakePage({ count: 0 });
      const closed = { page: false, browser: false };
      page.close = async () => {
        closed.page = true;
      };
      const browser = {
        newPage: async (options) => {
          expect(options).toEqual({ viewport: RECIPE_ENTRY.viewport, deviceScaleFactor: SCALE });
          return page;
        },
        close: async () => {
          closed.browser = true;
        },
      };

      await expect(
        captureEvidenceShot({
          recipe: RECIPE_ENTRY,
          outputAbs,
          declared: provenanceFor(),
          deps: { launchBrowser: async () => browser },
        }),
      ).rejects.toThrow(/matched 0 element/);
      expect(closed).toEqual({ page: true, browser: true });
    });
  });

  describe("findUncoveredEvidenceScenes", () => {
    it("reports an evidence scene with no manifest entry", () => {
      const scenes = [evidenceScene(3), evidenceScene(4)];
      const uncovered = findUncoveredEvidenceScenes(scenes, { 3: RECIPE_ENTRY });
      expect(uncovered.map((scene) => scene.id)).toEqual([4]);
    });

    it("exempts a legacy composed banner", () => {
      const scene = evidenceScene(5, { provenance: { ...provenanceFor(), composed: true } });
      expect(findUncoveredEvidenceScenes([scene], {})).toEqual([]);
    });

    it("treats every evidence scene as uncovered when the manifest is absent", () => {
      expect(findUncoveredEvidenceScenes([evidenceScene(3)], null).map((s) => s.id)).toEqual([3]);
    });
  });

  describe("runEvidenceCaptures", () => {
    it("returns manifest:false without launching a browser when the pack has no manifest", async () => {
      const launchBrowser = vi.fn();
      const scenes = [evidenceScene(3)];
      const result = await runEvidenceCaptures({
        scenes,
        contentDirAbs: pack(),
        deps: { launchBrowser },
      });
      expect(result).toEqual({
        manifest: false,
        captured: [],
        skipped: [],
        errors: [],
        uncovered: scenes,
      });
      expect(launchBrowser).not.toHaveBeenCalled();
    });

    it("captures the valid entry and reports a bad one instead of throwing", async () => {
      const dir = pack();
      writeManifest(dir, { 3: RECIPE_ENTRY, 99: {} });
      const { page } = fakePage();
      const browser = { newPage: async () => page, close: async () => {} };

      const result = await runEvidenceCaptures({
        scenes: [evidenceScene(3)],
        contentDirAbs: dir,
        deps: { launchBrowser: async () => browser },
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("99");
      expect(result.captured).toHaveLength(1);
      expect(result.captured[0].sceneId).toBe(3);
      expect(pngSize(result.captured[0].path)).toEqual({
        width: Math.round(CLIP.w * SCALE),
        height: Math.round(CLIP.h * SCALE),
      });
    });

    it("captures a missing file and returns its path and provenance", async () => {
      const dir = pack();
      writeManifest(dir, { 3: RECIPE_ENTRY });
      const { page } = fakePage();
      const browser = { newPage: async () => page, close: async () => {} };

      const result = await runEvidenceCaptures({
        scenes: [evidenceScene(3)],
        contentDirAbs: dir,
        deps: { launchBrowser: async () => browser },
      });

      expect(result.manifest).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.uncovered).toEqual([]);
      expect(result.captured).toHaveLength(1);
      expect(result.captured[0].sceneId).toBe(3);
      expect(result.captured[0].path).toBe(join(dir, "assets/scene-3.png"));
      expect(pngSize(result.captured[0].path)).toEqual({
        width: Math.round(CLIP.w * SCALE),
        height: Math.round(CLIP.h * SCALE),
      });
    });

    it("skips an existing file without launching a browser", async () => {
      const dir = pack();
      writeManifest(dir, { 3: RECIPE_ENTRY });
      writeFileSync(join(dir, "assets/scene-3.png"), "present");
      const launchBrowser = vi.fn();

      const result = await runEvidenceCaptures({
        scenes: [evidenceScene(3)],
        contentDirAbs: dir,
        deps: { launchBrowser },
      });

      expect(result.captured).toEqual([]);
      expect(result.skipped).toHaveLength(1);
      expect(launchBrowser).not.toHaveBeenCalled();
    });

    it("returns uncovered evidence scenes without throwing", async () => {
      const dir = pack();
      writeManifest(dir, {});
      const scenes = [evidenceScene(3), evidenceScene(4)];
      const result = await runEvidenceCaptures({
        scenes,
        contentDirAbs: dir,
        deps: { launchBrowser: vi.fn() },
      });
      expect(result.uncovered.map((scene) => scene.id)).toEqual([3, 4]);
      expect(result.errors).toEqual([]);
    });

    it("reports a malformed manifest without throwing and marks evidence scenes uncovered", async () => {
      const dir = pack();
      writeFileSync(join(dir, "evidence-captures.json"), "{ not json");
      const result = await runEvidenceCaptures({
        scenes: [evidenceScene(3)],
        contentDirAbs: dir,
        deps: { launchBrowser: vi.fn() },
      });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not valid JSON");
      expect(result.uncovered.map((scene) => scene.id)).toEqual([3]);
      expect(result.captured).toEqual([]);
    });
  });
});
