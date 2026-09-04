# Spec: TikTok Embed + Pipeline Cleanup

> Created: 2026-08-10
> Status: ready-for-agent

## Problem Statement

Article pages currently render TikTok videos as raw `<video>` tags from Supabase Storage MP4 attachments. This looks bad (9:16 vertical in horizontal layout), is easily missed for manually-uploaded TikToks, and duplicates content already on TikTok. We want to replace this with TikTok's official embed player.

## Solution

Store a `tiktok_url` on the post record. When present, the article page renders a TikTok embed (blockquote + embed.js) instead of a `<video>` tag. The pipeline auto-saves the URL after publishing via Publora. For manual TikTok uploads, the admin editor has a URL input field. Video attachment upload (Stage 5a) is removed entirely.

## User Stories

1. As a reader, I want to see a TikTok video player embedded in the article page, so that I can watch the video without leaving the site
2. As a reader, when a TikTok embed fails to load, I want to see a "Watch on TikTok" link, so that I can still access the video
3. As a reader, I want articles without TikTok videos to load without unnecessary TikTok scripts, so that page load is fast
4. As an admin, I want a TikTok URL input field in the post editor, so that I can paste the URL for manually-uploaded videos
5. As an admin, I want to clear the TikTok URL field to remove the embed, so that I can manage content flexibly
6. As an admin, I want the TikTok URL to persist across saves, so that I don't lose it when editing other fields
7. As a pipeline operator, I want publish-tiktok.mjs to automatically save the TikTok URL after publishing, so that I don't have to manually set it
8. As a pipeline operator, when TikTok hasn't finished processing after 2.5 minutes, I want a warning message, so that I know to set the URL manually later
9. As a pipeline operator, I want publish-tiktok.mjs to work without --slug (backward compatible), so that existing scripts don't break
10. As a developer, I want the TikTok URL stored as a nullable text column, so that it's queryable and has no impact on existing posts
11. As a developer, I want AttachmentList to only render non-video files, so that old video attachments don't show as broken players
12. As a reader, I want non-video attachments (PDFs, docs) to still render normally, so that source materials are accessible

## Implementation Decisions

### Database

- Add `tiktok_url TEXT` column to `posts` table (nullable, no default)
- Migration: `supabase/migrations/20260810120000_add_tiktok_url.sql`
- RLS: inherits existing posts policies (anon reads published posts, admin reads/writes all)
- No index needed (no queries filter by tiktok_url)

### Supabase Types

- `types.ts`: add `tiktok_url: string | null` to posts Row, `tiktok_url?: string | null` to Insert and Update

### Server Functions (`posts.functions.ts`)

- `getPublishedPost`: add `tiktok_url` to select query
- `postInput` zod schema: add `tiktokUrl: z.string().trim().url().optional().nullable().or(z.literal(""))`
- `savePost`: map `tiktokUrl` → `tiktok_url` in update/insert (empty string → null)

### Frontend — TikTokEmbed Component (`src/components/tiktok-embed.tsx`)

- New component: accepts `url: string` prop
- Extracts video ID via regex `tiktok.com\/[^/]+\/video\/(\d+)`
- Renders `<blockquote class="tiktok-embed" cite={url} data-video-id={videoId}>` with `<section>` containing "Watch on TikTok →" fallback link
- If video ID extraction fails, renders just the fallback link
- Style: `max-width: 880px; min-width: 288px;` (TikTok official)

### Frontend — Article Page (`src/routes/posts.$slug.tsx`)

- Delete: `isVideo()` function, `hasVideo`/`hasNonVideo` logic, `<video>` rendering branch
- `AttachmentList`: simplified to only render non-video files, title always "Attachments"
- Add: `TikTokEmbed` component rendered when `post.tiktok_url` is truthy
- `head()`: conditionally add `{ src: "https://www.tiktok.com/embed.js", async: true }` to `scripts` array when `loaderData.tiktok_url` exists

### Frontend — Post Editor (`src/components/post-editor.tsx`)

- `PostForm` type: add `tiktokUrl: string`
- `initial` prop type: add `tiktok_url: string | null`
- Add `useState` for `tiktokUrl`, initialized from `initial?.tiktok_url ?? ""`
- Add Input field (URL type, placeholder "https://www.tiktok.com/@chinaainews/video/...")
- Pass `tiktokUrl` in `onSave` callback

### Pipeline — publish-tiktok.mjs

- Add optional `--slug <slug>` CLI arg
- After publish success (non-draft), if `--slug` provided:
  1. Poll `GET /get-post/{postGroupId}` every 30s, up to 5 times
  2. When any `posts[]` entry has `status === "published"` and `postedId` is non-null:
     - Construct URL: `https://www.tiktok.com/@chinaainews/video/{postedId}`
     - Save to Supabase via REST API: `PATCH /rest/v1/posts?slug=eq.{slug}` with `{ tiktok_url: url }`
  3. If timeout or postedId null: print warning, non-blocking
- TikTok handle `@chinaainews` is hardcoded (single-account project)

### Pipeline Docs

- `docs/content-pipeline.md`: delete Stage 5a section, update checkpoint table (remove "视频 MP4 上传到文章" row), update post-publish verification
- `docs/manual-ops.md`: update references to MP4 upload

## Testing Decisions

### Test Seams

1. **`extractTikTokVideoId(url: string): string | null`** — pure function in `tiktok-embed.tsx`. Test with: valid URL, URL with query params, non-TikTok URL, malformed URL, empty string. This is the highest-value seam — encapsulates all URL parsing logic.

2. **`buildTikTokUrl(postedId: string): string`** — pure function in publish-tiktok.mjs or publish-utils.mjs. Constructs `https://www.tiktok.com/@chinaainews/video/{postedId}`. Test with: numeric ID, ID with leading zeros.

3. **TikTokEmbed rendering** — component test. Given a valid URL, renders blockquote with correct `data-video-id` and `cite`. Given invalid URL, renders fallback link only.

4. **publish-tiktok.mjs auto-save** — integration test with mocked Publora API. Mock `get-post` response with `status: "published"` and `postedId`. Verify Supabase REST PATCH called with correct URL. Test timeout scenario (all polls return `status: "pending"`).

### Prior Art

- `scripts/short-video/__tests__/publish-utils.test.mjs` — pattern for testing publish utilities
- `scripts/short-video/__tests__/publora-client.test.mjs` — pattern for mocking fetch/Publora API

### What NOT to test

- Don't test Supabase RLS (existing policies, not modified)
- Don't test TanStack Start head() rendering (framework responsibility)
- Don't test TikTok embed.js behavior (third-party)

## Scenario & Risk Verification Matrix

### Modified Files Impact

| File                                                          | Modification                                  | Risk   | Assessment                                                              |
| ------------------------------------------------------------- | --------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `supabase/migrations/20260810120000_add_tiktok_url.sql` (NEW) | ADD COLUMN tiktok_url TEXT                    | Low    | Pure additive, nullable, reversible                                     |
| `src/integrations/supabase/types.ts`                          | Add tiktok_url to posts types                 | Low    | Optional field, no breaking                                             |
| `src/lib/posts.functions.ts`                                  | Add tiktok_url to select, postInput, savePost | Medium | Server fn interface change. TS types auto-derive                        |
| `src/components/tiktok-embed.tsx` (NEW)                       | TikTok embed component                        | Low    | New file                                                                |
| `src/routes/posts.$slug.tsx`                                  | Delete video rendering, add TikTok embed      | High   | Core render path. Legacy video attachments no longer render (by design) |
| `src/components/post-editor.tsx`                              | Add tiktokUrl field                           | Medium | Form interface change                                                   |
| `scripts/short-video/publish-tiktok.mjs`                      | Add --slug, auto-save URL                     | Medium | Network polling, non-blocking                                           |
| `docs/content-pipeline.md`                                    | Remove Stage 5a                               | Low    | Documentation                                                           |
| `docs/manual-ops.md`                                          | Update references                             | Low    | Documentation                                                           |

### Behavioral Scenarios

| #   | Scenario                                       | Expected Behavior                 | Risk   | Mitigation                        |
| --- | ---------------------------------------------- | --------------------------------- | ------ | --------------------------------- |
| 1   | tiktok_url null                                | No embed, no embed.js loaded      | Low    | Conditional render                |
| 2   | tiktok_url empty string                        | Treated as null                   | Low    | trim() check                      |
| 3   | tiktok_url valid                               | Embed renders + embed.js loads    | Low    | Normal path                       |
| 4   | tiktok_url invalid (non-TikTok)                | Fallback link only                | Medium | extractTikTokVideoId returns null |
| 5   | embed.js network failure                       | Fallback link visible             | Low    | TikTok official design            |
| 6   | TikTok video deleted                           | Fallback link clickable (may 404) | Medium | Acceptable degradation            |
| 7   | tiktok_url + non-video attachments             | Both sections render              | Low    | Independent conditional           |
| 8   | tiktok_url + old video attachments             | Only TikTok embed renders         | Low    | isVideo() deleted                 |
| 9   | No tiktok_url + non-video attachments          | Only Attachments section          | Low    | Normal path                       |
| 10  | No tiktok_url + no attachments                 | Neither section renders           | Low    | Normal path                       |
| 11  | Admin sets tiktok_url → save → publish         | DB stores, page shows embed       | Low    | savePost accepts tiktokUrl        |
| 12  | Admin clears tiktok_url → save                 | DB stores null, no embed          | Low    | Empty → null                      |
| 13  | publish-tiktok --slug, published within 2.5min | Auto-save URL to DB               | Medium | Poll 5×30s                        |
| 14  | publish-tiktok --slug, timeout                 | Warning printed, non-blocking     | Medium | Acceptable                        |
| 15  | publish-tiktok without --slug                  | Normal publish, no auto-save      | Low    | --slug optional                   |
| 16  | Supabase REST fail during auto-save            | Warning, publish succeeds         | Medium | try/catch non-blocking            |
| 17  | postedId null after publish                    | Skip save, warning                | Medium | Check before construct            |
| 18  | Concurrent auto-save + manual set              | last-write-wins                   | Low    | Acceptable                        |
| 19  | SSR conditional embed.js                       | Only loads when tiktok_url exists | Medium | head() scripts conditional push   |
| 20  | getPublishedPost returns tiktok_url            | Frontend consumes correctly       | Low    | TS auto-derive                    |
| 21  | Manual TikTok upload                           | Admin pastes URL → embed shows    | Low    | Q5 path                           |

### Cross-Step Interface Contracts

1. **DB → types.ts → server fn → frontend**: migration adds column → types.ts updated → getPublishedPost selects field → posts.$slug.tsx renders
2. **PostEditor → savePost → DB**: PostForm.tiktokUrl (camelCase) → postInput.tiktokUrl (zod) → savePost maps to tiktok_url (snake_case)
3. **publish-tiktok.mjs → Publora → Supabase**: --slug → poll get-post → postedId → construct URL → PATCH posts table
4. **head() scripts → SSR HTML**: conditionally push {src, async} → `<Scripts />` renders `<script async src="...">` after content

## Out of Scope

- Removing existing video attachments from the database (they remain but won't render)
- TikTok Display API integration for direct video URL retrieval
- Multi-account TikTok support (hardcoded @chinaainews)
- YouTube embed support
- TikTok embed lazy-loading / intersection observer optimization
- Webhook-based auto-save (Publora webhooks → auto-set URL on publish event)

## Further Notes

- Publora's `permalink` field is currently null for all posts (per their docs, pending backfill). We use `postedId` to construct the URL instead.
- The `scripts` field in TanStack Start's `head()` renders via `<Scripts />` at the bottom of `<body>`, after page content. This ensures blockquote elements are in the DOM before embed.js processes them.
- `upload-attachments.mjs` is kept for non-video attachments (source material PDFs etc). Only the pipeline Stage 5a video upload step is removed.
