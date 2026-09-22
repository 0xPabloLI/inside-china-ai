import { describe, it, expect } from "vitest";
import {
  parseUserDataDir,
  judgeChromeProfile,
  launchCommand,
  automationProfileDir,
  automationPort,
  AUTOMATION_PROFILE_BASENAME,
  AUTOMATION_CDP_PORT,
} from "../lib/cdp-profile-guard.mjs";
import { LOGIN_SOURCES, getLoginSource, listLoginSources } from "../lib/cdp-login-sources.mjs";

const HOME = "/Users/someone";

describe("parseUserDataDir", () => {
  it("解析 --user-data-dir= 等号写法", () => {
    expect(
      parseUserDataDir(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/Users/someone/chrome-tiktok-profile --remote-debugging-port=9229",
      ),
    ).toBe("/Users/someone/chrome-tiktok-profile");
  });

  it("解析空格写法", () => {
    expect(parseUserDataDir("Chrome --user-data-dir /Users/someone/foo --flag")).toBe(
      "/Users/someone/foo",
    );
  });

  it("解析带引号的路径", () => {
    expect(parseUserDataDir('Chrome --user-data-dir="/Users/some one/p"')).toBe(
      "/Users/some one/p",
    );
  });

  it("没有该 flag 时返回 null（用户日常 Chrome 的情况）", () => {
    expect(parseUserDataDir("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")).toBeNull();
  });

  it("非字符串输入返回 null", () => {
    expect(parseUserDataDir(null)).toBeNull();
    expect(parseUserDataDir("")).toBeNull();
  });
});

describe("automationProfileDir / automationPort", () => {
  it("默认是 ~/chrome-tiktok-profile", () => {
    expect(automationProfileDir({}, HOME)).toBe(`${HOME}/${AUTOMATION_PROFILE_BASENAME}`);
  });

  it("CDP_AUTOMATION_PROFILE 可覆盖", () => {
    expect(
      automationProfileDir({ CDP_AUTOMATION_PROFILE: "/tmp/other-profile" }, HOME),
    ).toBe("/tmp/other-profile");
  });

  it("默认端口 9229，env 可覆盖", () => {
    expect(automationPort({})).toBe(AUTOMATION_CDP_PORT);
    expect(automationPort({ WEB_ACCESS_CDP_PORT: "9333" })).toBe(9333);
  });
});

describe("judgeChromeProfile", () => {
  const expected = `${HOME}/chrome-tiktok-profile`;

  it("ok：端口上正是自动化 profile", () => {
    const v = judgeChromeProfile({ userDataDir: expected, listening: true, expectedDir: expected, home: HOME });
    expect(v.status).toBe("ok");
    expect(v.fixCommand).toBeNull();
  });

  it("ok：尾斜杠差异不影响判定", () => {
    const v = judgeChromeProfile({ userDataDir: `${expected}/`, listening: true, expectedDir: expected, home: HOME });
    expect(v.status).toBe("ok");
  });

  it("no-chrome：端口没监听 → 给启动命令", () => {
    const v = judgeChromeProfile({ userDataDir: null, listening: false, expectedDir: expected, home: HOME });
    expect(v.status).toBe("no-chrome");
    expect(v.fixCommand).toContain(expected);
  });

  it("wrong-profile：跑在 ~/.chrome-cdp 上（2026-09-22 事故形态）", () => {
    const v = judgeChromeProfile({
      userDataDir: `${HOME}/.chrome-cdp`,
      listening: true,
      expectedDir: expected,
      home: HOME,
    });
    expect(v.status).toBe("wrong-profile");
    expect(v.message).toContain("凡登录门只会复现登录门");
  });

  it("unknown-profile：有 Chrome 但没带 --user-data-dir", () => {
    const v = judgeChromeProfile({ userDataDir: null, listening: true, expectedDir: expected, home: HOME });
    expect(v.status).toBe("unknown-profile");
    expect(v.actualDir).toBeNull();
  });
});

describe("launchCommand（唯一权威副本）", () => {
  it("包含 profile 目录与端口", () => {
    const cmd = launchCommand({ profileDir: `${HOME}/chrome-tiktok-profile`, port: 9229, home: HOME });
    expect(cmd).toContain('--user-data-dir="/Users/someone/chrome-tiktok-profile"');
    expect(cmd).toContain("--remote-debugging-port=9229");
    expect(cmd).toContain("--no-first-run");
  });
});

describe("LOGIN_SOURCES 判据（用真实抓取样本）", () => {
  it("ithome 匿名：302 到 /user-login/ 且提示登录以查看搜索结果 → 未登录", () => {
    expect(
      LOGIN_SOURCES.ithome.loggedIn({
        url: "https://www.ithome.com/user-login/index.htm?tip=%E7%99%BB%E5%BD%95",
        text: "登录以查看搜索结果",
      }),
    ).toBe(false);
  });

  it("ithome 已登录：搜索页有正文 → 已登录", () => {
    expect(
      LOGIN_SOURCES.ithome.loggedIn({
        url: "https://www.ithome.com/search/人工智能.html",
        text: "IT之家".repeat(200),
      }),
    ).toBe(true);
  });

  it("zhihu 匿名：含「登录/注册」→ 未登录", () => {
    expect(LOGIN_SOURCES.zhihu.loggedIn({ text: "登录/注册 | 未搜索到相关内容" })).toBe(false);
  });

  it("weibo 真结果：5548 字符且无登录提示 → 已登录（2026-09-23 实测）", () => {
    expect(LOGIN_SOURCES.weibo.loggedIn({ text: "搜索结果 综合 智搜".repeat(400) })).toBe(true);
  });

  it("douyin：仍显示「登录账号」→ 未登录", () => {
    expect(LOGIN_SOURCES.douyin.loggedIn({ text: "综合 | AI搜索 | 登录账号 | 人工智能" })).toBe(false);
  });

  it("每个源都有登录页 / 验证 URL / 判据三件套", () => {
    for (const s of listLoginSources()) {
      expect(s.loginUrl, s.key).toMatch(/^https?:\/\//);
      expect(s.verifyUrl(), s.key).toMatch(/^https?:\/\//);
      expect(typeof s.loggedIn, s.key).toBe("function");
    }
  });
});

describe("getLoginSource", () => {
  it("已知 key 返回该源，未知返回 null", () => {
    expect(getLoginSource("ithome").name).toContain("IT之家");
    expect(getLoginSource("nope")).toBeNull();
  });

  it("原型链上的键不被当成源（防 __proto__ 注入式误判）", () => {
    expect(getLoginSource("__proto__")).toBeNull();
    expect(getLoginSource("toString")).toBeNull();
  });
});
