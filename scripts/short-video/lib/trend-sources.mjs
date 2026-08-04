/**
 * Trend source collector definitions.
 *
 * Each source is a pluggable collector with:
 * - name: unique identifier
 * - label: display name
 * - needsAuth: whether login is required
 * - url(keyword): function to build search URL
 * - extractScript: CDP eval script to extract articles from DOM
 * - loginCheckScript: CDP eval script to check if login is needed (optional)
 * - useCleanTitle: whether to run cleanTitle on extracted titles
 *
 * Used by discover-trends.mjs.
 */

// ─── Existing news sources (migrated from discover-trends.mjs) ───

export const NEWS_SOURCES = [
  {
    name: "qbitai",
    label: "量子位",
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://www.qbitai.com/",
    extractScript: `
      var items = document.querySelectorAll('.article-item, .post-item, .list-item, article');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('.article-item-title, .post-item-title, h2, h3, .title');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 200 && a.href.includes('qbitai.com')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "jiqizhixin",
    label: "机器之心",
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://www.jiqizhixin.com/",
    extractScript: `
      var items = document.querySelectorAll('.article-list__item, .post-item, article, .list-item');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('.article__title, h2, h3, .title');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 200 && a.href.includes('jiqizhixin.com')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "36kr",
    label: "36氪",
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://36kr.com/",
    extractScript: `
      var items = document.querySelectorAll('.kr-flow-item, .article-item, .recommend-item, article');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('.kr-flow-item-title, .article-item-title, h2, h3, .title, .pcach-name');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 200 && a.href.includes('36kr.com')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "techcrunch",
    label: "TechCrunch AI",
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://techcrunch.com/category/artificial-intelligence/",
    extractScript: `
      var items = document.querySelectorAll('article.post, article, .post-block');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('h2.article__title, h2, h3, .article__title');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 15 && text.length < 200 && a.href.includes('techcrunch.com')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "bloomberg",
    label: "Bloomberg Tech",
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://www.bloomberg.com/technology",
    extractScript: `
      var items = document.querySelectorAll('article, .story-package, .lede-package');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('h3.lede-text-v2, h2, h3, .headline');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 15 && text.length < 200 && a.href.includes('bloomberg.com')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "guancha",
    label: "观察者网",
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://www.guancha.cn/",
    extractScript: `
      var items = document.querySelectorAll('.article-list li, .content-list .item, .module-art .item, article');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('h4, h3, .title, .re-title, a');
          if (link) {
            var titleText = title ? title.textContent.trim() : link.textContent.trim();
            if (titleText && titleText.length > 5 && titleText.length < 200) {
              results.push({ title: titleText, url: link.href });
            }
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 200 && a.href.includes('guancha.cn')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "ithome",
    label: "iThome",
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://www.ithome.com/",
    extractScript: `
      var items = document.querySelectorAll('.list .item, .news-list .item, .lst .item, article');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('.title, h3, h2, a[title]');
          if (link) {
            var titleText = title ? title.textContent.trim() : (link.getAttribute('title') || link.textContent.trim());
            if (titleText && titleText.length > 5 && titleText.length < 200) {
              results.push({ title: titleText, url: link.href });
            }
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 200 && a.href.includes('ithome.com')) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
];

// ─── New self-media sources (TE-T2) ───

export const SELF_MEDIA_SOURCES = [
  {
    name: "xhs",
    label: "小红书",
    needsAuth: true,
    useCleanTitle: true,
    url: (keyword) =>
      `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&type=1`,
    mcpFallback: {
      command: "python",
      args: ["-m", "xiaohongshu_mcp_server"],
      toolName: "search_feeds",
      toolArgs: (keyword) => ({ keyword, limit: 20 }),
      resultMapper: (items) =>
        items.map((item) => ({
          title: item.title || item.desc || item.note_card?.title || "",
          url: item.url || item.link || item.note_id || "",
        })),
    },
    loginCheckScript: `
      var body = document.body ? document.body.innerText : '';
      (body.includes('请先登录') || body.includes('扫码登录')) ? 'need_login' : 'ok'
    `,
    extractScript: `
      var items = document.querySelectorAll('.note-item, .search-result-item, [data-v-*] .note-content');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]') || (el.tagName === 'A' ? el : null);
          var title = el.querySelector('.title, .note-title, .desc, .content');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href*="/search_result/"], a[href*="/explore/"]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 5 && text.length < 200) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "sogou_weixin",
    label: "搜狗微信",
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) => `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(keyword)}`,
    mcpFallback: {
      command: "uvx",
      args: [
        "--from",
        "git+https://github.com/ptbsare/sogou-weixin-mcp-server",
        "sogou_weixin_mcp",
      ],
      toolName: "search_wechat_articles",
      toolArgs: (keyword) => ({ keyword, count: 20 }),
      resultMapper: (items) =>
        items.map((item) => ({
          title: item.title || item.article_title || "",
          url: item.url || item.link || item.article_url || "",
        })),
    },
    loginCheckScript: `
      var body = document.body ? document.body.innerText : '';
      (body.includes('请输入验证码') || document.querySelector('img[src*="captcha"]') || document.querySelector('#seccodeForm')) ? 'captcha' : 'ok'
    `,
    extractScript: `
      var items = document.querySelectorAll('.news-box .news-list li, .news-list li, .txt-box');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('h3 a, .txt-box h3 a, a[href]');
          var title = el.querySelector('h3, .txt-box h3');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('h3 a[href*="mp.weixin"], a[href*="mp.weixin"]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 5 && text.length < 200) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "weibo_hot",
    label: "微博热搜",
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://s.weibo.com/top/summary",
    mcpFallback: {
      command: "python",
      args: ["-m", "mcp_server_weibo"],
      toolName: "get_hot_search",
      toolArgs: () => ({}),
      resultMapper: (items) =>
        items.map((item) => ({
          title: item.word || item.title || item.query || "",
          url:
            item.url ||
            item.link ||
            `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word || item.title || "")}`,
        })),
    },
    extractScript: `
      var items = document.querySelectorAll('td.td-02 a');
      var results = [];
      items.forEach(function(a) {
        var text = a.textContent.trim();
        if (text.length > 1 && text.length < 100) {
          results.push({ title: text, url: a.href });
        }
      });
      return results;
    `,
  },
  {
    name: "bilibili",
    label: "B站搜索",
    needsAuth: false,
    useCleanTitle: true,
    url: (keyword) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`,
    mcpFallback: {
      command: "python",
      args: ["-m", "bilibili_mcp_server"],
      toolName: "search_videos",
      toolArgs: (keyword) => ({ keyword, count: 20 }),
      resultMapper: (items) =>
        items.map((item) => ({
          title: item.title || item.name || "",
          url: item.url || item.link || item.bvid || "",
        })),
    },
    extractScript: `
      var items = document.querySelectorAll('.video-list-item, .bili-video-card, .video-item');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('.bili-video-card__info--title, .title, h3, a[title]');
          if (link) {
            var titleText = title ? title.textContent.trim() : (link.getAttribute('title') || link.textContent.trim());
            if (titleText && titleText.length > 2) {
              results.push({ title: titleText, url: link.href });
            }
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href*="//www.bilibili.com/video/"]').forEach(function(a) {
          var text = (a.getAttribute('title') || a.textContent || '').trim();
          if (text.length > 5 && text.length < 200) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "douyin",
    label: "抖音搜索",
    needsAuth: true,
    useCleanTitle: true,
    url: (keyword) => `https://www.douyin.com/search/${encodeURIComponent(keyword)}`,
    mcpFallback: {
      command: "python",
      args: ["-m", "douyin_mcp"],
      toolName: "search_videos",
      toolArgs: (keyword) => ({ keyword, count: 20 }),
      resultMapper: (items) =>
        items.map((item) => ({
          title: item.title || item.desc || "",
          url: item.url || item.link || item.video_id || "",
        })),
    },
    loginCheckScript: `
      var loginModal = document.querySelector('[class*="login"], [class*="Login"]');
      var body = document.body ? document.body.innerText : '';
      (loginModal && body.includes('登录')) ? 'need_login' : 'ok'
    `,
    extractScript: `
      var items = document.querySelectorAll('[data-e2e="search_video-item"], ul[data-e2e="search-result-list"] li, .search-result-card');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('.title, [data-e2e="video-title"], a[title]');
          if (link) {
            var titleText = title ? title.textContent.trim() : (link.getAttribute('title') || link.textContent.trim());
            if (titleText && titleText.length > 2) {
              results.push({ title: titleText, url: link.href });
            }
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href*="/video/"]').forEach(function(a) {
          var text = (a.getAttribute('title') || a.textContent || '').trim();
          if (text.length > 5 && text.length < 200) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "tiktok_creator",
    label: "TikTok Creator",
    needsAuth: true,
    useCleanTitle: false,
    url: () => "https://www.tiktok.com/creator-center",
    loginCheckScript: `
      var body = document.body ? document.body.innerText : '';
      (!body || body.length < 100) ? 'need_login' : 'ok'
    `,
    extractScript: `
      // TikTok Creator Center Inspiration section
      // Extract trending videos from the "灵感" (Inspiration) tab
      var items = document.querySelectorAll('[data-e2e*="trend"], [data-e2e*="inspiration"], .inspiration-item, .trend-item');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('.title, [data-e2e*="title"], span');
          if (link && title) {
            var titleText = title.textContent.trim();
            if (titleText.length > 2 && titleText.length < 200) {
              results.push({ title: titleText, url: link.href });
            }
          }
        });
      }
      // Fallback: extract from the inspiration tab content
      if (results.length === 0) {
        var allLinks = document.querySelectorAll('a[href*="/video/"]');
        allLinks.forEach(function(a) {
          var text = (a.textContent || '').trim();
          if (text.length > 5 && text.length < 200) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "zhihu",
    label: "知乎",
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) => `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(keyword)}`,
    loginCheckScript: `
      var body = document.body ? document.body.innerText : '';
      (body.includes('登录') && body.includes('注册') && !body.includes('退出')) ? 'need_login' : 'ok'
    `,
    extractScript: `
      var items = document.querySelectorAll('.SearchResult-Card, .List-item, .Card.SearchResult-Card');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href*="/question/"], a[href*="/p/"], a[href*="/answer/"]');
          var title = el.querySelector('.ContentItem-title, h2, .title');
          if (link && title) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href*="/question/"], a[href*="/p/"]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 5 && text.length < 200) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results;
    `,
  },
  {
    name: "x_search",
    label: "X (Twitter)",
    needsAuth: true,
    useCleanTitle: false,
    url: (keyword) => `https://x.com/search?q=${encodeURIComponent(keyword)}&f=live`,
    loginCheckScript: `
      var body = document.body ? document.body.innerText : '';
      var url = window.location.href;
      (url.includes('/login') || url.includes('/i/flow/login') ||
       (body.includes('Sign in') && body.length < 500)) ? 'need_login' : 'ok'
    `,
    extractScript: `
      var tweets = document.querySelectorAll('[data-testid="tweet"]');
      var results = [];
      tweets.forEach(function(t) {
        var textEl = t.querySelector('[data-testid="tweetText"]');
        var timeEl = t.querySelector('time');
        var link = timeEl ? timeEl.closest('a') : null;
        var userEl = t.querySelector('a[href] [dir]');
        if (textEl) {
          var text = textEl.textContent.trim();
          results.push({
            title: text.substring(0, 150) + (text.length > 150 ? '...' : ''),
            url: link ? link.href : '',
            author: userEl ? userEl.textContent.trim() : '',
            publishedAt: timeEl ? timeEl.getAttribute('datetime') : ''
          });
        }
      });
      return results;
    `,
    cdpFallback: {
      url: (keyword) =>
        `https://www.google.com/search?q=${encodeURIComponent("site:x.com " + keyword)}`,
      extractScript: `
        var results = [];
        document.querySelectorAll('div.g, .Gx5Zad, .fP1Qef').forEach(function(el) {
          var link = el.querySelector('a[href]');
          var title = el.querySelector('h3, .LC20lb');
          if (link && title) {
            var url = link.href;
            if (url.includes('x.com') || url.includes('twitter.com')) {
              results.push({ title: title.textContent.trim(), url: url });
            }
          }
        });
        return results;
      `,
    },
  },
];

// ─── Directed WeChat account monitors ───
//
// Each entry monitors a specific WeChat Official Account by searching
// Google for republished articles (via 虎嗅, 新浪, ZAKER etc.) that cite
// the account. This is the most reliable method since:
//   - Sogou WeChat Search has aggressive anti-bot (returns empty via CDP)
//   - mp.weixin.qq.com profile_ext requires WeChat client (not Chrome)
//   - Google site:mp.weixin.qq.com indexes very few articles
//
// To add a new account, copy an entry and change name/label/account.
// If you have mp.weixin.qq.com backend cookie+token, also see WECHAT_API_CONFIG below.

export const WECHAT_ACCOUNT_SOURCES = [
  {
    name: "wechat_dongchabeating",
    label: "动察Beating（公众号）",
    account: "动察Beating",
    needsAuth: false,
    useCleanTitle: false,
    // Search for articles citing this WeChat account via republish platforms
    url: () =>
      `https://www.google.com/search?q=${encodeURIComponent('"来自微信公众号" "动察Beating"')}`,
    extractScript: `
      var results = [];
      // Google search results
      document.querySelectorAll('div.g, .Gx5Zad, .fP1Qef').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h3, .LC20lb');
        var snippet = el.querySelector('.VwiC3b, .IsZvec, [data-sncf]');
        if (link && title) {
          var url = link.href;
          // Only include articles from republish platforms or WeChat directly
          if (url.includes('mp.weixin.qq.com') || url.includes('huxiu.com') ||
              url.includes('sina.com.cn') || url.includes('myzaker.com') ||
              url.includes('qq.com') || url.includes('ifeng.com') ||
              url.includes('bohaishibei.com') || url.includes('eastmoney.com') ||
              url.includes('binance.com') || url.includes('t.me') ||
              url.includes('x.com') || url.includes('ithome.com')) {
            results.push({
              title: title.textContent.trim(),
              url: url,
              snippet: snippet ? snippet.textContent.trim().substring(0, 200) : ''
            });
          }
        }
      });
      return results;
    `,
  },
];

// WeChat Platform API configuration (optional, for direct article list crawling)
// Requires cookie + token from mp.weixin.qq.com login session.
// See: https://github.com/mashukui/wechat_official_account_crawler
// To enable: set env vars WX_COOKIE and WX_TOKEN, then the discover-trends
// script will call the WeChat API directly for each monitored account.
export const WECHAT_API_CONFIG = {
  enabled: false,
  searchApi: "https://mp.weixin.qq.com/cgi-bin/searchbiz",
  articleApi: "https://mp.weixin.qq.com/cgi-bin/appmsgpublish",
  // env vars: WX_COOKIE, WX_TOKEN
  // Flow: search account name → get fakeid
  //
  // Verified 2026-08-04:
  //   searchbiz (search account) — ✅ works, returns fakeid + nickname
  //   appmsgpublish?sub=list — ✅ works, but ONLY for own account's publish history
  //   appmsg?action=list_ex&fakeid=xxx — ❌ DISABLED by WeChat (returns "invalid args")
  //   Conclusion: cannot fetch other accounts' article lists via platform API.
  //   Use WECHAT_ACCOUNT_SOURCES (Google search for republished articles) instead.
};

// ─── All sources combined ───

export const ALL_SOURCES = [...NEWS_SOURCES, ...SELF_MEDIA_SOURCES, ...WECHAT_ACCOUNT_SOURCES];

/**
 * Default search keywords for self-media sources that require a keyword.
 */
export const DEFAULT_KEYWORDS = ["AI大模型", "China AI"];
