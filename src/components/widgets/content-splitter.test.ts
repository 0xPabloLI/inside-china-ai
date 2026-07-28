import { describe, it, expect } from "vitest";
import { splitContent } from "./content-splitter";

describe("splitContent", () => {
  // S1: Content with no markers → single markdown segment
  it("returns a single markdown segment when content has no markers", () => {
    const content = "Just some regular markdown text.\n\n## Heading";
    const result = splitContent(content);
    expect(result).toEqual([
      { type: "markdown", content: "Just some regular markdown text.\n\n## Heading" },
    ]);
  });

  // S2 partial: Content with one marker → two markdown segments + one widget
  it("splits content with one marker into two markdown segments and one widget", () => {
    const content = "Before widget.\n\n<!-- widget:deepseek-talent -->\n\nAfter widget.";
    const result = splitContent(content);
    expect(result).toEqual([
      { type: "markdown", content: "Before widget." },
      { type: "widget", name: "deepseek-talent" },
      { type: "markdown", content: "After widget." },
    ]);
  });

  // S2 partial: Content with multiple markers → correct alternating segments
  it("splits content with multiple markers into alternating segments", () => {
    const content =
      "Intro text.\n\n<!-- widget:deepseek-cloud -->\n\nMiddle text.\n\n<!-- widget:deepseek-funding -->\n\nEnd text.";
    const result = splitContent(content);
    expect(result).toEqual([
      { type: "markdown", content: "Intro text." },
      { type: "widget", name: "deepseek-cloud" },
      { type: "markdown", content: "Middle text." },
      { type: "widget", name: "deepseek-funding" },
      { type: "markdown", content: "End text." },
    ]);
  });

  // S7: Marker with extra whitespace → parsed correctly
  it("parses markers with extra whitespace", () => {
    const content = "Text.\n\n<!--   widget:deepseek-pricing   -->\n\nMore text.";
    const result = splitContent(content);
    expect(result).toEqual([
      { type: "markdown", content: "Text." },
      { type: "widget", name: "deepseek-pricing" },
      { type: "markdown", content: "More text." },
    ]);
  });

  // S3: Unknown widget name → preserved in output
  it("preserves unknown widget names in output", () => {
    const content = "Text.\n\n<!-- widget:tallent -->\n\nMore text.";
    const result = splitContent(content);
    expect(result).toEqual([
      { type: "markdown", content: "Text." },
      { type: "widget", name: "tallent" },
      { type: "markdown", content: "More text." },
    ]);
  });

  // S4: Same widget name twice → both preserved
  it("preserves duplicate widget names", () => {
    const content =
      "Start.\n\n<!-- widget:deepseek-pricing -->\n\nMiddle.\n\n<!-- widget:deepseek-pricing -->\n\nEnd.";
    const result = splitContent(content);
    expect(result).toEqual([
      { type: "markdown", content: "Start." },
      { type: "widget", name: "deepseek-pricing" },
      { type: "markdown", content: "Middle." },
      { type: "widget", name: "deepseek-pricing" },
      { type: "markdown", content: "End." },
    ]);
  });

  // S5: Marker at start of content → empty first markdown segment
  it("handles marker at start of content", () => {
    const content = "<!-- widget:deepseek-cloud -->\n\nAfter widget.";
    const result = splitContent(content);
    expect(result).toEqual([
      { type: "markdown", content: "" },
      { type: "widget", name: "deepseek-cloud" },
      { type: "markdown", content: "After widget." },
    ]);
  });

  // S6: Marker at end of content → empty last markdown segment
  it("handles marker at end of content", () => {
    const content = "Before widget.\n\n<!-- widget:deepseek-cloud -->";
    const result = splitContent(content);
    expect(result).toEqual([
      { type: "markdown", content: "Before widget." },
      { type: "widget", name: "deepseek-cloud" },
      { type: "markdown", content: "" },
    ]);
  });

  // Edge: empty content
  it("returns single empty markdown segment for empty content", () => {
    const result = splitContent("");
    expect(result).toEqual([{ type: "markdown", content: "" }]);
  });

  // Edge: multiple consecutive markers
  it("handles consecutive markers with no text between them", () => {
    const content = "<!-- widget:deepseek-cloud -->\n\n<!-- widget:deepseek-talent -->";
    const result = splitContent(content);
    expect(result).toEqual([
      { type: "markdown", content: "" },
      { type: "widget", name: "deepseek-cloud" },
      { type: "markdown", content: "" },
      { type: "widget", name: "deepseek-talent" },
      { type: "markdown", content: "" },
    ]);
  });
});
