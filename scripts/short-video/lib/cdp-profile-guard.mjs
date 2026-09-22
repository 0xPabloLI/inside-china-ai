/**
 * CDP Profile Guard — 保证 CDP 实例跑在【带登录态的自动化 profile】上。
 *
 * 为什么需要它（2026-09-22 事故）：曾把 9229 起在 `~/.chrome-cdp`（无任何
 * 登录态的闲 profile）上，于是一切「登录墙」判决都退化成「这个 profile 没
 * 登录」的投影——weibo 被误判 `login-wall`，实际在正确 profile 下返回
 * 5548 字符真结果。**用错 profile 不会报错，只会静默得出假结论**，所以必须
 * 有代码级门禁，光靠文档记不住。
 *
 * 权威 profile：`~/chrome-tiktok-profile`（2026-09-07 建立；虽以 TikTok 命名，
 * 实为**所有需登录态 CDP 主层源的通用自动化 profile**，微博登录态也在此）。
 * 端口约定 9229（agent-harness 的 3456 代理自 2026-09-19 起钉在此端口）。
 *
 * 边界（AGENTS.md §Chrome 进程与 profile 守卫）：本模块**只读**，绝不 kill
 * Chrome、绝不写 `~/Library/Application Support/Google/Chrome/`。端口空闲时
 * 可以启动一个独立 profile 的实例；端口被别的 profile 占着时只报修复命令，
 * 由用户处置。
 *
 * @module cdp-profile-guard
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import { join } from "path";
import { spawn } from "child_process";

const execFileAsync = promisify(execFile);

export const AUTOMATION_PROFILE_BASENAME = "chrome-tiktok-profile";
export const AUTOMATION_CDP_PORT = 9229;
export const CHROME_APP =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * 期望的自动化 profile 目录。可用 `CDP_AUTOMATION_PROFILE` 覆盖（绝对路径）。
 * @param {object} [env]
 * @param {string} [home]
 * @returns {string}
 */
export function automationProfileDir(env = process.env, home = homedir()) {
  const override = (env.CDP_AUTOMATION_PROFILE || "").trim();
  if (override) return override.replace(/^~/, home);
  return join(home, AUTOMATION_PROFILE_BASENAME);
}

/**
 * 自动化端口。可用 `WEB_ACCESS_CDP_PORT` / `CDP_AUTOMATION_PORT` 覆盖。
 * @param {object} [env]
 * @returns {number}
 */
export function automationPort(env = process.env) {
  const raw = env.CDP_AUTOMATION_PORT || env.WEB_ACCESS_CDP_PORT;
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : AUTOMATION_CDP_PORT;
}

/**
 * 从 Chrome 进程 argv（整条命令行字符串）里解析 `--user-data-dir`。
 * 支持 `--user-data-dir=/a/b`（等号）与 `--user-data-dir /a/b`（空格）两种写法。
 * @param {string} argv
 * @returns {string|null}
 */
export function parseUserDataDir(argv) {
  if (typeof argv !== "string" || !argv) return null;
  const eq = argv.match(/--user-data-dir[= ]+("[^"]+"|'[^']+'|\S+)/);
  if (!eq) return null;
  return eq[1].replace(/^["']|["']$/g, "");
}

/**
 * 归一化路径比较（去尾斜杠、解 `~`）。
 * @param {string|null} a
 * @param {string|null} b
 * @param {string} [home]
 * @returns {boolean}
 */
function sameDir(a, b, home = homedir()) {
  if (!a || !b) return false;
  const norm = (p) => p.replace(/^~/, home).replace(/\/+$/, "");
  return norm(a) === norm(b);
}

/**
 * 判定「端口上的 Chrome 是不是我们要的那个 profile」。
 * 纯函数，便于单测。
 *
 * @param {object} input
 * @param {string|null} input.userDataDir - 端口上 Chrome 的 --user-data-dir（null = 没开调试或没解析到）
 * @param {boolean} input.listening - 端口是否在监听
 * @param {string} [input.expectedDir]
 * @param {number} [input.port]
 * @param {string} [input.home]
 * @returns {{status: 'ok'|'no-chrome'|'wrong-profile'|'unknown-profile', message: string, expectedDir: string, actualDir: string|null, fixCommand: string|null}}
 */
export function judgeChromeProfile({
  userDataDir = null,
  listening = false,
  expectedDir,
  port = AUTOMATION_CDP_PORT,
  home = homedir(),
}) {
  const expected = expectedDir || join(home, AUTOMATION_PROFILE_BASENAME);
  if (!listening) {
    return {
      status: "no-chrome",
      message:
        `端口 ${port} 无 Chrome 监听 —— CDP 不可用。` +
        `正确实例应跑在 ${expected}（带登录态的自动化 profile）。`,
      expectedDir: expected,
      actualDir: null,
      fixCommand: launchCommand({ profileDir: expected, port }),
    };
  }
  if (sameDir(userDataDir, expected, home)) {
    return {
      status: "ok",
      message: `端口 ${port} 上是正确的自动化 profile：${expected}`,
      expectedDir: expected,
      actualDir: userDataDir,
      fixCommand: null,
    };
  }
  if (!userDataDir) {
    return {
      status: "unknown-profile",
      message:
        `端口 ${port} 上有 Chrome 但未带 --user-data-dir（多半是用户日常 Chrome；` +
        `Chrome 136+ 也禁止在默认 profile 目录上开调试，端点一律 404）。` +
        `不要拿它做 CDP 二次意见——登录态不在里面。`,
      expectedDir: expected,
      actualDir: null,
      fixCommand: launchCommand({ profileDir: expected, port }),
    };
  }
  return {
    status: "wrong-profile",
    message:
      `端口 ${port} 上跑的是 ${userDataDir}，不是自动化 profile ${expected}。` +
      `在错误 profile 上跑「第二次意见」= 凡登录门只会复现登录门（2026-09-22 事故）。`,
    expectedDir: expected,
    actualDir: userDataDir,
    fixCommand: launchCommand({ profileDir: expected, port }),
  };
}

/**
 * 启动命令的**唯一权威副本**。文档不得再抄一份（两处必然漂移）。
 * @param {object} [opts]
 * @param {string} [opts.profileDir]
 * @param {number} [opts.port]
 * @param {string} [opts.home]
 * @returns {string} 可直接执行的 shell 命令
 */
export function launchCommand({
  profileDir,
  port = AUTOMATION_CDP_PORT,
  home = homedir(),
} = {}) {
  const dir = profileDir || join(home, AUTOMATION_PROFILE_BASENAME);
  return (
    `open -na "Google Chrome" --args --user-data-dir="${dir}" ` +
    `--remote-debugging-port=${port} --no-first-run --no-default-browser-check about:blank`
  );
}

/**
 * 探测端口上的 Chrome 用了哪个 profile（本机 `lsof` + `ps`，只读）。
 * macOS 专用；非 macOS 返回 `{ listening: false, userDataDir: null, pid: null, reason }`。
 *
 * @param {object} [opts]
 * @param {number} [opts.port]
 * @param {object} [opts.env]
 * @returns {Promise<{listening: boolean, pid: number|null, userDataDir: string|null, argv: string|null}>}
 */
export async function inspectChromeOnPort({
  port = AUTOMATION_CDP_PORT,
  env = process.env,
} = {}) {
  if (process.platform !== "darwin") {
    return { listening: false, pid: null, userDataDir: null, argv: null };
  }
  let lsofOut = "";
  try {
    ({ stdout: lsofOut } = await execFileAsync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { timeout: 5000 },
    ));
  } catch {
    return { listening: false, pid: null, userDataDir: null, argv: null };
  }
  const pid = Number.parseInt(String(lsofOut).split("\n")[0].trim(), 10);
  if (!Number.isFinite(pid)) {
    return { listening: false, pid: null, userDataDir: null, argv: null };
  }
  let argv = null;
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-ww", "-o", "command="], {
      timeout: 5000,
    });
    argv = String(stdout).trim() || null;
  } catch {
    /* 进程已退出 */
  }
  const processEnv = env || {};
  return {
    listening: true,
    pid,
    userDataDir: parseUserDataDir(argv),
    argv,
    // 供调用方判断是否为 agent 自起实例（非 profile 数据，只读）
    home: processEnv.HOME || homedir(),
  };
}

/**
 * 一次性检查：端口上的 Chrome 是不是自动化 profile。
 * @param {object} [opts]
 * @returns {Promise<object>} judgeChromeProfile 的结果 + pid
 */
export async function checkAutomationProfile(opts = {}) {
  const env = opts.env || process.env;
  const port = opts.port || automationPort(env);
  const expectedDir = opts.expectedDir || automationProfileDir(env);
  const info = await inspectChromeOnPort({ port, env });
  const verdict = judgeChromeProfile({
    userDataDir: info.userDataDir,
    listening: info.listening,
    expectedDir,
    port,
  });
  return { ...verdict, port, pid: info.pid ?? null };
}

/**
 * 端口空闲时启动正确的实例（独立 profile，不触碰用户日常 Chrome）。
 * 端口被别的 profile 占用时**不 kill**，只返回 verdict 让用户处置。
 *
 * @param {object} [opts]
 * @param {boolean} [opts.start=false] - 端口空闲时是否启动
 * @param {number} [opts.waitMs=8000] - 启动后轮询 /json/version 的预算
 * @returns {Promise<object>} verdict + started
 */
export async function ensureAutomationProfile({
  start = false,
  waitMs = 8000,
  env = process.env,
  port,
  expectedDir,
} = {}) {
  const verdict = await checkAutomationProfile({ env, port, expectedDir });
  if (verdict.status !== "no-chrome" || !start) return { ...verdict, started: false };

  const dir = verdict.expectedDir;
  const child = spawn(
    "open",
    [
      "-na",
      "Google Chrome",
      "--args",
      `--user-data-dir=${dir}`,
      `--remote-debugging-port=${verdict.port}`,
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 600));
    try {
      const resp = await fetch(`http://127.0.0.1:${verdict.port}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (resp.ok) {
        return {
          ...(await checkAutomationProfile({ env, port: verdict.port, expectedDir: dir })),
          started: true,
        };
      }
    } catch {
      /* 还没起来 */
    }
  }
  return { ...verdict, started: false, message: `${verdict.message}（已尝试启动但未就绪）` };
}

/**
 * 供 preflight / CLI 使用的单行提示文本。
 * @param {object} verdict
 * @returns {string}
 */
export function formatVerdict(verdict) {
  const icon =
    verdict.status === "ok"
      ? "✅"
      : verdict.status === "wrong-profile"
        ? "⛔"
        : "⚠️";
  const lines = [`${icon} ${verdict.message}`];
  if (verdict.fixCommand) lines.push(`   → ${verdict.fixCommand}`);
  return lines.join("\n");
}
