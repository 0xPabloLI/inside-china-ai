import { describe, it, expect } from "vitest";
import { generateScene } from "../content/deepseek/scenes.mjs";
import { scenes } from "../content/deepseek/scene-data.mjs";

describe("DeepSeek scene generation", () => {
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

      it("contains brand watermark", () => {
        expect(html).toContain("brand-watermark");
      });

      it("contains baseStyles CSS variables", () => {
        expect(html).toContain("--blue");
        expect(html).toContain("--red");
      });

      it("contains scene container", () => {
        expect(html).toContain('class="scene');
      });
    });
  }

  // Scene-specific text verification
  describe("scene 1 (hook) text from scene.texts", () => {
    const scene1 = scenes[0];
    const html = generateScene(scene1, 10);

    it("contains big number from texts", () => {
      expect(html).toContain("$1.4B");
    });

    it("contains subject text", () => {
      expect(html).toContain("DEEPSEEK");
    });

    it("contains breaking badge", () => {
      expect(html).toContain("BREAKING");
    });
  });

  describe("scene 12 (cta) text from scene.texts", () => {
    const scene12 = scenes[11];
    const html = generateScene(scene12, 10);

    it("contains brand name", () => {
      expect(html).toContain("CHINA");
      expect(html).toContain("AI");
    });

    it("contains subscribe text", () => {
      expect(html).toContain("Subscribe");
    });

    it("contains fade-to-black", () => {
      expect(html).toContain("fade-to-black");
    });
  });

  describe("missing texts fields degrade safely", () => {
    it("does not render undefined for missing fields", () => {
      const minimalScene = { id: 1, texts: {} };
      const html = generateScene(minimalScene, 10);
      expect(html).not.toContain("undefined");
    });
  });
});
