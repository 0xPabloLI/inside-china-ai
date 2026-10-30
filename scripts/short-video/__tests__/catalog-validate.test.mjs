import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import {
  LEGACY_CATALOG_FILES_WITHOUT_DIMENSIONS,
  formatIssue,
  runCli,
  validateCatalog,
} from "../lib/catalog-validate.mjs";

const REAL_CATALOG = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "catalog.yml");

let tmp = null;

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

/** Fixture root: catalog paths resolve here, never against the real library. */
function fixtureRoot(files = []) {
  tmp = mkdtempSync(join(tmpdir(), "catalog-validate-"));
  for (const file of files) {
    const full = join(tmp, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "fixture-bytes");
  }
  return tmp;
}

const entry = (file, extra = {}) => ({ file, type: "image", description: "fixture", ...extra });

const probeOf = (width, height) => () => ({ width, height, needsUpscale: false, isVideo: false });

const codes = (issues) => issues.map((issue) => issue.code);

describe("validateCatalog — declared vs measured", () => {
  it("passes when the declaration matches the file", () => {
    const file = "content/demo/assets/a.png";
    const rootDir = fixtureRoot([file]);

    const result = validateCatalog([entry(file, { width: 800, height: 600 })], {
      rootDir,
      probe: probeOf(800, 600),
    });

    expect(result.errors).toEqual([]);
    expect(result.verified).toEqual([file]);
    expect(result.declared).toBe(1);
  });

  it("fails and names the file, the declared and the measured dimensions", () => {
    const file = "content/demo/assets/a.png";
    const rootDir = fixtureRoot([file]);

    const result = validateCatalog([entry(file, { width: 1920, height: 1080 })], {
      rootDir,
      probe: probeOf(640, 360),
    });

    expect(codes(result.errors)).toEqual(["dimension-mismatch"]);
    const rendered = formatIssue(result.errors[0]);
    expect(rendered).toContain(file);
    expect(rendered).toContain("declared 1920x1080");
    expect(rendered).toContain("measured 640x360");
  });

  it("treats a probe that cannot read the file as a warning, not a content verdict", () => {
    const file = "content/demo/assets/a.png";
    const rootDir = fixtureRoot([file]);

    for (const probe of [
      probeOf(0, 0),
      () => null,
      () => {
        throw new Error("boom");
      },
    ]) {
      const result = validateCatalog([entry(file, { width: 800, height: 600 })], {
        rootDir,
        probe,
        legacyFiles: [],
      });
      expect(result.errors).toEqual([]);
      expect(codes(result.warnings)).toEqual(["probe-failed"]);
      expect(result.probeFailed).toEqual([file]);
    }
  });
});

describe("validateCatalog — static schema", () => {
  it("fails a new entry that declares no dimensions", () => {
    const result = validateCatalog([entry("content/demo/assets/a.png")], { probe: null });
    expect(codes(result.errors)).toEqual(["missing-dimensions"]);
  });

  it("fails a half-declared pair and names the missing side", () => {
    const result = validateCatalog([entry("content/demo/assets/a.png", { width: 800 })], {
      probe: null,
    });
    expect(codes(result.errors)).toEqual(["missing-dimensions"]);
    expect(result.errors[0].message).toContain("missing height");
  });

  it("rejects zero, negative, fractional and string values", () => {
    for (const extra of [
      { width: 0, height: 600 },
      { width: 800, height: -1 },
      { width: 800.5, height: 600 },
      { width: "800", height: 600 },
    ]) {
      const result = validateCatalog([entry("content/demo/assets/a.png", extra)], { probe: null });
      expect(codes(result.errors)).toEqual(["invalid-dimensions"]);
    }
  });

  it("fails an entry with no file path", () => {
    const result = validateCatalog([{ description: "no file" }], { probe: null });
    expect(codes(result.errors)).toEqual(["invalid-file"]);
  });
});

describe("validateCatalog — disk layer", () => {
  it("warns about a missing binary and only errors under requireFiles", () => {
    const item = entry("content/demo/assets/a.png", { width: 800, height: 600 });

    const soft = validateCatalog([item], {
      rootDir: fixtureRoot(),
      probe: probeOf(800, 600),
      legacyFiles: [],
    });
    expect(soft.errors).toEqual([]);
    expect(codes(soft.warnings)).toEqual(["missing-file"]);
    expect(soft.diskMissing).toEqual(["content/demo/assets/a.png"]);

    const hard = validateCatalog([item], {
      rootDir: fixtureRoot(),
      probe: probeOf(800, 600),
      requireFiles: true,
      legacyFiles: [],
    });
    expect(codes(hard.errors)).toEqual(["missing-file"]);
  });

  it("skips the disk layer entirely when probe is null", () => {
    const result = validateCatalog(
      [entry("content/demo/assets/a.png", { width: 800, height: 600 })],
      { probe: null, legacyFiles: [] },
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("validateCatalog — legacy exemptions", () => {
  const legacyFile = "content/demo/assets/legacy.png";

  it("exempts a frozen path without dimensions", () => {
    const result = validateCatalog([entry(legacyFile)], {
      rootDir: fixtureRoot(),
      probe: probeOf(800, 600),
      legacyFiles: [legacyFile],
    });
    expect(result.errors).toEqual([]);
    expect(result.legacyExempt).toEqual([legacyFile]);
  });

  it("reports a legacy path that now declares dimensions", () => {
    const result = validateCatalog([entry(legacyFile, { width: 800, height: 600 })], {
      rootDir: fixtureRoot([legacyFile]),
      probe: probeOf(800, 600),
      legacyFiles: [legacyFile],
    });
    expect(codes(result.warnings)).toEqual(["stale-legacy"]);
    expect(result.errors).toEqual([]);
  });

  it("reports a legacy path that is no longer in the catalog", () => {
    const result = validateCatalog([], { probe: null, legacyFiles: [legacyFile] });
    expect(codes(result.warnings)).toEqual(["stale-legacy"]);
  });

  it("reports a legacy file that became readable, with its measured size", () => {
    const result = validateCatalog([entry(legacyFile)], {
      rootDir: fixtureRoot([legacyFile]),
      probe: probeOf(1024, 768),
      legacyFiles: [legacyFile],
    });
    expect(codes(result.warnings)).toEqual(["legacy-file-present"]);
    expect(result.warnings[0].message).toContain("1024x768");
  });

  it("keeps the frozen list to the entries that still lack dimensions", () => {
    const configured = readFileSync(REAL_CATALOG, "utf8");
    const entries = yaml.load(configured);
    const result = validateCatalog(entries, { probe: null });

    expect(result.errors).toEqual([]);
    expect(result.total).toBeGreaterThan(0);
    expect([...result.legacyExempt].sort()).toEqual(
      [...LEGACY_CATALOG_FILES_WITHOUT_DIMENSIONS].sort(),
    );
  });
});

describe("validateCatalog — global-library short-side floor", () => {
  it("fails a global-library entry below 720p on the short side", () => {
    const result = validateCatalog([entry("assets/small.png", { width: 640, height: 360 })], {
      probe: null,
    });
    expect(codes(result.errors)).toEqual(["below-short-side"]);
    expect(result.errors[0].message).toContain("720");
  });

  it("allows a package-local entry below 720p (upscaled per package)", () => {
    const result = validateCatalog(
      [entry("content/demo/assets/small.png", { width: 640, height: 360 })],
      { probe: null },
    );
    expect(result.errors).toEqual([]);
  });

  it("allows a global-library entry at exactly 720p on the short side", () => {
    const result = validateCatalog([entry("assets/ok.png", { width: 1280, height: 720 })], {
      probe: null,
    });
    expect(result.errors).toEqual([]);
  });
});

describe("catalog-validate CLI", () => {
  function run(args, io = {}) {
    const stdout = [];
    const stderr = [];
    const code = runCli(args, {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
      ...io,
    });
    return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  }

  function writeCatalog(entries) {
    const rootDir = fixtureRoot();
    const catalogPath = join(rootDir, "assets", "catalog.yml");
    mkdirSync(dirname(catalogPath), { recursive: true });
    writeFileSync(catalogPath, yaml.dump(entries));
    return catalogPath;
  }

  it("exits 0 when every entry passes", () => {
    const file = "content/demo/assets/a.png";
    const rootDir = fixtureRoot([file]);
    const catalogPath = join(rootDir, "assets", "catalog.yml");
    mkdirSync(dirname(catalogPath), { recursive: true });
    writeFileSync(catalogPath, yaml.dump([entry(file, { width: 800, height: 600 })]));

    const { code, stdout } = run(["--catalog", catalogPath], { probe: probeOf(800, 600) });
    expect(code).toBe(0);
    expect(stdout).toContain("1 verified on disk");
  });

  it("exits 1 and names the offender when a declaration is wrong", () => {
    const file = "content/demo/assets/a.png";
    const rootDir = fixtureRoot([file]);
    const catalogPath = join(rootDir, "assets", "catalog.yml");
    mkdirSync(dirname(catalogPath), { recursive: true });
    writeFileSync(catalogPath, yaml.dump([entry(file, { width: 1920, height: 1080 })]));

    const { code, stderr } = run(["--catalog", catalogPath], { probe: probeOf(640, 360) });
    expect(code).toBe(1);
    expect(stderr).toContain("dimension-mismatch");
    expect(stderr).toContain("declared 1920x1080, measured 640x360");
  });

  it("exits 1 on a new entry without dimensions", () => {
    const catalogPath = writeCatalog([entry("content/demo/assets/a.png")]);
    const { code, stderr } = run(["--catalog", catalogPath]);
    expect(code).toBe(1);
    expect(stderr).toContain("missing-dimensions");
  });

  it("exits 2 on usage or catalog read errors", () => {
    expect(run(["--nope"]).code).toBe(2);
    expect(run(["--catalog"]).code).toBe(2);
    expect(run(["--catalog", join(tmpdir(), "does-not-exist-catalog.yml")]).code).toBe(2);
  });
});
