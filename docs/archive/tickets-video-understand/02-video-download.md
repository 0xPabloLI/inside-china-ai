# 02 — Video Download (YouTube + Bilibili + TikTok)

**What to build:** Download a video file from YouTube/Bilibili via yt-dlp, and from TikTok via CDP `item/detail` API. Returns the local file path.

**Blocked by:** 01 — URL Platform Detection & Parsing

**Status:** ready-for-agent

- [x] Export `downloadVideo(url, options)` → returns `{ videoPath, platform, videoId, author }`
- [x] YouTube: `yt-dlp --cookies-from-browser chrome --remote-components ejs:github -o output %template%`
- [x] Bilibili: `yt-dlp -o output %template%` (no cookies)
- [x] TikTok: CDP `cdpNewTab` → `cdpEval` fetch `/aweme/v1/web/item/detail/` → get `playAddr` → base64 chunk download → write file
- [x] TikTok CDP: check CDP proxy availability first, throw clear error if unavailable
- [x] TikTok CDP: handle missing `playAddr` in API response
- [x] Download failure → throws `Error('Download failed: ...')`
- [x] Output to `options.outputDir || '/tmp'`
- [x] Unit tests mock execAsync + cdp-client, covering scenarios #3-5, #10-12, #20
