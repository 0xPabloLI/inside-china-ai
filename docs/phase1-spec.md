# Phase 1 Spec — 发布效率（ISSUE-02 + ISSUE-04）

> 创建于 2026-08-02。基于 Grill with Docs 决策结果合成。

---

## 1. ISSUE-02: Caption + Hashtag 自动输出为文件

### 1.1 架构

- **新建** `scripts/short-video/generate-caption.mjs`（独立脚本，也可被 verify-video.mjs 调用）
- **修改** `scripts/short-video/verify-video.mjs`（末尾：all checks pass → 调用 generate-caption）
- **可选** `scripts/short-video/scene-data.mjs`（新增可选 `export const metadata = { title?, description?, hashtags? }`）

### 1.2 数据流

```
scene-data.mjs
  ├─ metadata (optional: title, description, hashtags)
  └─ scenes[]
       ├─ [0].voiceover + .texts  → title 推导（若 metadata.title 缺失）
       ├─ [*].voiceover           → description 拼接（若 metadata.description 缺失）
       └─ [*].voiceover + .texts  → hashtag 实体提取（若 metadata.hashtags 缺失）
                                    ↓
                            generate-caption.mjs
                                    ↓
                    output/tiktok-caption.txt  (人用：直接粘贴)
                    output/tiktok-metadata.json (程序用：ISSUE-01 API 发布)
```

### 1.3 输出格式

**`output/tiktok-caption.txt`**（纯文本，直接粘贴到 TikTok 输入框）：

```
{title}

{description}

{hashtag1} {hashtag2} {hashtag3} {hashtag4}
```

**`output/tiktok-metadata.json`**（结构化，给后续 ISSUE-01 用）：

```json
{
  "title": "...",           // ≤60 chars
  "description": "...",     // ≤2200 chars (含 hashtag)
  "hashtags": ["#chinaai", "#deepseek", ...],  // 3-5 个
  "generatedAt": "2026-08-02T12:00:00Z",
  "source": "auto-derived" | "scene-data-metadata"
}
```

### 1.4 自动推导逻辑

#### Title 推导（metadata.title 缺失时）

1. 从 `scenes[0].voiceover` 提取核心信息：命名实体 + 数字 + 动作动词
2. 从 `scenes[0].texts` 提取焦点词（line1, line2 等）
3. 综合生成：`{焦点词} {命名实体}'s {数字} {动作}`
   - 例：voiceover="A leaked four-hour investor meeting just paused DeepSeek's 1.4 billion dollar funding round."
   - texts={ line1: "LEAKED MEETING", line2: "PAUSED $1.4B" }
   - → "Leaked Meeting Pauses DeepSeek's $1.4B Round"
4. 截断到 ≤60 字符（在词边界截断，不截断单词）
5. 保证包含至少一个 SEO 关键词（China/AI/DeepSeek 之一）

#### Description 推导（metadata.description 缺失时）

1. 从每个 scene 的 voiceover 取第一句话（按 `.`/`!`/`?` 分割）
2. 用换行连接
3. 末尾加 CTA：`"Follow for more China AI news."`
4. 保证包含 SEO 关键词（China AI, DeepSeek 至少各出现一次）
5. 截断到 ≤2200 字符（含 hashtag），截断时保留完整句子

#### Hashtag 推导（metadata.hashtags 缺失时）

预定义实体→hashtag 映射表：

| 实体关键词（voiceover/texts 中匹配） | Hashtag     |
| ------------------------------------ | ----------- |
| DeepSeek                             | #deepseek   |
| China / Chinese                      | #chinaai    |
| AI / artificial intelligence         | #ai         |
| open source / open-source            | #opensource |
| Nvidia                               | #nvidia     |
| funding / investment                 | #technews   |
| ByteDance                            | #bytedance  |
| Alibaba                              | #alibaba    |
| Tencent                              | #tencent    |
| Baidu                                | #baidu      |

逻辑：

1. 扫描所有 scene 的 voiceover + texts
2. 匹配预定义表，命中什么取什么
3. 保底：始终包含 `#chinaai`（核心 niche）
4. 去重，选 3-5 个（优先 niche，broad 补位）
5. 若命中 <3 个，用默认 broad hashtag 补位：`#ai`, `#technews`

### 1.5 verify-video.mjs 集成

在 `printSummary()` 之后、`process.exit()` 之前：

```
if (results.fail.length === 0) {
  // all automated checks passed → generate caption
  await import('./generate-caption.mjs');
}
```

### 1.6 独立运行

```bash
node scripts/short-video/generate-caption.mjs   # 单独运行
node scripts/short-video/verify-video.mjs --tiktok  # verify + 自动生成 caption
```

---

## 2. ISSUE-04: 新闻趋势监控脚本

### 2.1 架构

- **新建** `scripts/short-video/discover-trends.mjs`
- 依赖：Chrome CDP proxy（localhost:3456），web-access skill

### 2.2 源站配置

| 源             | URL                                                      | 语言 | 抓取方式           | 备注                         |
| -------------- | -------------------------------------------------------- | ---- | ------------------ | ---------------------------- |
| 量子位         | https://www.qbitai.com/                                  | 中文 | CDP `new` + `eval` | AI 专业媒体                  |
| 机器之心       | https://www.jiqizhixin.com/                              | 中文 | CDP `new` + `eval` | AI 专业媒体                  |
| 36氪           | https://36kr.com/                                        | 中文 | CDP `new` + `eval` | 科技综合                     |
| TechCrunch AI  | https://techcrunch.com/category/artificial-intelligence/ | 英文 | CDP `new` + `eval` | 英文科技                     |
| Bloomberg Tech | https://www.bloomberg.com/technology                     | 英文 | CDP `new` + `eval` | 可能有付费墙，用 CDP session |

### 2.3 抓取流程

```
1. 检查 CDP proxy（curl localhost:3456/targets）
   └─ 不可用 → 报错退出，提示用户启用 Chrome Remote Debugging
2. 对每个源：
   a. POST localhost:3456/new?url={source_url} → 获取 tabId
   b. 等待页面加载（eval 检查 document.readyState）
   c. POST localhost:3456/eval?target={tabId} → 提取文章列表
   d. 关闭 tab（POST localhost:3456/close?target={tabId}）
3. 过滤：只保留 China AI 相关（关键词匹配）
4. 分类：关键词启发式
5. 去重：标题相似度 >=80% 合并
6. 输出 JSON
```

### 2.4 提取规则

每个源的 DOM 提取逻辑不同，用自定义 selector：

| 源         | 文章选择器                           | 标题选择器                    | 链接选择器 |
| ---------- | ------------------------------------ | ----------------------------- | ---------- |
| 量子位     | `.article-item` / `.post-item`       | `.article-item-title` / h2/h3 | `a[href]`  |
| 机器之心   | `.article-list__item` / `.post-item` | `.article__title` / h2/h3     | `a[href]`  |
| 36氪       | `.kr-flow-item` / `.article-item`    | `.kr-flow-item-title` / h2/h3 | `a[href]`  |
| TechCrunch | `article.post`                       | `h2.article__title` / h2      | `a[href]`  |
| Bloomberg  | `article.story-package`              | `h3.lede-text-v2` / h3        | `a[href]`  |

> 实现时用 `Array.from(document.querySelectorAll(...)).map(el => ({title, url}))` 提取，selector 可能需要适配实际 DOM。脚本应对 selector 不匹配的情况做 fallback（取所有 `a` 标签里带文本的链接）。

### 2.5 China AI 过滤关键词

保留包含以下关键词之一的标题（大小写不敏感）：

- 中文：AI、人工智能、大模型、DeepSeek、深度求索、字节跳动、百度、阿里、腾讯、华为、芯片、算力、智谱、月之暗面、Kimi、通义千问、文心一言
- 英文：AI, China AI, DeepSeek, ByteDance, Baidu, Alibaba, Tencent, Huawei, chip, semiconductor, Qwen, Ernie, Kimi, Zhipu, Moonshot

### 2.6 分类关键词表

| 分类             | 中文关键词                                | 英文关键词                                                             |
| ---------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| 爆发(breaking)   | 突发、刚刚、最新、快讯、泄露、暂停、宣布  | breaking, just in, leaked, paused, announces, reveals                  |
| 发酵(fermenting) | 解读、分析、深度、背后、评论、发酵        | analysis, deep dive, breakdown, explainer, behind, commentary          |
| 数据(data)       | 报告、数据、亿、%、增长、下降、融资、估值 | report, data, billion, million, %, growth, decline, funding, valuation |
| 科普(explainer)  | 科普、入门、指南、教程、什么是            | how to, guide, tutorial, explainer, what is, 101                       |

分类逻辑：

1. 遍历分类表，按优先级（爆发 > 数据 > 发酵 > 科普）匹配
2. 多个分类同时命中时，取优先级最高的
3. 都不命中 → 默认 "fermenting"

### 2.7 去重逻辑

- 标题相似度算法：Jaccard 相似度（基于词集合）
- 阈值：>=0.8 视为同一篇
- 合并时：保留较长标题，sources 数组合并，url 保留第一个

### 2.8 输出格式

**`output/trending-topics.json`**：

```json
{
  "scrapedAt": "2026-08-02T12:00:00Z",
  "totalTopics": 12,
  "sourceStats": {
    "qbitai": 4,
    "jiqizhixin": 3,
    "36kr": 2,
    "techcrunch": 2,
    "bloomberg": 1
  },
  "topics": {
    "breaking": [
      {
        "title": "DeepSeek pauses $1.4B funding round after leaked meeting",
        "sources": ["qbitai", "bloomberg"],
        "urls": ["https://...", "https://..."],
        "keywords": ["DeepSeek", "funding"],
        "summary": ""
      }
    ],
    "fermenting": [...],
    "data": [...],
    "explainer": [...]
  }
}
```

### 2.9 命令

```bash
node scripts/short-video/discover-trends.mjs
```

---

## 3. Scenario & Risk Verification Matrix

> 矩阵行直接成为测试用例。每行 = 一个测试用例。

### ISSUE-02 场景矩阵

| #   | 场景                                         | 输入                                  | 预期输出                                          | 风险等级       |
| --- | -------------------------------------------- | ------------------------------------- | ------------------------------------------------- | -------------- |
| S1  | scene-data 有完整 metadata                   | metadata={title,description,hashtags} | 直接用 metadata 值，不推导                        | 低             |
| S2  | scene-data 无 metadata（当前状态）           | 无 metadata export                    | 全部自动推导，输出正确                            | 中             |
| S3  | metadata 有 title 但无 description/hashtags  | 部分 metadata                         | title 用 metadata，其余自动推导                   | 中             |
| S4  | metadata.hashtags 有 2 个（不足 3）          | hashtags=["#ai","#deepseek"]          | 补位到 3-5 个，用预定义表补                       | 低             |
| S5  | metadata.hashtags 有 6 个（超量）            | hashtags=[6个]                        | 截断到 5 个，优先 niche                           | 低             |
| S6  | 推导的 title > 60 字符                       | 长标题                                | 在词边界截断到 ≤60 字符                           | 中             |
| S7  | 推导的 description > 2200 字符（含 hashtag） | 很长的 voiceover                      | 截断到 ≤2200，保留完整句子                        | 中             |
| S8  | 无任何实体命中 hashtag                       | voiceover 无已知实体                  | 用默认 broad hashtag 补位                         | 低             |
| S9  | verify-video.mjs 有 FAIL                     | results.fail > 0                      | 不生成 caption 文件                               | 高             |
| S10 | scene-data.mjs 语法错误                      | import 失败                           | verify-video.mjs 已处理（exit 1），不执行 caption | 高（已有保护） |
| S11 | output 目录不存在                            | 首次运行                              | 脚本自动创建 output 目录                          | 低             |
| S12 | caption 文件已存在                           | 重复运行                              | 覆盖旧文件，无警告                                | 低             |
| S13 | 独立运行 generate-caption.mjs                | 不经过 verify                         | 也能正常生成 caption                              | 中             |
| S14 | title 不含任何 SEO 关键词                    | 推导结果缺关键词                      | 追加 SEO 关键词到 title                           | 中             |
| S15 | 所有 scene voiceover 都很短                  | 每句 <5 词                            | description 仍能生成（即使很短）                  | 低             |

### ISSUE-04 场景矩阵

| #   | 场景                           | 输入                        | 预期输出                                   | 风险等级 |
| --- | ------------------------------ | --------------------------- | ------------------------------------------ | -------- |
| T1  | CDP proxy 正常，5 源全部可访问 | 标准运行                    | JSON 含 ≥5 条分类选题                      | 低       |
| T2  | CDP proxy 未启动               | curl 失败                   | 报错退出，提示启用 Remote Debugging        | 高       |
| T3  | 某个源站不可访问               | 36kr 超时                   | 跳过该源，继续其他源，sourceStats 记 0     | 中       |
| T4  | 某个源 selector 不匹配         | DOM 结构变化                | fallback 提取所有带文本的 `a` 标签         | 中       |
| T5  | 无 China AI 相关文章           | 所有源无匹配                | topics 4 类全空数组，totalTopics=0         | 中       |
| T6  | 文章数 < 5                     | 只有 3 条                   | 输出 3 条，console.warn 提示不足           | 低       |
| T7  | 中英文标题混合                 | 36kr 中文 + TechCrunch 英文 | 分类表支持双语，正确分类                   | 中       |
| T8  | 同一新闻 3 个源都有            | 3 源标题相似                | 合并为 1 条，sources 数组含 3 个源         | 中       |
| T9  | Bloomberg 付费墙               | 内容被挡                    | CDP session 有登录态则正常；否则跳过，warn | 高       |
| T10 | 分类不命中任何关键词           | 标题无关键词                | 默认归入 "fermenting"                      | 低       |
| T11 | 页面 JS 未渲染完               | eval 时 DOM 为空            | 等待 3s 重试 1 次，仍空则跳过该源          | 中       |
| T12 | 重复运行                       | JSON 已存在                 | 覆盖旧文件                                 | 低       |
| T13 | 标题含特殊字符                 | 引号、换行等                | JSON 转义正确，txt 中原样保留              | 低       |

---

## 4. 测试策略

- **测试框架**：Vitest（已在 devDependencies）
- **测试文件位置**：`scripts/short-video/__tests__/`
- **ISSUE-02 测试**：`generate-caption.test.mjs` — 测试 title/description/hashtag 推导逻辑（纯函数，不依赖文件 IO）
  - 将推导逻辑拆为纯函数：`deriveTitle(scenes, metadata?)`, `deriveDescription(scenes, metadata?)`, `deriveHashtags(scenes, metadata?)`
  - 测试覆盖 S1-S15 所有场景
- **ISSUE-04 测试**：`discover-trends.test.mjs` — 测试分类逻辑和去重逻辑（纯函数）
  - 将分类和去重拆为纯函数：`classifyTopic(title)`, `deduplicateTopics(topics)`, `filterChinaAI(title)`
  - 测试覆盖 T1-T13 中可单元测试的场景（T2/T3/T9 等涉及 CDP 的用集成测试手动验证）

---

## 5. 验收标志

### ISSUE-02

- [ ] `generate-caption.mjs` 存在且可独立运行
- [ ] `verify-video.mjs --tiktok` 通过后自动生成 `output/tiktok-caption.txt` 和 `output/tiktok-metadata.json`
- [ ] caption.txt 内容：title ≤60 chars, description+hashtag ≤2200 chars, 3-5 hashtags
- [ ] Vitest 测试覆盖 S1-S15 所有场景

### ISSUE-04

- [ ] `discover-trends.mjs` 存在且可运行
- [ ] 运行后 `output/trending-topics.json` 存在，含元数据 + 分类选题
- [ ] 选题数 ≥5（源站正常时）
- [ ] Vitest 测试覆盖 T1-T13 中可单元测试的场景
