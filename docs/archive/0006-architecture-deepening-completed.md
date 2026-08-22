# Architecture deepening: completed refactors

## Context

An `improve-codebase-architecture` skill review (2026-08-05) identified 8 refactoring candidates across the website and video pipeline. All 8 were implemented across 4 sessions (S1–S4) as behavior-preserving refactors — no new features, no API changes.

This ADR records what was done, the key decisions made during implementation, and the one deviation from the original spec. It replaces the now-deleted `docs/spec-architecture-deepening.md`.

## Decision

### Completed refactors

| # | Candidate | Session | Commit | Tests |
|---|-----------|---------|--------|-------|
| 1 | `requireAdmin` middleware | S1 | `2eda390` | — |
| 2 | `useIsAdmin` hook | S1 | `2eda390` | — |
| 5 | TTS engine strategy (adapter + registry) | S2 | `cef738d` | 25 |
| 6 | Publora API client extraction | S3 | `70541c9` | 16 |
| 7 | CDP scraper extraction | S3 | `70541c9` | 21 |
| 8 | PostEditor + AttachmentUploader extraction | S4 | `7ebc78f` | 14 |
| 3 | Attachment upload server function | S4 | `7ebc78f` | 13 |
| 4 | Supabase client factory consolidation | S4 | `7ebc78f` + `50e61fb` | 3 |

Total: 92 new tests across all sessions.

### Key decisions

1. **Candidate 4 — `createPublicClient` lives in `public-client.ts`, not `client.ts`**
   - The original spec proposed adding `createPublicClient()` to `src/integrations/supabase/client.ts`.
   - Code review (S4) flagged this as a violation of ADR-0005: `client.ts` is marked "automatically generated, do not edit directly."
   - Fix: moved `createPublicClient()` to a new file `src/integrations/supabase/public-client.ts` (commit `50e61fb`). The `createSupabaseFetch` helper is duplicated in `public-client.ts` rather than exported from `client.ts` — this is intentional to avoid editing the generated file.

2. **Candidate 3 — base64 transport for file uploads**
   - The spec said "server function" but did not specify the transport mechanism.
   - TanStack Start server functions do not support binary/multipart bodies, so files are base64-encoded client-side (`FileReader.readAsDataURL`), sent as a string field, and decoded server-side (`Buffer.from(base64)`).
   - Risk: 50 MB file → ~67 MB base64 string in memory. Acceptable for admin-only upload workflow; not suitable for public-facing high-volume uploads.

3. **Candidate 5 — TTS engine adapter pattern**
   - 470-line `generate-tts.mjs` monolith → 8 adapter modules + registry + shared `postProcess`/`runWhisperAlignment`.
   - Selection by priority (F5 > XTTS > Kokoro > edge-tts > say) with `TTS_ENGINE` env override.

4. **Candidate 1 — `requireAdmin` also fixed `getPostAdmin`**
   - During S1 implementation, discovered `getPostAdmin` was missing the admin check entirely. Fixed in the same commit.

### Dev server verification

Local dev server cannot fully verify admin UI because `src/routes/lovable/email/events.ts` requires `LOVABLE_API_KEY` (only injected by Lovable Cloud at deploy time). This is a pre-existing environment limitation, not introduced by the refactors. Verification relied on:
- `npm run build` passing (all modules compile and link correctly)
- 92 unit tests covering all spec behavioral scenarios
- `npx tsc --noEmit` zero new type errors

## Consequences

- `admin.tsx` reduced from 740 → 264 lines (PostEditor + AttachmentUploader extracted to `src/components/`)
- All attachment operations (upload, delete, rename, list) now cross a single server-function seam
- Supabase public client factory is consolidated in `public-client.ts` — `posts.functions.ts` and `sitemap.xml.ts` no longer have duplicate `publicClient()` copies
- `auth-middleware.ts` remains untouched (ADR-0005 auto-generated)
- `client.ts` remains untouched (ADR-0005 auto-generated) — `createPublicClient` is in a separate file
