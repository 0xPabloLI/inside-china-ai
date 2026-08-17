import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint: refreshes keyword snapshots once a day and emails admins on
 * ranking drops. Called by pg_cron with the project's publishable key in the
 * `apikey` header.
 */
export const Route = createFileRoute("/api/public/hooks/refresh-keyword-snapshots")({
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

        const { refreshSnapshots, sendRankingAlert, listAdminEmails } = await import(
          "@/lib/keyword-tracking.server"
        );

        try {
          const { updated, alerts } = await refreshSnapshots();
          if (alerts.length > 0) {
            const today = new Date().toISOString().slice(0, 10);
            for (const recipient of await listAdminEmails()) {
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
