import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Liveness probe for deployed instances and local agents: GET /api/health
 * returns 200 {status:"ok"} whenever the server function runtime is serving.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
        }),
    },
  },
});
