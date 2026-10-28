import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { canonicalizeUrl } from "../lib/url-normalizer.mjs";
import {
  selectStrategy,
  ADAPTER_IDS,
  downloadDirectHttp,
  downloadDouyinCdp,
  extractDouyinVideoId,
  downloadVideo,
  CobaltAdapter,
  buildYtdlpCommand,
  isWeiboUrl,
  weiboCookieNetscape,
  isTiktokUrl,
} from "../lib/video-downloaders.mjs";

// ─── Test helpers ───

/** Create a mock fetch that returns a Response-like object */
function makeMockFetch(responses) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const handler = typeof responses === "function" ? responses(url, opts) : responses[url];
    if (!handler) throw new Error(`Unexpected fetch: ${url}`);
    return handler;
  };
  fn.calls = calls;
  return fn;
}

/** Mock Response object */
function mockResponse({
  ok = true,
  status = 200,
  contentType = "video/mp4",
  body = Buffer.alloc(2048),
} = {}) {
  return {
    ok,
    status,
    headers: {
      get: (key) => {
        const name = key.toLowerCase();
        if (name === "content-type") return contentType;
        return null;
      },
    },
    arrayBuffer: async () => body,
    json: async () => JSON.parse(body.toString()),
  };
}

/** Create a valid video buffer (>1KB) */
const validBuffer = Buffer.alloc(2048, 0x00);
// Write ftyp box header to make it look like an MP4
validBuffer.writeUInt32BE(0x20, 0); // box size
validBuffer.write("ftyp", 4, "ascii"); // box type

// ─── T-VDL-1: canonicalizeUrl ───

describe("canonicalizeUrl", () => {
  it("strips query string and fragment", () => {
    expect(canonicalizeUrl("https://example.com/video.mp4?utm_source=foo&from=bar#section")).toBe(
      "https://example.com/video.mp4",
    );
  });

  it("normalizes http:// to https://", () => {
    expect(canonicalizeUrl("http://example.com/video.mp4")).toBe("https://example.com/video.mp4");
  });

  it("normalizes trailing slash", () => {
    expect(canonicalizeUrl("https://example.com/video.mp4/")).toBe("https://example.com/video.mp4");
    // But don't strip trailing slash on root path
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("lowercases hostname", () => {
    expect(canonicalizeUrl("https://WWW.Example.COM/Video.mp4")).toBe(
      "https://www.example.com/Video.mp4",
    );
  });

  it("returns empty string for null input (VD-09)", () => {
    expect(canonicalizeUrl(null)).toBe("");
  });

  it("returns empty string for undefined input (VD-09)", () => {
    expect(canonicalizeUrl(undefined)).toBe("");
  });

  it("returns empty string for empty string input (VD-09)", () => {
    expect(canonicalizeUrl("")).toBe("");
  });

  it("is idempotent for already-canonical URLs (VD-10)", () => {
    const canonical = "https://example.com/video.mp4";
    expect(canonicalizeUrl(canonical)).toBe(canonical);
  });

  it("deduplicates same URL with different query params (VD-10)", () => {
    const a = canonicalizeUrl("https://example.com/watch?v=abc&t=10");
    const b = canonicalizeUrl("https://example.com/watch?v=abc&t=20");
    expect(a).toBe(b);
  });

  it("handles non-URL strings gracefully", () => {
    // Should not throw — return as-is with https:// prefix if it looks like a domain
    expect(canonicalizeUrl("not-a-url")).toBe("not-a-url");
  });
});

// ─── T-VDL-2: selectStrategy ───

describe("selectStrategy", () => {
  it("selects direct-http for .mp4 direct media URL (VD-01)", () => {
    const result = selectStrategy("https://cdn.pexels.com/videos/12345.mp4");
    expect(result.adapter).toBe(ADAPTER_IDS.DIRECT_HTTP);
  });

  it("selects direct-http for known CDN domain", () => {
    const result = selectStrategy("https://videos.pexels.com/videothumbnails/abc.mp4");
    expect(result.adapter).toBe(ADAPTER_IDS.DIRECT_HTTP);
  });

  it("selects ytdlp for YouTube URL (VD-02)", () => {
    const result = selectStrategy("https://www.youtube.com/watch?v=abc123");
    expect(result.adapter).toBe(ADAPTER_IDS.YTDLP);
  });

  it("selects ytdlp for B站 URL", () => {
    const result = selectStrategy("https://www.bilibili.com/video/BV1abc123");
    expect(result.adapter).toBe(ADAPTER_IDS.YTDLP);
  });

  it("selects cobalt for unknown public URL", () => {
    // douyin is no longer a cobalt specimen — it has its own douyin-cdp adapter (#182)
    const result = selectStrategy("https://vimeo.com/123456789");
    expect(result.adapter).toBe(ADAPTER_IDS.COBALT);
  });

  it("returns skipped for null URL (VD-09)", () => {
    const result = selectStrategy(null);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("empty-url");
  });

  it("returns skipped for empty string URL (VD-09)", () => {
    const result = selectStrategy("");
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("empty-url");
  });

  it("canonicalizes URL before selecting (VD-10)", () => {
    const a = selectStrategy("https://www.youtube.com/watch?v=abc&t=10");
    const b = selectStrategy("https://www.youtube.com/watch?v=abc&t=20");
    expect(a.canonicalUrl).toBe(b.canonicalUrl);
  });
});

// ─── T-VDL-3: DirectHttp adapter ───

describe("downloadDirectHttp", () => {
  it("downloads .mp4 and returns DownloadResult with buffer (VD-01)", async () => {
    const fetchFn = makeMockFetch({
      "https://cdn.example.com/video.mp4": mockResponse({ body: validBuffer }),
    });
    const result = await downloadDirectHttp("https://cdn.example.com/video.mp4", { fetchFn });
    expect(result.status).toBe("downloaded");
    expect(result.strategy).toBe(ADAPTER_IDS.DIRECT_HTTP);
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.byteLength).toBe(validBuffer.length);
    expect(result.mimeType).toBe("video/mp4");
  });

  it("fails for file <1KB (file-too-small)", async () => {
    const tinyBuf = Buffer.alloc(100, 0x00);
    const fetchFn = makeMockFetch({
      "https://cdn.example.com/tiny.mp4": mockResponse({ body: tinyBuf }),
    });
    const result = await downloadDirectHttp("https://cdn.example.com/tiny.mp4", { fetchFn });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("file-too-small");
  });

  it("skips for file >20MB (VD-13)", async () => {
    const bigBuf = Buffer.alloc(21 * 1024 * 1024, 0x00);
    const fetchFn = makeMockFetch({
      "https://cdn.example.com/big.mp4": mockResponse({ body: bigBuf }),
    });
    const result = await downloadDirectHttp("https://cdn.example.com/big.mp4", { fetchFn });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("exceeds-size-limit");
  });

  it("skips for non-video MIME (VD-14)", async () => {
    const fetchFn = makeMockFetch({
      "https://cdn.example.com/page.mp4": mockResponse({
        contentType: "text/html",
        body: validBuffer,
      }),
    });
    const result = await downloadDirectHttp("https://cdn.example.com/page.mp4", { fetchFn });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("non-media-mime");
  });

  it("fails on HTTP 404", async () => {
    const fetchFn = makeMockFetch({
      "https://cdn.example.com/missing.mp4": mockResponse({ ok: false, status: 404 }),
    });
    const result = await downloadDirectHttp("https://cdn.example.com/missing.mp4", { fetchFn });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("http-404");
  });

  it("handles network error as retryable", async () => {
    const fetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await downloadDirectHttp("https://cdn.example.com/video.mp4", { fetchFn });
    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(true);
  });
});

// ─── T-VDL-4: Cobalt adapter ───

describe("CobaltAdapter", () => {
  it("preflight succeeds and caches services (VD-04)", async () => {
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: {
              version: "10.0.0",
              url: "http://localhost:9000",
              services: ["youtube", "tiktok", "douyin"],
            },
            git: { commit: "abc", branch: "main", remote: "origin" },
          }),
        ),
      }),
    });
    const cobalt = new CobaltAdapter();
    const ok = await cobalt.preflight(fetchFn);
    expect(ok).toBe(true);
    expect(cobalt.available).toBe(true);
    expect(cobalt.services).toEqual(["youtube", "tiktok", "douyin"]);
    expect(cobalt.version).toBe("10.0.0");
  });

  it("preflight fails -> adapter unavailable (VD-03)", async () => {
    const fetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    const cobalt = new CobaltAdapter();
    const ok = await cobalt.preflight(fetchFn);
    expect(ok).toBe(false);
    expect(cobalt.available).toBe(false);
  });

  it("preflight with turnstile -> unsupported (VD-12)", async () => {
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", turnstileSitekey: "0x123", services: ["youtube"] },
            git: {},
          }),
        ),
      }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://www.youtube.com/watch?v=abc", { fetchFn });
    expect(result.status).toBe("unsupported");
    expect(result.reason).toBe("cobalt-requires-turnstile");
  });

  it("POST returns tunnel -> download media URL (VD-04)", async () => {
    const mediaUrl = "https://tunnel.cobalt.example/video.mp4";
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", services: ["douyin"] },
            git: {},
          }),
        ),
      }),
      "http://localhost:9000": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({ status: "tunnel", url: mediaUrl, filename: "video.mp4" }),
        ),
      }),
      [mediaUrl]: mockResponse({ body: validBuffer }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://www.douyin.com/video/123", { fetchFn });
    expect(result.status).toBe("downloaded");
    expect(result.strategy).toBe(ADAPTER_IDS.COBALT);
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.byteLength).toBe(validBuffer.length);
  });

  it("POST returns redirect -> download media URL (VD-04)", async () => {
    const mediaUrl = "https://redirect.cobalt.example/video.mp4";
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", services: ["tiktok"] },
            git: {},
          }),
        ),
      }),
      "http://localhost:9000": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({ status: "redirect", url: mediaUrl, filename: "video.mp4" }),
        ),
      }),
      [mediaUrl]: mockResponse({ body: validBuffer }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://www.tiktok.com/@user/video/123", { fetchFn });
    expect(result.status).toBe("downloaded");
  });

  it("POST returns picker -> needs-selection (VD-05)", async () => {
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", services: ["tiktok"] },
            git: {},
          }),
        ),
      }),
      "http://localhost:9000": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({ status: "picker", picker: [{ type: "photo", url: "x" }] }),
        ),
      }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://www.tiktok.com/@user/video/123", { fetchFn });
    expect(result.status).toBe("needs-selection");
    expect(result.reason).toBe("picker-response");
  });

  it("POST returns local-processing -> unsupported (VD-05b)", async () => {
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", services: ["youtube"] },
            git: {},
          }),
        ),
      }),
      "http://localhost:9000": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            status: "local-processing",
            type: "merge",
            service: "youtube",
            tunnel: ["url1", "url2"],
            output: { type: "video/mp4", filename: "out.mp4" },
          }),
        ),
      }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://www.youtube.com/watch?v=abc", { fetchFn });
    expect(result.status).toBe("unsupported");
    expect(result.reason).toBe("local-processing-not-supported");
  });

  it("POST returns error.rate_exceeded -> failed + retryable (VD-05c)", async () => {
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", services: ["tiktok"] },
            git: {},
          }),
        ),
      }),
      "http://localhost:9000": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({ status: "error", error: { code: "error.api.rate_exceeded" } }),
        ),
      }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://www.tiktok.com/@user/video/123", { fetchFn });
    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(true);
    expect(result.reason).toBe("rate-limited");
  });

  it("POST returns error.auth.* -> failed + non-retryable (VD-05d)", async () => {
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", services: ["tiktok"] },
            git: {},
          }),
        ),
      }),
      "http://localhost:9000": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({ status: "error", error: { code: "error.api.auth.api_key.missing" } }),
        ),
      }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://www.tiktok.com/@user/video/123", { fetchFn });
    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(false);
    expect(result.reason).toBe("requires-auth");
  });

  it("POST returns non-JSON -> failed (VD-07)", async () => {
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", services: ["tiktok"] },
            git: {},
          }),
        ),
      }),
      "http://localhost:9000": mockResponse({
        contentType: "text/html",
        body: Buffer.from("<html><body>500 Error</body></html>"),
      }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://www.tiktok.com/@user/video/123", { fetchFn });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("invalid-response");
  });

  it("tunnel data.url fetch returns HTML -> failed (VD-08)", async () => {
    const mediaUrl = "https://tunnel.cobalt.example/auth";
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", services: ["tiktok"] },
            git: {},
          }),
        ),
      }),
      "http://localhost:9000": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({ status: "tunnel", url: mediaUrl, filename: "video.mp4" }),
        ),
      }),
      [mediaUrl]: mockResponse({
        contentType: "text/html",
        body: Buffer.from("<html><body>Please log in</body></html>"),
      }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://www.tiktok.com/@user/video/123", { fetchFn });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("non-video-response");
  });

  it("URL platform not in services -> skipped (VD-06)", async () => {
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", services: ["youtube"] },
            git: {},
          }),
        ),
      }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://www.tiktok.com/@user/video/123", { fetchFn });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("platform-not-supported-by-cobalt");
  });

  it("skips >20MB download (VD-13)", async () => {
    const bigBuf = Buffer.alloc(21 * 1024 * 1024, 0x00);
    const mediaUrl = "https://tunnel.cobalt.example/big.mp4";
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", services: ["tiktok"] },
            git: {},
          }),
        ),
      }),
      "http://localhost:9000": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({ status: "tunnel", url: mediaUrl, filename: "video.mp4" }),
        ),
      }),
      [mediaUrl]: mockResponse({ body: bigBuf }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://www.tiktok.com/@user/video/123", { fetchFn });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("exceeds-size-limit");
  });

  it("includes API key in POST headers when configured", async () => {
    const fetchFn = makeMockFetch((url) => {
      if (url === "http://localhost:9000/") {
        return mockResponse({
          contentType: "application/json",
          body: Buffer.from(
            JSON.stringify({
              cobalt: { version: "10.0.0", services: ["tiktok"] },
              git: {},
            }),
          ),
        });
      }
      if (url === "http://localhost:9000") {
        const authHeader = fetchFn.calls[1].opts.headers["Authorization"];
        expect(authHeader).toBe("Api-Key test-key-123");
        return mockResponse({
          contentType: "application/json",
          body: Buffer.from(
            JSON.stringify({ status: "error", error: { code: "error.api.fetch.critical" } }),
          ),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const cobalt = new CobaltAdapter();
    cobalt.apiKey = "test-key-123";
    await cobalt.preflight(fetchFn);
    await cobalt.download("https://www.tiktok.com/@user/video/123", { fetchFn });
  });
});

// ─── T-VDL-5: Integration (downloadVideo) ───

describe("downloadVideo", () => {
  it("routes direct media URL to DirectHttpAdapter (VD-01)", async () => {
    const fetchFn = makeMockFetch({
      "https://cdn.pexels.com/videos/123.mp4": mockResponse({ body: validBuffer }),
    });
    const result = await downloadVideo("https://cdn.pexels.com/videos/123.mp4", {
      fetchFn,
      skipCobaltPreflight: true,
    });
    expect(result.status).toBe("downloaded");
    expect(result.strategy).toBe(ADAPTER_IDS.DIRECT_HTTP);
  });

  it("routes YouTube URL to YtdlpAdapter (VD-02)", () => {
    // Verify strategy selection only — actual yt-dlp download tested separately
    const { adapter } = selectStrategy("https://www.youtube.com/watch?v=abc123");
    expect(adapter).toBe(ADAPTER_IDS.YTDLP);
  });

  it("returns skipped for null URL (VD-09)", async () => {
    const result = await downloadVideo(null, { skipCobaltPreflight: true });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("empty-url");
  });

  it("Cobalt unavailable -> skipped (VD-03, VD-11)", async () => {
    const fetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    const cobalt = new CobaltAdapter();
    const result = await downloadVideo("https://vimeo.com/123456789", {
      fetchFn,
      cobaltAdapter: cobalt,
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("cobalt-unavailable");
  });
});

// ─── T1: Image extension + MIME + headers support ───

describe("T1 — Image support in VDL", () => {
  // Scenario #1: .jpg URL → selectStrategy selects direct-http
  it("selects direct-http for .jpg URL (scenario #1)", () => {
    const result = selectStrategy("https://images.pexels.com/photos/12345.jpg");
    expect(result.adapter).toBe(ADAPTER_IDS.DIRECT_HTTP);
  });

  it("selects direct-http for .png URL", () => {
    const result = selectStrategy("https://images.unsplash.com/photo-123.png");
    expect(result.adapter).toBe(ADAPTER_IDS.DIRECT_HTTP);
  });

  it("selects direct-http for .webp URL", () => {
    const result = selectStrategy("https://cdn.example.com/image.webp");
    expect(result.adapter).toBe(ADAPTER_IDS.DIRECT_HTTP);
  });

  it("selects direct-http for .gif URL", () => {
    const result = selectStrategy("https://cdn.example.com/animation.gif");
    expect(result.adapter).toBe(ADAPTER_IDS.DIRECT_HTTP);
  });

  // Scenario #2: image MIME accepted by downloadDirectHttp
  it("accepts image/jpeg MIME in downloadDirectHttp (scenario #2)", async () => {
    const fetchFn = makeMockFetch({
      "https://cdn.example.com/photo.jpg": mockResponse({
        contentType: "image/jpeg",
        body: validBuffer,
      }),
    });
    const result = await downloadDirectHttp("https://cdn.example.com/photo.jpg", { fetchFn });
    expect(result.status).toBe("downloaded");
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("accepts image/png MIME in downloadDirectHttp", async () => {
    const fetchFn = makeMockFetch({
      "https://cdn.example.com/photo.png": mockResponse({
        contentType: "image/png",
        body: validBuffer,
      }),
    });
    const result = await downloadDirectHttp("https://cdn.example.com/photo.png", { fetchFn });
    expect(result.status).toBe("downloaded");
  });

  it("accepts image/webp MIME in downloadDirectHttp", async () => {
    const fetchFn = makeMockFetch({
      "https://cdn.example.com/photo.webp": mockResponse({
        contentType: "image/webp",
        body: validBuffer,
      }),
    });
    const result = await downloadDirectHttp("https://cdn.example.com/photo.webp", { fetchFn });
    expect(result.status).toBe("downloaded");
  });

  // Scenario #3: .mp4 URL still works (no regression)
  it("still selects direct-http for .mp4 URL (scenario #3, no regression)", () => {
    const result = selectStrategy("https://cdn.pexels.com/videos/123.mp4");
    expect(result.adapter).toBe(ADAPTER_IDS.DIRECT_HTTP);
  });

  // T1.10: text/html still rejected (no regression)
  it("still rejects text/html MIME (no regression)", async () => {
    const fetchFn = makeMockFetch({
      "https://cdn.example.com/page.jpg": mockResponse({
        contentType: "text/html",
        body: validBuffer,
      }),
    });
    const result = await downloadDirectHttp("https://cdn.example.com/page.jpg", { fetchFn });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("non-media-mime");
  });

  // Scenario #20: custom headers passed to fetch
  it("passes custom headers to fetch call (scenario #20)", async () => {
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push({ url, opts });
      return mockResponse({ body: validBuffer, contentType: "image/jpeg" });
    };
    const customHeaders = { "User-Agent": "ChinaAINews/1.0 (contact@china-ai.news)" };
    await downloadDirectHttp("https://cdn.example.com/photo.jpg", {
      fetchFn,
      headers: customHeaders,
    });
    expect(calls[0].opts).toBeDefined();
    expect(calls[0].opts.headers).toEqual(customHeaders);
  });

  it("passes custom headers through downloadVideo to DirectHttp", async () => {
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push({ url, opts });
      return mockResponse({ body: validBuffer, contentType: "image/jpeg" });
    };
    const customHeaders = { "User-Agent": "TestAgent/1.0" };
    await downloadVideo("https://cdn.example.com/photo.jpg", {
      fetchFn,
      headers: customHeaders,
      skipCobaltPreflight: true,
    });
    expect(calls[0].opts).toBeDefined();
    expect(calls[0].opts.headers).toEqual(customHeaders);
  });

  it("does not pass headers when not provided (backward compat)", async () => {
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push({ url, opts });
      return mockResponse({ body: validBuffer, contentType: "video/mp4" });
    };
    await downloadDirectHttp("https://cdn.example.com/video.mp4", { fetchFn });
    // opts should be undefined when no headers
    expect(calls[0].opts).toBeUndefined();
  });
});

// ─── #314: douyin desktop player → signed CDN tracks → 8s H.264 clip ───

describe("douyin-cdp adapter (#314)", () => {
  const VIDEO_ID = "7680095489249536842";
  const SOURCE_URL = `https://www.douyin.com/video/${VIDEO_ID}`;
  const VIDEO_TRACK =
    "https://v3-web.douyinvod.com/abc/video/tos/cn/tos-cn-ve-15/mime_type=video_mp4&media-video-1";
  const AUDIO_TRACK =
    "https://v3-web.douyinvod.com/abc/audio/tos/cn/tos-cn-ve-15/mime_type=video_mp4&media-audio-1";

  /**
   * Injectable CDP fakes for the #314 flow:
   * cdpNewTab → waitForPageLoad → poll evalFn(media tracks) → close.
   * `trackResponses` is a per-poll sequence; the last entry repeats.
   */
  function makeDouyinFakes({
    trackResponses = [[VIDEO_TRACK, AUDIO_TRACK]],
    newTabError = null,
  } = {}) {
    const calls = { tabs: [], closedTabs: [], scripts: [], slept: [] };
    let round = 0;
    return {
      calls,
      cdpNewTabFn: async (url) => {
        if (newTabError) throw newTabError;
        calls.tabs.push(url);
        return "tab-1";
      },
      waitForPageLoadFn: async () => true,
      evalFn: async (tabId, script) => {
        calls.scripts.push(script);
        const value = trackResponses[Math.min(round, trackResponses.length - 1)];
        round += 1;
        return value;
      },
      cdpCloseTabFn: async (tabId) => {
        calls.closedTabs.push(tabId);
      },
      sleepFn: async (ms) => {
        calls.slept.push(ms);
      },
    };
  }

  describe("extractDouyinVideoId", () => {
    it("extracts the id from a douyin.com video URL", () => {
      expect(extractDouyinVideoId(`https://www.douyin.com/video/${VIDEO_ID}`)).toBe(VIDEO_ID);
    });

    it("extracts the id from an iesdouyin share URL", () => {
      expect(extractDouyinVideoId(`https://www.iesdouyin.com/share/video/${VIDEO_ID}`)).toBe(
        VIDEO_ID,
      );
    });

    it("returns null for URLs without a video path", () => {
      expect(extractDouyinVideoId("https://www.douyin.com/user/xyz")).toBeNull();
      expect(extractDouyinVideoId("https://example.com/video/not-digits")).toBeNull();
    });
  });

  describe("selectStrategy", () => {
    it("routes douyin.com video URLs to douyin-cdp", () => {
      const result = selectStrategy(`https://www.douyin.com/video/${VIDEO_ID}`);
      expect(result.adapter).toBe(ADAPTER_IDS.DOUYIN_CDP);
    });

    it("routes iesdouyin.com share URLs to douyin-cdp", () => {
      const result = selectStrategy(`https://www.iesdouyin.com/share/video/${VIDEO_ID}`);
      expect(result.adapter).toBe(ADAPTER_IDS.DOUYIN_CDP);
    });

    it("keeps cobalt fallback for other unknown platforms", () => {
      const result = selectStrategy("https://vk.com/video-123");
      expect(result.adapter).toBe(ADAPTER_IDS.COBALT);
    });
  });

  describe("downloadDouyinCdp", () => {
    it("polls until tracks appear, clips video+audio once with the douyin Referer, closes the tab", async () => {
      const fakes = makeDouyinFakes({
        trackResponses: [[], [VIDEO_TRACK, AUDIO_TRACK]],
      });
      const clip = Buffer.alloc(4096, 0x03);
      const clipFn = vi.fn(async () => clip);

      const result = await downloadDouyinCdp(SOURCE_URL, { ...fakes, clipFn });

      expect(fakes.calls.tabs).toEqual([`https://www.douyin.com/video/${VIDEO_ID}`]);
      // The eval script reads the player's resource timings, not the blob currentSrc.
      expect(fakes.calls.scripts.length).toBeGreaterThanOrEqual(2);
      expect(fakes.calls.scripts[0]).toContain("douyinvod");
      expect(fakes.calls.slept.length).toBeGreaterThanOrEqual(1);
      expect(clipFn).toHaveBeenCalledTimes(1);
      expect(clipFn).toHaveBeenCalledWith({
        videoUrl: VIDEO_TRACK,
        audioUrl: AUDIO_TRACK,
        referer: "https://www.douyin.com/",
        seconds: 8,
      });
      expect(result.status).toBe("downloaded");
      expect(result.strategy).toBe(ADAPTER_IDS.DOUYIN_CDP);
      expect(result.source).toBe("douyin");
      expect(result.sourceUrl).toBe(SOURCE_URL);
      expect(result.finalUrl).toBe(VIDEO_TRACK);
      expect(result.mimeType).toBe("video/mp4");
      expect(result.extension).toBe("mp4");
      expect(result.byteLength).toBe(clip.length);
      expect(result.buffer).toBe(clip);
      expect(fakes.calls.closedTabs).toEqual(["tab-1"]);
    });

    it("fails retryable with no-media-tracks when the player exposes none, closing the tab", async () => {
      const fakes = makeDouyinFakes({ trackResponses: [[]] });
      const clipFn = vi.fn();

      const result = await downloadDouyinCdp(SOURCE_URL, { ...fakes, clipFn });

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("no-media-tracks");
      expect(result.retryable).toBe(true);
      expect(clipFn).not.toHaveBeenCalled();
      expect(fakes.calls.closedTabs).toEqual(["tab-1"]);
    });

    it("fails with clip-failed when ffmpeg clipping throws, closing the tab", async () => {
      const fakes = makeDouyinFakes();
      const clipFn = vi.fn(async () => {
        throw new Error("ffmpeg exited 1");
      });

      const result = await downloadDouyinCdp(SOURCE_URL, { ...fakes, clipFn });

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("clip-failed");
      expect(result.retryable).toBe(true);
      expect(fakes.calls.closedTabs).toEqual(["tab-1"]);
    });

    it("downloads a video-only page by clipping the picture track alone", async () => {
      const fakes = makeDouyinFakes({ trackResponses: [[VIDEO_TRACK]] });
      const clip = Buffer.alloc(4096, 0x01);
      const clipFn = vi.fn(async () => clip);

      const result = await downloadDouyinCdp(SOURCE_URL, { ...fakes, clipFn });

      expect(result.status).toBe("downloaded");
      expect(result.finalUrl).toBe(VIDEO_TRACK);
      expect(result.buffer).toBe(clip);
      expect(result.byteLength).toBe(clip.length);
      expect(clipFn).toHaveBeenCalledTimes(1);
      expect(clipFn.mock.calls[0][0]).toMatchObject({ videoUrl: VIDEO_TRACK, audioUrl: null });
      expect(fakes.calls.closedTabs).toEqual(["tab-1"]);
    });

    it("reports cdp-unavailable when the tab cannot be opened (#182 behavior kept)", async () => {
      const fakes = makeDouyinFakes({ newTabError: new Error("proxy dead") });
      const clipFn = vi.fn();

      const result = await downloadDouyinCdp(SOURCE_URL, { ...fakes, clipFn });

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("cdp-unavailable");
      expect(result.retryable).toBe(true);
      expect(fakes.calls.tabs).toEqual([]);
      expect(fakes.calls.closedTabs).toEqual([]);
      expect(clipFn).not.toHaveBeenCalled();
    });

    it("returns unsupported for douyin URLs without a video id", async () => {
      const fakes = makeDouyinFakes();
      const result = await downloadDouyinCdp("https://www.douyin.com/user/xyz", {
        ...fakes,
        clipFn: vi.fn(),
      });
      expect(result.status).toBe("unsupported");
      expect(result.reason).toBe("no-video-id");
      expect(fakes.calls.tabs).toEqual([]);
    });
  });

  describe("downloadVideo wiring", () => {
    it("routes douyin URLs through douyin-cdp without touching Cobalt", async () => {
      const fakes = makeDouyinFakes({ trackResponses: [[VIDEO_TRACK]] });
      const clipFn = vi.fn(async () => validBuffer);
      const cobalt = new CobaltAdapter();
      const preflightSpy = vi.spyOn(cobalt, "preflight");

      const result = await downloadVideo(SOURCE_URL, {
        ...fakes,
        clipFn,
        cobaltAdapter: cobalt,
      });

      expect(preflightSpy).not.toHaveBeenCalled();
      expect(clipFn).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("downloaded");
      expect(result.strategy).toBe(ADAPTER_IDS.DOUYIN_CDP);
      expect(fakes.calls.closedTabs).toEqual(["tab-1"]);
    });
  });
});

// ─── #75 Batch 2: weibo routing through the ytdlp adapter ───
describe("weibo routing (#75 Batch 2)", () => {
  it("routes weibo.com and m.weibo.cn status URLs to the ytdlp adapter", () => {
    const result = selectStrategy("https://weibo.com/1234567/AbCdEfGh");
    expect(result.adapter).toBe("ytdlp");
    expect(result.canonicalUrl).toContain("weibo.com");

    const mobile = selectStrategy("https://m.weibo.cn/status/5678901");
    expect(mobile.adapter).toBe("ytdlp");
  });

  it("buildYtdlpCommand detects weibo and limits mix_media to the main video", () => {
    const cmd = buildYtdlpCommand("https://weibo.com/1234567/AbCdEfGh", {
      tmpPath: "/tmp/v.mp4",
    });
    expect(cmd).toContain("--playlist-items 1");
    expect(cmd).not.toContain('--cookies "');
  });

  it("attaches the cookie FILE only for weibo URLs (yt-dlp rejects Cookie headers)", () => {
    const weiboCmd = buildYtdlpCommand("https://m.weibo.cn/status/5678901", {
      tmpPath: "/tmp/v.mp4",
      cookieFile: "/tmp/ck.txt",
    });
    expect(weiboCmd).toContain('--cookies "/tmp/ck.txt"');
    expect(weiboCmd).toContain("--playlist-items 1");

    const ytCmd = buildYtdlpCommand("https://www.youtube.com/watch?v=abc", {
      tmpPath: "/tmp/v.mp4",
      cookieFile: "/tmp/ck.txt",
    });
    expect(ytCmd).not.toContain('--cookies "');
    expect(ytCmd).not.toContain("--playlist-items");
  });

  it("#324: buildYtdlpCommand hands the resolved proxy to yt-dlp for the ffmpeg child", () => {
    const KEYS = ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"];
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    try {
      // Uppercase-only: the exact session shape that starves the ffmpeg child.
      for (const k of KEYS) delete process.env[k];
      process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
      expect(
        buildYtdlpCommand("https://www.youtube.com/watch?v=abc", { tmpPath: "/tmp/v.mp4" }),
      ).toContain('--proxy "http://127.0.0.1:7897"');

      // Only the lowercase http_proxy reaches ffmpeg, so that var alone means
      // the child already inherits it — no injection.
      process.env.http_proxy = "http://127.0.0.1:7897";
      expect(
        buildYtdlpCommand("https://www.youtube.com/watch?v=abc", { tmpPath: "/tmp/v.mp4" }),
      ).not.toContain("--proxy ");
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  it("#328: every platform reads the firefox cookie store; chrome is off the path", () => {
    // The invariant is the browser, not the profile: `ytdlpCookieSource()`
    // pins an absolute profile path when discovery finds one and degrades to
    // bare `firefox` when it does not, so asserting the resolved path would
    // make this test depend on the host's Firefox install.
    const yt = buildYtdlpCommand("https://www.youtube.com/watch?v=abc", {
      tmpPath: "/tmp/v.mp4",
    });
    expect(yt).toContain('--cookies-from-browser "firefox');
    expect(yt).not.toContain("chrome");

    const bili = buildYtdlpCommand("https://www.bilibili.com/video/BV1E7wtzaEdq", {
      tmpPath: "/tmp/v.mp4",
    });
    expect(bili).toContain('--cookies-from-browser "firefox');
    expect(bili).not.toContain("chrome");

    const weibo = buildYtdlpCommand("https://weibo.com/1/x", { tmpPath: "/tmp/v.mp4" });
    expect(weibo).toContain('--cookies-from-browser "firefox');
    expect(weibo).not.toContain("chrome");
  });

  it("weiboCookieNetscape formats a raw cookie header for the weibo domains", () => {
    const content = weiboCookieNetscape("SUB=abc; SUBP=def");
    const lines = content
      .trim()
      .split("\n")
      .filter((l) => !l.startsWith("#"));
    // 2 cookies × 4 domains
    expect(lines).toHaveLength(8);
    const subLine = lines.find((l) => l.includes("\tSUB\t"));
    expect(subLine).toContain("weibo.com");
    expect(subLine.split("\t")).toHaveLength(7);
    expect(weiboCookieNetscape("")).toBe(content.split("\n")[0] + "\n");
    expect(weiboCookieNetscape("junk")).toContain("# Netscape");
  });

  it("reports weibo as the source in adapter results source detection", () => {
    const cmd = buildYtdlpCommand("https://weibo.com/1/x", { tmpPath: "/tmp/v.mp4" });
    // source detection is embedded in the adapter; the command itself is
    // URL-agnostic except for weibo-specific flags — assert via the exported
    // detector instead.
    expect(isWeiboUrl("https://weibo.com/1/x")).toBe(true);
    expect(isWeiboUrl("https://www.youtube.com/watch?v=abc")).toBe(false);
  });
});

// ─── #300 stage 2: tiktok routing through the ytdlp adapter ───
describe("tiktok routing (#300 stage 2)", () => {
  it("isTiktokUrl detects tiktok hosts and rejects lookalikes", () => {
    expect(isTiktokUrl("https://www.tiktok.com/@user/video/123")).toBe(true);
    expect(isTiktokUrl("https://m.tiktok.com/@user/video/123")).toBe(true);
    expect(isTiktokUrl("https://vt.tiktok.com/ZSabc123")).toBe(true);
    // Lookalikes: a substring match would route these to yt-dlp.
    expect(isTiktokUrl("https://nottiktok.com/@user/video/123")).toBe(false);
    expect(isTiktokUrl("https://www.youtube.com/watch?v=abc")).toBe(false);
    expect(isTiktokUrl("")).toBe(false);
  });

  it("routes tiktok video URLs to the ytdlp adapter instead of cobalt", () => {
    const result = selectStrategy(
      "https://www.tiktok.com/@marcus.dipaola/video/7696961966987824398",
    );
    expect(result.adapter).toBe("ytdlp");
    expect(result.canonicalUrl).toBe(
      "https://www.tiktok.com/@marcus.dipaola/video/7696961966987824398",
    );
    // The pre-#300 baseline: this URL fell through to cobalt and failed.
    expect(selectStrategy("https://www.tiktok.com/@user/video/1").adapter).not.toBe(
      ADAPTER_IDS.COBALT,
    );
  });

  it("keeps the cobalt fallback for other unknown platforms", () => {
    expect(selectStrategy("https://vimeo.com/123456789").adapter).toBe(ADAPTER_IDS.COBALT);
  });

  it("buildYtdlpCommand downloads tiktok full-length: no 8s section, no 20MB cap", () => {
    const cmd = buildYtdlpCommand("https://www.tiktok.com/@user/video/123", {
      tmpPath: "/tmp/v.mp4",
    });
    // Competitor/analysis videos are consumed whole.
    expect(cmd).not.toContain("--download-sections");
    expect(cmd).not.toContain("--max-filesize");
    expect(cmd).toContain("--no-playlist");
  });

  it("buildYtdlpCommand keeps tiktok cookieless (no firefox store dependency)", () => {
    // Verified 2026-10-16: the extractor solves the JS challenge without
    // cookies, while a missing firefox store fails before extraction.
    const cmd = buildYtdlpCommand("https://www.tiktok.com/@user/video/123", {
      tmpPath: "/tmp/v.mp4",
    });
    expect(cmd).not.toContain("--cookies-from-browser");
    expect(cmd).not.toContain("--cookies ");
  });

  it("buildYtdlpCommand still applies the B-roll budget to youtube/bilibili/weibo", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=abc",
      "https://www.bilibili.com/video/BV1E7wtzaEdq",
      "https://weibo.com/1/x",
    ]) {
      const cmd = buildYtdlpCommand(url, { tmpPath: "/tmp/v.mp4" });
      expect(cmd, url).toContain("--download-sections");
      expect(cmd, url).toContain("--max-filesize 20M");
      expect(cmd, url).toContain("--cookies-from-browser");
      expect(cmd, url).not.toContain("--no-playlist");
    }
  });

  it("buildYtdlpCommand caps the long side, not `height`, for 9:16 video", () => {
    const cmd = buildYtdlpCommand("https://www.tiktok.com/@user/video/123", {
      tmpPath: "/tmp/v.mp4",
    });
    // TikTok is mostly 9:16, so `height` is the LONG side: a `height<=1080`
    // filter excludes 1080x1920 (height=1920) and silently downloads 576x1024.
    // Measured 2026-10-16: `[height<=1080]` → 576x1024, `[height<=1920]` → 1080x1920.
    expect(cmd).toContain("b[height<=1920]");
    expect(cmd).not.toContain("b[height<=1080]");
  });

  it("buildYtdlpCommand still hands the resolved proxy to tiktok downloads", () => {
    const KEYS = ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"];
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    try {
      for (const k of KEYS) delete process.env[k];
      process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
      // The HK exit is blocked by TikTok; the proxy is what makes the JP exit
      // reachable, so it must survive the tiktok branch.
      expect(
        buildYtdlpCommand("https://www.tiktok.com/@user/video/123", { tmpPath: "/tmp/v.mp4" }),
      ).toContain('--proxy "http://127.0.0.1:7897"');
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  it("quotes the URL so a crafted href cannot break out of the shell string", () => {
    // droid-review P1: this command string reaches execSync's shell, and #300
    // made the URL scrapable page content. A bare `"${url}"` interpolation let a
    // href like `…/1"; touch /tmp/pwned; "` close the quote and run commands.
    const evil = 'https://www.tiktok.com/@x/video/1"; touch /tmp/pwned; "';
    const cmd = buildYtdlpCommand(evil, { tmpPath: "/tmp/v.mp4" });
    expect(cmd).not.toContain('1"; touch');
    expect(cmd).toContain('\\"');
    // The closing quote is escaped, so the payload stays inside one shell word.
    expect(cmd.match(/\\";/)).not.toBeNull();
  });

  it("still quotes the url and tmpPath for the non-tiktok platforms", () => {
    const cmd = buildYtdlpCommand("https://www.bilibili.com/video/BV1", { tmpPath: "/tmp/v.mp4" });
    expect(cmd).toContain('-o "/tmp/v.mp4" "https://www.bilibili.com/video/BV1"');
  });
});

// ─── #75 Batch 3: xhs via RedNote-MCP (fallback-position adapter) ───
describe("RedNote-MCP adapter (#75 Batch 3)", () => {
  it("routes xiaohongshu URLs to the xhs-downloader adapter (primary)", () => {
    const result = selectStrategy("https://www.xiaohongshu.com/explore/65a1b2c3");
    expect(result.adapter).toBe("xhs-downloader");
    const short = selectStrategy("https://xhslink.com/AbCdEf");
    expect(short.adapter).toBe("xhs-downloader");
  });

  it("preserves the xsec_token query when canonicalizing xhs URLs (#314)", () => {
    const result = selectStrategy(
      "https://www.xiaohongshu.com/explore/abc123?xsec_token=TOK&xsec_source=pc_search",
    );
    expect(result.adapter).toBe(ADAPTER_IDS.XHS_DOWNLOADER);
    expect(result.canonicalUrl).toContain("abc123");
    expect(result.canonicalUrl).toContain("xsec_token=TOK");
    expect(result.canonicalUrl).toContain("xsec_source=pc_search");

    const fragment = selectStrategy(
      "http://www.xiaohongshu.com/explore/abc123?xsec_token=TOK#comments",
    );
    expect(fragment.canonicalUrl.startsWith("https://")).toBe(true);
    expect(fragment.canonicalUrl).toContain("xsec_token=TOK");
    expect(fragment.canonicalUrl).not.toContain("#");
  });

  it("keeps the no-query xhs URL behavior unchanged (#314)", () => {
    const result = selectStrategy("https://www.xiaohongshu.com/explore/65a1b2c3");
    expect(result.adapter).toBe(ADAPTER_IDS.XHS_DOWNLOADER);
    expect(result.canonicalUrl).toBe("https://www.xiaohongshu.com/explore/65a1b2c3");
  });

  it("pulls the CDN mp4 via get_note_content and downloads with the xhs Referer", async () => {
    const mcpCalls = [];
    const downloadCalls = [];
    const fakeMcp = async (opts) => {
      mcpCalls.push(opts);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              title: "笔记",
              videos: ["https://sns-video.xhscdn.com/abc.mp4"],
              imgs: [],
            }),
          },
        ],
      };
    };
    const fakeDownload = async (url, opts = {}) => {
      downloadCalls.push({ url, headers: opts.headers });
      return {
        status: "downloaded",
        strategy: "direct-http",
        sourceUrl: url,
        finalUrl: url,
        mimeType: "video/mp4",
        extension: "mp4",
        byteLength: 5000,
        buffer: Buffer.alloc(5000),
      };
    };
    const { downloadRednoteMcp } = await import("../lib/video-downloaders.mjs");
    const r = await downloadRednoteMcp("https://www.xiaohongshu.com/explore/65a1b2c3", {
      mcpCaller: fakeMcp,
      downloader: fakeDownload,
    });
    expect(r.status).toBe("downloaded");
    expect(r.strategy).toBe("rednote-mcp");
    expect(mcpCalls[0].toolName).toBe("get_note_content");
    expect(mcpCalls[0].toolArgs.url).toBe("https://www.xiaohongshu.com/explore/65a1b2c3");
    expect(mcpCalls[0].timeoutMs).toBeGreaterThanOrEqual(90000);
    expect(downloadCalls[0].url).toBe("https://sns-video.xhscdn.com/abc.mp4");
    expect(downloadCalls[0].headers.Referer).toContain("xiaohongshu.com");
  });

  it("fails closed when the note has no video", async () => {
    const fakeMcp = async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: "纯图文",
            videos: [],
            imgs: ["x.jpg"],
          }),
        },
      ],
    });
    const { downloadRednoteMcp } = await import("../lib/video-downloaders.mjs");
    const r = await downloadRednoteMcp("https://www.xiaohongshu.com/explore/xyz", {
      mcpCaller: fakeMcp,
      downloader: async () => {
        throw new Error("should not download");
      },
    });
    expect(r.status).toBe("failed");
    expect(r.reason).toMatch(/no video/i);
  });

  it("fails closed when the MCP call errors or times out", async () => {
    const { downloadRednoteMcp } = await import("../lib/video-downloaders.mjs");
    const r = await downloadRednoteMcp("https://www.xiaohongshu.com/explore/xyz", {
      mcpCaller: async () => {
        throw new Error("MCP timeout");
      },
      downloader: async () => {
        throw new Error("should not download");
      },
    });
    expect(r.status).toBe("failed");
    expect(r.reason).toContain("MCP timeout");
    expect(r.retryable).toBe(true);
  });
});

// ─── #75 Batch 4: downloadXhsCdp — logged-session CDP adapter ───
describe("XhsCdp adapter (#75 Batch 4)", () => {
  it("opens the note URL in CDP, extracts the video src, downloads with Referer", async () => {
    const calls = { tab: [], extract: [], download: [] };
    const fake = {
      cdpNewTab: async (url) => {
        calls.tab.push(url);
        return "tid-1";
      },
      waitForPageLoad: async () => true,
      extractFromTab: async (tid, script) => {
        calls.extract.push({ tid, script });
        return [{ videoSrc: "https://sns-video.xhscdn.com/v.mp4", noteId: "abc123" }];
      },
      cdpCloseTab: async () => {},
      downloader: async (url, opts = {}) => {
        calls.download.push({ url, headers: opts.headers });
        return {
          status: "downloaded",
          strategy: "direct-http",
          sourceUrl: url,
          mimeType: "video/mp4",
          extension: "mp4",
          byteLength: 8000,
          buffer: Buffer.alloc(8000),
        };
      },
    };
    const { downloadXhsCdp } = await import("../lib/video-downloaders.mjs");
    const r = await downloadXhsCdp("https://www.xiaohongshu.com/explore/abc123?xsec_token=T", fake);
    expect(r.status).toBe("downloaded");
    expect(r.strategy).toBe("xhs-cdp");
    // feed prewarm first, then same-tab navigation to the tokened note URL
    expect(calls.tab[0]).toContain("channel_id=homefeed_recommend");
    expect(calls.extract[0].script).toContain("xsec_token=T");
    expect(calls.extract[0].script).toContain("location.assign");
    expect(calls.download[0].url).toBe("https://sns-video.xhscdn.com/v.mp4");
    expect(calls.download[0].headers.Referer).toContain("xiaohongshu.com");
  });

  it("reports login-wall when the page renders without a video element", async () => {
    const fake = {
      cdpNewTab: async () => "tid-2",
      waitForPageLoad: async () => true,
      extractFromTab: async () => [{ videoSrc: null, loginWall: true }],
      cdpCloseTab: async () => {},
      downloader: async () => {
        throw new Error("should not download");
      },
    };
    const { downloadXhsCdp } = await import("../lib/video-downloaders.mjs");
    const r = await downloadXhsCdp("https://www.xiaohongshu.com/explore/abc", fake);
    expect(r.status).toBe("failed");
    expect(r.reason).toMatch(/login|no video/i);
  });

  it("cleans up the tab on extraction failure", async () => {
    let closed = 0;
    const fake = {
      cdpNewTab: async () => "tid-3",
      waitForPageLoad: async () => true,
      extractFromTab: async () => {
        throw new Error("extract exploded");
      },
      cdpCloseTab: async () => {
        closed += 1;
      },
      downloader: async () => {
        throw new Error("should not download");
      },
    };
    const { downloadXhsCdp } = await import("../lib/video-downloaders.mjs");
    const r = await downloadXhsCdp("https://www.xiaohongshu.com/explore/abc", fake);
    expect(r.status).toBe("failed");
    expect(closed).toBe(1);
  });
});

// ─── #75 Batch 5: XHS-Downloader as the primary xhs backend ───
describe("XHS-Downloader adapter (#75 Batch 5)", () => {
  const fakeRun =
    (writesFile = true) =>
    (cmd) => {
      if (writesFile) {
        mkdirSync("/tmp/xhs-dl-fake/Download", { recursive: true });
        writeFileSync("/tmp/xhs-dl-fake/Download/note.mp4", Buffer.alloc(6000));
      }
      return "下载成功";
    };

  it("routes xhs URLs to the xhs-downloader adapter (primary)", () => {
    expect(selectStrategy("https://www.xiaohongshu.com/explore/xyz?xsec_token=T").adapter).toBe(
      "xhs-downloader",
    );
  });

  it("spawns the CLI with url/cookie/work_path and returns the downloaded mp4", async () => {
    const { downloadXhsDownloader } = await import("../lib/video-downloaders.mjs");
    const calls = [];
    const r = await downloadXhsDownloader("https://www.xiaohongshu.com/explore/xyz?xsec_token=T", {
      cookie: "web_session=s; a1=a",
      pythonPath: "/fake/python",
      scriptDir: "/fake/XHS-Downloader",
      workPath: "/tmp/xhs-dl-fake",
      runner: (cmd) => {
        calls.push(cmd);
        return fakeRun()("/fake/python");
      },
    });
    expect(r.status).toBe("downloaded");
    expect(r.strategy).toBe("xhs-downloader");
    expect(r.byteLength).toBe(6000);
    expect(calls[0]).toContain("--url");
    expect(calls[0].some((a) => String(a).includes("xsec_token=T"))).toBe(true);
    expect(calls[0].some((a) => String(a).includes("web_session=s; a1=a"))).toBe(true);
    expect(calls[0]).toContain("/fake/python");
  });

  it("fails closed when the CLI produces no video file", async () => {
    const { downloadXhsDownloader } = await import("../lib/video-downloaders.mjs");
    const r = await downloadXhsDownloader("https://www.xiaohongshu.com/explore/xyz?xsec_token=T", {
      cookie: "web_session=s",
      workPath: "/tmp/xhs-dl-empty",
      runner: () => "跳过 0 个，失败 1 个",
    });
    expect(r.status).toBe("failed");
    expect(r.reason).toMatch(/no video file|failed/i);
  });

  it("fails closed with a config hint when XHS_COOKIE is absent", async () => {
    const prev = process.env.XHS_COOKIE;
    delete process.env.XHS_COOKIE;
    try {
      const { downloadXhsDownloader } = await import("../lib/video-downloaders.mjs");
      const r = await downloadXhsDownloader("https://www.xiaohongshu.com/explore/xyz", {
        cookie: null, // force absence — the repo .env.local now carries a real XHS_COOKIE
        runner: () => {
          throw new Error("should not run");
        },
      });
      expect(r.status).toBe("failed");
      expect(r.reason).toMatch(/XHS_COOKIE/);
      expect(r.retryable).toBe(false);
    } finally {
      if (prev !== undefined) process.env.XHS_COOKIE = prev;
    }
  });

  it("downloadVideo falls back to the xhs-cdp adapter when XHS-Downloader fails", async () => {
    const { downloadVideo } = await import("../lib/video-downloaders.mjs");
    let cdpTried = false;
    const result = await downloadVideo(
      "https://www.xiaohongshu.com/explore/fallback?xsec_token=T",
      {
        xhsDownloaderRunner: () => "失败",
        xhsDownloaderWorkPath: "/tmp/xhs-dl-empty2",
        xhsCdpAdapter: async () => {
          cdpTried = true;
          return {
            status: "failed",
            strategy: "xhs-cdp",
            sourceUrl: "x",
            reason: "wall",
          };
        },
        skipXhsCookieRequirement: true,
      },
    );
    expect(cdpTried).toBe(true);
    expect(result.strategy).toBe("xhs-cdp");
  });
});

// ─── #636: URL shape vs downloader coverage ───

describe("#636 — non-fetchable URL shapes never reach an adapter", () => {
  it("selectStrategy skips a data: URI instead of routing it to cobalt", () => {
    // Live evidence (2026-10-15): Bing news cards lazy-load to base64 `data:`
    // placeholders, and each one was POSTed to Cobalt as a "url" (the
    // canonical form keeps the whole base64 body). No adapter can fetch it.
    const result = selectStrategy("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ");
    expect(result.adapter).toBe("none");
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("non-http-url");
  });

  it("downloadVideo short-circuits before any cobalt traffic", async () => {
    const cobalt = new CobaltAdapter();
    const downloadSpy = vi.spyOn(cobalt, "download");
    const fetchFn = makeMockFetch({}); // any fetch call throws
    const result = await downloadVideo("data:image/png;base64,iVBORw0KGgo=", {
      fetchFn,
      cobaltAdapter: cobalt,
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("non-http-url");
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(fetchFn.calls).toEqual([]);
  });

  it("still routes protocol-relative URLs (canonicalized to https) to cobalt", () => {
    const result = selectStrategy("//th.bing.com/th?id=OVFT");
    expect(result.adapter).toBe(ADAPTER_IDS.COBALT);
    expect(result.canonicalUrl).toBe("https://th.bing.com/th");
  });

  it("skips every other non-http(s) scheme, not just data:", () => {
    // #636 boundary sweep: before the guard these fell through to cobalt
    // (which cannot fetch them either); the reason now says so up front.
    for (const url of [
      "javascript:void(0)",
      "blob:https://www.bing.com/9f0d1a2b-0000-4000-8000-000000000000",
      "file:///Users/someone/thumb.jpg",
      "ftp://example.com/thumb.jpg",
    ]) {
      const result = selectStrategy(url);
      expect(result.adapter, url).toBe("none");
      expect(result.status, url).toBe("skipped");
      expect(result.reason, url).toBe("non-http-url");
    }
  });

  it("skips a relative path (no base URL to resolve against)", () => {
    const result = selectStrategy("/assets/thumb.jpg");
    expect(result.adapter).toBe("none");
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("non-http-url");
  });
});

describe("#636 — cobalt link errors name the site", () => {
  it("classifyError reports the host instead of a bare invalid-url", () => {
    const cobalt = new CobaltAdapter();
    const { reason, retryable } = cobalt.classifyError(
      "error.api.link.invalid",
      "https://th.bing.com/th",
    );
    expect(reason).toBe("unsupported-by-downloader:th.bing.com");
    expect(retryable).toBe(false);
  });

  it("classifyError falls back to the bare reason when no host can be read", () => {
    const cobalt = new CobaltAdapter();
    expect(cobalt.classifyError("error.api.link.invalid", "not-a-url").reason).toBe(
      "unsupported-by-downloader",
    );
    expect(cobalt.classifyError("error.api.link.invalid").reason).toBe("unsupported-by-downloader");
  });

  it("classifyError keeps the other code families unchanged", () => {
    const cobalt = new CobaltAdapter();
    expect(cobalt.classifyError("error.api.rate_exceeded").reason).toBe("rate-limited");
    expect(cobalt.classifyError("error.api.auth.missing").reason).toBe("requires-auth");
    expect(cobalt.classifyError("error.api.fetch.empty").reason).toBe("fetch-error");
    expect(cobalt.classifyError("error.api.content.video.unavailable").reason).toBe(
      "content-unavailable",
    );
  });

  it("download() surfaces the host through the full adapter path", async () => {
    const fetchFn = makeMockFetch({
      "http://localhost:9000/": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            cobalt: { version: "10.0.0", services: ["youtube"] },
            git: {},
          }),
        ),
      }),
      "http://localhost:9000": mockResponse({
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({ status: "error", error: { code: "error.api.link.invalid" } }),
        ),
      }),
    });
    const cobalt = new CobaltAdapter();
    await cobalt.preflight(fetchFn);
    const result = await cobalt.download("https://th.bing.com/th", { fetchFn });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("unsupported-by-downloader:th.bing.com");
  });
});
