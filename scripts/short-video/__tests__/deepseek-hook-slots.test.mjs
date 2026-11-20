/**
 * Regression: `content/deepseek` scene 1 carried the legacy
 * `subtitle` / `subtitleHighlight` pair, which HookScene never reads — the
 * "FUNDING ROUND / PAUSED" line only exists under `numberLabel` /
 * `numberHighlight`. The render-layer contract rejects those keys, so the pack
 * could not pass preflight at all (#1460).
 *
 * This pins the migrated pack against the same gate the renderer runs.
 */
import { describe, it, expect } from "vitest";
import { scenes } from "../content/deepseek/scene-data.mjs";
import {
  REMOTION_SLOT_MAP,
  assertKnownTextFields,
  resolveRenderLayout,
} from "../lib/text-slots.mjs";

describe("deepseek scene 1 hook slots", () => {
  const hookScene = scenes.find((scene) => scene.id === 1);

  it("declares the label under the slots HookScene renders", () => {
    expect(hookScene.texts.numberLabel).toBe("FUNDING ROUND PAUSED");
    expect(hookScene.texts.numberHighlight).toBe("PAUSED");
    expect(hookScene.texts).not.toHaveProperty("subtitle");
    expect(hookScene.texts).not.toHaveProperty("subtitleHighlight");
  });

  it("passes the template contract for every scene the slot map covers", () => {
    for (const scene of scenes) {
      if (!REMOTION_SLOT_MAP[scene.visualType]) continue;
      expect(() =>
        assertKnownTextFields(scene.visualType, resolveRenderLayout(scene), scene.texts),
      ).not.toThrow();
    }
  });
});
