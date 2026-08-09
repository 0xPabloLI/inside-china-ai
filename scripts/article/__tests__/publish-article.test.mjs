import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseArticleFile,
  slugify,
  validateSlug,
  buildPostPayload,
  upsertPost,
  triggerRagReindex,
} from "../lib/publish-utils.mjs";

// ─── slugify ───

describe("slugify", () => {
  it("converts title to slug (scenario 5)", () => {
    expect(slugify("DeepSeek's Leaked Meeting")).toBe("deepseeks-leaked-meeting");
  });

  it("handles Chinese characters", () => {
    // Chinese chars are stripped by \w regex (JS \w = [a-zA-Z0-9_]), matching admin.tsx
    expect(slugify("DeepSeek 融资")).toBe("deepseek-");
  });

  it("handles multiple spaces", () => {
    expect(slugify("  Hello   World  ")).toBe("hello-world");
  });

  it("truncates to 80 chars", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBe(80);
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});

// ─── validateSlug ───

describe("validateSlug", () => {
  it("accepts valid slug", () => {
    expect(validateSlug("deepseek-leaked-meeting")).toBe(true);
  });

  it("accepts slug with numbers", () => {
    expect(validateSlug("article-2026")).toBe(true);
  });

  it("rejects uppercase (scenario 6)", () => {
    expect(validateSlug("DeepSeek-Meeting")).toBe(false);
  });

  it("rejects spaces (scenario 6)", () => {
    expect(validateSlug("deepseek meeting")).toBe(false);
  });

  it("rejects special characters (scenario 6)", () => {
    expect(validateSlug("deepseek_meeting!")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateSlug("")).toBe(false);
  });
});

// ─── parseArticleFile ───

describe("parseArticleFile", () => {
  it("parses frontmatter + body correctly", () => {
    const fileContent = `---
title: "Test Article"
slug: "test-article"
excerpt: "A short description"
published: true
---

# Heading

Body text here.`;
    const result = parseArticleFile(fileContent);
    expect(result.title).toBe("Test Article");
    expect(result.slug).toBe("test-article");
    expect(result.excerpt).toBe("A short description");
    expect(result.published).toBe(true);
    expect(result.content).toBe("# Heading\n\nBody text here.");
  });

  it("auto-generates slug when missing (scenario 5)", () => {
    const fileContent = `---
title: "My Great Article"
---

Body.`;
    const result = parseArticleFile(fileContent);
    expect(result.slug).toBe("my-great-article");
  });

  it("defaults published to false when not specified", () => {
    const fileContent = `---
title: "Draft Article"
slug: "draft"
---

Body.`;
    const result = parseArticleFile(fileContent);
    expect(result.published).toBe(false);
  });

  it("ignores unknown frontmatter fields (scenario 13)", () => {
    const fileContent = `---
title: "Test"
slug: "test"
author: "Someone"
tags: ["a", "b"]
---

Body.`;
    const result = parseArticleFile(fileContent);
    expect(result.title).toBe("Test");
    expect(result.slug).toBe("test");
    expect(result.author).toBeUndefined();
    expect(result.tags).toBeUndefined();
  });

  it("throws on missing title (scenario 4)", () => {
    const fileContent = `---
slug: "no-title"
---

Body.`;
    expect(() => parseArticleFile(fileContent)).toThrow(/title/i);
  });

  it("throws on no frontmatter (scenario 14)", () => {
    const fileContent = "# Just markdown\n\nNo frontmatter.";
    expect(() => parseArticleFile(fileContent)).toThrow(/frontmatter/i);
  });

  it("preserves widget markers in content (scenario 10)", () => {
    const fileContent = `---
title: "Widget Test"
slug: "widget-test"
---

Intro text.

<!-- widget:deepseek-cloud -->

More text.`;
    const result = parseArticleFile(fileContent);
    expect(result.content).toContain("<!-- widget:deepseek-cloud -->");
  });

  it("preserves CJK characters (scenario 11)", () => {
    const fileContent = `---
title: "深度求索"
slug: "deepseek"
---

这是中文内容。`;
    const result = parseArticleFile(fileContent);
    expect(result.content).toContain("这是中文内容。");
    expect(result.title).toContain("深度求索");
  });

  it("allows empty content (scenario 12)", () => {
    const fileContent = `---
title: "Empty"
slug: "empty"
---`;
    const result = parseArticleFile(fileContent);
    expect(result.content).toBe("");
  });

  it("allows empty excerpt", () => {
    const fileContent = `---
title: "No Excerpt"
slug: "no-excerpt"
---

Body.`;
    const result = parseArticleFile(fileContent);
    expect(result.excerpt).toBeNull();
  });
});

// ─── buildPostPayload ───

describe("buildPostPayload", () => {
  it("builds insert payload for new article (scenario 1)", () => {
    const parsed = {
      title: "Test",
      slug: "test",
      excerpt: "Desc",
      content: "Body",
      published: true,
    };
    const userId = "user-uuid";
    const existing = null; // not found

    const result = buildPostPayload(parsed, userId, existing);
    expect(result.mode).toBe("insert");
    expect(result.data.author_id).toBe("user-uuid");
    expect(result.data.title).toBe("Test");
    expect(result.data.published).toBe(true);
    expect(result.data.published_at).toBeTruthy();
  });

  it("builds insert payload for draft (scenario 16)", () => {
    const parsed = {
      title: "Draft",
      slug: "draft",
      excerpt: null,
      content: "",
      published: false,
    };
    const userId = "user-uuid";
    const existing = null;

    const result = buildPostPayload(parsed, userId, existing);
    expect(result.mode).toBe("insert");
    expect(result.data.published).toBe(false);
    expect(result.data.published_at).toBeNull();
  });

  it("builds update payload preserving published_at (scenario 2)", () => {
    const parsed = {
      title: "Updated",
      slug: "existing",
      excerpt: "New desc",
      content: "New body",
      published: true,
    };
    const userId = "user-uuid";
    const existing = {
      id: "post-id",
      published_at: "2026-07-01T00:00:00Z",
      published: true,
    };

    const result = buildPostPayload(parsed, userId, existing);
    expect(result.mode).toBe("update");
    expect(result.data.published_at).toBe("2026-07-01T00:00:00Z");
    expect(result.data.author_id).toBeUndefined();
  });

  it("sets published_at on first publish of existing draft (scenario 3)", () => {
    const parsed = {
      title: "Publishing Draft",
      slug: "was-draft",
      excerpt: null,
      content: "Body",
      published: true,
    };
    const userId = "user-uuid";
    const existing = {
      id: "post-id",
      published_at: null,
      published: false,
    };

    const result = buildPostPayload(parsed, userId, existing);
    expect(result.mode).toBe("update");
    expect(result.data.published_at).toBeTruthy();
  });

  it("does not set author_id on update (scenario 17 idempotent)", () => {
    const parsed = {
      title: "Re-run",
      slug: "existing",
      excerpt: null,
      content: "Body",
      published: true,
    };
    const userId = "user-uuid";
    const existing = {
      id: "post-id",
      published_at: "2026-07-01T00:00:00Z",
      published: true,
    };

    const result = buildPostPayload(parsed, userId, existing);
    expect(result.mode).toBe("update");
    expect(result.data.author_id).toBeUndefined();
  });
});

// ─── upsertPost ───

describe("upsertPost", () => {
  const mockAuth = { access_token: "tok", user: { id: "u1" } };
  const supabaseUrl = "https://example.supabase.co";
  const supabaseKey = "sb_publishable_test";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts new post when slug not found (scenario 1)", async () => {
    const parsed = {
      title: "New",
      slug: "new",
      excerpt: "Desc",
      content: "Body",
      published: true,
    };

    // First fetch: query existing (returns empty)
    // Second fetch: insert
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "new-id", slug: "new" }),
      });

    const result = await upsertPost(parsed, mockAuth, supabaseUrl, supabaseKey);
    expect(result.id).toBe("new-id");
    expect(result.mode).toBe("insert");

    // Verify the second call was an insert (POST to /rest/v1/posts)
    const insertCall = global.fetch.mock.calls[1];
    expect(insertCall[0]).toContain("/rest/v1/posts");
    expect(insertCall[1].method).toBe("POST");
  });

  it("updates existing post when slug found (scenario 2)", async () => {
    const parsed = {
      title: "Updated",
      slug: "existing",
      excerpt: "New",
      content: "New body",
      published: true,
    };

    // First fetch: query existing (returns one record)
    // Second fetch: update (PATCH)
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "post-1", published_at: "2026-07-01T00:00:00Z", published: true }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "post-1", slug: "existing" }],
      });

    const result = await upsertPost(parsed, mockAuth, supabaseUrl, supabaseKey);
    expect(result.id).toBe("post-1");
    expect(result.mode).toBe("update");

    // Verify the second call was a PATCH
    const updateCall = global.fetch.mock.calls[1];
    expect(updateCall[0]).toContain("/rest/v1/posts");
    expect(updateCall[0]).toContain("id=eq.post-1");
    expect(updateCall[1].method).toBe("PATCH");
  });

  it("throws on API error (scenario 15)", async () => {
    const parsed = {
      title: "Test",
      slug: "test",
      excerpt: null,
      content: "",
      published: false,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Invalid request" }),
    });

    await expect(upsertPost(parsed, mockAuth, supabaseUrl, supabaseKey)).rejects.toThrow(
      /Invalid request/,
    );
  });
});

// ─── triggerRagReindex ───

describe("triggerRagReindex", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls execSync with node scripts/rag/index.mjs on success (Scenario #2)", () => {
    const mockExec = vi.fn();
    triggerRagReindex("/fake/project/root", mockExec);

    expect(mockExec).toHaveBeenCalledTimes(1);
    const [cmd, opts] = mockExec.mock.calls[0];
    expect(cmd).toContain("node");
    expect(cmd).toContain("scripts/rag/index.mjs");
    expect(opts.cwd).toBe("/fake/project/root");
  });

  it("does not throw when index.mjs fails (non-blocking, Scenario #2)", () => {
    const mockExec = vi.fn(() => {
      throw new Error("Ollama not running");
    });

    // Should not throw — reindex failure is non-blocking
    expect(() => triggerRagReindex("/fake/root", mockExec)).not.toThrow();
  });

  it("prints warning message on failure", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mockExec = vi.fn(() => {
      throw new Error("ECONNREFUSED");
    });

    triggerRagReindex("/fake/root", mockExec);

    // Should have logged the trigger message
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Triggering RAG reindex"));
    // Should have warned about failure
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("RAG reindex failed"),
      expect.anything(),
    );
    // Should mention manual fallback
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("node scripts/rag/index.mjs"));
  });

  it("prints success message when reindex completes", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mockExec = vi.fn(); // succeeds (no throw)

    triggerRagReindex("/fake/root", mockExec);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Triggering RAG reindex"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("RAG reindex complete"));
  });
});
