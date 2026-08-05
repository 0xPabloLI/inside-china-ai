import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint: sends any newsletter whose scheduled time has arrived.
 * Called by pg_cron with the project's publishable key in the `apikey` header.
 */
export const Route = createFileRoute("/api/public/hooks/dispatch-newsletters")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || provided !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { dispatchDueNewsletters } = await import("@/lib/newsletters.server");
        const result = await dispatchDueNewsletters();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
