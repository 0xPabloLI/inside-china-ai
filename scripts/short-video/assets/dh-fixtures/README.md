# Digital Human Test Fixtures

Canonical test materials for all digital human (talking head/body) model evaluations.
Every Kaggle test kernel and local inference script should reference these files
instead of keeping private duplicates.

## Portraits

| File                       | Dimensions | Source                           | Notes                                                                                |
| -------------------------- | ---------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `portrait-face.jpg`        | 827×1063   | WeChat half-body photo (cropped) | Primary test portrait — used by EchoMimicV3, InfiniteTalk, SoulX-FlashHead, LeapTalk |
| `portrait-fullbody.jpg`    | 1080×1920  | D-ID frame extraction            | Vertical full-body frame — used by EchoMimicV3 half-body tests                       |
| `portrait-original-4k.jpg` | 3072×4096  | HUAWEI Pura X Max, 2026-08-18    | Original uncropped photo — downsample before use                                     |
| `portrait-small.jpg`       | 240×308    | Self portrait (small)            | Low-res fallback for quick tests                                                     |

## Audio

| File            | Duration | Format                   | Notes                                    |
| --------------- | -------- | ------------------------ | ---------------------------------------- |
| `audio.wav`     | ~10s     | WAV 16kHz mono PCM       | Primary test audio (InfiniteTalk format) |
| `audio.mp3`     | ~10s     | MP3 44.1kHz mono 192kbps | EchoMimicV3 format                       |
| `audio-10s.mp3` | ~10s     | MP3 44.1kHz mono 128kbps | EchoMimicV3 short clip                   |

## Usage

### Kaggle tests

Run `scripts/kaggle/sync-fixtures.sh` before `kaggle datasets push` to copy
fixtures into each test's `input/` staging directory:

```bash
scripts/kaggle/sync-fixtures.sh
kaggle datasets push -p scripts/kaggle/echomimicv3-test/input/
kaggle datasets push -p scripts/kaggle/infinitetalk-test/input/
```

### Local inference

Reference files directly:

```python
FIXTURES = "scripts/short-video/assets/dh-fixtures"
portrait = f"{FIXTURES}/portrait-face.jpg"
audio = f"{FIXTURES}/audio.wav"
```

## License

Personal test materials (portraits). Not for redistribution.
