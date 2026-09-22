/**
 * CDP Preflight — Step 0 hard gate.
 *
 * The CDP proxy (skills/web-access/scripts/cdp-proxy.mjs) is a hard
 * dependency of asset sourcing: without it the CDP-backed image/video
 * sources cannot search, which produced videos with no background media
 * (2026-09-08/09 incidents). Degradation is not allowed — the gate runs
 * FIRST in main.mjs and exits the pipeline when the proxy is not usable.
 *
 * Escalation ladder (mirrors docs/selector-auto-healing.md):
 *   1. Proxy already up (GET /targets ok) → pass.
 *   2. Proxy not up → start the repo-owned proxy as a detached background
 *      process and poll /targets for up to ~12s.
 *   3. Proxy up but Chrome debug port not reachable (/health connected:false)
 *      → fail with a user-facing hint (the agent must never kill or restart
 *      Chrome itself — AGENTS.md hard gate).
 *
 * @module cdp-preflight
 */

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { openSync } from "fs";
import { automationPort } from "./cdp-profile-guard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROXY_SCRIPT = join(
  __dirname,
  "..",
  "..",
  "..",
  "skills",
  "web-access",
  "scripts",
  "cdp-proxy.mjs",
);
const PROXY_LOG = join(__dirname, "..", "output", "cdp-proxy.log");
const PROXY_PORT = process.env.CDP_PROXY_PORT || "3456";

async function targetsOk() {
  try {
    const resp = await fetch(`http://localhost:${PROXY_PORT}/targets`, {
      signal: AbortSignal.timeout(2500),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function healthPayload() {
  try {
    const resp = await fetch(`http://localhost:${PROXY_PORT}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function startProxyDetached() {
  const logFd = openSync(PROXY_LOG, "a");
  const child = spawn(process.execPath, [PROXY_SCRIPT], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: process.env,
  });
  child.unref();
  return child.pid;
}

/**
 * Ensure the CDP proxy is usable, or terminate the pipeline.
 * Called as the first step of main.mjs — fail fast, never degrade.
 *
 * @param {object} [options]
 * @param {boolean} [options.autoStart=true] - start the repo proxy if down
 * @param {number} [options.waitMs=12000] - poll budget after auto-start
 * @returns {Promise<{ok: boolean, started: boolean}>}
 */
export async function ensureCdpOrExit({ autoStart = true, waitMs = 12000 } = {}) {
  // Step 0.1: 自动化 profile 守卫。用错 profile 不会报错，只会静默得出假的
  // 「登录墙」结论（2026-09-22：weibo 在 ~/.chrome-cdp 上被判 login-wall，
  // 实际在 chrome-tiktok-profile 下返回 5500+ 字符真结果）。
  // 默认告警；CDP_REQUIRE_AUTOMATION_PROFILE=1 时改为硬失败。
  if (process.platform === "darwin") {
    try {
      const { checkAutomationProfile, formatVerdict } = await import("./cdp-profile-guard.mjs");
      const guard = await checkAutomationProfile();
      if (guard.status === "ok") {
        console.log(`✅ Step 0.1: CDP automation profile ok (${guard.expectedDir}:${guard.port})`);
      } else if (process.env.CDP_REQUIRE_AUTOMATION_PROFILE === "1") {
        console.error(`❌ Step 0.1: ${formatVerdict(guard)}`);
        process.exit(1);
      } else {
        console.warn(`⚠️  Step 0.1: ${formatVerdict(guard)}`);
        console.warn("   （此环境下「登录墙」判决不可信；设 CDP_REQUIRE_AUTOMATION_PROFILE=1 可改为硬失败）");
      }
    } catch (e) {
      console.warn(`⚠️  Step 0.1: automation profile guard 跳过（${e.message}）`);
    }
  }

  if (await targetsOk()) {
    console.log("✅ Step 0.2: CDP proxy available (localhost:3456/targets ok)");
    return { ok: true, started: false };
  }

  if (autoStart) {
    console.log(
      "  🔌 CDP proxy not responding — starting skills/web-access/scripts/cdp-proxy.mjs ...",
    );
    let pid = null;
    try {
      pid = startProxyDetached();
    } catch (e) {
      console.error(`❌ Failed to spawn CDP proxy: ${e.message}`);
    }
    if (pid) {
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 600));
        if (await targetsOk()) {
          console.log(`✅ Step 0.2: CDP proxy started (pid ${pid}, log ${PROXY_LOG})`);
          return { ok: true, started: true };
        }
      }
    }
  }

  const health = await healthPayload();
  console.error("❌ Step 0.2: CDP proxy NOT available — pipeline cannot source media.");
  if (health && health.connected === false) {
    console.error(
      `   Proxy is up on :${PROXY_PORT} but connected=false — Chrome remote-debugging ` +
        `port (${health.chromePort ?? automationPort()}) is not reachable.`,
    );
    console.error("   → npm run cdp:ensure -- --start   (starts the automation-profile instance)");
    console.error("     then re-run. Per AGENTS.md the agent must not restart Chrome itself.");
  } else {
    console.error(`   Nothing listening on localhost:${PROXY_PORT}.`);
    console.error(`   → Start it manually: node skills/web-access/scripts/cdp-proxy.mjs`);
    console.error(`   Proxy log: ${PROXY_LOG}`);
  }
  process.exit(1);
}
