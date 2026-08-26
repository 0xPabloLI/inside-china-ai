import { describe, it, expect, vi } from "vitest";
import {
  upsertChunks,
  cleanupOrphans,
  queryContent,
  UPSERT_BATCH_SIZE,
  computeChunkHash,
  fetchExistingHashes,
} from "../lib/supabase-client.mjs";

// ─── Mock Supabase client factory ───

/**
 * Create a mock Supabase client that mimics @supabase/supabase-js API:
 * - client.from(table) → query builder (upsert, delete, select)
 * - client.rpc(fn, params) → Promise<{data, error}>
 * - delete() returns a chainable builder (eq, gt, not, in, filter) that is thenable
 */
function createMockClient(overrides = {}) {
  const calls = { upserts: [], deletes: [], rpcs: [], filters: [], selects: [] };

  // Delete builder: eq/gt/not/in/filter return this; thenable for await
  const deleteBuilder = {
    eq: vi.fn(function () {
      calls.filters.push(Array.from(arguments));
      return this;
    }),
    gt: vi.fn(function () {
      calls.filters.push(Array.from(arguments));
      return this;
    }),
    filter: vi.fn(function () {
      calls.filters.push(Array.from(arguments));
      return this;
    }),
    not: vi.fn(function () {
      calls.filters.push(Array.from(arguments));
      return this;
    }),
    in: vi.fn(function () {
      return this;
    }),
    then: vi.fn((resolve) => resolve(overrides.deleteResult || { error: null, data: null })),
  };

  // From builder: upsert returns Promise, delete returns chainable builder
  const fromBuilder = {
    upsert: vi.fn((...args) => {
      calls.upserts.push(args);
      return Promise.resolve(overrides.upsertResult || { error: null, data: null });
    }),
    delete: vi.fn((...args) => {
      calls.deletes.push(args);
      return deleteBuilder;
    }),
  };

  const client = {
    from: vi.fn().mockReturnValue(fromBuilder),
    rpc: vi.fn((...args) => {
      calls.rpcs.push(args);
      return Promise.resolve({
        error: null,
        data: overrides.rpcData || [],
      });
    }),
    _calls: calls,
    _fromBuilder: fromBuilder,
    _deleteBuilder: deleteBuilder,
  };

  return client;
}

// ─── upsertChunks ───

describe("upsertChunks", () => {
  it("calls upsert with correct table and onConflict", async () => {
    const client = createMockClient();
    const chunks = [
      {
        content_type: "article",
        source_id: "test-article",
        chunk_index: 0,
        chunk_text: "hello world",
        chunk_title: "Section 1",
        metadata: { topics: ["test"] },
        embedding: [0.1, 0.2],
      },
    ];

    await upsertChunks(client, chunks);

    expect(client._fromBuilder.upsert).toHaveBeenCalledTimes(1);
    const [rows, opts] = client._calls.upserts[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].content_type).toBe("article");
    expect(rows[0].source_id).toBe("test-article");
    expect(opts.onConflict).toContain("content_type");
    expect(opts.onConflict).toContain("source_id");
    expect(opts.onConflict).toContain("chunk_index");
  });

  it("batches chunks larger than UPSERT_BATCH_SIZE", async () => {
    const client = createMockClient();
    const chunks = Array.from({ length: 250 }, (_, i) => ({
      content_type: "article",
      source_id: "test",
      chunk_index: i,
      chunk_text: `chunk ${i}`,
      chunk_title: `Section ${i}`,
      metadata: {},
      embedding: [0.1],
    }));

    await upsertChunks(client, chunks);

    expect(client._fromBuilder.upsert).toHaveBeenCalledTimes(3);
    expect(client._calls.upserts[0][0]).toHaveLength(100);
    expect(client._calls.upserts[1][0]).toHaveLength(100);
    expect(client._calls.upserts[2][0]).toHaveLength(50);
  });

  it("throws on upsert error", async () => {
    const client = createMockClient();
    client._fromBuilder.upsert.mockResolvedValueOnce({
      error: { message: "RLS violation" },
      data: null,
    });

    await expect(
      upsertChunks(client, [
        {
          content_type: "article",
          source_id: "x",
          chunk_index: 0,
          chunk_text: "t",
          metadata: {},
          embedding: [],
        },
      ]),
    ).rejects.toThrow(/rls|upsert/i);
  });

  it("handles empty chunks array", async () => {
    const client = createMockClient();
    await upsertChunks(client, []);
    expect(client._fromBuilder.upsert).not.toHaveBeenCalled();
  });

  it("is idempotent — running twice produces same calls (Scenario #14)", async () => {
    const client = createMockClient();
    const chunks = [
      {
        content_type: "article",
        source_id: "a",
        chunk_index: 0,
        chunk_text: "t",
        metadata: {},
        embedding: [0.1],
      },
      {
        content_type: "article",
        source_id: "a",
        chunk_index: 1,
        chunk_text: "t2",
        metadata: {},
        embedding: [0.2],
      },
    ];

    await upsertChunks(client, chunks);
    await upsertChunks(client, chunks);

    // Both calls should have the same number of upserts
    expect(client._calls.upserts).toHaveLength(2);
    expect(client._calls.upserts[0][0]).toEqual(client._calls.upserts[1][0]);
  });
});

// ─── cleanupOrphans ───

describe("cleanupOrphans", () => {
  it("deletes removed files by (content_type, source_id) identity (Scenario #8)", async () => {
    const client = createMockClient();
    const identities = [
      { content_type: "article", source_id: "article-1", maxChunkIndex: 2 },
      { content_type: "article", source_id: "article-2", maxChunkIndex: 1 },
      { content_type: "research", source_id: "docs/research/cloud-gpu", maxChunkIndex: 3 },
    ];
    await cleanupOrphans(client, identities);

    // Should have called delete (at least once for removed-files step)
    expect(client._fromBuilder.delete).toHaveBeenCalled();
  });

  it("deletes stale trailing chunks after file shrinks (Scenario #9)", async () => {
    const client = createMockClient();
    // Current identity says maxChunkIndex=1, but DB has chunk_index 0,1,2
    // Chunk 2 should be deleted
    const identities = [
      { content_type: "research", source_id: "docs/research/report", maxChunkIndex: 1 },
    ];
    await cleanupOrphans(client, identities);

    expect(client._fromBuilder.delete).toHaveBeenCalled();
    // Should have filters for stale chunk deletion
    expect(client._calls.filters.length).toBeGreaterThan(0);
  });

  it("does not delete rows from a different content_type with same source_id (Scenario #10)", async () => {
    const client = createMockClient();
    // research has source_id "cloud-gpu-options", source-material also has "cloud-gpu-options"
    // Only research identity is in the current set
    const identities = [
      { content_type: "research", source_id: "cloud-gpu-options", maxChunkIndex: 2 },
    ];
    await cleanupOrphans(client, identities);

    // The delete filters should include content_type constraint
    // so that source-material rows with same source_id are NOT deleted
    const allFilterArgs = client._calls.filters.flat();
    // Check that content_type appears in at least one filter call
    expect(allFilterArgs).toContain("content_type");
  });

  it("deletes all when identities is empty (Scenario #11)", async () => {
    const client = createMockClient();
    await cleanupOrphans(client, []);

    expect(client._fromBuilder.delete).toHaveBeenCalled();
  });

  it("throws on delete error", async () => {
    const client = createMockClient({
      deleteResult: { error: { message: "Permission denied" }, data: null },
    });

    await expect(
      cleanupOrphans(client, [{ content_type: "article", source_id: "a", maxChunkIndex: 0 }]),
    ).rejects.toThrow(/delete|permission/i);
  });

  it("handles multiple content types in one call", async () => {
    const client = createMockClient();
    const identities = [
      { content_type: "article", source_id: "a", maxChunkIndex: 1 },
      { content_type: "research", source_id: "b", maxChunkIndex: 2 },
      { content_type: "scene-data", source_id: "c", maxChunkIndex: 0 },
    ];
    await cleanupOrphans(client, identities);

    expect(client._fromBuilder.delete).toHaveBeenCalled();
  });
});

// ─── computeChunkHash ───

describe("computeChunkHash", () => {
  it("returns a hex string for text input", () => {
    const hash = computeChunkHash("hello world");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces same hash for same text", () => {
    const a = computeChunkHash("test content");
    const b = computeChunkHash("test content");
    expect(a).toBe(b);
  });

  it("produces different hash for different text", () => {
    const a = computeChunkHash("version 1");
    const b = computeChunkHash("version 2");
    expect(a).not.toBe(b);
  });

  it("handles empty string", () => {
    const hash = computeChunkHash("");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces known SHA-256 value for deterministic input", () => {
    // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(computeChunkHash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

// ─── fetchExistingHashes ───

describe("fetchExistingHashes", () => {
  it("returns Map with keys for existing chunks", async () => {
    const client = createMockClient({
      rpcData: [],
    });
    // Override from().select().in() to return hash data
    const selectBuilder = {
      in: vi.fn(() =>
        Promise.resolve({
          error: null,
          data: [
            { content_type: "article", source_id: "slug-1", chunk_index: 0, chunk_hash: "hash-a" },
            { content_type: "article", source_id: "slug-1", chunk_index: 1, chunk_hash: "hash-b" },
          ],
        }),
      ),
    };
    client._fromBuilder.select = vi.fn(() => selectBuilder);

    const result = await fetchExistingHashes(client, ["slug-1"]);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(2);
    expect(result.get("article:slug-1:0")).toBe("hash-a");
    expect(result.get("article:slug-1:1")).toBe("hash-b");
  });

  it("returns empty Map for empty sourceIds", async () => {
    const client = createMockClient();
    const result = await fetchExistingHashes(client, []);
    expect(result.size).toBe(0);
  });

  it("returns empty Map on DB error (graceful degradation)", async () => {
    const client = createMockClient();
    const selectBuilder = {
      in: vi.fn(() =>
        Promise.resolve({
          error: { message: "connection refused" },
          data: null,
        }),
      ),
    };
    client._fromBuilder.select = vi.fn(() => selectBuilder);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await fetchExistingHashes(client, ["slug-1"]);

    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Hash fetch error"));
  });

  it("batches queries when sourceIds exceed batch size", async () => {
    const client = createMockClient();
    const callCount = { in: 0 };
    const selectBuilder = {
      in: vi.fn(() => {
        callCount.in++;
        return Promise.resolve({ error: null, data: [] });
      }),
    };
    client._fromBuilder.select = vi.fn(() => selectBuilder);

    // 201 source IDs should trigger 2 batches (200 + 1)
    const manyIds = Array.from({ length: 201 }, (_, i) => `slug-${i}`);
    await fetchExistingHashes(client, manyIds);

    expect(callCount.in).toBe(2);
  });
});

// ─── queryContent ───

describe("queryContent", () => {
  it("calls match_content RPC with embedding and default params", async () => {
    const client = createMockClient({
      rpcData: [{ id: "1", content_type: "article", source_id: "test", similarity: 0.85 }],
    });
    const embedding = Array(1024).fill(0.1);

    const result = await queryContent(client, embedding);

    expect(client.rpc).toHaveBeenCalledTimes(1);
    const [fnName, params] = client._calls.rpcs[0];
    expect(fnName).toBe("match_content");
    expect(params.query_embedding).toEqual(embedding);
    expect(params.match_threshold).toBe(0.3);
    expect(params.match_count).toBe(10);
    expect(result).toHaveLength(1);
    expect(result[0].source_id).toBe("test");
  });

  it("passes filter_content_type when provided", async () => {
    const client = createMockClient({ rpcData: [] });
    const embedding = Array(1024).fill(0.1);

    await queryContent(client, embedding, { type: "article" });

    const [, params] = client._calls.rpcs[0];
    expect(params.filter_content_type).toBe("article");
  });

  it("passes NULL filter_content_type when not provided (Scenario #10)", async () => {
    const client = createMockClient({ rpcData: [] });
    const embedding = Array(1024).fill(0.1);

    await queryContent(client, embedding);

    const [, params] = client._calls.rpcs[0];
    expect(params.filter_content_type).toBeNull();
  });

  it("passes filter_topics as lowercase array when provided", async () => {
    const client = createMockClient({ rpcData: [] });
    const embedding = Array(1024).fill(0.1);

    await queryContent(client, embedding, { topics: ["DeepSeek", "Funding"] });

    const [, params] = client._calls.rpcs[0];
    expect(params.filter_topics).toEqual(["deepseek", "funding"]);
  });

  it("passes NULL filter_topics when not provided (Scenario #10, Q17)", async () => {
    const client = createMockClient({ rpcData: [] });
    const embedding = Array(1024).fill(0.1);

    await queryContent(client, embedding);

    const [, params] = client._calls.rpcs[0];
    expect(params.filter_topics).toBeNull();
  });

  it("passes NULL filter_topics when topics is empty array (Scenario #10)", async () => {
    const client = createMockClient({ rpcData: [] });
    const embedding = Array(1024).fill(0.1);

    await queryContent(client, embedding, { topics: [] });

    const [, params] = client._calls.rpcs[0];
    expect(params.filter_topics).toBeNull();
  });

  it("throws on RPC error", async () => {
    const client = createMockClient();
    client.rpc.mockResolvedValueOnce({
      error: { message: "function not found" },
      data: null,
    });

    await expect(queryContent(client, [0.1])).rejects.toThrow(/rpc|match_content/i);
  });

  it("returns empty array when no results (Scenario #18)", async () => {
    const client = createMockClient({ rpcData: [] });
    const result = await queryContent(client, [0.1]);
    expect(result).toEqual([]);
  });
});
