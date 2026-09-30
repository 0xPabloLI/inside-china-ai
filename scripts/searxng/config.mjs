#!/usr/bin/env node
/**
 * SearXNG engine ledger — the tracked truth for ~/searxng/settings.yml.
 *
 * The live config lives outside the repo, so a disk loss or a fresh machine
 * loses 188 hand-tuned enable/disable decisions (and a Watchtower image update
 * has before now reset `search.formats`). This script makes that state
 * reproducible: `settings.template.yml` in the repo is the ledger, and the two
 * values that must never be tracked — `server.secret_key` and the host proxy
 * endpoint — are injected at apply time.
 *
 * Usage:
 *   node scripts/searxng/config.mjs --check     # template vs live, engine-by-engine (exit 1 on drift)
 *   node scripts/searxng/config.mjs --apply     # write live from template, back up the old file, restart
 *   node scripts/searxng/config.mjs --print     # render to stdout with the secret redacted
 *
 * Values resolution (never guessed):
 *   SEARXNG_SECRET_KEY / SEARXNG_PROXY_ENDPOINT, else reused from the live file.
 *
 * Restart needs colima: the host docker CLI cannot reach the VM socket on this
 * machine, so the command runs through `colima ssh -- sudo docker`.
 *
 * See docs/tools-catalog.md → SearXNG.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_PATH = join(__dirname, "settings.template.yml");
export const LIVE_PATH =
  process.env.SEARXNG_SETTINGS || join(process.env.HOME, "searxng", "settings.yml");
export const SECRET_RE = /^(\s*)secret_key:\s*"([^"]*)"\s*$/m;
export const PROXY_RE = /^(\s*-\s*)http:\/\/\$\{SEARXNG_PROXY_ENDPOINT\}\s*$/m;
const ENABLE_STATE = /^  - name: "(.+)"\n    disabled: (true|false)/gm;

/** Parse the explicit per-engine enable list out of a settings document. */
export function readEngineStates(text) {
  const states = new Map();
  for (const [, name, flag] of text.matchAll(ENABLE_STATE)) states.set(name, flag === "true");
  return states;
}

/** Inject the two untracked values into the template. */
export function renderTemplate(text, { secretKey, proxyEndpoint }) {
  if (!secretKey) throw new Error("missing secretKey");
  if (!proxyEndpoint) throw new Error("missing proxyEndpoint");
  return text
    .replace(SECRET_RE, `$1secret_key: "${secretKey}"`)
    .replace(PROXY_RE, `$1http://${proxyEndpoint}`);
}

/** Redact the secret for anything that goes to a terminal or a log. */
export function redactSecret(text) {
  return text.replace(SECRET_RE, `$1secret_key: "${"$"}{redacted}"`);
}

/**
 * Engine-by-engine comparison. The secret and the proxy endpoint are excluded
 * by construction, so a difference here is always the ledger, never a
 * machine-local value.
 * @returns {{drifted: Array<{name: string, template: boolean, live: boolean}>, missingFromLive: string[]}}
 */
export function diffEngines(templateText, liveText) {
  const t = readEngineStates(templateText);
  const l = readEngineStates(liveText);
  const drifted = [];
  const missingFromLive = [];
  for (const [name, want] of t) {
    if (!l.has(name)) missingFromLive.push(name);
    else if (l.get(name) !== want) drifted.push({ name, template: want, live: l.get(name) });
  }
  return { drifted, missingFromLive };
}

function resolveValues(liveText) {
  const secretKey =
    process.env.SEARXNG_SECRET_KEY || (liveText ? (liveText.match(SECRET_RE) || [])[2] || "" : "");
  const proxyEndpoint = process.env.SEARXNG_PROXY_ENDPOINT || extractEndpoint(liveText || "");
  if (!secretKey)
    throw new Error(
      "no secret: set SEARXNG_SECRET_KEY or run against an existing live settings.yml",
    );
  if (!proxyEndpoint)
    throw new Error(
      "no proxy endpoint: set SEARXNG_PROXY_ENDPOINT=<gateway-ip:port> (measure it, see docs/tools-catalog.md)",
    );
  return { secretKey, proxyEndpoint };
}

function extractEndpoint(liveText) {
  const m = /-\s+http:\/\/([\d.]+:\d+)/.exec(liveText);
  return m ? m[1] : "";
}

function main() {
  const mode = process.argv[2] || "--check";
  const templateText = readFileSync(TEMPLATE_PATH, "utf8");
  const liveText = existsSync(LIVE_PATH) ? readFileSync(LIVE_PATH, "utf8") : "";
  const values = resolveValues(liveText);

  if (mode === "--print") {
    process.stdout.write(`${redactSecret(renderTemplate(templateText, values))}\n`);
    return 0;
  }

  if (mode === "--apply") {
    const rendered = renderTemplate(templateText, values);
    if (liveText && liveText === rendered) {
      console.log("live settings.yml 已与台账一致，未写入。");
      return 0;
    }
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    if (liveText) copyFileSync(LIVE_PATH, `${LIVE_PATH}.bak-ledger-${stamp}`);
    writeFileSync(LIVE_PATH, rendered);
    console.log(`✓ 已按台账写入 ${LIVE_PATH}（旧文件备份 .bak-ledger-${stamp}）`);
    if (!process.env.SEARXNG_SKIP_RESTART) {
      execSync("colima ssh -- sudo docker restart searxng", { stdio: "inherit", timeout: 120000 });
      console.log("✓ 容器已重启生效");
    }
    return 0;
  }

  const { drifted, missingFromLive } = diffEngines(templateText, liveText);
  if (!liveText) {
    console.error(
      `✗ 本机没有 ${LIVE_PATH} —— 跑 --apply 从台账重建（需先设 SEARXNG_PROXY_ENDPOINT）`,
    );
    return 1;
  }
  for (const d of drifted)
    console.log(
      `漂移 ${d.name}: 台账=${d.template ? "disabled" : "enabled"} 实际=${d.live ? "disabled" : "enabled"}`,
    );
  for (const m of missingFromLive) console.log(`实际配置缺少引擎条目: ${m}`);
  if (drifted.length || missingFromLive.length) {
    console.error(`✗ 台账与实际配置不一致（${drifted.length + missingFromLive.length} 项）`);
    return 1;
  }
  const states = readEngineStates(templateText);
  const off = [...states.values()].filter((v) => v).length;
  console.log(`✓ 台账与实际一致：${states.size} 个引擎条目，${off} 个禁用`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main());
  } catch (error) {
    // A missing machine-local value is the expected failure mode; print the
    // instruction, not a stack trace an agent has to decode.
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
