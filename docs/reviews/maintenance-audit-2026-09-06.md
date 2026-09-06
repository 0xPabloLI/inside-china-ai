# 88 项手工维护条目审计（Issue #87）

> 审计日期：2026-09-06（第十八 session）。对象：source registry 手工维护面的自动化与兜底覆盖复核。行号基于 1c80bae。数字经 node import 实测（registry 现为 64 源：52 手工命名 + 12 wechat2rss 工厂生成，source-registry.mjs:2105-2131/3460-3469）。

## 0. 总体结论

**条目总数基本持平（约 88 → 约 96 个手工脚本/配置项），但风险结构已根本变化**：#87 表里 5 类「坏了没人知道」中 4 类已翻绿（#66 Step 0.5、#88 Part 2 autogen、search-pool、SVE/media-cache）；**唯一仍完全成立的原始痛点是「选择器坏了但页面正常 → 静默 0 结果，无 health log」**——0 结果不进 `failedSources`（search-sources.mjs:687 只收 throw），与「源正常但无新闻」不可区分。

**#66 只交付了一半**：`lib/fetch-page.mjs`（static→jina→cdp 链，:185-208）存在且有测试，但全仓零生产消费者（#187 已核、#68 复核）；#66 原文的 Jina/generic-eval 文章兜底层未接入主链。Jina 层缺席的实际影响被后续交付大幅稀释（googleSiteFallback autogen + pool + mcpFallback 已构成完整兜底），剩余价值主要是「0 结果检测」这一可观测性缺口，而非再铺一层提取。

## 1. 逐类复核

| #87 原类别 | 当时 → 现状 | 兜底/自动化现状 | 判断 |
| --- | --- | --- | --- |
| extractScript（40） | articleScript（#88 Part 1 改名），43 个真实 per-site 脚本（56 articles 源 − 13 no-op） | 断了走 5 层链（apiSearch → CDP 重试一次 :238-244 → googleSiteFallback → apiFallback → pool/MCP）；15 源有文章兜底；**0 结果静默** | **部分解决**。值得投资的不是更多选择器自动化，而是 0 结果 health log + collectFromSource 全链集成测试（#77 测试缺口同款） |
| primaryScript（9） | 字段消失，并入 `CDP_MEDIA_CAPABILITIES.imageScript`（10 源） | 与 articleScript 仍是两套选择器；真正能合并的只有 10/43 源 | **可接受人工** |
| fallbackScript（9） | 10 个 imageFallbackScript + 通用 GENERIC_IMAGE_FALLBACK_SCRIPT（prog-search:312-321） | `searchCdpSource` 自动 retry + 自动落 fallback（prog-search:237-239） | **已解决（机制层）** |
| loginCheckScript（6） | 仍是 6 个（xhs/sogou_weixin/douyin/tiktok_creator/zhihu/x_search） | 断了降级到兜底层，但同样静默 | **可接受人工** |
| apiSearch.parser（23→24 源） | 12 直连 + 12 wechat2rss 共享 parseWechatRss（去重约 13 段） | parser 抛错 try/catch → `[]` → 自动落 CDP/兜底（search-sources.mjs:266-299）；wechat2rss/hn/reddit 同 URL 无下一层（设计合理） | **可接受人工**；真正单点是 wechat2rss.xlab.app 第三方服务本身 |
| cdpFallback（1） | googleSiteFallback 15 源（x_search 显式 + 14 autogen，:3375-3391） | autogen + 共享 h3 脚本（:3294-3303）；死角 douyin 恒空、pexels_video typo（#77 P2/P3 在案） | **已解决** |
| enrichWithImages（1） | enrichWithMedia（search-sources.mjs:124-190），扩到视频+og | — | **已解决**（:248 注释仍写旧名，stale） |

## 2. #87 未列出的新维护面（2026-08 后新增）

| 面 | 位置 | 风险 | 处置 |
| --- | --- | --- | --- |
| CDP_VIDEO_SCRIPT | source-registry.mjs:2548-2567，1 脚本 10 源共用 | 坏一处塌十源；有 `normalizeCdpVideoCandidates` defense-in-depth（prog-search:578） | 接受；#75 动 videos 标注时顺带冒烟 |
| IMAGE_SEARCH_ENGINES | prog-search:635-682，6 引擎游离 registry 外；brave_image/searxng_image 双份定义 | 双份漂移 | → #77 P2 建议单独立票收编 |
| parseYtdlpSearchOutput | asset-sourcer.mjs:1626-1654；yt-dlp 未锁版本 + Firefox cookies 隐含依赖 | #180 实证过 2026.07.04 全量垃圾（fe70670 修复）；失败静默 catch→[] | 建议锁版本或加烟测（小项，归 #75 或独立） |
| SITE_RATE_CONFIG | rate-limiter.mjs:19-34，8 域名人工调参 | 低（消费方仅 cdp-client） | 接受 |
| SearXNG theme 选择器 | source-registry.mjs:1762-1778 绑 simple theme + localhost:8888 | 自托管可控 | #92 已知决策，接受 |

## 3. 剩余真实维护负担与建议

当前真正值得投资的自动化只剩两件：

1. **0 结果 health log**（唯一仍成立的原始痛点）：collectFromSource 各层 0 结果计入 discovery JSON 的 failedSources/零结果记录（现为 throw-only，:687），trend run 结束时汇总输出「连续 N run 零结果」的源清单——纯可观测性，不改提取逻辑。
2. **图片引擎池收编 registry**（#77 P2）——已在他票在案。

其余 ~90 个手工条目均为「可接受人工」：选择器分散式腐烂由五层兜底链吸收，不需要 Jina 层救场。fetch-page.mjs 死模块的处置（删除或等 RAG claim verification 消费方）沿 #187 先例记录即可。

## 处置

- 0 结果 health log → follow-up issue（小票）。
- 引擎池收编 → 已在 #77 P2 在案（建议独立票）。
- 其余判断「可接受人工」落档本报告，#87 审计职责完成即关闭。
