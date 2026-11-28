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
import { sh } from "../lib/shell.mjs";

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

  // The four characters a naive double-quote escaper misses (#1598).
  it.each([
    ["command substitution", "$(touch /tmp/pwned)"],
    ["backtick substitution", "`touch /tmp/pwned`"],
    ["double quote", 'a"b'],
    ["backslash", "a\\b"],
    ["semicolon", "a; rm -rf /"],
  ])("keeps %s literal in a real shell", (_label, value) => {
    // nosemgrep: javascript.lang.security.audit.dangerous-spawn-shell.dangerous-spawn-shell -- the fixture is attacker-shaped input; the assertion proves it stays literal
    const run = spawnSync("/bin/sh", ["-c", `printf %s ${shellQuote(value)}`], {
      encoding: "utf8",
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(value);
  });
});

describe("sh tagged template", () => {
  it("quotes every interpolation as one argument", () => {
    const cmd = sh`say -v ${"Daniel"} -f ${"a b $(x)"} -o ${"out.aiff"}`;
    expect(cmd).toBe("say -v 'Daniel' -f 'a b $(x)' -o 'out.aiff'");
  });

  it("keeps a value with a single quote literal through a real shell", () => {
    const value = "it's $(touch /tmp/pwned)";
    const run = spawnSync("/bin/sh", ["-c", `printf %s ${sh`${value}`}`], { encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(value);
  });
});
