import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Liveness probe for deployed instances and local agents: GET /api/public/health
 * returns 200 {status:"ok"} whenever the server function runtime is serving.
 * Lives under /api/public/* so it bypasses site auth per
 * docs/tanstack-lovable-conventions.md §2/§9.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
        }),
    },
  },
});
