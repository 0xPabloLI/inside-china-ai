# Tickets: TikTok Embed + Pipeline Cleanup

> Created: 2026-08-10
> Spec: docs/spec-tiktok-embed.md

## T-1: DB Migration — Add tiktok_url column

**Status**: pending
**Depends on**: none
**Blocks**: T-2, T-3, T-4, T-5

Create migration `supabase/migrations/20260810120000_add_tiktok_url.sql`:

- `ALTER TABLE public.posts ADD COLUMN tiktok_url TEXT;`
- No RLS changes (inherits existing posts policies)

Update `src/integrations/supabase/types.ts`:

- posts Row: add `tiktok_url: string | null`
- posts Insert: add `tiktok_url?: string | null`
- posts Update: add `tiktok_url?: string | null`

**Test**: N/A (migration is DDL, types are manual)

---

## T-2: TikTokEmbed Component + URL extraction

**Status**: pending
**Depends on**: T-1 (types not strictly needed, but logically after)
**Blocks**: T-3

Create `src/components/tiktok-embed.tsx`:

- `extractTikTokVideoId(url: string): string | null` — regex `tiktok.com\/[^/]+\/video\/(\d+)`
- `TikTokEmbed({ url }: { url: string })` — renders blockquote or fallback link
- blockquote: `className="tiktok-embed"`, `cite={url}`, `data-video-id={videoId}`, style `max-width: 880px; min-width: 288px;`
- fallback: `<section>` with "Watch on TikTok →" link to `url`

**Test scenarios** (from matrix rows 3, 4, 5):

- Valid URL → blockquote with correct data-video-id
- URL with query params → still extracts ID
- Non-TikTok URL → fallback link only
- Empty string → fallback link only (or render nothing)

---

## T-3: Article Page — Replace video with TikTok embed

**Status**: pending
**Depends on**: T-1, T-2
**Blocks**: T-6

Modify `src/routes/posts.$slug.tsx`:

- Delete: `isVideo()` function, `hasVideo`/`hasNonVideo` logic, `<video>` rendering, Download button for videos
- `AttachmentList`: title always "Attachments", only render non-video files
- Add: `{post.tiktok_url?.trim() ? <TikTokEmbed url={post.tiktok_url} /> : null}` before or after AttachmentList
- `head()`: conditionally push `{ src: "https://www.tiktok.com/embed.js", async: true }` to scripts when `loaderData.tiktok_url` exists
- Import `TikTokEmbed` from `@/components/tiktok-embed`

Modify `src/lib/posts.functions.ts`:

- `getPublishedPost`: add `tiktok_url` to select string

**Test scenarios** (from matrix rows 1, 2, 7, 8, 9, 10, 19, 20):

- tiktok_url null → no embed section, no embed.js in scripts
- tiktok_url valid → embed renders, embed.js in scripts
- tiktok_url + attachments → both render
- old video attachments → not rendered as video

---

## T-4: Post Editor — Add tiktok_url field

**Status**: pending
**Depends on**: T-1
**Blocks**: T-6

Modify `src/components/post-editor.tsx`:

- `PostForm` type: add `tiktokUrl: string`
- `initial` prop type: add `tiktok_url: string | null`
- Add `useState(initial?.tiktok_url ?? "")` for tiktokUrl
- Add Input field after Excerpt: Label "TikTok URL (optional)", type="url", placeholder
- Pass `tiktokUrl: tiktokUrl.trim()` in onSave

Modify `src/lib/posts.functions.ts`:

- `postInput` zod: add `tiktokUrl: z.string().trim().url().optional().nullable().or(z.literal(""))`
- `savePost` update: add `tiktok_url: data.tiktokUrl || null`
- `savePost` insert: add `tiktok_url: data.tiktokUrl || null`

**Test scenarios** (from matrix rows 11, 12):

- Set URL → save → DB has tiktok_url
- Clear URL → save → DB has null

---

## T-5: publish-tiktok.mjs — Auto-save TikTok URL

**Status**: pending
**Depends on**: T-1
**Blocks**: T-6

Modify `scripts/short-video/publish-tiktok.mjs`:

- Add `--slug <slug>` optional CLI arg
- After publish success (non-draft, has --slug):
  1. Poll `GET /get-post/{postGroupId}` every 30s, up to 5 times
  2. Find entry in `response.posts[]` where `platform === "tiktok"`
  3. If `status === "published"` and `postedId` non-null:
     - Construct URL: `https://www.tiktok.com/@chinaainews/video/{postedId}`
     - PATCH Supabase: `PATCH /rest/v1/posts?slug=eq.{slug}` body `{ tiktok_url: url }` with admin auth
  4. If timeout or postedId null: print warning, continue

Add `buildTikTokUrl(postedId: string): string` to `publish-utils.mjs` (testable pure function).
Add `saveTikTokUrl(slug, url, auth, supabaseUrl, supabaseKey)` to `publish-utils.mjs` or inline.

**Test scenarios** (from matrix rows 13, 14, 15, 16, 17):

- buildTikTokUrl("123") → "https://www.tiktok.com/@chinaainews/video/123"
- Poll returns published + postedId → save called
- Poll timeout → warning printed, no save
- --slug absent → no polling
- Supabase PATCH fails → warning, non-blocking

---

## T-6: Pipeline Docs Update

**Status**: pending
**Depends on**: T-3, T-4, T-5 (all code changes done first)
**Blocks**: none

Modify `docs/content-pipeline.md`:

- Delete "#### 5a. 上传视频 MP4 到文章" section entirely
- Update "发布后验证" section: remove "视频播放器正常显示在「Watch」区域", add "TikTok embed 正常显示"
- Update 检查点总结 table: remove "视频 MP4 上传到文章" row
- Update Stage 5 description: add "→ 保存 TikTok URL 到文章" after TikTok publish

Modify `docs/manual-ops.md`:

- Update "HITL 确认后" references: remove "视频 MP4 上传" from the sequence
- Update "每次发布视频时" section: remove MP4 upload reference

**Test**: N/A (documentation)

---

## Dependency Graph

```
T-1 (migration + types)
├── T-2 (TikTokEmbed component)
│   └── T-3 (article page)
├── T-4 (post editor)
└── T-5 (publish-tiktok.mjs)

T-3, T-4, T-5 → T-6 (docs update, last)
```

## Tracer Bullet Order

1. **T-1** — foundation (DB + types)
2. **T-2** — new component (independently testable)
3. **T-3** — article page (integrates T-2)
4. **T-4** — admin editor (parallel with T-3)
5. **T-5** — publish script (parallel with T-3/T-4)
6. **T-6** — docs (after all code)
