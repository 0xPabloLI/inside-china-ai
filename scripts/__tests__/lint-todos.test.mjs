import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { collectFiles, findUnlinkedMarkers } from "../lint-todos.mjs";

// Marker words are assembled at runtime so this file itself stays clean under
// the scanner (it scans scripts/, including its own tests).
const TODO = `TO${"DO"}`;
const FIXME = `FIX${"ME"}`;

describe("findUnlinkedMarkers", () => {
  it("flags a bare TODO without an issue reference", () => {
    const violations = findUnlinkedMarkers(`const x = 1; // ${TODO} refactor this`, "a.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: "a.ts", line: 1 });
  });

  it("flags an unlinked FIXME on a later line (1-based numbering)", () => {
    const violations = findUnlinkedMarkers(`ok\nok\n// ${FIXME} broken`, "b.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(3);
  });

  it("accepts TODO(#123) style links", () => {
    expect(findUnlinkedMarkers(`// ${TODO}(#123): handle retry`, "c.ts")).toHaveLength(0);
  });

  it("accepts prose-style links like `TODO: see #45`", () => {
    expect(findUnlinkedMarkers(`// ${TODO}: see #45 before release`, "d.py")).toHaveLength(0);
  });

  it("ignores lines without markers", () => {
    expect(findUnlinkedMarkers("const ok = true;\nrun();", "e.mjs")).toHaveLength(0);
  });

  it("reports each unlinked marker on multi-marker content", () => {
    const content = [`// ${TODO} a`, `// ${TODO}(#1) linked`, `// ${FIXME} b`].join("\n");
    const violations = findUnlinkedMarkers(content, "f.ts");
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.line)).toEqual([1, 3]);
  });
});

describe("collectFiles", () => {
  let dir;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("collects code files recursively and prunes excluded trees", () => {
    dir = mkdtempSync(join(tmpdir(), "lint-todos-"));
    writeFileSync(join(dir, "root.mjs"), "x");
    writeFileSync(join(dir, "note.txt"), "x");
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "nested", "deep.ts"), "x");
    mkdirSync(join(dir, "experiments", "spike"), { recursive: true });
    writeFileSync(join(dir, "experiments", "spike", "spike.py"), "x");

    const files = collectFiles(dir);
    expect(files).toHaveLength(2);
    expect(files).toEqual(
      expect.arrayContaining([join(dir, "root.mjs"), join(dir, "nested", "deep.ts")]),
    );
  });

  it("returns empty for a missing directory", () => {
    expect(collectFiles(join(tmpdir(), "lint-todos-does-not-exist"))).toEqual([]);
  });
});
