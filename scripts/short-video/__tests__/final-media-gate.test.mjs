/**
 * Tests for the shared final-media gate (T7).
 *
 * The gate runs AFTER asset sourcing, not at preflight: preflight sits before
 * Step 1.5, so failing there would block the very mechanism (auto search) that
 * can supply the missing media.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import {
  MEDIA_DEPENDENT_LAYOUTS,
  NO_MEDIA_TYPES,
  checkFinalMedia,
  formatFinalMediaFailures,
  formatFinalMediaWarnings,
  reportFinalMediaWarnings,
} from "../lib/final-media-gate.mjs";
import { inspectMediaFile, MIN_MEDIA_SIDE } from "../lib/media-integrity.mjs";

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
  it("FAILS a hook whose existing file uses an unsupported fit", () => {
    const dir = makeContentDir(["present.jpg"]);
    const result = checkFinalMedia({
      scenes: [{ id: 8, visualType: "hook", media: hookMedia({ fit: "fill" }) }],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      {
        sceneId: 8,
        layout: null,
        reason: "hook-media-quality",
        detail: expect.stringContaining('"fill"'),
      },
    ]);
    expect(formatFinalMediaFailures(result)).toContain('Scene 8: Hook media fit "fill"');
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
      code: "zero-byte",
      path: "assets/empty.png",
    });
    expect(result.failures[0].detail).toContain("0 B on disk");
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
    expect(result.failures[0].code).toBe("unreadable-media");
    expect(result.failures[0].detail).toContain("truncated");
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
    expect(result.failures[0].code).toBe("unreadable-media");
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
    expect(result.failures[0].code).toBe("too-small");
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
    expect(result.failures[0].code).toBe("not-a-file");
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
    expect(result.failures[0].code).toBe("media-type-mismatch");
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

  it("FAILS a video when the probe returns null (fail-closed)", () => {
    const dir = makeContentDir([{ name: "clip.mp4", bytes: mp4Bytes() }]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "video", path: "assets/clip.mp4" })],
      contentDir: dir,
      probeVideo: () => null,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("broken-media");
    rmSync(dir, { recursive: true, force: true });
  });

  it("blames the machine, not the asset, when ffprobe itself is missing", () => {
    // Both halves asserted against injected availability, so collapsing them
    // into one code fails a test (deriving the expectation from the same probe
    // the gate reads would be a tautology and pass either way).
    const dir = makeContentDir([{ name: "clip.mp4", bytes: mp4Bytes() }]);
    const abs = join(dir, "assets/clip.mp4");
    const noTool = inspectMediaFile(abs, {
      declaredType: "video",
      probeVideo: () => null,
      probeAvailable: () => false,
    });
    const withTool = inspectMediaFile(abs, {
      declaredType: "video",
      probeVideo: () => null,
      probeAvailable: () => true,
    });
    expect(noTool).toMatchObject({ ok: false, code: "probe-unavailable" });
    expect(withTool).toMatchObject({ ok: false, code: "unreadable-media" });
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
    // Since #758 the file must also match clip × scale, so the fixture is the
    // 600×300 px a 300×150 CSS-px clip at 2× produces.
    const dir = makeContentDir([{ name: "present.png", bytes: pngBytes(600, 300) }]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/present.png", provenance: provenance() })],
      contentDir: dir,
    });
    expect(result.failures).toEqual([]);
    expect(result.pass).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES when clip is larger than rect", () => {
    const dir = makeContentDir([{ name: "present.png", bytes: pngBytes(800, 500) }]);
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

  it.each([
    ["left", { x: 110, y: 200, w: 290, h: 150 }],
    ["top", { x: 100, y: 210, w: 300, h: 140 }],
    ["right", { x: 100, y: 200, w: 250, h: 150 }],
    ["bottom", { x: 100, y: 200, w: 300, h: 100 }],
  ])("FAILS when the clip is short on the %s edge", (_edge, clip) => {
    // All four containment arms asserted: a mutation that drops any one of them
    // must turn a test red, not ship a clipped capture.
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({ type: "image", path: "assets/present.png", provenance: provenance({ clip }) }),
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("invalid-provenance");
    expect(result.failures[0].detail).toContain("provenance.clip");
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

  it("keeps assetNeed a string contract — it demands no provenance", () => {
    // Every consumer (claim-keywords, vlm-cache, vlm_analyzer.py, shipped
    // scene-data) reads assetNeed as a search-query string. Re-adding an object
    // marker here would fork that contract, so both shapes must stay inert.
    const dir = makeContentDir(["present.png"]);
    for (const assetNeed of ["benchmark table screenshot", { kind: "evidence-shot" }]) {
      const result = checkFinalMedia({
        scenes: [mediaScene({ type: "image", path: "assets/present.png" }, { assetNeed })],
        contentDir: dir,
      });
      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS a truthy non-boolean evidence flag instead of switching off", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/present.png", evidence: "yes" })],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("invalid-evidence-flag");
    expect(formatFinalMediaFailures(result)).toContain("unusable evidence flag");
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS a bad evidence flag even when the provenance beside it is valid", () => {
    // Round-3 finding: the provenance branch used to return first, so
    // {evidence:"yes", provenance:<valid>} passed and enforcement stayed off.
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          evidence: "yes",
          provenance: provenance(),
        }),
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures.map((f) => f.reason)).toEqual(["invalid-evidence-flag"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads evidence:null and evidence:false as 'not evidence', like media:null (#191)", () => {
    const dir = makeContentDir(["present.png"]);
    for (const evidence of [null, false, undefined]) {
      const result = checkFinalMedia({
        scenes: [mediaScene({ type: "image", path: "assets/present.png", evidence })],
        contentDir: dir,
      });
      expect(result.pass, `evidence: ${String(evidence)}`).toBe(true);
      expect(result.failures).toHaveLength(0);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("names a declared value without throwing, whatever it is", () => {
    // JSON.stringify dies on BigInt and String() dies on a prototype-less
    // object; either crash in the failure path would replace a rejection with
    // an exception the operator cannot read. (The labels below are written by
    // hand for exactly that reason.)
    const dir = makeContentDir(["present.png"]);
    const cases = [
      ["bigint", 10n],
      ["prototype-less object", Object.create(null)],
      ["array", [1, 2]],
    ];
    for (const [label, evidence] of cases) {
      const flag = checkFinalMedia({
        scenes: [mediaScene({ type: "image", path: "assets/present.png", evidence })],
        contentDir: dir,
      });
      expect(flag.failures[0].reason, label).toBe("invalid-evidence-flag");
    }
    const scale = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          provenance: provenance({ rect: { x: 1n, y: 2, w: 3, h: 4 } }),
        }),
      ],
      contentDir: dir,
    });
    expect(scale.failures[0].reason).toBe("invalid-provenance");
    expect(scale.failures[0].detail).toContain("1n");
    rmSync(dir, { recursive: true, force: true });
  });

  it("still enforces the hook contract when only the declaration is wrong", () => {
    // Round-3 finding: any media finding used to skip hook quality, so a hook
    // with intact bytes and an unsupported fit + a missing provenance shipped
    // the fit violation. (fit was "contain" here until 2026-10-29, when contain
    // became a valid hook fit — "fill" still trips the same contract.)
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        {
          id: 11,
          visualType: "hook",
          layout: "hero-center",
          media: { type: "image", path: "assets/present.png", fit: "fill", evidence: true },
        },
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures.map((f) => f.reason)).toEqual([
      "missing-provenance",
      "hook-media-quality",
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("leaves an absent file on a no-media scene type as the CSS fallback", () => {
    // Pre-#759 contract, kept deliberately: the renderer's validateMedia warns
    // and paints a background, so requiring presence here would reach past this
    // ticket. What #759 added is that a file that IS present gets judged.
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [
        {
          id: 9,
          visualType: "data",
          media: { type: "image", path: "assets/gone.png", mode: "fullscreen" },
        },
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("checks media on a no-media-layout scene type (mode:fullscreen renders it)", () => {
    const dir = makeContentDir([{ name: "empty.png", bytes: Buffer.alloc(0) }]);
    const result = checkFinalMedia({
      scenes: [
        {
          id: 7,
          visualType: "data",
          media: { type: "image", path: "assets/empty.png", mode: "fullscreen" },
        },
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatchObject({
      sceneId: 7,
      reason: "broken-media",
      code: "zero-byte",
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("demands provenance from evidence media whatever the scene type", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        {
          id: 8,
          visualType: "stat-reveal",
          media: { type: "image", path: "assets/present.png", evidence: true },
        },
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("missing-provenance");
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
    const dir = makeContentDir([{ name: "present.png", bytes: pngBytes(600, 300) }]);
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

// ─── #758: a declared provenance must match the pixels on disk ───

/** 320×160 CSS px at 2× — a 640×320 file. */
const captureProvenance = (over = {}) => ({
  sourceUrl: "https://example.com/benchmark-table",
  selector: "table:nth-of-type(1)",
  rect: { x: 104, y: 923, w: 288, h: 144 },
  clip: { x: 88, y: 907, w: 320, h: 160 },
  scale: 2,
  ...over,
});

describe("evidence capture pixel reconciliation (#758)", () => {
  it("PASSES evidence media whose clip × scale matches the real PNG size", () => {
    const dir = makeContentDir([{ name: "capture.png", bytes: pngBytes(640, 320) }]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/capture.png",
          evidence: true,
          provenance: captureProvenance(),
        }),
      ],
      contentDir: dir,
    });
    expect(result.failures).toEqual([]);
    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS a file whose pixels differ from clip × scale (provenance-pixel-mismatch)", () => {
    // present.png is 64×64; the declaration claims 640×320.
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          evidence: true,
          provenance: captureProvenance(),
        }),
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      sceneId: 1,
      reason: "provenance-pixel-mismatch",
      path: "assets/present.png",
    });
    expect(result.failures[0].detail).toContain("640×320");
    expect(result.failures[0].detail).toContain("64×64");
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES composed:true with mismatched dims — a declared composition is not reconciled", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          evidence: true,
          provenance: captureProvenance({ composed: true }),
        }),
      ],
      contentDir: dir,
    });
    expect(result.failures).toEqual([]);
    expect(result.pass).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("WARNS that pixel reconciliation is skipped for a composed declaration (#758)", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          evidence: true,
          provenance: captureProvenance({ composed: true }),
        }),
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([
      {
        sceneId: 1,
        layout: "media-overlay",
        reason: "composed-provenance",
        path: "assets/present.png",
        detail: expect.stringContaining("pixel reconciliation is skipped"),
      },
    ]);
    expect(formatFinalMediaWarnings(result)).toContain(
      'Scene 1: media "assets/present.png" — pixel reconciliation is skipped for a declared composition',
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS a non-boolean composed flag as invalid-provenance", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          evidence: true,
          provenance: captureProvenance({ composed: "yes" }),
        }),
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("invalid-provenance");
    expect(result.failures[0].detail).toContain("provenance.composed must be a boolean");
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS composed:false with mismatched dims — only the boolean true skips", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          evidence: true,
          provenance: captureProvenance({ composed: false }),
        }),
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("provenance-pixel-mismatch");
    rmSync(dir, { recursive: true, force: true });
  });

  it("reconciles non-evidence media too — provenance is validated whenever present", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          provenance: captureProvenance(),
        }),
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("provenance-pixel-mismatch");
    rmSync(dir, { recursive: true, force: true });
  });

  it("formats the pixel mismatch with the recapture/correct fix", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [
        mediaScene({
          type: "image",
          path: "assets/present.png",
          evidence: true,
          provenance: captureProvenance(),
        }),
      ],
      contentDir: dir,
    });
    const report = formatFinalMediaFailures(result);
    expect(report).toContain("does not match its declared capture");
    expect(report).toContain("declared clip 320×160 @2× implies 640×320 px, the file is 64×64");
    expect(report).toContain("recapture");
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
    expect(report).toContain('"assets/empty.png" failed the integrity check');
    expect(report).toContain("zero-byte");
    expect(report).toContain("Scene 2");
    expect(report).toContain("invalid provenance");
    expect(report).toContain("Scene 3");
    expect(report).toContain("no provenance");
    rmSync(dir, { recursive: true, force: true });
  });
});

// ─── #759 review: the header parsers themselves ───
//
// The gate-level fixtures are all PNG, so these pin the other three formats the
// corpus actually ships — including the headline claim that format comes from
// bytes, not the extension.

/** Real PNG bytes, written under a name that lies about them. */
function riffWebpLossless(width, height) {
  const payload = Buffer.alloc(16);
  payload[0] = 0x30;
  payload.writeUInt32LE((width - 1) | ((height - 1) << 14), 1);
  const chunk = Buffer.concat([Buffer.from("VP8L", "latin1"), uint32(payload.length), payload]);
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), chunk]);
  return Buffer.concat([Buffer.from("RIFF", "latin1"), uint32(body.length), body]);
}

function uint32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function gifBytes(width, height, withTrailer) {
  const screen = Buffer.alloc(4);
  screen.writeUInt16LE(width, 0);
  screen.writeUInt16LE(height, 2);
  return Buffer.concat([
    Buffer.from("GIF89a", "latin1"),
    screen,
    Buffer.alloc(3),
    Buffer.from([0x2c]),
    ...(withTrailer ? [Buffer.from([0x3b])] : []),
  ]);
}

describe("media header parsers (#759)", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

  it("reads a real tracked JPEG by markers, not by file-name", () => {
    const v = inspectMediaFile(
      `${repoRoot}scripts/short-video/assets/dh-fixtures/portrait-small.jpg`,
    );
    expect(v).toMatchObject({ ok: true, format: "jpeg", width: 240, height: 308 });
  });

  it("REJECTS that JPEG with its end-of-image marker cut", () => {
    const full = readFileSync(
      `${repoRoot}scripts/short-video/assets/dh-fixtures/portrait-small.jpg`,
    );
    const dir = makeContentDir([{ name: "cut.jpg", bytes: full.subarray(0, full.length - 1) }]);
    const v = inspectMediaFile(join(dir, "assets/cut.jpg"));
    expect(v.ok).toBe(false);
    expect(v.code).toBe("unreadable-media");
    expect(v.detail).toContain("end-of-image");
    rmSync(dir, { recursive: true, force: true });
  });

  it("detects WebP from bytes when the file is named .jpg", () => {
    const dir = makeContentDir([{ name: "baidu-01.jpg", bytes: riffWebpLossless(1200, 800) }]);
    const v = inspectMediaFile(join(dir, "assets/baidu-01.jpg"), { declaredType: "image" });
    expect(v).toMatchObject({ ok: true, format: "webp", width: 1200, height: 800 });
    rmSync(dir, { recursive: true, force: true });
  });

  it("REJECTS a WebP whose RIFF length promises more bytes than exist", () => {
    const bytes = riffWebpLossless(1200, 800);
    // One byte is the case a padding exemption used to wave through.
    for (const cut of [1, 6]) {
      const dir = makeContentDir([
        { name: "half.webp", bytes: bytes.subarray(0, bytes.length - cut) },
      ]);
      const v = inspectMediaFile(join(dir, "assets/half.webp"));
      expect(v.ok, `cut ${cut}B`).toBe(false);
      expect(v.code).toBe("unreadable-media");
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads WebP extended-canvas dimensions", () => {
    const payload = Buffer.alloc(10);
    const chunk = Buffer.concat([Buffer.from("VP8X", "latin1"), uint32(payload.length), payload]);
    const body = Buffer.concat([Buffer.from("WEBP", "latin1"), chunk]);
    const file = Buffer.concat([Buffer.from("RIFF", "latin1"), uint32(body.length), body]);
    file.writeUIntLE(1200 - 1, 24, 3);
    file.writeUIntLE(800 - 1, 27, 3);
    const dir = makeContentDir([{ name: "ext.webp", bytes: file }]);
    expect(inspectMediaFile(join(dir, "assets/ext.webp"))).toMatchObject({
      ok: true,
      format: "webp",
      width: 1200,
      height: 800,
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a GIF trailer and rejects a GIF without one", () => {
    const dir = makeContentDir([
      { name: "ok.gif", bytes: gifBytes(320, 240, true) },
      { name: "cut.gif", bytes: gifBytes(320, 240, false) },
    ]);
    expect(inspectMediaFile(join(dir, "assets/ok.gif"))).toMatchObject({
      ok: true,
      format: "gif",
      width: 320,
      height: 240,
    });
    const cut = inspectMediaFile(join(dir, "assets/cut.gif"));
    expect(cut.ok).toBe(false);
    expect(cut.detail).toContain("trailer");
    rmSync(dir, { recursive: true, force: true });
  });

  it("REJECTS an audio file bound as media", () => {
    const id3 = Buffer.concat([Buffer.from("ID3\x03\x00\x00", "latin1"), Buffer.alloc(10)]);
    const dir = makeContentDir([{ name: "bgm.png", bytes: id3 }]);
    const v = inspectMediaFile(join(dir, "assets/bgm.png"), { declaredType: "image" });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("unreadable-media");
    rmSync(dir, { recursive: true, force: true });
  });

  it("REJECTS a PNG whose signature differs only in byte 4", () => {
    // 0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A — a lookalike with the CR replaced
    // must not be walked as a PNG.
    const bytes = Buffer.from(pngBytes());
    bytes[4] = 0x0a;
    const dir = makeContentDir([{ name: "fake.png", bytes }]);
    const v = inspectMediaFile(join(dir, "assets/fake.png"), { declaredType: "image" });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("unreadable-media");
    rmSync(dir, { recursive: true, force: true });
  });
});

// ─── #759 round 4: the gate reads files, so it must not be pointed anywhere ───

describe("path containment and declared type (#759)", () => {
  it("REFUSES a media path that leaves the content dir", () => {
    const root = mkdtempSync(join(tmpdir(), "media-root-"));
    const contentDir = join(root, "content");
    mkdirSync(join(contentDir, "assets"), { recursive: true });
    writeFileSync(join(root, "outside.png"), pngBytes());
    for (const path of ["../outside.png", join(root, "outside.png")]) {
      const result = checkFinalMedia({
        scenes: [mediaScene({ type: "image", path })],
        contentDir,
      });
      expect(result.pass, path).toBe(false);
      expect(result.failures[0]).toMatchObject({
        reason: "broken-media",
        code: "path-escapes-content-dir",
      });
      // The escape is reported for the hook branch too, not turned into
      // "missing media" — the fix is different.
      const hook = checkFinalMedia({
        scenes: [
          { id: 2, visualType: "hook", layout: "hero-center", media: { type: "image", path } },
        ],
        contentDir,
      });
      expect(hook.failures[0].code, path).toBe("path-escapes-content-dir");
    }
    rmSync(root, { recursive: true, force: true });
  });

  it("REJECTS a media.type the renderer does not define", () => {
    // Anything else would make the image↔video agreement check silently no-op.
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "gif", path: "assets/present.png" })],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatchObject({
      reason: "broken-media",
      code: "unknown-declared-type",
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("escapes control characters out of the operator-facing report", () => {
    const dir = makeContentDir(["present.png"]);
    const result = checkFinalMedia({
      scenes: [mediaScene({ type: "image", path: "assets/present.png", evidence: "a\u0000b" })],
      contentDir: dir,
    });
    const report = formatFinalMediaFailures(result);
    expect(result.failures[0].reason).toBe("invalid-evidence-flag");
    expect(report).not.toContain("\u0000");
    expect(report).toContain("a\\x00b");
    rmSync(dir, { recursive: true, force: true });
  });
});
