# Tickets: TikTok Caption Format Fix

Spec: `docs/spec-caption-format-fix.md`

## Ticket A: Delete comment hook templates + simplify pinned comment

- [ ] A1: Write red test: `derivePinnedComment` returns `metadata.commentHook` when set. Scenario #2.
- [ ] A2: Write red test: `derivePinnedComment` returns empty string when no commentHook. Scenario #3.
- [ ] A3: Write red test: `deriveDescription` does NOT contain comment hook. Scenario #4.
- [ ] A4: Delete `COMMENT_HOOK_TEMPLATES`, `extractEntities`, simplify `deriveCommentHook` (just read metadata or return ""), simplify `derivePinnedComment` (read metadata.commentHook or return "").
- [ ] A5: Remove comment hook appending from `deriveDescription`.
- [ ] A6: Verify A1-A3 pass green. Update broken tests.

Depends on: none.

## Ticket B: Hashtag precision (keyEntities only)

- [ ] B1: Write red test: `deriveHashtags` with keyEntities `["bytedance"]` → includes `#bytedance`, does NOT include `#alibaba` even if "alibaba" appears in voiceover. Scenario #5, #6.
- [ ] B2: Write red test: `deriveHashtags` with keyEntities `["doubao"]` → includes `#doubao`. Scenario #7.
- [ ] B3: Add `doubao` → `#doubao`, `feishu`/`lark` → `#feishu` to `ENTITY_HASHTAG_MAP`.
- [ ] B4: Rewrite `deriveHashtags` to use `metadata.keyEntitiesCompanies` array (passed from generate-caption.mjs) instead of full-text voiceover scanning.
- [ ] B5: Update `generate-caption.mjs` to pass `meta.keyEntities.companies` to metadata.
- [ ] B6: Verify B1-B2 pass green. Update broken tests.

Depends on: none.

## Ticket C: Caption format (one-block) + per-content output

- [ ] C1: Write red test: caption text format is `description\n\nhashtags` (no title separator). Scenario #1.
- [ ] C2: Modify `generate-caption.mjs`: merge title into description as first line, output one-block format.
- [ ] C3: Modify `generate-caption.mjs`: write to `output/<contentDir>/tiktok-caption.txt` when `--content` is passed.
- [ ] C4: Verify C1 pass green.

Depends on: Ticket A (description no longer has comment hook), Ticket B (hashtags from keyEntities).

## Ticket D: Add comment hook to doubao-work scene-data

- [ ] D1: Add `metadata.commentHook` to `content/doubao-work/scene-data.mjs` with a meaningful question based on video semantics.
- [ ] D2: Regenerate doubao-work caption, verify one-block format + correct hashtags + pinned comment.

Depends on: Tickets A, B, C.

## Ticket E: Runtime verify + commit

- [ ] E1: Run `npx eslint` on changed files.
- [ ] E2: Run `npx vitest run __tests__/caption-utils.test.mjs`.
- [ ] E3: Regenerate doubao-work caption, manual verify output.
- [ ] E4: Commit + push.

Depends on: Tickets A, B, C, D.
