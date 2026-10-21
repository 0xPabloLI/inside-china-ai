/**
 * Tests for the shared final-media gate (T7).
 *
 * The gate runs AFTER asset sourcing, not at preflight: preflight sits before
 * Step 1.5, so failing there would block the very mechanism (auto search) that
 * can supply the missing media.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PNG } from "pngjs";
import {
  MEDIA_DEPENDENT_LAYOUTS,
  NO_MEDIA_TYPES,
  checkFinalMedia,
  formatFinalMediaFailures,
  formatFinalMediaWarnings,
  reportFinalMediaWarnings,
} from "../lib/final-media-gate.mjs";
import { MIN_MEDIA_SIDE } from "../lib/media-integrity.mjs";

/**
 * A real, decodable PNG. Fixtures used to be the literal string "fake" — the
 * gate now verifies file content, so every fixture must be a real image.
 */
function pngBytes(width = 64, height = 64) {
  const png = new PNG({ width, height });
  png.data.fill(0xcc);
  return PNG.sync.write(png);
}

/** Minimal MP4 header: enough for content-based video detection. */
function mp4Bytes() {
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(24, 0);
  buf.write("ftypisom", 4, "ascii");
  buf.writeUInt32BE(0x200, 12);
  buf.write("isomiso2", 16, "ascii");
  return buf;
}

/**
 * Build a throwaway content dir with the media files the scenes reference.
 * A string entry writes a valid 64×64 PNG under that name (the real repo has a
 * WebP file named `.jpg`, so detection must follow bytes, not the extension).
 * Object entries may supply `bytes`, a `dir: true` directory, or `text`.
 */
function makeContentDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "media-gate-"));
  const assets = join(dir, "assets");
  mkdirSync(assets, { recursive: true });
  for (const file of files) {
    if (typeof file === "string") {
      writeFileSync(join(assets, file), pngBytes());
    } else if (file.dir) {
      mkdirSync(join(assets, file.name), { recursive: true });
    } else {
      writeFileSync(join(assets, file.name), file.bytes ?? Buffer.from(file.text ?? ""));
    }
  }
  return dir;
}

const withMedia = (over = {}) => ({ type: "image", path: "assets/present.jpg", ...over });
// A hook binding that satisfies the full curation contract (fit/overlay/source),
// used wherever the test asserts "no warnings".
const hookMedia = (over = {}) => withMedia({ source: "official page", overlay: 0.7, ...over });

describe("layout classification", () => {
  it("treats the text-over-media layouts as media dependent", () => {
    expect([...MEDIA_DEPENDENT_LAYOUTS].sort()).toEqual([
      "media-bottom-bar",
      "media-overlay",
      "media-split",
    ]);
  });

  it("never requires media for scene types that render none", () => {
    expect(NO_MEDIA_TYPES.has("cta")).toBe(true);
  });
});

describe("checkFinalMedia", () => {
  it("FAILS a media-dependent layout with no media and no opt-out", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 1, visualType: "narrative", layout: "media-overlay" }],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatchObject({ sceneId: 1, reason: "missing-media" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS immediately when a media-dependent layout also opts out", () => {
    // A layout whose typography is built around a media layer cannot declare
    // "no media, on purpose" — that combination is a contradiction, not a gap
    // that sourcing could fix.
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 2, visualType: "narrative", layout: "media-split", mediaOptOut: true }],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("opt-out-on-media-layout");
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES a CSS-only layout that opts out, with no warning", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 3, visualType: "narrative", layout: "stacked-cards", mediaOptOut: true }],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS when media is declared but the file is still absent after sourcing", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [
        {
          id: 4,
          visualType: "narrative",
          layout: "stacked-cards",
          media: withMedia({ path: "assets/gone.jpg" }),
        },
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("missing-media");
    expect(result.failures[0].path).toBe("assets/gone.jpg");
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES when every declared media file exists", () => {
    const dir = makeContentDir(["present.jpg"]);
    const result = checkFinalMedia({
      scenes: [{ id: 5, visualType: "narrative", layout: "media-overlay", media: withMedia() }],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips scene types that never render media", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [
        { id: 6, visualType: "cta" },
        { id: 7, visualType: "data" },
        { id: 8, visualType: "stat-reveal" },
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports every offending scene, not just the first", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [
        { id: 9, visualType: "narrative", layout: "media-overlay" },
        { id: 10, visualType: "narrative", layout: "media-bottom-bar" },
      ],
      contentDir: dir,
    });
    expect(result.failures.map((f) => f.sceneId)).toEqual([9, 10]);
    rmSync(dir, { recursive: true, force: true });
  });
});

// ─── #299: the hook (first 3 seconds) must land a usable media file ───

describe("hook media gate (#299, layout-independent)", () => {
  it("FAILS a hook that still has no media after sourcing/generation", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 1, visualType: "hook", mediaStrategy: "asset-then-broll" }],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      { sceneId: 1, layout: null, reason: "missing-hook-media", path: undefined },
    ]);
  });

  it("FAILS a hook whose declared media file is missing on disk", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 2, visualType: "hook", media: withMedia({ path: "assets/gone.jpg" }) }],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatchObject({
      sceneId: 2,
      reason: "missing-hook-media",
      path: "assets/gone.jpg",
    });
    expect(formatFinalMediaFailures(result)).toContain('media "assets/gone.jpg" not found');
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES a hook with an existing media file and emits no warning", () => {
    const dir = makeContentDir(["present.jpg"]);
    const result = checkFinalMedia({
      scenes: [{ id: 3, visualType: "hook", layout: "hero-center", media: hookMedia() }],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES an explicit media:null hook with a visible waiver warning", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 4, visualType: "hook", layout: "hero-center", media: null }],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.warnings).toEqual([
      { sceneId: 4, layout: "hero-center", reason: "explicit-null-on-hook" },
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("formats the hook failure with a manual-binding/waiver fix", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 5, visualType: "hook", layout: "hero-center" }],
      contentDir: dir,
    });
    const report = formatFinalMediaFailures(result);
    expect(report).toContain("Scene 5");
    expect(report).toContain("hook (first 3 seconds) has no media");
    expect(report).toContain("media:null");
    rmSync(dir, { recursive: true, force: true });
  });

  it("hook precedence: media:null on a media-overlay hook passes as a hook waiver", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 6, visualType: "hook", layout: "media-overlay", media: null }],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.warnings).toEqual([
      { sceneId: 6, layout: "media-overlay", reason: "explicit-null-on-hook" },
    ]);
  });

  it("hook precedence: mediaOptOut without media fails as missing-hook-media", () => {
    // The hook reason is layout-independent and deliberate: legacy opt-outs
    // cannot suppress the hook contract.
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 7, visualType: "hook", layout: "media-overlay", mediaOptOut: true }],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ sceneId: 7, reason: "missing-hook-media" });
  });
});

// ─── #299 review: the final gate enforces the same curation contract as
// preflight, so render-only / rerender / realign-render cannot render a hook
// the preflight would have rejected.

describe("hook media quality at the final gate (#299)", () => {
  it("FAILS a hook whose existing file uses fit:contain", () => {
    const dir = makeContentDir(["present.jpg"]);
    const result = checkFinalMedia({
      scenes: [{ id: 8, visualType: "hook", media: hookMedia({ fit: "contain" }) }],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      {
        sceneId: 8,
        layout: null,
        reason: "hook-media-quality",
        detail: expect.stringContaining('fit:"cover"'),
      },
    ]);
    expect(formatFinalMediaFailures(result)).toContain('Scene 8: Hook media must use fit:"cover"');
    rmSync(dir, { recursive: true, force: true });
  });

  it("WARNS for an out-of-band overlay and a missing source, still passing", () => {
    const dir = makeContentDir(["present.jpg"]);
    const result = checkFinalMedia({
      scenes: [{ id: 9, visualType: "hook", media: withMedia({ overlay: 0.2 }) }],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.map((w) => w.reason)).toEqual([
      "hook-media-quality",
      "hook-media-quality",
    ]);
    expect(result.warnings[0].detail).toContain("overlay 0.2 is outside [0.4, 0.9]");
    expect(result.warnings[1].detail).toContain("has no source");
    expect(formatFinalMediaWarnings(result)).toContain(
      "Scene 9: Hook media overlay 0.2 is outside [0.4, 0.9]",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not apply the hook contract to non-hook scenes", () => {
    const dir = makeContentDir(["present.jpg"]);
    const result = checkFinalMedia({
      scenes: [
        {
          id: 10,
          visualType: "narrative",
          layout: "stacked-cards",
          media: withMedia({ fit: "contain" }),
        },
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("reportFinalMediaWarnings", () => {
  it("prints the waiver line once through the injected reporter and returns true", () => {
    const dir = makeContentDir([]);
    const gate = checkFinalMedia({
      scenes: [{ id: 4, visualType: "hook", layout: "hero-center", media: null }],
      contentDir: dir,
    });
    const lines = [];
    const printed = reportFinalMediaWarnings(gate, (text) => lines.push(text));
    expect(printed).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Scene 4: hook renders CSS-only (explicit media:null waiver)");
    expect(lines[0].match(/Scene 4/g)).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("prints nothing and returns false when the gate has no warnings", () => {
    const dir = makeContentDir(["present.jpg"]);
    const gate = checkFinalMedia({
      scenes: [{ id: 5, visualType: "hook", media: hookMedia() }],
      contentDir: dir,
    });
    const lines = [];
    const printed = reportFinalMediaWarnings(gate, (text) => lines.push(text));
    expect(printed).toBe(false);
    expect(lines).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("formatFinalMediaWarnings", () => {
  it("returns an empty string when the gate has no warnings", () => {
    const dir = makeContentDir(["present.jpg"]);
    const result = checkFinalMedia({
      scenes: [{ id: 1, visualType: "hook", media: hookMedia() }],
      contentDir: dir,
    });
    expect(formatFinalMediaWarnings(result)).toBe("");
  });

  it("formats the hook waiver and the media-layout empty band, one line each", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [
        { id: 1, visualType: "hook", media: null },
        { id: 2, visualType: "narrative", layout: "media-split", media: null },
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(formatFinalMediaWarnings(result)).toBe(
      [
        "Scene 1: hook renders CSS-only (explicit media:null waiver)",
        'Scene 2: layout "media-split" renders an empty band (explicit media:null)',
      ].join("\n"),
    );
  });
});

describe("formatFinalMediaFailures wording", () => {
  it("uses layout-agnostic success text and failure header", () => {
    expect(formatFinalMediaFailures({ pass: true, failures: [], warnings: [] })).toBe(
      "All scenes have the media they need.",
    );

    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 9, visualType: "narrative", layout: "media-overlay" }],
      contentDir: dir,
    });
    expect(formatFinalMediaFailures(result).split("\n")[0]).toBe(
      "1 scene(s) would render without the media they need:",
    );
  });
});

// ─── #191: explicit media:null and legacy mediaOptOut semantics ───

describe("explicit media:null on media-dependent layouts (#191)", () => {
  it("media:null on a media-dependent layout passes with a warning (explicit declaration)", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 1, visualType: "narrative", layout: "media-overlay", media: null }],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.warnings).toEqual([
      { sceneId: 1, layout: "media-overlay", reason: "explicit-null-on-media-layout" },
    ]);
  });

  it("legacy mediaOptOut on a media-dependent layout still fails (existing contract)", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 2, visualType: "narrative", layout: "media-split", mediaOptOut: true }],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("opt-out-on-media-layout");
  });
});

// ─── #759: existence is not integrity, and evidence needs provenance ───

/** A scene whose layout depends on media, with the file bound by `media`. */
const mediaScene = (media, over = {}) => ({
  id: 1,
  visualType: "narrative",
  layout: "media-overlay",
  media,
  ...over,
});

/** Valid provenance: the captured clip contains the element it claims. */
const provenance = (over = {}) => ({
  sourceUrl: "https://example.com/model-card",
  selector: "table:nth-of-type(1)",
  rect: { x: 100, y: 200, w: 300, h: 150 },
  clip: { x: 100, y: 200, w: 300, h: 150 },
  scale: 2,
  ...over,
});

describe("media file integrity (#759)", () => {
  it("FAILS a zero-byte media file as broken-media", () => {
    const dir = makeContentDir([{ name: "empty.png", bytes: Buffer.alloc(0) }]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/empty.png" })],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      sceneId: 1,
      layout: "media-overlay",
      reason: "broken-media",
      path: "assets/empty.png",
    });
    expect(result.failures[0].detail).toContain("zero-byte");
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS a truncated PNG (valid signature/IHDR, no IEND)", () => {
    const full = pngBytes();
    // Drop the 12-byte IEND chunk; signature and IHDR stay intact.
    const truncated = full.subarray(0, full.length - 12);
    const dir = makeContentDir([{ name: "truncated.png", bytes: truncated }]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/truncated.png" })],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("broken-media");
    expect(result.failures[0].detail).toContain("unreadable-media");
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS a text file named .png as broken-media", () => {
    const dir = makeContentDir([{ name: "not-an-image.png", text: "plain text, not an image" }]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/not-an-image.png" })],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("broken-media");
    expect(result.failures[0].detail).toContain("unreadable-media");
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS a valid but undersized (32×32) PNG as broken-media", () => {
    const side = MIN_MEDIA_SIDE / 2;
    const dir = makeContentDir([{ name: "tiny.png", bytes: pngBytes(side, side) }]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/tiny.png" })],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("broken-media");
    expect(result.failures[0].detail).toContain("too-small");
    expect(result.failures[0].detail).toContain(`${side}×${side}`);
    expect(result.failures[0].detail).toContain(`${MIN_MEDIA_SIDE}px`);
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS a directory at the media path as broken-media", () => {
    const dir = makeContentDir([{ name: "present.png", dir: true }]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/present.png" })],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("broken-media");
    expect(result.failures[0].detail).toContain("not-a-file");
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS a declared video whose bytes are a PNG (media-type-mismatch)", () => {
    const dir = makeContentDir([{ name: "clip.mp4", bytes: pngBytes() }]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "video", path: "assets/clip.mp4" })],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("broken-media");
    expect(result.failures[0].detail).toContain("media-type-mismatch");
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES a real 64×64 PNG", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/present.png" })],
      contentDir: dir,
    });
    expect(result.failures).toEqual([]);
    expect(result.pass).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES a video when the injected probe reports real dimensions", () => {
    const dir = makeContentDir([{ name: "clip.mp4", bytes: mp4Bytes() }]);
    const probed = [];
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "video", path: "assets/clip.mp4" })],
      contentDir: dir,
      probeVideo: (absPath) => {
        probed.push(absPath);
        return { width: 1080, height: 1920 };
      },
    });
    expect(result.pass).toBe(true);
    expect(probed).toEqual([join(dir, "assets/clip.mp4")]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS a video when the probe returns null (unreadable-media)", () => {
    const dir = makeContentDir([{ name: "clip.mp4", bytes: mp4Bytes() }]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "video", path: "assets/clip.mp4" })],
      contentDir: dir,
      probeVideo: () => null,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("broken-media");
    expect(result.failures[0].detail).toContain("unreadable-media");
    rmSync(dir, { recursive: true, force: true });
  });

  it("checks CSS-only layouts too when media.path is declared", () => {
    const dir = makeContentDir([{ name: "empty.png", bytes: Buffer.alloc(0) }]);
    const result = checkFinalMedia({
      scenes: [
        {
          id: 2,
          visualType: "narrative",
          layout: "stacked-cards",
          media: { type: "image", path: "assets/empty.png" },
        },
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatchObject({ sceneId: 2, reason: "broken-media" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports broken-media for a hook and skips hook-quality findings", () => {
    const dir = makeContentDir([{ name: "empty.png", bytes: Buffer.alloc(0) }]);
    const result = checkFinalMedia({
      scenes: [
        {
          id: 3,
          visualType: "hook",
          layout: "hero-center",
          media: { type: "image", path: "assets/empty.png", fit: "contain" },
        },
      ],
      contentDir: dir,
    });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      sceneId: 3,
      reason: "broken-media",
      path: "assets/empty.png",
    });
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("media provenance (#759)", () => {
  it("PASSES when clip equals rect", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/present.png", provenance: provenance() })],
      contentDir: dir,
    });
    expect(result.failures).toEqual([]);
    expect(result.pass).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES when clip is larger than rect", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          provenance: provenance({ clip: { x: 50, y: 150, w: 400, h: 250 } }),
        }),
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS when clip is narrower than rect, naming the field", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          // rect right edge = 400; clip right edge = 350.
          provenance: provenance({ clip: { x: 100, y: 200, w: 250, h: 150 } }),
        }),
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatchObject({
      sceneId: 1,
      reason: "invalid-provenance",
      path: "assets/present.png",
    });
    expect(result.failures[0].detail).toContain("clip");
    expect(result.failures[0].detail).toContain("350");
    expect(result.failures[0].detail).toContain("400");
    rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ["non-http sourceUrl", { sourceUrl: "ftp://example.com/x" }],
    ["empty sourceUrl", { sourceUrl: "" }],
    ["empty selector", { selector: "   " }],
    [
      "negative rect origin",
      { rect: { x: -1, y: 0, w: 10, h: 10 }, clip: { x: -1, y: 0, w: 10, h: 10 } },
    ],
    ["zero-width rect", { rect: { x: 0, y: 0, w: 0, h: 10 }, clip: { x: 0, y: 0, w: 10, h: 10 } }],
    ["non-finite clip", { clip: { x: 0, y: 0, w: Number.NaN, h: 10 } }],
    ["zero scale", { scale: 0 }],
  ])("FAILS invalid %s as invalid-provenance", (_label, over) => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          provenance: provenance(over),
        }),
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("invalid-provenance");
    const field =
      over.sourceUrl !== undefined
        ? "sourceUrl"
        : over.selector !== undefined
          ? "selector"
          : over.rect !== undefined
            ? "rect"
            : over.clip !== undefined
              ? "clip"
              : "scale";
    expect(result.failures[0].detail).toContain(field);
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS media.evidence:true without provenance (missing-provenance)", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/present.png", evidence: true })],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatchObject({
      sceneId: 1,
      reason: "missing-provenance",
      path: "assets/present.png",
    });
    expect(result.failures[0].detail).toContain("evidence");
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS assetNeed.kind evidence-shot without provenance (missing-provenance)", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene(
          { type: "image", path: "assets/present.png" },
          { assetNeed: { kind: "evidence-shot" } },
        ),
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("missing-provenance");
    expect(result.failures[0].detail).toContain("evidence-shot");
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES non-evidence media without provenance (backward compatible)", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/present.png" })],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS valid provenance that is attached to evidence media only when malformed", () => {
    const dir = makeContentDir(["present.png"]);
    const ok = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          evidence: true,
          provenance: provenance(),
        }),
      ],
      contentDir: dir,
    });
    expect(ok.pass).toBe(true);

    const bad = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          evidence: true,
          provenance: provenance({ selector: "" }),
        }),
      ],
      contentDir: dir,
    });
    expect(bad.pass).toBe(false);
    expect(bad.failures[0].reason).toBe("invalid-provenance");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("formatFinalMediaFailures for integrity/provenance (#759)", () => {
  it("renders actionable lines for broken-media and both provenance reasons", () => {
    const dir = makeContentDir([{ name: "empty.png", bytes: Buffer.alloc(0) }, "present.png"]);
    const result = checkFinalMedia({
      scenes: [
        {
          id: 1,
          visualType: "narrative",
          layout: "media-overlay",
          media: { type: "image", path: "assets/empty.png" },
        },
        {
          id: 2,
          visualType: "narrative",
          layout: "media-overlay",
          media: {
            type: "image",
            path: "assets/present.png",
            provenance: provenance({ clip: { x: 100, y: 200, w: 200, h: 150 } }),
          },
        },
        {
          id: 3,
          visualType: "narrative",
          layout: "media-overlay",
          media: { type: "image", path: "assets/present.png", evidence: true },
        },
      ],
      contentDir: dir,
    });
    const report = formatFinalMediaFailures(result);
    expect(report).toContain("3 scene(s)");
    expect(report).toContain("Scene 1");
    expect(report).toContain('"assets/empty.png" is unusable');
    expect(report).toContain("zero-byte");
    expect(report).toContain("Scene 2");
    expect(report).toContain("invalid provenance");
    expect(report).toContain("Scene 3");
    expect(report).toContain("no provenance");
    rmSync(dir, { recursive: true, force: true });
  });
});
