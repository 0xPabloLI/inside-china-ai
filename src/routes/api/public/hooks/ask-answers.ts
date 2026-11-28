import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest } from "@/lib/cron-auth.server";

/**
 * Daily cron: publish popular Ask China AI answers as pages, refresh stale
 * ones and tune search snippets. Called by pg_cron with `x-cron-secret`.
 * Body `{ "resume": true }` clears a credit/policy pause for one run.
 *
 * Auth (#1600): the caller sends the server-only `CRON_SECRET` header. The
 * public publishable key no longer identifies the cron runner; the explicit
 * migration windows live in `cron-auth.server.ts`.
 */
export const Route = createFileRoute("/api/public/hooks/ask-answers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const decision = authorizeCronRequest(request);
        if (!decision.ok) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        let resume = false;
        try {
          resume = ((await request.json()) as { resume?: unknown }).resume === true;
        } catch {
          // empty body
        }
        const { runAskAnswersJob } = await import("@/lib/ask-answers.server");
        const result = await runAskAnswersJob({ resume });
        return Response.json(result, { status: "error" in result && result.error ? 500 : 200 });
      },
    },
  },
});
