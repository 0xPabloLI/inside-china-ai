/**
 * Media role resolution (2026-11-18, user decision B).
 *
 * Default is decoration unless `media.evidence === true`; explicit `mediaRole`
 * overrides. Hooks only get a picture when it is proof.
 */
import { describe, it, expect } from "vitest";
import {
  MEDIA_ROLE,
  mediaRoleOf,
  isEvidenceMedia,
  renderableMedia,
} from "../lib/media-role.mjs";

describe("mediaRoleOf", () => {
  it("defaults to decorative when nothing is declared", () => {
    expect(mediaRoleOf({ id: 1, media: { src: "still.png" } })).toBe(MEDIA_ROLE.DECORATIVE);
  });

  it("reads media.evidence === true as evidence", () => {
    expect(mediaRoleOf({ id: 1, media: { src: "capture.png", evidence: true } })).toBe(
      MEDIA_ROLE.EVIDENCE,
    );
  });

  it("lets an explicit role win over the evidence flag", () => {
    expect(
      mediaRoleOf({ id: 1, media: { src: "still.png", evidence: true }, mediaRole: "decorative" }),
    ).toBe(MEDIA_ROLE.DECORATIVE);
    expect(mediaRoleOf({ id: 1, media: { src: "clip.mp4" }, mediaRole: "evidence" })).toBe(
      MEDIA_ROLE.EVIDENCE,
    );
  });

  it("returns decorative for a scene with no media", () => {
    expect(mediaRoleOf({ id: 1 })).toBe(MEDIA_ROLE.DECORATIVE);
  });
});

describe("isEvidenceMedia", () => {
  it("is false without media even when the role says evidence", () => {
    expect(isEvidenceMedia({ id: 1, mediaRole: "evidence" })).toBe(false);
  });

  it("is true only for media that resolves to evidence", () => {
    expect(isEvidenceMedia({ id: 1, media: { evidence: true } })).toBe(true);
    expect(isEvidenceMedia({ id: 1, media: {} })).toBe(false);
  });
});

describe("renderableMedia", () => {
  it("returns decorative media for narrative scenes (the card still shows it)", () => {
    const media = { src: "still.png" };
    expect(renderableMedia({ id: 1, visualType: "narrative", media })).toBe(media);
  });

  it("drops decorative media in hooks", () => {
    expect(renderableMedia({ id: 1, visualType: "hook", media: { src: "still.png" } })).toBe(null);
  });

  it("keeps evidence media in hooks", () => {
    const media = { src: "demo.png", evidence: true };
    expect(renderableMedia({ id: 1, visualType: "hook", media })).toBe(media);
  });
});
