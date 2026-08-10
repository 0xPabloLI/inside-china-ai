# BGM Attribution (Creative Commons BY)

All BGM files in this directory are licensed under **Creative Commons Attribution 4.0**
(CC-BY 4.0). This license allows free use, modification, and distribution with
attribution to the original creator.

## Required Attribution

When publishing videos that use these BGM tracks, include the following credit
in the video description or end credits:

```
Music: [Track Name] by [Channel Name]
Source: YouTube (Creative Commons Attribution license)
```

## Track Listing

| File | Track | Channel | YouTube URL | Duration |
|------|-------|---------|-------------|----------|
| `news-cc-theme01.mp3` | Breaking News Intro Music Theme 01 | Directory Audio | https://www.youtube.com/watch?v=D0CR08wQxUY | 62s |
| `news-cc-theme03.mp3` | Breaking News Intro Music Theme 03 | Directory Audio | https://www.youtube.com/watch?v=JuLCVVc9FFQ | 24s |
| `news-cc-theme04.mp3` | Breaking News Intro Music Theme 04 | Directory Audio | https://www.youtube.com/watch?v=m7jWvDWURRc | 19s |
| `news-cc-intro02.mp3` | News Intro Music Theme 02 | Directory Audio | https://www.youtube.com/watch?v=kKDMkK83FxE | 15s |
| `news-cc-oriental.mp3` | News Intro Music Theme (oriental motif) | Directory Audio | https://www.youtube.com/watch?v=BQL2mX7RH-0 | 23s |
| `news-cc-library.mp3` | Copyright Free News Intro Music | Audio Music Library | https://www.youtube.com/watch?v=SIT82kDYCCE | 15s |

## Pipeline Auto-Selection

The pipeline (`lib/bgm.mjs`) automatically filters BGM by:
1. **Instant start** — first 0.5s mean volume > -35dB (audible from frame 1)
2. **News-themed** — filename contains "news", "breaking", or "urgent"
3. **Deterministic pick** — FNV-1a hash of pipelineId → same content always gets same BGM

Tracks that fail the instant-start filter (e.g. `news-cc-library.mp3` at -57dB)
are excluded from the selection pool but retained for manual use via `--bgm-file`.
