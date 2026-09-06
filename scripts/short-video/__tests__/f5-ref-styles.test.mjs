/**
 * Tests for #35 (方案 B) per-visualType reference audio infrastructure.
 *
 * resolveRefForScene maps a scene's optional `refStyle` to recorded reference
 * audio (voice-samples/ref-styles/{style}.wav + {style}-ref-text.txt). A style
 * participates only when BOTH files exist — anything else falls back to the
 * default voice sample so a typo'd or unrecorded style can never break a run.
 * buildF5Manifest stamps ref_audio/ref_text ONLY on non-default scenes, so a
 * run without refStyle produces the exact pre-#35 manifest shape.
 */
import { describe, it, expect } from "vitest";
import { resolveRefForScene, buildF5Manifest, REF_AUDIO_MAP } from "../lib/tts/f5-mlx.mjs";

/** Fake filesystem: only the "hook" style files exist. */
function fakeFs() {
  const existing = new Set([
    "/vs/ref-styles/hook.wav",
    "/vs/ref-styles/hook-ref-text.txt",
    "/vs/voice-sample-24k.wav",
  ]);
  return (p) => existing.has(p);
}

const DEFAULT_REF = "/vs/voice-sample-24k.wav";

// Test map with the same shape as REF_AUDIO_MAP but /vs-rooted paths the
// fake filesystem can match (production paths are ROOT_DIR-absolute).
const TEST_MAP = Object.fromEntries(
  ["hook", "narrative", "data", "cta"].map((style) => [
    style,
    {
      audioPath: `/vs/ref-styles/${style}.wav`,
      refTextPath: `/vs/ref-styles/${style}-ref-text.txt`,
    },
  ]),
);

function resolver({ map = TEST_MAP, defaultRef = DEFAULT_REF, exists } = {}) {
  return (scene) => resolveRefForScene(scene, { map, defaultRef, fileExists: exists ?? fakeFs() });
}

describe("resolveRefForScene", () => {
  it("returns the default ref when the scene has no refStyle", () => {
    const r = resolver()({ id: 1, voiceover: "文本" });
    expect(r.style).toBe("default");
    expect(r.audioPath).toBe(DEFAULT_REF);
    expect(r.warning).toBeUndefined();
  });

  it("maps a recorded style to its wav + ref-text pair", () => {
    const r = resolver()({ id: 1, voiceover: "文本", refStyle: "hook" });
    expect(r.style).toBe("hook");
    expect(r.audioPath).toBe("/vs/ref-styles/hook.wav");
    expect(r.refTextPath).toBe("/vs/ref-styles/hook-ref-text.txt");
    expect(r.warning).toBeUndefined();
  });

  it("falls back to default when the style's files are not recorded yet", () => {
    const r = resolver()({ id: 1, voiceover: "文本", refStyle: "narrative" });
    expect(r.style).toBe("default");
    expect(r.audioPath).toBe(DEFAULT_REF);
    expect(r.warning).toMatch(/narrative/);
  });

  it("falls back to default on an unknown refStyle (typo guard)", () => {
    const r = resolver()({ id: 1, voiceover: "文本", refStyle: "hok" });
    expect(r.style).toBe("default");
    expect(r.warning).toMatch(/unknown/i);
  });

  it("exposes the four target styles in REF_AUDIO_MAP", () => {
    expect(Object.keys(REF_AUDIO_MAP).sort()).toEqual(["cta", "data", "hook", "narrative"]);
  });
});

describe("buildF5Manifest", () => {
  const scenes = [
    { id: 1, voiceover: "默认场景" },
    { id: 2, voiceover: "hook 场景", refStyle: "hook" },
    { id: 3, voiceover: "未录制场景", refStyle: "cta" },
  ];

  it("stamps ref_audio + ref_text content only on scenes whose style files exist", () => {
    const resolve = resolver();
    const readText = (p) => (p === "/vs/ref-styles/hook-ref-text.txt" ? "hook 参考文本" : "");
    const manifest = buildF5Manifest(scenes, resolve, readText);
    expect(manifest).toHaveLength(3);
    expect(manifest[0]).toEqual({ sceneId: 1, text: "默认场景", output: "scene-1.wav" });
    expect(manifest[1].ref_audio).toBe("/vs/ref-styles/hook.wav");
    expect(manifest[1].ref_text).toBe("hook 参考文本");
    // cta files don't exist → default → no ref fields
    expect(manifest[2].ref_audio).toBeUndefined();
    expect(manifest[2].ref_text).toBeUndefined();
  });

  it("produces the legacy manifest shape when no scene uses a refStyle", () => {
    const manifest = buildF5Manifest([{ id: 1, voiceover: "默认场景" }], resolver(), () => "");
    expect(manifest).toEqual([{ sceneId: 1, text: "默认场景", output: "scene-1.wav" }]);
    expect(Object.keys(manifest[0])).toEqual(["sceneId", "text", "output"]);
  });
});
