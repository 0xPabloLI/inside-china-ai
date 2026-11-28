import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest } from "@/lib/cron-auth.server";

/**
 * Cron endpoint: sends any newsletter whose scheduled time has arrived.
 * Called by pg_cron with `x-cron-secret`.
 *
 * Auth (#1600): the caller sends the server-only `CRON_SECRET` header. The
 * public publishable key no longer identifies the cron runner; the explicit
 * migration windows live in `cron-auth.server.ts`.
 */
export const Route = createFileRoute("/api/public/hooks/dispatch-newsletters")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const decision = authorizeCronRequest(request);
        if (!decision.ok) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { dispatchDueNewsletters } = await import("@/lib/newsletters.server");
        const result = await dispatchDueNewsletters();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
