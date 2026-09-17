import { createFileRoute, Outlet } from "@tanstack/react-router";
import { z } from "zod";

/**
 * /news layout. Owns the `topic` search param so both the hub index and the
 * topic pages under /news/* can link back with a filter.
 */
const searchSchema = z.object({
  topic: z.enum(["all", "models", "policy", "chips", "companies", "industry"]).catch("all"),
});

export const Route = createFileRoute("/news")({
  validateSearch: searchSchema,
  component: () => <Outlet />,
});
