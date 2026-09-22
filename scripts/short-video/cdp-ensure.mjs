#!/usr/bin/env node
/**
 * cdp-ensure — CDP 自动化 profile 的幂等守卫 CLI。
 *
 * 用法：
 *   node scripts/short-video/cdp-ensure.mjs              # 只检查，打印状态
 *   node scripts/short-video/cdp-ensure.mjs --start       # 端口空闲时启动正确实例
 *   node scripts/short-video/cdp-ensure.mjs --print-cmd   # 打印启动命令（唯一权威副本）
 *   node scripts/short-video/cdp-ensure.mjs --json        # 机器可读
 *
 * 退出码：0 = ok；1 = 端口跑的不是自动化 profile / 端口空闲且未 --start。
 *
 * 为什么存在：用错 profile 不会报错，只会静默得出假的「登录墙」结论
 * （2026-09-22 事故：weibo 在错误 profile 下被判 login-wall，实际 5548 字符真结果）。
 * 文档记不住，所以做成可执行门禁。
 */

import {
  ensureAutomationProfile,
  checkAutomationProfile,
  automationProfileDir,
  automationPort,
  launchCommand,
  formatVerdict,
} from "./lib/cdp-profile-guard.mjs";

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const wantStart = args.includes("--start");
const wantCmd = args.includes("--print-cmd");

if (wantCmd) {
  console.log(launchCommand({ profileDir: automationProfileDir(), port: automationPort() }));
  process.exit(0);
}

const result = wantStart
  ? await ensureAutomationProfile({ start: true })
  : await checkAutomationProfile();

if (wantJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatVerdict(result));
  if (result.status === "ok") {
    console.log(`   profile: ${result.expectedDir}`);
    console.log(`   port:    ${result.port}${result.pid ? `  (pid ${result.pid})` : ""}`);
  }
}

process.exit(result.status === "ok" ? 0 : 1);
