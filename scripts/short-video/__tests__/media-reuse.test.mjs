/**
 * Cross-run media sourcing reuse (#1362).
 *
 * A voice-track failure (TTS Kaggle timeout) must not throw away a finished
 * media track: the next run compares per-scene claim signatures against the
 * previous `media-patch.json`, reuses every unchanged verdict (including
 * "unassigned"), and re-sources only scenes whose claim changed.
 *
 * The suite covers the decision layer directly and drives `asset-sourcer.main`
 * through its short-circuit and partial-merge paths with hermetic content/output
 * roots (no network: the short-circuit returns before env/CDP loading, and the
 * partial fixture changes a claim to stopwords so the run has no queries).
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";

import {
  DEFAULT_SOURCING_SETTINGS,
  MEDIA_PATCH_RECIPE_VERSION,
  buildReuseMetadata,
  mergePatchEntries,
  planPatchReuse,
  sceneClaimSignatures,
} from "../lib/media-reuse.mjs";
import { main as sourcerMain } from "../lib/asset-sourcer.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "media-reuse-test-"));
  roots.push(root);
  return root;
}

function writeFile(root, relativePath, content = "x") {
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  return absolute;
}

function scene(id, overrides = {}) {
  return {
    id,
    type: "context",
    visualType: "context",
    voiceover: `scene ${id} voiceover about china ai`,
    ...overrides,
  };
}

function makePatch({ scenes, signatures, entries, searched, settings, recipe }) {
  return {
    schemaVersion: 1,
    reuse: buildReuseMetadata({
      signatures: signatures ?? sceneClaimSignatures(scenes),
      searchedSceneIds: searched ?? scenes.map((s) => s.id),
      settings: settings ?? DEFAULT_SOURCING_SETTINGS,
      recipeVersion: recipe ?? MEDIA_PATCH_RECIPE_VERSION,
    }),
    patches: entries ?? [],
  };
}

describe("sceneClaimSignatures", () => {
  it("is stable for the same scene and ignores fields sourcing does not read", () => {
    const before = sceneClaimSignatures([scene(1, { text: "old heading" })]);
    const after = sceneClaimSignatures([scene(1, { text: "new heading" })]);
    expect(after.get(1)).toBe(before.get(1));
  });

  it("changes when the voiceover-derived claim changes", () => {
    const before = sceneClaimSignatures([scene(1, { voiceover: "robot arm in a factory" })]);
    const after = sceneClaimSignatures([scene(1, { voiceover: "robot arm on a stage" })]);
    expect(after.get(1)).not.toBe(before.get(1));
  });

  it("changes for an explicit assetNeed and searchHints override", () => {
    const base = sceneClaimSignatures([scene(1)]);
    const need = sceneClaimSignatures([scene(1, { assetNeed: "zhipu hong kong listing" })]);
    const hints = sceneClaimSignatures([scene(1, { searchHints: ["zhipu listing"] })]);
    expect(need.get(1)).not.toBe(base.get(1));
    expect(hints.get(1)).not.toBe(base.get(1));
  });

  it("changes when an assignment-relevant scene field changes", () => {
    const base = sceneClaimSignatures([scene(1)]);
    const layout = sceneClaimSignatures([scene(1, { layout: "media-bottom-bar" })]);
    const chart = sceneClaimSignatures([scene(1, { chart: { entity: "zhipu" } })]);
    const fullscreen = sceneClaimSignatures([scene(1, { media: { mode: "fullscreen" } })]);
    expect(layout.get(1)).not.toBe(base.get(1));
    expect(chart.get(1)).not.toBe(base.get(1));
    expect(fullscreen.get(1)).not.toBe(base.get(1));
  });

  it("couples the hook signature to the pack's declared body fit", () => {
    const hook = { id: 1, visualType: "hook", voiceover: "hook line" };
    // Hand-bound body: carries no claim of its own, so only the hook has a
    // signature — the pack fit is the hook's only link to this scene.
    const body = { ...scene(2), media: { path: "bound.png", fit: "cover" } };
    const before = sceneClaimSignatures([hook, body]);
    const after = sceneClaimSignatures([
      hook,
      { ...body, media: { ...body.media, fit: "contain" } },
    ]);
    expect(after.get(1)).not.toBe(before.get(1));
    expect(after.has(2)).toBe(false);
  });
});

describe("planPatchReuse", () => {
  it("reuses every unchanged scene, including negative verdicts", () => {
    const root = makeRoot();
    writeFile(root, "assets/winner.png");
    const scenes = [scene(1), scene(2)];
    const signatures = sceneClaimSignatures(scenes);
    const patch = makePatch({
      scenes,
      signatures,
      entries: [
        { sceneId: 1, status: "assigned", media: { path: "assets/winner.png" } },
        { claimSceneId: 2, status: "unassigned", reason: "VLM relevance 0 below threshold 60" },
      ],
    });

    const plan = planPatchReuse({ scenes, rawPatch: patch, contentDirAbs: root });
    expect(plan.reusable.map((entry) => entry.sceneId)).toEqual([1, 2]);
    expect(plan.stale).toEqual([]);
  });

  it("re-sources a scene whose verdicts only record a tool outage", () => {
    const root = makeRoot();
    writeFile(root, "assets/winner.png");
    const scenes = [scene(1), scene(2)];
    const patch = makePatch({
      scenes,
      entries: [
        { sceneId: 1, status: "assigned", media: { path: "assets/winner.png" } },
        {
          claimSceneId: 2,
          status: "unassigned",
          reason:
            "VLM relevance unavailable (analysis failed or score unparseable) — fail-closed, not a content verdict (宁缺毋滥)",
          relevanceBand: "unavailable",
        },
      ],
    });

    const plan = planPatchReuse({ scenes, rawPatch: patch, contentDirAbs: root });
    expect(plan.reusable.map((entry) => entry.sceneId)).toEqual([1]);
    expect(plan.stale).toEqual([
      expect.objectContaining({ sceneId: 2, reason: "previous search hit a tool outage" }),
    ]);
  });

  it("reuses a structural unavailability verdict instead of treating it as an outage", () => {
    const root = makeRoot();
    writeFile(root, "assets/winner.png");
    const scenes = [scene(1), scene(2)];
    const patch = makePatch({
      scenes,
      entries: [
        { sceneId: 1, status: "assigned", media: { path: "assets/winner.png" } },
        {
          claimSceneId: 2,
          status: "unassigned",
          reason: "claim scene 2 unavailable (occupied/manual media/no-media type)",
        },
      ],
    });

    const plan = planPatchReuse({ scenes, rawPatch: patch, contentDirAbs: root });
    expect(plan.stale).toEqual([]);
    expect(plan.reusable.map((entry) => entry.sceneId)).toEqual([1, 2]);
  });

  it("re-sources only the scene whose claim changed", () => {
    const root = makeRoot();
    writeFile(root, "assets/one.png");
    writeFile(root, "assets/two.png");
    const before = [scene(1), scene(2)];
    const signatures = sceneClaimSignatures(before);
    const patch = makePatch({
      scenes: before,
      signatures,
      entries: [
        { sceneId: 1, status: "assigned", media: { path: "assets/one.png" } },
        { sceneId: 2, status: "assigned", media: { path: "assets/two.png" } },
      ],
    });
    const after = [scene(1, { voiceover: "rewritten scene one voiceover" }), scene(2)];

    const plan = planPatchReuse({ scenes: after, rawPatch: patch, contentDirAbs: root });
    expect(plan.reusable.map((entry) => entry.sceneId)).toEqual([2]);
    expect(plan.stale).toEqual([expect.objectContaining({ sceneId: 1, reason: "claim changed" })]);
  });

  it("treats a searched scene with no patch entries as a reusable verdict", () => {
    const root = makeRoot();
    writeFile(root, "assets/winner.png");
    const scenes = [scene(1), scene(2)];
    const patch = makePatch({
      scenes,
      searched: [1, 2],
      entries: [{ sceneId: 1, status: "assigned", media: { path: "assets/winner.png" } }],
    });

    const plan = planPatchReuse({ scenes, rawPatch: patch, contentDirAbs: root });
    expect(plan.stale).toEqual([]);
    expect(plan.reusable.map((entry) => entry.sceneId)).toEqual([1, 2]);
  });

  it("reports claim scenes that disappeared from scene-data", () => {
    const root = makeRoot();
    writeFile(root, "assets/one.png");
    const previous = [scene(1), scene(2)];
    const patch = makePatch({
      scenes: previous,
      searched: [1, 2],
      entries: [{ sceneId: 1, status: "assigned", media: { path: "assets/one.png" } }],
    });

    const plan = planPatchReuse({
      scenes: [scene(1)],
      rawPatch: patch,
      contentDirAbs: root,
    });
    expect(plan.stale).toEqual([]);
    expect(plan.removedSceneIds).toEqual([2]);
  });

  it("does not trust a previous run that assigned no usable media", () => {
    const scenes = [scene(1)];
    const patch = makePatch({
      scenes,
      entries: [{ claimSceneId: 1, status: "unassigned", reason: "no candidates" }],
    });

    const plan = planPatchReuse({ scenes, rawPatch: patch, contentDirAbs: makeRoot() });
    expect(plan.previousRunUsable).toBe(false);
    expect(plan.reusable).toEqual([]);
    expect(plan.stale).toEqual([
      expect.objectContaining({ sceneId: 1, reason: "previous run had no usable assignment" }),
    ]);
  });

  it("rejects the whole patch when the assignment recipe changed", () => {
    const root = makeRoot();
    writeFile(root, "assets/winner.png");
    const scenes = [scene(1)];
    const patch = makePatch({
      scenes,
      recipe: MEDIA_PATCH_RECIPE_VERSION + 1,
      entries: [{ sceneId: 1, status: "assigned", media: { path: "assets/winner.png" } }],
    });

    const plan = planPatchReuse({ scenes, rawPatch: patch, contentDirAbs: root });
    expect(plan.reusable).toEqual([]);
    expect(plan.stale).toEqual([expect.objectContaining({ sceneId: 1, reason: "recipe changed" })]);
  });

  it("rejects the whole patch when the run settings changed", () => {
    const root = makeRoot();
    writeFile(root, "assets/winner.png");
    const scenes = [scene(1)];
    const patch = makePatch({
      scenes,
      settings: { relevanceThreshold: 60, maxPerSource: 3 },
      entries: [{ sceneId: 1, status: "assigned", media: { path: "assets/winner.png" } }],
    });

    const plan = planPatchReuse({
      scenes,
      rawPatch: patch,
      contentDirAbs: root,
      settings: { relevanceThreshold: 80, maxPerSource: 3 },
    });
    expect(plan.stale).toEqual([
      expect.objectContaining({ sceneId: 1, reason: "settings changed" }),
    ]);
  });

  it("re-sources a scene whose assigned file disappeared", () => {
    const root = makeRoot();
    writeFile(root, "assets/winner.png");
    const scenes = [scene(1), scene(2)];
    const patch = makePatch({
      scenes,
      entries: [
        { sceneId: 1, status: "assigned", media: { path: "assets/gone.png" } },
        { sceneId: 2, status: "assigned", media: { path: "assets/winner.png" } },
      ],
    });

    const plan = planPatchReuse({ scenes, rawPatch: patch, contentDirAbs: root });
    expect(plan.stale).toEqual([
      expect.objectContaining({ sceneId: 1, reason: "media file missing" }),
    ]);
    expect(plan.reusable.map((entry) => entry.sceneId)).toEqual([2]);
  });

  it("does not reuse a legacy patch that carries no reuse metadata", () => {
    const annexRoot = makeRoot();
    writeFile(annexRoot, "assets/winner.png");
    const scenes = [scene(1)];
    const patch = {
      schemaVersion: 1,
      patches: [{ sceneId: 1, status: "assigned", media: { path: "assets/winner.png" } }],
    };

    const plan = planPatchReuse({ scenes, rawPatch: patch, contentDirAbs: annexRoot });
    expect(plan.stale).toEqual([
      expect.objectContaining({ sceneId: 1, reason: "no reuse metadata" }),
    ]);
  });

  it("force bypasses reuse even when every verdict matches", () => {
    const root = makeRoot();
    writeFile(root, "assets/winner.png");
    const scenes = [scene(1)];
    const patch = makePatch({
      scenes,
      entries: [{ sceneId: 1, status: "assigned", media: { path: "assets/winner.png" } }],
    });

    const plan = planPatchReuse({
      scenes,
      rawPatch: patch,
      contentDirAbs: root,
      force: true,
    });
    expect(plan.reusable).toEqual([]);
    expect(plan.stale).toEqual([expect.objectContaining({ sceneId: 1, reason: "forced" })]);
  });
});

describe("mergePatchEntries", () => {
  it("keeps reused verdicts, replaces stale ones, drops removed scenes", () => {
    const scenes = [scene(1), scene(2), scene(3)];
    const previous = [
      { sceneId: 1, status: "assigned", media: { path: "assets/old-one.png" } },
      { sceneId: 2, status: "assigned", media: { path: "assets/two.png" } },
      { sceneId: 99, status: "assigned", media: { path: "assets/removed.png" } },
    ];
    const fresh = [
      { sceneId: 1, status: "unassigned", reason: "no candidates" },
      { sceneId: 3, status: "assigned", media: { path: "assets/three.png" } },
    ];

    const merged = mergePatchEntries({
      scenes,
      previousPatches: previous,
      freshPatches: fresh,
      reusableSceneIds: [2],
    });

    expect(merged).toEqual([
      { sceneId: 1, status: "unassigned", reason: "no candidates" },
      { sceneId: 2, status: "assigned", media: { path: "assets/two.png" } },
      { sceneId: 3, status: "assigned", media: { path: "assets/three.png" } },
    ]);
  });

  it("uses the scene order instead of the previous file order", () => {
    const scenes = [scene(2), scene(1)];
    const merged = mergePatchEntries({
      scenes,
      previousPatches: [
        { sceneId: 1, status: "assigned", media: { path: "assets/one.png" } },
        { sceneId: 2, status: "assigned", media: { path: "assets/two.png" } },
      ],
      freshPatches: [],
      reusableSceneIds: [1, 2],
    });
    expect(merged.map((entry) => entry.sceneId)).toEqual([2, 1]);
  });
});

describe("asset-sourcer main — cross-run reuse", () => {
  function writeContent(root, slug, scenes) {
    const contentRoot = join(root, "content");
    const slugDir = join(contentRoot, slug);
    mkdirSync(slugDir, { recursive: true });
    writeFileSync(
      join(slugDir, "scene-data.mjs"),
      `export const scenes = ${JSON.stringify(scenes)};\nexport const meta = {};\n`,
    );
    return contentRoot;
  }

  function readPatch(root, slug) {
    return JSON.parse(readFileSync(join(root, "output", slug, "media-patch.json"), "utf8"));
  }

  it("short-circuits before env/CDP loading when every claim is unchanged", async () => {
    const root = makeRoot();
    const slug = "reuse-fixture";
    const scenes = [scene(1), scene(2)];
    const contentRoot = writeContent(root, slug, scenes);
    const outputRoot = join(root, "output");
    writeFile(root, "content/reuse-fixture/assets/one.png");
    writeFile(root, "content/reuse-fixture/assets/two.png");

    const patch = makePatch({
      scenes,
      entries: [
        { sceneId: 1, status: "assigned", media: { path: "assets/one.png" } },
        { sceneId: 2, status: "assigned", media: { path: "assets/two.png" } },
      ],
    });
    writeFile(root, "output/reuse-fixture/media-patch.json", JSON.stringify(patch));
    const before = readFileSync(join(root, "output", slug, "media-patch.json"), "utf8");

    const started = Date.now();
    const result = await sourcerMain(["--content", slug], { contentRoot, outputRoot });
    const elapsedMs = Date.now() - started;

    expect(result?.reused).toBe(true);
    expect(elapsedMs).toBeLessThan(5_000);
    // Byte-identical: the short-circuit must not rewrite the artifact.
    expect(readFileSync(join(root, "output", slug, "media-patch.json"), "utf8")).toBe(before);
  });

  it("prunes a removed claim scene without re-sourcing", async () => {
    const root = makeRoot();
    const slug = "prune-fixture";
    const contentRoot = writeContent(root, slug, [scene(1)]);
    const outputRoot = join(root, "output");
    writeFile(root, "content/prune-fixture/assets/one.png");
    writeFile(root, "content/prune-fixture/assets/two.png");

    const patch = makePatch({
      scenes: [scene(1), scene(2)],
      entries: [
        { sceneId: 1, status: "assigned", media: { path: "assets/one.png" } },
        { sceneId: 2, status: "assigned", media: { path: "assets/two.png" } },
      ],
    });
    writeFile(root, "output/prune-fixture/media-patch.json", JSON.stringify(patch));

    const result = await sourcerMain(["--content", slug], { contentRoot, outputRoot });

    expect(result?.reused).toBe(true);
    const written = readPatch(root, slug);
    expect(written.patches).toEqual([
      { sceneId: 1, status: "assigned", media: { path: "assets/one.png" } },
    ]);
    expect(Object.keys(written.reuse.signatures)).toEqual(["1"]);
    expect(written.reuse.searched).toEqual([1]);
  });

  it("merges reused verdicts when a changed scene has no usable queries", async () => {
    const root = makeRoot();
    const slug = "partial-fixture";
    const previousScenes = [scene(1), scene(2)];
    const contentRoot = writeContent(root, slug, previousScenes);
    const outputRoot = join(root, "output");
    writeFile(root, "content/partial-fixture/assets/old-one.png");
    writeFile(root, "content/partial-fixture/assets/two.png");

    const patch = makePatch({
      scenes: previousScenes,
      entries: [
        { sceneId: 1, status: "assigned", media: { path: "assets/old-one.png" } },
        { sceneId: 2, status: "assigned", media: { path: "assets/two.png" } },
      ],
    });
    writeFile(root, "output/partial-fixture/media-patch.json", JSON.stringify(patch));
    writeFile(root, "output/asset-report.json", '{"sentinel":"whole-package report"}\n');

    // Rewrite scene 1 so it has a changed claim and no searchable tokens.
    const currentScenes = [scene(1, { voiceover: "the and of" }), scene(2)];
    const sceneDataPath = join(contentRoot, slug, "scene-data.mjs");
    writeFileSync(
      sceneDataPath,
      `export const scenes = ${JSON.stringify(currentScenes)};\nexport const meta = {};\n`,
    );

    const result = await sourcerMain(["--content", slug], { contentRoot, outputRoot });

    expect(result?.reused).toBe(false);
    const written = readPatch(root, slug);
    expect(written.patches).toEqual([
      { sceneId: 2, status: "assigned", media: { path: "assets/two.png" } },
    ]);
    // Metadata advances with the current claims and the accumulated search set.
    expect(written.reuse.signatures["1"]).toBeDefined();
    expect(written.reuse.signatures["2"]).toBeDefined();
    expect(written.reuse.searched).toEqual([1, 2]);
    // The package-level report is not replaced by this subset run.
    expect(readFileSync(join(root, "output", "asset-report.json"), "utf8")).toBe(
      '{"sentinel":"whole-package report"}\n',
    );
  });
});
