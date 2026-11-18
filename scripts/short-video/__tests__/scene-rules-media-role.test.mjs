/**
 * Media role gate (2026-11-18, revised 2026-11-19).
 *
 * Declared roles must be legal, must point at media that exists, and must not
 * contradict the evidence flag or a media-led hook.
 */
import { describe, it, expect } from "vitest";
import { checkMediaRoleContract } from "../lib/scene-rules.mjs";

describe("checkMediaRoleContract", () => {
  it("passes an undeclared role (background is the default)", () => {
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
    const findings = checkMediaRoleContract([{ id: 2, mediaRole: "background" }]);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("no media field");
  });

  it("fails card (and legacy decorative) + evidence:true on the same field", () => {
    expect(
      checkMediaRoleContract([
        { id: 3, media: { src: "capture.png", evidence: true }, mediaRole: "card" },
      ]),
    ).toHaveLength(1);
    const findings = checkMediaRoleContract([
      { id: 3, media: { src: "capture.png", evidence: true }, mediaRole: "decorative" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("contradict");
  });

  it("fails a media-led hook carried by background media", () => {
    const findings = checkMediaRoleContract([
      { id: 4, visualType: "hook", layout: "media-led", media: { src: "still.png" } },
      {
        id: 5,
        visualType: "hook",
        layout: "media-led",
        media: { src: "still.png" },
        mediaRole: "background",
      },
    ]);
    expect(findings).toHaveLength(2);
    expect(findings[0].detail).toContain("hero-center");
  });

  it("passes evidence hooks, explicit background, and legacy decorative", () => {
    expect(
      checkMediaRoleContract([
        {
          id: 5,
          visualType: "hook",
          layout: "media-led",
          media: { src: "demo.png", evidence: true },
        },
        { id: 6, media: { src: "lap.mp4" }, mediaRole: "evidence" },
        { id: 7, media: { src: "still.png" }, mediaRole: "background" },
        { id: 8, media: { src: "object.png" }, mediaRole: "decorative" },
      ]),
    ).toHaveLength(0);
  });
});
