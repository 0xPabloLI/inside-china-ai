# Git LFS Strategy: Configure Only, Never Migrate History

## Context

The repository contains binary media assets (MP4 videos, MP3 audio, WAV files, PNG/JPG images) that are large and change frequently. Without Git LFS, these files bloat the repository history, making clones slow and pushing expensive.

The project is connected to **Lovable** (via `origin/main`), which means:
- The branch is a Lovable-connected branch
- **Force pushing is prohibited** — it rewrites history on Lovable's side and the user loses project history
- Any operation that rewrites commit hashes (`git lfs migrate import`, `git filter-repo`) is dangerous

## Decision

**Add `.gitattributes` to track new binary files via Git LFS, but never migrate existing history.**

### Configuration

`.gitattributes` tracks:
- Video: `*.mp4`, `*.webm`, `*.mov`
- Audio: `*.mp3`, `*.wav`, `*.flac`, `*.ogg`, `*.m4a`
- Images: `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.bmp`
- **SVG excluded** — text-based XML, kept in regular Git for diffability

### Migration approach

- **New files** added after `.gitattributes` is committed → automatically tracked by LFS ✅
- **Existing files** committed before `.gitattributes` → remain in regular Git (not converted) ✅
- **No `git lfs migrate import`** — this command rewrites all commit hashes, creating a divergence from Lovable's history

## Why not alternatives

### `git lfs migrate import` (full history rewrite)
- **Pros:** Converts all historical binary files to LFS, reducing repo size immediately.
- **Cons:** Rewrites every commit hash. Creates a completely new history that diverges from Lovable's side. Force push required, which is **prohibited** on Lovable-connected branches.
- **Decision:** Explicitly rejected. The AGENTS.md top-level rule states: "Avoid rewriting published git history — force pushing, or rebasing/amending/squashing commits that are already pushed."

### `git filter-repo` (partial history rewrite)
- **Pros:** More surgical than `migrate import` — can target specific files or paths.
- **Cons:** Still rewrites commit hashes for affected commits. Same force-push prohibition applies.
- **Decision:** Rejected for the same reason. Used only once (2026-08-15) for security cleanup (removing Lightning AI API key from history) — that was a necessary security operation with explicit user confirmation.

### No LFS at all
- **Pros:** Simpler setup, no LFS dependency.
- **Cons:** Binary files bloat the repo. A single 60s MP4 can be 5-20MB. 20+ videos = 100-400MB in Git history. Clones become slow. GitHub has a 100MB file size limit.
- **Decision:** Rejected. LFS is necessary for binary-heavy content repository.

## Trade-offs

| Aspect | Configure-only | Migrate history |
|--------|---------------|-----------------|
| **New files** | ✅ LFS-tracked | ✅ LFS-tracked |
| **Old files** | ❌ In regular Git (bloat) | ✅ Converted to LFS |
| **History rewrite** | ✅ No rewrite | ❌ All hashes changed |
| **Lovable compatibility** | ✅ Safe | ❌ Breaks connection |
| **Repo size** | Gradually improves (new files) | Immediately improves |
| **Force push** | Not needed | Required (prohibited) |

### Acceptance of trade-off
The repository accepts that pre-LFS binary files remain in regular Git history. The repo size is larger than ideal, but:
- The repo is private (not a public clone target)
- Push/pull performance is acceptable for the team size (1 developer + agents)
- New content (videos, audio, images) is LFS-tracked, so the bloat does not grow

## Consequences

- `.gitattributes` committed at repo root (commit `513e546`, 2026-08-14).
- **Pre-commit hook** (`scripts/verify-lfs-pointers.mjs`) verifies that staged binary files with LFS attributes are valid LFS pointers. Runs automatically on commit.
- Git LFS must be installed locally (`git lfs install`).
- GitHub LFS storage: free tier includes 1GB storage + 1GB bandwidth/month. Paid packs available if exceeded.
- `git check-attr` shows JPG/MP3/etc. as LFS, SVG as non-LFS.
- Future binary files are automatically LFS-tracked. No manual intervention needed.
- The `git lfs migrate import` command should never be run on this repository while it is connected to Lovable.
- If Lovable connection is severed in the future (project migration), history rewrite becomes possible — but should still be evaluated carefully.
