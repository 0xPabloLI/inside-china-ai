import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildReviewPacket } from "../experiment-review.mjs";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
  "base64",
);

const dirs = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "review-packet-"));
  dirs.push(dir);
  const a = join(dir, "a.png");
  const b = join(dir, "b.png");
  writeFileSync(a, TINY_PNG);
  writeFileSync(b, TINY_PNG);
  return {
    dir,
    manifest: {
      experimentId: "info-layout-v1",
      title: "Native chart vs chart-card",
      pairs: [
        { id: "kimi-ipo", block: "kimi-ipo", a: { image: a }, b: { image: b } },
        { id: "deepinfer", block: "deepinfer", a: { image: a }, b: { image: b } },
      ],
    },
  };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("buildReviewPacket", () => {
  it("writes an HTML packet and a separate unblinding key", () => {
    const { dir, manifest } = fixture();
    const result = buildReviewPacket({ manifest, outDir: join(dir, "out"), seed: 7 });
    expect(result.pairs).toHaveLength(2);
    const html = readFileSync(result.htmlPath, "utf8");
    const key = JSON.parse(readFileSync(result.keyPath, "utf8"));
    expect(html).toContain("Clarity");
    expect(html).toContain("Credibility");
    expect(html).toContain("Memorability");
    expect(html).toContain("Visual hierarchy");
    expect(html).toContain("kimi-ipo-left.png");
    expect(html).not.toContain("leftVariant");
    expect(key.pairs).toHaveLength(2);
    expect(key.pairs[0].left).toMatch(/^[AB]$/);
    expect(key.pairs[0].right).not.toBe(key.pairs[0].left);
  });

  it("is deterministic for the same seed", () => {
    const { dir, manifest } = fixture();
    const one = buildReviewPacket({ manifest, outDir: join(dir, "one"), seed: 9 });
    const two = buildReviewPacket({ manifest, outDir: join(dir, "two"), seed: 9 });
    expect(one.pairs).toEqual(two.pairs);
    expect(JSON.parse(readFileSync(one.keyPath, "utf8")).pairs).toEqual(
      JSON.parse(readFileSync(two.keyPath, "utf8")).pairs,
    );
  });

  it("rejects a missing image", () => {
    const { dir, manifest } = fixture();
    manifest.pairs[0].a.image = join(dir, "nope.png");
    expect(() => buildReviewPacket({ manifest, outDir: join(dir, "out") })).toThrow(
      /missing a.image/,
    );
  });

  it("rejects an unsupported image type", () => {
    const { dir, manifest } = fixture();
    const gif = join(dir, "a.gif");
    writeFileSync(gif, "GIF89a");
    manifest.pairs[0].a.image = gif;
    expect(() => buildReviewPacket({ manifest, outDir: join(dir, "out") })).toThrow(
      /unsupported image/,
    );
  });

  it("rejects an empty pair list", () => {
    expect(() => buildReviewPacket({ manifest: { experimentId: "x", pairs: [] } })).toThrow(
      /at least one/,
    );
  });

  it("rejects a pair id that could escape the asset directory", () => {
    const { dir, manifest } = fixture();
    manifest.pairs[0].id = "../escape";
    expect(() => buildReviewPacket({ manifest, outDir: join(dir, "out") })).toThrow(/slug/);
  });
});
