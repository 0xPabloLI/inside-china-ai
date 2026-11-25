import { describe, it, expect } from "vitest";
import {
  CAPTION_READABILITY,
  auditCaptionReadability,
  shouldEnforceCaptionReadability,
} from "../lib/caption-readability.mjs";

const CTA = "\nFollow for more China AI news.";
const TAGS = "\n\n#chinaai #capcut #aimusicvideo #hackathon";

describe("auditCaptionReadability", () => {
  it("passes a short hook, a short body, and a hashtag block", () => {
    const caption = `CapCut ran a three-hour AI music hackathon in Beijing. 20+ teams built live visuals.${CTA}${TAGS}\n`;
    const audit = auditCaptionReadability(caption);
    expect(audit.ok).toBe(true);
    expect(audit.metrics.previewChars).toBeLessThanOrEqual(CAPTION_READABILITY.previewWarnChars);
    expect(audit.metrics.bodyChars).toBeLessThanOrEqual(CAPTION_READABILITY.bodyWarnChars);
    expect(audit.issues).toEqual([]);
  });

  it("fails the single-block caption shape that triggered this gate", () => {
    const body = `${"A".repeat(389)}${CTA}`;
    const audit = auditCaptionReadability(`${body}${TAGS}\n`);
    expect(audit.ok).toBe(false);
    expect(audit.issues.some((issue) => issue.code === "preview" && issue.level === "fail")).toBe(
      true,
    );
    expect(audit.issues.some((issue) => issue.code === "body" && issue.level === "fail")).toBe(
      true,
    );
    // Hashtags do not count as body copy.
    expect(audit.metrics.bodyChars).toBe(body.length);
    expect(audit.metrics.totalChars).toBe(`${body}${TAGS}`.length);
  });

  it("warns but does not fail when only the body is in the soft band", () => {
    const body = `Short hook.${CTA}\n${"B".repeat(220)}`;
    const audit = auditCaptionReadability(`${body}${TAGS}\n`);
    expect(audit.ok).toBe(true);
    expect(audit.issues).toEqual([expect.objectContaining({ level: "warn", code: "body" })]);
  });

  it("treats the first visible line, not the whole body, as the fold preview", () => {
    const body = `Short hook that fits.${CTA}\n${"C".repeat(220)}`;
    const audit = auditCaptionReadability(`${body}${TAGS}\n`);
    expect(audit.metrics.previewChars).toBe("Short hook that fits.".length);
    expect(audit.issues.every((issue) => issue.code !== "preview")).toBe(true);
  });
});

describe("shouldEnforceCaptionReadability", () => {
  it("grandfathers packs dated before 2026-11-25", () => {
    expect(shouldEnforceCaptionReadability({ createdAt: "2026-11-23" })).toBe(false);
    expect(shouldEnforceCaptionReadability({ createdAt: "2026-11-24T23:59:59+08:00" })).toBe(false);
  });

  it("enforces on new and undated packs", () => {
    expect(shouldEnforceCaptionReadability({ createdAt: "2026-11-25" })).toBe(true);
    expect(shouldEnforceCaptionReadability({})).toBe(true);
    expect(shouldEnforceCaptionReadability(null)).toBe(true);
  });
});
