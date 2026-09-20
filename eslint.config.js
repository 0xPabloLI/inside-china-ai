import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      // Reference material mirrors (third-party code + skill docs) — not ours.
      "docs/refs/**",
      "docs/handoff-*/**",
      // Research mirrors of third-party repos (#302): vendored Python
      // site-packages ship bundled minified JS (e.g. litellm's Next.js build
      // output) — linting these stalls the full-repo run (2026-09-20).
      "docs/research/MoneyPrinterTurbo/**",
      "docs/research/**/.venv/**",
      // Agent skill installs (mirrored skill trees, not repo content).
      ".agents/**",
      "agent/**",
      // Frozen archive of the retired HTML/Playwright render path — kept verbatim
      // for reference, deliberately not lint/formatted.
      "scripts/short-video/retired-html-path/**",
      // Spike/experiment workspace incl. vendored third-party repos with Python
      // site-packages (.venv) — linting these stalls the full-repo run.
      "scripts/short-video/experiments/**",
      // Tool temp workspace (session artifacts) — not repo code (#177).
      ".codeartsdoer/**",
      // Markdown spec content with a .mjs extension — JS parser cannot parse.
      "docs/archive/spec-text-overflow-verify.mjs",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Cyclomatic complexity ceiling: flags functions that accrete branches
      // and become agent-hostile to reason about. 25 is generous — it exists
      // to stop new extremes, not to churn existing code.
      complexity: ["error", 25],
      // File-size ceiling (large-file detection): flags runaway files that
      // accrete responsibilities. 4000 is a ratchet — the current maximum
      // (source-registry.mjs) sits below it — so it stops new extremes
      // without churning existing code. Split a file before extending it.
      "max-lines": ["error", { max: 4000, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Pipeline/skill scripts are plain ESM (.mjs) — the ts/tsx block above
    // doesn't match them, so the file-size ceiling needs its own block.
    files: ["**/*.mjs"],
    rules: {
      "max-lines": ["error", { max: 4000, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // shadcn/ui components export style/helper functions (buttonVariants,
    // useFormField, …) alongside components — the standard shadcn structure.
    // Fast refresh doesn't apply meaningfully there; keep the rule off.
    files: ["src/components/ui/**"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  eslintPluginPrettier,
);
