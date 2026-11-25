# TikTok Hashtag Playbook

选标签和刷新标签的操作口径。**数据值只存** `scripts/short-video/config/hashtag-pool.json`（SSOT）；调研背景、渠道和人工参考表在 `tiktok-best-practices.md` 的 Hashtag 策略章节。本文件不抄浏览量，避免两处数字漂移。

## 1. 标签角色

| 角色 | 作用 | 当前例子 | 规则 |
| --- | --- | --- | --- |
| `topic` | 本条视频真正讲的实体/事件/产品 | `#minimax`、`#minimaxh3`、`#anthropicipo`、`#suno` | 必须能在口播、标题、画面或 `meta.keyEntities` 里找到依据。没讲 MiniMax，就不带 `#minimax`。 |
| `evergreen` | 账号/栏目常驻标签 | `#chinaai`、`#ainews` | 只有内容确属 China AI / AI news 时才带；它不替代 `topic`。 |
| `broad` | 大触达位，最多 1 个 | `#technews`、`#ai` | 不默认塞满。均帖浏览低、竞争极大的超级标签只做触达，不作为内容主题。 |
| `experimental` | 新标签 A/B | 新实体、新事件标签 | 单条视频最多 1 个；带 7 天后看数据，再决定入池或淘汰。 |

**中长尾优先**：先找“帖子数不至于把新片埋掉、均帖浏览又高于大盘”的标签。`#minimax` 这类中腰标签比 `#technology` 这类数十亿浏览的超级标签更适合做 `topic`；后者最多占一个 `broad` 位。

## 2. 每条视频的选择顺序（3–5 个）

1. **列 `topic` 1–2 个**：从 `meta.keyEntities.companies` 和口播里的事件/产品出发，每个写一句“本条视频为什么配它”。写不出依据的，删掉。
2. **选 `evergreen` 1–2 个**：内容属于 China AI / AI news 时带 `#chinaai` + `#ainews`；不属于就不带。
3. **选 `broad` 0–1 个**：只在标签与内容确实相关时加；不要为了“看起来有流量”硬塞。
4. **跑门禁**：`node scripts/short-video/tag-preflight.mjs --content <slug>`。只对池外、过期、或快照命中的标签做单标签 live 查；不重查全池。
5. **人工锁定 `metadata.hashtags` 时**：保持 3–5 个，逐条保留 justification。`tag-preflight` 通过只证明池/新鲜度/数量，不证明内容相关。

**完成标准**：最终 3–5 个标签，每一个都能回答“为什么这条视频配它”；preflight 输出 `PASS` 或 `PASS(warn)`；每条 WARN 有处理结论。

## 3. 两个时钟

| 时钟 | 做什么 | 不做什么 |
| --- | --- | --- |
| 每条视频 | 跑 `tag-preflight`；对候选里池外/过旧的单个标签查官方 `/tag` | 不重查全平台榜单，不重查全池 |
| 每周 | 刷新一次 trending 快照；看有没有与栏目相关的新标签 | 不改全池数据 |
| 每月 | 重采 5–10 个高频/候选标签的官方计数，更新 `sampledAt` | 不重采全池 |
| 每季度 | 全池复核、淘汰、补新实体；更新 `updatedAt` 和映射表 | 不凭记忆改数字 |
| 事件驱动 | 新实体/新模型/突发新闻，先查单标签，再决定入池 | 不把热点标签直接当 `topic` |

“每条视频都重新调研全平台”是浪费：平台大盘每周看一次就够；真正需要每条视频判断的是 **这条视频和这个标签有没有关系**。

## 4. 数据源与可信度

| 来源 | 用途 | 边界 |
| --- | --- | --- |
| TikTok `/tag/{tag}` 页内嵌 `/api/challenge/detail` | **主源**：单标签当前 views/posts | 需要已登录的自动化 Chrome profile；在页面上下文 fetch，不绕登录、不签名规避 |
| TikTok Creative Center | **发现**平台级 trending | 未登录只看 Top 3；完整榜单需登录。当前 11-21 快照只有 3 条，不是平台全量 |
| TikTok 搜索下拉 | 找相关标签建议 | 没有排名和计数，不能当流量证据 |
| HashtagRadar / tiktokhashtags.com | 旧值对照、相关标签 | 缓存停留在 2026-08 前后，不能当增长曲线 |
| Apify `research-hashtags.mjs --live` | 批量补数 | 付费渠道，使用前需用户批准 |

## 5. 刷新记录

机器可读的新鲜度看池里的 `updatedAt`、`sampledAt` 和 `thresholds`；下表只做人工复核日志，不替代 SSOT。

| 复核项 | 上次 | 下次 | 变更 |
| --- | --- | --- | --- |
| 全池复核 | 2026-11-22 | 2027-02-22 | 见 `39b71cc2` / `hashtag-pool.json` |
| trending 快照 | 2026-11-21（未登录抽样，仅 Top 3） | 下一次登录态扫描 | 需补全量 |
| 登录态 tag 级复核 | 2026-11-22（10 个在用标签，官方 challenge/detail） | 每条视频只查池外/过期标签 | 数字已写回池；Creative Center 全榜仍被 OAuth 登录挡住 |
| 高频标签官方计数 | 2026-11-22 | 2026-12-22 | 单标签官方 API 二次采样 |
| 实体映射表 | 2026-11-22 | 随新实体触发 | `docs/research/china-ai-hashtag-mapping.md` |

## 6. 反例

- 不相关 trending：视频讲融资，却带 `#marvelrivals`。
- 纯为流量硬塞：每条都带 `#fyp`、`#viral`、`#trending`（已在黑名单）。
- 同一标签跨无关视频复用：上条讲 MiniMax 带了 `#minimax`，下条讲 DeepSeek 也顺手带。
- 把 `broad` 当 `topic`：`#technews` 不能证明视频讲的是哪家公司。
- 用旧缓存当最新数据：HashtagRadar 的 2026-08 值和 2026-11 官方值差一个数量级，不能写成“涨了 10 倍”。
