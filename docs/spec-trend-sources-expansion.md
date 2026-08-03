# Spec: Trend Sources Expansion — 自媒体渠道接入

> 创建于 2026-08-04。
> 基于 Grill 阶段分析，采用纯 CDP 方案，在 `discover-trends.mjs` 中新增 6 个自媒体趋势源。

---

## 1. 目标

在现有 5 个 CDP 新闻源（量子位/机器之心/36氪/TechCrunch/Bloomberg）基础上，新增 6 个自媒体/社交平台趋势源，统一通过 CDP（web-access skill）抓取搜索页，输出到现有 `trending-topics.json`。

**最终趋势源列表（11 个）**：

| # | 源 | 类型 | 入口 URL | 登录需求 |
|---|---|------|---------|---------|
| 1 | 量子位 | 新闻 | qbitai.com | 无 |
| 2 | 机器之心 | 新闻 | jiqizhixin.com | 无 |
| 3 | 36氪 | 新闻 | 36kr.com | 无 |
| 4 | TechCrunch AI | 新闻 | techcrunch.com | 无 |
| 5 | Bloomberg Tech | 新闻 | bloomberg.com | 无 |
| 6 | **小红书** | 社交 | xiaohongshu.com/search_result | 需要 |
| 7 | **搜狗微信** | 搜索 | weixin.sogou.com | 无 |
| 8 | **微博热搜** | 社交 | s.weibo.com/top/summary | 无 |
| 9 | **B站搜索** | 视频 | search.bilibili.com | 无 |
| 10 | **抖音搜索** | 视频 | douyin.com/search | 需要 |
| 11 | **TikTok Creator** | 平台 | tiktok.com/creator-center | 需要 |

## 2. 架构设计

### 2.1 可插拔 Source 架构

将现有硬编码的 `SOURCES` 数组重构为可插拔的 source collector 模式：

```javascript
// 统一接口
interface SourceCollector {
  name: string;        // 唯一标识 (e.g., "xhs")
  label: string;       // 显示名 (e.g., "小红书")
  needsAuth: boolean;  // 是否需要登录
  collect(cdpHelper): Promise<Article[]>;
}
```

### 2.2 文件结构

```
scripts/short-video/
├── discover-trends.mjs              # 主脚本（重构为遍历 collectors）
├── lib/
│   ├── trends-utils.mjs             # 纯函数（扩展关键词）
│   └── trend-sources.mjs            # 【新建】所有 source collector 定义
├── __tests__/
│   ├── trends-utils.test.mjs        # 现有测试（扩展）
│   └── trend-sources.test.mjs       # 【新建】新 source collector 测试
```

### 2.3 数据流

```
11 个 source collectors
  → 各自通过 CDP 抓取搜索页
  → 提取 { title, url, source } 格式
  → 合并到 allArticles[]
  → filterChinaAI() 过滤
  → classifyTopic() 分类
  → deduplicateTopics() 去重
  → buildOutputJson() 输出
  → trending-topics.json（格式不变）
```

## 3. 各 Source Collector 设计

### 3.1 小红书 (xhs)

- **入口**：`https://www.xiaohongshu.com/search_result?keyword=AI%E5%A4%A7%E6%A8%A1%E5%9E%8B&type=1`
- **提取**：DOM 选择器 `.note-item .title, .search-result-item .title`
- **清理**：移除 emoji 和 #标签# 格式
- **登录检测**：页面含 "请先登录" → warn + skip

### 3.2 搜狗微信 (sogou_weixin)

- **入口**：`https://weixin.sogou.com/weixin?type=2&query=AI%E5%A4%A7%E6%A8%A1%E5%9E%8B`
- **提取**：DOM 选择器 `.news-box .news-list li h3 a, .txt-box h3 a`
- **注意**：搜狗可能跳验证码，检测到验证码 → warn + skip

### 3.3 微博热搜 (weibo_hot)

- **入口**：`https://s.weibo.com/top/summary`
- **提取**：DOM 选择器 `td.td-02 a`（热搜榜单）
- **特点**：返回的是热搜词条而非文章，title = 热搜词，url = 搜索结果页

### 3.4 B站搜索 (bilibili)

- **入口**：`https://search.bilibili.com/all?keyword=AI%E5%A4%A7%E6%A8%A1%E5%9E%8B`
- **提取**：DOM 选择器 `.video-list-item .bili-video-card__info--title, .video-item .title`
- **清理**：移除【】标记、播放量/弹幕数等无关文字

### 3.5 抖音搜索 (douyin)

- **入口**：`https://www.douyin.com/search/AI%E5%A4%A7%E6%A8%A1%E5%9E%8B`
- **提取**：DOM 选择器 `[data-e2e="search_video-item"] .title, ul[data-e2e="search-result-list"] li a`
- **登录检测**：页面含 "登录" 弹窗 → 关闭弹窗后继续，或 warn + skip

### 3.6 TikTok Creator Center (tiktok_creator)

- **入口**：`https://www.tiktok.com/creator-center`
- **提取**：灵感区（Inspiration）热门视频列表，DOM 选择器提取视频标题+播放量
- **分类筛选**：选择 "文化教育与科技" 分类
- **特点**：返回的是 TikTok 站内 trending 视频信号

## 4. trends-utils.mjs 扩展

### 4.1 新增关键词

```javascript
// 自媒体常见表达
"小程序", "短视频", "直播", "up主", "博主",
"爆款", "出圈", "刷屏", "热榜", "热搜",
"蒸馏", "微调", "推理", "训练", "开源模型",
```

### 4.2 标题清理函数

新增 `cleanTitle(title)` 纯函数：
- 移除 emoji
- 移除 #hashtag# 格式
- 移除【】标记内容
- 移除多余空格
- 截断过长标题（>200 字符）

## 5. Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/discover-trends.mjs` | 重构为可插拔 collector 架构，SOURCES 移到 trend-sources.mjs | **Medium** | 核心趋势发现脚本。现有 CDP 抓取逻辑（cdpNewTab/cdpEval/extractFromTab）提取为公共 helper，各 collector 调用。输出格式不变。验证：运行脚本确认输出 JSON 结构不变，现有 5 源仍正常工作 |
| `scripts/short-video/lib/trends-utils.mjs` | 新增 `cleanTitle()` 函数 + 扩展关键词表 | **Low** | 纯追加，不修改现有函数。现有 20 个测试用例验证不变。`cleanTitle` 是新函数，不影响现有管道 |
| `scripts/short-video/__tests__/trends-utils.test.mjs` | 新增 cleanTitle 测试 + 关键词测试 | **Low** | 纯追加测试 |
| `docs/content-pipeline.md` | 更新 Stage 0 趋势发现部分 | **Low** | 文档更新 |
| `docs/manual-ops.md` | 更新趋势源列表 | **Low** | 文档更新 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| S1 | 小红书未登录 | 跳过该源，打印 warn | 低 | collector 检测登录提示 → skip |
| S2 | 搜狗微信验证码 | 跳过该源，打印 warn | 中 | 检测验证码页面特征 → skip |
| S3 | 微博热搜页正常 | 提取热搜榜 50 条 | 低 | 热搜页公开，无需登录 |
| S4 | B站搜索页正常 | 提取视频标题 20+ 条 | 低 | 搜索页公开 |
| S5 | 抖音搜索需登录 | 检测登录弹窗 → 关闭 → 继续，或 skip | 中 | 尝试关闭弹窗，失败则 skip |
| S6 | TikTok Creator 灵感区 | 提取科技分类 trending 视频 | 低 | 已验证 CDP 可访问 |
| S7 | 新源数据与现有源重叠 | deduplicateTopics 正确合并 | 低 | 已有 Jaccard + containment 去重 |
| S8 | 新源标题含 emoji/hashtag | cleanTitle 清理后再进入管道 | 低 | collector 层调用 cleanTitle |
| S9 | 新源标题全中文 | filterChinaAI 正确过滤 | 低 | 现有关键词表已支持中文 |
| S10 | CDP proxy 不可用 | 所有 CDP 源都失败 → 退出 | 低 | 已有 CDP 检查逻辑（exit 1） |
| S11 | 某个源页面结构变化 | extractFromTab 返回空 → retry → 空结果 | 低 | 已有 retry 逻辑，返回空不影响其他源 |
| S12 | 新源返回大量非 AI 内容 | filterChinaAI 过滤掉 | 低 | 管道已有过滤 |
| S13 | cleanTitle 空字符串 | 返回空字符串，filterChinaAI 过滤掉 | 低 | cleanTitle 处理 null/undefined |
| S14 | 抖音页面 JS 渲染慢 | 等待 5s 后提取，空则 retry 3s | 低 | 已有 PAGE_LOAD_WAIT_MS 逻辑 |
| S15 | 11 个源全部失败 | 输出空 JSON（totalTopics: 0）+ warn | 低 | 已有 < 5 topics warn 逻辑 |

## 6. 非目标 (Non-Goals)

- 不实现 MCP server 集成（统一用 CDP）
- 不抓取文章全文（只抓标题+URL 做趋势发现）
- 不发布内容到这些平台（只做趋势监控）
- 不修改 `trending-topics.json` 输出格式
- 不修改下游消费者（agent 选题逻辑不变）

## 7. 测试策略

### 7.1 纯函数测试（TDD）

- `cleanTitle(title)` — 各类脏标题清理
- `filterChinaAI()` — 新关键词覆盖
- `classifyTopic()` — 自媒体风格标题分类
- `deduplicateTopics()` — 跨源去重（新源 vs 现有源）

### 7.2 Collector 测试

- 每个 collector 的 extract script 在 mock DOM 上测试
- 登录检测逻辑测试
- 错误处理测试

### 7.3 集成测试

- 运行 `discover-trends.mjs` 确认 11 源正常工作
- 输出 JSON 格式不变
- 源失败的 warn 消息正确
