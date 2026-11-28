import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ask-answers.server", () => ({
  runAskAnswersJob: vi.fn(async () => ({ resumed: true, processed: 0 })),
}));
vi.mock("@/lib/newsletters.server", () => ({
  dispatchDueNewsletters: vi.fn(async () => ({ dispatched: [] })),
}));
vi.mock("@/lib/keyword-tracking.server", () => ({
  refreshSnapshots: vi.fn(async () => ({ updated: 0, alerts: [] })),
  sendRankingAlert: vi.fn(async () => {}),
  listAlertRecipients: vi.fn(async () => []),
}));

import { authorizeCronRequest } from "@/lib/cron-auth.server";
import { Route as askAnswers } from "@/routes/api/public/hooks/ask-answers";
import { Route as dispatchNewsletters } from "@/routes/api/public/hooks/dispatch-newsletters";
import { Route as refreshKeywordSnapshots } from "@/routes/api/public/hooks/refresh-keyword-snapshots";

const PUBLISHABLE = "sb_publishable_public";
const SECRET = "cron-secret-value";

const hooks = [
  { name: "ask-answers", route: askAnswers },
  { name: "dispatch-newsletters", route: dispatchNewsletters },
  { name: "refresh-keyword-snapshots", route: refreshKeywordSnapshots },
] as const;

function postHandler(route: (typeof hooks)[number]["route"]) {
  const handler = (route as unknown as { options: { server: { handlers: { POST: unknown } } } })
    .options.server.handlers.POST as (ctx: { request: Request }) => Promise<Response>;
  return handler;
}

function request(headers: Record<string, string>) {
  return new Request("http://localhost/api/public/hooks/test", { method: "POST", headers });
}

beforeEach(() => {
  process.env["SUPABASE_PUBLISHABLE_KEY"] = PUBLISHABLE;
  process.env["CRON_SECRET"] = SECRET;
  delete process.env["CRON_ALLOW_LEGACY_PUBLISHABLE_KEY"];
});

afterEach(() => {
  delete process.env["SUPABASE_PUBLISHABLE_KEY"];
  delete process.env["SUPABASE_ANON_KEY"];
  delete process.env["CRON_SECRET"];
  delete process.env["CRON_ALLOW_LEGACY_PUBLISHABLE_KEY"];
});

describe("cron hooks caller credential (#1600)", () => {
  for (const { name, route } of hooks) {
    it(`${name}: rejects the public publishable key once CRON_SECRET is set`, async () => {
      const res = await postHandler(route)({ request: request({ apikey: PUBLISHABLE }) });
      expect(res.status).toBe(401);
    });

    it(`${name}: rejects a missing credential`, async () => {
      const res = await postHandler(route)({ request: request({}) });
      expect(res.status).toBe(401);
    });

    it(`${name}: fails closed when CRON_SECRET is absent and the legacy flag is off`, async () => {
      delete process.env["CRON_SECRET"];
      const res = await postHandler(route)({ request: request({ apikey: PUBLISHABLE }) });
      expect(res.status).toBe(401);
    });

    it(`${name}: accepts the configured cron secret`, async () => {
      const res = await postHandler(route)({ request: request({ "x-cron-secret": SECRET }) });
      expect(res.status).toBe(200);
    });
  }
});

describe("authorizeCronRequest decision matrix (#1600)", () => {
  it("accepts the secret as an Authorization bearer token too", () => {
    const decision = authorizeCronRequest(request({ authorization: `Bearer ${SECRET}` }));
    expect(decision).toEqual({ ok: true, via: "secret" });
  });

  it("rejects a wrong or truncated secret without throwing", () => {
    expect(authorizeCronRequest(request({ "x-cron-secret": "short" }))).toEqual({
      ok: false,
      reason: "wrong-credential",
    });
    expect(authorizeCronRequest(request({ "x-cron-secret": `${SECRET}x` }))).toEqual({
      ok: false,
      reason: "wrong-credential",
    });
  });

  it("does not fall back to the publishable key while the secret is set", () => {
    expect(authorizeCronRequest(request({ apikey: PUBLISHABLE }))).toEqual({
      ok: false,
      reason: "missing-credential",
    });
  });

  it("allows the publishable key only behind the explicit legacy flag", () => {
    process.env["CRON_ALLOW_LEGACY_PUBLISHABLE_KEY"] = "1";
    expect(authorizeCronRequest(request({ apikey: PUBLISHABLE }))).toEqual({
      ok: true,
      via: "legacy-publishable-key",
    });
  });

  it("keeps the legacy anon alias behind the same explicit flag", () => {
    delete process.env["SUPABASE_PUBLISHABLE_KEY"];
    process.env["SUPABASE_ANON_KEY"] = PUBLISHABLE;
    process.env["CRON_ALLOW_LEGACY_PUBLISHABLE_KEY"] = "1";
    expect(authorizeCronRequest(request({ apikey: PUBLISHABLE }))).toEqual({
      ok: true,
      via: "legacy-publishable-key",
    });
  });

  it("keeps cron alive before the secret is provisioned only with the explicit flag", () => {
    delete process.env["CRON_SECRET"];
    process.env["CRON_ALLOW_LEGACY_PUBLISHABLE_KEY"] = "1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(authorizeCronRequest(request({ apikey: PUBLISHABLE }))).toEqual({
      ok: true,
      via: "unconfigured-legacy",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("CRON_SECRET is not configured"));
    warn.mockRestore();
  });

  it("fails closed before the secret is provisioned when the flag is absent", () => {
    delete process.env["CRON_SECRET"];
    expect(authorizeCronRequest(request({ apikey: PUBLISHABLE }))).toEqual({
      ok: false,
      reason: "missing-credential",
    });
  });

  it("rejects a non-matching credential when no secret is configured", () => {
    delete process.env["CRON_SECRET"];
    expect(authorizeCronRequest(request({ "x-cron-secret": SECRET }))).toEqual({
      ok: false,
      reason: "wrong-credential",
    });
  });
});
