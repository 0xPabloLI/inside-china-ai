# 04 — Fix regression test regex false positive

**What to build:** Fix the `remotion-safezone-regression.test.mjs` regex to not match `padding` values when scanning for `bottom:` positioning properties. The current regex `content.match(/bottom:\s*(\d+)/g)` can match `padding` template strings if they contain numeric literals. Make the regex context-aware.

**Blocked by:** 02, 03 — scene files must be finalized first so the test scans the correct code.

**Status:** ready-for-agent

- [x] Regex only matches `bottom:` in CSS property context (preceded by newline, semicolon, or comma)
- [x] Regex does NOT match `padding: { top: 2, bottom: 2 }` object literal keys
- [x] Existing passing assertions still pass (SAFE_ZONES.bottom reference is detected)
- [x] Test still detects hardcoded `bottom: 120` (the regression it was designed to catch)
- [x] Scenarios #15-16 from spec verified
