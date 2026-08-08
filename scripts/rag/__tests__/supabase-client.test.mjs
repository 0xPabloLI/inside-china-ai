import { describe, it, expect, vi } from "vitest";
import {
  upsertChunks,
  cleanupOrphans,
  queryContent,
  UPSERT_BATCH_SIZE,
} from "../lib/supabase-client.mjs";

// ─── Mock Supabase client factory ───

/**
 * Create a mock Supabase client that mimics @supabase/supabase-js API:
 * - client.from(table) → query builder (upsert, delete)
 * - client.rpc(fn, params) → Promise<{data, error}>
 * - delete() returns a chainable builder (filter, not, in) that is thenable
 */
function createMockClient(overrides = {}) {
  const calls = { upserts: [], deletes: [], rpcs: [], filters: [] };

  // Delete builder: filter/not/in return this; thenable for await
  const deleteBuilder = {
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
  it("calls delete with NOT IN filter for provided source IDs", async () => {
    const client = createMockClient();
    await cleanupOrphans(client, ["article-1", "article-2", "scene-data-1"]);

    expect(client._fromBuilder.delete).toHaveBeenCalledTimes(1);
    // The .not() filter should have been called with 'in' operator
    expect(client._deleteBuilder.not).toHaveBeenCalled();
    const filterArgs = client._calls.filters[0];
    expect(filterArgs[0]).toBe("source_id");
    expect(filterArgs[1]).toBe("in");
    expect(filterArgs[2]).toContain("article-1");
    expect(filterArgs[2]).toContain("article-2");
  });

  it("deletes all when currentSourceIds is empty", async () => {
    const client = createMockClient();
    await cleanupOrphans(client, []);

    expect(client._fromBuilder.delete).toHaveBeenCalledTimes(1);
    // Should NOT apply a .not() filter (delete all)
    expect(client._deleteBuilder.not).not.toHaveBeenCalled();
  });

  it("throws on delete error", async () => {
    const client = createMockClient({
      deleteResult: { error: { message: "Permission denied" }, data: null },
    });

    await expect(cleanupOrphans(client, ["a"])).rejects.toThrow(/delete|permission/i);
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
