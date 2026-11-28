import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Caller credential for the public cron hooks (#1600).
 *
 * The Supabase publishable/anon key is embedded in the frontend bundle, so it
 * says nothing about *who* is calling. Cron endpoints therefore require a
 * server-only `CRON_SECRET` (Lovable Secret / server env, never `VITE_*`).
 *
 * The gates, in order:
 * 1. A matching `CRON_SECRET` is accepted.
 * 2. The publishable key is accepted only when
 *    `CRON_ALLOW_LEGACY_PUBLISHABLE_KEY=1` is set explicitly, with a warning on
 *    every call. This is the one migration window for pg_cron jobs that still
 *    send the old key; without the flag the hooks fail closed (401), even when
 *    `CRON_SECRET` has not been provisioned yet.
 *
 * Comparison is SHA-256 + `timingSafeEqual`, so neither content nor length of
 * the presented credential leaks through timing.
 */

const SECRET_ENV = "CRON_SECRET";
const LEGACY_FLAG_ENV = "CRON_ALLOW_LEGACY_PUBLISHABLE_KEY";
const SECRET_HEADER = "x-cron-secret";

export type CronAuthDecision =
  | { ok: true; via: "secret" | "legacy-publishable-key" | "unconfigured-legacy" }
  | { ok: false; reason: "missing-credential" | "wrong-credential" };

export function authorizeCronRequest(request: Request): CronAuthDecision {
  const secret = process.env[SECRET_ENV];
  const providedSecret = readSecret(request);

  if (secret && providedSecret && constantTimeEqual(providedSecret, secret)) {
    return { ok: true, via: "secret" };
  }

  if (process.env[LEGACY_FLAG_ENV] === "1" && matchesLegacyKey(request)) {
    console.warn(
      secret
        ? "[cron-auth] accepted the public publishable key while CRON_ALLOW_LEGACY_PUBLISHABLE_KEY=1; switch pg_cron to x-cron-secret and remove the flag (#1600)"
        : "[cron-auth] CRON_SECRET is not configured; CRON_ALLOW_LEGACY_PUBLISHABLE_KEY=1 keeps the public key alive — set the secret and remove the flag (#1600)",
    );
    return { ok: true, via: secret ? "legacy-publishable-key" : "unconfigured-legacy" };
  }

  return { ok: false, reason: providedSecret ? "wrong-credential" : "missing-credential" };
}

function readSecret(request: Request): string | null {
  const header = request.headers.get(SECRET_HEADER);
  if (header) return header;
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  return bearer === authorization ? null : bearer;
}

function matchesLegacyKey(request: Request): boolean {
  const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  const provided =
    request.headers.get("apikey") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;
  return constantTimeEqual(provided, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}
