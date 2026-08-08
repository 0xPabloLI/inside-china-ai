import { describe, it, expect } from "vitest";
import { generateScene } from "../content/distillation/pt1/scenes.mjs";
import { scenes } from "../content/distillation/pt1/scene-data.mjs";

describe("Distillation pt1 scene generation", () => {
  it("generateScene is a function", () => {
    expect(typeof generateScene).toBe("function");
  });

  it("throws for unknown scene id", () => {
    const fakeScene = { id: 999, texts: {} };
    expect(() => generateScene(fakeScene, 10)).toThrow();
  });

  // Test each scene produces valid HTML
  for (const scene of scenes) {
    describe(`scene ${scene.id} (${scene.name})`, () => {
      const html = generateScene(scene, 10);

      it("returns HTML string", () => {
        expect(typeof html).toBe("string");
        expect(html).toContain("<!DOCTYPE html>");
      });

      it("skips watermark on brand-identity scenes (all scenes carry brandBar)", () => {
        expect(html).not.toMatch(/<div class="brand-watermark">/);
      });

      it("contains baseStyles CSS variables", () => {
        expect(html).toContain("--blue");
        expect(html).toContain("--red");
      });

      it("contains scene container", () => {
        expect(html).toContain('class="scene');
      });

      it("does not contain undefined", () => {
        expect(html).not.toContain("undefined");
      });
    });
  }

  // Scene-specific text verification
  describe("scene 1 (hook) text from scene.texts", () => {
    const scene1 = scenes[0];
    const html = generateScene(scene1, 10);

    it("contains line1 text", () => {
      expect(html).toContain("3 LABS ACCUSED");
    });

    it("contains line2 text", () => {
      expect(html).toContain("16M CONVERSATIONS");
    });

    it("contains alert badge from texts", () => {
      expect(html).toContain("DISTILLATION ALERT");
    });
  });

  describe("scene 2 (what-is-distillation) contrast", () => {
    const scene2 = scenes[1];
    const html = generateScene(scene2, 10);

    it("contains left column items", () => {
      expect(html).toContain("ANSWERS");
      expect(html).toContain("CODE");
      expect(html).toContain("TOOL CALLS");
    });

    it("contains right column items", () => {
      expect(html).toContain("REASONING");
      expect(html).toContain("CHAIN OF THOUGHT");
      expect(html).toContain("PERSONA");
    });

    it("contains title and column titles from texts", () => {
      expect(html).toContain("NOT JUST COPYING ANSWERS");
      expect(html).toContain("SURFACE LEVEL");
      expect(html).toContain("WHAT THEY STOLE");
    });
  });

  describe("scene 3 (how-cracked) timeline", () => {
    const scene3 = scenes[2];
    const html = generateScene(scene3, 10);

    it("contains step labels", () => {
      expect(html).toContain("STEP 1");
      expect(html).toContain("STEP 2");
      expect(html).toContain("STEP 3");
      expect(html).toContain("STEP 4");
    });

    it("contains step texts", () => {
      expect(html).toContain("FORGE BLOB");
      expect(html).toContain("INJECT");
      expect(html).toContain("CLAUDE RECITES CoT");
      expect(html).toContain("CAPTURE");
    });

    it("contains title split and cost line from texts", () => {
      expect(html).toContain('THE <span class="hl">CRACK</span> SEQUENCE');
      expect(html).toContain('Cost: <span class="hl">tens of thousands of dollars</span>');
    });
  });

  describe("scene 4 (anthropic-accusation) data table", () => {
    const scene4 = scenes[3];
    const html = generateScene(scene4, 10);

    it("contains title", () => {
      expect(html).toContain("ANTHROPIC'S ACCUSATION");
    });

    it("contains company names and values", () => {
      expect(html).toContain("DeepSeek");
      expect(html).toContain("150K");
      expect(html).toContain("Moonshot");
      expect(html).toContain("3.4M");
      expect(html).toContain("MiniMax");
      expect(html).toContain("13M");
      expect(html).toContain("24,000");
    });

    it("contains source footer from texts", () => {
      expect(html).toContain("SOURCE: ANTHROPIC · FEBRUARY 2026");
    });
  });

  describe("scene 5 (crypto-blog) quote", () => {
    const scene5 = scenes[4];
    const html = generateScene(scene5, 10);

    it("contains quote text", () => {
      expect(html).toContain("Encrypted reasoning blobs");
    });

    it("contains source attribution", () => {
      expect(html).toContain("Cryptography Engineering Blog");
    });

    it("contains verified badge from texts", () => {
      expect(html).toContain("INDEPENDENTLY CONFIRMED");
    });
  });

  describe("scene 6 (not-named) contrast", () => {
    const scene6 = scenes[5];
    const html = generateScene(scene6, 10);

    it("contains NAMED column", () => {
      expect(html).toContain("NAMED");
      expect(html).toContain("DeepSeek");
      expect(html).toContain("Moonshot");
      expect(html).toContain("MiniMax");
    });

    it("contains NOT NAMED column", () => {
      expect(html).toContain("NOT NAMED");
      expect(html).toContain("Qwen");
      expect(html).toContain("Z.ai");
    });

    it("contains title and note from texts", () => {
      expect(html).toContain("SELECTIVE ACCUSATIONS");
      expect(html).toContain('Moonshot <span class="hl">never responded publicly</span>');
    });
  });

  describe("scene 7 (teaser)", () => {
    const scene7 = scenes[6];
    const html = generateScene(scene7, 10);

    it("contains Part 2 text", () => {
      expect(html).toContain("PART 2 TOMORROW");
    });

    it("contains teaser line", () => {
      expect(html).toContain("ONE LAB CRACKED IT");
    });

    it("contains part label and countdown from texts", () => {
      expect(html).toContain("COMING NEXT");
      expect(html).toContain("SUBSCRIBE TO NOT MISS IT");
    });
  });

  describe("scene 8 (cta — standard end card)", () => {
    const scene8 = scenes[7];
    const html = generateScene(scene8, 10);

    it("contains brand name with brand-blue AI highlight", () => {
      expect(html).toContain('CHINA <span class="hl" style="color: var(--blue);">AI</span> NEWS');
    });

    it("contains uppercase tagline", () => {
      expect(html).toContain("CHINA AI, DECODED");
    });

    it("contains the action in an amber stamp box", () => {
      expect(html).toContain("FOLLOW FOR PART 2");
      expect(html).toContain('class="stamp-box"');
      expect(html).toContain("var(--amber)");
    });

    it("contains fade-to-black", () => {
      expect(html).toContain("fade-to-black");
    });

    it("has no dead-zone subscribe line", () => {
      expect(html).not.toContain('class="subscribe"');
      expect(html).not.toContain("SUBSCRIBE FOR MORE");
    });
  });

  describe("missing texts fields degrade safely", () => {
    it("does not render undefined for missing fields (scene 1)", () => {
      const minimalScene = { id: 1, texts: {} };
      const html = generateScene(minimalScene, 10);
      expect(html).not.toContain("undefined");
    });

    it("does not render undefined for missing fields (scene 3)", () => {
      const minimalScene = { id: 3, texts: {} };
      const html = generateScene(minimalScene, 10);
      expect(html).not.toContain("undefined");
    });

    it("does not render undefined for missing fields (scene 4)", () => {
      const minimalScene = { id: 4, texts: {} };
      const html = generateScene(minimalScene, 10);
      expect(html).not.toContain("undefined");
    });
  });

  describe("duration is applied to CSS", () => {
    it("scene 1 with 8s duration has --d: 8s", () => {
      const html = generateScene(scenes[0], 8);
      expect(html).toContain("--d: 8s");
    });

    it("scene 4 with 12.5s duration has --d: 12.5s", () => {
      const html = generateScene(scenes[3], 12.5);
      expect(html).toContain("--d: 12.5s");
    });
  });
});
