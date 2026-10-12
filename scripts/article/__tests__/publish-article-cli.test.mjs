/**
 * #426 — integration evidence on real sockets.
 *
 * A local mock Supabase (node:http) drives upsertPost over real undici fetch;
 * "response lost" is a genuine TCP reset (socket.destroy()) that happens AFTER
 * the write committed server-side. The CLI test spawns publish-article.mjs
 * end-to-end and pins that the RAG reindex runs exactly once, only after the
 * final confirmed success (a PATH shim turns the RAG entry point into a
 * no-op so the test never touches Ollama or any real service).
 *
 * Scenario numbers (19–21, 29) map to the Behavioral Scenarios matrix
 * recorded in #426's delivery record (closing issue comment).
 */
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { upsertPost } from "../lib/publish-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "..", "publish-article.mjs");
const PROJECT_ROOT = join(__dirname, "..", "..", "..");

const KEY = "sb_publishable_test";
const AUTH = { access_token: "test-token", user: { id: "00000000-0000-4000-8000-000000000001" } };
const parsed = {
  title: "E2E Retry",
  slug: "e2e-retry",
  excerpt: "E2E",
  content: "Body text.",
  published: false,
};

const emptyState = () => ({
  posts: [],
  postCalls: 0,
  patchCalls: 0,
  dropNextPost: false,
  dropNextPostBeforeCommit: false,
  dropNextPatch: false,
});

function createMockSupabase(state) {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const url = new URL(req.url, "http://127.0.0.1");
      const json = (status, payload) => {
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(payload));
      };

      if (url.pathname === "/auth/v1/token") {
        json(200, { access_token: "test-token", user: AUTH.user });
        return;
      }
      if (url.pathname !== "/rest/v1/posts") {
        json(404, { message: "Not found" });
        return;
      }

      if (req.method === "GET") {
        const slug = (url.searchParams.get("slug") ?? "").replace(/^eq\./, "");
        json(
          200,
          state.posts.filter((post) => post.slug === slug),
        );
        return;
      }

      if (req.method === "POST") {
        state.postCalls += 1;
        if (state.dropNextPostBeforeCommit) {
          state.dropNextPostBeforeCommit = false;
          req.socket.destroy(); // never reached the database
          return;
        }
        const row = { id: `row-${state.posts.length + 1}`, ...JSON.parse(body) };
        state.posts.push(row);
        if (state.dropNextPost) {
          state.dropNextPost = false;
          req.socket.destroy(); // committed, response lost
          return;
        }
        json(201, [row]);
        return;
      }

      if (req.method === "PATCH") {
        state.patchCalls += 1;
        const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
        const index = state.posts.findIndex((post) => post.id === id);
        if (index < 0) {
          json(200, []);
          return;
        }
        state.posts[index] = { ...state.posts[index], ...JSON.parse(body) };
        if (state.dropNextPatch) {
          state.dropNextPatch = false;
          req.socket.destroy(); // committed, response lost
          return;
        }
        json(200, [state.posts[index]]);
        return;
      }

      json(405, { message: "Method not allowed" });
    });
  });
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

function runCli(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

// ─── real TCP reset against a live server ───

describe("#426 — real-socket reconciliation", () => {
  it("recovers a committed insert whose response was lost — exactly one POST (scenario 20)", async () => {
    const state = { ...emptyState(), dropNextPost: true };
    const server = createMockSupabase(state);
    const url = await listen(server);
    try {
      const result = await upsertPost(parsed, AUTH, url, KEY);

      expect(result).toMatchObject({ mode: "insert", reconciled: true });
      expect(state.postCalls).toBe(1);
      expect(state.posts).toHaveLength(1);
      expect(state.posts[0]).toMatchObject({ slug: "e2e-retry", published: false });
    } finally {
      await close(server);
    }
  });

  it("replays a write that died before commit (scenario 19)", async () => {
    const state = { ...emptyState(), dropNextPostBeforeCommit: true };
    const server = createMockSupabase(state);
    const url = await listen(server);
    try {
      const result = await upsertPost(parsed, AUTH, url, KEY, {
        retry: { baseDelayMs: 10, maxDelayMs: 20 },
      });

      expect(result.mode).toBe("insert");
      expect(result.reconciled).toBeUndefined();
      expect(state.postCalls).toBe(2);
      expect(state.posts).toHaveLength(1);
    } finally {
      await close(server);
    }
  });

  it("recovers a committed update whose response was lost — exactly one PATCH (scenario 21)", async () => {
    const existing = {
      id: "post-1",
      slug: "e2e-retry",
      title: "Old",
      excerpt: null,
      content: "Old",
      published: true,
      published_at: "2026-07-01T00:00:00Z",
    };
    const state = { ...emptyState(), posts: [existing], dropNextPatch: true };
    const server = createMockSupabase(state);
    const url = await listen(server);
    try {
      const result = await upsertPost(parsed, AUTH, url, KEY);

      expect(result).toMatchObject({ id: "post-1", mode: "update", reconciled: true });
      expect(state.patchCalls).toBe(1);
      expect(state.posts[0]).toMatchObject({
        published: false,
        published_at: "2026-07-01T00:00:00Z",
      });
    } finally {
      await close(server);
    }
  });
});

// ─── CLI end-to-end ───

describe("#426 — publish-article.mjs end-to-end", () => {
  it("recovers a lost insert response, exits 0, and triggers RAG exactly once (scenario 29)", async () => {
    const state = { ...emptyState(), dropNextPost: true };
    const server = createMockSupabase(state);
    const url = await listen(server);

    const tmp = mkdtempSync(join(tmpdir(), "publish-426-"));
    try {
      const articlePath = join(tmp, "article.md");
      writeFileSync(
        articlePath,
        '---\ntitle: "CLI Retry"\nslug: "cli-retry"\nexcerpt: "E2E"\n---\n\nBody text.\n',
      );

      // RAG shim: the CLI's execSync("node scripts/rag/index.mjs") no-ops;
      // every other `node` invocation still resolves the real binary.
      const binDir = join(tmp, "bin");
      mkdirSync(binDir);
      const shim = join(binDir, "node");
      writeFileSync(
        shim,
        `#!/bin/sh\nif [ "$1" = "scripts/rag/index.mjs" ]; then\n  echo "[test shim] rag reindex skipped"\n  exit 0\nfi\nexec "${process.execPath}" "$@"\n`,
      );
      chmodSync(shim, 0o755);

      const { status, stdout, stderr } = await runCli([CLI, "--file", articlePath, "--draft"], {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          ADMIN_EMAIL: "admin@example.com",
          ADMIN_PASSWORD: "test-password",
          SUPABASE_URL: url,
          SUPABASE_PUBLISHABLE_KEY: KEY,
        },
      });

      expect(status, `stderr:\n${stderr}\nstdout:\n${stdout}`).toBe(0);
      expect(stdout).toContain("✅ Success!");
      expect(stdout).toContain("reconciled");
      expect(state.postCalls).toBe(1); // no duplicate write
      expect(state.posts).toHaveLength(1);
      expect(state.posts[0]).toMatchObject({
        slug: "cli-retry",
        published: false,
        author_id: AUTH.user.id,
      });

      const ragRuns = stdout.split("\n").filter((line) => line.includes("Triggering RAG reindex"));
      expect(ragRuns).toHaveLength(1);
    } finally {
      await close(server);
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
