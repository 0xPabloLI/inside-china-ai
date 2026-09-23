import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily cron: publish popular Ask China AI answers as pages, refresh stale
 * ones and tune search snippets. Called by pg_cron with the publishable key.
 * Body `{ "resume": true }` clears a credit/policy pause for one run.
 */
export const Route = createFileRoute("/api/public/hooks/ask-answers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || provided !== expected) {
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
