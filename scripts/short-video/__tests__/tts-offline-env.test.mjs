/**
 * Tests for lib/tts/offline-env.mjs — the explicit offline-override seam (#394).
 *
 * Why this seam exists: the F5 / CosyVoice3-MLX / forced-alignment spawns
 * hardcoded `HF_HUB_OFFLINE=1` (and `TRANSFORMERS_OFFLINE=1`) into the shell
 * command, so a deliberate model fetch or upgrade could not opt out of
 * offline mode even when the operator exported HF_HUB_OFFLINE=0. The default
 * stays offline (the etag-check hang, runbook §F5-TTS-MLX); only an explicit
 * env value overrides it.
 */
import { describe, it, expect } from "vitest";
import { offlineEnvPrefix } from "../lib/tts/offline-env.mjs";

describe("offlineEnvPrefix (#394)", () => {
  it("defaults to offline when the parent sets nothing", () => {
    expect(offlineEnvPrefix({ env: {} })).toBe("HF_HUB_OFFLINE=1");
  });

  it("honors an explicit HF_HUB_OFFLINE=0 (deliberate fetch)", () => {
    expect(offlineEnvPrefix({ env: { HF_HUB_OFFLINE: "0" } })).toBe("HF_HUB_OFFLINE=0");
  });

  it("keeps an explicit HF_HUB_OFFLINE=1", () => {
    expect(offlineEnvPrefix({ env: { HF_HUB_OFFLINE: "1" } })).toBe("HF_HUB_OFFLINE=1");
  });

  it("adds TRANSFORMERS_OFFLINE=1 for the transformers consumer by default", () => {
    expect(offlineEnvPrefix({ env: {}, transformers: true })).toBe(
      "HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1",
    );
  });

  // transformers 4.57 reads HF_HUB_OFFLINE (transformers/utils/hub.py:81) and
  // huggingface_hub ORs the two vars — a one-flag opt-out must reach both, or
  // the fetch stays blocked (the 2026-09-27 incident's opaque failure).
  it("mirrors an explicit HF_HUB_OFFLINE=0 into TRANSFORMERS_OFFLINE", () => {
    expect(offlineEnvPrefix({ env: { HF_HUB_OFFLINE: "0" }, transformers: true })).toBe(
      "HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0",
    );
  });

  // huggingface_hub ORs the two vars, so a TRANSFORMERS_OFFLINE-only opt-out
  // must reach HF_HUB_OFFLINE too: writing a literal `HF_HUB_OFFLINE=1` beside
  // it would silently re-block the fetch the operator asked for — the exact
  // bug class this seam removes (#394).
  it("lets a TRANSFORMERS_OFFLINE-only opt-out reach HF_HUB_OFFLINE", () => {
    expect(offlineEnvPrefix({ env: { TRANSFORMERS_OFFLINE: "0" }, transformers: true })).toBe(
      "HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0",
    );
  });

  it("keeps offline when TRANSFORMERS_OFFLINE=1 is the only value set", () => {
    expect(offlineEnvPrefix({ env: { TRANSFORMERS_OFFLINE: "1" }, transformers: true })).toBe(
      "HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1",
    );
  });

  // Contradictory values are one decision, resolved the same way every run:
  // HF_HUB_OFFLINE is the documented knob and the one transformers reads.
  it("resolves a contradiction in favor of HF_HUB_OFFLINE", () => {
    expect(
      offlineEnvPrefix({
        env: { HF_HUB_OFFLINE: "0", TRANSFORMERS_OFFLINE: "1" },
        transformers: true,
      }),
    ).toBe("HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0");
    expect(
      offlineEnvPrefix({
        env: { HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "0" },
        transformers: true,
      }),
    ).toBe("HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1");
  });

  it("ignores TRANSFORMERS_OFFLINE for a consumer that does not read it", () => {
    expect(offlineEnvPrefix({ env: { TRANSFORMERS_OFFLINE: "0" } })).toBe("HF_HUB_OFFLINE=1");
  });

  it("reads process.env by default", () => {
    const prev = process.env.HF_HUB_OFFLINE;
    process.env.HF_HUB_OFFLINE = "0";
    try {
      expect(offlineEnvPrefix()).toBe("HF_HUB_OFFLINE=0");
    } finally {
      if (prev === undefined) delete process.env.HF_HUB_OFFLINE;
      else process.env.HF_HUB_OFFLINE = prev;
    }
  });
});
