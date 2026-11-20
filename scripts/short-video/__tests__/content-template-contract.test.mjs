/**
 * Content-wide template contract (#1463).
 *
 * `#1461` fixed one pack's dead text keys; a scan then found the same class in
 * ten more packs — fields the current templates never read, so they silently
 * never rendered. Those were removed, and this test freezes the boundary:
 *
 * - every pack except the known structural gaps must pass
 *   `assertKnownTextFields` exactly as the renderer runs it;
 * - the gaps that remain are scenes whose *rendered* fields are missing from
 *   scene-data (copy for the current templates was never written). Fixing
 *   one means rewriting that scene, so the list is explicit and must be
 *   updated deliberately — a new violation anywhere else fails here.
 *
 * The list is compared as a set in both directions: adding a broken scene
 * fails, and quietly fixing one also fails until its entry is removed.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  REMOTION_SLOT_MAP,
  assertKnownTextFields,
  resolveRenderLayout,
} from "../lib/text-slots.mjs";

const CONTENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "content");

/**
 * Scenes that fail because the template renders a field the scene does not
 * define. Each needs its copy rewritten against the current template — a
 * content decision, tracked separately from the dead-key cleanup.
 */
const STRUCTURAL_GAPS = new Set([
  "bytedance-distillation#2", // narrative bottom-bar: person/role/badge, no company/action/result
  "bytedance-distillation#4", // data: number/point1-3, no stat
  "bytedance-distillation#7", // data: chip/vs/gap, no stat
  "distillation/pt3#5", // contrast: no title
  "kimi-sandbox#5", // context: org/verdict/blame, no title
  "kimi-sandbox#6", // data: bigNumber/list/period, no stat
  "kimi-sandbox#7", // narrative bottom-bar: title/items, no company/action/result
  "restraint/pt1#2", // narrative bottom-bar: person/role/badge, no company/action/result
  "restraint/pt1#4", // data: change/reaction/context, no stat
  "restraint/pt1#7", // context: refLabel/person/role, no title
]);

function sceneDataFiles(dir, depth = 0) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory() && depth < 2) files.push(...sceneDataFiles(path, depth + 1));
    else if (entry.name === "scene-data.mjs") files.push(path);
  }
  return files;
}

describe("content template contract", () => {
  it("only the declared structural gaps fail, and no dead text keys remain", async () => {
    const failures = new Set();
    for (const path of sceneDataFiles(CONTENT_ROOT)) {
      const slug = path.slice(CONTENT_ROOT.length + 1).replace(/\/scene-data\.mjs$/, "");
      const { scenes } = await import(pathToFileURL(path).href);
      expect(Array.isArray(scenes), `${slug} exports a scenes array`).toBe(true);
      for (const scene of scenes) {
        if (!REMOTION_SLOT_MAP[scene.visualType]) continue;
        try {
          assertKnownTextFields(scene.visualType, resolveRenderLayout(scene), scene.texts);
        } catch {
          failures.add(`${slug}#${scene.id}`);
        }
      }
    }
    expect([...failures].sort()).toEqual([...STRUCTURAL_GAPS].sort());
  });
});
