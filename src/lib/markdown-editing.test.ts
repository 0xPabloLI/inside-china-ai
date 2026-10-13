import { describe, expect, it } from "vitest";
import { escapeMarkdownLinkText, insertBlockAt } from "./markdown-editing";

describe("insertBlockAt", () => {
  // #319 OCR components scan (M): a block dropped at the start of a line, at
  // the start of the document, or mid-line was glued to the neighbouring text,
  // so `---` mid-line produced "---text" instead of a horizontal rule.
  it("inserts into an empty document as-is", () => {
    expect(insertBlockAt("", 0, "---")).toEqual({ text: "---", cursor: 3 });
  });

  it("separates the block from the preceding paragraph", () => {
    const { text, cursor } = insertBlockAt("Intro line", 10, "---");
    expect(text).toBe("Intro line\n\n---");
    expect(cursor).toBe(15);
  });

  it("keeps a blank line when the cursor sits at the start of the next line", () => {
    // One newline is not enough: "line1\n---" parses as a setext heading.
    expect(insertBlockAt("line1\nline2", 6, "---").text).toBe("line1\n\n---\n\nline2");
  });

  it("separates the block from the text that follows a mid-line cursor", () => {
    const { text, cursor } = insertBlockAt("abcdef", 3, "```\ncode\n```");
    expect(text).toBe("abc\n\n```\ncode\n```\n\ndef");
    expect(cursor).toBe(17);
  });

  it("does not add a blank line the document already has", () => {
    expect(insertBlockAt("a\n\nb", 3, "---").text).toBe("a\n\n---\n\nb");
  });

  it("leaves text that already starts on a new line untouched", () => {
    expect(insertBlockAt("abc\ndef", 3, "---").text).toBe("abc\n\n---\ndef");
  });
});

describe("escapeMarkdownLinkText", () => {
  // #319 OCR components scan (L): a file name containing "]" broke the
  // [name](url) link the uploader inserts.
  it("escapes brackets and backslashes", () => {
    expect(escapeMarkdownLinkText("draft[1].pdf")).toBe("draft\\[1\\].pdf");
    expect(escapeMarkdownLinkText("notes].md")).toBe("notes\\].md");
    expect(escapeMarkdownLinkText("back\\slash.pdf")).toBe("back\\\\slash.pdf");
  });

  it("leaves ordinary names alone", () => {
    expect(escapeMarkdownLinkText("report-2026.pdf")).toBe("report-2026.pdf");
  });
});
