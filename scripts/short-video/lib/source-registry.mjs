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
 * - category: "news" | "self_media" | "general" | "international" | "last30days" | "wechat"
 * - needsAuth: whether login is required
 * - supportsKeyword: whether the source supports keyword search (vs homepage-only)
 * - accessMethod: how this source is collected
 *     { primary: "cdp" | "api" | "mcp",
 *       notes: "human-readable description of collection method" }
 * - url(keyword): function to build search URL (keyword ignored if supportsKeyword=false)
 * - articleScript: CDP eval script to extract articles from DOM
 * - loginCheckScript: CDP eval script to check if login is needed (optional)
 * - useCleanTitle: whether to run cleanTitle on extracted titles
 * - apiSearch: API direct-connect config (optional, Issue #34)
 *     { url(keyword), parser(responseText), authRequired, headers, paidApi }
 *     paidApi: true if the API consumes a limited credits quota (e.g. ScrapeCreators).
 *     Sources with paidApi=true are skipped by default unless --include-paid flag is passed.
 * - googleSiteFallback: Google site: search fallback config (optional)
 * - mcpFallback: MCP server fallback config (optional)
 *
 * Collection layer order (in search-sources.mjs collectFromSource):
 *   1. apiSearch (if configured) — direct API call, parse JSON/XML response
 *   2. CDP (primary for most sources)
 *   3. googleSiteFallback (Google site: search, if configured)
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
    locale: "zh-CN",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      notes: "CDP only. Homepage scraping via DOM selectors. No public API.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://www.qbitai.com/",
    articleScript: `
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
    locale: "zh-CN",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP search page. No public API.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) => `https://www.jiqizhixin.com/search?keywords=${encodeURIComponent(keyword)}`,
    articleScript: `
      var items = document.querySelectorAll('.article-list__item, .post-item, article, .list-item, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = el.querySelector('.article__title, h2, h3, .title');
        if (link && title) {
          results.push({ title: title.textContent.trim(), url: link.href, imageUrl: img ? img.src : null });
        }
      });
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 200 && a.href.includes('jiqizhixin.com')) {
            results.push({ title: text, url: a.href, imageUrl: null });
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
    locale: "zh-CN",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      notes: "CDP only. Homepage scraping. No public API.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://36kr.com/",
    articleScript: `
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
      notes: "CDP only. Category page scraping. No public API.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://techcrunch.com/category/artificial-intelligence/",
    articleScript: `
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
      notes: "CDP only. Tech section scraping. No public API (paywall).",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://www.bloomberg.com/technology",
    articleScript: `
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
    locale: "zh-CN",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      notes: "CDP only. Homepage scraping. No public API.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://www.guancha.cn/",
    articleScript: `
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
    locale: "zh-CN",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP search page. No public API.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) => `https://www.ithome.com/search?word=${encodeURIComponent(keyword)}`,
    articleScript: `
      var items = document.querySelectorAll('.list .item, .news-list .item, .lst .item, article, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = el.querySelector('.title, h3, h2, a[title]');
        if (link) {
          var titleText = title ? title.textContent.trim() : (link.getAttribute('title') || link.textContent.trim());
          if (titleText && titleText.length > 5 && titleText.length < 200) {
            results.push({ title: titleText, url: link.href, imageUrl: img ? img.src : null });
          }
        }
      });
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 200 && a.href.includes('ithome.com')) {
            results.push({ title: text, url: a.href, imageUrl: null });
          }
        });
      }
      return results;
    `,
  },
  // ─── CDP image search sources (capabilities.images via CDP) ───
  // These sources have CDP_MEDIA_CAPABILITIES entries but need source definitions
  // so enrichWithCapabilities() can inject their capabilities.
  {
    name: "xinhua",
    label: "新华网页面搜索",
    category: "news",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP search page. Articles + images from same DOM.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) => `https://www.news.cn/search/news.htm?keyword=${encodeURIComponent(keyword)}`,
    articleScript: `
      var items = document.querySelectorAll('.search-result .item, .news-list .item, article');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link) {
          results.push({ title: (el.querySelector('h3, h2, .title')?.textContent || link.textContent || '').trim(), url: link.href, imageUrl: img ? img.src : null });
        }
      });
      return results;
    `,
  },
  {
    name: "thepaper",
    label: "澎湃新闻搜索",
    category: "news",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP search page. Articles + images from same DOM.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) => `https://www.thepaper.cn/searchResult?keyword=${encodeURIComponent(keyword)}`,
    articleScript: `
      var items = document.querySelectorAll('.search-result .item, .news-list .item, article');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link) {
          results.push({ title: (el.querySelector('h3, h2, .title')?.textContent || link.textContent || '').trim(), url: link.href, imageUrl: img ? img.src : null });
        }
      });
      return results;
    `,
  },
  {
    name: "leiphone",
    label: "雷锋网搜索",
    category: "news",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP search page. Articles + images from same DOM.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) => `https://www.leiphone.com/search?s=${encodeURIComponent(keyword)}`,
    articleScript: `
      var items = document.querySelectorAll('.article-list .item, .post-item, article, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link) {
          results.push({ title: (el.querySelector('h2, h3, .title')?.textContent || link.textContent || '').trim(), url: link.href, imageUrl: img ? img.src : null });
        }
      });
      return results;
    `,
  },
  {
    name: "xinzhiyuan",
    label: "新智元搜索",
    category: "news",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP search page. Articles + images from same DOM.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) => `https://www.xinzhiyuan.com/?s=${encodeURIComponent(keyword)}`,
    articleScript: `
      var items = document.querySelectorAll('.post-item, article, .list-item, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link) {
          results.push({ title: (el.querySelector('h2, h3, .title')?.textContent || link.textContent || '').trim(), url: link.href, imageUrl: img ? img.src : null });
        }
      });
      return results;
    `,
  },
  {
    name: "zhidx",
    label: "智东西搜索",
    category: "news",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP search page. Articles + images from same DOM.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) => `https://zhidx.com/?s=${encodeURIComponent(keyword)}`,
    articleScript: `
      var items = document.querySelectorAll('.post-item, article, .list-item, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        if (link) {
          results.push({ title: (el.querySelector('h2, h3, .title')?.textContent || link.textContent || '').trim(), url: link.href, imageUrl: img ? img.src : null });
        }
      });
      return results;
    `,
  },
  {
    name: "google_news",
    label: "Google News Search",
    category: "international",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP search page. Articles + images from same DOM.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) =>
      `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=nws&tbs=qdr:w`,
    articleScript: `
      var results = [];
      document.querySelectorAll('div.g, .Gx5Zad, .fP1Qef, div[data-ved]').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h3, .LC20lb');
        var img = el.querySelector('img[src]');
        var snippet = el.querySelector('.VwiC3b, .IsZvec');
        if (link && title) {
          results.push({
            title: title.textContent.trim(),
            url: link.href,
            imageUrl: img ? img.src : null,
            snippet: snippet ? snippet.textContent.trim().substring(0, 200) : ''
          });
        }
      });
      return results;
    `,
  },
  {
    name: "bing_news",
    label: "Bing News Search",
    category: "international",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP search page. Articles + images from same DOM.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) =>
      `https://www.bing.com/news/search?q=${encodeURIComponent(keyword)}&qft=interval%3d%227%22`,
    articleScript: `
      var items = document.querySelectorAll('.news-item, .tob-article, .news-card, .b_caption');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = el.querySelector('h3, h2, .title, .b_caption p');
        if (link && title) {
          results.push({ title: title.textContent.trim(), url: link.href, imageUrl: img ? img.src : null });
        }
      });
      return results;
    `,
  },
  {
    name: "baidu_news",
    label: "百度新闻搜索",
    category: "news",
    locale: "zh-CN",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP search page (news.baidu.com/ns). Articles + images from same DOM. No account, no API key.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) =>
      `https://www.baidu.com/ns?word=${encodeURIComponent(keyword)}&tn=news&rtt=4&medium=0`,
    articleScript: `
      var items = document.querySelectorAll('.result-op, .result, .news-result, article');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = el.querySelector('h3, h2, .news-title-font_1xS-F, .title, a[aria-label]');
        if (link && title) {
          var titleText = title.textContent.trim();
          if (titleText && titleText.length > 5) {
            results.push({ title: titleText, url: link.href, imageUrl: img ? img.src : null });
          }
        }
      });
      if (results.length === 0) {
        document.querySelectorAll('a[href]').forEach(function(a) {
          var text = a.textContent.trim();
          if (text.length > 10 && text.length < 200) {
            results.push({ title: text, url: a.href, imageUrl: null });
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
    locale: "zh-CN",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP (requires login) → mcpFallback (RedNote-MCP search_notes). needsAuth=true.",
    },
    needsAuth: true,
    useCleanTitle: true,
    url: (keyword) =>
      `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&type=1`,
    mcpFallback: {
      command: "rednote-mcp",
      args: ["--stdio"],
      toolName: "search_notes",
      toolArgs: (keyword) => ({ keywords: keyword, limit: 20 }),
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
    articleScript: `
      var items = document.querySelectorAll('section.note-item, .note-item, .search-result-item');
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
    locale: "zh-CN",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
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
    articleScript: `
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
    locale: "zh-CN",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
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
    articleScript: `
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
    locale: "zh-CN",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
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
    articleScript: `
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
    locale: "zh-CN",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP (requires login for search) → iesdouyin share page (no login for download, verified 2026-09-03). needsAuth=true for search only.",
    },
    needsAuth: true,
    useCleanTitle: true,
    url: (keyword) => `https://www.douyin.com/search/${encodeURIComponent(keyword)}`,

    loginCheckScript: `
      var loginModal = document.querySelector('[class*="login"], [class*="Login"]');
      var body = document.body ? document.body.innerText : '';
      (loginModal && body.includes('登录')) ? 'need_login' : 'ok'
    `,
    articleScript: `
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
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes:
        "API (ScrapeCreators, requires SCRAPECREATORS_API_KEY) → CDP fallback (Creator Center, requires login). Keyword search via API; CDP is homepage-only.",
    },
    needsAuth: true,
    useCleanTitle: false,
    // ScrapeCreators TikTok search API
    // API docs: https://scrapecreators.com/docs
    // Env var: SCRAPECREATORS_API_KEY (in .env.local)
    apiSearch: {
      url: (keyword) =>
        `https://api.scrapecreators.com/v1/tiktok/search/keyword?query=${encodeURIComponent(keyword)}&sort_by=relevance`,
      parser: (text) => {
        const data = JSON.parse(text);
        // Response can be { search_item_list: [{ aweme_info: {...} }] } or { data: [...] }
        const rawEntries = data.search_item_list || data.data || [];
        const results = [];
        for (const entry of rawEntries) {
          if (typeof entry !== "object") continue;
          // Items may be nested under aweme_info
          const info = entry.aweme_info || entry;
          const videoId = String(info.aweme_id || "");
          const title = info.desc || "";
          const shareUrl = info.share_url || "";
          const authorRaw = info.author;
          const authorName =
            typeof authorRaw === "object" ? authorRaw?.unique_id || "" : String(authorRaw || "");

          // Build URL: prefer share_url, fallback to constructed URL
          let url = shareUrl ? shareUrl.split("?")[0] : "";
          if (!url && authorName && videoId) {
            url = `https://www.tiktok.com/@${authorName}/video/${videoId}`;
          }

          if (title || url) {
            const stats = info.statistics || {};
            results.push({
              title: title.substring(0, 200) || `@${authorName} video ${videoId}`,
              url,
              author: authorName,
              snippet: stats.play_count
                ? `${stats.play_count} views, ${stats.digg_count || 0} likes`
                : "",
            });
          }
        }
        return results.slice(0, 20);
      },
      authRequired: true,
      // ScrapeCreators: 10,000 free calls then PAYG — opt-in only (--include-paid)
      paidApi: true,
      headers: process.env.SCRAPECREATORS_API_KEY
        ? { "x-api-key": process.env.SCRAPECREATORS_API_KEY, "Content-Type": "application/json" }
        : {},
    },
    url: () => "https://www.tiktok.com/creator-center",
    loginCheckScript: `
      var body = document.body ? document.body.innerText : '';
      (!body || body.length < 100) ? 'need_login' : 'ok'
    `,
    articleScript: `
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
    locale: "zh-CN",
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP only. Search page scraping. No MCP fallback.",
    },
    needsAuth: false,
    useCleanTitle: false,
    url: (keyword) => `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(keyword)}`,
    loginCheckScript: `
      var body = document.body ? document.body.innerText : '';
      (body.includes('登录') && body.includes('注册') && !body.includes('退出')) ? 'need_login' : 'ok'
    `,
    articleScript: `
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
      notes:
        "CDP (requires login) → googleSiteFallback (Google site:x.com, h3-based selector) → mcpFallback (mcp-search-bridge/Grok, native X data). needsAuth=true.",
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
    articleScript: `
      // SPA poll: wait for tweets to render (X uses client-side rendering).
      // Uses async + setTimeout (not busy-wait) so React can use the main thread.
      var tweets = [];
      var deadline = Date.now() + 8000;
      while (tweets.length === 0 && Date.now() < deadline) {
        tweets = document.querySelectorAll('[data-testid="tweet"]');
        if (tweets.length === 0) {
          await new Promise(function(r) { setTimeout(r, 500); });
        }
      }
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
    googleSiteFallback: {
      url: (keyword) =>
        `https://www.google.com/search?q=${encodeURIComponent("site:x.com " + keyword)}`,
      articleScript: `
        var results = [];
        document.querySelectorAll('h3').forEach(function(h3) {
          var a = h3.closest('a') || h3.parentElement.querySelector('a');
          if (a && a.href) {
            var url = a.href;
            if (url.includes('x.com') || url.includes('twitter.com')) {
              results.push({ title: h3.textContent.trim(), url: url });
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
// CDP is attempted first (if a search page URL exists), but these international
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

export const INTERNATIONAL_SOURCES = [
  {
    name: "youtube_search",
    label: "YouTube",
    category: "international",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP (search results) → MCP fallback (mcp-search-bridge/Grok web_search).",
    },
    useCleanTitle: false,
    url: (keyword) => `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`,
    articleScript: `
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
    category: "international",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
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
    articleScript: `
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
    category: "international",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
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
    articleScript: `
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
    category: "international",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes:
        "CDP (search page, limited) → MCP fallback (primary method). Threads has no public API.",
    },
    useCleanTitle: false,
    // Threads doesn't have a public search page; MCP is the primary method
    url: (keyword) => `https://www.threads.net/search?q=${encodeURIComponent(keyword)}`,
    articleScript: `
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
  {
    name: "datacube_ai",
    label: "DataCube AI",
    category: "international",
    needsAuth: false,
    supportsKeyword: false,
    accessMethod: {
      primary: "api",
      notes:
        "API (Atom RSS feed, free, no auth). Daily AI news from 35+ sources in 8 languages. No keyword search — homepage feed only.",
    },
    useCleanTitle: false,
    // DataCube AI RSS feed: returns Atom XML with <entry> elements
    // Endpoint: /feed.xml?lang=en (also supports de, zh, fr, es, pt, ja, ko)
    apiSearch: {
      url: () => "https://www.datacubeai.space/feed.xml?lang=en",
      parser: (text) => {
        const results = [];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;
        while ((match = entryRegex.exec(text)) !== null) {
          const entry = match[1];
          const title = entry.match(/<title>([\s\S]*?)<\/title>/);
          const link = entry.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/);
          const summary = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
          const updated = entry.match(/<updated>([\s\S]*?)<\/updated>/);
          if (title && (link || title)) {
            results.push({
              title: title[1].trim().replace(/\n/g, " "),
              url: link ? link[1] : "",
              snippet: summary ? summary[1].trim().replace(/\n/g, " ").substring(0, 200) : "",
              publishedAt: updated ? updated[1].trim() : "",
            });
          }
        }
        return results;
      },
      authRequired: false,
    },
    url: () => "https://www.datacubeai.space/en",
    articleScript: `
      var results = [];
      document.querySelectorAll('article, .news-item, .post-item, [class*="article"]').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h2, h3, .title, [class*="title"]');
        if (link && title) {
          results.push({ title: title.textContent.trim(), url: link.href });
        }
      });
      return results.slice(0, 20);
    `,
  },
  {
    name: "gnews",
    label: "GNews",
    category: "international",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes:
        "API (gnews.io/api/v4/search, free tier 100 req/day, 12h delay). Requires GNEWS_API_KEY. Multi-language news search.",
    },
    useCleanTitle: false,
    // GNews API: returns JSON with articles[] containing title, description, url, publishedAt
    apiSearch: {
      url: (keyword) =>
        `https://gnews.io/api/v4/search?q=${encodeURIComponent(keyword)}&lang=en&max=10&apikey=${process.env.GNEWS_API_KEY || ""}`,
      parser: (text) => {
        const data = JSON.parse(text);
        if (!data.articles) return [];
        return data.articles.map((article) => ({
          title: article.title || "",
          url: article.url || "",
          snippet: article.description ? article.description.substring(0, 200) : "",
          publishedAt: article.publishedAt || "",
          author: article.source?.name || "",
        }));
      },
      authRequired: true,
      headers: {},
    },
    url: (keyword) => `https://gnews.io/search?q=${encodeURIComponent(keyword)}&lang=en`,
    articleScript: `
      var results = [];
      document.querySelectorAll('article, .news-item, [class*="article"]').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h2, h3, .title, [class*="title"]');
        if (link && title) {
          results.push({ title: title.textContent.trim(), url: link.href });
        }
      });
      return results.slice(0, 20);
    `,
  },
  {
    name: "core_search",
    label: "CORE",
    category: "international",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes:
        "API (api.core.ac.uk/v3, free, no auth required, 5 req/10s rate limit). World's largest open-access research papers (260M+).",
    },
    useCleanTitle: false,
    // CORE API v3: returns JSON with results[] containing title, abstract, doi, sourceFulltextUrls
    apiSearch: {
      url: (keyword) =>
        `https://api.core.ac.uk/v3/search/works/?q=${encodeURIComponent(keyword)}&limit=10`,
      parser: (text) => {
        const data = JSON.parse(text);
        if (!data.results) return [];
        return data.results.map((work) => ({
          title: work.title || "",
          url: work.doi ? `https://doi.org/${work.doi}` : work.sourceFulltextUrls?.[0] || "",
          snippet: work.abstract ? work.abstract.substring(0, 200) : "",
          publishedAt: work.publishedDate || work.depositedDate || "",
          author: work.authors?.map((a) => a.name).join(", ") || "",
        }));
      },
      authRequired: false,
    },
    url: (keyword) => `https://core.ac.uk/search?q=${encodeURIComponent(keyword)}`,
    articleScript: `
      var results = [];
      document.querySelectorAll('.search-result, [class*="result"], article').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h2, h3, .title, [class*="title"]');
        if (link && title) {
          results.push({ title: title.textContent.trim(), url: link.href });
        }
      });
      return results.slice(0, 20);
    `,
  },
  {
    name: "openalex_search",
    label: "OpenAlex",
    category: "international",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes:
        "API (openalex.org/api/works, free, no auth). Open catalog of 240M+ scholarly works. JSON response.",
    },
    useCleanTitle: false,
    // OpenAlex API: returns JSON with results[] containing title, doi, publication_date
    apiSearch: {
      url: (keyword) =>
        `https://api.openalex.org/works?search=${encodeURIComponent(keyword)}&per_page=10&sort=publication_date:desc`,
      parser: (text) => {
        const data = JSON.parse(text);
        if (!data.results) return [];
        return data.results.map((work) => ({
          title: work.title || work.display_name || "",
          url: work.doi || work.id || "",
          snippet: work.abstract_inverted_index
            ? Object.keys(work.abstract_inverted_index)
                .sort((a, b) => {
                  const aPos = work.abstract_inverted_index[a][0] || 0;
                  const bPos = work.abstract_inverted_index[b][0] || 0;
                  return aPos - bPos;
                })
                .join(" ")
                .substring(0, 200)
            : "",
          publishedAt: work.publication_date || "",
        }));
      },
      authRequired: false,
    },
    url: (keyword) =>
      `https://openalex.org/works?filter=default.search:${encodeURIComponent(keyword)}&sort=publication_date:desc`,
    articleScript: `
      var results = [];
      document.querySelectorAll('.search-result, .work-result, [class*="result"]').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h2, h3, .title, [class*="title"]');
        if (link && title) {
          results.push({ title: title.textContent.trim(), url: link.href });
        }
      });
      return results.slice(0, 20);
    `,
  },
  {
    // #64: Reclassified from GENERAL_SEARCH_SOURCES — Currents is a news
    // aggregation API, not a general web search engine.
    name: "currents",
    label: "Currents",
    category: "international",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes:
        "API (currentsapi.services/v1/search, free tier 200 req/day). Requires CURRENTS_API_KEY. Real-time global news from 50+ countries.",
    },
    useCleanTitle: false,
    // Currents API: returns JSON with news[] containing title, description, url, published
    apiSearch: {
      url: (keyword) =>
        `https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(keyword)}&language=en&limit=10&apiKey=${process.env.CURRENTS_API_KEY || ""}`,
      parser: (text) => {
        const data = JSON.parse(text);
        if (!data.news) return [];
        return data.news.map((article) => ({
          title: article.title || "",
          url: article.url || "",
          snippet: article.description ? article.description.substring(0, 200) : "",
          publishedAt: article.published || "",
          author: article.author || article.source_category?.[0] || "",
        }));
      },
      authRequired: true,
      headers: {},
    },
    url: (keyword) => `https://currentsapi.services/search?q=${encodeURIComponent(keyword)}`,
    articleScript: `
      var results = [];
      document.querySelectorAll('article, .news-item, [class*="article"]').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h2, h3, .title, [class*="title"]');
        if (link && title) {
          results.push({ title: title.textContent.trim(), url: link.href });
        }
      });
      return results.slice(0, 20);
    `,
  },
  {
    // #64: Reclassified from GENERAL_SEARCH_SOURCES — Noozra is a news
    // aggregation API (200+ curated RSS sources), not a general web search engine.
    name: "noozra_search",
    label: "Noozra",
    category: "international",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes:
        "API (noozra.com/api/search, free, no auth, 100 req/day per IP). News headlines from 200+ curated RSS sources. JSON response.",
    },
    useCleanTitle: false,
    // Noozra API: returns JSON with articles[] containing headline, url, published_at, source
    apiSearch: {
      url: (keyword) => `https://noozra.com/api/search?q=${encodeURIComponent(keyword)}&limit=10`,
      parser: (text) => {
        const data = JSON.parse(text);
        if (!data.articles) return [];
        return data.articles.map((article) => ({
          title: article.headline || "",
          url: article.url || "",
          snippet: article.description ? article.description.substring(0, 200) : "",
          publishedAt: article.published_at || "",
          author: article.source || "",
        }));
      },
      authRequired: false,
    },
    url: (keyword) => `https://noozra.com/search?q=${encodeURIComponent(keyword)}`,
    articleScript: `
      var results = [];
      document.querySelectorAll('article, .news-item, .headline, [class*="article"]').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h2, h3, .title, [class*="headline"]');
        if (link && title) {
          results.push({ title: title.textContent.trim(), url: link.href });
        }
      });
      return results.slice(0, 20);
    `,
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
      notes: "CDP (Google search) → MCP fallback (mcp-search-bridge/Grok). General web search.",
    },
    useCleanTitle: false,
    url: (keyword) =>
      `https://www.google.com/search?q=${encodeURIComponent(keyword + " China AI")}`,
    articleScript: `
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
    locale: "zh-CN",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes: "CDP only. Baidu search page scraping. Chinese-language search. No MCP fallback.",
    },
    useCleanTitle: false,
    url: (keyword) => `https://www.baidu.com/s?wd=${encodeURIComponent(keyword + " AI")}`,
    articleScript: `
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
    name: "duckduckgo_search",
    label: "DuckDuckGo Search",
    category: "general",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "cdp",
      notes:
        "CDP (html.duckduckgo.com non-JS endpoint — no rendering needed). Lenient rate limit, no CAPTCHA (#91). Best scraping-friendly search engine.",
    },
    useCleanTitle: false,
    url: (keyword) =>
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword + " China AI")}`,
    articleScript: `
      var results = [];
      document.querySelectorAll('.result, .web-result, .results_links').forEach(function(el) {
        var link = el.querySelector('a.result__a, a[href]');
        var title = el.querySelector('.result__a, .result__title, h2, a');
        var snippet = el.querySelector('.result__snippet, .snippet');
        if (link && title) {
          var rawUrl = link.href;
          // html.duckduckgo.com wraps result URLs in /l/?uddg=<encoded> — unwrap
          // so downstream dedup/attribution sees the real target URL (#91).
          var m = rawUrl.match(/[?&]uddg=([^&]+)/);
          if (m) rawUrl = decodeURIComponent(m[1]);
          results.push({
            title: title.textContent.trim(),
            url: rawUrl,
            snippet: snippet ? snippet.textContent.trim().substring(0, 200) : ''
          });
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
      notes: "MCP only (mcp-search-bridge/Grok). No CDP page. Grok web search with China AI focus.",
    },
    useCleanTitle: false,
    // No CDP page — MCP is the only method
    url: () => "",
    articleScript: `return [];`,
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
// Note: These currently have no CDP articleScript — they require API-based
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
    // CDP fallback: same URL, but parsed via DOM (articleScript)
    url: (keyword) =>
      `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=10`,
    articleScript: `
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
    // CDP fallback: same URL, parsed via DOM (articleScript)
    url: (keyword) =>
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(keyword)}&tags=story&hitsPerPage=10`,
    articleScript: `
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
      notes: "CDP only. Search page DOM scraping. No public API.",
    },
    useCleanTitle: false,
    url: (keyword) => `https://polymarket.com/search?q=${encodeURIComponent(keyword)}`,
    articleScript: `
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
      notes: "CDP only. Search page DOM scraping. No public API.",
    },
    useCleanTitle: false,
    url: (keyword) => `https://digg.com/search?q=${encodeURIComponent(keyword)}`,
    articleScript: `
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
      notes:
        "CDP only (Google site:techmeme.com). Techmeme has no search; uses Google site: search. No public API.",
    },
    useCleanTitle: false,
    // Techmeme doesn't have search; use Google site:techmeme.com
    url: (keyword) =>
      `https://www.google.com/search?q=${encodeURIComponent("site:techmeme.com " + keyword)}`,
    articleScript: `
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
    locale: "zh-CN",
    supportsKeyword: false,
    accessMethod: {
      primary: "cdp",
      notes:
        "CDP only. Google search for republished WeChat articles. No keyword search, homepage-only.",
    },
    needsAuth: false,
    useCleanTitle: false,
    // Search for articles citing this WeChat account via republish platforms
    url: () =>
      `https://www.google.com/search?q=${encodeURIComponent('"来自微信公众号" "动察Beating"')}`,
    articleScript: `
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

// ─── Wechat2RSS public sources ───
// Public third-party RSS only. These sources do not use a WeChat account,
// a WeChat Reading session, or an official WeChat API from this project.
function decodeRssText(value = "") {
  return value
    .replace(/^<!\[CDATA\[/i, "")
    .replace(/\]\]>$/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getRssTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\/${tag}>`, "i"));
  return match ? decodeRssText(match[1]) : "";
}

export function parseWechatRss(text) {
  const results = [];
  const itemRegex = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const item = match[1];
    const title = getRssTag(item, "title");
    const url = getRssTag(item, "link");
    const publishedAt = getRssTag(item, "pubDate");
    const description = getRssTag(item, "description") || getRssTag(item, "content:encoded");
    if (!title || !url) continue;
    results.push({
      title,
      url,
      snippet: description.substring(0, 200),
      publishedAt,
    });
  }
  return results;
}

const WECHAT_RSS_TRACKING = Object.freeze({
  provider: "wechat2rss",
  access: "public-rss",
  official: false,
  stability: "third-party",
  freshnessWindowDays: 14,
});

function createWechatRssSource(name, label, feedUrl) {
  return {
    name,
    label,
    category: "wechat",
    locale: "zh-CN",
    supportsKeyword: false,
    needsAuth: false,
    useCleanTitle: false,
    accessMethod: {
      primary: "api",
      notes:
        "Public third-party RSS. No WeChat account, login, or official API is used by this project.",
    },
    tracking: WECHAT_RSS_TRACKING,
    apiSearch: {
      url: () => feedUrl,
      parser: parseWechatRss,
      authRequired: false,
    },
    url: () => feedUrl,
    articleScript: "var results = []; return results;",
  };
}

export const WECHAT_RSS_SOURCES = [
  createWechatRssSource(
    "wechat2rss_geekpark",
    "极客公园",
    "https://wechat2rss.xlab.app/feed/1a5aec98e71c707c8ca092bc2c255b9d4bac477d.xml",
  ),
  createWechatRssSource(
    "wechat2rss_bytedance_tech",
    "字节跳动技术团队",
    "https://wechat2rss.xlab.app/feed/4025ea55575daf8bfd8227e68b28d9638b073267.xml",
  ),
  createWechatRssSource(
    "wechat2rss_meituan_tech",
    "美团技术团队",
    "https://wechat2rss.xlab.app/feed/eb4d04149424a874693a51c6fdda0dba8673f5e4.xml",
  ),
  createWechatRssSource(
    "wechat2rss_jiqizhixin",
    "机器之心",
    "https://wechat2rss.xlab.app/feed/51e92aad2728acdd1fda7314be32b16639353001.xml",
  ),
  createWechatRssSource(
    "wechat2rss_zhinengyuan",
    "新智元",
    "https://wechat2rss.xlab.app/feed/ede30346413ea70dbef5d485ea5cbb95cca446e7.xml",
  ),
  createWechatRssSource(
    "wechat2rss_qbitai",
    "量子位",
    "https://wechat2rss.xlab.app/feed/7131b577c61365cb47e81000738c10d872685908.xml",
  ),
  createWechatRssSource(
    "wechat2rss_ai_cv",
    "我爱计算机视觉",
    "https://wechat2rss.xlab.app/feed/b81ffcfff1107b5265cd7e39de610dc7ca72caf4.xml",
  ),
  createWechatRssSource(
    "wechat2rss_datawhale",
    "Datawhale",
    "https://wechat2rss.xlab.app/feed/4d620d988cb21cfeefd2263207221f0dc70df9ff.xml",
  ),
  createWechatRssSource(
    "wechat2rss_tencent_tech",
    "腾讯技术工程",
    "https://wechat2rss.xlab.app/feed/9685937b45fe9c7a526dbc32e4f24ba879a65b9a.xml",
  ),
  createWechatRssSource(
    "wechat2rss_xiaomi_tech",
    "小米技术",
    "https://wechat2rss.xlab.app/feed/20bc9c3251b3c4f73d3b53aa1f1ab853d05d4cbc.xml",
  ),
  createWechatRssSource(
    "wechat2rss_alicloud_dev",
    "阿里云开发者",
    "https://wechat2rss.xlab.app/feed/c74ed6db00cfbf16f2a048a165b4453f982681f0.xml",
  ),
  createWechatRssSource(
    "wechat2rss_alibaba_tech",
    "阿里技术",
    "https://wechat2rss.xlab.app/feed/6e1f9b775f7a5841ac1a94310f0478b45a02ec01.xml",
  ),
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

// ─── Stock API sources (image/video) ───
//
// Stock API sources for image and video search. These sources do NOT have
// an articles capability — they are used exclusively by asset-sourcer.mjs
// for media download. They are queried via capabilities.images or
// capabilities.videos.
//
// Each source has a capabilities.images or capabilities.videos object with:
//   method: "api" (API-based search)
//   requiresApiKey: boolean
//   apiKeyEnv: string | null
//   searchUrl: (keyword, key) => string
//   parseResponse: (data, keyword) => Array
//   authHeader?: string
//   authValue?: (key) => string
//   userAgent?: string

export const STOCK_MEDIA_SOURCES = [
  {
    name: "pexels",
    label: "Pexels",
    category: "stock_media",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes: "API (api.pexels.com, requires PEXELS_API_KEY). Image search.",
    },
    useCleanTitle: false,
    articleScript: "",
    capabilities: {
      images: {
        method: "api",
        requiresApiKey: true,
        apiKeyEnv: "PEXELS_API_KEY",
        authHeader: "Authorization",
        authValue: (key) => key,
        searchUrl: (keyword, key) =>
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&orientation=portrait&per_page=10`,
        parseResponse: (data, keyword) => {
          const photos = (data.photos || []).map((p) => ({
            title: p.alt || keyword,
            url: p.src?.original || p.src?.large,
            type: "image",
            resolution: `${p.width}x${p.height}`,
            fileSize: undefined,
            duration: undefined,
          }));
          return photos;
        },
      },
    },
  },
  {
    name: "pexels-video",
    label: "Pexels Videos",
    category: "stock_media",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes: "API (api.pexels.com/videos, requires PEXELS_API_KEY). Video search.",
    },
    useCleanTitle: false,
    articleScript: "",
    capabilities: {
      videos: {
        method: "api",
        requiresApiKey: true,
        apiKeyEnv: "PEXELS_API_KEY",
        authHeader: "Authorization",
        authValue: (key) => key,
        searchUrl: (keyword, key) =>
          `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&orientation=portrait&per_page=10`,
        parseResponse: (data, keyword) => {
          return (data.videos || []).map((v) => {
            const files = v.video_files || [];
            const best = files.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
            return {
              title: v.user?.name ? `${v.user.name} video` : keyword,
              url: best?.link || undefined,
              type: "video",
              resolution: best ? `${best.width}x${best.height}` : undefined,
              fileSize: undefined,
              duration: typeof v.duration === "number" ? v.duration : undefined,
              author: v.user?.name,
            };
          });
        },
      },
    },
  },
  {
    name: "unsplash",
    label: "Unsplash",
    category: "stock_media",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes: "API (api.unsplash.com, requires UNSPLASH_ACCESS_KEY). Image search.",
    },
    useCleanTitle: false,
    articleScript: "",
    capabilities: {
      images: {
        method: "api",
        requiresApiKey: true,
        apiKeyEnv: "UNSPLASH_ACCESS_KEY",
        authHeader: "Authorization",
        authValue: (key) => `Client-ID ${key}`,
        searchUrl: (keyword, key) =>
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&orientation=portrait&per_page=10`,
        parseResponse: (data, keyword) => {
          return (data.results || []).map((p) => ({
            title: p.alt_description || keyword,
            url: p.urls?.full || p.urls?.regular,
            type: "image",
            resolution: `${p.width}x${p.height}`,
            fileSize: undefined,
            duration: undefined,
          }));
        },
      },
    },
  },
  {
    name: "wikimedia",
    label: "Wikimedia Commons",
    category: "stock_media",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes: "API (commons.wikimedia.org, free, no auth). Image search.",
    },
    useCleanTitle: false,
    articleScript: "",
    capabilities: {
      images: {
        method: "api",
        requiresApiKey: false,
        apiKeyEnv: null,
        userAgent: "ChinaAINews/1.0 (contact@china-ai.news)",
        searchUrl: (keyword, key) =>
          `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(keyword)}&srnamespace=6&format=json&srlimit=10`,
        parseResponse: (data, keyword) => {
          return (data.query?.search || []).map((item) => ({
            title: item.title,
            url: null,
            type: "image",
            resolution: undefined,
            fileSize: undefined,
            duration: undefined,
            fileTitle: item.title,
          }));
        },
      },
    },
  },
  {
    name: "coverr",
    label: "Coverr",
    category: "stock_media",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes: "API (api.coverr.co, requires COVERR_API_KEY). Video search.",
    },
    useCleanTitle: false,
    articleScript: "",
    capabilities: {
      videos: {
        method: "api",
        requiresApiKey: true,
        apiKeyEnv: "COVERR_API_KEY",
        authHeader: "Authorization",
        authValue: (key) => `Bearer ${key}`,
        searchUrl: (keyword, key) =>
          `https://api.coverr.co/videos?query=${encodeURIComponent(keyword)}`,
        parseResponse: (data, keyword) => {
          const hits = data.hits || [];
          return hits.map((v) => ({
            title: v.title || keyword,
            url: `https://cdn.coverr.co/videos/${v.base_filename}/mp4?token=${data.params?.userToken || ""}`,
            type: "video",
            resolution: v.is_vertical ? "vertical" : "horizontal",
            fileSize: undefined,
            duration: undefined,
            baseFilename: v.base_filename,
          }));
        },
      },
    },
  },
  {
    name: "pixabay",
    label: "Pixabay",
    category: "stock_media",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes: "API (pixabay.com/api, requires PIXABAY_API_KEY). Image search.",
    },
    useCleanTitle: false,
    articleScript: "",
    capabilities: {
      images: {
        method: "api",
        requiresApiKey: true,
        apiKeyEnv: "PIXABAY_API_KEY",
        searchUrl: (keyword, key) =>
          `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(keyword)}&image_type=photo&orientation=vertical&per_page=10`,
        parseResponse: (data, keyword) => {
          return (data.hits || []).map((p) => ({
            title: p.tags || keyword,
            url: p.largeImageURL || p.webformatURL,
            type: "image",
            resolution: `${p.imageWidth}x${p.imageHeight}`,
            fileSize: undefined,
            duration: undefined,
            author: p.user,
          }));
        },
      },
    },
  },
  // ─── Open search engine image sources (Issue #110: Tier 3) ───
  //
  // These sources use open search engine image search APIs.
  // Triggered only when Tier 1 (stock API) + Tier 2 (CDP news) yield
  // insufficient results. Copyright is unverified — manual review required.
  //
  // Brave Image Search API (verified 2026-08-24):
  //   GET https://api.search.brave.com/res/v1/images/search?q=...&count=20
  //   Header: X-Subscription-Token: <API_KEY>
  //   Response: { results: [{ title, properties: { url, width, height } }] }
  //
  // SearXNG Image Search (self-hosted, localhost:8888):
  //   GET http://localhost:8888/search?q=...&format=json&categories=images
  //   Response: { results: [{ title, img_src, resolution }] }
  {
    name: "brave_image",
    label: "Brave Image Search",
    category: "stock_media",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes:
        "API (api.search.brave.com/images, requires BRAVE_SEARCH_API_KEY). Open web image search. Copyright unverified.",
    },
    useCleanTitle: false,
    articleScript: "",
    capabilities: {
      images: {
        method: "api",
        requiresApiKey: true,
        apiKeyEnv: "BRAVE_SEARCH_API_KEY",
        authHeader: "X-Subscription-Token",
        authValue: (key) => key,
        searchUrl: (keyword, key) =>
          `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(keyword)}&count=20&safesearch=strict`,
        parseResponse: (data, keyword) => {
          const results = data?.results || [];
          return results
            .filter((r) => r?.properties?.url)
            .map((r) => ({
              title: r.title || keyword,
              url: r.properties.url,
              type: "image",
              resolution:
                r.properties.width && r.properties.height
                  ? `${r.properties.width}x${r.properties.height}`
                  : undefined,
              fileSize: undefined,
              duration: undefined,
            }));
        },
      },
    },
  },
  {
    name: "searxng_image",
    label: "SearXNG Image Search",
    category: "stock_media",
    needsAuth: false,
    supportsKeyword: true,
    accessMethod: {
      primary: "api",
      notes:
        "Self-hosted SearXNG metasearch (localhost:8888). No auth needed. Copyright unverified.",
    },
    useCleanTitle: false,
    articleScript: "",
    capabilities: {
      images: {
        method: "api",
        requiresApiKey: false,
        apiKeyEnv: null,
        searchUrl: (keyword, key) =>
          `http://localhost:8888/search?q=${encodeURIComponent(keyword)}&format=json&categories=images`,
        parseResponse: (data, keyword) => {
          const results = data?.results || [];
          return results
            .filter((r) => r?.img_src)
            .map((r) => ({
              title: r.title || keyword,
              url: r.img_src,
              type: "image",
              resolution: r.resolution || undefined,
              fileSize: undefined,
              duration: undefined,
            }));
        },
      },
    },
  },
];

// ─── CDP image extraction capabilities ───
//
// Capabilities config for sources that also have image extraction via CDP.
// These are merged into the source definitions below via enrichWithCapabilities.
// Each config has: method:"cdp", url(keyword), imageScript, imageFallbackScript

const CDP_MEDIA_CAPABILITIES = {
  qbitai: {
    method: "cdp",
    url: () => "https://www.qbitai.com/",
    imageScript: `
      var results = [];
      document.querySelectorAll('a[href*="qbitai.com"]').forEach(function(a) {
        var text = a.textContent.trim();
        if (text.length < 10 || text.length > 200) return;
        var img = a.querySelector('img[src]') || a.parentElement.querySelector('img[src]');
        if (img && !img.src.startsWith('data:') && (img.naturalWidth > 200 || img.width > 200)) {
          results.push({ title: text, url: img.src, type: 'image', sourceUrl: a.href, snippet: text.substring(0, 200) });
        } else {
          results.push({ title: text, url: a.href, type: 'text', sourceUrl: a.href, snippet: text.substring(0, 200) });
        }
      });
      return results;
    `,
    imageFallbackScript: `
      var results = [];
      document.querySelectorAll('img[src]').forEach(function(img) {
        if ((img.naturalWidth > 200 || img.width > 200) && !img.src.startsWith('data:')) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  ithome: {
    method: "cdp",
    url: (keyword) => `https://www.ithome.com/search?word=${encodeURIComponent(keyword)}`,
    imageScript: `
      var items = document.querySelectorAll('.list .item, .news-list .item, article, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = (el.querySelector('.title, h3, h2')?.textContent || link?.textContent || '').trim();
        var snippet = el.querySelector('.desc, .summary, .abstract, .excerpt, p:not(.title)');
        var snippetText = snippet ? snippet.textContent.trim().substring(0, 200) : '';
        if (link && img) {
          results.push({ title: title, url: img.src, type: 'image', sourceUrl: link.href, snippet: snippetText });
        } else if (link && title) {
          results.push({ title: title, url: link.href, type: 'text', sourceUrl: link.href, snippet: snippetText });
        }
      });
      return results;
    `,
    imageFallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  jiqizhixin: {
    method: "cdp",
    url: (keyword) => `https://www.jiqizhixin.com/search?keywords=${encodeURIComponent(keyword)}`,
    imageScript: `
      var items = document.querySelectorAll('.article-list__item, .post-item, article, .list-item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = (el.querySelector('.article__title, h2, h3, .title')?.textContent || link?.textContent || '').trim();
        var snippet = el.querySelector('.desc, .summary, .abstract, .excerpt, p:not(.title)');
        var snippetText = snippet ? snippet.textContent.trim().substring(0, 200) : '';
        if (link && img) {
          results.push({ title: title, url: img.src, type: 'image', sourceUrl: link.href, snippet: snippetText });
        } else if (link && title) {
          results.push({ title: title, url: link.href, type: 'text', sourceUrl: link.href, snippet: snippetText });
        }
      });
      return results;
    `,
    imageFallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  google_news: {
    method: "cdp",
    url: (keyword) =>
      `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=nws&tbs=qdr:w`,
    imageScript: `
      var results = [];
      document.querySelectorAll('div.g, .Gx5Zad, .fP1Qef, div[data-ved]').forEach(function(el) {
        var link = el.querySelector('a[href]');
        var title = el.querySelector('h3, .LC20lb');
        var img = el.querySelector('img[src]');
        var snippet = el.querySelector('.VwiC3b, .IsZvec');
        var titleText = title ? title.textContent.trim() : '';
        var snippetText = snippet ? snippet.textContent.trim().substring(0, 200) : '';
        if (link && titleText) {
          if (img) {
            results.push({ title: titleText, url: img.src, type: 'image', sourceUrl: link.href, snippet: snippetText });
          } else {
            results.push({ title: titleText, url: link.href, type: 'text', sourceUrl: link.href, snippet: snippetText });
          }
        }
      });
      return results;
    `,
    imageFallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          if (!img.src.includes('gstatic') && !img.src.includes('google')) {
            results.push({ title: img.alt || '', url: img.src, type: 'image' });
          }
        }
      });
      return results;
    `,
  },
  bing_news: {
    method: "cdp",
    url: (keyword) =>
      `https://www.bing.com/news/search?q=${encodeURIComponent(keyword)}&qft=interval%3d%227%22`,
    imageScript: `
      var items = document.querySelectorAll('.news-item, .tob-article, .news-card, .b_caption');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = el.querySelector('h3, h2, .title, .b_caption p');
        var titleText = title ? title.textContent.trim() : '';
        var snippet = el.querySelector('.snippet, .b_caption p:not(.title), .news_snippet, p');
        var snippetText = snippet ? snippet.textContent.trim().substring(0, 200) : '';
        if (link && titleText) {
          if (img) {
            results.push({ title: titleText, url: img.src, type: 'image', sourceUrl: link.href, snippet: snippetText });
          } else {
            results.push({ title: titleText, url: link.href, type: 'text', sourceUrl: link.href, snippet: snippetText });
          }
        }
      });
      return results;
    `,
    imageFallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          if (!img.src.includes('bing.com') && !img.src.includes('r.bing')) {
            results.push({ title: img.alt || '', url: img.src, type: 'image' });
          }
        }
      });
      return results;
    `,
  },
  xinhua: {
    method: "cdp",
    url: (keyword) => `https://www.news.cn/search/news.htm?keyword=${encodeURIComponent(keyword)}`,
    imageScript: `
      var items = document.querySelectorAll('.search-result .item, .news-list .item, article');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = (el.querySelector('h3, h2, .title')?.textContent || link?.textContent || '').trim();
        var snippet = el.querySelector('.desc, .summary, .abstract, .excerpt, p:not(.title)');
        var snippetText = snippet ? snippet.textContent.trim().substring(0, 200) : '';
        if (link && img) {
          results.push({ title: title, url: img.src, type: 'image', sourceUrl: link.href, snippet: snippetText });
        } else if (link && title) {
          results.push({ title: title, url: link.href, type: 'text', sourceUrl: link.href, snippet: snippetText });
        }
      });
      return results;
    `,
    imageFallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  thepaper: {
    method: "cdp",
    url: (keyword) => `https://www.thepaper.cn/searchResult?keyword=${encodeURIComponent(keyword)}`,
    imageScript: `
      var items = document.querySelectorAll('.search-result .item, .news-list .item, article');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = (el.querySelector('h3, h2, .title')?.textContent || link?.textContent || '').trim();
        var snippet = el.querySelector('.desc, .summary, .abstract, .excerpt, p:not(.title)');
        var snippetText = snippet ? snippet.textContent.trim().substring(0, 200) : '';
        if (link && img) {
          results.push({ title: title, url: img.src, type: 'image', sourceUrl: link.href, snippet: snippetText });
        } else if (link && title) {
          results.push({ title: title, url: link.href, type: 'text', sourceUrl: link.href, snippet: snippetText });
        }
      });
      return results;
    `,
    imageFallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  leiphone: {
    method: "cdp",
    url: (keyword) => `https://www.leiphone.com/search?s=${encodeURIComponent(keyword)}`,
    imageScript: `
      var items = document.querySelectorAll('.article-list .item, .post-item, article, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = (el.querySelector('h2, h3, .title')?.textContent || link?.textContent || '').trim();
        var snippet = el.querySelector('.desc, .summary, .abstract, .excerpt, p:not(.title)');
        var snippetText = snippet ? snippet.textContent.trim().substring(0, 200) : '';
        if (link && img) {
          results.push({ title: title, url: img.src, type: 'image', sourceUrl: link.href, snippet: snippetText });
        } else if (link && title) {
          results.push({ title: title, url: link.href, type: 'text', sourceUrl: link.href, snippet: snippetText });
        }
      });
      return results;
    `,
    imageFallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  xinzhiyuan: {
    method: "cdp",
    url: (keyword) => `https://www.xinzhiyuan.com/?s=${encodeURIComponent(keyword)}`,
    imageScript: `
      var items = document.querySelectorAll('.post-item, article, .list-item, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = (el.querySelector('h2, h3, .title')?.textContent || link?.textContent || '').trim();
        var snippet = el.querySelector('.desc, .summary, .abstract, .excerpt, p:not(.title)');
        var snippetText = snippet ? snippet.textContent.trim().substring(0, 200) : '';
        if (link && img) {
          results.push({ title: title, url: img.src, type: 'image', sourceUrl: link.href, snippet: snippetText });
        } else if (link && title) {
          results.push({ title: title, url: link.href, type: 'text', sourceUrl: link.href, snippet: snippetText });
        }
      });
      return results;
    `,
    imageFallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
  zhidx: {
    method: "cdp",
    url: (keyword) => `https://zhidx.com/?s=${encodeURIComponent(keyword)}`,
    imageScript: `
      var items = document.querySelectorAll('.post-item, article, .list-item, .search-result .item');
      var results = [];
      items.forEach(function(el) {
        var link = el.querySelector('a[href]');
        var img = el.querySelector('img[src]');
        var title = (el.querySelector('h2, h3, .title')?.textContent || link?.textContent || '').trim();
        var snippet = el.querySelector('.desc, .summary, .abstract, .excerpt, p:not(.title)');
        var snippetText = snippet ? snippet.textContent.trim().substring(0, 200) : '';
        if (link && img) {
          results.push({ title: title, url: img.src, type: 'image', sourceUrl: link.href, snippet: snippetText });
        } else if (link && title) {
          results.push({ title: title, url: link.href, type: 'text', sourceUrl: link.href, snippet: snippetText });
        }
      });
      return results;
    `,
    imageFallbackScript: `
      var imgs = document.querySelectorAll('img[src]');
      var results = [];
      imgs.forEach(function(img) {
        if (img.naturalWidth > 200 || img.width > 200) {
          results.push({ title: img.alt || '', url: img.src, type: 'image' });
        }
      });
      return results;
    `,
  },
};

// ─── yt-dlp video capabilities ───
//
// Capabilities config for sources that also have video extraction via yt-dlp.
// These are merged into the source definitions below via enrichWithCapabilities.

const YTDLP_VIDEO_CAPABILITIES = {
  bilibili: {
    method: "ytdlp",
    platform: "bilibili",
  },
  // T2: douyin, xhs, weibo_hot removed — yt-dlp does not support these platforms.
  // searchYtdlp() would silently fall through to YouTube search, producing wrong-attribution results.
  // These platforms still have capabilities.articles for trend discovery.
  // Alternative downloaders (RedNote-MCP, weibo-downloader, Douyin_TikTok_Download_API) are tracked separately.
  youtube_search: {
    method: "ytdlp",
    platform: "youtube",
  },
};

// T2: Set of platforms that searchYtdlp() actually supports.
// Any platform not in this set returns [] immediately.
export const SUPPORTED_YTDLP_PLATFORMS = new Set(["bilibili", "youtube"]);

// ─── SOURCE_ATTRIBUTIONS ───
//
// Attribution data per source. Used to generate credits for TikTok description.
// Moved from asset-sourcer.mjs to source-registry.mjs so both consumers
// (trend discovery and asset sourcer) share the same source of truth.

export const SOURCE_ATTRIBUTIONS = {
  pexels: {
    text: (a) => `Photo by ${a.author || "Unknown"} from Pexels`,
    license: "Pexels License",
    logoRequired: false,
  },
  "pexels-video": {
    text: (a) => `Video by ${a.author || "Unknown"} from Pexels`,
    license: "Pexels License",
    logoRequired: false,
  },
  unsplash: {
    text: (a) => `Photo by ${a.author || "Unknown"} on Unsplash`,
    license: "Unsplash License",
    logoRequired: false,
  },
  pixabay: {
    text: () => `Source: Pixabay (https://pixabay.com)`,
    license: "Pixabay Content License",
    logoRequired: true,
  },
  wikimedia: {
    text: (a) => `${a.author || "Unknown"} via Wikimedia Commons (${a.license || "CC-BY-SA 4.0"})`,
    license: "CC-BY-SA 4.0",
    logoRequired: false,
    dynamicAttribution: true,
  },
  coverr: {
    text: () => `Video from Coverr (https://coverr.co)`,
    license: "Coverr License",
    logoRequired: false,
  },
  // R3: Key matches yt-dlp source name (youtube_search, not youtube)
  youtube_search: {
    text: (a) => `Contains footage from ${a.author || a.title || "Unknown"} (YouTube)`,
    license: "Fair use",
    logoRequired: false,
  },
  bilibili: {
    text: (a) => `Contains footage from ${a.author || "Unknown"} (B站)`,
    license: "Fair use",
    logoRequired: false,
  },
  douyin: {
    text: (a) => `Contains footage from ${a.author || "Unknown"} (抖音)`,
    license: "Fair use",
    logoRequired: false,
  },
  // R3: Keys match yt-dlp source names in capabilities.videos (xhs, weibo_hot)
  xhs: {
    text: (a) => `Contains footage from ${a.author || "Unknown"} (小红书)`,
    license: "Fair use",
    logoRequired: false,
  },
  weibo_hot: {
    text: (a) => `Contains footage from ${a.author || "Unknown"} (微博)`,
    license: "Fair use",
    logoRequired: false,
  },
  ithome: {
    text: () => `图片来源: IT之家 (ithome.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  jiqizhixin: {
    text: () => `图片来源: 机器之心 (jiqizhixin.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  xinhua: {
    text: () => `图片来源: 新华网 (news.cn)`,
    license: "News copyright",
    logoRequired: false,
  },
  thepaper: {
    text: () => `图片来源: 澎湃新闻 (thepaper.cn)`,
    license: "News copyright",
    logoRequired: false,
  },
  leiphone: {
    text: () => `图片来源: 雷锋网 (leiphone.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  xinzhiyuan: {
    text: () => `图片来源: 新智元 (xinzhiyuan.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  zhidx: {
    text: () => `图片来源: 智东西 (zhidx.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  google_news: {
    text: (a) => `Image source: ${a.sourceUrl || "Google News"}`,
    license: "Varies",
    logoRequired: false,
  },
  duckduckgo_search: {
    text: (a) => `Source: ${a.sourceUrl || "DuckDuckGo"} (via DuckDuckGo Search)`,
    license: "Varies",
    logoRequired: false,
  },
  bing_news: {
    text: (a) => `Image source: ${a.sourceUrl || "Bing News"}`,
    license: "Varies",
    logoRequired: false,
  },
  baidu_news: {
    text: (a) => `文章来源: 百度新闻 (baidu.com)`,
    license: "Varies",
    logoRequired: false,
  },
  // ─── WeChat RSS sources (微信公众号 RSS 转载) ───
  wechat2rss_geekpark: {
    text: () => `文章来源: 极客公园 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat2rss_bytedance_tech: {
    text: () => `文章来源: 字节跳动技术团队 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat2rss_meituan_tech: {
    text: () => `文章来源: 美团技术团队 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat2rss_jiqizhixin: {
    text: () => `文章来源: 机器之心 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat2rss_zhinengyuan: {
    text: () => `文章来源: 新智元 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat2rss_qbitai: {
    text: () => `文章来源: 量子位 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat2rss_ai_cv: {
    text: () => `文章来源: 我爱计算机视觉 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat2rss_datawhale: {
    text: () => `文章来源: Datawhale (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat2rss_tencent_tech: {
    text: () => `文章来源: 腾讯技术工程 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat2rss_xiaomi_tech: {
    text: () => `文章来源: 小米技术 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat2rss_alicloud_dev: {
    text: () => `文章来源: 阿里云开发者 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat2rss_alibaba_tech: {
    text: () => `文章来源: 阿里技术 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  // ─── Additional trend discovery / search sources ───
  qbitai: {
    text: (a) => `文章来源: 量子位 (qbitai.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  "36kr": {
    text: (a) => `文章来源: 36氪 (36kr.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  techcrunch: {
    text: (a) => `Article source: TechCrunch (techcrunch.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  bloomberg: {
    text: (a) => `Article source: Bloomberg (bloomberg.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  guancha: {
    text: (a) => `文章来源: 观察者网 (guancha.cn)`,
    license: "News copyright",
    logoRequired: false,
  },
  sogou_weixin: {
    text: (a) => `文章来源: 搜狗微信 (weixin.sogou.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  tiktok_creator: {
    text: (a) => `Content source: TikTok Creator (via ScrapeCreators API)`,
    license: "Platform ToS",
    logoRequired: false,
  },
  zhihu: {
    text: (a) => `文章来源: 知乎 (zhihu.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  x_search: {
    text: (a) => `Post source: X/Twitter (x.com)`,
    license: "Platform ToS",
    logoRequired: false,
  },
  arxiv_search: {
    text: (a) => `Paper source: arXiv (arxiv.org)`,
    license: "arXiv License",
    logoRequired: false,
  },
  github_search: {
    text: (a) => `Code source: GitHub (github.com)`,
    license: "Open source",
    logoRequired: false,
  },
  threads_search: {
    text: (a) => `Post source: Threads (threads.net)`,
    license: "Platform ToS",
    logoRequired: false,
  },
  datacube_ai: {
    text: (a) => `Data source: DataCube AI (datacube.ai)`,
    license: "Varies",
    logoRequired: false,
  },
  gnews: {
    text: (a) => `Article source: GNews (gnews.io)`,
    license: "Varies",
    logoRequired: false,
  },
  core_search: {
    text: (a) => `Paper source: CORE (core.ac.uk)`,
    license: "Open access",
    logoRequired: false,
  },
  openalex_search: {
    text: (a) => `Paper source: OpenAlex (openalex.org)`,
    license: "Open access",
    logoRequired: false,
  },
  google_search: {
    text: (a) => `Search source: Google Search (google.com)`,
    license: "Varies",
    logoRequired: false,
  },
  baidu_search: {
    text: (a) => `文章来源: 百度搜索 (baidu.com)`,
    license: "Varies",
    logoRequired: false,
  },
  mcp_grok_search: {
    text: (a) => `Search source: Grok (via MCP)`,
    license: "Varies",
    logoRequired: false,
  },
  currents: {
    text: (a) => `Article source: Currents API (currentsapi.services)`,
    license: "Varies",
    logoRequired: false,
  },
  noozra_search: {
    text: (a) => `Search source: Noozra (noozra.com)`,
    license: "Varies",
    logoRequired: false,
  },
  reddit_search: {
    text: (a) => `Post source: Reddit (reddit.com)`,
    license: "Platform ToS",
    logoRequired: false,
  },
  hackernews_search: {
    text: (a) => `Post source: Hacker News (news.ycombinator.com)`,
    license: "Public domain",
    logoRequired: false,
  },
  polymarket_search: {
    text: (a) => `Data source: Polymarket (polymarket.com)`,
    license: "Varies",
    logoRequired: false,
  },
  digg_search: {
    text: (a) => `Article source: Digg (digg.com)`,
    license: "Varies",
    logoRequired: false,
  },
  techmeme_search: {
    text: (a) => `Article source: Techmeme (techmeme.com)`,
    license: "News copyright",
    logoRequired: false,
  },
  wechat_dongchabeating: {
    text: () => `文章来源: 冬奥速递 (微信公众号)`,
    license: "News copyright",
    logoRequired: false,
  },
  // ─── Open search engine sources (Issue #110: Tier 3) ───
  brave_image: {
    text: () => `Image source: Brave Search (copyright unverified)`,
    license: "Copyright unverified — manual review required",
    logoRequired: false,
    attributionRequired: true,
  },
  searxng_image: {
    text: () => `Image source: SearXNG (copyright unverified)`,
    license: "Copyright unverified — manual review required",
    logoRequired: false,
    attributionRequired: true,
  },
};

// ─── Capabilities enrichment ───
//
// Automatically adds a `capabilities` object to each source based on its
// existing fields. Sources that have articleScript get capabilities.articles.
// Sources that are in CDP_MEDIA_CAPABILITIES get capabilities.images.
// Sources that are in YTDLP_VIDEO_CAPABILITIES get capabilities.videos.
//
// Stock API sources already have explicit capabilities and are not processed.
//
// Issue #67: capabilities.articles is the complete source of truth.
// All article-consumption fields (method, apiSearch, credentials, fallbacks)
// are direct-referenced into the capability. Top-level fields remain as
// legacy compat — mutations reflect in both because they share references.

// Hard-coded apiKeyEnv mapping for sources that require an API key.
// Other API sources have authRequired=false and get apiKeyEnv=null.
const API_KEY_ENV_MAP = {
  tiktok_creator: "SCRAPECREATORS_API_KEY",
  gnews: "GNEWS_API_KEY",
  currents: "CURRENTS_API_KEY",
};

// ─── #88 Part 2: Universal Google site: fallback auto-generation ───

/**
 * Shared Google search results extractor script.
 *
 * Selects all <h3> elements (Google search result titles) and extracts
 * the closest <a> link. No domain filter — Google `site:` search already
 * restricts results to the specified domain.
 *
 * Used by autoGenerateGoogleSiteFallback() for all applicable sources.
 * X search keeps its own explicit googleSiteFallback with domain filter.
 */
export const SHARED_GOOGLE_SITE_SEARCH_SCRIPT = `
  var results = [];
  document.querySelectorAll('h3').forEach(function(h3) {
    var a = h3.closest('a') || h3.parentElement.querySelector('a');
    if (a && a.href) {
      results.push({ title: h3.textContent.trim(), url: a.href });
    }
  });
  return results;
`;

/**
 * Sources excluded from auto-generated Google site: fallback.
 */
const AUTOGEN_EXCLUDED_SOURCES = new Set([
  // Search engines — they ARE search, no "own domain" to site:
  "google_news",
  "bing_news",
  "baidu_news",
  "google_search",
  "baidu_search",
  "duckduckgo_search",
  "digg_search",
  "techmeme_search",
  "polymarket_search",
  // Image/asset libraries — Google site: doesn't return images
  "pexels",
  "pexels_video",
  "unsplash",
  "wikimedia",
  "coverr",
  "pixabay",
  // RSS feed — no web search needed
  "datacube_ai",
  // Uses Google search as primary URL already
  "wechat_dongchabeating",
  // Hot search page, no keyword search need
  "weibo_hot",
]);

/**
 * Check if a source should get auto-generated googleSiteFallback.
 *
 * Returns true if the source:
 * - Has articleScript (i.e., has capabilities.articles)
 * - Does NOT have explicit googleSiteFallback
 * - Does NOT have apiSearch (API sources don't need Google site: fallback)
 * - Does NOT have mcpFallback (MCP is more precise than Google site:)
 * - Is NOT in the exclusion list (search engines, image libraries, etc.)
 *
 * @param {Object} source - Source definition from registry
 * @returns {boolean}
 */
export function shouldAutoGenGoogleSiteFallback(source) {
  // Guard against null/undefined source
  if (!source) return false;
  // Must have articleScript (capabilities.articles is built from it)
  if (!source.articleScript) return false;
  // Skip if explicit googleSiteFallback exists (override path)
  if (source.googleSiteFallback) return false;
  // Skip API sources — if API fails, site is down, Google won't help
  if (source.apiSearch) return false;
  // Skip MCP sources — MCP is more precise than Google site:
  if (source.mcpFallback) return false;
  // Skip excluded sources (search engines, image libraries, special cases)
  if (AUTOGEN_EXCLUDED_SOURCES.has(source.name)) return false;
  return true;
}

/**
 * Auto-generate a googleSiteFallback config from a source's URL domain.
 *
 * Extracts the hostname from source.url(keyword) and builds a Google
 * `site:domain.com keyword` search URL with the shared h3 extractor script.
 *
 * @param {Object} source - Source definition from registry
 * @returns {Object|null} googleSiteFallback config, or null if URL unparseable
 */
export function autoGenerateGoogleSiteFallback(source) {
  let domain;
  try {
    const testKeyword = "test";
    const url = typeof source.url === "function" ? source.url(testKeyword) : source.url;
    if (!url || typeof url !== "string") return null;
    domain = new URL(url).hostname;
  } catch {
    return null;
  }
  return {
    url: (keyword) =>
      `https://www.google.com/search?q=${encodeURIComponent("site:" + domain + " " + keyword)}`,
    articleScript: SHARED_GOOGLE_SITE_SEARCH_SCRIPT,
    _autoGenerated: true,
  };
}

function enrichWithCapabilities(sources) {
  return sources.map((source) => {
    // Skip sources that already have capabilities (stock API sources)
    if (source.capabilities) return source;

    const capabilities = {};

    // R4 + #67: Articles — all article-consumption fields in capabilities.articles
    if (source.articleScript) {
      const api = source.apiSearch;
      // #88 Part 2: Auto-generate googleSiteFallback for applicable sources
      const autoFallback = shouldAutoGenGoogleSiteFallback(source)
        ? autoGenerateGoogleSiteFallback(source)
        : null;
      capabilities.articles = {
        method: source.accessMethod?.primary || "cdp",
        supportsKeyword: source.supportsKeyword,
        url: source.url,
        articleScript: source.articleScript,
        loginCheckScript: source.loginCheckScript || null,
        needsAuth: source.needsAuth || false,
        useCleanTitle: source.useCleanTitle || false,
        // API credentials (source-level, not apiSearch-level)
        apiSearch: api, // direct reference; undefined if not configured
        requiresApiKey: !!api?.authRequired,
        apiKeyEnv: API_KEY_ENV_MAP[source.name] || null,
        paidApi: !!api?.paidApi,
        // Fallback chain: explicit config takes priority, then auto-generated
        googleSiteFallback: source.googleSiteFallback || autoFallback,
        mcpFallback: source.mcpFallback,
      };
    }

    // Images: from CDP_MEDIA_CAPABILITIES
    if (CDP_MEDIA_CAPABILITIES[source.name]) {
      capabilities.images = CDP_MEDIA_CAPABILITIES[source.name];
    }

    // Videos: from YTDLP_VIDEO_CAPABILITIES
    if (YTDLP_VIDEO_CAPABILITIES[source.name]) {
      capabilities.videos = YTDLP_VIDEO_CAPABILITIES[source.name];
    }

    return { ...source, capabilities };
  });
}

// ─── All sources combined ───

const _ENRICHED_NEWS = enrichWithCapabilities(NEWS_SOURCES);
const _ENRICHED_SELF_MEDIA = enrichWithCapabilities(SELF_MEDIA_SOURCES);
const _ENRICHED_INTERNATIONAL = enrichWithCapabilities(INTERNATIONAL_SOURCES);
const _ENRICHED_GENERAL = enrichWithCapabilities(GENERAL_SEARCH_SOURCES);
const _ENRICHED_LAST30DAYS = enrichWithCapabilities(LAST30DAYS_SOURCES);
const _ENRICHED_WECHAT_ACCOUNT = enrichWithCapabilities(WECHAT_ACCOUNT_SOURCES);
const _ENRICHED_WECHAT_RSS = enrichWithCapabilities(WECHAT_RSS_SOURCES);

export const ALL_SOURCES = [
  ..._ENRICHED_NEWS,
  ..._ENRICHED_SELF_MEDIA,
  ..._ENRICHED_INTERNATIONAL,
  ..._ENRICHED_GENERAL,
  ..._ENRICHED_LAST30DAYS,
  ..._ENRICHED_WECHAT_ACCOUNT,
  ..._ENRICHED_WECHAT_RSS,
  ...STOCK_MEDIA_SOURCES,
];

/**
 * Default search keywords for self-media sources that require a keyword.
 */
export const DEFAULT_KEYWORDS = ["AI大模型", "China AI"];
