import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loginAdmin, loadEnvFile, getEnvVar } from "../lib/supabase-auth.mjs";

// ─── loadEnvFile ───

describe("loadEnvFile", () => {
  it("parses KEY=VALUE lines from .env file", () => {
    const content = "FOO=bar\nBAZ=hello world\n";
    const result = loadEnvFile(content);
    expect(result).toEqual({ FOO: "bar", BAZ: "hello world" });
  });

  it("ignores comments and empty lines", () => {
    const content = "# comment\nFOO=bar\n\n# another\nBAZ=qux\n";
    const result = loadEnvFile(content);
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("handles quoted values", () => {
    const content = "FOO=\"bar\"\nBAZ='qux'\n";
    const result = loadEnvFile(content);
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("returns empty object for empty content", () => {
    const result = loadEnvFile("");
    expect(result).toEqual({});
  });
});

// ─── getEnvVar ───

describe("getEnvVar", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  });

  afterEach(() => {
    // Restore
    process.env = { ...originalEnv };
  });

  it("returns value from process.env if set", () => {
    process.env.ADMIN_EMAIL = "test@example.com";
    expect(getEnvVar("ADMIN_EMAIL")).toBe("test@example.com");
  });

  it("returns value from fallback env object", () => {
    const fallback = { ADMIN_EMAIL: "fallback@example.com" };
    expect(getEnvVar("ADMIN_EMAIL", fallback)).toBe("fallback@example.com");
  });

  it("prefers process.env over fallback", () => {
    process.env.ADMIN_EMAIL = "primary@example.com";
    const fallback = { ADMIN_EMAIL: "fallback@example.com" };
    expect(getEnvVar("ADMIN_EMAIL", fallback)).toBe("primary@example.com");
  });

  it("returns undefined if not found anywhere", () => {
    expect(getEnvVar("NONEXISTENT")).toBeUndefined();
  });
});

// ─── loginAdmin ───

describe("loginAdmin", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("throws clear error when ADMIN_EMAIL is missing (scenario 9)", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.ADMIN_PASSWORD = "pass";

    await expect(loginAdmin()).rejects.toThrow(/ADMIN_EMAIL/);
  });

  it("throws clear error when ADMIN_PASSWORD is missing (scenario 9)", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.ADMIN_EMAIL = "test@example.com";

    await expect(loginAdmin()).rejects.toThrow(/ADMIN_PASSWORD/);
  });

  it("throws clear error when SUPABASE_URL is missing (scenario 9)", async () => {
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.ADMIN_EMAIL = "test@example.com";
    process.env.ADMIN_PASSWORD = "pass";

    await expect(loginAdmin()).rejects.toThrow(/SUPABASE_URL/);
  });

  it("throws clear error when SUPABASE_PUBLISHABLE_KEY is missing (scenario 9)", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.ADMIN_EMAIL = "test@example.com";
    process.env.ADMIN_PASSWORD = "pass";

    await expect(loginAdmin()).rejects.toThrow(/SUPABASE_PUBLISHABLE_KEY/);
  });

  it("returns access_token and user on successful login", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.ADMIN_EMAIL = "test@example.com";
    process.env.ADMIN_PASSWORD = "correctpass";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "eyJ.token.here",
        user: { id: "user-uuid-123" },
      }),
    });
    global.fetch = mockFetch;

    const result = await loginAdmin();
    expect(result.access_token).toBe("eyJ.token.here");
    expect(result.user.id).toBe("user-uuid-123");

    // Verify fetch was called with correct URL and body
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/auth/v1/token?grant_type=password");
    expect(opts.method).toBe("POST");
    expect(opts.headers["apikey"]).toBe("sb_publishable_test");
    const body = JSON.parse(opts.body);
    expect(body.email).toBe("test@example.com");
    expect(body.password).toBe("correctpass");
  });

  it("throws on invalid credentials (scenario 7)", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.ADMIN_EMAIL = "test@example.com";
    process.env.ADMIN_PASSWORD = "wrongpass";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: "Invalid credentials",
        error_description: "Invalid login credentials",
      }),
    });

    await expect(loginAdmin()).rejects.toThrow(/Invalid login credentials/);
  });

  it("throws on network error (scenario 8)", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.ADMIN_EMAIL = "test@example.com";
    process.env.ADMIN_PASSWORD = "pass";

    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(loginAdmin()).rejects.toThrow(/ECONNREFUSED/);
  });

  it("does not set Authorization header for sb_publishable_ keys", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.ADMIN_EMAIL = "test@example.com";
    process.env.ADMIN_PASSWORD = "pass";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "tok", user: { id: "u" } }),
    });
    global.fetch = mockFetch;

    await loginAdmin();
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers["Authorization"]).toBeUndefined();
    expect(opts.headers["apikey"]).toBe("sb_publishable_test");
  });

  it("sets Authorization header for legacy keys", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "eyJlegacykey";
    process.env.ADMIN_EMAIL = "test@example.com";
    process.env.ADMIN_PASSWORD = "pass";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "tok", user: { id: "u" } }),
    });
    global.fetch = mockFetch;

    await loginAdmin();
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers["Authorization"]).toBe("Bearer eyJlegacykey");
  });
});
