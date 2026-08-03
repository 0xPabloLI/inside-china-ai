import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://chinaai.lovable.app";

function htmlResponse(title: string, body: string) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" />
  <link rel="stylesheet" href="/assets/styles-oJhvGZ5D.css" />
  <style>
    body { font-family: Inter, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
    .card { max-width: 480px; padding: 2.5rem; text-align: center; }
    .card h1 { font-family: 'Instrument Serif', serif; font-size: 2rem; font-weight: 400; margin: 0 0 1rem; }
    .card p { color: #a1a1aa; font-size: 0.875rem; line-height: 1.6; margin: 0.5rem 0; }
    .badge { display: inline-block; background: #22c55e; color: #fff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; margin-bottom: 1rem; }
    .badge.error { background: #ef4444; }
    a { color: #818cf8; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/tiktok/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDesc = url.searchParams.get("error_description");

        if (error || errorDesc) {
          return htmlResponse(
            "TikTok Connection Failed",
            `<span class="badge error">Error</span>
             <h1>Authorization Failed</h1>
             <p>${errorDesc || error || "Unknown error"}</p>
             <p><a href="${BASE_URL}/tiktok-connect">Try again</a></p>`,
          );
        }

        if (!code) {
          return htmlResponse(
            "TikTok Connection",
            `<h1>No Authorization Code</h1>
             <p>Expected a <code>code</code> parameter from TikTok.</p>
             <p><a href="${BASE_URL}/tiktok-connect">Back to Connect</a></p>`,
          );
        }

        return htmlResponse(
          "TikTok Connected",
          `<span class="badge">Connected</span>
           <h1>TikTok Account Connected</h1>
           <p>Authorization code received: <code>${code.substring(0, 12)}...</code></p>
           <p>State: <code>${state || "none"}</code></p>
           <p>Your TikTok account (@chinaainews) has been successfully connected.</p>
           <p><a href="${BASE_URL}/tiktok-connect?connected=1">Continue to Upload</a></p>`,
        );
      },
    },
  },
});
