/**
 * Tests for the Profile-driven publish-package generator (#219 ticket 02).
 *
 * The generator evolves the old generate-caption.mjs hardcode:
 *   - one package per REGISTERED platform profile (not TikTok-only)
 *   - packages land in output/{pipelineId}/publish/{platform}/ — kernel
 *     artifacts stay untouched (S1/S5)
 *   - caption/hashtag/video limits come from the profile — no local copies
 *     (the review's "防第三处" convergence)
 *   - regeneration is idempotent: same inputs → same bytes
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  packageFilePaths,
  buildPublishPackage,
  writePublishPackage,
  generatePublishPackages,
} from "../lib/platforms/generate-publish-package.mjs";
import { getPlatformProfile } from "../lib/platforms/index.mjs";

const tiktok = getPlatformProfile("tiktok");

// ─── Fixture (minimal scene-data + metadata + meta.mjs shape) ───

const SCENES = [
  { id: 1, visualType: "hook", voiceover: "DeepSeek just shipped a new model.", onScreenText: "DeepSeek ships again" },
  { id: 2, visualType: "body", voiceover: "The benchmarks beat every frontier lab.", onScreenText: "Benchmarks" },
  {
    id: 3,
    visualType: "body",
    voiceover: "Here is what the weights unlock for local deployments.",
    onScreenText: "Open weights",
  },
  {
    id: 4,
    visualType: "cta",
    voiceover: "Follow for daily China AI coverage.",
    onScreenText: "Follow",
  },
];
const METADATA = {
  primaryEntity: "DeepSeek",
  entities: ["DeepSeek"],
  keywords: ["deepseek", "open source"],
  articleTitle: "DeepSeek ships a new open-weights model",
};
const META = { keyEntities: { companies: ["deepseek"] } };

let outputRoot;
beforeEach(() => {
  outputRoot = mkdtempSync(join(tmpdir(), "publish-pkg-"));
});

describe("packageFilePaths", () => {
  it("lands the package under output/{pipelineId}/publish/{platform}/", () => {
    const paths = packageFilePaths({ outputRoot, pipelineId: "dh-pilot", profile: tiktok });
    expect(paths.dir).toBe(join(outputRoot, "dh-pilot", "publish", "tiktok"));
    expect(paths.caption).toBe(join(paths.dir, "tiktok-caption.txt"));
    expect(paths.metadata).toBe(join(paths.dir, "tiktok-metadata.json"));
    expect(paths.pinnedComment).toBe(join(paths.dir, "tiktok-pinned-comment.txt"));
  });

  it("falls back to the output root when there is no pipelineId (standalone mode)", () => {
    const paths = packageFilePaths({ outputRoot, profile: tiktok });
    expect(paths.dir).toBe(join(outputRoot, "publish", "tiktok"));
    expect(paths.caption).toBe(join(paths.dir, "tiktok-caption.txt"));
  });
});

describe("buildPublishPackage", () => {
  it("assembles the same caption block the TikTok flow produced pre-migration", () => {
    const pkg = buildPublishPackage(tiktok, { scenes: SCENES, metadata: METADATA, meta: META });
    // caption = description + blank line + hashtag line + trailing newline
    const [description, hashtagLine] = pkg.captionText.trimEnd().split("\n\n");
    expect(hashtagLine).toBe(pkg.hashtags.join(" "));
    expect(pkg.metadataJson.description).toBe(`${description}\n\n${hashtagLine}`);
    expect(pkg.metadataJson.hashtags).toEqual(pkg.hashtags);
    expect(pkg.violations).toEqual([]);
  });

  it("truncates at the PROFILE's limits, not a local copy", () => {
    // Derive functions enforce the limit by truncation (violations are only a
    // dead-last guard), so injection is proven with a shrunken profile: the
    // truncation follows whatever the profile declares.
    const tinyProfile = {
      ...tiktok,
      caption: { ...tiktok.caption, maxLength: 100, titleMaxLength: 20 },
      hashtags: { ...tiktok.hashtags, min: 1, max: 2 },
    };
    const pkg = buildPublishPackage(tinyProfile, { scenes: SCENES, metadata: METADATA, meta: META });
    expect(pkg.description.length).toBeLessThanOrEqual(100);
    expect(pkg.title.length).toBeLessThanOrEqual(20);
    expect(pkg.hashtags.length).toBeLessThanOrEqual(2);
  });
});

describe("writePublishPackage + generatePublishPackages", () => {
  it("writes the package files and regenerates idempotently without touching kernel artifacts", () => {
    const first = generatePublishPackages({
      outputRoot,
      pipelineId: "dh-pilot",
      scenes: SCENES,
      metadata: METADATA,
      meta: META,
    });
    expect(first).toHaveLength(1); // one registered profile (tiktok)
    expect(first[0].platform).toBe("tiktok");
    expect(first[0].violations).toEqual([]);

    const captionPath = join(outputRoot, "dh-pilot", "publish", "tiktok", "tiktok-caption.txt");
    const metaPath = join(outputRoot, "dh-pilot", "publish", "tiktok", "tiktok-metadata.json");
    const pinnedPath = join(outputRoot, "dh-pilot", "publish", "tiktok", "tiktok-pinned-comment.txt");
    expect(existsSync(captionPath)).toBe(true);
    expect(existsSync(metaPath)).toBe(true);
    expect(existsSync(pinnedPath)).toBe(true);

    // No kernel artifacts in the publish dir or its parents (S1: separation)
    expect(existsSync(join(outputRoot, "dh-pilot", "publish", "tiktok", "final.mp4"))).toBe(false);

    // Idempotent: second run byte-identical apart from the generatedAt stamp
    const before = readFileSync(captionPath, "utf8");
    const metaBefore = JSON.parse(readFileSync(metaPath, "utf8"));
    generatePublishPackages({
      outputRoot,
      pipelineId: "dh-pilot",
      scenes: SCENES,
      metadata: METADATA,
      meta: META,
    });
    expect(readFileSync(captionPath, "utf8")).toBe(before);
    const { generatedAt: _b, ...restBefore } = metaBefore;
    const { generatedAt: _a, ...restAfter } = JSON.parse(readFileSync(metaPath, "utf8"));
    expect(restAfter).toEqual(restBefore);
  });
});

describe("legacy copies removed", () => {
  it("generate-caption.mjs no longer hardcodes the platform limits or output paths", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/short-video/generate-caption.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(/\b2200\b/);
    expect(source).not.toMatch(/tiktok-caption\.txt/); // path built by the generator lib
    expect(source).not.toMatch(/>\s*60\b/); // local title-limit copy
  });

  it("tiktok-rules.mjs no longer forwards THRESHOLDS (Middle Man removed)", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/short-video/lib/tiktok-rules.mjs"),
      "utf8",
    );
    // Mentions in prose/comments are fine — there must be no re-export.
    expect(source).not.toMatch(/export\s+(?:const|let|var)\s+THRESHOLDS/);
    expect(source).not.toMatch(/THRESHOLDS\s*=/);
  });
});
