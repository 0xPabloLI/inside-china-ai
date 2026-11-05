// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Load all env vars (no prefix) into process.env so server routes can read
// LOVABLE_API_KEY, SUPABASE_SERVICE_ROLE_KEY, etc.
const serverEnv = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    resolve: {
      // Vite/@rollup/plugin-alias treats string keys as PREFIX matches, so the
      // old `entities` key also swallowed `entities/decode`. That was harmless
      // while consumers only used entities@4's `entities/lib/*.js` subpaths,
      // but #981 pulled htmlparser2@10 (via @react-email/render 2.2.0 ->
      // html-to-text@10), which imports `entities/decode` from its own nested
      // entities@7. The prefix alias redirected it to root entities@4.5.0 —
      // no `decode` file there — and rolldown failed the production build with
      // UNLOADABLE_DEPENDENCY. Keep the v4 subpath workaround, but make each
      // alias exact so every importer resolves its own entities version.
      alias: [
        {
          find: /^entities\/lib\/decode\.js$/,
          replacement: path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        },
        {
          find: /^entities\/lib\/encode\.js$/,
          replacement: path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        },
        { find: /^entities$/, replacement: path.resolve(__dirname, "node_modules/entities") },
      ],
    },
  },
});
