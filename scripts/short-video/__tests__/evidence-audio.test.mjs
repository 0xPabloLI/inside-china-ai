/**
 * #1560 — evidence source audio: the content default, not just the capability.
 *
 * #1525 shipped the window + duck fields, and the first two packs that used
 * them carried a hand-written window. The next packs wrote `volume: 0` and
 * nothing noticed: their source clips carry AAC tracks, the rendered films are
 * silent in those scenes, and every gate passed. These tests pin the three
 * pieces that close that gap:
 *
 *   - a declared default (`audioMode: "source"`) that materialises a 0–3s
 *     source window, full source level, and narration ducking;
 *   - an explicit opt-out (`audioMode: "silent-by-design"`) that keeps the
 *     0-gain cut and is the only way to stay silent;
 *   - a preflight finding for the legacy `volume: 0` + real audio track case,
 *     which the render default would otherwise override silently.
 *
 * The probe is injected, so no test touches ffprobe or the network.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_DUCK_LEVEL,
  DEFAULT_SOURCE_AUDIO_FADE_SEC,
  DEFAULT_SOURCE_AUDIO_WINDOW_SEC,
  applyEvidenceAudioDefaults,
  checkEvidenceSourceAudio,
  evidenceAudioPolicy,
} from "../lib/evidence-audio.mjs";

const scene = (media, over = {}) => ({
  id: 3,
  visualType: "narrative",
  layout: "media-first",
  mediaRole: "evidence",
  media: { type: "video", path: "assets/demo.mp4", ...media },
  ...over,
});

const videoScene = (media, over) => scene(media, over);

describe("evidence audio policy (#1560)", () => {
  it("applies to an evidence video and defaults to source", () => {
    const policy = evidenceAudioPolicy(videoScene({}));
    expect(policy.applies).toBe(true);
    expect(policy.mode).toBe("source");
    expect(policy.valid).toBe(true);
  });

  it("does not apply to an evidence image, a background video, or a pack without media", () => {
    expect(evidenceAudioPolicy(scene({ type: "image" })).applies).toBe(false);
    expect(evidenceAudioPolicy(videoScene({}, { mediaRole: "background" })).applies).toBe(false);
    expect(evidenceAudioPolicy({ id: 1, media: null }).applies).toBe(false);
  });

  it("honours silent-by-design and rejects an unknown mode", () => {
    expect(evidenceAudioPolicy(videoScene({ audioMode: "silent-by-design" })).mode).toBe(
      "silent-by-design",
    );
    const bad = evidenceAudioPolicy(videoScene({ audioMode: "muted" }));
    expect(bad.valid).toBe(false);
    expect(bad.mode).toBe(null);
  });
});

describe("evidence audio defaults (#1560)", () => {
  it("gives a silent evidence video full source level and a 0–3s window", () => {
    const rendered = applyEvidenceAudioDefaults(videoScene({ volume: 0 }));
    expect(rendered.media.volume).toBe(1);
    expect(rendered.media.audioIn).toBe(0);
    expect(rendered.media.audioOut).toBe(DEFAULT_SOURCE_AUDIO_WINDOW_SEC);
    expect(rendered.media.audioFadeIn).toBe(DEFAULT_SOURCE_AUDIO_FADE_SEC);
    expect(rendered.media.audioFadeOut).toBe(DEFAULT_SOURCE_AUDIO_FADE_SEC);
    expect(rendered.media.duckUnderNarration).toBe(true);
    expect(rendered.media.duckLevel).toBe(DEFAULT_DUCK_LEVEL);
  });

  it("leaves an authored window and gain alone", () => {
    const rendered = applyEvidenceAudioDefaults(
      videoScene({ volume: 0.6, audioIn: 1.2, audioOut: 4, audioFadeIn: 0.1, audioFadeOut: 0.2 }),
    );
    expect(rendered.media.volume).toBe(0.6);
    expect(rendered.media.audioIn).toBe(1.2);
    expect(rendered.media.audioOut).toBe(4);
    expect(rendered.media.audioFadeIn).toBe(0.1);
    expect(rendered.media.audioFadeOut).toBe(0.2);
    expect(rendered.media.duckUnderNarration).toBe(true);
  });

  it("keeps source level when the author omitted volume", () => {
    expect(applyEvidenceAudioDefaults(videoScene({})).media.volume).toBe(1);
  });

  it("hard-mutes a silent-by-design scene and drops any window", () => {
    const rendered = applyEvidenceAudioDefaults(
      videoScene({ audioMode: "silent-by-design", volume: 0, audioIn: 1, audioOut: 2 }),
    );
    expect(rendered.media.volume).toBe(0);
    expect(rendered.media.audioIn).toBeUndefined();
    expect(rendered.media.audioOut).toBeUndefined();
  });

  it("does not touch a non-evidence video (legacy 0.08 default stays)", () => {
    const original = videoScene({ volume: 0 }, { mediaRole: "background" });
    expect(applyEvidenceAudioDefaults(original)).toBe(original);
  });

  it("respects an explicit duck opt-out", () => {
    const rendered = applyEvidenceAudioDefaults(videoScene({ duckUnderNarration: false }));
    expect(rendered.media.duckUnderNarration).toBe(false);
  });
});

describe("evidence source audio preflight (#1560)", () => {
  const probeWithAudio = () => ({ hasAudio: true });
  const probeSilent = () => ({ hasAudio: false });
  const rows = (scenes, probe = probeWithAudio) =>
    checkEvidenceSourceAudio({
      scenes,
      contentDirAbs: "/tmp/pack",
      fileExists: () => true,
      probeMedia: probe,
    }).rows;

  it("warns when a real audio track is muted by volume: 0", () => {
    const found = rows([videoScene({ volume: 0 })]);
    expect(found).toHaveLength(1);
    expect(found[0].level).toBe("warn");
    expect(found[0].detail).toContain("audio track");
    expect(found[0].fix).toContain("silent-by-design");
  });

  it("passes silent-by-design as an explicit decision", () => {
    const found = rows([videoScene({ audioMode: "silent-by-design", volume: 0 })]);
    expect(found.map((r) => r.level)).toEqual(["pass"]);
  });

  it("says nothing about a source with no audio track", () => {
    expect(rows([videoScene({ volume: 0 })], probeSilent)).toHaveLength(0);
  });

  it("does not duplicate the final media gate on a missing file", () => {
    const found = checkEvidenceSourceAudio({
      scenes: [videoScene({ volume: 0 })],
      contentDirAbs: "/tmp/pack",
      fileExists: () => false,
      probeMedia: probeWithAudio,
    }).rows;
    expect(found).toHaveLength(0);
  });

  it("passes a source scene that already carries a window", () => {
    const found = rows([videoScene({ volume: 1, audioIn: 0.4, audioOut: 5.4 })]);
    expect(found.map((r) => r.level)).toEqual(["pass"]);
  });
});
