import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,tsx,mjs}"],
    // `experiments/` holds vendored spike repos (e.g. fastvideo-spike). Nothing
    // under the pipeline imports them, and their own suites were never ours to
    // keep green — including them just buries real failures in noise.
    exclude: ["**/node_modules/**", "scripts/short-video/experiments/**"],
    // Cap file-parallel workers: the short-video suite spawns real ffmpeg
    // (audio diagnostics/track tests) and headless Chromium (DOM gates);
    // running one worker per core saturates the machine and causes rare,
    // non-deterministic ffmpeg failures under `vitest run` (seen 2026-08-08:
    // audio-diagnostics 1/976 failed in a full run, green standalone).
    maxWorkers: 4,
    minWorkers: 1,
  },
});
