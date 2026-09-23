/**
 * 需登录源的登录入口与「登录态」纯判据。
 *
 * 抽成 lib 是为了让 CLI 与单测共用同一份判据——判据若散在 CLI 里就无法测，
 * 而这正是 2026-09-22 事故的类型：判据不准 ⇒ 假结论（weibo 被误判 login-wall）。
 *
 * 每条 `loggedIn` 都只依赖 `{ url, text }`，便于用真实抓取样本直接写测试。
 *
 * @module cdp-login-sources
 */

const AI = "人工智能";

/**
 * @typedef {object} LoginSource
 * @property {string} name
 * @property {string} loginUrl - 登录页（可能是跨域 iframe 的真实 URL）
 * @property {string} clickText - 点击候选的正则（微信登录按钮）
 * @property {(kw?: string) => string} verifyUrl - 用哪个 URL 验证登录是否生效
 * @property {(s: {url?: string, text?: string}) => boolean} loggedIn
 * @property {string} [note]
 */

/** @type {Record<string, LoginSource>} */
export const LOGIN_SOURCES = {
  ithome: {
    name: "IT之家（软媒通行证）",
    // 登录表单在跨域 iframe 内（my.ruanmei.com），顶层页面 eval 打不进去 → 直接导航到这里
    loginUrl: "https://my.ruanmei.com/user-login/index.htm?cliextra=ithome",
    clickText: "微信登录|微信扫码|微信",
    verifyUrl: (kw = AI) => `https://www.ithome.com/search/${encodeURIComponent(kw)}.html`,
    // 匿名一律 302 到 /user-login/index.htm?...&tip=登录以查看搜索结果
    loggedIn: ({ url = "", text = "" }) =>
      !/\/user-login\//i.test(url) && !/登录以查看搜索结果/.test(text) && text.length > 400,
    note:
      "匿名与已登录都会被门禁 302；成功登录后搜索页应有正文且不再跳 /user-login/。" +
      "✅ 2026-09-23 实测：用户在本 profile 登录后搜索页出 64 条真结果（页眉带登录账号）——功能级收口。",
  },

  zhihu: {
    name: "知乎",
    loginUrl: "https://www.zhihu.com/signin",
    clickText: "微信",
    verifyUrl: (kw = AI) => `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(kw)}`,
    loggedIn: ({ text = "" }) =>
      !/登录\/注册/.test(text) && !/未搜索到相关内容/.test(text) && text.length > 200,
    note:
      "除微信扫码外还提供【验证码登录 / 密码登录】（中国 +86 短信）——不想扫码可走短信。" +
      "✅ 2026-09-23 实测：登录态下搜索页出 31 条真结果（页眉有「消息 / 私信」，无「登录 / 注册」）。" +
      "注意：`selector-health` 的 `zero_results` 曾是**水合竞态**（加载后立刻抽 0 条、1.6s 后 31 条），已改走 retry seam。",
  },

  douyin: {
    name: "抖音",
    loginUrl: "https://www.douyin.com/passport/login",
    clickText: "登录|登录账号",
    // 验证路由必须是**可用路由**：so.douyin.com/s?keyword= 只显示「登录账号 /
    // 正在生成回答…」（AI 搜索要另开），拿它验证会把「路由不对」读成「没登录」。
    verifyUrl: (kw = AI) => `https://www.douyin.com/search/${encodeURIComponent(kw)}?type=video`,
    // 登录判据 = 结果链接存在，而不是「页面里没有登录二字」。
    loggedIn: ({ text = "" }) => text.length > 600 && !/登录账号|登录后查看/.test(text),
    note:
      "⚠️ `/passport/login` 直接返回 `{error_code:22,description:非法应用}`（风控定向拦自动化" +
      "profile），**登录按钮点不动，必须由人手动登录**——这一点截至 2026-09-23 未变。" +
      "✅ 2026-09-23 复测（用户手动登录后）：搜索**通了**。`/search/{kw}?type=video` 抽出 20 条" +
      "真结果（`//www.douyin.com/video/{id}` + 真标题）。" +
      "❗同日更正：上一轮「登录也救不了 / 结果容器始终为空」是**测量方法造成的假结论**——" +
      "（a）综合 tab（默认无参数）的结果卡是纯 div + 背景图，卡内没有 `<a href>`，旧 articleScript" +
      "因此恒抽 0 条；`?type=video` 才有视频链接。（b）`/passport/login` 的 error_code:22 是" +
      "**登录入口**被拦，不是搜索页被拦，两件事被混成了「搜索不可用」。" +
      "脚本、`?type=video` 与报告字段都已在 lib 里同步修正（见 docs/selector-auto-healing.md 第三条轴）。",
  },

  weibo: {
    name: "微博",
    loginUrl: "https://passport.weibo.com/sso/signin",
    clickText: "微信|登录",
    verifyUrl: (kw = AI) => `https://s.weibo.com/weibo?q=${encodeURIComponent(kw)}&Refer=index`,
    loggedIn: ({ text = "" }) => text.length > 1500 && !/登录/.test(text.slice(0, 200)),
    note: "✅ 2026-09-22/23 实测：在 chrome-tiktok-profile 下返回 5500+ 字符真结果、零登录提示——已可用，无需登录。",
  },
};

/**
 * 列出源（供 CLI --list）。
 * @returns {Array<{key: string} & LoginSource>}
 */
export function listLoginSources() {
  return Object.entries(LOGIN_SOURCES).map(([key, v]) => ({ key, ...v }));
}

/**
 * 按 key 取源；未知 key 返回 null。
 * @param {string} key
 */
export function getLoginSource(key) {
  return Object.prototype.hasOwnProperty.call(LOGIN_SOURCES, key) ? LOGIN_SOURCES[key] : null;
}
