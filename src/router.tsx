import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload article routes on link hover/focus so navigation feels instant.
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    // Let TanStack Query own freshness for preloaded loader data.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
