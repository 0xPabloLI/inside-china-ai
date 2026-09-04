# Audio Drift Fix — Gapless Continuous Audio Track

> Research report: root cause analysis, fix implementation, and sync verification for audio drift in assembled pipeline videos.
>
> Referenced by: `docs/video-workflow.md` → Pipeline Steps → Gapless Audio Track

## Problem

The final video's audio must be ONE continuous track. Two successive bugs caused audio drift:

### Bug 1: AAC Encoder Priming (superseded)

FFmpeg concat with `-c copy` caused ~46ms/scene cumulative drift from AAC encoder delay. Fixed at the time by re-encoding audio during concat (`-c:v copy -c:a aac`). Now superseded — per-scene audio streams no longer exist, so there is nothing to prime.

### Bug 2: Timestamp Gaps from Padding (Drift Fix v2)

The earlier fix removed AAC priming drift, but concat still expressed each scene's ~0.5s padding as timestamp _gaps_ instead of real silence samples. The container played correctly, yet any decode→re-encode downstream (QuickTime, TikTok ingest, `ffmpeg` WAV extraction) compacted those gaps — audio ran ~0.5s/scene ahead of subtitles (~5s by scene 11).

## Fix

**Implementation**: `assemble.mjs` + `lib/audio/track.mjs`

1. Scene clips are encoded video-only (`-an`)
2. Every scene voiceover is padded with real silence to its frame-aligned clip length
3. Voiceovers are concatenated into `voiceover.wav` — a PCM master whose sample count equals the video's
4. The final mux encodes audio exactly once (`-c:v copy -c:a aac -b:a 192k`)

No timestamp gaps exist, so there is nothing for downstream transcoders to compact. The optional BGM pass re-encodes the already-continuous track — a constant whole-file offset, never per-scene drift.

## End-to-End Sync Verification

**Implementation**: `lib/audio/sync.mjs` (wired into Step 6)

Each scene's voiceover is cross-correlated (FFT) against the SHIPPED video's audio track. A measured onset >80ms from its timeline offset is FAIL-class. This verifies the artifact itself, not the plans that produced it.

| Condition                           | Class       |
| ----------------------------------- | ----------- |
| Scene audio missing                 | Skip (WARN) |
| Scene audio present but undecodable | FAIL        |
| Final track undecodable             | FAIL        |

## Failure Diagnostics

**Implementation**: `lib/audio/diagnostics.mjs`

When verification FAILs with an output-dir, the pipeline also drops `output/{id}/diagnostics/{timestamp}/` — a self-contained bundle for fixing the source:

| File                       | Content                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `summary.txt`              | Why it failed, per-scene drift table, packet gaps, stream durations, collection errors |
| `drift.json`               | Machine-readable per-scene drift data                                                  |
| `packet-gaps.json`         | Packet gap analysis                                                                    |
| `streams.json`             | Stream duration information                                                            |
| `verification-report.json` | Copy of the verification report                                                        |

The path is printed as `📦 Diagnostics bundle: <path>` right after the FAIL line.

**Contract**: best-effort (never throws; a bundle failure must not mask the exit code). PASS runs write zero bytes — the bundle only exists on failure.
