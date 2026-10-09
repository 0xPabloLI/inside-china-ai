import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PKG_DIR = join(ROOT, "scripts/short-video/remotion");

const pkg = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(PKG_DIR, "package-lock.json"), "utf8"));
const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf8");

// Renovate bumps scripts/short-video/remotion/package.json but that sub-lockfile
// used to be gitignored, so nothing kept it in sync and `npm ci` in the renderer
// package failed for anyone setting up from a clean clone (2026-10-04: lock stuck
// at @remotion/* 4.0.517 while package.json asked for 4.0.529). CI never installs
// that directory, which is why the drift stayed invisible — this is the guard.
const EXACT_PIN = /^[^\s^~*x<>=]+$/;

describe("remotion renderer package lockfile", () => {
  it("is tracked, not gitignored", () => {
    expect(gitignore).not.toMatch(/scripts\/short-video\/remotion\/package-lock\.json/);
  });

  it("pins every exact-version dependency in the lock", () => {
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    const drifted = Object.entries(declared)
      .filter(([, spec]) => EXACT_PIN.test(spec))
      .filter(([name, spec]) => lock.packages?.[`node_modules/${name}`]?.version !== spec)
      .map(
        ([name, spec]) =>
          `${name}: package.json ${spec} vs lock ${lock.packages?.[`node_modules/${name}`]?.version ?? "(missing)"}`,
      );

    expect(drifted).toEqual([]);
  });
});
