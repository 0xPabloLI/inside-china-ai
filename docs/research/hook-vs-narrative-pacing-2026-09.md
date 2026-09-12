# Hook vs 正文相对语速 + WPM 反馈闭环设计模式（增量研究）

> 2026-09-11 · 触发背景：#252（ant-lingbot-world-13b 实测 hook 157 WPM vs narrative 228/257 WPM，能量倒挂）。
> **增量定位**：`docs/research/voiceover-pacing-research.md`（#235，14 源）已定案 EN 甜点 140-160 wpm、TTS 提速上限 1.2×、写稿优先——本文不重复该调研，只补三个增量问题：
> ① hook（前 3-5s）与正文的**相对**语速行业实践；② 产品级**实测 WPM 反馈闭环**设计先例；③ 语速-留存量化证据补充。

## 结论速览

| # | 结论 | 置信度 | 依据 |
|---|------|--------|------|
| 1 | 行业共识方向：**hook 应是全片能量峰值，语速不应慢于正文**；能量曲线应"开场峰值 → 维持 → 结尾再加速"，中段衰减是流失点。无"hook 比正文快 X wpm"的量化标准——相对关系是方向性共识而非精确差值 | Medium | [1][2][3][4] |
| 2 | 短视频创作者整体语速 **170-200 WPM**（高于会话/演讲 130-160 约 20-40%），有创作者称 200 WPM 为"normal TikTok speed"。但该速率靠**删停顿+剪辑密度+写稿密度**达成，非 TTS 拉速——与 #235 结论 2/3（1.2× 上限、删词不拉音节）互洽 | Medium（Tier 3 多源收敛） | [5][6][7] |
| 3 | 产品级反馈闭环已有先例：TTSAudit 的 speaking-speed 检查 = **silence-aware WPM 实测 → 批内离群 flag → 调整重生成**。"生成→测→补差"是可采购的商业工具模式，不是本管线发明 | Medium | [8] |
| 4 | 无新的 Tier 1"语速→短视频留存"直接量化证据；留存量化仍以 Meta 前 3 秒研究（#235 [6]）为最强一手数据。全片匀速与"变速有目的"（slow for emphasis / fast for energy）是演讲实践共识 | Low-Medium | [4][9] |

## 1. Hook vs 正文相对语速（增量问题 ①）

- **能量曲线方向**：Opus.pro 明确警告 "Reels that start fast but slow down mid-way create natural exit points"（开头快、中段慢 = 自然退出点）[1]；vidIQ 强调能量应递增不应向结尾衰减 [2]。 practitioner 框架普遍为 hook(0-3s) → body → close，hook 承担最高能量与最快节奏 [3][4]。
- **映射到 #246 的倒挂**：ant-lingbot-world-13b 的 hook 157 WPM vs narrative 228/257 WPM 同时违反两件事——(a) 相对方向（hook 慢于正文，违反结论 1）；(b) 绝对上限（正文 228/257 已超出 #235 的"发赶"感知带与 225 观察上限）。**这两个问题必须分开修**：只把 narrative 降到 hook 之下会留下超速；只修绝对上限（如统一 1.0）若 hook 仍最慢则仍违反结论 1。
- **静态倍率为什么必然出错**：场景基线密度差异大（#235 实测 130-214 WPM），任何静态分类倍率都会把高基线场景推出上限、把低基线场景留在甜点下方。相对关系只能由**实测**涌现，不能由 scene class 拍定——这是 #252 取消 hook 1.0 / narrative 1.2 静态对的调研依据。
- **CTA 例外**：能量曲线"结尾再加速"意味着 cta 场景语速偏快（真包 deepseek-v41-flash-report cta 实测 192 WPM）属行业模式产物，带内（≤225）不干预；相对记账时 cta 亦不参与 hook 对比。

## 2. WPM 反馈闭环设计模式（增量问题 ②）

- **商业先例**：TTSAudit speaking-speed check——对一批 TTS 音频做 silence-aware WPM 实测，按目标带 140-160 离群 flag [8]。证明"生成→测→比→调→重生成"闭环是产品级成熟模式。
- **与 #235 复测验收的衔接**：#235 验收"真包逐场景 EN 实测 wpm，超 160 的场景降 1.15 复测"未落地（#246 Scene 5 257 WPM warning 放行带病出片）。#252 闭环把该验收补成机器强制：实测 <135 → 该场景独立补差（native speed = 150/实测，clamp ≤1.2）；实测 >225 → 换 seed 重抽一次（take 漂移 ±10-20%，#234），重抽仍超标 → **硬阻断**（fail-closed，不产出 rushed audio）；带内 keep。
- **阈值设计理由**：补偿触发点取 135 而非甜点下限 140——测量噪声 + take 漂移使追着下限补偿会振荡（评审意见，#252 评论）；上限 225 与 quality-gate `MAX_ACCEPTABLE_WPM` 共享值，>225 已越过 60 年时间压缩研究的舒适区（200-250 为 25% 压缩边缘，#235 [4]）。

## 3. 语速-留存量化（增量问题 ③）

- 未找到新的 Tier 1 "语速 wpm → 短视频完播率" 直接研究；Wistia 数据（1-2 分钟视频开头流失 4.9%）是"开头即生死线"的补充旁证 [10]。
- 演讲实践共识 "vary rate with purpose"（重点放慢、能量段加速）[9] 在工程上简化为：带内场景保持 1.0 不动，不做人为变速——匀速 + 写稿密度承担节奏，避免机器制造听感波动。

## 4. 决策记录（#252 待决策项取舍）

| 待决策项 | 决策 | 理由 |
| --- | --- | --- |
| 推荐方案（WPM 实测反馈闭环 + 取消 hook 静态豁免） | **采纳** | 调研结论 1/2/3 一致支持：相对关系交给实测涌现；静态倍率在基线密度差大的包里必然部分场景超速（#246 根因） |
| Stage 3 词密度预算（评审建议） | **采纳**：写稿端 words/sec ≤ 2.9（≈175 WPM）拦截，目标 2.4-2.5 词/秒 | 结论 2：行业高 WPM 靠写稿密度而非拉速；在 TTS 生成前拦截比生成后重抽省远程 GPU 耗时（评审意见） |
| >225 硬阻断 | **采纳**，落点在 registry pacing loop 层（`TTS_PACING_HARD_BLOCK`，reroll 后仍超标即 throw），quality-gate.mjs 的 warning 行为不动 | quality-gate.mjs 属并行线改动禁区（ADR-0020 ASR backend 切换中）；gate 对 >225 本就判 passed+warning，硬阻断在闭环层执行语义等效且 fail-closed。escape hatch：`TTS_SKIP_QUALITY_GATE=1` |
| 备选"hook 也统一 1.2x" | **否决** | Scene 5 式高基线场景会到 ~270 WPM，更糟（票内已论证） |

## 5. 真包复测（deepseek-v41-flash-report，EN，2026-09-11）

写稿规范（#235）生效后的首个 EN 包，**既有 audio 实测 + 新管线 dry-run**（未重新生成 TTS；音频时长 ffprobe 实测、词数取 ttsText/voiceover，与 quality-gate 口径一致）：

| Scene | 角色 | 词数 | 时长(s) | 实测 WPM | 闭环判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | hook | 24 | 10.84 | 133 | compensate → 1.13x（预估 ~150） |
| 2 | narrative | 25 | 9.20 | 163 | keep |
| 3 | data | 32 | 15.12 | 127 | compensate → 1.18x（预估 ~150） |
| 4 | data | 27 | 11.36 | 143 | keep |
| 5 | narrative | 22 | 9.52 | 139 | keep |
| 6 | cta | 18 | 5.62 | 192 | keep（带内；结尾加速符合能量曲线） |

- **相对关系**：闭环补偿后 hook ≈150 vs narrative 139-163——hook 不再是最慢部分，#246 倒挂消除；且全部场景 ≤163（带内），无 >225 reroll。
- **对照旧管线**：ant-lingbot-world-13b（静态 1.2x）narrative 228/257 带病出片；同批场景若走新管线会在基线 1.0 下实测 ~190/214（除以 1.2），其中 214 仍 >200 靠写稿端词密度预算在 Stage 3 拦截——闭环 + 预算两层防线各司其职。
- **降级说明**：本复测为"既有 audio 实测 + dry-run"，未覆盖闭环的重抽/硬阻断真机路径（该路径由 `tts-pacing-loop.test.mjs` 9 例 fake-engine 测试覆盖，含 reroll 自愈与 `TTS_PACING_HARD_BLOCK`）；下一真包生成时闭环将在真实引擎上首次执行。

## Sources

1. [Opus.pro — Ideal Instagram Reels Length & Format for Retention](https://www.opus.pro/blog/ideal-instagram-reels-length) — "start fast but slow down mid-way = natural exit points" — Tier 3
2. [vidIQ — Increase Audience Retention on YouTube](https://vidiq.com/blog/post/increase-audience-retention-youtube/) — 能量应递增不衰减；hook >65% 留存基准 — Tier 3
3. [Opus.pro — TikTok Hook Formulas](https://www.opus.pro/blog/tiktok-hook-formulas) — 前 3 秒 >65% 留存为强 hook、35% 流失即不合格 — Tier 3
4. [Teleprompter.com — TikTok 3 Second Rule (2026)](https://www.teleprompter.com/blog/tiktok-3-second-rule) — 3 秒法则与 hook 框架 — Tier 3
5. [Teleprompter.com — Speaking Speed Calculator](https://www.teleprompter.com/tools/speaking-speed-calculator) — TikTok/Reels 推荐 170-200 WPM vs 会话 130-160 — Tier 3
6. [Teleprompter.com — How to Time Your Script](https://www.teleprompter.com/blog/how-to-time-your-script) — 30s≈60-75 词（2.0-2.5 词/秒）；创作者 200 WPM 实例 — Tier 3
7. [VirtualSpeech — Average Speaking Rate](https://virtualspeech.com/blog/average-speaking-rate-words-per-minute) — 会话/演讲 120-150 WPM 对照 — Tier 3
8. [TTSAudit — Speaking Speed Check](https://ttsaudit.com/checks/speaking-speed) — silence-aware WPM 实测 + 离群 flag 的产品级闭环先例 — Tier 3（产品文档）
9. Vinh Giang（演讲教练，LinkedIn/公开课）— "vary rate of speech with purpose" 实践共识 — Tier 3
10. [Wistia — Understanding Audience Retention](https://wistia.com/blog/understanding-audience-retention) — 开头流失 4.9%（1-2min）— Tier 3（平台一手数据）
