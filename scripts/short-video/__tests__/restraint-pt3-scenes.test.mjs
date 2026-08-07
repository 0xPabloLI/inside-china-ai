import { describe, it, expect } from "vitest";
import { generateScene } from "../content/restraint/pt3/scenes.mjs";
import { scenes } from "../content/restraint/pt3/scene-data.mjs";

// Direction-stamp icons must be inline, not stacked above the text —
// the same fix applied to the standard CTA end card (commit 4ca1cfe).
// Status stamps (✓) keep the stacked icon-above-text badge pattern.
describe("Restraint pt3 direction stamps", () => {
  it("scene 4 next-stamp keeps the status ✓ badge stacked (icon-above-text)", () => {
    const s4 = scenes.find((s) => s.id === 4);
    const html = generateScene(s4, 10);
    expect(html).toMatch(/class="stamp-icon">✓<\/div>/);
  });

  it("scene 4 next-stamp has the arrow inline after the text", () => {
    const s4 = scenes.find((s) => s.id === 4);
    const html = generateScene(s4, 10);
    expect(html).toContain("CONTINUOUS LEARNING →");
    // Exactly one stacked icon remains (the ✓ status badge), no arrow stack
    expect(html.match(/class="stamp-icon"/g) ?? []).toHaveLength(1);
  });

  it("scene 8 result-stamp has the arrow inline after the text", () => {
    const s8 = scenes.find((s) => s.id === 8);
    const html = generateScene(s8, 10);
    expect(html).toContain("WON ANYWAY →");
    expect(html).not.toContain('class="stamp-icon"');
  });
});
