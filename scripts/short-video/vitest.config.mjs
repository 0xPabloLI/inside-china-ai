import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for short-video scripts.
 *
 * Projects split:
 *   - "unit": All test files EXCEPT real-subprocess files, default parallel execution
 *   - "subprocess": Real Python subprocess tests, fileParallelism false (serial)
 *
 * P2 fix: Previously, subprocess tests relied on a comment convention
 * ("run with --maxWorkers=1"). Now the config enforces serial execution
 * automatically for focus-smoke.test.mjs and focus_detector.test.mjs.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          exclude: [
            "**/focus-smoke.test.mjs",
            "**/focus_detector.test.mjs",
            "**/node_modules/**",
          ],
        },
      },
      {
        test: {
          name: "subprocess",
          include: [
            "**/focus-smoke.test.mjs",
            "**/focus_detector.test.mjs",
          ],
          // Real Python subprocess tests must run serially to avoid
          // resource contention (OpenCV, Python venv contention).
          fileParallelism: false,
          // Use forks pool (child process) for isolation.
          pool: "forks",
          poolOptions: {
            forks: {
              singleFork: true,
            },
          },
        },
      },
    ],
  },
});
