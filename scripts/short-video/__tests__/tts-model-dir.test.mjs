/**
 * #327: CosyVoice3-MLX model directory resolution.
 *
 * The default moved from `~/.cosyvoice3-mlx-model` to `~/models/cosyvoice3-mlx`
 * with the old path kept as an automatic fallback. These tests use real temp
 * directories (and an injected home/isDir seam) so nothing touches the user's
 * actual models.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildCV3BatchCommand, resolveCV3ModelDir } from "../lib/tts/cosyvoice3-mlx.mjs";

const tempHomes = [];

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), "cv3-model-dir-"));
  tempHomes.push(home);
  return home;
}

function makeDir(...parts) {
  const dir = join(...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

afterEach(() => {
  while (tempHomes.length > 0) {
    rmSync(tempHomes.pop(), { recursive: true, force: true });
  }
});

describe("resolveCV3ModelDir (#327)", () => {
  it("prefers ~/models/cosyvoice3-mlx when both paths exist", () => {
    const home = makeHome();
    const current = makeDir(home, "models", "cosyvoice3-mlx");
    makeDir(home, ".cosyvoice3-mlx-model");

    expect(resolveCV3ModelDir({ env: { HOME: home } })).toBe(current);
  });

  it("falls back to the legacy ~/.cosyvoice3-mlx-model when it is the only one", () => {
    const home = makeHome();
    const legacy = makeDir(home, ".cosyvoice3-mlx-model");

    expect(resolveCV3ModelDir({ env: { HOME: home } })).toBe(legacy);
  });

  it("returns the canonical new path when neither exists", () => {
    const home = makeHome();

    expect(resolveCV3ModelDir({ env: { HOME: home } })).toBe(
      join(home, "models", "cosyvoice3-mlx"),
    );
  });

  it("skips a non-directory at the new path and falls back to legacy", () => {
    const home = makeHome();
    mkdirSync(join(home, "models"), { recursive: true });
    writeFileSync(join(home, "models", "cosyvoice3-mlx"), "not a directory");
    const legacy = makeDir(home, ".cosyvoice3-mlx-model");

    expect(resolveCV3ModelDir({ env: { HOME: home } })).toBe(legacy);
  });

  it("uses COSYVOICE3_MLX_MODEL_DIR verbatim, even when it does not exist", () => {
    const home = makeHome();
    makeDir(home, ".cosyvoice3-mlx-model");

    expect(
      resolveCV3ModelDir({
        env: { HOME: home, COSYVOICE3_MLX_MODEL_DIR: "/explicit/cv3-model" },
      }),
    ).toBe("/explicit/cv3-model");
  });

  it("supports an injected home and directory probe", () => {
    const existing = ["/fake/home/models/cosyvoice3-mlx", "/fake/home/.cosyvoice3-mlx-model"];
    const seen = [];

    const resolved = resolveCV3ModelDir({
      env: {},
      home: "/fake/home",
      isDir: (path) => {
        seen.push(path);
        return existing.includes(path);
      },
    });

    expect(resolved).toBe("/fake/home/models/cosyvoice3-mlx");
    // The new path short-circuits: legacy is never probed when it exists.
    expect(seen).toEqual(["/fake/home/models/cosyvoice3-mlx"]);
  });
});

describe("buildCV3BatchCommand model dir (#327)", () => {
  const args = {
    manifestPath: "/o/cv3-manifest.json",
    outputDir: "/o/audio",
    refText: "reference text",
  };

  it("resolves the default at call time from the passed env", () => {
    const home = makeHome();
    const current = makeDir(home, "models", "cosyvoice3-mlx");
    makeDir(home, ".cosyvoice3-mlx-model");

    const cmd = buildCV3BatchCommand({ ...args, env: { HOME: home } });

    expect(cmd).toContain(`--model-dir "${current}"`);
  });

  it("uses an explicit modelDir verbatim", () => {
    const home = makeHome();
    makeDir(home, "models", "cosyvoice3-mlx");

    const cmd = buildCV3BatchCommand({
      ...args,
      env: { HOME: home },
      modelDir: "/custom/cv3-model",
    });

    expect(cmd).toContain('--model-dir "/custom/cv3-model"');
    expect(cmd).not.toContain(join(home, "models", "cosyvoice3-mlx"));
  });

  it("treats an empty modelDir as unset and resolves the default", () => {
    const home = makeHome();
    const current = makeDir(home, "models", "cosyvoice3-mlx");

    const cmd = buildCV3BatchCommand({ ...args, env: { HOME: home }, modelDir: "" });

    expect(cmd).toContain(`--model-dir "${current}"`);
  });
});
