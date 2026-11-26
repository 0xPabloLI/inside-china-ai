import { renderStill } from "./remotion-still.mjs";
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Render-layer integration tests for FixedCollisionAssert (#1561).
 *
 * The gate lives in the real composition around every scene; these tests drive
 * it through the still runtime with two opted-in boxes, proving:
 *   - disjoint boxes render clean;
 *   - a partial intersection cancels the render with a structured
 *     `[FixedCollisionError]` payload naming the pair and both boxes.
 */
const GATE_TIMEOUT = 300_000;
const ENTRY = "src/collision-gate-fixture.tsx";
const COMPOSITION = "CollisionGateFixture";

/**
 * Pull the first balanced JSON object after the marker.
 *
 * Remotion mirrors the error onto stderr, so the same message can appear twice
 * on one line; a greedy `.*` then swallows the second copy and JSON.parse fails
 * at its first byte. Walk braces instead of trusting a regex to stop.
 */
function extractPayload(text) {
  const marker = "[FixedCollisionError] ";
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const open = text.indexOf("{", start + marker.length);
  if (open < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(open, i + 1));
    }
  }
  return null;
}

async function renderFixture(props, frame = 45) {
  const out = join(mkdtempSync(join(tmpdir(), "t1561-gate-")), "still.png");
  try {
    await renderStill({
      entry: ENTRY,
      composition: COMPOSITION,
      output: out,
      props,
      frame,
      timeout: 240_000,
    });
    return { ok: true, payload: null };
  } catch (err) {
    const text = `${err.stdout ?? ""}${err.stderr ?? ""}${err.message ?? ""}`;
    return { ok: false, payload: extractPayload(text), raw: text };
  }
}

describe("FixedCollisionAssert", () => {
  it(
    "passes when the fixed boxes are disjoint",
    async () => {
      const result = await renderFixture({ overlap: false });
      expect(result.ok).toBe(true);
    },
    GATE_TIMEOUT,
  );

  it(
    "fails with the intersecting pair and its geometry",
    async () => {
      const result = await renderFixture({ overlap: true });
      expect(result.ok).toBe(false);
      expect(result.payload).not.toBeNull();
      expect(result.payload.sceneId).toBe("collision-fixture");
      expect(result.payload.collisions).toHaveLength(1);
      expect(result.payload.collisions[0].a).toBe("fixture.a");
      expect(result.payload.collisions[0].b).toBe("fixture.b");
      expect(result.payload.collisions[0].width).toBeGreaterThan(0);
      expect(result.payload.collisions[0].height).toBeGreaterThan(0);
    },
    GATE_TIMEOUT,
  );
});
