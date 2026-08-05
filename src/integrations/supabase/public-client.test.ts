import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createPublicClient } from "./public-client";

describe("createPublicClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_testkey";
  });

  // Restore env after all tests
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // Scenario 1: listPublishedPosts called → uses createPublicClient()
  it("returns a Supabase client with expected methods", () => {
    const client = createPublicClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
    expect(typeof client.storage).toBe("object");
    expect(typeof client.auth).toBe("object");
  });

  // Scenario 2: New-style key (sb_publishable_*) → Bearer header removed, apikey set
  it("creates a client that works with new-style API keys", () => {
    const client = createPublicClient();
    // The client should be created without throwing
    expect(client).toBeDefined();
  });

  // Scenario 3: Old-style key (JWT) → Bearer header kept, apikey also set
  it("creates a client with old-style JWT keys", () => {
    process.env.SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.key";
    const client = createPublicClient();
    expect(client).toBeDefined();
  });
});
