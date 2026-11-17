/**
 * Media role gate (2026-11-18, user decision B).
 *
 * Declared roles must be legal, must point at media that exists, and must not
 * contradict the evidence flag or a media-led hook.
 */
import { describe, it, expect } from "vitest";
import { checkMediaRoleContract } from "../lib/scene-rules.mjs";

describe("checkMediaRoleContract", () => {
  it("passes an undeclared role (default derivation handles it)", () => {
    expect(checkMediaRoleContract([{ id: 1, media: { src: "still.png" } }])).toHaveLength(0);
  });

  it("fails an unknown role value", () => {
    const findings = checkMediaRoleContract([
      { id: 1, media: { src: "still.png" }, mediaRole: "ambient" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe("fail");
    expect(findings[0].detail).toContain('"ambient"');
  });

  it("fails a role with no media to describe", () => {
    const findings = checkMediaRoleContract([{ id: 2, mediaRole: "decorative" }]);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("no media field");
  });

  it("fails decorative + evidence:true on the same field", () => {
    const findings = checkMediaRoleContract([
      { id: 3, media: { src: "capture.png", evidence: true }, mediaRole: "decorative" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("contradict");
  });

  it("fails a media-led hook carried by decorative media", () => {
    const findings = checkMediaRoleContract([
      { id: 4, visualType: "hook", layout: "media-led", media: { src: "still.png" } },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("hero-center");
  });

  it("passes an evidence hook and an explicit promoted clip", () => {
    expect(
      checkMediaRoleContract([
        { id: 5, visualType: "hook", layout: "media-led", media: { src: "demo.png", evidence: true } },
        { id: 6, media: { src: "lap.mp4" }, mediaRole: "evidence" },
      ]),
    ).toHaveLength(0);
  });
});
