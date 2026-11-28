import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest } from "@/lib/cron-auth.server";

/**
 * Cron endpoint: refreshes keyword snapshots once a day and emails admins on
 * ranking drops. Called by pg_cron with `x-cron-secret`.
 *
 * Auth (#1600): the caller sends the server-only `CRON_SECRET` header. The
 * public publishable key no longer identifies the cron runner; the explicit
 * migration windows live in `cron-auth.server.ts`.
 */
export const Route = createFileRoute("/api/public/hooks/refresh-keyword-snapshots")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const decision = authorizeCronRequest(request);
        if (!decision.ok) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { refreshSnapshots, sendRankingAlert, listAlertRecipients } =
          await import("@/lib/keyword-tracking.server");

        try {
          const { updated, alerts } = await refreshSnapshots();
          if (alerts.length > 0) {
            const today = new Date().toISOString().slice(0, 10);
            for (const recipient of await listAlertRecipients()) {
              try {
                await sendRankingAlert(recipient, alerts, today);
              } catch (err) {
                console.error("ranking alert email failed", err);
              }
            }
          }
          return Response.json({ ok: true, updated, alerts: alerts.map((a) => a.keyword) });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Refresh failed";
          console.error("keyword snapshot refresh failed", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
