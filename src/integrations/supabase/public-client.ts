import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Create a server-side public Supabase client (no session, no auth).
 *
 * Used by server functions that query public data (e.g. `listPublishedPosts`).
 * Mirrors the `createSupabaseFetch` header logic from the generated `client.ts`
 * — duplicated intentionally to avoid editing the auto-generated file (ADR-0005).
 *
 * ```ts
 * import { createPublicClient } from "@/integrations/supabase/public-client";
 * const sb = createPublicClient();
 * ```
 */
export function createPublicClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: createSupabaseFetch(key),
    },
  });
}

// ---- Copied from client.ts (auto-generated) — do not edit client.ts ----

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}
