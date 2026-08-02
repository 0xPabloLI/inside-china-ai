import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/tiktok3ckG2LBTmztwqOB2cYwSBeolU6Qruwny.txt"
)({
  server: {
    handlers: {
      GET: () => {
        return new Response(
          "tiktok-developers-site-verification=3ckG2LBTmztwqOB2cYwSBeolU6Qruwny",
          {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=86400",
            },
          }
        );
      },
    },
  },
});
