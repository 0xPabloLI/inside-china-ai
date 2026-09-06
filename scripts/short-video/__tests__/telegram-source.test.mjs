/**
 * Issue #204: Telegram public channel sources (t.me/s/ preview parsing).
 *
 * The parser runs on the real preview-page structure: message blocks carry
 * data-post, an ISO <time datetime>, and a tgme_widget_message_text body.
 * Service messages and media-only posts must be skipped, and the registry
 * contract (fields, tracking, attribution) must hold for every channel.
 */
import { describe, it, expect } from "vitest";
import {
  TELEGRAM_SOURCES,
  parseTelegramChannelHtml,
  ALL_SOURCES,
  SOURCE_ATTRIBUTIONS,
} from "../lib/source-registry.mjs";

// Fixture mirrors the real t.me/s/ markup (see aipost probe, 2026-09-06):
// each message block is anchored on data-post; text bodies contain nested
// <b>/<i>/<tg-emoji> tags and <br>.
const FIXTURE = `
<div class="tgme_widget_message_wrap">
<div class="tgme_widget_message " data-post="aipost/8046" data-view="...">
  <div class="tgme_widget_message_bubble">
    <a class="tgme_widget_message_date" href="https://t.me/aipost/8046">
      <time datetime="2026-09-04T02:22:02+00:00">02:22</time>
    </a>
    <div class="tgme_widget_message_text js-message_text" dir="auto">
      <tg-emoji emoji-id="1"><i class="emoji"><b>❗️</b></i></tg-emoji><b>Ban
      Artificial Superintelligence Act</b> announced today<br>with full text
      <a href="https://example.gov/bill">example.gov/bill</a>
    </div>
    <div class="tgme_widget_message_footer">
      <span class="tgme_widget_message_views">1.2K</span>
    </div>
  </div>
</div>
<div class="tgme_widget_message " data-post="aipost/8047" data-view="...">
  <div class="tgme_widget_message_bubble">
    <a class="tgme_widget_message_date" href="https://t.me/aipost/8047">
      <time datetime="2026-09-04T05:35:19+00:00">05:35</time>
    </a>
    <div class="tgme_widget_message_text js-message_text" dir="auto">Tesla Cybercab with no steering wheel is being tested in Austin</div>
    <div class="tgme_widget_message_footer"></div>
  </div>
</div>
<div class="tgme_widget_message " data-post="aipost/8048" data-view="...">
  <div class="tgme_widget_message_bubble">
    <a class="tgme_widget_message_date" href="https://t.me/aipost/8048">
      <time datetime="2026-09-04T09:24:19+00:00">09:24</time>
    </a>
    <div class="tgme_widget_message_photo" style="background-image:url('x.jpg')"></div>
    <div class="tgme_widget_message_footer"></div>
  </div>
</div>
<div class="tgme_widget_message " data-post="aipost/8049" data-view="...">
  <div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text js-message_text" dir="auto">Channel name was changed to «something»</div>
    <div class="tgme_widget_message_footer"></div>
  </div>
</div>
</div>`;

describe("parseTelegramChannelHtml", () => {
  it("extracts text posts into the shared article contract", () => {
    const items = parseTelegramChannelHtml(FIXTURE);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: expect.stringContaining("Ban Artificial Superintelligence Act"),
      url: "https://t.me/aipost/8046",
      publishedAt: "2026-09-04T02:22:02+00:00",
    });
    // HTML tags stripped, <br> collapsed to a space
    expect(items[0].title).not.toMatch(/<[^>]+>/);
    expect(items[0].snippet).toContain("with full text");
    expect(items[1]).toMatchObject({
      title: "Tesla Cybercab with no steering wheel is being tested in Austin",
      url: "https://t.me/aipost/8047",
      publishedAt: "2026-09-04T05:35:19+00:00",
    });
  });

  it("skips media-only posts and service messages", () => {
    const items = parseTelegramChannelHtml(FIXTURE);
    // 8048 has no text div, 8049 is a service message — neither may appear
    expect(items.map((i) => i.url)).toEqual([
      "https://t.me/aipost/8046",
      "https://t.me/aipost/8047",
    ]);
  });

  it("collapses entity-decoded whitespace-only bodies into skips", () => {
    const html = `<div data-post="ch/1"><time datetime="2026-09-04T00:00:00+00:00"></time>
      <div class="tgme_widget_message_text" dir="auto"> &nbsp; </div></div>`;
    expect(parseTelegramChannelHtml(html)).toEqual([]);
  });

  it("long messages are truncated to a 160-char title with full snippet", () => {
    const long = "x".repeat(300);
    const html = `<div data-post="ch/9"><time datetime="2026-09-04T00:00:00+00:00"></time>
      <div class="tgme_widget_message_text" dir="auto">${long}</div></div>`;
    const [item] = parseTelegramChannelHtml(html);
    expect(item.title).toHaveLength(160);
    expect(item.title.endsWith("...")).toBe(true);
    expect(item.snippet).toHaveLength(300);
  });

  it("returns [] on empty, non-string, or garbage input without throwing", () => {
    expect(parseTelegramChannelHtml("")).toEqual([]);
    expect(parseTelegramChannelHtml(null)).toEqual([]);
    expect(parseTelegramChannelHtml(undefined)).toEqual([]);
    expect(parseTelegramChannelHtml(42)).toEqual([]);
    expect(parseTelegramChannelHtml("<html>not a preview page</html>")).toEqual([]);
  });

  it("handles nested divs inside the message body without truncation", () => {
    const html = `<div data-post="ch/2"><time datetime="2026-09-05T00:00:00+00:00"></time>
      <div class="tgme_widget_message_text" dir="auto">outer <div class="spoiler">hidden</div> tail</div></div>`;
    const [item] = parseTelegramChannelHtml(html);
    expect(item.title).toContain("outer hidden tail");
  });
});

describe("Telegram source registry contract", () => {
  it("registers verified channels with fixed-feed api-first shape", () => {
    // Only live, weekly-updated, AI-relevant channels admitted (2026-09-06 probe)
    expect(TELEGRAM_SOURCES.map((s) => s.name)).toEqual(["telegram_aipost"]);
    for (const source of TELEGRAM_SOURCES) {
      expect(source.category).toBe("international");
      expect(source.supportsKeyword).toBe(false);
      expect(source.needsAuth).toBe(false);
      expect(source.accessMethod.primary).toBe("api");
      expect(source.sourceRole).toBe("tracked-feed-context");
      expect(source.tracking.access).toBe("public-rss");
      expect(source.tracking.freshnessWindowDays).toBeGreaterThan(0);
      expect(source.apiSearch.authRequired).toBe(false);
      expect(source.url()).toMatch(/^https:\/\/t\.me\/s\/[a-z_0-9]+$/);
      expect(typeof source.apiSearch.parser).toBe("function");
    }
  });

  it("every telegram source is wired into ALL_SOURCES with attribution", () => {
    for (const source of TELEGRAM_SOURCES) {
      expect(ALL_SOURCES.some((s) => s.name === source.name)).toBe(true);
      expect(SOURCE_ATTRIBUTIONS[source.name]).toBeDefined();
      expect(SOURCE_ATTRIBUTIONS[source.name].text(source)).toContain("t.me");
    }
  });
});
