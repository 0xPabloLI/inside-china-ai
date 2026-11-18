/**
 * Media role resolution (2026-11-18, revised 2026-11-19).
 *
 * Three treatments: evidence keeps the full-bleed band, background fills the
 * frame behind the text scrims, card is the bounded window. Default for
 * non-evidence media is background; `decorative` is a legacy card alias.
 */
import { describe, it, expect } from "vitest";
import {
  MEDIA_ROLE,
  mediaRoleOf,
  isEvidenceMedia,
  renderableMedia,
} from "../lib/media-role.mjs";

describe("mediaRoleOf", () => {
  it("defaults to background when nothing is declared", () => {
    expect(mediaRoleOf({ id: 1, media: { src: "still.png" } })).toBe(MEDIA_ROLE.BACKGROUND);
  });

  it("reads media.evidence === true as evidence", () => {
    expect(mediaRoleOf({ id: 1, media: { src: "capture.png", evidence: true } })).toBe(
      MEDIA_ROLE.EVIDENCE,
    );
  });

  it("lets an explicit role win over the evidence flag", () => {
    expect(
      mediaRoleOf({ id: 1, media: { src: "still.png", evidence: true }, mediaRole: "decorative" }),
    ).toBe(MEDIA_ROLE.CARD);
    expect(mediaRoleOf({ id: 1, media: { src: "clip.mp4" }, mediaRole: "evidence" })).toBe(
      MEDIA_ROLE.EVIDENCE,
    );
    expect(mediaRoleOf({ id: 1, media: { src: "still.png" }, mediaRole: "background" })).toBe(
      MEDIA_ROLE.BACKGROUND,
    );
    expect(mediaRoleOf({ id: 1, media: { src: "object.png" }, mediaRole: "card" })).toBe(
      MEDIA_ROLE.CARD,
    );
  });

  it("returns background for a scene with no media", () => {
    expect(mediaRoleOf({ id: 1 })).toBe(MEDIA_ROLE.BACKGROUND);
  });
});

describe("isEvidenceMedia", () => {
  it("is false without media even when the role says evidence", () => {
    expect(isEvidenceMedia({ id: 1, mediaRole: "evidence" })).toBe(false);
  });

  it("is true only for media that resolves to evidence", () => {
    expect(isEvidenceMedia({ id: 1, media: { evidence: true } })).toBe(true);
    expect(isEvidenceMedia({ id: 1, media: {} })).toBe(false);
    expect(isEvidenceMedia({ id: 1, media: {}, mediaRole: "background" })).toBe(false);
    expect(isEvidenceMedia({ id: 1, media: {}, mediaRole: "card" })).toBe(false);
  });
});

describe("renderableMedia", () => {
  it("returns background media for narrative scenes", () => {
    const media = { src: "still.png" };
    expect(renderableMedia({ id: 1, visualType: "narrative", media })).toBe(media);
  });

  it("drops background and card media in hooks", () => {
    expect(renderableMedia({ id: 1, visualType: "hook", media: { src: "still.png" } })).toBe(null);
    expect(
      renderableMedia({ id: 1, visualType: "hook", media: { src: "object.png" }, mediaRole: "card" }),
    ).toBe(null);
  });

  it("keeps evidence media in hooks", () => {
    const media = { src: "demo.png", evidence: true };
    expect(renderableMedia({ id: 1, visualType: "hook", media })).toBe(media);
  });
});
