#!/usr/bin/env node
/**
 * Install/uninstall the SearXNG park LaunchAgent (#891).
 *
 * The agent runs `lifecycle.mjs park --apply` every five minutes. It only
 * touches the searxng container; colima and the other containers stay up.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "com.inside-china-ai.searxng-park";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const installDir = path.join(os.homedir(), "Library/Application Support/inside-china-ai/searxng");
const installedScript = path.join(installDir, "lifecycle.mjs");
const plistPath = path.join(os.homedir(), "Library/LaunchAgents", `${LABEL}.plist`);
const logPath = path.join(os.homedir(), "Library/Logs", "searxng-park.log");
const uid = typeof process.getuid === "function" ? process.getuid() : "";
const nodeDir = path.dirname(process.execPath);
const autoPath = [
  nodeDir,
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
]
  .filter(Boolean)
  .join(":");
const uninstall = process.argv.includes("--uninstall");

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function launchctl(args, { ignoreFailure = false } = {}) {
  try {
    execFileSync("/bin/launchctl", args, {
      stdio: ignoreFailure ? "ignore" : "inherit",
    });
  } catch (err) {
    if (!ignoreFailure) throw err;
  }
}

if (uninstall) {
  launchctl(["bootout", `gui/${uid}`, plistPath], { ignoreFailure: true });
  fs.rmSync(plistPath, { force: true });
  fs.rmSync(installedScript, { force: true });
  try {
    fs.rmdirSync(installDir);
  } catch {
    // Other installed files may keep the directory alive.
  }
  console.log(`removed ${plistPath}`);
  process.exit(0);
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>${xml(installedScript)}</string>
    <string>park</string>
    <string>--apply</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(autoPath)}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${xml(installDir)}</string>
  <key>RunAtLoad</key>
  <false/>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(logPath)}</string>
</dict>
</plist>
`;

fs.mkdirSync(installDir, { recursive: true });
fs.copyFileSync(path.join(repoRoot, "scripts/searxng/lifecycle.mjs"), installedScript);
fs.chmodSync(installedScript, 0o755);
fs.mkdirSync(path.dirname(plistPath), { recursive: true });
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(plistPath, plist);
launchctl(["bootout", `gui/${uid}`, plistPath], { ignoreFailure: true });
launchctl(["bootstrap", `gui/${uid}`, plistPath]);
console.log(`installed ${installedScript}`);
console.log(`installed ${plistPath}`);
console.log(`runs every 300s; logs: ${logPath}`);
