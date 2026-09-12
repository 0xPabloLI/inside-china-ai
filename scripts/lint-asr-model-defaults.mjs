#!/usr/bin/env node
/**
 * CI guard (ADR-0020): ASR model defaults must be max-effort.
 *
 * Fails if any ASR path hardcodes a sub-max default
 * (base/tiny/small/medium) instead of large-v3 / large-v3-turbo.
 *
 * Exit 0 = pass, 1 = violations found.
 */
import { execSync } from "child_process";

const SUB_MAX = ["base", "tiny", "small", "medium"];
let found = "";

for (const m of SUB_MAX) {
  // JS:  process.env.ASR_MODEL || "base"
  // Py:  os.environ.get("ASR_MODEL", "base")
  const patterns = [
    `ASR_MODEL.{0,6}\\|\\|.{0,4}"${m}"`,
    `ASR_MODEL"?,\\s*"${m}"`,
  ];
  for (const pat of patterns) {
    try {
      const out = execSync(`rg -n --no-heading -e '${pat}' scripts/short-video/`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (out.trim()) found += out.trim() + "\n";
    } catch {
      // rg exits 1 on no match — expected
    }
  }
}

if (found) {
  console.error("❌ ADR-0020 violation — sub-max ASR default:\n" + found);
  console.error(
    "All ASR paths must default to large-v3 / large-v3-turbo. " +
      "See docs/adr/0020-asr-default-max-effort.md",
  );
  process.exit(1);
}
console.log("✅ ADR-0020: ASR defaults are max-effort.");