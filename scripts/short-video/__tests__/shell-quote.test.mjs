/**
 * shellQuote — POSIX single-quote quoting for values interpolated into
 * command strings (#319 OCR video batch scan).
 */
import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { shellQuote } from "../lib/shell-quote.mjs";

describe("shellQuote", () => {
  it("wraps a plain value in single quotes", () => {
    expect(shellQuote("/tmp/plain.mp4")).toBe("'/tmp/plain.mp4'");
  });

  it("closes and re-opens quoting around an embedded single quote", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("quotes an empty value as an empty argument", () => {
    expect(shellQuote("")).toBe("''");
  });

  // The property that matters: a shell handed the quoted value sees one
  // literal argument. RED on a naive `'${value}'` interpolation.
  it("keeps command substitutions literal in a real shell", () => {
    const dir = mkdtempSync(join(tmpdir(), "shell-quote-319-"));
    const payload = `evil$(touch ${join(dir, "MARKER")})`;

    const run = spawnSync("/bin/sh", ["-c", `printf %s ${shellQuote(payload)}`], {
      encoding: "utf8",
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toBe(payload);
    expect(existsSync(join(dir, "MARKER"))).toBe(false);
  });

  it("keeps a quoted value literal next to other arguments", () => {
    const run = spawnSync(
      "/bin/sh",
      ["-c", `printf '%s|%s' ${shellQuote("a b")} ${shellQuote("$(echo hi)")}`],
      { encoding: "utf8" },
    );
    expect(run.stdout).toBe("a b|$(echo hi)");
  });
});
