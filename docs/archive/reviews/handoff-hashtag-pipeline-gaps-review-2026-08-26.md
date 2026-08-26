# Code Review: Hashtag 管线缺口修复方案（更新版）

> 审阅对象：`docs/handoffs/handoff-hashtag-pipeline-gaps.md`
>
> 更新日期：2026-08-26
>
> 审阅范围：更新后的 handoff、缺口 A 已合入实现、相关单测、caption 输出分类、内容与 analytics 文档，以及缺口 B 的 Apify API 契约。
>
> **总体结论：缺口 A 已完成并可关闭；缺口 B 的边界已显著收敛，但仍应先完成受成本约束的 schema POC。更新后还遗留两类 P1/P2 文档与分析可追溯性问题，应在 B 实施前或同一文档维护批次内处理。**

## 状态变化

上一版审阅指出，`metadata.trendingHashtags` 在 Stage 3 被生产但未被 `deriveHashtags()` 消费，且原来的“补位后追加”算法无法在 5 个标签已满时按策略替换垂直标签。当前 handoff 已将此部分标记为完成，并引用了代码提交 `d48c3f4` 与归档提交 `53085b6`。

本次复核确认，工作副本中 `caption-utils.mjs` 已实现规范化、层级选择、趋势标签最多一个、满容量替换、primary entity 保护和人工覆盖锁定；`generate-caption.mjs` 也已输出 `hashtagStrategy.trending`。现有针对 caption utility 的测试命令执行成功，结果为 **61/61 通过**。因此，原审阅中针对缺口 A 的 P0 建议均已被实现并有独立归档审阅佐证。[归档 A 修复审阅](../archive/reviews/hashtag-trending-fix-review-2026-08-26.md)

| 项目 | 更新前结论 | 当前复核 | 状态 |
|---|---|---|---|
| `trendingHashtags` 未被消费 | P0：输入路径断裂 | 自动派生路径消费最多 1 个趋势标签 | 已关闭 |
| 满 5 个标签时的替换 | P0：趋势标签可能永远被忽略 | 优先替换 secondary vertical，其次替换 pad | 已关闭 |
| `metadata.hashtags` 语义 | P0：需定义人工覆盖 | 非空时锁定，趋势标签不隐式注入 | 已关闭 |
| 输入规范化 | P0：需统一 trim / 去 `#` / 小写 / 去重 | `normalizeHashtag()` 已覆盖并有单测 | 已关闭 |
| `hashtagStrategy` 可观测性 | 未单独验证 | 已增加 `trending` 分类；仍有来源归属边界需澄清 | P2，见下文 |
| Apify 调研客户端 | P1：范围与实际 Actor 能力不一致 | handoff 已吸收修订；尚未实现 | 保持待办 |

> **验证记录。** 在用户工作副本执行 `npx vitest run --config scripts/short-video/vitest.config.mjs scripts/short-video/__tests__/caption-utils.test.mjs`，得到 1 个测试文件、61 个测试通过。Vitest 仍报告 `poolOptions` 废弃警告；该配置告警与 hashtag 功能无直接因果关系，应独立排期。

## 缺口 A：完成复核

### 已实现的行为契约

`deriveHashtags()` 现在将自动派生标签按 core、brand、primary vertical、secondary vertical、pad、trending 的顺序构造。趋势标签由上游 Stage 3 的 Agent 负责相关性判断；函数只负责规范化、去重、容量与替换。容量不足 5 时直接加入；容量已满时替换最后一个 secondary vertical，若没有则替换最后一个 pad；primary entity 永不被替换。这个规则与 [TikTok 最佳实践](../tiktok/tiktok-best-practices.md) 的“高度相关才加入、优先替换低优先级标签”约束一致。

人工 `metadata.hashtags` 仍是锁定式覆盖，因而不会被 `metadata.trendingHashtags` 隐式修改。该选择保留了 A/B 实验、人工编辑与发布复盘的可追溯性：编辑者希望采用趋势标签时，必须把它显式写入 `metadata.hashtags`。

| 已确认的场景 | 实现 / 测试证据 | 结果 |
|---|---|---|
| 常规趋势标签加入 | `T3-2`、`T3-3` | 3–4 个标签时加入，保持总数 3–5。 |
| 满容量替换 secondary vertical | `T3-4` | 趋势标签进入最终集合，低优先级 secondary 被替换。 |
| 满容量替换 pad | `T3-5` | 没有 secondary 时替换 pad。 |
| primary entity 保护 | `T3-12` | `companies[0]` 对应的标签不会被趋势标签置换。 |
| 输入质量与去重 | `T1`、`T3-8`、`T3-9`、`T3-10` | 大小写、空白、前导 `#`、非法值和重复输入均按预期处理。 |
| 人工覆盖锁定 | `T3-11` | 有 `metadata.hashtags` 时不自动注入趋势标签。 |
| `#creatorsearchinsights` 的新政策 | `T2`、`T3-13` | 不再处于程序黑名单；只能由 Agent 人工通过 `metadata.hashtags` 采用。 |

## 更新后仍需处理的问题

### P1：`#creatorsearchinsights` 的文档事实仍然相互矛盾

handoff、`caption-utils.mjs` 与 `tiktok-best-practices.md` 已共同采用新决策：`#creatorsearchinsights` 不再是程序黑名单，不会自动加入，但当 Agent 通过 Creator Search Insights 找到内容 gap 时可人工加入。然而，`docs/analytics-workflow.md` 仍称其为“**黑名单**”且“已在 `BLACKLISTED_HASHTAGS` 中禁用”，`docs/research/tiktok-competitor-intelligence.md` 仍将其归为“有害”并要求在管线禁用。二者都与当前代码 `BLACKLISTED_HASHTAGS = []` 和新的人工使用策略直接冲突。

这不是单纯的历史备注问题。`analytics-workflow.md` 是 hashtag 库维护的执行入口之一，而 competitor intelligence 被策略文档作为证据来源；后续 Agent 若按其中任一旧规则执行，可能重新添加黑名单或错误地否定人工使用场景。

**建议。** 在同一文档维护提交中更新上述两个文件：保留“2 条视频、存在误导搜索词”的原始观测，但将结论降级为“待重新验证的历史信号”，并明确它不能支持单标签因果归因。补上新决策的适用条件：仅当内容确实源于 Creator Search Insights 的 gap 发现时才由人工 metadata 加入，绝不作为自动候选。这样可同时保留证据与修复策略层的唯一权威来源。

| 文档 | 当前冲突 | 建议状态 |
|---|---|---|
| `docs/analytics-workflow.md` | 写明已禁用、为黑名单 | 改为历史观察 / 待验证；链接到最佳实践中的当前决策。 |
| `docs/research/tiktok-competitor-intelligence.md` | 写明“有害，应在管线禁用” | 保留样本与搜索词，撤销强制禁用结论，注明样本量与不可归因限制。 |
| `docs/tiktok/tiktok-best-practices.md` | 已表达新策略，但仍位于“去掉的标签”表 | 保留，但应明确该表项是“禁止自动候选”而非“程序黑名单”。 |
| `caption-utils.mjs` | `BLACKLISTED_HASHTAGS = []` | 与新策略一致，无需修改。 |

### P2：`hashtagStrategy.trending` 不能严格表达“来源”

`generate-caption.mjs` 将最终标签与 `metadata.trendingHashtags` 的规范化字符串做交集，再写入 `hashtagStrategy.trending`。这在自动派生路径中正确，但在人工覆盖路径中存在来源归属歧义：如果编辑者把 `#aiviral` 手动写入 `metadata.hashtags`，同时 `metadata.trendingHashtags` 也包含它，发布标签没有被趋势逻辑注入，输出却仍会把它分类为 `trending`。

功能发布不会受影响，但该字段将不再准确说明“该标签是由哪个选择路径产生的”，从而可能污染后续的效果复盘。若 `hashtagStrategy` 仅用于展示，可记录为已知限制；若它将被用于 analytics 或自动决策，建议让 `deriveHashtags()` 返回带来源的内部候选对象，或在 metadata JSON 中增加明确的 `selectionMode: "manual" | "auto"` 并使人工模式下的 `trending` 为空。无论选择哪种，需要补一条 `generate-caption` 级集成测试，而非只测试纯函数。

### P3：handoff 中新增测试数的算术错误

handoff 写“新增 19 个测试（normalize 8 个 + 黑名单 2 个 + trending 15 个）”，但三个分组相加是 **25**，而当前测试总数也是从此前验证的 36 增至 61，增量正好为 25。实际测试通过数 61 是正确的，只有“新增 19 个”这一文档表述不正确。

**建议。** 将 handoff 第 34 行改为“新增 25 个测试（normalize 8 个 + 黑名单移除 2 个 + trending 消费 15 个）”；归档 review 中“42 个既有 + 19 个新增”的历史统计也应在以后维护时注明来源基线不同，避免被误读为当前测试计数。

## 缺口 B：待做方案的复核结论

更新后的 handoff 已吸收上一版审阅的核心修正，方向正确：Apify 是季度或触发式的调研工具，而不是逐视频运行时依赖；通用 TikTok Scraper 应首先提供归一化视频样本；聚合 hashtag 指标应在 POC 确认 Actor schema 后才承诺字段。该顺序降低了把“视频样本数据”误写为“平台 hashtag 总指标”的风险。

| B 的关键点 | 当前 handoff 方案 | 审阅结论 |
|---|---|---|
| 低层 API | `runActor(actorRef, input, options)` | 可接受；需统一处理 token、JSON shape、网络、408/429/5xx 和超时。 |
| 视频样本 | `fetchHashtagVideos()` 使用 `clockworks~tiktok-scraper` | 可接受；与 Python 参考实现的 `_video()` 输出对齐。 |
| 聚合指标 | `fetchHashtagMetrics()` 先不实现 | 正确；应以 POC 的真实响应 schema 为准，不能预设 `posts` / `related` 字段。 |
| 批量查询 | POC 后再决定 | 正确；需验证 Actor 的批量输入与计费语义。 |
| REST 路径 | `POST /v2/actors/:actorId/run-sync-get-dataset-items` | 正确；Actor 人类可读 ID 使用 `owner~actor-name`。[1] |
| 认证 | `Authorization: Bearer <token>` | 正确且优于 query token，避免凭据进入 URL / 日志。[2] |
| 同步执行 | 配置不高于 300 秒并处理 408 | 正确；官方端点在超过 300 秒时返回 408。[1] |
| 成本 | `maxTotalChargeUsd`、dry-run/mock、显式远端开关 | 必须作为 POC 与生产实现的验收条件。[1] |
| 数据落盘 | 写调研工件，人工确认后再更新映射 | 正确；不要让远端抓取直接写入 `ENTITY_HASHTAG_MAP`。 |

### B 的最小可实施范围

下一 session 应只完成一个**受费用约束的 schema POC**，而不是直接创建功能完整的批量客户端。POC 应以一个或少量公开测试 tag 运行，使用显式 opt-in、`Authorization` header、`maxTotalChargeUsd`、短超时与单次批次上限；它必须把原始 response schema、标准化视频样本、actor/build、时间、参数、错误和成本上限写入调研工件。只有在此基础上，才可以决定是否新增 `fetchHashtagMetrics()`，以及它的准确字段、Actor 和批量策略。

| POC 验收项 | 通过标准 |
|---|---|
| 凭据安全 | 无 token 时本地失败；token 不出现在 URL、日志或错误文本。 |
| URL 与 Actor ID | 使用 `actors/:actorId/run-sync-get-dataset-items` 与编码后的 `clockworks~tiktok-scraper`。 |
| 响应验证 | 非数组 dataset 触发 schema error；原始 item 不被静默伪造为 metrics。 |
| 失败处理 | 网络、429、5xx 与 408 有可识别错误及有限重试策略。 |
| 成本与可重复性 | 默认不触发真实远端请求；真实调用需 opt-in 与费用上限。 |
| 落盘 | 工件带 hashtag、actor、actor build、fetchedAt、input、rawItemCount、normalizedResult、error 与 costCapUsd。 |
| CI 隔离 | mock 测试不依赖 `APIFY_TOKEN`，不会产生外部费用。 |

## 推荐执行顺序

| 顺序 | 工作 | 完成标准 |
|---:|---|---|
| 1 | 修正 P1 文档矛盾与 P3 测试计数 | 当前政策只有一个权威结论；历史数据保留但不再被表述为强制禁用。 |
| 2 | 决定 P2 分类字段是否承载来源语义 | 若承载，补充来源模型与 `generate-caption` 集成测试；若不承载，在字段说明中标记限制。 |
| 3 | 完成 B 的 schema POC | 有匿名化样例与实际 schema / 费用 / 失败模式记录。 |
| 4 | 产出 B 的小型规格与场景矩阵 | 仅暴露 POC 证实的字段，明确缓存、超时、并发、工件和费用边界。 |
| 5 | TDD 实现 B | mock 单测与 opt-in smoke test 通过；逐视频 caption 管线不依赖 Apify。 |

## 本次更新边界

本次只更新本审阅报告，并验证了更新后的 `caption-utils` 测试。**未修改**生产代码、单元测试、hand-off、外部配置或 Apify 账户，也未创建提交。

## References

[1]: https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post "Apify: Run Actor synchronously and get dataset items"
[2]: https://docs.apify.com/integrations/api "Apify: API integration and authentication"
[3]: https://apify.com/clockworks/tiktok-scraper "Apify Store: Clockworks TikTok Scraper"
[4]: https://apify.com/clockworks/tiktok-hashtag-scraper "Apify Store: Clockworks TikTok Hashtag Scraper"
