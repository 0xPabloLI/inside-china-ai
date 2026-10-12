/**
 * Tests for lib/tts/offline-model-hints.mjs — the missing-weight diagnosis
 * (#394).
 *
 * The 2026-09-27 incident: the HF cache held only part of the wav2vec2
 * alignment snapshot and none of F5's vocos vocoder; with offline mode on,
 * both died with messages that do not tell an operator "the weights are not
 * cached, fetch them once" — whisperx's loader swallows the real cause and
 * reports "could not be found in huggingface or torchaudio", and
 * huggingface_hub reports LocalEntryNotFoundError. The fixtures below are the
 * REAL messages captured on 2026-10-12 (venv `~/.video-tts-env`, offline
 * mode, missing cache — see the #394 delivery record).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ALIGN_OFFLINE_MODELS,
  F5_OFFLINE_MODELS,
  detectOfflineCacheMiss,
  formatOfflineModelHint,
  reportOfflineCacheMiss,
} from "../lib/tts/offline-model-hints.mjs";

// Captured from: HF_HUB_OFFLINE=1 python -c "from vocos_mlx import Vocos;
// Vocos.from_pretrained('lucasnewman/vocos-mel-24khz')" (not cached).
const VOCOS_MISS = `Command failed: source /Users/x/.video-tts-env/bin/activate && HF_HUB_OFFLINE=1 ...
huggingface_hub.errors.OfflineModeIsEnabled: Cannot reach https://huggingface.co/api/models/lucasnewman/vocos-mel-24khz/revision/main: offline mode is enabled. To disable it, please unset the \`HF_HUB_OFFLINE\` environment variable.
The above exception was the direct cause of the following exception:
huggingface_hub.errors.LocalEntryNotFoundError: Cannot find an appropriate cached snapshot folder for the specified revision on the local disk and outgoing traffic has been disabled. To enable repo look-ups and downloads online, set 'HF_HUB_OFFLINE=0' as environment variable.`;

// Captured from: HF_HOME=<empty> HF_HUB_OFFLINE=1 python -c "import whisperx;
// whisperx.load_align_model(...)" — whisperx swallows the transformers error.
const ALIGN_MISS = `Command failed: HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 ~/.video-tts-env/bin/python3 "text-align.py" --manifest ...
ValueError: The chosen align_model "facebook/wav2vec2-large-960h-lv60-self" could not be found in huggingface (https://huggingface.co/models) or torchaudio (https://pytorch.org/audio/stable/pipelines.html#id14)`;

describe("detectOfflineCacheMiss (#394)", () => {
  it("recognizes the huggingface_hub missing-snapshot failure", () => {
    expect(detectOfflineCacheMiss(VOCOS_MISS)).toBe(true);
  });

  it("recognizes the whisperx align-loader failure", () => {
    expect(detectOfflineCacheMiss(ALIGN_MISS)).toBe(true);
  });

  it("does not fire on unrelated failures", () => {
    expect(detectOfflineCacheMiss("Command failed: ffmpeg -i x.mp4")).toBe(false);
    expect(detectOfflineCacheMiss("Error: No F5-MLX results parsed from batch output")).toBe(false);
    expect(detectOfflineCacheMiss("")).toBe(false);
    expect(detectOfflineCacheMiss(undefined)).toBe(false);
  });
});

describe("formatOfflineModelHint (#394)", () => {
  it("names each model with a one-time fetch command", () => {
    const hint = formatOfflineModelHint(["lucasnewman/vocos-mel-24khz"]);
    expect(hint).toContain("Offline HF cache miss");
    expect(hint).toContain("lucasnewman/vocos-mel-24khz");
    expect(hint).toContain("HF_HUB_OFFLINE=0");
    expect(hint).toContain("HF_HUB_DISABLE_XET=1");
    expect(hint).toContain("~/.video-tts-env/bin/python3");
    expect(hint).toContain("snapshot_download('lucasnewman/vocos-mel-24khz')");
  });

  it("emits one fetch command per model", () => {
    const hint = formatOfflineModelHint(F5_OFFLINE_MODELS);
    for (const model of F5_OFFLINE_MODELS) {
      expect(hint).toContain(`snapshot_download('${model}')`);
    }
  });
});

describe("reportOfflineCacheMiss (#394)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints the fetch hint and reports the miss", () => {
    const log = vi.fn();
    const err = Object.assign(new Error(ALIGN_MISS), { stderr: ALIGN_MISS });
    const reported = reportOfflineCacheMiss(err, ALIGN_OFFLINE_MODELS, { log });
    expect(reported).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    const text = String(log.mock.calls[0][0]);
    expect(text).toContain("facebook/wav2vec2-large-960h-lv60-self");
    expect(text).toContain("HF_HUB_OFFLINE=0");
  });

  it("stays silent on unrelated failures", () => {
    const log = vi.fn();
    const reported = reportOfflineCacheMiss(new Error("ffmpeg exploded"), F5_OFFLINE_MODELS, {
      log,
    });
    expect(reported).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  // Measured on the real alignment miss (2026-10-12): every consumer spawns
  // with `2>&1`, so exec's `stderr` is EMPTY and the whisperx ValueError sits
  // in `stdout`. A detector reading only `stderr` stays silent on the exact
  // failure it exists for.
  it("finds the diagnosis in stdout, where `2>&1` puts it", () => {
    const log = vi.fn();
    const err = Object.assign(new Error("Command failed: HF_HUB_OFFLINE=1 ... text-align.py"), {
      stdout: ALIGN_MISS,
      stderr: "",
    });
    expect(reportOfflineCacheMiss(err, ALIGN_OFFLINE_MODELS, { log })).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
