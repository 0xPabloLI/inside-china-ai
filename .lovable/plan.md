# 每篇新闻文章的 OG 图像与结构化数据

## 目标

让现有及以后发布的每篇新闻文章都自动拥有独立、可抓取的 1200×630 Open Graph 图片，并输出完整一致的 Article 结构化数据，供 Google、Google News 和社交平台识别。

## 实施范围

1. **自动文章图片**
   - 新增公开图片地址，根据文章 slug 读取标题与发布时间，实时生成 1200×630 PNG 品牌标题图。
   - 图片包含 China AI News 品牌、文章标题和发布日期；长标题自动换行并限制安全区域。
   - 图片按文章更新时间生成版本化 URL，并设置公开缓存；文章更新后会得到新版本，避免旧预览长期缓存。
   - 所有现有文章和未来文章自动覆盖，不增加上传步骤，也不调用按次计费的生成式 AI。

2. **文章页元信息**
   - 每篇文章的 `og:image`、`twitter:image` 指向自己的绝对 HTTPS 图片地址。
   - 补齐图片宽高、类型与替代文本信息，并保持现有文章标题、描述、canonical 和 Twitter 卡片设置不变。

3. **Article 结构化数据**
   - Article JSON-LD 使用同一张文章图片。
   - 补齐并校正 `datePublished`、`dateModified`、`mainEntityOfPage`、作者、发布者、语言等字段。
   - 保留 BreadcrumbList，并形成 Home → News → 当前文章的层级。

4. **文章数据与校验**
   - 公开文章查询返回 `updated_at`，用于图片版本和 `dateModified`。
   - 扩展现有 SEO 构建校验与单元测试，覆盖：每篇图片 URL 唯一、绝对 HTTPS、1200×630 元信息、结构化数据图片一致、日期和面包屑有效。

## 技术细节

- 使用适配当前托管运行环境的 SVG→PNG 渲染方式，不使用 `sharp`、浏览器进程或其他原生运行库。
- 图片接口只读取已发布文章；草稿和不存在的 slug 返回 404。
- XML sitemap 与 Google News sitemap 的现有行为不改变；文章页仍是抓取入口。
- 不新增数据库字段或人工封面管理。

## 验收标准

- 任取两篇已发布文章，页面源码中的 `og:image` URL 不同，且均返回 HTTP 200、`image/png`、1200×630。
- 同一文章的 Open Graph、Twitter 和 Article JSON-LD 使用同一图片 URL。
- Article JSON-LD 通过现有构建校验，包含发布和修改日期。
- 草稿不能通过图片地址泄露标题。
- 相关测试、SEO 校验和预览构建通过。

## 不包含

- 不改变文章正文或首页设计。
- 不生成写实新闻配图；本次使用统一品牌标题图。
- 不发布上线；代码完成后需下一次 Publish 才会出现在 `chinaai.news`。
