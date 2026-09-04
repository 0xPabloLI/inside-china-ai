import { describe, it, expect, vi } from "vitest";
import { canonicalizeUrl } from "../lib/url-normalizer.mjs";
import {
  selectStrategy,
  ADAPTER_IDS,
  downloadDirectHttp,
  downloadDouyinCdp,
  extractDouyinVideoId,
  downloadVideo,
  CobaltAdapter,
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
      get: (key) => (key.toLowerCase() === "content-type" ? contentType : null),
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

// ─── #182: iesdouyin CDP download adapter ───

describe("douyin-cdp adapter (#182)", () => {
  const VIDEO_ID = "7680095489249536842";
  const MEDIA_URL = "https://www.douyin.com/aweme/v1/play/?video_id=abc123";

  /** Injectable cdp-client fakes following the cdpNewTab → waitForPageLoad → extractFromTab → cdpCloseTab flow. */
  function makeCdpFakes({ currentSrc = MEDIA_URL, newTabError = null, extractError = null } = {}) {
    const calls = { shareUrls: [], extractScripts: [], closedTabs: [] };
    return {
      calls,
      cdpNewTabFn: async (url) => {
        if (newTabError) throw newTabError;
        calls.shareUrls.push(url);
        return "tab-1";
      },
      waitForPageLoadFn: async () => true,
      extractFn: async (tabId, script) => {
        if (extractError) throw extractError;
        calls.extractScripts.push(script);
        return currentSrc;
      },
      cdpCloseTabFn: async (tabId) => {
        calls.closedTabs.push(tabId);
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
    it("opens the iesdouyin share page, downloads media with douyin Referer, closes the tab", async () => {
      const fakes = makeCdpFakes();
      const fetchFn = makeMockFetch({
        [MEDIA_URL]: mockResponse({ body: validBuffer }),
      });

      const result = await downloadDouyinCdp(`https://www.douyin.com/video/${VIDEO_ID}`, {
        ...fakes,
        fetchFn,
      });

      expect(fakes.calls.shareUrls).toEqual([
        `https://www.iesdouyin.com/share/video/${VIDEO_ID}`,
      ]);
      expect(fetchFn.calls).toHaveLength(1);
      expect(fetchFn.calls[0].opts.headers.Referer).toBe("https://www.douyin.com/");
      expect(result.status).toBe("downloaded");
      expect(result.strategy).toBe(ADAPTER_IDS.DOUYIN_CDP);
      expect(result.source).toBe("douyin");
      expect(result.sourceUrl).toBe(`https://www.douyin.com/video/${VIDEO_ID}`);
      expect(result.finalUrl).toBe(MEDIA_URL);
      expect(result.byteLength).toBe(validBuffer.length);
      expect(result.buffer).toEqual(validBuffer);
      expect(fakes.calls.closedTabs).toEqual(["tab-1"]);
    });

    it("fails retryable when the video element has no currentSrc, still closing the tab", async () => {
      const fakes = makeCdpFakes({ currentSrc: "" });
      const fetchFn = makeMockFetch({});

      const result = await downloadDouyinCdp(`https://www.douyin.com/video/${VIDEO_ID}`, {
        ...fakes,
        fetchFn,
      });

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("no-current-src");
      expect(result.retryable).toBe(true);
      expect(fakes.calls.closedTabs).toEqual(["tab-1"]);
    });

    it("treats extractFromTab's array contract as possibly empty or blank (real-data #182)", async () => {
      // extractFromTab swallows non-array string returns to [] — the adapter
      // must handle [] and whitespace-only entries as no-current-src.
      for (const extracted of [[], ["   "], [""]]) {
        const fakes = makeCdpFakes();
        const result = await downloadDouyinCdp(`https://www.douyin.com/video/${VIDEO_ID}`, {
          ...fakes,
          extractFn: async () => extracted,
          fetchFn: makeMockFetch({}),
        });
        expect(result.status).toBe("failed");
        expect(result.reason).toBe("no-current-src");
        expect(fakes.calls.closedTabs).toEqual(["tab-1"]);
      }
    });

    it("fails retryable as cdp-unavailable when the tab cannot be opened", async () => {
      const fakes = makeCdpFakes({ newTabError: new Error("proxy dead") });
      const fetchFn = makeMockFetch({});

      const result = await downloadDouyinCdp(`https://www.douyin.com/video/${VIDEO_ID}`, {
        ...fakes,
        fetchFn,
      });

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("cdp-unavailable");
      expect(result.retryable).toBe(true);
      expect(fakes.calls.closedTabs).toEqual([]);
    });

    it("closes the tab when extraction throws", async () => {
      const fakes = makeCdpFakes({ extractError: new Error("eval failed") });
      const fetchFn = makeMockFetch({});

      const result = await downloadDouyinCdp(`https://www.douyin.com/video/${VIDEO_ID}`, {
        ...fakes,
        fetchFn,
      });

      expect(result.status).toBe("failed");
      expect(fakes.calls.closedTabs).toEqual(["tab-1"]);
    });

    it("returns unsupported for douyin URLs without a video id", async () => {
      const fakes = makeCdpFakes();
      const result = await downloadDouyinCdp("https://www.douyin.com/user/xyz", {
        ...fakes,
        fetchFn: makeMockFetch({}),
      });
      expect(result.status).toBe("unsupported");
      expect(result.reason).toBe("no-video-id");
      expect(fakes.calls.shareUrls).toEqual([]);
    });
  });

  describe("downloadVideo wiring", () => {
    it("routes douyin URLs through douyin-cdp without touching Cobalt", async () => {
      const fakes = makeCdpFakes();
      const fetchFn = makeMockFetch({
        [MEDIA_URL]: mockResponse({ body: validBuffer }),
      });
      const cobalt = new CobaltAdapter();
      const preflightSpy = vi.spyOn(cobalt, "preflight");

      const result = await downloadVideo(`https://www.douyin.com/video/${VIDEO_ID}`, {
        ...fakes,
        fetchFn,
        cobaltAdapter: cobalt,
      });

      expect(preflightSpy).not.toHaveBeenCalled();
      expect(result.status).toBe("downloaded");
      expect(result.strategy).toBe(ADAPTER_IDS.DOUYIN_CDP);
      expect(fakes.calls.closedTabs).toEqual(["tab-1"]);
    });
  });
});
