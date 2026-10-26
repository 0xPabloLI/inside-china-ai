# Music-Under-Voice Calibration — Why the Default Is −15 dB

> **Layer: L2 (research rationale).** The execution rules live in `skills/short-video-pipeline/SKILL.md` → *TikTok audio* and `docs/content-pipeline.md` → 发布 step 7. This document holds the measurement, the derivation and the sources behind them. Nothing here is an instruction.

## 1. The two scales

The platform's music slider reading and "how far the music sits below the narration" are **different quantities**, and the gap between them is not a constant — it depends on how loud the music track itself is relative to our voice.

The 2026-10-25 publish proved the gap is large enough to matter:

| | |
| --- | --- |
| Slider reading | −20 dB |
| Measured music-below-narration | **−22.2 dB** |

So the slider's own number under-reported the drop by ~2 dB, because the Breaking News (Voxie) bed is ~2 dB quieter than our synthesized narration to begin with. The user heard the result and called it too light.

## 2. Measurement method

The published post's audio was pulled and compared against the local render. This is the method any future calibration should reuse; it needs no new dependency.

1. Download the post's audio: `yt-dlp -f "b" <url>`. **Use `-f "b"`** — `-x` extracts the platform's own sound track, not the mixed audio that actually plays.
2. Cross-correlate against the local render to confirm the same take and find the lag. Measured **corr 0.987, lag 0** — i.e. the post is our render plus the bed, aligned.
3. Take 50 ms RMS percentiles with ffmpeg on both sides.

Readings on the published post:

| Window | Level |
| --- | --- |
| Local render, during narration pauses | −173.7 dB (digital silence) |
| Published, during those same pauses | −38.2 dB (the music alone) |
| Published, during speech | −16.0 dB |
| **Music below narration** | **−22.2 dB** |

The local render's digital silence in the pauses is what makes the subtraction clean: anything present in the published version at those moments is the bed.

## 3. Why −20 dB read as "too light" — comparison against history

Real post audio from the account's earlier videos, same 50 ms RMS method, dynamic range as p90−p02:

| Post | p90−p02 |
| --- | --- |
| Historical #1 | 17.5 dB |
| Historical #2 | 21.5 dB |
| Historical #3 | 18.0 dB |
| **The −20 dB post** | **28.6 dB** |

The post sat **7–10 dB quieter in music than the account's own history** — the user's ear was right, and the account's baseline already encoded the correct range.

## 4. Industry guidance

Source: `musicvivo.com/blog/music-under-voiceover` (fetched 2026-10-25).

| Content type | Music below voice |
| --- | --- |
| General band | 15–25 dB |
| Explainer / documentary ("felt rather than heard") | −20 to −25 dB |
| Talking head | −18 to −22 dB |
| Energetic ad | −12 to −15 dB |

The −22.2 dB result was **inside** the general band but at its quiet end, and inside the documentary range — which is the wrong register for a news channel that wants the bed present.

## 5. Derivation of the current default

`DEFAULT_VOLUME_DB` in `scripts/short-video/tiktok-upload-prep.mjs` was changed **−20 → −15**.

- −20 dB slider ⇒ −22.2 dB measured, so the slider-to-narration offset is about −2.2 dB.
- −15 dB slider ⇒ ≈ −17 dB measured, which lands mid-range in the general band and near the talking-head range.

The script reads the slider back after setting it and aborts if it misses by more than 1 dB. That guards the **control**; it does not measure the mix. See §6.

## 6. Open gap — the constant is still not artifact-calibrated

Nothing in the pipeline measures the actual music-below-narration ratio before publishing. `verify-video.mjs` reports whole-mix loudness (LUFS / true peak), which is a different quantity and cannot see this defect: the −22.2 dB post passed both loudness gates at −16.67 LUFS / TP −1.46.

There are also **two paths with different scales**, and only one has been measured:

| Path | Control | Status |
| --- | --- | --- |
| Platform attach (`tiktok-upload-prep.mjs`) | slider dB, read back | calibrated in §5 |
| Local mix (`mix-bgm.mjs`) | `volume=0.12` (≈ −18.4 dB gain) | **never calibrated against a rendered artifact** |

`mix-bgm.mjs` is inside the 15–25 dB band by arithmetic, but "inside the band by arithmetic" is the same reasoning that produced the −20 dB default the user rejected.

Filed as issue **#950** (BGM 混音无工件级校验).

## 7. Reproduce

```bash
# 1. Pull the published audio (NOT -x)
yt-dlp -f "b" -o /tmp/post-audio "https://www.tiktok.com/@chinaainews/video/<id>"

# 2. Cross-correlate against the local render to confirm the take and lag
#    (ffmpeg + numpy; expect corr > 0.98, lag 0)

# 3. 50 ms RMS percentiles on both sides, then read the narration pauses
ffmpeg -i /tmp/post-audio -af astats=metadata=1:reset=1 -f null - 2>&1 | tail -40
```
