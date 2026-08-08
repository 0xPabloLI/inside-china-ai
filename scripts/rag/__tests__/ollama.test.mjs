import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  embed,
  isOllamaAvailable,
  verifyModelDimensions,
  OLLAMA_URL,
  DEFAULT_MODEL,
  EXPECTED_DIMS,
} from "../lib/ollama.mjs";

// ─── Helpers ───

function mockFetchSuccess(body) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function mockFetchReject(err) {
  return vi.fn().mockRejectedValue(err);
}

function makeEmbedding(dims = 1024, val = 0.1) {
  return Array(dims).fill(val);
}

// ─── isOllamaAvailable ───

describe("isOllamaAvailable", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns true when Ollama responds with model list", async () => {
    global.fetch = mockFetchSuccess({
      models: [{ name: "bge-m3:latest" }, { name: "qwen3:latest" }],
    });
    expect(await isOllamaAvailable()).toBe(true);
  });

  it("returns false when Ollama is not running (connection refused)", async () => {
    global.fetch = mockFetchReject(new Error("ECONNREFUSED"));
    expect(await isOllamaAvailable()).toBe(false);
  });

  it("returns false when Ollama returns non-200", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal" }),
    });
    expect(await isOllamaAvailable()).toBe(false);
  });
});

// ─── verifyModelDimensions ───

describe("verifyModelDimensions", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("passes when model returns correct dimensions (1024)", async () => {
    global.fetch = mockFetchSuccess({
      model: "bge-m3",
      embeddings: [makeEmbedding(1024)],
    });

    // Should not throw
    await expect(verifyModelDimensions("bge-m3", 1024)).resolves.toBeUndefined();
  });

  it("throws when model returns wrong dimensions (Scenario #13)", async () => {
    global.fetch = mockFetchSuccess({
      model: "wrong-model",
      embeddings: [makeEmbedding(768)], // 768 instead of 1024
    });

    await expect(verifyModelDimensions("wrong-model", 1024)).rejects.toThrow(/dimension/i);
  });

  it("throws when Ollama returns no embeddings", async () => {
    global.fetch = mockFetchSuccess({ model: "bge-m3", embeddings: [] });
    await expect(verifyModelDimensions("bge-m3", 1024)).rejects.toThrow(/embedding/i);
  });
});

// ─── embed ───

describe("embed", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns 1024-dim vector for single text", async () => {
    const expectedVector = makeEmbedding(1024, 0.5);
    global.fetch = mockFetchSuccess({
      model: "bge-m3",
      embeddings: [expectedVector],
    });

    const result = await embed(["hello world"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1024);
    expect(result[0]).toEqual(expectedVector);
  });

  it("returns array of vectors for batch input", async () => {
    const vectors = [makeEmbedding(1024, 0.1), makeEmbedding(1024, 0.2), makeEmbedding(1024, 0.3)];
    global.fetch = mockFetchSuccess({
      model: "bge-m3",
      embeddings: vectors,
    });

    const result = await embed(["text1", "text2", "text3"]);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(1024);
    expect(result[1]).toHaveLength(1024);
    expect(result[2]).toHaveLength(1024);
  });

  it("sends correct request body to Ollama API", async () => {
    const mockFetch = mockFetchSuccess({
      model: "bge-m3",
      embeddings: [makeEmbedding(1024)],
    });
    global.fetch = mockFetch;

    await embed(["test text"], "bge-m3");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${OLLAMA_URL}/api/embed`);
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("bge-m3");
    expect(body.input).toEqual(["test text"]);
  });

  it("uses default model when not specified", async () => {
    const mockFetch = mockFetchSuccess({
      model: DEFAULT_MODEL,
      embeddings: [makeEmbedding(1024)],
    });
    global.fetch = mockFetch;

    await embed(["text"]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe(DEFAULT_MODEL);
  });

  it("throws clear error on connection refused", async () => {
    global.fetch = mockFetchReject(new Error("ECONNREFUSED"));
    await expect(embed(["text"])).rejects.toThrow(/ollama|econnrefused/i);
  });

  it("throws clear error on invalid model (404)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "model not found" }),
    });
    await expect(embed(["text"], "nonexistent-model")).rejects.toThrow(/model|not found|error/i);
  });

  it("throws when response has no embeddings field", async () => {
    global.fetch = mockFetchSuccess({ model: "bge-m3" });
    await expect(embed(["text"])).rejects.toThrow(/embedding/i);
  });

  it("throws when embedding count doesn't match input count", async () => {
    global.fetch = mockFetchSuccess({
      model: "bge-m3",
      embeddings: [makeEmbedding(1024), makeEmbedding(1024)], // 2 for 3 inputs
    });
    await expect(embed(["a", "b", "c"])).rejects.toThrow(/count|match/i);
  });

  it("handles empty input array", async () => {
    const result = await embed([]);
    expect(result).toEqual([]);
  });
});
