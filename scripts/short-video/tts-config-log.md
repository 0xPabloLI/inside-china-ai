# TTS Configuration Log

# Tracks each TTS run's configuration for voice quality comparison.

# Format: Date | Engine | Speaker | Speed | Duration | Notes

## 2026-07-31 Session

| Date             | Engine  | Speaker          | Speed | Total Duration | Device | Notes                                               |
| ---------------- | ------- | ---------------- | ----- | -------------- | ------ | --------------------------------------------------- |
| 2026-07-31 12:02 | Kokoro  | am_michael       | 1.1   | 156.9s         | CPU    | ✅ User approved voice quality. Authoritative male. |
| 2026-07-31 22:32 | XTTS v2 | Ana Florence (F) | 1.0   | 186.5s         | CPU    | ❌ User said "更机械了", female voice, too slow     |
| 2026-07-31 22:32 | XTTS v2 | Craig Gutsy (M)  | 1.15  | TBD            | CPU    | Pending test — should match Kokoro pace             |

## XTTS v2 Available Speakers (59 total)

### Male voices (recommended for news briefing)

- Craig Gutsy — authoritative, clear
- Damien Black — dark, dramatic
- Aaron Dreschner — professional, clean
- Andrew Chipper — warm, friendly
- Craig Gutsy — strong, confident
- Dionisio Schuyler — deep, resonant
- Viktor Eka — neutral, steady
- Badr Odhiambo — warm, rich

### Female voices

- Ana Florence — soft, female (DEFAULT — not suitable for our briefing style)
- Alison Dietlinde — clear, professional
- Brenda Stern — strong, confident

## Kokoro Available Voices (54 total)

### Recommended

- am_michael — authoritative male (CURRENT DEFAULT)
- am_eric — standard, natural male
- bm_george — British, authoritative
- af_heart — warm female

## Decision Log

- 2026-07-31: User preferred Kokoro am_michael over XTTS Ana Florence. XTTS Craig Gutsy pending test.
- MPS mode crashes HiFi-GAN decoder on PyTorch 2.5.1; PyTorch 2.13.0 breaks model loading (weights_only).
