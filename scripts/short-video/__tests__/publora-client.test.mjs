import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock fs modules ───

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFileSync, existsSync } from "fs";
import { readFile } from "fs/promises";

import {
  getApiKey,
  publoraPost,
  publoraPut,
  uploadToS3,
  getPlatformId,
} from "../lib/publora-client.mjs";

// ─── Helpers ───

function mockFetchResponse(ok, data, statusText = "") {
  return {
    ok,
    status: ok ? 200 : 400,
    statusText,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(typeof data === "string" ? data : JSON.stringify(data)),
  };
}

// ─── getApiKey ───

describe("getApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PUBLORA_API_KEY;
  });

  afterEach(() => {
    delete process.env.PUBLORA_API_KEY;
  });

  // Scenario 1: PUBLORA_API_KEY env set → returns it
  it("S1: returns env var when PUBLORA_API_KEY is set", async () => {
    process.env.PUBLORA_API_KEY = "sk_test_123";
    const key = await getApiKey();
    expect(key).toBe("sk_test_123");
    expect(existsSync).not.toHaveBeenCalled();
  });

  // Scenario 2: No env var, MCP settings exist → falls back to MCP config
  it("S2: falls back to MCP config when no env var", async () => {
    const home = process.env.HOME;
    existsSync.mockReturnValue(true);
    readFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          publora: {
            headers: { Authorization: "Bearer sk_mcp_456" },
          },
        },
      }),
    );

    const key = await getApiKey();
    expect(key).toBe("sk_mcp_456");
  });

  // Scenario 2b: First MCP path missing, second exists
  it("S2b: tries second MCP path when first doesn't exist", async () => {
    existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
    readFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          publora: {
            headers: { Authorization: "Bearer sk_second_789" },
          },
        },
      }),
    );

    const key = await getApiKey();
    expect(key).toBe("sk_second_789");
  });

  // Scenario 2c: MCP config exists but no publora key
  it("S2c: throws when MCP config has no publora Authorization", async () => {
    existsSync.mockReturnValue(true);
    readFile.mockResolvedValue(JSON.stringify({ mcpServers: {} }));

    await expect(getApiKey()).rejects.toThrow(/PUBLORA_API_KEY not found/);
  });

  // Scenario 3: No env var, no MCP settings → throws with error message
  it("S3: throws with helpful error when no key found anywhere", async () => {
    existsSync.mockReturnValue(false);

    await expect(getApiKey()).rejects.toThrow(/PUBLORA_API_KEY not found/);
    await expect(getApiKey()).rejects.toThrow(/export PUBLORA_API_KEY/);
    await expect(getApiKey()).rejects.toThrow(/Publora MCP/);
  });
});

// ─── publoraPost ───

describe("publoraPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("S4: returns parsed JSON on success", async () => {
    const mockData = { postGroupId: "pg_123" };
    global.fetch.mockResolvedValue(mockFetchResponse(true, mockData));

    const result = await publoraPost("/create-post", { content: "test" }, "sk_key");
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.publora.com/api/v1/create-post",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-publora-key": "sk_key",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("S4b: throws with HTTP status and body on failure", async () => {
    const errorBody = { error: "Invalid request" };
    global.fetch.mockResolvedValue(mockFetchResponse(false, errorBody));

    await expect(publoraPost("/create-post", {}, "sk_key")).rejects.toThrow(/HTTP 400/);
    await expect(publoraPost("/create-post", {}, "sk_key")).rejects.toThrow(/Invalid request/);
  });

  it("S4c: resolves apiKey from getApiKey when not passed", async () => {
    process.env.PUBLORA_API_KEY = "sk_auto";
    const mockData = { ok: true };
    global.fetch.mockResolvedValue(mockFetchResponse(true, mockData));

    await publoraPost("/test", { foo: "bar" });
    const call = global.fetch.mock.calls[0];
    expect(call[1].headers["x-publora-key"]).toBe("sk_auto");

    delete process.env.PUBLORA_API_KEY;
  });
});

// ─── publoraPut ───

describe("publoraPut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on success", async () => {
    const mockData = { success: true };
    global.fetch.mockResolvedValue(mockFetchResponse(true, mockData));

    const result = await publoraPut("/update-post/pg_123", { status: "scheduled" }, "sk_key");
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.publora.com/api/v1/update-post/pg_123",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "x-publora-key": "sk_key",
        }),
      }),
    );
  });

  it("throws with HTTP status and body on failure", async () => {
    const errorBody = { error: "Not found" };
    global.fetch.mockResolvedValue(mockFetchResponse(false, errorBody));

    await expect(publoraPut("/update-post/x", {}, "sk_key")).rejects.toThrow(/HTTP 400/);
    await expect(publoraPut("/update-post/x", {}, "sk_key")).rejects.toThrow(/Not found/);
  });
});

// ─── uploadToS3 ───

describe("uploadToS3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Scenario 5: uploadToS3 gets 200 → upload succeeds
  it("S5: uploads file successfully on 200", async () => {
    readFileSync.mockReturnValue(Buffer.from("fake-video-data"));
    global.fetch.mockResolvedValue({ ok: true, status: 200 });

    await uploadToS3("https://s3.example.com/upload", "/path/to/video.mp4", "video/mp4");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://s3.example.com/upload",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: expect.any(Buffer),
      }),
    );
  });

  it("S5b: throws with status and response text on failure", async () => {
    readFileSync.mockReturnValue(Buffer.from("fake-video-data"));
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue("Access Denied"),
    });

    await expect(
      uploadToS3("https://s3.example.com/upload", "/path/to/video.mp4", "video/mp4"),
    ).rejects.toThrow(/S3 upload failed: HTTP 403/);
    await expect(
      uploadToS3("https://s3.example.com/upload", "/path/to/video.mp4", "video/mp4"),
    ).rejects.toThrow(/Access Denied/);
  });
});

// ─── getPlatformId ───

describe("getPlatformId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Scenario 6: getPlatformId("tiktok-") returns first TikTok connection ID
  it("S6: returns first TikTok connection platformId", async () => {
    const connections = {
      connections: [
        { platformId: "youtube-abc", tokenStatus: "valid" },
        { platformId: "tiktok-xyz123", tokenStatus: "valid" },
        { platformId: "tiktok-def456", tokenStatus: "valid" },
      ],
    };
    global.fetch.mockResolvedValue(mockFetchResponse(true, connections));

    const id = await getPlatformId("tiktok-", "sk_key");
    expect(id).toBe("tiktok-xyz123");
  });

  it("S6b: throws when no matching platform connection found", async () => {
    const connections = {
      connections: [{ platformId: "youtube-abc", tokenStatus: "valid" }],
    };
    global.fetch.mockResolvedValue(mockFetchResponse(true, connections));

    await expect(getPlatformId("tiktok-", "sk_key")).rejects.toThrow(/No tiktok- connection found/);
  });

  it("S6c: warns when token status is not valid", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const connections = {
      connections: [{ platformId: "tiktok-xyz", tokenStatus: "expired" }],
    };
    global.fetch.mockResolvedValue(mockFetchResponse(true, connections));

    const id = await getPlatformId("tiktok-", "sk_key");
    expect(id).toBe("tiktok-xyz");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("expired"));
    warnSpy.mockRestore();
  });

  it("S6d: works for youtube- prefix", async () => {
    const connections = {
      connections: [
        { platformId: "tiktok-xyz", tokenStatus: "valid" },
        { platformId: "youtube-abc", tokenStatus: "valid" },
      ],
    };
    global.fetch.mockResolvedValue(mockFetchResponse(true, connections));

    const id = await getPlatformId("youtube-", "sk_key");
    expect(id).toBe("youtube-abc");
  });
});
