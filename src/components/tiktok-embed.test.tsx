import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TikTokEmbed, extractTikTokVideoId } from "./tiktok-embed";

describe("extractTikTokVideoId", () => {
  // Scenario 3: valid TikTok URL
  it("extracts video ID from standard TikTok URL", () => {
    expect(
      extractTikTokVideoId("https://www.tiktok.com/@chinaainews/video/7234567890123456789"),
    ).toBe("7234567890123456789");
  });

  // URL with query params
  it("extracts video ID from URL with query params", () => {
    expect(
      extractTikTokVideoId(
        "https://www.tiktok.com/@chinaainews/video/7234567890123456789?q=hello&u=0",
      ),
    ).toBe("7234567890123456789");
  });

  // Scenario 4: non-TikTok URL
  it("returns null for YouTube URL", () => {
    expect(extractTikTokVideoId("https://www.youtube.com/watch?v=123")).toBeNull();
  });

  it("returns null for non-video TikTok URL", () => {
    expect(extractTikTokVideoId("https://www.tiktok.com/@chinaainews")).toBeNull();
  });

  // Scenario 2: empty string
  it("returns null for empty string", () => {
    expect(extractTikTokVideoId("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(extractTikTokVideoId("   ")).toBeNull();
  });

  // URL without @username (still valid TikTok format)
  it("extracts video ID from URL without www", () => {
    expect(extractTikTokVideoId("https://tiktok.com/@someuser/video/9999888877776666")).toBe(
      "9999888877776666",
    );
  });
});

describe("TikTokEmbed", () => {
  // Scenario 3: valid URL → blockquote with data-video-id
  it("renders blockquote with correct data-video-id when URL is valid", () => {
    const html = renderToStaticMarkup(
      <TikTokEmbed url="https://www.tiktok.com/@chinaainews/video/7234567890123456789" />,
    );
    expect(html).toContain("tiktok-embed");
    expect(html).toContain('data-video-id="7234567890123456789"');
    expect(html).toContain('cite="https://www.tiktok.com/@chinaainews/video/7234567890123456789"');
  });

  // Scenario 5: fallback link present in blockquote section
  it("renders fallback Watch on TikTok link", () => {
    const html = renderToStaticMarkup(
      <TikTokEmbed url="https://www.tiktok.com/@chinaainews/video/7234567890123456789" />,
    );
    expect(html).toContain("Watch on TikTok");
    expect(html).toContain('href="https://www.tiktok.com/@chinaainews/video/7234567890123456789"');
  });

  // Scenario 4: invalid URL → fallback link only, no blockquote
  it("renders only fallback link for non-TikTok URL", () => {
    const html = renderToStaticMarkup(<TikTokEmbed url="https://www.youtube.com/watch?v=123" />);
    expect(html).toContain("Watch on TikTok");
    expect(html).not.toContain("tiktok-embed");
    expect(html).not.toContain("data-video-id");
  });

  // Style constraints
  it("includes max-width and min-width styles", () => {
    const html = renderToStaticMarkup(
      <TikTokEmbed url="https://www.tiktok.com/@chinaainews/video/7234567890123456789" />,
    );
    expect(html).toContain("max-width");
    expect(html).toContain("min-width");
  });
});
