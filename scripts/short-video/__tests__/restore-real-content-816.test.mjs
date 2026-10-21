/**
 * Real-content smoke for #816: leading symbols must survive the dual track.
 *
 * These are the scenes the 2026-10-21 audit found losing a leading "$" or
 * "("; importing the production scene data keeps the regression tied to the
 * actual packs instead of a hand-built fixture.
 */
import { describe, it, expect } from "vitest";
import { normalizeSceneData } from "../lib/normalize-currency.mjs";
import { normalizeTtsText } from "../lib/normalize-tts-text.mjs";
import { restoreTimingTokens } from "../lib/subtitles/restore-tokens.mjs";
import { scenes as sensetimeScenes } from "../content/sensetime-latest/scene-data.mjs";
import { scenes as doubaoScenes } from "../content/doubao-work/scene-data.mjs";
import { scenes as alibabaScenes } from "../content/alibaba-ai-megabet/scene-data.mjs";
import { scenes as unitreeScenes } from "../content/unitree/scene-data.mjs";

const packs = [
  { name: "sensetime-latest", scenes: sensetimeScenes, ids: [1, 2, 3, 7] },
  { name: "doubao-work", scenes: doubaoScenes, ids: [7] },
  { name: "alibaba-ai-megabet", scenes: alibabaScenes, ids: [4, 5] },
  { name: "unitree", scenes: unitreeScenes, ids: [1, 4, 6] },
];

function restoreScene(source) {
  const scene = structuredClone(source);
  const scenes = [scene];
  normalizeSceneData(scenes, {});
  normalizeTtsText(scenes, {});
  const ttsText = scene.ttsText ?? scene.voiceover;
  const words = ttsText
    .split(/\s+/)
    .filter(Boolean)
    .map((text, i) => ({ text, start: i, end: i + 1 }));
  const timing = [
    { sceneId: scene.id, segments: [{ text: ttsText, start: 0, end: words.length, words }] },
  ];
  restoreTimingTokens(timing, scenes);
  return {
    scene,
    restored: timing[0].segments.map((segment) => segment.text).join(" "),
  };
}

describe("real content packs keep leading symbols (#816)", () => {
  for (const pack of packs) {
    for (const id of pack.ids) {
      it(`${pack.name} scene ${id} round-trips its display line`, () => {
        const source = pack.scenes.find((scene) => scene.id === id);
        expect(source, `scene ${id} missing from ${pack.name}`).toBeTruthy();

        const { scene, restored } = restoreScene(source);

        expect(restored).toBe(scene.voiceover);
      });
    }
  }
});
