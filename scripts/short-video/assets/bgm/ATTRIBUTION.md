# BGM Attribution

All BGM files are either **Creative Commons Attribution 4.0** (CC-BY) or
**royalty-free** (creator explicitly published as "no copyright"). Both are
safe for TikTok — the real gatekeeper is TikTok's Content ID system, which only
flags commercial label music. Small-creator royalty-free/CC-BY tracks are not
in any Content ID database.

## CC-BY Tracks (attribution required)

When publishing videos that use these tracks, include credit in video description:
```
Music: [Track Name] by [Channel Name]
Source: YouTube (Creative Commons Attribution license)
```

| File | Track | Channel | URL | Dur | Instant? |
|------|-------|---------|-----|-----|----------|
| `news-cc-theme01.mp3` | Breaking News Intro Theme 01 | Directory Audio | [link](https://www.youtube.com/watch?v=D0CR08wQxUY) | 62s | ✅ |
| `news-cc-theme02.mp3` | Breaking News Intro Theme 02 | Directory Audio | [link](https://www.youtube.com/watch?v=Wf-jwhL4IKg) | 72s | ✅ |
| `news-cc-theme03.mp3` | Breaking News Intro Theme 03 | Directory Audio | [link](https://www.youtube.com/watch?v=JuLCVVc9FFQ) | 24s | ✅ |
| `news-cc-theme04.mp3` | Breaking News Intro Theme 04 | Directory Audio | [link](https://www.youtube.com/watch?v=m7jWvDWURRc) | 19s | ✅ |
| `news-cc-theme-short.mp3` | News Theme (short) | monviando | [link](https://www.youtube.com/watch?v=SBAblVJdSlA) | 13s | ✅ |
| `news-cc-intro02.mp3` | News Intro Theme 02 | Directory Audio | [link](https://www.youtube.com/watch?v=kKDMkK83FxE) | 15s | ✅ |
| `news-cc-oriental.mp3` | News Intro (oriental motif) | Directory Audio | [link](https://www.youtube.com/watch?v=BQL2mX7RH-0) | 23s | ✅ |
| `news-cc-crime.mp3` | Just A Little Crime | See Music | [link](https://www.youtube.com/watch?v=MWYcQ5kgz9U) | 85s | ✅ |
| `news-cc-blue-loop.mp3` | Blue News Background Loop | Premier Edits | [link](https://www.youtube.com/watch?v=FJ8aOU19teM) | 99s | ✅ |
| `news-cc-headline.mp3` | Headline/Energetic Breaking News | (CC-BY) | [link](https://www.youtube.com/watch?v=Fg8jB6wFmp8) | 26s | ❌ |
| `news-cc-library.mp3` | Copyright Free News Intro | Audio Music Library | [link](https://www.youtube.com/watch?v=SIT82kDYCCE) | 15s | ❌ |

## Royalty-Free Tracks (no attribution required)

| File | Track | URL | Dur | Instant? |
|------|-------|-----|-----|----------|
| `news-rf-intro.mp3` | Intro News | [link](https://www.youtube.com/watch?v=jN0e3gDWYoA) | 81s | ❌ |
| `news-rf-room.mp3` | News Room News | [link](https://www.youtube.com/watch?v=Ny2Dh0Jl5S4) | 95s | ❌ |
| `news-rf-breaking.mp3` | Breaking News Background | [link](https://www.youtube.com/watch?v=7V-quvKJT90) | 93s | ❌ |

## Pipeline Auto-Selection

`lib/bgm.mjs` scans this directory at runtime and filters by:
1. **Instant start** — first 0.5s mean volume > -35dB (audible from frame 1)
2. **News-themed** — filename contains "news", "breaking", or "urgent"
3. **Deterministic pick** — FNV-1a hash(pipelineId) % poolSize

**Current pool: 9 tracks** (all CC-BY, all instant-start, all news-themed).
Tracks marked ❌ are excluded from auto-selection but available via `--bgm-file`.
