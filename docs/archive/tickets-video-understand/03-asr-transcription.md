# 03 — Audio Extraction & ASR Transcription

**What to build:** Extract audio from a video file (16kHz mono WAV) and transcribe via whisper-cli. Returns transcript segments + full text.

**Blocked by:** 02 — Video Download

**Status:** ready-for-agent

- [x] Export `transcribeVideo(videoPath, options)` → returns `{ segments, fullText }` or `null`
- [x] Audio extraction: `ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 audio.wav`
- [x] ASR: `whisper-cli -m model -f audio.wav -t 8 -fa -oj -of output_prefix`
- [x] Export `parseWhisperOutput(jsonStr)` → pure function returning `{ segments: [{ start, end, text }], fullText }`
- [x] whisper-cli not found → returns `null` + console warning
- [x] whisper-cli fails (corrupt audio) → returns `null` + console warning
- [x] Empty transcript (no speech) → `{ segments: [], fullText: "" }`
- [x] Video has no audio track → ffmpeg produces empty WAV → whisper returns empty
- [x] Unit tests mock execAsync, covering scenarios #7-8, #16-17, #21-22
