# Handoff: TikTok Embed + Pipeline Cleanup

> Created: 2026-08-10
> Previous session: RAG Phase 2 completion (T-20~T-23) + eval.mjs fix + Kimi K3 sandbox reindex
> Next session focus: Replace MP4 attachment with TikTok embed on article pages

---

## Context

### What happened this session

1. **RAG Phase 2 completed** — T-20 (extract-widget-sources.mjs), T-21 (publish-article RAG reindex trigger), T-22 (eval.mjs), T-23 (golden queries YAML). All committed and pushed. 106 tests passing.

2. **eval.mjs fixed** — Negative query logic was wrong (any result = miss). Fixed to use 0.5 similarity threshold: if all results < 0.5, search engine correctly found nothing relevant = HIT. Also corrected golden-queries.yaml expected_sources (4 queries had wrong source_ids from "closed-book" writing). Hit rate: 65% → 95% PASS. Commit `53ce637`.

3. **Kimi K3 sandbox content reindexed** — Article, scene-data, and WeChat source material were generated in a prior session but never indexed into RAG (pipeline hadn't reached Stage 2 publish). Ran `node scripts/rag/index.mjs` manually: 403 → 421 chunks, 63 sources. Verified searchable (top-5 all kimi-sandbox, 0.64-0.70 similarity).

4. **Pipeline review** — Confirmed current pipeline design is correct for user's workflow: articles publish early (Stage 2) → RAG auto-indexes → video is optional/HITL may be skipped. No pipeline changes needed for RAG timing.

### What needs to happen next

**Replace MP4 video attachment with TikTok embed on article pages.**

---

## Problem Statement

Current pipeline Stage 5a uploads the TikTok video MP4 as a Supabase Storage attachment to the article. The article page (`src/routes/posts.$slug.tsx`) renders it as a `<video>` tag in a "Watch" section.

**Issues:**
1. TikTok videos are 9:16 vertical — embedding as `<video>` in a horizontal article layout looks bad
2. Many videos are uploaded to TikTok manually (not via pipeline) — the MP4 attachment step is easily missed
3. The MP4 is a duplicate of what's already on TikTok — better to embed the TikTok player directly

**Desired outcome:**
- Article page shows a TikTok embed (not a raw `<video>` tag)
- No more MP4 upload to Supabase Storage
- TikTok video URL stored on the post record (new field or metadata)
- Works for both pipeline-published and manually-published TikToks

---

## Technical Details

### TikTok Embed Format

TikTok's official embed uses a blockquote + script:

```html
<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@chinaainews/video/VIDEO_ID"
  data-video-id="VIDEO_ID" style="max-width: 880px; min-width: 288px;">
  <section></section>
</blockquote>
<script async src="https://www.tiktok.com/embed.js"></script>
```

The script transforms the blockquote into an iframe player. Video ID is extracted from the TikTok URL.

### Current Article Video Rendering

File: `src/routes/posts.$slug.tsx`

- Line 36-37: Checks `attachments` for video MIME types
- Renders `<video>` tag with the attachment URL from Supabase Storage
- Section header: "Watch" (if only video) or "Media & Attachments" (if mixed)

### Database

Supabase `posts` table currently has no `tiktok_url` field. Options:
1. **Add a `tiktok_url` column** (migration) — cleanest, queryable
2. **Use an existing JSON metadata field** — check if posts table has one
3. **Use post_attachments with a special type** — overcomplicated

Recommend option 1: `ALTER TABLE posts ADD COLUMN tiktok_url TEXT;`

### Pipeline Changes

**`docs/content-pipeline.md`:**

| Current | Proposed |
|---------|----------|
| Stage 5a: Upload MP4 attachment | ~~Deleted~~ |
| Stage 5d: Publish to TikTok | Stage 5d: Publish to TikTok → save video URL to post |
| (no step for manual TikTok) | New: If manual TikTok upload, user provides URL → Agent saves to post |

**`scripts/article/publish-article.mjs`:**
- No change needed (already runs in Stage 2, before TikTok)

**New script or extension needed:**
- A way to update `posts.tiktok_url` after TikTok publish (either extend `publish-tiktok.mjs` or a small `update-tiktok-url.mjs` script)
- For manual uploads: a simple CLI `node scripts/article/set-tiktok-url.mjs --slug <slug> --url <url>`

### Frontend Changes

**`src/routes/posts.$slug.tsx`:**
- Remove `<video>` rendering from attachments section
- Add TikTok embed component: if `post.tiktok_url` exists, render TikTok blockquote + load embed.js
- Extract video ID from URL (regex: `tiktok.com/.*/video/(\d+)`)
- Load `https://www.tiktok.com/embed.js` async (once per page)

**Potential component:** `src/components/tiktok-embed.tsx`

---

## Suggested Approach

1. **DB migration** — Add `tiktok_url TEXT` column to posts table
2. **Frontend** — Create `TikTokEmbed` component, update `posts.$slug.tsx` to use it
3. **Script** — Create `scripts/article/set-tiktok-url.mjs` for setting TikTok URL on a post
4. **Pipeline doc** — Update `docs/content-pipeline.md` Stage 5: remove MP4 upload step, add TikTok URL save step
5. **Cleanup** — Remove or deprecate MP4 attachment upload for video files (keep for non-video attachments like PDFs)

---

## Suggested Skills

- `grill-with-docs` — Grill the approach (especially: should we keep MP4 upload as fallback? What if TikTok video is deleted? SSR considerations for embed.js?)
- `to-spec` — Write spec for the feature
- `to-tickets` — Break into tickets
- `tdd` — Test the URL extraction + embed rendering
- `implement` — Implement

---

## Key Files

| File | Role |
|------|------|
| `src/routes/posts.$slug.tsx` | Article page — currently renders `<video>` from attachments |
| `docs/content-pipeline.md` | Pipeline doc — Stage 5a uploads MP4, needs update |
| `scripts/article/publish-article.mjs` | Article publish script (Stage 2, no change needed) |
| `scripts/short-video/publish-tiktok.mjs` | TikTok publish script — needs to save video URL after publish |
| `supabase/migrations/` | DB migrations — needs new migration for `tiktok_url` column |
| `src/integrations/supabase/types.ts` | Supabase types — will need regeneration after migration |

---

## Uncommitted State

Local working tree has non-session changes (not committed by this agent):
- `src/integrations/supabase/types.ts` — modified
- `src/routes/posts.$slug.tsx` — modified
- `src/routes/widgets.$name.tsx` — modified
- `docs/research/digital-human-solutions-m2-pro.md` — modified
- Various untracked assets (latentsync test videos, etc.)

These are from other work (digital human / latentsync experiments). Check with user before including or excluding.

---

## RAG Status (for reference)

- 421 chunks / 63 sources / 0 errors
- eval.mjs: 95% hit rate (19/20), PASS
- All RAG Phase 2 tickets (T-20~T-23) complete
- Spec and tickets archived to `docs/archive/spec-rag.md` and `docs/archive/tickets-rag.md`
- Kimi K3 sandbox content indexed and searchable
