import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  loadDomConfig,
  DEFAULT_ABSENT_CLASSES,
  DEFAULT_DOM_CONFIG,
} from "../lib/load-dom-config.mjs";

const SCRIPTS_DIR = join(import.meta.dirname, "..");

describe("loadDomConfig", () => {
  describe("scenario #1: content dir WITH valid dom-config.mjs", () => {
    it("loads restraint/pt1 config", async () => {
      const config = await loadDomConfig("restraint/pt1", SCRIPTS_DIR);
      expect(config.absentClasses).toEqual([
        "source-badge",
        "subscribe",
        "source-tag",
        "attribution",
      ]);
      expect(config.singleOccurrence).toEqual({ 4: ["PRICE CUT"] });
      expect(config.wordFit).toEqual({ 3: [".s3 .card .text"] });
    });

    it("loads distillation/pt2 config", async () => {
      const config = await loadDomConfig("distillation/pt2", SCRIPTS_DIR);
      expect(config.absentClasses).toEqual(["source-badge", "subscribe"]);
      expect(config.singleOccurrence).toEqual({});
      expect(config.wordFit).toEqual({ 1: [".s1 .big-text"], 7: [".s7 .big-text"] });
    });

    it("loads distillation/pt3 config", async () => {
      const config = await loadDomConfig("distillation/pt3", SCRIPTS_DIR);
      expect(config.absentClasses).toEqual(["source-badge", "subscribe"]);
      expect(config.wordFit).toEqual({
        1: [".s1 .big-text"],
        8: [".s8 .line1", ".s8 .line2"],
      });
    });

    it("loads _test-fixtures/hook-standard config", async () => {
      const config = await loadDomConfig("_test-fixtures/hook-standard", SCRIPTS_DIR);
      expect(config.absentClasses).toEqual([
        "source-badge",
        "subscribe",
        "source-tag",
        "attribution",
      ]);
      expect(config.wordFit).toEqual({
        1: [".s-hook .focal-claim"],
        2: [".s-hook .focal-number-label"],
      });
    });
  });

  describe("scenario #2: content dir WITHOUT dom-config.mjs", () => {
    it("returns defaults for kimi-sandbox", async () => {
      const config = await loadDomConfig("kimi-sandbox", SCRIPTS_DIR);
      expect(config).toEqual({
        absentClasses: DEFAULT_ABSENT_CLASSES,
        singleOccurrence: {},
        wordFit: {},
      });
    });

    it("returns defaults for non-existent content dir", async () => {
      const config = await loadDomConfig("nonexistent-dir", SCRIPTS_DIR);
      expect(config).toEqual(DEFAULT_DOM_CONFIG);
    });
  });

  describe("scenario #3: dom-config.mjs has syntax error", () => {
    let tempDir;

    it("falls back to defaults on syntax error", async () => {
      tempDir = mkdtempSync(join(tmpdir(), "dom-config-test-"));
      const contentDir = join(tempDir, "content", "broken");
      mkdtempSync(join(tempDir, "content")); // ensure content parent exists
      // mkdtemp creates with a random suffix, so we create dirs manually
      rmSync(join(tempDir, "content"), { recursive: true, force: true });
      const fs = await import("fs");
      fs.mkdirSync(join(tempDir, "content", "broken"), { recursive: true });
      writeFileSync(
        join(tempDir, "content", "broken", "dom-config.mjs"),
        "export const domConfig = {;", // syntax error: missing closing brace
      );

      const config = await loadDomConfig("broken", tempDir);
      expect(config).toEqual(DEFAULT_DOM_CONFIG);

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe("scenario #4: dom-config.mjs exports incomplete config", () => {
    let tempDir;

    it("merges with defaults when only absentClasses is provided", async () => {
      tempDir = mkdtempSync(join(tmpdir(), "dom-config-test-"));
      const fs = await import("fs");
      fs.mkdirSync(join(tempDir, "content", "partial"), { recursive: true });
      writeFileSync(
        join(tempDir, "content", "partial", "dom-config.mjs"),
        'export const domConfig = { absentClasses: ["custom-class"] };',
      );

      const config = await loadDomConfig("partial", tempDir);
      expect(config.absentClasses).toEqual(["custom-class"]);
      expect(config.singleOccurrence).toEqual({});
      expect(config.wordFit).toEqual({});

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("merges with defaults when only wordFit is provided", async () => {
      tempDir = mkdtempSync(join(tmpdir(), "dom-config-test-"));
      const fs = await import("fs");
      fs.mkdirSync(join(tempDir, "content", "wordfit-only"), { recursive: true });
      writeFileSync(
        join(tempDir, "content", "wordfit-only", "dom-config.mjs"),
        'export const domConfig = { wordFit: { 5: [".s5 .text"] } };',
      );

      const config = await loadDomConfig("wordfit-only", tempDir);
      expect(config.absentClasses).toEqual(DEFAULT_ABSENT_CLASSES);
      expect(config.singleOccurrence).toEqual({});
      expect(config.wordFit).toEqual({ 5: [".s5 .text"] });

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe("scenario #5: dom-config.mjs exports wrong shape (non-object)", () => {
    it("falls back to defaults when domConfig is a string", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dom-config-test-"));
      const fs = await import("fs");
      fs.mkdirSync(join(tempDir, "content", "wrong-shape"), { recursive: true });
      writeFileSync(
        join(tempDir, "content", "wrong-shape", "dom-config.mjs"),
        'export const domConfig = "not an object";',
      );

      const config = await loadDomConfig("wrong-shape", tempDir);
      expect(config).toEqual(DEFAULT_DOM_CONFIG);

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("falls back to defaults when domConfig is undefined", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dom-config-test-"));
      const fs = await import("fs");
      fs.mkdirSync(join(tempDir, "content", "no-export"), { recursive: true });
      writeFileSync(
        join(tempDir, "content", "no-export", "dom-config.mjs"),
        'export const somethingElse = "wrong";',
      );

      const config = await loadDomConfig("no-export", tempDir);
      expect(config).toEqual(DEFAULT_DOM_CONFIG);

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe("scenario #7: new pipeline without dom-config.mjs", () => {
    it("works with defaults — no central file to edit", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "dom-config-test-"));
      const fs = await import("fs");
      fs.mkdirSync(join(tempDir, "content", "new-pipeline"), { recursive: true });
      // No dom-config.mjs — should use defaults

      const config = await loadDomConfig("new-pipeline", tempDir);
      expect(config).toEqual(DEFAULT_DOM_CONFIG);

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe("DEFAULT_DOM_CONFIG constant", () => {
    it("has correct shape", () => {
      expect(DEFAULT_DOM_CONFIG).toEqual({
        absentClasses: ["source-badge", "subscribe"],
        singleOccurrence: {},
        wordFit: {},
      });
    });

    it("DEFAULT_ABSENT_CLASSES matches", () => {
      expect(DEFAULT_ABSENT_CLASSES).toEqual(["source-badge", "subscribe"]);
    });
  });
});
