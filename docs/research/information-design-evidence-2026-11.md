# 信息设计证据基线：图表、数据视频、多媒体学习与实验方法

> **下游票**：#1398（信息版式系统 v2）。
> **状态**：2026-11-16 整理，作为 `docs/specs/spec-information-layout-v2.md` 的外部证据层；不替代真实内容包测试。
> **范围**：竖屏 9:16 数据镜头、图表形式选择、包级叙事弧、注意力预算、离线盲评与有机号配对实验。
> **方法**：只引用可回溯的论文、官方文档或公开从业者标准；每条结论标注证据等级。营销号转述、无法回溯的精确数字和已撤回的图示不进入设计依据。

## 结论先行

1. **图表形式先由数据关系决定，而不是由装饰偏好决定。** FT Visual Vocabulary 与 Datawrapper 的从业者标准把关系分成 deviation / correlation / ranking / distribution / change over time / magnitude / part-to-whole / spatial / flow 九类；本仓只把前六类中能原生画的子集纳入 `scene.info`，correlation / flow / spatial 明确留给真实图表资产或既有版式。
2. **柱状图与柱形图的零基线是硬规则，不是风格选项。** FT 的 column 规则要求从 0 起；偏离零基线会把视觉比例变成误导。`checkInfoSpec` 对 magnitude / ranking 的 bar / column 强制 `baseline: 0`，deviation 才允许显式非零基线。
3. **直接标注优于图例，单位必须跟着数值出现。** Datawrapper 的从业者标准建议直接标注、不要把标签旋转成斜排、减少假精度；本仓的 6 个原生图表全部用直接标注，单位由 `formatChartValue` 统一加在数值上。
4. **位置编码比角度、面积、体积更准确。** Cleveland & McGill 的受控实验给出准确度排序：位置 → 非对齐位置 → 长度/角度 → 面积 → 体积 → 颜色；大误差中约 88% 来自角度判断。原生图表因此优先 bar / dot-plot / line / slope，不用饼图、3D、雷达。
5. **移动端不是把桌面图缩小。** MobileVisFixer 对 374 个 SVG 的分析发现 32.6% 溢出视口、31.5% 字号不可读、37.9% 桌面/移动版完全相同；正确做法是重排版，不是等比缩放。`data.chart` 因此是 820×620 的竖屏专用面板，而不是 800×600 图片的缩进。
6. **专业数据视频有可复用的叙事骨架。** Amini 等对 50 条专业数据视频的编码显示：平均 3 分钟、约 6 个可视化、48% 时长用于数据可视化；E/I/P/R（Establish / Initial / Peak / Release）是最常见的组织方式，Peak 通常在中段，约 60% 的 Initial 段已经出现数据可视化。本仓把「一个显式 Peak、Peak 前有图表、hook 是 establisher、收尾是 release」做成 advisory 门禁。
7. **多媒体学习研究支持「信号 + 空间邻近 + 分段」，不支持「所有动画都有用」。** Noetel 等的元-元分析（29 篇综述、1,189 项研究、78,177 名参与者）给出总体 g=0.38；signaling 0.43、spatial contiguity 0.63–0.74、segmenting 0.34；动画对静态的总体效应只有 0.23，只有解释机制时才到 0.40。原生图表的入场动画只承担「数据出现」这一件事，不叠加环境动效。
8. **TikTok 没有有机号 A/B。** 官方随机化入口是 Ads Manager 的 Split Testing，随机化单位是受众拆分；有机号只能做匹配对区组（同题、同脚本、同音频、隔 ≥48h、随机发布顺序），它不是 RCT，也不能用「A/B 测试」这个词冒充。
9. **实验的统计单位是视频，不是观看。** 同一条视频的多次观看高度相关；把观看当独立样本会低估方差、放大显著性。本仓的配对检验以「视频对」为单位，报告 n、效应、95% CI、p、MDE 和设计局限。
10. **n=20 只能发现结构性差异。** 在 σ=0.40、80% power、α=.05、ρ=.5 的假设下，20 对可检测约 +28% 的 ln(average watch time) 变化；+10% 需要约 80 对。这个量级适合判断「原生图表是否明显更好」，不适合微调颜色或字号。

## 证据分级

| 等级 | 含义 | 本文使用方式 |
| --- | --- | --- |
| 同行评审·受控实验 | 随机分配、可复现实验 | 可直接支撑设计规则 |
| 同行评审·观察/编码 | 系统编码、样本研究，非因果 | 支撑方向，不支撑精确阈值 |
| 元分析 | 多研究汇总 | 支撑总体方向，注意异质性 |
| 从业者标准 | 公开、可执行的专业规范 | 作为工程规则，不当作因果证据 |
| 平台官方 | 平台文档、帮助中心 | 约束平台行为与指标口径 |
| 营销内容 | 代理/工具商博客 | 只用于发现问题，不单独作为依据 |
| 未证实/已撤回 | 无法回溯或作者撤回 | 明确排除，不进入规则 |

## 1. 图表形式与感知

### 1.1 关系 → 图表

| 数据关系 | 外部标准 | 本仓原生 | 备注 |
| --- | --- | --- | --- |
| magnitude | FT magnitude；Datawrapper bar/column | `bar`, `column`, `dot-plot` | 柱状默认横向 bar，长标签不旋转 |
| ranking | FT ranking；Datawrapper | `bar`, `dot-plot`, `slope` | 默认按值降序，最多一个 highlight |
| change over time | FT change over time；Datawrapper line | `line`, `column`, `slope` | 保持时间顺序，2–6 点 |
| part-to-whole | FT part-to-whole；Datawrapper stacked | `proportion-bar` | 单一堆叠条，直接标注，不用饼图 |
| deviation | FT deviation | `bar`, `column` | 必须显式 baseline |
| distribution | FT distribution | `dot-plot`, `column` | 预分箱，5–12 点 |
| correlation | FT correlation | 不原生 | 用真实散点图资产，避免伪相关 |
| flow | FT flow | 不原生 | 用 `context.flow` |
| spatial | FT spatial | 不原生 | 用真实地图；不凭空画地理 |

来源：Financial Times Visual Vocabulary [1]；Datawrapper Academy [2]。

### 1.2 感知准确度

Cleveland & McGill 的受控实验让被试比较不同视觉编码的数值差异，得到准确度从高到低：位置、非对齐位置、长度/角度、面积、体积、颜色。大误差里约 88% 来自角度判断，角度编码的误差率约为位置编码的 7.3 倍 [3]。

工程含义：

- 能用位置/长度就不用角度和面积；所以不用饼图、3D、雷达。
- 横向 bar 比纵向 column 更适合长类别名；column 只用于短时间标签。
- 不用面积大小表示数量；不用颜色深浅作为唯一数值编码。

### 1.3 移动端重排版

MobileVisFixer 分析了 374 个真实 SVG，发现 32.6% 在移动视口溢出、31.5% 字号不可读、37.9% 桌面与移动版完全相同 [4]。这不是「图不好看」，而是「桌面布局被直接缩小」。

工程含义：

- 原生图表使用 1080×1920 的竖屏几何，不缩放桌面图。
- 标签字号 40px 是元数据地板；不再往下缩来塞进更多标签。
- 标签放不下时换图型（column → bar），不旋转标签。

### 1.4 装饰与记忆

Bateman 等的 CHI 2010 研究发现，语义相关的装饰没有损害准确性，反而提高了回忆和偏好 [5]；这与「coherence 应减少无关装饰」存在张力。两者的调和条件（装饰是否承载语义、是否增加外在认知负荷）尚未被同一实验验证。Borkin 等发现图表的可记忆性可以稳定测量，颜色和可识别物体有帮助 [6]。

工程含义：

- 装饰只在承载语义时使用；不为「丰富」加纹理。
- 原生图表默认 clean panel：无网格、无 3D、无阴影；`terminal` 变体只用于 A/B，不设为默认。
- 高亮只给一个 mark，颜色承担语义，不承担数量。

## 2. 数据视频叙事

### 2.1 专业数据视频的编码

Amini 等对 50 条专业数据视频做了系统编码 [7]：

- 平均时长约 3 分钟，平均约 6 个可视化，48% 的时长用于数据可视化。
- 叙事单位分为 Establish（E）、Initial（I）、Peak（P）、Release（R）；最常见的组合是 `E+I+PR+`（34%）。
- Peak 通常位于视频中段。
- 约 60% 的 Initial 段已经包含数据可视化；数据不是等到 Peak 才出现。
- 20% 的视频用问题开场，30% 用 takeaway 收尾。
- 46% 的新事实会得到一次重复；重复是叙事动作，不是字幕复读。

工程含义：

- 一个包只允许一个显式 Peak；Peak 放在 35–65% 的时长带。
- 如果包里有图表，至少有一个图表在 Peak 之前；证据先于 payoff。
- `arcRole` 用 E/I/P/R，和既有 `narrativeRole` 的 S/T/A/R 分开：后者是留存机制分类，不编码 Peak。

### 2.2 互动叙事与「martini glass」

Segel & Heer 分析了 58 个叙事可视化案例，归纳出 martini glass、interactive slideshow、drill-down 三种结构，并指出互动图表常常低估叙事消息的作用 [8]。本仓不做互动图表，但「先给结论、再给证据、最后回到结论」的结构仍然适用。

### 2.3 短视频注意力

Zannettou 等（CHI 2024）用 347 名用户、920 万条推荐记录研究短视频注意力，报告中位注意力率约 82%、45% 看完、24% 在视频前 20% 就离开；实际早期退出窗口约 8–14 秒 [9]。这支持「前几秒要给出可读的承诺」，但不支持「3 秒决定一切」这种因果法条。

Guo 等对 MOOC 视频的研究发现，约 6 分钟后参与度下降；更快的语速（平均 156 wpm）与更好的参与度相关；后期制作中的镜头切换优于纯幻灯片 [10]。这是一项观察研究，不能直接外推到 TikTok 娱乐内容，但支持「节奏变化」和「不要长时间单一构图」。

工程含义：

- `attention.cue` 每镜最多一个；注意力提示是预算，不是装饰清单。
- 连续 3 个信息镜头使用同一 `visualType:layout` 时给 advisory：观众看到的是模板循环。
- 原生图表的入场只做一次（bar 从基线生长、line 画一次、proportion 分段 reveal），不叠加环境动画。

## 3. 多媒体学习

Noetel 等的元-元分析汇总 29 篇综述、1,189 项研究、78,177 名参与者 [11]：

| 原则 | 效应量 g | 工程含义 |
| --- | --- | --- |
| 总体 | 0.38 | 多媒体设计有效，但不是万能 |
| coherence | 0.33 | 删无关装饰；持续可见的 seductive detail 0.43，闪现的只有 0.12 |
| signaling | 0.43 | 用高亮/箭头/标题指出重点 |
| spatial contiguity | 0.63–0.74 | 标签贴着对象，不放图例远端 |
| segmenting | 0.34 | 分段呈现，不一次倒完 |
| modality | 0.38–0.72 | 图文互补，不让音频逐字复读屏幕文字 |
| verbal redundancy | 0.15 | 音频与屏幕文字完全重复时可能为负 |
| animation vs static | 0.23（解释机制时 0.40） | 动画只在解释变化机制时使用 |

工程含义：

- 图表的标题/副标题/来源与图形空间邻近；标签直接贴 mark，单位跟数值。
- 字幕与口播不要逐字重复；`checkBodyTextVoRedundancy` 继续作为 editorial。
- 原生图表动画只解释「数据如何出现」，不做无意义的循环动效。

**反证**：Bateman 的装饰实验与 coherence 冲突；目前不能宣称「所有装饰都有害」或「所有装饰都有益」。本仓的默认是 clean，装饰必须通过 A/B 或明确语义获得保留资格。

## 4. 竖屏、平台与安全区

### 4.1 手持与竖屏

Hoober 2013 的观察报告称 49% 的用户单手持机、竖屏占主导 [12]。但作者在 2017 年公开撤回了文章中的拇指热区图；该图不能作为设计依据 [13]。可用的结论只剩「竖屏优先、单手操作常见」，不是具体的拇指坐标。

### 4.2 平台官方创意规范

TikTok 官方创意最佳实践要求 9:16、≥720p、把关键内容放在安全区、前 6 秒给出 hook、前 3 秒给出 claim、文字叠加约 5–10 词/秒 [14]。这些是广告创意指南，不是有机流量的因果定律；平台没有公布「前 3 秒决定一切」的实验。

具体安全区像素在不同来源里不一致（顶部 130–150、底部 320–400、右侧 100–242）。本仓以 `lib/safe-zones.mjs` 为单一真源，发布前用真机预览复核；不把某一组像素写成普适真理。

## 5. 实验方法：TikTok 到底能做什么

### 5.1 没有有机号 A/B

TikTok 官方没有提供有机发布的 A/B 测试。官方随机化入口是 Ads Manager 的 **Split Testing** [15]：

- 随机化单位是受众拆分，不是同一条有机视频的两次发布。
- 一次只测一个变量；固定 90% confidence；测试窗口 7–60 天；建议 Estimated Testing Power ≥80%。
- 官方没有公布 USD 最低预算；支持 Spark Ads；Creative Assets 维度可以测试前 2–3 秒的 hook。
- **「Smart Split」是 AI 剪辑工具，不是 A/B 测试**，名字容易误导。

### 5.2 可用指标与口径

TikTok Business API v1.3 的 `/business/video/list/` 提供 `average_time_watched`、`total_time_watched`、`full_video_watched_rate`、`video_view_retention`（逐秒）、`impression_sources`、`audience_types`、`engagement_likes`（逐秒）、`reach`、`video_views`、shares、favorites [16]。

口径注意：

- `video_views` 统计观看时长 >0 的会话，且包含付费流量；不是「曝光」。
- `reach` 是人，不是次数。
- 数据延迟约 T+24–48h；365 天后停止；7 天无互动后部分 insight 字段为空；分页最大 20。
- 不提供 impressions、CTR、原生 2 秒/6 秒指标。
- Accounts API 自 2026-03-20 起需要 Access Application。

### 5.3 其他平台

- YouTube 的 title/thumbnail A/B 只测标题和封面，Shorts 不在内；三态裁决，约两周 [17]。
- Instagram Trial Reels 是发布策略，不是随机对照；不能把它叫 A/B [18]。

### 5.4 推荐的有机设计：匹配对随机区组

- 区组 = 同一话题；同一脚本、同一音频；时长差 ≤3 秒。
- 只改变版式因素；用种子硬币决定先发 A 还是 B；两次发布间隔 ≥48h；同一星期几/时段。
- 主指标：`full_video_watched_rate` 与 `ln(average_time_watched)`；次指标：retention@50%、shares/reach、comments/reach（BH-FDR）。
- T+72h 读取；T+7d 只做敏感性；固定样本，不偷看。
- 报告 n、效应、95% CI、p、MDE、设计局限；n<8 只描述，不裁决。
- 可选：switchback / interrupted time series；Ads Split Testing 作为付费验证，不替代有机证据。

## 6. 统计与盲评

### 6.1 配对检验

- 主检验：paired permutation；辅助：Wilcoxon signed-rank、bootstrap CI、sign test。
- 不把观看当独立样本；分析单位是视频对。设计效应约为 `1 + (m−1)·ICC`。
- n=5 时双侧精确符号检验最小 p=0.0625，不能显著；**n=6 是能到 p<0.05 的最小样本**。
- 不偷看；一个主指标；次指标用 BH-FDR。

### 6.2 Power（σ=0.40，80% power，α=.05）

| n 对 | ρ=0 | ρ=.5 | ρ=.7 | ρ=.8 |
| --- | --- | --- | --- | --- |
| 10 | +65% | +43% | +32% | +25% |
| 20 | +43% | +28% | +21% | +17% |
| 40 | +28% | +19% | +15% | +12% |
| 80 | +19% | +13% | +10% | +8% |

n=20、ρ=.5 的 95% CI 半宽约 ±19%。所以 20 对只能检测结构性差异；要检测 +10% 需要约 80 对，按每周 2 对约 40 周。

### 6.3 离线盲评

- 4 个维度：清晰度、可信度、记忆度、视觉层级；1–7 锚点。
- 每对左右随机化；同一评审看同一对的两张图；≥8 名评审/视频。
- 报告 ICC(2,k) 与 win rate 的 Wilson CI。
- n≥40 对才能区分 60/40 与 50/50；n=20 只能排除「没有差异」。
- 评审包由 `experiment-review.mjs` 生成；`key.json` 只给分析师。

### 6.4 LLM/VLM 评审

只能做 triage（筛查明显溢出、空白、错字），不能当证据。若使用：双顺序、固定 rubric、与人类锚点 κ≥0.4；同一个模型不能既生成又裁决。

## 7. 不能承诺的事

1. 不能承诺 TikTok 有机号 A/B；平台没有这个功能。
2. 不能把匹配对区组叫 RCT。
3. 不能把 n=20 的结果外推到所有账号、所有话题。
4. 不能承诺「看完 → 关注/转化」的因果链。
5. 不能把 90% confidence 解释成 90% 后验概率。
6. 不能保证「前 3 秒决定一切」；这是未证实的因果法条。
7. 不能保证「动画一定提升记忆」；Noetel 的动画总体效应只有 0.23。
8. 不能保证「字幕一定提升理解」；逐字复读可能为负。
9. 不能保证「每镜最多 3 项 / 7±2」；这些数字没有可回溯的实验依据。
10. 不能把具体安全区像素写成平台真理；UI 会漂移。
11. 不能使用 Hoober 的拇指热区图；作者已撤回。
12. 不能保证「饼图永远错」；它只是角度编码，准确度低于位置/长度，且不适合精确比较。
13. 不能用 VLM 评分代替人类盲评或真实观看数据。

## 8. 本仓落地映射

| 外部结论 | 代码/门禁 | 状态 |
| --- | --- | --- |
| 关系 → 图型 | `lib/info-grammar.mjs` 的 `RELATIONSHIP_CHARTS` / `defaultChartFor` | 已实现 |
| 零基线 | `validateInfoSpec` 的 `info.baseline.zero` | FAIL |
| 直接标注、单位跟数值 | `formatChartValue` + 6 个原生组件 | 已实现 |
| 移动端重排版 | `data.chart` 820×620；标签上限按列宽/点距计算 | 已实现 |
| 单高亮 | `info.highlight` + `isHighlighted` | FAIL if >1 |
| 图表来源 | `texts.source` 必填 | FAIL |
| 图表与旁白同锚点 | `lib/chart-claim-agreement.mjs` 的 `auditChartClaimAgreement` | advisory |
| 一个 Peak、Peak 前有图表 | `lib/narrative.mjs` 的 `auditNarrativeArc` | advisory |
| 一镜一个注意力提示 | `lib/attention.mjs` 的 `auditAttentionBudget` | advisory |
| 图表 pin 合法 | `lib/chart-pin-contract.mjs` | FAIL |
| 布局身份 | `lib/layout-signature.mjs` | 已实现 |
| 配对实验 | `experiment.mjs` + `experiment-stats.mjs` | 已实现（T+72h / 发布间隔与顺序 / 3s 时长差 / 双主指标 / 固定 n 不出推断由工具强制） |
| 盲评包 | `experiment-review.mjs` | 已实现 |

**真实包审计（2026-11-16）**：

- 全部 49 个 content pack：新增门禁 0 FAIL；45 个包没有 `arcRole`（advisory），4 个包有连续 3 个同版式信息镜头（advisory）。
- 4 个迁移包：`kimi-ipo`、`deepinfer`、`china-us-token-divide`、`zhipu-valuation`；`verify-video --pre` 分别为 50 / 52 / 54 / 50 PASS，0 FAIL。`checkChartClaimAgreement` 对 Kimi 的时间窗和 DeepInfer 的「nearly in half」各给 1 条 advisory，未改文案。
- 布局签名（迁移前 → 迁移后）：`614b69be9193 → 36ac201c821c`、`062c642d343c → c152e63a8df9`、`7dc8b7b44460 → d3541bb80386`、`50df40265b88 → 9a42bb273905`。
- 盲评包：`output/experiments/info-layout-v2-blind-review/index.html`，6 对（Kimi 1、DeepInfer 1、China token 3、Zhipu 1），左右已随机化；`key.json` 只在分析师侧。**人类评分尚未收集**，因此不报告 ICC、win rate 或「原生图表更好」的结论。

## 9. 未解问题

1. 1080×1920 下，一个图表的最小可读停留时间是多少？现有证据只给方向，没有这个分辨率的时间阈值。
2. 中文标签的密度上限是多少？Datawrapper 的 12px 是 Web 正文，不是竖屏视频。
3. 中文字幕与口播的逐字重复是否比英文更伤理解？Noetel 的 verbal redundancy 主要来自英文实验。
4. 信息镜头与 B-roll 的完播率差异有多大？需要 L2 配对实验。
5. 安全区在 2026 年的 TikTok 真机数值是否仍与 2025 年一致？需要重新测量。
6. 图表类型 × 叙事位置（Peak 前 vs Peak）是否有交互？需要 2×2 设计。
7. 语义装饰（Bateman）与 coherence 的调和条件是什么？需要单独实验。
8. 中文口播的节奏（字/分）与图表阅读时间如何匹配？需要眼动或逐秒 retention。

## 参考

[1] Financial Times, _Visual Vocabulary_ (practitioner standard). https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary
[2] Datawrapper Academy, chart and annotation guidance (practitioner standard). https://academy.datawrapper.de/
[3] Cleveland, W. S., & McGill, R. (1984). Graphical Perception: Theory, Experimentation, and Application to the Development of Graphical Methods. _JASA_, 79(387), 531–554. DOI: 10.1080/01621459.1984.10478080.
[4] MobileVisFixer (2020). Tailoring Web Visualizations for Mobile Phones Leveraging an Explainable Reinforcement Learning Framework. _IEEE TVCG_. (Peer-reviewed; 374 SVG analysis.)
[5] Bateman, S., et al. (2010). Useful Junk? The Effects of Visual Embellishment on Comprehension and Memorability of Charts. _CHI 2010_. DOI: 10.1145/1753326.1753716.
[6] Borkin, M., et al. (2013). What Makes a Visualization Memorable? _IEEE TVCG_, 19(12), 2306–2315. DOI: 10.1109/TVCG.2013.234.
[7] Amini, F., et al. (2015). Understanding Data Videos: Looking at Narrative Visualization through the Cinematography Lens. _CHI 2015_. DOI: 10.1145/2702123.2702431.
[8] Segel, E., & Heer, J. (2010). Narrative Visualization: Telling Stories with Data. _IEEE TVCG_, 16(6), 1139–1148. DOI: 10.1109/TVCG.2010.179.
[9] Zannettou, S., et al. (2024). Short-form video attention study (347 users, 9.2M recommendations). _CHI 2024_. (Peer-reviewed; exact title and DOI to be filled from the camera-ready PDF if cited externally.)
[10] Guo, P. J., Kim, J., & Rubin, R. (2014). How Video Production Affects Student Engagement: An Empirical Study of MOOC Videos. _L@S 2014_. DOI: 10.1145/2556325.2566239.
[11] Noetel, M., et al. (2022). Multimedia Design for Learning: An Overview of Meta-Analyses. _Review of Educational Research_. DOI: 10.3102/00346543211052331.
[12] Hoober, S. (2013). How Do Users Really Hold Mobile Devices? _UXmatters_. http://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
[13] Hoober, S. (2017). Retraction of the thumb-zone diagram (author's public correction). (Use the retraction, not the 2013 diagram.)
[14] TikTok Ads Help, creative best practices (platform official, ad guidance). https://ads.tiktok.com/help/
[15] TikTok Ads Manager, Split Testing (platform official). https://ads.tiktok.com/help/
[16] TikTok Business API v1.3, `/business/video/list/` (platform official). https://business-api.tiktok.com/portal/docs
[17] YouTube Help, Test & Compare for thumbnails/titles (platform official). https://support.google.com/youtube/
[18] Instagram Help, Trial Reels (platform official; publish strategy, not a randomized control). https://help.instagram.com/
[19] Cohen, J. (1988). _Statistical Power Analysis for the Behavioral Sciences_. (Power conventions.)
[20] Benjamini, Y., & Hochberg, Y. (1995). Controlling the False Discovery Rate. _JRSS-B_. (BH-FDR.)
[21] Wilson, E. B. (1927). Probable Inference, the Law of Succession, and Statistical Inference. _JASA_. (Wilson interval.)
[22] Shrout, P. E., & Fleiss, J. L. (1979). Intraclass Correlations: Uses in Assessing Rater Reliability. _Psychological Bulletin_. (ICC.)
[23] TikTok official creative guidance on 9:16, ≥720p, hook/claim timing, 5–10 words/sec overlays. (Platform official; ad guidance, not an organic causal law.)
[24] Datawrapper, "What to consider when choosing colors" and direct-labeling guidance. (Practitioner standard.)

> 说明：平台帮助中心的 URL 会随页面改版迁移；本文引用的是入口页，不把某个深链当成永久标识。学术引用以 DOI/标题为准；无法回溯的营销转述不列入。
