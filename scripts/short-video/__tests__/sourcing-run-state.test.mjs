import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runMediaTrack } from "../lib/media-track.mjs";
import {
  SOURCING_STATE_SCHEMA_VERSION,
  evaluateSourcingShortCircuit,
  readSourcingState,
  sourcingDigest,
  writeSourcingState,
} from "../lib/sourcing-run-state.mjs";

const scene = (patch = {}) => ({
  id: 1,
  visualType: "narrative",
  assetNeed: "AI chip wafer close-up",
  action: "A 12-inch wafer",
  result: "yield falls",
  ...patch,
});

const patchEnvelope = (entries) => ({ schemaVersion: 1, patches: entries });

describe("sourcingDigest", () => {
  it("is stable across delivery-text edits that do not change the claim", () => {
    const before = sourcingDigest([scene()]);
    const after = sourcingDigest([scene({ action: "A 14-inch wafer, rewritten" })]);
    expect(after).toBe(before);
  });

  it("changes when the claim or search hints change", () => {
    const base = sourcingDigest([scene()]);
    expect(sourcingDigest([scene({ assetNeed: "optical interposer" })])).not.toBe(base);
    expect(sourcingDigest([scene({ searchHints: ["silicon wafer"] })])).not.toBe(base);
  });

  it("is keyed on the search plan, not array order noise", () => {
    const two = [scene(), { ...scene(), id: 2, assetNeed: "advanced packaging" }];
    expect(sourcingDigest(two)).toBe(sourcingDigest([...two]));
  });
});

describe("evaluateSourcingShortCircuit", () => {
  const contentDirAbs = "/packs/demo";
  const digest = sourcingDigest([scene()]);

  it("skips when the plan matches, a patch exists and assigned files are on disk", () => {
    const result = evaluateSourcingShortCircuit({
      scenes: [scene()],
      state: {
        schemaVersion: SOURCING_STATE_SCHEMA_VERSION,
        digest,
        completedAt: "2026-11-15T06:32:19Z",
      },
      patch: patchEnvelope([
        { sceneId: 1, status: "assigned", media: { path: "assets/a.jpg", type: "image" } },
      ]),
      contentDirAbs,
      existsSyncFn: () => true,
    });
    expect(result.skip).toBe(true);
    expect(result.assigned).toBe(1);
    expect(result.reason).toMatch(/same search plan/);
  });

  it("treats an all-unassigned patch as a reusable negative result", () => {
    const result = evaluateSourcingShortCircuit({
      scenes: [scene()],
      state: { schemaVersion: SOURCING_STATE_SCHEMA_VERSION, digest },
      patch: patchEnvelope([{ sceneId: 1, status: "unassigned", reason: "pool unsatisfiable" }]),
      contentDirAbs,
      existsSyncFn: () => true,
    });
    expect(result.skip).toBe(true);
    expect(result.assigned).toBe(0);
  });

  it("sources when there is no state, a stale schema, or a different plan", () => {
    expect(
      evaluateSourcingShortCircuit({
        scenes: [scene()],
        state: null,
        patch: patchEnvelope([]),
        contentDirAbs,
      }).skip,
    ).toBe(false);
    expect(
      evaluateSourcingShortCircuit({
        scenes: [scene()],
        state: { schemaVersion: 0, digest },
        patch: patchEnvelope([]),
        contentDirAbs,
      }).skip,
    ).toBe(false);
    expect(
      evaluateSourcingShortCircuit({
        scenes: [scene({ assetNeed: "new claim" })],
        state: { schemaVersion: SOURCING_STATE_SCHEMA_VERSION, digest },
        patch: patchEnvelope([]),
        contentDirAbs,
      }).skip,
    ).toBe(false);
  });

  it("sources when the patch is gone or an assigned file was deleted", () => {
    const state = { schemaVersion: SOURCING_STATE_SCHEMA_VERSION, digest };
    expect(
      evaluateSourcingShortCircuit({ scenes: [scene()], state, patch: null, contentDirAbs }).skip,
    ).toBe(false);

    const result = evaluateSourcingShortCircuit({
      scenes: [scene()],
      state,
      patch: patchEnvelope([
        { sceneId: 1, status: "assigned", media: { path: "assets/gone.jpg", type: "image" } },
      ]),
      contentDirAbs,
      existsSyncFn: () => false,
    });
    expect(result.skip).toBe(false);
    expect(result.reason).toMatch(/assigned media file is missing/);
  });
});

describe("sourcing state file", () => {
  it("round-trips a digest and refuses malformed JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "sourcing-state-"));
    const file = join(dir, "sourcing-state.json");
    const digest = sourcingDigest([scene()]);
    const written = writeSourcingState(file, { digest, scenes: [scene()], pack: "demo" });
    expect(written.queryCount).toBeGreaterThan(0);
    expect(readSourcingState(file)).toMatchObject({ digest, pack: "demo" });

    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{");
    expect(readSourcingState(broken)).toBe(null);
  });
});

describe("media track integration", () => {
  const setup = () => {
    const baseDir = mkdtempSync(join(tmpdir(), "media-track-"));
    const contentDirAbs = join(baseDir, "content", "demo");
    const outputDirAbs = join(baseDir, "output", "demo");
    mkdirSync(join(contentDirAbs, "assets"), { recursive: true });
    mkdirSync(outputDirAbs, { recursive: true });
    writeFileSync(join(contentDirAbs, "assets", "a.jpg"), "x");
    writeFileSync(
      join(outputDirAbs, "media-patch.json"),
      JSON.stringify(
        patchEnvelope([
          { sceneId: 1, status: "assigned", media: { path: "assets/a.jpg", type: "image" } },
        ]),
      ),
    );
    return { baseDir, contentDirAbs };
  };

  it("pays for sourcing once, then skips the next identical run while still applying the patch", async () => {
    const { baseDir, contentDirAbs } = setup();
    const sourcerMain = vi.fn(async () => {});
    const deps = {
      runEvidenceCaptures: async () => ({ captured: [], errors: [], uncovered: [] }),
      sourcerMain,
      autoUpscaleIfNeeded: () => ({ upscaled: false }),
    };

    const scenes = [scene()];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runMediaTrack({ scenes, contentDir: "demo", baseDir, broll: null, deps });

    expect(sourcerMain).toHaveBeenCalledTimes(1);
    expect(existsSync(join(baseDir, "output", "demo", "sourcing-state.json"))).toBe(true);

    delete scenes[0].media;
    await runMediaTrack({ scenes, contentDir: "demo", baseDir, broll: null, deps });

    expect(sourcerMain).toHaveBeenCalledTimes(1); // #228: no second sourcing run
    expect(scenes[0].media?.path).toBe("assets/a.jpg");
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).toMatch(/sourcing skipped/);

    log.mockRestore();
  });

  it("re-sources when SHORT_VIDEO_FORCE_SOURCING=1", async () => {
    const { baseDir } = setup();
    const sourcerMain = vi.fn(async () => {});
    const deps = {
      runEvidenceCaptures: async () => ({ captured: [], errors: [], uncovered: [] }),
      sourcerMain,
      autoUpscaleIfNeeded: () => ({ upscaled: false }),
    };
    const scenes = [scene()];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runMediaTrack({ scenes, contentDir: "demo", baseDir, broll: null, deps });
    process.env.SHORT_VIDEO_FORCE_SOURCING = "1";
    try {
      delete scenes[0].media;
      await runMediaTrack({ scenes, contentDir: "demo", baseDir, broll: null, deps });
    } finally {
      delete process.env.SHORT_VIDEO_FORCE_SOURCING;
      log.mockRestore();
    }

    expect(sourcerMain).toHaveBeenCalledTimes(2);
  });

  it("re-sources when an assigned file was deleted", async () => {
    const { baseDir, contentDirAbs } = setup();
    const sourcerMain = vi.fn(async () => {});
    const deps = {
      runEvidenceCaptures: async () => ({ captured: [], errors: [], uncovered: [] }),
      sourcerMain,
      autoUpscaleIfNeeded: () => ({ upscaled: false }),
    };
    const scenes = [scene()];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runMediaTrack({ scenes, contentDir: "demo", baseDir, broll: null, deps });
    rmSync(join(contentDirAbs, "assets", "a.jpg"));
    delete scenes[0].media;
    await runMediaTrack({ scenes, contentDir: "demo", baseDir, broll: null, deps });

    log.mockRestore();
    expect(sourcerMain).toHaveBeenCalledTimes(2);
  });
});
