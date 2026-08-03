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
];

// ─── All sources combined ───

export const ALL_SOURCES = [...NEWS_SOURCES, ...SELF_MEDIA_SOURCES];

/**
 * Default search keywords for self-media sources that require a keyword.
 */
export const DEFAULT_KEYWORDS = ["AI大模型", "China AI"];
