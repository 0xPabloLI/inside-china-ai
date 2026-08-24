# 01 — URL Platform Detection & Parsing

**What to build:** Given a video URL (TikTok short/full, YouTube, Bilibili), detect the platform and extract video ID + author. TikTok short URLs are resolved via Node fetch redirect following.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Export `detectPlatform(url)` → returns `"tiktok" | "youtube" | "bilibili"`
- [x] Export `parseVideoMeta(url, platform)` → returns `{ platform, videoId, author, title }`
- [x] TikTok short URL (`vt.tiktok.com/xxx`) resolved via `fetch(url, { redirect: 'follow' })`
- [x] TikTok full URL parsed via regex: `tiktok.com/@(\w+)/video/(\d+)`
- [x] YouTube URLs parsed: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`
- [x] Bilibili URLs parsed: `bilibili.com/video/(BV\w+)`
- [x] Unknown platform → throws `Error('Unsupported platform: ...')`
- [x] Unit tests covering scenarios #1-6, #13 (undefined options)
