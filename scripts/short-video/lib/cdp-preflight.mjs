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
 *   0.1 Profile guard — pin `WEB_ACCESS_CDP_PORT` to the automation port and
 *      verify the automation profile is what is listening there. Public as
 *      `ensureCdpProfileGuard()` because every entry point that starts a proxy
 *      needs it, not just main.mjs.
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
 * Step 0.1 — 自动化 profile 守卫，独立可用。
 *
 * 用错 profile 不会报错，只会静默得出假的「登录墙」结论（2026-09-22：weibo 在
 * `~/.chrome-cdp` 上被判 login-wall，实际在 chrome-tiktok-profile 下返回 5500+ 字符
 * 真结果）。默认告警；`CDP_REQUIRE_AUTOMATION_PROFILE=1` 时改为硬失败（exit 1）。
 *
 * 从 `ensureCdpOrExit` 里拆出来是因为**它不是 main.mjs 的私有步骤**：任何自己调
 * `ensureCdpProxy()` 的入口都跳过了它。实测漏网的有两个（`selector-health.mjs`、
 * `search-sources.mjs`，两者都只调 cdp-client 的 `ensureCdpProxy()`）——于是同一仓
 * 里「主流程有守卫、旁路没有」，而旁路正是诊断脚本要看真话的地方。
 *
 * 非 darwin 平台是 no-op（profile 概念是 macOS 上 Chrome 的 user-data-dir）。
 *
 * @param {object} [options]
 * @param {"warn"|"throw"} [options.onMismatch] - 覆盖默认策略（默认读环境变量决定）
 * @returns {Promise<{ok: boolean, status: string, detail?: string}>}
 */
export async function ensureCdpProfileGuard({ onMismatch = null } = {}) {
  if (process.platform !== "darwin") return { ok: true, status: "skipped-not-darwin" };

  // Pin the port before anyone spawns a proxy.
  //
  // Warning about the wrong profile is not enough: the proxy picks its Chrome by
  // probing DevToolsActivePort, and with the user's daily Chrome (9222) running
  // alongside the automation one (9229) it can land on either. Setting
  // `WEB_ACCESS_CDP_PORT` is the proxy's highest-priority override and it
  // **hard-errors** rather than silently degrading when that port is not
  // listening — so the failure mode becomes "proxy refuses to start" (loud,
  // actionable) instead of "attached to the wrong browser and reported believable
  // wrong answers" (silent). Every descendant spawn inherits it via process.env,
  // so this also covers `cdp-client.ensureCdpProxy`, which spawns on its own.
  process.env.WEB_ACCESS_CDP_PORT = String(automationPort());

  // 守卫自身出错（模块缺失等）不是「profile 错了」，一律降级为告警——与拆分前一致。
  let checkAutomationProfile;
  let formatVerdict;
  try {
    ({ checkAutomationProfile, formatVerdict } = await import("./cdp-profile-guard.mjs"));
  } catch (e) {
    console.warn(`⚠️  Step 0.1: automation profile guard 跳过（${e.message}）`);
    return { ok: true, status: "guard-unavailable", detail: e.message };
  }

  let guard;
  try {
    guard = await checkAutomationProfile();
  } catch (e) {
    console.warn(`⚠️  Step 0.1: automation profile guard 跳过（${e.message}）`);
    return { ok: true, status: "guard-error", detail: e.message };
  }

  if (guard.status === "ok") {
    console.log(`✅ Step 0.1: CDP automation profile ok (${guard.expectedDir}:${guard.port})`);
    return { ok: true, status: guard.status };
  }

  const detail = formatVerdict(guard);
  if (onMismatch === "throw" || process.env.CDP_REQUIRE_AUTOMATION_PROFILE === "1") {
    console.error(`❌ Step 0.1: ${detail}`);
    process.exit(1);
  }
  console.warn(`⚠️  Step 0.1: ${detail}`);
  console.warn(
    "   （此环境下「登录墙」判决不可信；设 CDP_REQUIRE_AUTOMATION_PROFILE=1 可改为硬失败）",
  );
  return { ok: true, status: guard.status, detail };
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
  // Step 0.1: 自动化 profile 守卫 —— 与旁路入口共用同一实现，避免两边漂移。
  await ensureCdpProfileGuard();

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
