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
    verifyUrl: (kw = AI) =>
      `https://so.douyin.com/s?search_entrance=aweme&keyword=${encodeURIComponent(kw)}`,
    loggedIn: ({ text = "" }) => !/登录账号/.test(text) && text.length > 1000,
    note:
      "⚠️ 2026-09-23 实测：`/passport/login` 直接返回 `{error_code:22,description:非法应用}`，" +
      "合成指针事件也撑不开登录弹窗——抖音风控把自动化 profile 判为非法应用。" +
      "（例外：so.douyin.com 的「AI搜索」正文有时能出内容，属偶发，不算登录成功。）" +
      "❌ 2026-09-23 复测（用户已登录）：登录在 `www.douyin.com` 确实生效（无登录提示、有「我的」），" +
      "但 `www.douyin.com/search/` 的结果容器 `scroll-list` 始终为空（0 卡片 / 0 video 链接 / title 空），" +
      "反爬插页 t+3.5s 起稳定命中 `captcha` → **登录不是它的修复路径**，要搜索得改走 iesdouyin 分享页思路。",
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
