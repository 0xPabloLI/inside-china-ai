/**
 * Source Registry — Single source of source definitions.
 *
 * All search sources for the content pipeline are defined here.
 * Both trend discovery (--trend) and deep research (--research) modes
 * in search-sources.mjs read from this registry.
 *
 * Each source is a pluggable collector with:
 * - name: unique identifier
 * - label: display name
 * - category: "news" | "self_media" | "general" | "western" | "last30days" | "wechat"
 * - needsAuth: whether login is required
 * - supportsKeyword: whether the source supports keyword search (vs homepage-only)
 * - accessMethod: how this source is collected
 *     { primary: "cdp" | "api" | "mcp",
 *       fallbacks: ["cdp" | "mcp" | ...],
 *       notes: "human-readable description of collection method" }
 * - url(keyword): function to build search URL (keyword ignored if supportsKeyword=false)
 * - extractScript: CDP eval script to extract articles from DOM
 * - loginCheckScript: CDP eval script to check if login is needed (optional)
 * - useCleanTitle: whether to run cleanTitle on extracted titles
 * - apiSearch: API direct-connect config (optional, Issue #34)
 *     { url(keyword), parser(responseText), authRequired, headers }
 * - cdpFallback: Google site: search fallback config (optional)
 * - mcpFallback: MCP server fallback config (optional)
 *
 * Collection layer order (in search-sources.mjs collectFromSource):
 *   1. apiSearch (if configured) — direct API call, parse JSON/XML response
 *   2. CDP (primary for most sources)
 *   3. cdpFallback (Google site: search, if configured)
 *   4. mcpFallback (mcp-search-bridge/Grok, if configured)
 *
 * Used by search-sources.mjs.
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// mcp-search-bridge server.js path.
// Installed at ~/mcp-search-bridge/server.js (git clone).
// Override with MCP_SEARCH_BRIDGE_PATH env var if installed elsewhere.
const MCP_SEARCH_BRIDGE_SERVER =
  process.env.MCP_SEARCH_BRIDGE_PATH || join(homedir(), "mcp-search-bridge", "server.js");

// Node executable (for spawning MCP server via mcp-search-bridge)
const NODE_BIN = "node";

// ─── Existing news sources ───

export const NEWS_SOURCES = [
  {
    name: "qbitai",
    label: "量子位",
    category: "news",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes: "CDP only. Homepage scraping via DOM selectors. No public API.",
    },
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
    category: "news",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes: "CDP only. Homepage scraping. No public API.",
    },
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
    category: "news",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes: "CDP only. Homepage scraping. No public API.",
    },
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
    category: "news",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes: "CDP only. Category page scraping. No public API.",
    },
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
    category: "news",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes: "CDP only. Tech section scraping. No public API (paywall).",
    },
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
    category: "news",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes: "CDP only. Homepage scraping. No public API.",
    },
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
    category: "news",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes: "CDP only. Homepage scraping. No public API.",
    },
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
    category: "self_media",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: ["mcp"],
      notes: "CDP (requires login) → MCP fallback (RedNote-MCP search_feeds). needsAuth=true.",
    },
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
    category: "self_media",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: ["mcp"],
      notes: "CDP → MCP fallback (search_wechat_articles). Has captcha check.",
    },
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
    category: "self_media",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      fallbacks: ["mcp"],
      notes:
        "CDP (hot search page) → MCP fallback (get_hot_search). No keyword search, homepage-only.",
    },
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
    category: "self_media",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: ["mcp"],
      notes:
        "CDP (search page) → MCP fallback (search_videos). Has 412 anti-bot intermittent issues.",
    },
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
    category: "self_media",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: ["mcp"],
      notes: "CDP (requires login) → MCP fallback (search_videos). needsAuth=true.",
    },
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
    category: "self_media",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes:
        "CDP only (requires login). Creator Center page. No MCP fallback. No keyword search, homepage-only.",
    },
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
    category: "self_media",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes: "CDP only. Search page scraping. No MCP fallback.",
    },
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
    category: "self_media",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: ["cdp", "mcp"],
      notes:
        "CDP (requires login) → cdpFallback (Google site:x.com) → mcpFallback (mcp-search-bridge/Grok, native X data). needsAuth=true.",
    },
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
    // mcp-search-bridge as MCP fallback — uses Grok model which has native
    // access to X/Twitter data. Returns higher-quality results than CDP DOM
    // scraping: full tweet text, author handles, and URLs.
    // Configured via env: SEARCH_BASE_URL, SEARCH_API_KEY, SEARCH_MODEL
    mcpFallback: {
      command: NODE_BIN,
      args: [MCP_SEARCH_BRIDGE_SERVER],
      // Env vars (SEARCH_BASE_URL, SEARCH_API_KEY, SEARCH_MODEL) are inherited
      // from process.env via spawn in mcp-client.mjs
      toolName: "web_search",
      toolArgs: (keyword) => ({
        query: `Search X/Twitter for recent posts about "${keyword}". List the top 10 most relevant tweets. For each tweet, include: full text, author display name, author handle (@), and the tweet URL. Format as a numbered list.`,
      }),
      timeoutMs: 60000,
      resultMapper: (items) => {
        // mcp-search-bridge returns natural-language text, not JSON.
        // parseMcpResult wraps it as [{ text: "..." }].
        // Parse the text to extract individual tweets.
        const text = items[0]?.text || "";
        const tweets = [];
        const lines = text.split("\n");
        let currentTweet = null;
        for (const line of lines) {
          // Match start of a tweet entry (numbered list)
          const numMatch = line.match(/^\*?(\d+)\.\s*\*\*Full text\*\*:\s*"(.+)"/i);
          if (numMatch) {
            if (currentTweet) tweets.push(currentTweet);
            currentTweet = { title: numMatch[2].substring(0, 150), url: "", author: "" };
            continue;
          }
          // Also match entries that start with a number and quote
          const altMatch = line.match(/^\*?(\d+)\.\s*"(.+)"/);
          if (altMatch && !currentTweet) {
            currentTweet = { title: altMatch[2].substring(0, 150), url: "", author: "" };
            continue;
          }
          // Extract author
          if (currentTweet) {
            const authorMatch = line.match(/\*\*Author\*\*:\s*(.+?)(?:\s*\((@[\w]+)\))?/i);
            if (authorMatch) {
              currentTweet.author = authorMatch[2] || authorMatch[1];
            }
            // Extract URL
            const urlMatch = line.match(/\*\*URL\*\*:\s*(https?:\/\/[\w./-]+)/i);
            if (urlMatch) {
              currentTweet.url = urlMatch[1];
            }
            // Also catch URLs in the text
            const inlineUrl = line.match(/(https?:\/\/(?:x\.com|twitter\.com)\/[\w./-]+)/i);
            if (inlineUrl && !currentTweet.url) {
              currentTweet.url = inlineUrl[1];
            }
          }
        }
        if (currentTweet) tweets.push(currentTweet);
        return tweets;
      },
    },
  },
];

// ─── Western/English sources (from last30days default search) ───
//
// These sources are duplicated from the last30days skill's default search
// (LAST30DAYS_DEFAULT_SEARCH in ~/.config/last30days/.env) to provide
// cross-platform coverage. They may contain Chinese-language content
// relevant to China AI topics.
//
// Primary collection method: mcp-search-bridge (Grok model with web search).
// CDP is attempted first (if a search page URL exists), but these western
// platforms often don't have China-optimized search pages, so the MCP
// fallback is the main workhorse.
//
// Env vars required: SEARCH_BASE_URL, SEARCH_API_KEY, SEARCH_MODEL

// Shared mcp-search-bridge resultMapper for list-style search results.
// Grok returns numbered lists with title, URL, and optional metadata.
function parseGrokListResult(items) {
  const text = items[0]?.text || "";
  const results = [];
  const lines = text.split("\n");
  let current = null;
  for (const line of lines) {
    // Match numbered list entries with bold title or quoted text
    const titleMatch = line.match(/^\*?(\d+)\.\s*\*\*(.+?)\*\*/);
    const quoteMatch = line.match(/^\*?(\d+)\.\s*"(.+?)"/);
    const plainMatch = line.match(/^\*?(\d+)\.\s*(.+)/);
    if (titleMatch) {
      if (current) results.push(current);
      current = { title: titleMatch[2].substring(0, 200), url: "", author: "" };
      continue;
    } else if (quoteMatch) {
      if (current) results.push(current);
      current = { title: quoteMatch[2].substring(0, 200), url: "", author: "" };
      continue;
    } else if (plainMatch && !current) {
      current = { title: plainMatch[2].substring(0, 200), url: "", author: "" };
      continue;
    }
    if (current) {
      // Extract URLs
      const urlMatch = line.match(/\*\*URL\*\*:\s*(https?:\/\/[\w./\-?=&]+)/i);
      if (urlMatch) current.url = urlMatch[1];
      const inlineUrl = line.match(/(https?:\/\/[\w./\-?=&]+)/);
      if (inlineUrl && !current.url) current.url = inlineUrl[1];
      // Extract author
      const authorMatch = line.match(/\*\*Author\*\*:\s*(.+?)(?:\s*\((@[\w]+)\))?/i);
      if (authorMatch) current.author = authorMatch[2] || authorMatch[1];
    }
  }
  if (current) results.push(current);
  return results;
}

export const WESTERN_SOURCES = [
  {
    name: "youtube_search",
    label: "YouTube",
    category: "western",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: ["mcp"],
      notes: "CDP (search results) → MCP fallback (mcp-search-bridge/Grok web_search).",
    },
    useCleanTitle: false,
    url: (keyword) => `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`,
    extractScript: `
      var items = document.querySelectorAll('ytd-video-renderer, ytd-channel-renderer, .yt-simple-endpoint');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href*="/watch"], a[href*="/channel"]');
          var title = el.querySelector('#video-title, .title, yt-formatted-string');
          if (link) {
            var titleText = title ? title.textContent.trim() : (link.getAttribute('title') || link.textContent.trim());
            if (titleText && titleText.length > 3) {
              results.push({ title: titleText, url: link.href });
            }
          }
        });
      }
      return results.slice(0, 20);
    `,
    mcpFallback: {
      command: NODE_BIN,
      args: [MCP_SEARCH_BRIDGE_SERVER],
      toolName: "web_search",
      toolArgs: (keyword) => ({
        query: `Search YouTube for recent videos about "${keyword}" or "China AI". List the top 10 most relevant videos. For each, include: video title, channel name, and YouTube URL.`,
      }),
      timeoutMs: 60000,
      resultMapper: parseGrokListResult,
    },
  },
  {
    name: "arxiv_search",
    label: "arXiv",
    category: "western",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      fallbacks: ["cdp", "mcp"],
      notes: "API (arXiv Atom XML) → CDP fallback → MCP fallback.",
    },
    useCleanTitle: false,
    // arXiv API: returns Atom XML feed with <entry> elements
    apiSearch: {
      url: (keyword) =>
        `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(keyword)}&max_results=10&sortBy=submittedDate&sortOrder=descending`,
      parser: (text) => {
        const results = [];
        // Parse <entry> elements from Atom XML
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;
        while ((match = entryRegex.exec(text)) !== null) {
          const entry = match[1];
          const title = entry.match(/<title>([\s\S]*?)<\/title>/);
          const id = entry.match(/<id>([\s\S]*?)<\/id>/);
          const link = entry.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/);
          const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/);
          const published = entry.match(/<published>([\s\S]*?)<\/published>/);
          if (title && (link || id)) {
            results.push({
              title: title[1].trim().replace(/\n/g, " "),
              url: link ? link[1] : id ? id[1].trim() : "",
              snippet: summary ? summary[1].trim().replace(/\n/g, " ").substring(0, 200) : "",
              publishedAt: published ? published[1].trim() : "",
            });
          }
        }
        return results;
      },
      authRequired: false,
    },
    url: (keyword) =>
      `https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(keyword)}`,
    extractScript: `
      var items = document.querySelectorAll('.arxiv-result, li.arxiv-result');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var title = el.querySelector('.title.is-link, .title a, p.title');
          var link = el.querySelector('a[href*="/abs/"]');
          if (title && link) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href*="/abs/"]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 300) {
            results.push({ title: text, url: a.href });
          }
        });
      }
      return results.slice(0, 20);
    `,
    mcpFallback: {
      command: NODE_BIN,
      args: [MCP_SEARCH_BRIDGE_SERVER],
      toolName: "web_search",
      toolArgs: (keyword) => ({
        query: `Search arxiv.org for recent papers about "${keyword}" or "China AI" or "Chinese AI". List the top 10 most relevant papers. For each, include: paper title, authors, and arXiv URL (arxiv.org/abs/...).`,
      }),
      timeoutMs: 60000,
      resultMapper: parseGrokListResult,
    },
  },
  {
    name: "github_search",
    label: "GitHub",
    category: "western",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      fallbacks: ["cdp", "mcp"],
      notes:
        "API (GitHub Search API, 60 req/hour without token, 5000 with GITHUB_TOKEN) → CDP fallback → MCP fallback.",
    },
    useCleanTitle: false,
    // GitHub Search API: returns JSON with items[] containing full_name, html_url, description
    apiSearch: {
      url: (keyword) =>
        `https://api.github.com/search/repositories?q=${encodeURIComponent(keyword)}&sort=updated&order=desc&per_page=10`,
      parser: (text) => {
        const data = JSON.parse(text);
        if (!data.items) return [];
        return data.items.map((item) => ({
          title: item.full_name || item.name || "",
          url: item.html_url || "",
          snippet: item.description ? item.description.substring(0, 200) : "",
        }));
      },
      authRequired: false,
      // Optional: set GITHUB_TOKEN env var to increase rate limit from 60 to 5000 req/hour
      headers: process.env.GITHUB_TOKEN
        ? {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
          }
        : { Accept: "application/vnd.github+json" },
    },
    url: (keyword) =>
      `https://github.com/search?q=${encodeURIComponent(keyword)}&type=repositories&s=updated&o=desc`,
    extractScript: `
      var items = document.querySelectorAll('.repo-list-item, .hx_hit-repo, div[data-testid="results-list"] > div');
      var results = [];
      if (items.length > 0) {
        items.forEach(function(el) {
          var link = el.querySelector('a[href*="/"][href]:not([href*="/search"])');
          var title = el.querySelector('h2, h3, .repo-list-name a, a.v-align-middle');
          if (link) {
            var titleText = title ? title.textContent.trim() : link.textContent.trim();
            if (titleText && titleText.length > 2) {
              results.push({ title: titleText, url: link.href });
            }
          }
        });
      }
      if (results.length === 0) {
        document.querySelectorAll('a[href^="/"][href]:not([href*="/search/"])').forEach(function(a) {
          var href = a.href;
          var text = a.textContent.trim();
          if (href.includes('github.com') && text.length > 3 && text.length < 200) {
            var path = new URL(href).pathname;
            if (path.split('/').length >= 3 && !path.includes('/settings/') && !path.includes('/notifications')) {
              results.push({ title: text, url: href });
            }
          }
        });
      }
      return results.slice(0, 20);
    `,
    mcpFallback: {
      command: NODE_BIN,
      args: [MCP_SEARCH_BRIDGE_SERVER],
      toolName: "web_search",
      toolArgs: (keyword) => ({
        query: `Search GitHub for repositories about "${keyword}" or "China AI" or "Chinese LLM". List the top 10 most relevant repos. For each, include: repo name (owner/repo), description, and GitHub URL.`,
      }),
      timeoutMs: 60000,
      resultMapper: parseGrokListResult,
    },
  },
  {
    name: "threads_search",
    label: "Threads",
    category: "western",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: ["mcp"],
      notes:
        "CDP (search page, limited) → MCP fallback (primary method). Threads has no public API.",
    },
    useCleanTitle: false,
    // Threads doesn't have a public search page; MCP is the primary method
    url: (keyword) => `https://www.threads.net/search?q=${encodeURIComponent(keyword)}`,
    extractScript: `
      var items = document.querySelectorAll('[data-pressable-container], article, div[role="article"]');
      var results = [];
      items.forEach(function(el) {
        var text = el.innerText || el.textContent || '';
        text = text.trim().substring(0, 200);
        if (text.length > 10) {
          results.push({ title: text, url: '' });
        }
      });
      return results.slice(0, 20);
    `,
    mcpFallback: {
      command: NODE_BIN,
      args: [MCP_SEARCH_BRIDGE_SERVER],
      toolName: "web_search",
      toolArgs: (keyword) => ({
        query: `Search Threads (Meta's Threads app) for recent posts about "${keyword}" or "China AI". List the top 10 most relevant posts. For each, include: post text, author name, and Threads URL.`,
      }),
      timeoutMs: 60000,
      resultMapper: parseGrokListResult,
    },
  },
];

// ─── General search sources ───
//
// General-purpose web search engines. These are keyword-based sources that
// search the entire web (not a specific platform). Useful for broad coverage
// in both --trend and --research modes.
//
// google_search:   Google CDP + MCP fallback (was "web_grounding")
// baidu_search:    Baidu CDP (Chinese-language search, no MCP fallback needed)
// mcp_grok_search: mcp-search-bridge only (Grok web search, no CDP)

export const GENERAL_SEARCH_SOURCES = [
  {
    name: "google_search",
    label: "Google Search",
    category: "general",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: ["mcp"],
      notes: "CDP (Google search) → MCP fallback (mcp-search-bridge/Grok). General web search.",
    },
    useCleanTitle: false,
    url: (keyword) =>
      `https://www.google.com/search?q=${encodeURIComponent(keyword + " China AI")}`,
    extractScript: `
      var results = [];
      document.querySelectorAll('div.g, .Gx5Zad, .fP1Qef').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h3, .LC20lb');
        var snippet = el.querySelector('.VwiC3b, .IsZvec, [data-sncf]');
        if (link && title) {
          results.push({
            title: title.textContent.trim(),
            url: link.href,
            snippet: snippet ? snippet.textContent.trim().substring(0, 200) : ''
          });
        }
      });
      return results.slice(0, 20);
    `,
    mcpFallback: {
      command: NODE_BIN,
      args: [MCP_SEARCH_BRIDGE_SERVER],
      toolName: "web_search",
      toolArgs: (keyword) => ({
        query: `Search the web for recent news and discussions about "${keyword}" or "China AI" in Chinese (中文) and English. List the top 10 most relevant articles or posts. For each, include: title, source name, and URL.`,
      }),
      timeoutMs: 60000,
      resultMapper: parseGrokListResult,
    },
  },
  {
    name: "baidu_search",
    label: "百度搜索",
    category: "general",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes: "CDP only. Baidu search page scraping. Chinese-language search. No MCP fallback.",
    },
    useCleanTitle: false,
    url: (keyword) => `https://www.baidu.com/s?wd=${encodeURIComponent(keyword + " AI")}`,
    extractScript: `
      var results = [];
      document.querySelectorAll('.result, .c-container, .new-pmd').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h3, .t, .c-title');
        var snippet = el.querySelector('.c-abstract, .content-right_8Zs40, [class*="abstract"]');
        if (link && title) {
          var titleText = title.textContent.trim();
          if (titleText.length > 5) {
            results.push({
              title: titleText,
              url: link.href,
              snippet: snippet ? snippet.textContent.trim().substring(0, 200) : ''
            });
          }
        }
      });
      return results.slice(0, 20);
    `,
  },
  {
    name: "mcp_grok_search",
    label: "Grok Web Search",
    category: "general",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "mcp",
      fallbacks: [],
      notes: "MCP only (mcp-search-bridge/Grok). No CDP page. Grok web search with China AI focus.",
    },
    useCleanTitle: false,
    // No CDP page — MCP is the only method
    url: () => "",
    extractScript: `return [];`,
    mcpFallback: {
      command: NODE_BIN,
      args: [MCP_SEARCH_BRIDGE_SERVER],
      toolName: "web_search",
      toolArgs: (keyword) => ({
        query: `Search the web for the latest news about "${keyword}" focusing on Chinese AI companies, products, and developments. Include both Chinese and English sources. List the top 10 results with title, source, and URL.`,
      }),
      timeoutMs: 60000,
      resultMapper: parseGrokListResult,
    },
  },
];

// ─── last30days exclusive sources ───
//
// These sources are unique to the last30days skill and are not available
// in search-sources' CDP-based scraping. They are included here for
// completeness and future integration.
// Note: These currently have no CDP extractScript — they require API-based
// collection (to be implemented in a future ticket).

export const LAST30DAYS_SOURCES = [
  {
    name: "reddit_search",
    label: "Reddit",
    category: "last30days",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      fallbacks: ["cdp"],
      notes:
        "API (reddit.com/search.json, free, no auth) → CDP fallback. Reddit returns JSON directly.",
    },
    useCleanTitle: false,
    // Reddit JSON API: direct fetch returns JSON, no CDP needed
    apiSearch: {
      url: (keyword) =>
        `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=10`,
      parser: (text) => {
        const data = JSON.parse(text);
        if (!data.data || !data.data.children) return [];
        return data.data.children.map((child) => {
          const post = child.data;
          return {
            title: post.title || "",
            url: `https://reddit.com${post.permalink || ""}`,
            author: post.author || "",
            publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : "",
          };
        });
      },
      authRequired: false,
      headers: { "User-Agent": "ChinaAINews/1.0" },
    },
    // CDP fallback: same URL, but parsed via DOM (extractScript)
    url: (keyword) =>
      `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=10`,
    extractScript: `
      var results = [];
      try {
        var data = JSON.parse(document.body.innerText);
        if (data.data && data.data.children) {
          data.data.children.forEach(function(child) {
            var post = child.data;
            if (post.title) {
              results.push({ title: post.title, url: "https://reddit.com" + post.permalink });
            }
          });
        }
      } catch(e) {}
      return results;
    `,
  },
  {
    name: "hackernews_search",
    label: "Hacker News",
    category: "last30days",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      fallbacks: ["cdp"],
      notes:
        "API (hn.algolia.com/api/v1/search, free, no auth) → CDP fallback. Returns JSON directly.",
    },
    useCleanTitle: false,
    // HN Algolia search API: direct fetch returns JSON
    apiSearch: {
      url: (keyword) =>
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(keyword)}&tags=story&hitsPerPage=10`,
      parser: (text) => {
        const data = JSON.parse(text);
        if (!data.hits) return [];
        return data.hits.map((hit) => ({
          title: hit.title || "",
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          author: hit.author || "",
          publishedAt: hit.created_at_i ? new Date(hit.created_at_i * 1000).toISOString() : "",
        }));
      },
      authRequired: false,
    },
    // CDP fallback: same URL, parsed via DOM (extractScript)
    url: (keyword) =>
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(keyword)}&tags=story&hitsPerPage=10`,
    extractScript: `
      var results = [];
      try {
        var data = JSON.parse(document.body.innerText);
        if (data.hits) {
          data.hits.forEach(function(hit) {
            if (hit.title) {
              results.push({ title: hit.title, url: hit.url || "https://news.ycombinator.com/item?id=" + hit.objectID });
            }
          });
        }
      } catch(e) {}
      return results;
    `,
  },
  {
    name: "polymarket_search",
    label: "Polymarket",
    category: "last30days",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes: "CDP only. Search page DOM scraping. No public API.",
    },
    useCleanTitle: false,
    url: (keyword) => `https://polymarket.com/search?q=${encodeURIComponent(keyword)}`,
    extractScript: `
      var results = [];
      document.querySelectorAll('[class*="market"], [class*="card"]').forEach(function(el) {
        var title = el.querySelector('h2, h3, [class*="title"], [class*="question"]');
        var link = el.querySelector('a[href]');
        if (title) {
          results.push({ title: title.textContent.trim(), url: link ? link.href : "" });
        }
      });
      return results.slice(0, 20);
    `,
  },
  {
    name: "digg_search",
    label: "Digg",
    category: "last30days",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes: "CDP only. Search page DOM scraping. No public API.",
    },
    useCleanTitle: false,
    url: (keyword) => `https://digg.com/search?q=${encodeURIComponent(keyword)}`,
    extractScript: `
      var results = [];
      document.querySelectorAll('article, .story-item, [class*="story"]').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h2, h3, .title');
        if (link && title) {
          results.push({ title: title.textContent.trim(), url: link.href });
        }
      });
      return results.slice(0, 20);
    `,
  },
  {
    name: "techmeme_search",
    label: "Techmeme",
    category: "last30days",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes:
        "CDP only (Google site:techmeme.com). Techmeme has no search; uses Google site: search. No public API.",
    },
    useCleanTitle: false,
    // Techmeme doesn't have search; use Google site:techmeme.com
    url: (keyword) =>
      `https://www.google.com/search?q=${encodeURIComponent("site:techmeme.com " + keyword)}`,
    extractScript: `
      var results = [];
      document.querySelectorAll('div.g, .Gx5Zad, .fP1Qef').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h3, .LC20lb');
        if (link && title) {
          if (link.href.includes('techmeme.com')) {
            results.push({ title: title.textContent.trim(), url: link.href });
          }
        }
      });
      return results.slice(0, 20);
    `,
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
    category: "wechat",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      fallbacks: [],
      notes:
        "CDP only. Google search for republished WeChat articles. No keyword search, homepage-only.",
    },
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
// To enable: set env vars WX_COOKIE and WX_TOKEN, then the search-sources
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

export const ALL_SOURCES = [
  ...NEWS_SOURCES,
  ...SELF_MEDIA_SOURCES,
  ...WESTERN_SOURCES,
  ...GENERAL_SEARCH_SOURCES,
  ...LAST30DAYS_SOURCES,
  ...WECHAT_ACCOUNT_SOURCES,
];

/**
 * Default search keywords for self-media sources that require a keyword.
 */
export const DEFAULT_KEYWORDS = ["AI大模型", "China AI"];
