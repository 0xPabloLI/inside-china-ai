# Spec: Video Understanding Pipeline

> Status: Ready for implementation
> Created: 2026-08-25
> Source: Handoff `/tmp/handoff-video-understanding-pipeline.md` + Grilling Round 1

## Problem Statement

Given an arbitrary video URL (TikTok/YouTube/Bilibili), the user wants to "read and learn" the video content — extract the transcript (ASR) and visual understanding (VLM) in a single call, producing a structured JSON output. Currently no unified tool exists; each step (download → audio extraction → ASR → VLM analysis) is manual.

## Solution

A reusable module `scripts/short-video/lib/video-understand.mjs` that orchestrates the full pipeline: URL parsing → video download → audio extraction → whisper.cpp ASR → VLM visual analysis → merged JSON output.

## User Stories

1. As a content creator, I want to pass a TikTok URL and get back the transcript, so that I can study the video's content without watching it
2. As a content creator, I want to pass a YouTube Shorts URL and get back visual analysis, so that I can understand the video's visual structure
3. As a content creator, I want to choose between transcript-only, visual-only, or both, so that I can save time when I only need one
4. As a content creator, I want the output written to a file, so that I can reference it later
5. As a developer, I want to call `understandVideo(url)` as a single function, so that I don't need to orchestrate multiple tools
6. As a developer, I want to call `downloadVideo(url)` independently, so that I can get the raw video file for other uses
7. As a developer, I want to call `transcribeVideo(videoPath)` independently, so that I can transcribe a local video file
8. As a developer, I want graceful degradation when whisper-cli is unavailable, so that I still get visual analysis without transcript
9. As a developer, I want graceful degradation when VLM is unavailable, so that I still get transcript without visual analysis
10. As a developer, I want clear error messages when download fails, so that I can diagnose network/proxy issues
11. As a developer, I want platform auto-detection from the URL, so that I don't need to specify the platform manually
12. As a developer, I want TikTok short URLs to be automatically resolved, so that I can pass `vt.tiktok.com/xxx` directly

## Implementation Decisions

### Module structure

New file: `scripts/short-video/lib/video-understand.mjs`

Three exported functions:

- `downloadVideo(url, options)` → `{ videoPath, platform, videoId, author, title }`
- `transcribeVideo(videoPath, options)` → `{ segments, fullText }` or `null`
- `understandVideo(url, options)` → `{ url, platform, author, title, duration, transcript, visualAnalysis, summary, status }`

### URL parsing & platform detection

- **TikTok short URLs** (`vt.tiktok.com/xxx`): Node `fetch(url, { redirect: 'follow' })` resolves to `tiktok.com/@user/video/ID`. Parse with regex.
- **TikTok full URLs** (`tiktok.com/@user/video/ID`): Direct regex parse.
- **YouTube URLs** (`youtube.com/watch?v=xxx`, `youtu.be/xxx`, `youtube.com/shorts/xxx`): Regex parse.
- **Bilibili URLs** (`bilibili.com/video/BVxxx`): Regex parse.
- Unknown platform → throw `Error('Unsupported platform')`.

### Video download

- **YouTube/Bilibili**: `yt-dlp` with `--cookies-from-browser chrome` (YouTube only) and `--remote-components ejs:github` (YouTube only). Output to `options.outputDir || /tmp`.
- **TikTok**: CDP `item/detail` API approach (verified in `docs/research/reference-video-extraction.md`):
  1. `cdpNewTab(url)` to open TikTok page in browser session
  2. `cdpEval` to call `fetch('/aweme/v1/web/item/detail/?itemId=ID&aid=1988', {credentials:'include'})` → get `playAddr`
  3. `cdpEval` to `fetch(playAddr, {credentials:'include'}).then(r=>r.blob())` → base64 chunks → local file
  4. Video blob is converted to base64 in-browser, chunked at 2MB per `cdpEval` call, reassembled locally
  5. `cdpCloseTab(tabId)` cleanup
- Download failure → throw `Error('Download failed: ...')` (pipeline cannot continue)

### Audio extraction

- `ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 audio.wav`
- Uses ffmpeg-full path: `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`
- 16kHz mono WAV required by whisper.cpp

### ASR transcription

- `whisper-cli -m ~/.cache/whisper/ggml-large-v3-turbo.bin -f audio.wav -t 8 -fa -oj -of output_prefix`
- `-t 8` = 8 threads, `-fa` = flash attention (Metal), `-oj` = JSON output
- Parse whisper JSON: `{ transcription: { segments: [...], fullText: "..." } }`
- whisper-cli not found / fails → `transcript: null` + console warning (degraded mode)

### VLM visual analysis

- Calls `analyzeAssetSemantics(videoPath)` from `visual-analyzer.mjs`
- Returns `{ description, subjects, contentKind, ... }` (existing schema)
- VLM unavailable → returns DEGRADED_RESULT (existing behavior in visual-analyzer.mjs)
- `closeVisualAnalyzer()` called after analysis to clean up subprocess

### Output format

```json
{
  "url": "https://vt.tiktok.com/ZSVAVk4n1",
  "platform": "tiktok",
  "author": "lacedmedia",
  "title": null,
  "duration": null,
  "transcript": {
    "segments": [{ "start": 0.0, "end": 2.5, "text": "..." }],
    "fullText": "..."
  },
  "visualAnalysis": {
    "description": "A person demonstrating video editing techniques...",
    "subjects": ["person", "screen", "editing"],
    "contentKind": "talking_head"
  },
  "summary": null,
  "status": "ok"
}
```

- `status`: `"ok"` (all steps succeeded) | `"degraded"` (some steps skipped) | `"error"` (download failed)
- `summary`: Currently `null` (future: LLM-generated summary combining transcript + visual). Not in scope.
- If `options.outputDir` provided, write JSON to `{outputDir}/{platform}-{videoId}-understanding.json`

### Options interface

```typescript
{
  transcript?: boolean,   // default: true
  visual?: boolean,      // default: true
  outputDir?: string,    // default: '/tmp'
  writeFile?: boolean,   // default: true (when outputDir provided)
}
```

### Constants

```javascript
const WHISPER_CLI = "/opt/homebrew/bin/whisper-cli";
const WHISPER_MODEL = "~/.cache/whisper/ggml-large-v3-turbo.bin";
const FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
const YTDLP = "/opt/homebrew/bin/yt-dlp";
const CDP_BASE = "http://localhost:3456";
```

## Testing Decisions

### Test files

1. **Unit tests**: `scripts/short-video/__tests__/video-understand.test.mjs`
   - Mock `child_process.exec`, `fs`, and `cdp-client.mjs`
   - Test URL parsing, platform detection, whisper output parsing, degradation paths
   - Prior art: `upscale.test.mjs` (mock child_process + fs pattern)

2. **E2e smoke test**: Skip if dependencies (whisper-cli, VLM) not available
   - Prior art: `upscale.e2e.test.mjs` (skip pattern) + `focus-smoke.test.mjs` (real subprocess)

### Test seams

- **URL parsing**: Pure functions `detectPlatform(url)` and `parseVideoId(url, platform)` — testable without I/O
- **Whisper output parsing**: Pure function `parseWhisperOutput(jsonStr)` — testable with fixture data
- **Download orchestration**: Mock `execAsync` and CDP functions
- **Full pipeline**: E2e with real TikTok/YouTube URL (skip if offline)

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

Pure new files — no existing files modified. This section is skipped per scenario-matrix.md rules.

### Section 2: Behavioral Scenarios

| #   | Scenario                                              | Expected Behavior                                                                                | Risk   | Mitigation                                                       |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------- |
| 1   | TikTok short URL (`vt.tiktok.com/xxx`)                | fetch redirect → parse `@user/video/ID` → CDP download                                           | Medium | fetch redirect is network-dependent; fallback: throw clear error |
| 2   | TikTok full URL (`tiktok.com/@user/video/ID`)         | Direct regex parse → CDP download                                                                | Low    | Straightforward regex                                            |
| 3   | YouTube URL (`youtube.com/watch?v=xxx`)               | Regex parse → yt-dlp download with cookies                                                       | Low    | yt-dlp verified working                                          |
| 4   | YouTube Shorts URL (`youtube.com/shorts/xxx`)         | Regex parse → yt-dlp download with `--remote-components ejs:github`                              | Low    | Verified in handoff                                              |
| 5   | Bilibili URL (`bilibili.com/video/BVxxx`)             | Regex parse → yt-dlp download (no cookies)                                                       | Low    | Verified working                                                 |
| 6   | Unknown/unrecognized URL                              | Throw `Error('Unsupported platform: ...')`                                                       | Low    | Clear error message                                              |
| 7   | whisper-cli not found                                 | `transcript: null` + warning, `status: "degraded"`                                               | Low    | Graceful degradation                                             |
| 8   | whisper-cli fails (corrupt audio)                     | `transcript: null` + warning, `status: "degraded"`                                               | Low    | Catch exec error, return null                                    |
| 9   | VLM unavailable (Python/model not found)              | `visualAnalysis: DEGRADED_RESULT` (existing behavior), `status: "degraded"`                      | Low    | Reuses visual-analyzer.mjs degradation                           |
| 10  | CDP proxy not running (TikTok download)               | Throw `Error('CDP proxy not available at localhost:3456')`                                       | Medium | Check `cdpAvailable()` before attempting TikTok download         |
| 11  | TikTok CDP API returns no `playAddr`                  | Throw `Error('TikTok API returned no playAddr')`                                                 | Medium | Check response structure, throw with context                     |
| 12  | Video file > 50MB (large video)                       | Base64 chunking handles arbitrarily large blobs                                                  | Low    | 2MB chunks via cdpEval loop                                      |
| 13  | options = undefined                                   | Use defaults: `{ transcript: true, visual: true, outputDir: '/tmp' }`                            | Low    | Default parameter pattern                                        |
| 14  | options.transcript = false, options.visual = true     | Skip ASR, only run VLM                                                                           | Low    | Conditional execution                                            |
| 15  | options.transcript = true, options.visual = false     | Skip VLM, only run ASR                                                                           | Low    | Conditional execution + skip closeVisualAnalyzer                 |
| 16  | Empty whisper transcript (no speech detected)         | `transcript: { segments: [], fullText: "" }`, `status: "degraded"`                               | Low    | Parse empty JSON, don't crash                                    |
| 17  | Video has no audio track                              | ffmpeg produces empty WAV → whisper returns empty → `transcript: { segments: [], fullText: "" }` | Low    | Handled by scenario 16                                           |
| 18  | outputDir not provided                                | Use `/tmp` as default, still write file                                                          | Low    | Default parameter                                                |
| 19  | writeFile = false                                     | Return JS object only, don't write to disk                                                       | Low    | Conditional write                                                |
| 20  | Cross-step contract: videoPath → ffmpeg input         | Download produces valid MP4 that ffmpeg can read                                                 | Medium | Verify file exists before ffmpeg; throw if missing               |
| 21  | Cross-step contract: audioPath → whisper input        | ffmpeg produces valid 16kHz mono WAV                                                             | Medium | Verify file exists before whisper; return null if missing        |
| 22  | Cross-step contract: whisper JSON → transcript fields | Parse segments array + concatenate fullText                                                      | Low    | Pure function, testable                                          |
| 23  | Both transcript and visual fail                       | `status: "degraded"`, both fields null/degraded, summary null                                    | Low    | Each step independent degradation                                |

## Out of Scope

- LLM-generated summary (combining transcript + visual) — future enhancement
- Douyin video download (CDP API differs from TikTok)
- TikTok metadata extraction (author, title) from CDP API response — optional, best-effort
- Batch video processing (multiple URLs in one call)
- Caching of downloaded videos / transcripts
- whisper.cpp word-level timestamps (use existing text-align.py if needed)
- Video duration extraction via ffprobe (optional, best-effort)

## Further Notes

- **CDP chunk download**: TikTok video blobs (5-10MB) cannot be returned via a single `cdpEval` (CDP has a ~1MB response size limit). Strategy: convert blob to base64 in-browser, then chunk-read via multiple `cdpEval` calls using `blob.slice(offset, offset+chunkSize)` + `FileReader.readAsDataURL`.
- **whisper.cpp JSON format**: `-oj` produces `{ "transcription": [{ "timestamps": { "from": "00:00:00,000", "to": "00:00:02,500" }, "offsets": { "from": 0, "to": 2500 }, "text": "..." }] }`. Needs parsing into `{ segments: [{ start, end, text }], fullText }`.
- **VLM subprocess lifecycle**: `analyzeAssetSemantics()` spawns Python on first call (10-15s cold start). `closeVisualAnalyzer()` must be called after to avoid zombie processes.
- **Firefox vs Chrome cookies**: asset-source-quick-reference.md says Firefox cookies work better. However, handoff doc verified Chrome cookies working with yt-dlp. We use Chrome (`--cookies-from-browser chrome`).
