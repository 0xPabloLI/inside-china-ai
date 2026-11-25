import { describe, it, expect } from "vitest";
import { checkHookVisualPriority, runAllSceneDataChecks } from "../lib/scene-rules.mjs";

const hook = (media, id = 1) => ({
  id,
  visualType: "hook",
  layout: "hero-center",
  voiceover: "China's newest factory runs three thousand robots.",
  texts: { bigNumber: "3,000", numberLabel: "ROBOTS" },
  media,
});

const still = (id, path = "assets/hook.jpg") => ({
  id,
  visualType: "narrative",
  layout: "media-bottom-bar",
  voiceover: "The proof is on the line.",
  media: { type: "image", path, source: "official still" },
});

const motion = (id, path = "assets/demo.mp4") => ({
  id,
  visualType: "narrative",
  layout: "media-bottom-bar",
  voiceover: "The demo runs at full speed.",
  media: { type: "video", path, source: "official demo" },
});

const cta = (id = 7) => ({
  id,
  visualType: "cta",
  layout: "cta",
  voiceover: "Follow for the next dispatch.",
});

const hookStill = hook({ type: "image", path: "assets/hook.jpg", source: "official still" });
const hookMotion = {
  ...hook({ type: "video", path: "assets/hook.mp4", source: "official demo" }),
  mediaRole: "evidence",
};

const priorityRow = (rows) => rows.find((row) => row.check === "Hook visual priority");

describe("checkHookVisualPriority", () => {
  it("warns when the hook is a still and motion is only bound from scene 3", () => {
    const rows = checkHookVisualPriority([hookStill, still(2), motion(3), cta()], {});
    const row = priorityRow(rows);
    expect(row.level).toBe("warn");
    expect(row.detail).toContain("scene 3");
    expect(row.fix).toContain("hookVisualPriorityReason");
  });

  it("accepts a later motion clip when the author declares why it cannot open", () => {
    const rows = checkHookVisualPriority([hookStill, still(2), motion(3), cta()], {
      hookVisualPriorityReason: "The demo reveals the payoff; the hook uses its key frame.",
    });
    const row = priorityRow(rows);
    expect(row.level).toBe("pass");
    expect(row.detail).toContain("declared reason");
  });

  it("passes when the hook itself is motion", () => {
    const row = priorityRow(checkHookVisualPriority([hookMotion, still(2), cta()], {}));
    expect(row.level).toBe("pass");
    expect(row.detail).toContain("motion");
  });

  it("passes when motion appears in the first two scenes", () => {
    const row = priorityRow(checkHookVisualPriority([hookStill, motion(2), cta()], {}));
    expect(row.level).toBe("pass");
  });

  it("does not count motion bound to a CTA", () => {
    const row = priorityRow(
      checkHookVisualPriority(
        [
          hookStill,
          still(2),
          { ...cta(), media: { type: "video", path: "assets/cta.mp4", source: "x" } },
        ],
        {},
      ),
    );
    expect(row.level).toBe("pass");
  });

  it("passes when no motion clip exists after scene 2", () => {
    const row = priorityRow(checkHookVisualPriority([hookStill, still(2), cta()], {}));
    expect(row.level).toBe("pass");
  });
});

describe("runAllSceneDataChecks — hook visual priority integration", () => {
  it("reports the priority issue in the editorial bucket, not as a gate failure", () => {
    const results = runAllSceneDataChecks([hookStill, still(2), motion(3), cta()], null, {
      meta: {},
    });
    const row = results.editorial.find((r) => r.check === "Hook visual priority");
    expect(row.level).toBe("advisory");
    expect(row.severity).toBe("warn");
    expect(results.fail.some((r) => r.check === "Hook visual priority")).toBe(false);
  });
});
