import { describe, expect, it } from "vitest";
import { assertNewsletterUpdated, buildNewsletterRow } from "./newsletters.functions";

const input = {
  subject: "Weekly",
  title: null,
  excerpt: null,
  content: "body",
  postUrl: null,
  scheduledAt: null,
};

describe("buildNewsletterRow", () => {
  // #319 OCR lib scan (M): created_by was part of the shared insert/update row,
  // so every edit overwrote the original author with the current user.
  it("stamps created_by on insert", () => {
    expect(buildNewsletterRow(input, "insert", "user-1").created_by).toBe("user-1");
  });

  it("leaves created_by out of the update row", () => {
    expect("created_by" in buildNewsletterRow(input, "update")).toBe(false);
  });

  it("derives the status from scheduledAt", () => {
    const scheduled = buildNewsletterRow(
      { ...input, scheduledAt: "2026-10-01T10:00:00.000Z" },
      "update",
    );
    expect(scheduled.status).toBe("scheduled");
    expect(buildNewsletterRow(input, "insert", "u").status).toBe("draft");
  });
});

describe("assertNewsletterUpdated", () => {
  // #319 OCR lib scan (M): the update is filtered to editable statuses, so an
  // already-sent newsletter updated zero rows and the save still reported success.
  it("throws when the filtered update matched no row", () => {
    expect(() => assertNewsletterUpdated([])).toThrow(/can no longer be edited/);
    expect(() => assertNewsletterUpdated(null)).toThrow(/can no longer be edited/);
  });

  it("accepts a matched row", () => {
    expect(() => assertNewsletterUpdated([{ id: "nl-1" }])).not.toThrow();
  });
});
