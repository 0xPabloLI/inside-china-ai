import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { VLM_CACHE_PROMPT_VERSION } from "../lib/vlm-cache.mjs";
import { discoverCacheDirs, runCli } from "../prune-vlm-cache.mjs";

let tmp = null;

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

const keyFor = (ch) => ch.repeat(64);
const envelope = (promptVersion) =>
  JSON.stringify({
    ok: true,
    data: {},
    error: null,
    meta: promptVersion ? { promptVersion } : { model: "m1" },
  });

/** One cache dir with 1 current, 1 v1 orphan, 1 v2 orphan, and one tmp. */
function seedPack(root, rel) {
  const dir = join(root, rel, ".vlm-cache");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${keyFor("a")}.json`), envelope(VLM_CACHE_PROMPT_VERSION));
  writeFileSync(join(dir, `${keyFor("b")}.json`), envelope("v1-2026-09-04"));
  writeFileSync(join(dir, `${keyFor("c")}.json`), envelope("v2-2026-10-10"));
  writeFileSync(join(dir, `.${keyFor("d")}.42.tmp`), "partial");
  return dir;
}

function collect() {
  const lines = [];
  return {
    lines,
    stdout: (line) => lines.push(line),
    stderr: (line) => lines.push(line),
  };
}

describe("prune-vlm-cache CLI (#992)", () => {
  it("discovers content and output cache dirs, including nested series packs", () => {
    tmp = mkdtempSync(join(tmpdir(), "prune-cli-"));
    seedPack(tmp, "content/pack-a");
    seedPack(tmp, "content/series/pt1");
    seedPack(tmp, "output/pack-c");
    const dirs = discoverCacheDirs(tmp).map((dir) => dir.slice(tmp.length + 1));
    expect(dirs).toEqual([
      "content/pack-a/.vlm-cache",
      "content/series/pt1/.vlm-cache",
      "output/pack-c/.vlm-cache",
    ]);
  });

  it("defaults to a dry run over every pack and deletes nothing", async () => {
    tmp = mkdtempSync(join(tmpdir(), "prune-cli-"));
    const a = seedPack(tmp, "content/pack-a");
    const c = seedPack(tmp, "output/pack-c");
    const sink = collect();
    const code = await runCli(["--root", tmp], sink);

    expect(code).toBe(0);
    const out = sink.lines.join("\n");
    expect(out).toContain("content/pack-a/.vlm-cache");
    expect(out).toContain("output/pack-c/.vlm-cache");
    expect(out).toMatch(/Before: 6 entries/);
    expect(out).toMatch(/After:\s+6 entries/);
    expect(out).toContain("--apply to delete 4 orphan entries");
    expect(readdirSync(a)).toHaveLength(4);
    expect(readdirSync(c)).toHaveLength(4);
  });

  it("--apply deletes only orphans and prints before/after counts", async () => {
    tmp = mkdtempSync(join(tmpdir(), "prune-cli-"));
    const a = seedPack(tmp, "content/pack-a");
    const c = seedPack(tmp, "output/pack-c");
    const sink = collect();
    const code = await runCli(["--root", tmp, "--apply"], sink);

    expect(code).toBe(0);
    const out = sink.lines.join("\n");
    expect(out).toMatch(/Before: 6 entries/);
    expect(out).toMatch(/After:\s+2 entries/);
    expect(out).toMatch(/Reclaimed: 4 entries/);
    expect(readdirSync(a).sort()).toEqual([`${keyFor("a")}.json`, `.${keyFor("d")}.42.tmp`].sort());
    expect(readdirSync(c)).toHaveLength(2);
  });

  it("--content limits the prune to one pack", async () => {
    tmp = mkdtempSync(join(tmpdir(), "prune-cli-"));
    const a = seedPack(tmp, "content/pack-a");
    const c = seedPack(tmp, "content/pack-b");
    const sink = collect();
    const code = await runCli(["--root", tmp, "--content", "pack-b", "--apply"], sink);

    expect(code).toBe(0);
    expect(readdirSync(a)).toHaveLength(4);
    expect(readdirSync(c)).toHaveLength(2);
    expect(sink.lines.join("\n")).toContain("content/pack-b/.vlm-cache");
    expect(sink.lines.join("\n")).not.toContain("content/pack-a/.vlm-cache");
  });

  it("--dir accepts an explicit cache directory", async () => {
    tmp = mkdtempSync(join(tmpdir(), "prune-cli-"));
    const dir = seedPack(tmp, "content/pack-a");
    const sink = collect();
    const code = await runCli(["--dir", dir], sink);

    expect(code).toBe(0);
    expect(sink.lines.join("\n")).toContain(dir);
    expect(sink.lines.join("\n")).toContain("3 entries");
    expect(readdirSync(dir)).toHaveLength(4);
  });

  it("fails when an explicit content pack has no cache directory", async () => {
    tmp = mkdtempSync(join(tmpdir(), "prune-cli-"));
    mkdirSync(join(tmp, "content", "pack-a"), { recursive: true });
    const sink = collect();
    const code = await runCli(["--root", tmp, "--content", "pack-a"], sink);

    expect(code).toBe(1);
    expect(sink.lines.join("\n")).toContain('no .vlm-cache for content pack "pack-a"');
  });

  it("exits 1 and keeps the entry when a deletion fails", async () => {
    tmp = mkdtempSync(join(tmpdir(), "prune-cli-"));
    const dir = seedPack(tmp, "content/pack-a");
    const sink = collect();
    const code = await runCli(["--dir", dir, "--apply"], {
      ...sink,
      unlink: () => {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      },
    });

    expect(code).toBe(1);
    const out = sink.lines.join("\n");
    expect(out).toContain("could not be deleted");
    expect(out).toContain("permission denied");
    expect(readdirSync(dir)).toHaveLength(4);
  });

  it("rejects unknown arguments with a usage error", async () => {
    const sink = collect();
    const code = await runCli(["--nope"], sink);
    expect(code).toBe(2);
    expect(sink.lines.join("\n")).toContain("unknown argument: --nope");
  });

  it("prints help and exits 0", async () => {
    const sink = collect();
    const code = await runCli(["--help"], sink);
    expect(code).toBe(0);
    expect(sink.lines.join("\n")).toContain("--apply");
  });
});
