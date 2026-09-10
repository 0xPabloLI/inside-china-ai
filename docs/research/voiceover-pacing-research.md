# 短视频旁白语速研究：写稿优先 + 小幅 TTS 提速

> 2026-09-10 · web-deep-research (Standard tier) · 触发背景：CosyVoice3 语速选型（#225 后续），用户问"是否应先改写稿方式而非调 speed 参数"
> 用途：修改 `content-pipeline.md` Stage 3 写稿规范时的依据来源；TTS speed 默认值的上限依据

## 结论速览

| # | 结论 | 置信度 | 依据 |
|---|------|--------|------|
| 1 | 英文短视频旁白目标语速 **140-160 wpm（甜点 ~150）**；130 wpm 偏慢、>160 发赶 | High | 多个独立实践来源收敛 [1][2][3]，与语言学"正常会话 ~150 wpm"锚点一致 [5] |
| 2 | **写稿优先（删词提密度）优于直接拉语速**，是行业收敛做法但非严格 A/B 实验结论 | High（共识）/ 机制级 | "150 wpm 靠删词不靠拉音节" [2]；Meta 前 3 秒研究 [6]；padding 有害 [7] |
| 3 | TTS 提速安全上限 **~1.2×**：1.15-1.2 在自然度与理解保持区，1.5 超阈值 | High | ElevenLabs 官方 UI/Agents 上限 1.2（Tier 1）[8]；时间压缩研究 25% 压缩维持理解、275 wpm 悬崖 [4] |
| 4 | 中文旁白 **240-300 字/分已是快节奏档**，300 字/分≈播音上限，本管线中文不应提速 | High | 人民网/央广网/今传媒多源（Tier 2）[9][10][11] |
| 5 | CosyVoice `speed` 参数本质 = **vocoder 前的 mel 线性时间拉伸**，与后处理 atempo 同类操作 → 两者听感趋同是必然 | Verified（Tier 1 源码） | `cosyvoice/cli/model.py` token2wav L156-158 [12] |

## 本管线实测基线（2026-09-09 A/B 样本）

| 场景 | 时长 | 语速 | 对标 |
|------|------|------|------|
| EN hook（scene-801，25 词，11.52s） | 1.0× | **130 wpm** | 低于行业下限 140 |
| EN 1.15× | — | 150 wpm | 正中甜点 |
| EN 1.2× | — | 156 wpm | 行业上沿，听感 OK（用户实测） |
| EN 1.5× | — | 195 wpm | 用户实测"不行"；>160 发赶 [1] |
| ZH hook（scene-804，11.68s） | 1.0× | ~236 字/分 | 已在欢快档 [9] |
| ZH narrative（scene-805，9.36s） | 1.0× | ~288 字/分 | 接近新闻联播上限 [9] |
| ZH cta（scene-806，9.96s） | 1.0× | ~265 字/分 | 快节奏档内 |

关键推论：**wpm 天花板是嗓音属性，不是稿子属性**。删词让视频变短、信息密度变高，但 1.0× 下音节速率不变（删 25→20 词，语速仍 ~130）。因此两步顺序为：写稿规范先收紧 → 真包实测 → 残余缺口用 speed 补差（预计 1.05-1.1，而非 1.15-1.2）。

## 详细分析

### 1. 写稿端 pacing 规范（Stage 3 落地建议）

- EN 目标 **~2.4-2.5 词/秒净内容**（=150 wpm），ZH 维持现状（4.4-4.8 字/秒已在快档）
- 删除对象有行业清单：hedging（just/really/basically/actually）、filler 开场（so/alright/today we're going to talk about）、throat-clearers（as you probably know）、软限定词（I think/generally speaking）[2]
- 语速应"结构解决而非声带解决"：voice 保持自然，velocity 由稿子承担 [2]
- Hook 前 3 秒：TikTok for Business 报告最高 CTR 视频 63% 在前 3 秒完成 hook（Tier 2 转引）[13]；Meta 内部研究：前 3 秒传达核心价值 → 完播率 +47%（Tier 2 一手平台研究）[6]
- 短时长红利：>1min TikTok 视频 reach 比 30-60s 高 43.2%（Buffer 分析，Tier 2 转引）[14]；完播率天花板随时长下降（≤10s ≈81%，31-60s ≈42%）[13]

### 2. TTS 变速机制：为什么 native 与 atempo 听感趋同

CosyVoice 源码（`token2wav`，[12] L156-158）：

```python
if speed != 1.0:
    assert self.hift_cache_dict[uuid] is None, 'speed change only support non-stream inference mode'
    tts_mel = F.interpolate(tts_mel, size=int(tts_mel.shape[2] / speed), mode='linear')
```

即 speed 参数对生成的 mel 频谱做**时间轴线性插值**后再 vocoder——与后处理 atempo（波形域 WSOLA）同属保音高时间拉伸，但作用域不同，**artifact 方向相反**。2026-09-10 频谱实测（scene-801 同源，STFT 1024/256）：

| 指标 | 1.0× 基线 | native-120 | atempo-120 | native-150 | atempo-150 |
|---|---|---|---|---|---|
| 频谱通量 flux | 20.6 | 19.7 (−4%) | 22.4 (+9%) | **13.1 (−36%)** | 23.6 (+15%) |
| 谱质心 Hz | 2282 | 2284 (0) | 2310 (+1%) | **2173 (−5%)** | 2271 (0) |
| 高频占比 (>4kHz) | 0.2123 | 0.2122 (0) | 0.2166 (+2%) | **0.1955 (−8%)** | 0.2120 (0) |

- **≤1.2×：两条路线频谱均贴近基线**（deviation ≤9%），听感不可分——用户实测"1.2 处都差不多"得到客观验证
- **1.5×：分叉显著**。native 的 mel 线性插值把每输出帧跨 1.5 输入帧加权平均 → 瞬态（爆破音/咝音）被抹平、高频塌缩 → 客观上"变闷变糊"（flux −36%）；atempo 在波形域重排真实波形段，频谱保真但 WSOLA 相位接缝使 flux +15%（略糙）
- 工程结论：**speed 补差在 ≤1.2 区间内两路线等效可互换**；≥1.3 区间两者以不同方式劣化且 native 劣化更重——与业界 1.2 上限（结论 3）互为印证。`speed` 仅支持非流式推理（kernel `stream=False` 满足）

### 3. 理解力上限（提速的硬约束）

- 母语听者理解不受损的语速上限：**6.5 音节/秒**（Kuperman et al. 2021，经 Cambridge 2026 论文转引）[5]
- 60 年时间压缩语音研究（Foulke & Sticht 1969 综述确立）：150 wpm 正常 → 200-250 wpm（~25% 压缩）理解维持 → **275 wpm 以上急剧下降** [4]
- 映射到本管线：EN 1.0× =130 wpm，1.25× ≈ 163 wpm 仍在 25% 压缩安全区；1.5× =195 wpm 未破理解悬崖但已过"发赶"感知阈值 [1]。注意 1kreach 称 60% 短视频观众开自动翻译——该人群有效阈值更低，支持保守取值

## 反方观点与风险

- **"150 wpm 留存 +15-25%"为单一营销博客数据**（1kreach，Tier 3），无原始留存曲线公开 → 只作方向性参考，不作确定收益预期
- **无 Tier 1 的"短视频官方语速标准"存在**：140-160 wpm 是行业实践收敛值，各来源互相独立但均非平台官方规范
- **删词优先无直接 A/B 实验**：比较"删词 vs 提速"两杠杆的受控研究未找到；结论由机制一致性 + 多源实践收敛支撑，置信度标注为共识级而非实验级
- 中文若跟随提速会突破 300 字/分播音上限 [9]，且中文观众对本嗓音的 4.4-4.8 字/秒已无抱怨——**中文维持 1.0×**
- ElevenLabs REST API 允许 0.25-4.0 但 Agents Platform 收紧到 0.7-1.2 [8]——API 宽松值不是安全区证据，产品端收紧值才是工程共识

## 开放问题

1. 改稿规范后首个真包的实测 wpm（决定 speed 补差值，预计 1.05-1.1）
2. speed 补差后是否仍保持用户认可的音色（1.05-1.1 幅度小，风险低，但需真机听审）
3. ZH 场景在改稿后是否反而偏快（若删词导致信息密度上升，中文或需反向微调）

## Sources

1. [FlowShorts — Words Per Minute Speaking (2026)](https://flowshorts.app/blog/words-per-minute-speaking) — 短视频 140-160 wpm、AI 配音默认 ~150 — Tier 3
2. [1kReach — Voiceover pacing: the 150-wpm sweet spot](https://www.1kreach.com/blog/voiceover-pacing-2026-150-words-per-minute-sweet-spot-out-retaining-slower-narration) — "删词不拉音节"、filler 清单、auto-translation 观众占比 — Tier 3
3. [LetterCounter — Video Script Word Count](https://lettercounter.org/blog/video-script-word-count/) — >160 wpm 难跟随、<120 拖沓 — Tier 3
4. [はとはと — 速聴研究 60 年综述](https://hatohato.jp/blog/core/single.php?id=111) — 150→200-250 理解维持、275+ 悬崖（Foulke & Sticht 1969）— Tier 3（转引学术综述）
5. [Cambridge — Predicting at speed during L2 sentence processing (2026)](https://www.cambridge.org/core/journals/bilingualism-language-and-cognition/article/predicting-at-speed-during-l2-sentence-processing/278BF9E0002D444ACD441CF0B8512F1F) — 转引 Kuperman et al. 2021：理解不受损上限 6.5 音节/秒 — Tier 1（同行评审）
6. [ClipForge — AI Hook Writers](https://clip-forge.io/blog/ai-hook-writer-short-form-video) — 转引 Meta 2021 广告研究：前 3 秒传达价值 → 完播 +47% — Tier 3（转引一手平台研究）
7. [Shortzly — Short-Form Video Retention (2026)](https://shortzly.com/blog/short-form-video-retention-strategies) — padding 是掉留存主因、四段留存弧 — Tier 3
8. [ElevenLabs Docs — Text to Speech / Voice Settings](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech) 与 [elevenlabs/skills voice-settings.md](https://github.com/elevenlabs/skills/blob/main/text-to-speech/references/voice-settings.md) — speed UI 上限 1.2、"Extreme values may affect quality" — **Tier 1（官方文档）**
9. [人民网 — 揭秘《新闻联播》主播工作细节 (2015)](http://media.people.com.cn/n/2015/0325/c14677-26748604.html) — 新闻联播 300 字/分=仪态前提最大值；历史 160-180→220-240→280→300 — Tier 2（官媒）
10. [央广网 — 电脑打字远超正常语速 (2007)](http://china.cnr.cn/wbll/xinshenghuo/200704/t20070417_504445873.html) — 播音 ~300 字/分、相声/体育解说最高 360 — Tier 2（官媒）
11. [人民网·今传媒 — 新闻播音的技巧 (2016)](http://media.people.com.cn/n1/2016/0115/c402008-28058776.html) — "平均每分钟 300 字左右最容易被受众所接受" — Tier 2（学术期刊经官媒转载）
12. [FunAudioLLM/CosyVoice — cosyvoice/cli/model.py](https://github.com/FunAudioLLM/CosyVoice/blob/main/cosyvoice/cli/model.py) — token2wav speed=mel 线性插值、仅非流式支持 — **Tier 1（源码，本地已核）**
13. [AI Tools Guidebook — Short-Form Video Hooks with AI (2026)](https://aitoolsguidebook.com/en/articles/short-form-video-hook-ai/) — TikTok for Business 63% 前 3 秒、完播率基准表 — Tier 3（转引平台研究）
14. [GoFaceless — TikTok Hook Formulas](https://www.gofaceless.ai/tl/blog/tiktok-video-hooks-guide) — 转引 Buffer：>1min reach +43.2% — Tier 3（转引分析机构）
