import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy URL kept alive after the guide was updated from GLM-4 to GLM-5.2.
 * The slug is now version-neutral, so future GLM releases don't move the page.
 */
export const Route = createFileRoute("/compare/deepseek-vs-qwen-vs-glm-4")({
  beforeLoad: () => {
    throw redirect({
      to: "/compare/deepseek-vs-qwen-vs-glm",
      statusCode: 301,
    });
  },
});
