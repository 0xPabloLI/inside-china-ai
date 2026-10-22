/**
 * #836: the media field schema the preflight never checked.
 *
 * #759 taught the final media gate to read `media.evidence` and
 * `media.provenance`, but nothing before render looked at them: a misspelled
 * `evidnce: true` was invisible to every check, and the gate then read the
 * scene as "not evidence", so the requirement simply never applied. These tests
 * pin the preflight half, including the exact repro from the ticket.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { MEDIA_FIELD_KEYS, checkMediaFieldSchema } from "../lib/media-field-schema.mjs";
import { runAllSceneDataChecks } from "../lib/scene-rules.mjs";

const mediaScene = (media) => ({ id: 1, visualType: "narrative", layout: "media-overlay", media });

const validProvenance = (over = {}) => ({
  sourceUrl: "https://example.com/model-card",
  selector: "table:nth-of-type(1)",
  rect: { x: 100, y: 200, w: 300, h: 150 },
  clip: { x: 100, y: 200, w: 300, h: 150 },
  scale: 2,
  ...over,
});

const failures = (results) => results.filter((r) => r.level === "fail");
const failureText = (results) =>
  failures(results)
    .map((r) => `${r.check} :: ${r.detail ?? ""}`)
    .join("\n");

describe("media field schema (#836)", () => {
  it("passes the shape every shipped pack actually uses", () => {
    const results = checkMediaFieldSchema([
      mediaScene({
        type: "image",
        path: "assets/x.png",
        source: "official page",
        animation: "fade",
        overlay: 0.7,
        fit: "contain",
      }),
    ]);
    expect(failures(results)).toHaveLength(0);
    expect(results.some((r) => r.level === "pass")).toBe(true);
  });

  it("FAILS the ticket's repro: evidnce:true is a typo, not a waiver", () => {
    const results = checkMediaFieldSchema([
      mediaScene({ type: "image", path: "assets/x.png", evidnce: true }),
    ]);
    expect(results.some((r) => r.level === "fail")).toBe(true);
    expect(failureText(results)).toContain("evidnce");
    // The fix has to name both halves of the twice-written contract, or the
    // next author "fixes" it by editing one file and the drift returns.
    expect(failures(results)[0].fix).toContain("MediaField");
    expect(failures(results)[0].fix).toContain("MEDIA_FIELD_KEYS");
  });

  it("FAILS every unknown key in one finding, not one finding per key", () => {
    const results = checkMediaFieldSchema([
      mediaScene({ type: "image", path: "assets/x.png", evidnce: true, provencence: {} }),
    ]);
    const unknown = failures(results).filter((r) => (r.detail ?? "").includes("unknown media key"));
    expect(unknown).toHaveLength(1);
    expect(unknown[0].detail).toContain("evidnce");
    expect(unknown[0].detail).toContain("provencence");
  });

  it("FAILS media values that are not an object or null", () => {
    const results = checkMediaFieldSchema([mediaScene("assets/x.png")]);
    expect(failureText(results)).toContain("media must be an object or null");
  });

  it.each([
    ["string", "yes"],
    ["number", 1],
    ["object", {}],
    ["bigint", 10n],
  ])("FAILS a %s evidence value (the gate would switch the requirement off)", (_label, value) => {
    const results = checkMediaFieldSchema([
      mediaScene({ type: "image", path: "assets/x.png", evidence: value }),
    ]);
    expect(failureText(results)).toContain("media.evidence");
    expect(failureText(results)).toContain("true");
  });

  it.each([true, false, null])("accepts evidence:%s", (value) => {
    const media = { type: "image", path: "assets/x.png", evidence: value };
    if (value === true) media.provenance = validProvenance();
    const results = checkMediaFieldSchema([mediaScene(media)]);
    expect(failures(results)).toHaveLength(0);
  });

  it("FAILS evidence:true without provenance before render, not at the gate", () => {
    const results = checkMediaFieldSchema([
      mediaScene({ type: "image", path: "assets/x.png", evidence: true }),
    ]);
    expect(failureText(results)).toContain("media.provenance");
    expect(failureText(results)).toContain("evidence:true");
  });

  it("FAILS a provenance the gate would reject, quoting the validator", () => {
    const results = checkMediaFieldSchema([
      mediaScene({
        type: "image",
        path: "assets/x.png",
        evidence: true,
        provenance: validProvenance({ clip: { x: 100, y: 200, w: 250, h: 150 } }),
      }),
    ]);
    expect(failureText(results)).toContain("clip");
    expect(failureText(results)).toContain("400");
  });

  it("accepts valid provenance without the evidence marker (validated when declared)", () => {
    const results = checkMediaFieldSchema([
      mediaScene({ type: "image", path: "assets/x.png", provenance: validProvenance() }),
    ]);
    expect(failures(results)).toHaveLength(0);
  });

  it("ignores media:null and scenes without a media key", () => {
    const results = checkMediaFieldSchema([{ id: 2, media: null }, { id: 3 }]);
    expect(failures(results)).toHaveLength(0);
  });

  it("is wired into runAllSceneDataChecks (preflight and final verify both run it)", () => {
    const result = runAllSceneDataChecks(
      [mediaScene({ type: "image", path: "assets/x.png", evidnce: true })],
      null,
      {},
    );
    expect(result.fail.some((r) => r.check.includes("Media field schema"))).toBe(true);
  });

  it("keeps MEDIA_FIELD_KEYS in step with MediaField in remotion/src/types.ts", () => {
    const typesPath = fileURLToPath(new URL("../remotion/src/types.ts", import.meta.url));
    const source = readFileSync(typesPath, "utf8");
    const body = source.match(/export interface MediaField \{([\s\S]*?)\n\}/);
    expect(body, "MediaField interface not found").toBeTruthy();
    // Top-level members only: exactly two spaces of indentation. Nested object
    // members (cropFocus / backdrop) are indented deeper.
    const declared = new Set(
      [...body[1].matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*)\??:/gm)].map((m) => m[1]),
    );
    expect([...declared].sort()).toEqual([...MEDIA_FIELD_KEYS].sort());
  });
});
