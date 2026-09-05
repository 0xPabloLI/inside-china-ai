# SSOT 违规审计报告（Issue #76）

> 审计日期：2026-09-06（第十八 session）。范围：`scripts/short-video/` 管线数据结构的单一事实来源审计 + issue 三项 TODO 核对。行号基于 7050bbb。

## 0. 总体结论

开票时的 5 项违规中 **4 项已实质缓解或解决**（scene-data texts 由 `REMOTION_SLOT_MAP`+`assertKnownTextFields` 双侧运行时强制、search-results-cache 读写同源单模块、media 对象有 types.ts 完整镜像 + `validateMedia` 运行时约束、discovery.json 有版本化 schema）。**新发现 2 项高影响违规**（NO_MEDIA_TYPES 双份、validateDiscovery 无生产消费者）与若干低影响项。

**关键判断：issue TODO ①（创建 lib/types.mjs）不应做**——本管线 .mjs 侧真正有效的约束机制是「共享 .mjs 常量 + 运行时校验器 + verify-video preflight」，不是类型文件。`remotion/src/types.ts` 已服务 Remotion 侧（14 处 import），但没有任何 .mjs 脚本消费它（防漂移仅靠 `__tests__/remotion-transitions-validation.test.mjs:60-67` 的字符串断言）。为 .mjs 再建并行类型文件收益低。剩余工作集中在消双份、接校验器、补 schemaVersion。

## 1. 高影响违规（→ follow-up）

### 1.1 NO_MEDIA_TYPES 双份定义

- SSOT：`lib/claim-keywords.mjs:19`（`new Set(["cta","data","stat-reveal"])`），`final-media-gate.mjs:17-19` 正确 re-export 消费；
- 但 `lib/scene-rules.mjs:1063` **私有复制了一份**并在 :1065/:1072 使用——同文件已 import final-media-gate 的 `MEDIA_DEPENDENT_LAYOUTS`（scene-rules.mjs:41），却没顺带 import NO_MEDIA_TYPES。新增 visualType 漏改副本时 media-required 检查会误报/漏报。
- 修复：scene-rules.mjs:1063 删本地副本改 import（1 行）。

### 1.2 validateDiscovery 无生产消费者

`lib/research/validate.mjs:203` 的 discovery.json schema 校验只有测试调用（`__tests__/search-sources.test.mjs:9,121`）；discovery.json 的 schema 实际只有测试在守。修复：brief-builder 读 discovery 入口（或 writeResearchArtifact 后）调用一次。

## 2. 低影响违规（记录在案，择机修）

| # | 违规 | 位置 | 最小修复 |
| --- | --- | --- | --- |
| 1 | CDP 候选 schema 无类型，20+ 处内联字面量；消费侧 JSDoc 已漂移（:312/:391/:483 的字段清单远小于真实对象） | source-registry.mjs:2581-2879、asset-sourcer.mjs | asset-sourcer 头部加 `@typedef MediaCandidate` + 更新漂移 JSDoc；不必给字符串内联脚本强加类型 |
| 2 | trending-topics.json 读写两侧独立拼字段，读侧 parse 失败静默返回 `[]` | 写 trends-utils.mjs:343-410 / 读 asset-sourcer.mjs:1971-2008 | `images[].{url,sourceArticle}` 构造提为共享 helper，或两侧互写指向注释 + 读侧 warn |
| 3 | asset-report.json / media-patch.json / asset-analysis.json 无 schemaVersion/校验器（media-patch entry 结构仅 JSDoc） | asset-sourcer.mjs:1144/781-783/1525 | 照抄 `lib/search-results-cache.mjs` envelope 模式补 schemaVersion 常量 |
| 4 | `cap?.x ?? source.x` 双读约 14 处（enrich 后理论上只需读 capabilities） | search-sources.mjs:195-628 各处 | 定规则「enrich 之后只读 capabilities」逐步清理 |
| 5 | KNOWN_COMPANIES 双份且内容不一致 | tiktok-rules.mjs:129 vs asset-sourcer.mjs:59 | 统一 import 或注释明确两个不同语义（语音关键词 vs 文案校验） |
| 6 | MediaField 枚举 TS/.mjs 双写无互相指引 | types.ts:24 vs media-bg.mjs:46/51/56 | 两处互加指向注释 |
| 7 | `lib/tts/types.mjs` 名不副实（只是路径常量） | lib/tts/types.mjs | 改名或加注释，避免误导 grep |

## 3. 已解决（开票后交付，复核确认）

- **scene-data texts SSOT**：`lib/text-slots.mjs` REMOTION_SLOT_MAP（:276-281 自称 single authority）三方消费——渲染 `ShortVideo.tsx:30-43` assertKnownTextFields、preflight `scene-rules.mjs:1240`、宽度预算 `resolveRenderLayout`（:252-261，#190 双侧同判）；未知字段直接 throw（:470-481）。
- **search-results-cache.json**：`lib/search-results-cache.mjs` 单模块承载 envelope/version/TTL/原子写（v1 常量 :4），读写同源——本审计的对照组「该有的样子」。
- **media 对象**：`remotion/src/types.ts`（mediaReject :128、sourceRef :113、media:null :105）+ `validateMedia`（media-bg.mjs:307，verify-video.mjs:29,331 preflight 消费）。
- **discovery.json**：版本化 schema（`lib/research/schemas.mjs` DISCOVERY_SCHEMA_VERSION "1.1.0"）+ 写入侧按 schema 组装（search-sources.mjs:556-601）——但校验执行见 §1.2。

## 4. 架构原则索引（issue TODO ③）

- ADR 0001-0018 共 18 篇（0006 归档）；`docs/DOCS-INDEX.md` adr/ 段已有全量表——统一索引的大部分等价物已存在。
- 缺口：没有一页把 Cascade / Signal Density / SSOT / SVE 四个架构原则并列索引（SSOT 与 SVE 均无 ADR；SVE 全套已归档 `docs/archive/`，由 DOCS-INDEX archive 表索引）。
- **本票内交付**：DOCS-INDEX adr/ 表前新增「Architecture Principles」小节（本次提交）。TODO ③ 完成。

## 处置

§1 两项 + §2 择机项 → follow-up issue；TODO ③ 本票内交付；TODO ① 按 §0 判断不做（记录判断依据）；TODO ② 由本审计完成。
