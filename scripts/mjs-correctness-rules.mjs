/**
 * Correctness rules for first-party `.mjs` scripts — single source of truth
 * (#447).
 *
 * `eslint.config.js` spreads this object into its .mjs file block, and
 * `scripts/lint-mjs-correctness.mjs` asserts (via ESLint's
 * `calculateConfigForFile`) that every rule here really resolves to `error`
 * for a `.mjs` file before it trusts a green scan. One list, two consumers —
 * so the gate cannot go quietly empty if the config drifts.
 *
 * Scope: syntax/semantics correctness only. `no-undef` and `no-unused-vars`
 * are deliberately NOT here — scripts read `process.env` and node globals
 * freely, and enabling them first needs `languageOptions.globals`; the
 * measured false-positive load (2026-10-04) was 41 undefined + 264 unused.
 * Formatting (`prettier/prettier`) is enforced by the incremental gate on
 * changed files, not by the full-repo correctness scan.
 */

export const MJS_CORRECTNESS_RULES = Object.freeze({
  // Crash-class: reassigning a `const` binding throws at runtime. #424 was
  // exactly this (search-sources.mjs) and no gate caught it.
  "no-const-assign": "error",
  // Duplicate object keys silently drop the first value.
  "no-dupe-keys": "error",
  // Code after return/throw/break — dead by construction, usually a refactor
  // leftover that hides the real behaviour.
  "no-unreachable": "error",
  // `!a in b` / `!a instanceof b` parses as `(!a) in b`, not `!(a in b)`.
  "no-unsafe-negation": "error",
  // `finally` with a control-flow statement swallows the pending throw/return.
  "no-unsafe-finally": "error",
  // Using the *result* of an optional chain outside the chain, e.g.
  // `(a?.b).c` — the chain short-circuits to undefined and `.c` then
  // throws. (`a?.b.c` is safe: the short circuit spans the whole chain.)
  "no-unsafe-optional-chaining": "error",
});

export const MJS_CORRECTNESS_RULE_NAMES = Object.freeze(Object.keys(MJS_CORRECTNESS_RULES));
