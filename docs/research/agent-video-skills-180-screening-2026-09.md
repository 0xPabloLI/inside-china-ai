# Agent 视频 Skill 开源生态筛选（180 库 × 我们的管线）

> L2 研究依据。对象：推文 2026-09-27 指向、当天开源的 180 个「让 Claude Code / Codex 做视频」的 skill 仓库。
> 目的只有两个：**哪几个值得研究**，以及**按什么顺序研究**。
> 本文中所有星数 / 许可证 / 最后提交时间均为 2026-09-28 用 GitHub REST API 实测值，不抄 README 数字。
>
> **并行产出提示**：`docs/tools-catalog.md` §「视频 Skill 储备」由**另一 session 以同一份清单**产出（A/B/C/D 速览 + 安全标记，工具准入视角）。本文是研究层：**缺口映射 → 研究顺序 → 完成判据 → 证据强度**。两者互补，不互相替代；若结论冲突，以本文为准——本文每个数字都是当日 API 实测，速览表里的星数来自榜单快照。

## TL;DR

- 这份清单对我们**不是「抄整套 pipeline」的价值**——选题、脚本、TTS 质量控制、逐词卡拉 OK 字幕、验证闭锁这些我们已有且更细；它们的普遍做法是 ElevenLabs + Remotion + ffmpeg 三件套，对我们的场景属于降级。
- 真正的价值在 **6 个具体缺口**：① 镜头/动效语法库的广度；② 无真实素材时的抽象视觉计划 B；③ 「看懂别人的视频 → 结构化反推」的 rubric；④ 已成片的时间级选段/修剪；⑤ Remotion vs HyperFrames 的长期内核判断；⑥ 数字人的付费 fallback。
- 研究顺序：**先把已装的 `remotion-dev/skills` 补到上游（落后 22 个 patch 版本，最便宜的收益）→ `runesleo/claude-video-kit` 的渲染前凭证化门禁 → iart-ai 四包抽语法 → video-shotcraft 镜头卡 → erduo / gbro 的 B-roll 工艺 → 二创路线 Go/No-Go → 数字人 fallback 决策 → HyperFrames spike**。全文秩序见 §4。
- **2026-09-28 对账**：与你的自筛清单（A/B/C 三分）比对后，净增量只有 2 个动作——`runesleo/claude-video-kit` 收入 Tier A（A15）、`znyupup/knowledge-explainer-skill` 只读；其余差异是**选择函数不同**（我按「每个缺口只留一个代表」选，你按「名字对口度」扫），不是判断冲突。逐条对账见 §5。
- **TTS 那条路我们和社区不一样，且是刻意的**：全仓业务代码里 ElevenLabs 只有 1 处命中，还是当**反面参照**写在注释里。详见 §6。

---

## §0 取证路径（我们读的是哪份清单）

| 环节 | 结果 |
| --- | --- |
| 推文 `x.com/GoSailGlobal/status/2104215886429331580` | 正文只有一个链接，指向 X 长文 `x.com/i/article/2104181663844700160` |
| X 长文 / x.com 本体 | **本机不可达**：沙箱 curl 直连与代理出口均返回 `000`（TLS 握手前失败），WebFetch 同样失败。所以我没读作者正文里的主观评价，本文也不引用它 |
| 实际读到的清单 | 作者（Jason Zhu / @GoSailGlobal）当天把清单开源成仓库 **[`zhuyansen/awesome-claude-video-skills`](https://github.com/zhuyansen/awesome-claude-video-skills)**：创建 `2026-09-27T04:06Z`、最后 push `2026-09-27T10:49Z`、33★（2026-09-28 实测）、README 含全部 180 条 + `data/skills.json` 机器可读版 + 在线榜 `agentskillshub.top/best/claude-video-skills/` |
| 交叉验证 ①（分类计数） | README 的 10 类计数与推文给的完全一致：框架与工具包 29 / 产品宣传 26 / 讲解科普 32 / 剪辑后期 35 / 短视频口播 19 / 数字人 4 / 故事动画 13 / 动效 Logo 11 / 剧本学习 9 / 音乐视频 2 = **180**；仓库 topics 也带 `hyperframes / remotion / motion-graphics` |
| 交叉验证 ②（作者身份，2026-09-28 补） | `gh api users/zhuyansen` → `name: **JasonZhu**`、`twitter_username: **GoSailGlobal**`（与推文作者账号逐字相同）；仓库 homepage = `agentskillshub.top/best/claude-video-skills/`（他自己的站）。**身份是 GitHub 账号字段直接证实的，不是靠名字相似猜的** |
| 交叉验证 ③（时间线） | 仓库创建 `2026-09-27T04:06Z`；推文 ID 按 snowflake 反解为 `2026-09-27T14:25:36Z`。仓库早于推文约 10 小时，符合「先整理并开源清单、后发推引流」 |
| 推文正文怎么读到的 | x.com 本体不可达，但第三方镜像 **`api.vxtwitter.com/status/<id>` 可用**：返回 `text` = `https://x.com/i/article/2104181663844700160`，即**推文正文除一个长文链接外没有别的内容** |
| **仍然没读到的** | **X 长文本体自始至终没读到**（该镜像不返回长文正文，WebFetch 也失败）。所以本文不含作者的主观评价与那份「安全评级」。上面三条是**间接证据链**，强度很高但不是「读过原文」——若将来能读到原文，本文所有 `[D]` 条目应升级为 `[R]` |

**证据强度标记（全文沿用）**：

- `[R]` 今天实际读了 README/SKILL.md 片段 → 结论可信；
- `[M]` 今天用 API 核过星数/许可证/最后更新，但没读正文 → 只用于「活跃度/许可」判断；
- `[D]` 仅依据清单那一行描述 → **属于筛除决策，不是能力结论**，落地前必须重读。

---

## §1 先盘我们自己：哪些环节已解决，哪些是真缺口

依据：`docs/content-pipeline.md` Stage 0–5、`docs/video-production-runbook.md`、`docs/video-script-writing-guide.md`、`scripts/short-video/lib/subtitles/ass.mjs`。

| 管线环节 | 我们的现状 | 社区能不能帮上 |
| --- | --- | --- |
| 选题/搜源/证据审计 | `search-sources` 三档 + 证据分组 + RAG | 悬殊：几乎没有同类方案做事实审计，跳过 |
| 脚本结构 | S.T.A.R.T. + 留存引擎 + MRL-2（13 Blocker / 9 Warning） | 只做**语法对照**，不替换（见 B1） |
| TTS 与双语 prosody | f5-mlx / CosyVoice3-Kaggle + Quality Gate + pacing 自愈 + 双轨文本 | 社区普遍是「调 ElevenLabs 就完事」，对我们是降级 |
| 字幕 | wav2vec2 强制对齐 → word-level `\k` karaoke ASS（`lib/subtitles/ass.mjs` 已实现 libass 时钟语义） | 已有且更严；社区只多些视觉花样 |
| 渲染/文本安全 | Remotion + TextGate 硬门 + `remotion-*` skill 已安装 | **这里有可立即修的差距：本地 v4.0.507 vs 上游 v4.0.529（落后 22 个 patch）** |
| 素材获取 | 三级搜索池 + VLM 相关性评分 + AI Image / MLX Wan B-roll | **缺口①②**：模板广度、无素材时的计划 B |
| 完播率归因 / 竞品反推 | `docs/analytics-workflow.md` 只有自家 CSV 结论 | **缺口③**：缺「抽帧/拉片 → 结构化 rubric」那一层 |
| 长视频 → 短视频二创 | 无（当前是「素材 → 直出」单一形态） | **缺口④**：是否要开第二条产线，先做 Go/No-Go |
| 数字人 | `scene.avatar` 有 spec，工程卡在 xfuser 依赖 | **缺口⑥**：付费 API fallback 是否开口子，需决策 |
| 渲染内核 | 单一押注 Remotion | **缺口⑤**：HyperFrames 已成社区默认第二内核（53.5k★），需要一次知情判断 |

---

## §2 筛选口径（不符合这 5 条的一律降档或剔除）

1. **许可证**：`PolyForm Noncommercial` / `NOASSERTION` / `AGPL-3.0` → 代码不得进入产线（`AGPL` 连看目录都要谨慎，`video-talkcraft`、`OpenMontage` 均属此列）。我们已有此类审查的先例（`docs/research/model-sources-reference.md` 的 Apple Silicon 准入）。
2. **付费 API 硬绑定**：ElevenLabs / fal.ai / HeyGen / 小米 MiMo / Atlas Cloud → 我们走本地 MLX / Ollama / Kaggle 免费档；这类只做「方法参考」，除非能明确指出本地替代物。
3. **必须 NVIDIA / CUDA**：我们是 M2 Pro 32GB，`faster-whisper + NVENC` 路线要重写。
4. **活跃度**：90 天内无 push → 降为「只读想法，不安装」。
5. **重复即跳过**：和我们现有能力同位的（例如「用 ElevenLabs 出 word-exact 字幕」），一律不看。

---

## §3 筛选结果

### Tier A —— 值得研究，且每个都对着一个具体缺口（15 个）

| # | 仓库 | ★ | 许可证 | 最后 push | 对着哪个缺口 | 我要研究的具体问题 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | [`Vincentwei1021/video-shotcraft`](https://github.com/Vincentwei1021/video-shotcraft) `[M]` | 9,691 | Apache-2.0 | 2026-09-27 | ① | 152 张镜头配方卡 + 209 动效预览能否整理成我们的 `mediaStrategy` → 模板候选（**Apache-2.0 可商用**，同一作者的 `video-talkcraft` 是非商用，别搞混） |
| A2 | [`iart-ai/motion-skills`](https://github.com/iart-ai/motion-skills) `[M]` | 516 | MIT | 2026-09-23 | ①③ | 50 个 skill / 14 个 pack（含 TikTok-Reels、data-viz）；先只读三包：`tiktok-video-skills`、`explainer-video-skills`、`data-animation-skills` |
| A3 | [`iart-ai/tiktok-video-skills`](https://github.com/iart-ai/tiktok-video-skills) `[R]` | 11 | MIT | 2026-06-22 | ③ | 它把 hook → retention → loop 写成机械语法（pattern interrupt、safe-area、per-word pop）——**正好是我们 MRL-2 W7/W8 想要机械化的东西**；缺点是停更 3 个月 |
| A4 | [`iart-ai/data-animation-skills`](https://github.com/iart-ai/data-animation-skills) `[M]` | 6 | MIT | 2026-06-22 | ① | CSV → 「每帧数字都准确」的动画图表；我们文章的 Widget `dataPoints` 进视频一直靠静态图，这是现成对照物 |
| A5 | [`erduo1998-cell/erduo-broll-loop-engineering`](https://github.com/erduo1998-cell/erduo-broll-loop-engineering) `[R]` | 203 | MIT | 2026-09-21 | ①⑤ | 三条可抄工艺：**按语义分镜而非一句字幕一镜**、改一镜只重渲受影响镜头（我们的 TTS 缓存已有类似思想，媒体轨没有）、独立 Reviewer 看真实画面。**它的 README 自曝 Remotion 路线翻过车**（20/20 技术通过但视觉不合格），所以只抄约束，别照搬它的双后端路由 |
| A6 | [`pyang5166/gbro-collage-broll`](https://github.com/pyang5166/gbro-collage-broll) `[M]` | 1,311 | MIT | 2026-07-15 | ② | 半调纸拼贴 B-roll，**宣称不依赖 image model**；对我们「新闻没有对应真实画面」的场景正是计划 B |
| A7 | [`MegaTroll222/VOX-COLLAGE-BROLL`](https://github.com/MegaTroll222/VOX-COLLAGE-BROLL) `[M]` | 212 | NOASSERTION | 2026-07-17 | ② | A6 的英文改编版；只作为「抽帧/质疑清单」读，代码不进产线（许可不明） |
| A8 | [`zenstory-ai/video-recap-skills`](https://github.com/zenstory-ai/video-recap-skills) `[R]` | 537 | MIT | 2026-09-27 | ③④ | 「看懂别人的视频 → 中文解说 → 成片」全链路 + `timeline.json` 可导出剪映；**最有价值的是它的 `recap_story_plan.json` 语法**（观众承诺 / POV / 戏剧问题 / beat），可直接改成我们 review 自己成片的 rubric。硬依赖：小米 MiMo API key；本地化需换成 Qwen3.8 VLM + whisper 双轨（本机两侧组件都已具备） |
| A9 | [`AgriciDaniel/claude-shorts`](https://github.com/AgriciDaniel/claude-shorts) `[R]` | 217 | MIT | 2026-07-11 | ④ | Claude 读全文 transcript 按 5 维打分（hook strength / coherence / emotion / value density / payoff）选 8–12 段；切点吸附到词/句/静音点。我们有 forced alignment 数据，这套打分 rubric 可以照搬；但 NVENC/CUDA 假设要重写 |
| A10 | [`heygen-com/hyperframes`](https://github.com/heygen-com/hyperframes) `[M]` | 53,574 | Apache-2.0 | 2026-09-27 | ⑤ | 战略观察：**写 HTML/CSS 渲视频 vs Remotion React**。社区里 erduo、gbro、oh-my-cassette 都已支持 HF 路由。244 个 open issue 说明它仍在剧烈演化 → **只做 spike，绝不现在接入** |
| A11 | [`heygen-com/skills`](https://github.com/heygen-com/skills) `[M]` | 456 | MIT | 2026-07-14 | ⑥ | 数字人付费 API 路线的官方封装（avatar 创建 + v3 Video Agent） |
| A12 | [`Upload-Post/avatar-mix`](https://github.com/Upload-Post/avatar-mix) `[M]` | 130 | MIT | 2026-07-15 | ⑥ | 9:16 数字人 + HyperFrames 背景 + Hormozi 字幕 + 多平台发布，最接近我们业务的成品形态 |
| A13 | [`AgriciDaniel/lipnardo`](https://github.com/AgriciDaniel/lipnardo) `[M]` | 22 | NOASSERTION | 2026-04-18 | ⑥ | 纯 stdlib Python 的批量/模板/avatar 翻译；参考它的工程组织即可 |
| A14 | [`remotion-dev/skills`](https://github.com/remotion-dev/skills) `[M]` | 4,741 | 未标注 SPDX | 2026-09-25 | ① | **已安装但落后**（本地 `remotion-markup` v4.0.507 / 上游 v4.0.529）。这是全表唯一「零风险、立刻有收益」的动作 |
| A15 | [`runesleo/claude-video-kit`](https://github.com/runesleo/claude-video-kit) `[R]` | 120 | MIT | **2026-09-27（清单发布当天仍在推）** | ③ + 新增观察 | **2026-09-28 补入**：research brief / JSON script → 9:16 explainer，TTS + **faster-whisper 词级对齐** + Remotion，且自带 **pre-render review gate**（receipt 必须绑定到确切的 `script.json`，`fix`/`block`/缺失/过期 receipt **不能启动渲染**）。它是全表里唯一把「渲染前人工门禁」做成机器可校验凭证的，与我们的 MRL-3 / HITL 同源但实现更轻。TTS 双后端：Fish Audio API（默认，中文克隆好）或本地 IndexTTS2（需 GPU）→ 我们只需它的 gate 与 metadata 时序（`slide duration 由实际 WAV 长度算，不手数帧`），TTS 不换 |

### Tier B —— 只读方法学，取思路不取代码（10 个）

| 仓库 | ★ / 许可 / 最后 push | 读它的什么 |
| --- | --- | --- |
| [`hassancs91/claude-faceless-shorts-creator`](https://github.com/hassancs91/claude-faceless-shorts-creator) `[R]` · 269 · MIT · 2026-08-18 | 形态跟我们最像：无人出镜 + Remotion TSX + word-exact caption + **会复合增长的 SFX 素材库**。对照我们的 S.T.A.R.T.：它多了 `QUIZ / TWIST` 两拍，缺我们独有的证据核验环节 → 一次 beat grammar 对照便可判断要不要补 |
| [`Vincentwei1021/video-talkcraft`](https://github.com/Vincentwei1021/video-talkcraft) `[R]` · 1,259 · **PolyForm 非商用** · 2026-09-22 | 代码不能进产线，但三条工程手法值得抄：`voice_trim.py` 以文稿为真值剪真人录音、`runtime/` 单点 `node_modules` 软链（6 个工程 3.9GB → 一份 760MB）、`pipeline_state.mjs` 的状态由盘上产物自动推导 |
| [`FireRedTeam/FireRed-OpenStoryline`](https://github.com/FireRedTeam/FireRed-OpenStoryline) `[M]` · 3,442 · Apache-2.0 · 2026-07-31 | 「自然语言意图驱动剪辑」的交互范式，对 Stage 3 Step 6/8 的 scene↔assetNeed 表述有启发 |
| [`Agentchengfeng/chengfeng-videocut-skills`](https://github.com/Agentchengfeng/chengfeng-videocut-skills) `[M]` · 3,016 · Apache-2.0 · 2026-09-20 | 中文剪辑 agent 的工艺约定（与 A8 `video-recap-skills` 属同类写法，读一本即可） |
| [`calesthio/OpenMontage`](https://github.com/calesthio/OpenMontage) `[M]` · 61,517 · **AGPL-3.0** · 2026-09-06 | **只看目录结构做 taxonomy 灵感（12 产线 / 100+ 工具 / 700+ skill 怎么分层），不复制任何代码**——AGPL 传染性 |
| [`diffusionstudio/lottie`](https://github.com/diffusionstudio/lottie) `[M]` · 5,518 · MIT · 2026-07-25 | Logo / lower-third / CTA 组件资产化；我们的 `brand-system` CTA 场景可以走 Lottie 而非重新动效编码 |
| [`Alisa0808/vox-director`](https://github.com/Alisa0808/vox-director) `[M]` · 2,058 · MIT · 2026-08-11 | Vox 纸拼贴端到端成品流水线（Atlas Cloud + ffmpeg）；看它端到端的**阶段切分与审批点**设计 |
| [`liuliu-66-create/ll-video-decomposer`](https://github.com/liuliu-66-create/ll-video-decomposer) `[D]` · 24 · MIT · — | 「五层视频拆解」模板；**补全缺口③的最小实用件**，比 5★ 的 `viral-video-decomposer` 更结构化，优先读它 |
| [`wocha-xiaoli/video-shot-analysis-feishu`](https://github.com/wocha-xiaoli/video-shot-analysis-feishu) `[D]` · 36 · MIT · 2026-04-25 | 逐镜头抽帧分析 → 倒推分镜；与我们 `keyframe-extraction-research` 议题直接相邻 |
| [`louisedesadeleer/cut-video`](https://github.com/louisedesadeleer/cut-video) `[M]` · 101 · MIT · 2026-07-09 | Long recordings 去静音/语气词（保留笑声与喜剧停顿）；我们目前只有 ffmpeg `silenceremove` 静态阈值，只有当要比静态阈值更「听得懂」时才需要它 |

### Tier C —— 整类跳过（156 个），理由打包

| 类别 | 数量 | 跳过/降档理由 |
| --- | --- | --- |
| 📣 Promo & demos | 26（A1 已单独抽出） | 产品发布片/广告/App Store 预览为主，叙事对象是「产品卖点」，我们是「事实 + 因果」；保存 `iart-ai/ad-video-skills` 的 A/B 批量变体思路备用 |
| 🎓 Explainers | 32 | 绝大多数是 Vox 拼贴变体 + Manim/3Blue1Brown 数学教学；真正的差异资产（Vox 样式替换缺口②）已由 A6/A8/ B7 覆盖 |
| ✂️ Editing | 35 | 我们不做人工 NLE：4 个 Adobe Premiere/After Effects MCP（`hetpatel-11` / `leancoderkavy` / `ayushozha` / `JUNKDOGE-JOE`）与 App Store 预览类（`appshot`）全部出局；剩余 utility（去停顿）已在 B10 |
| 📱 Shorts & social | 19 | 主要是 faceless YouTube Shorts 工厂，能力面被我们自己覆盖；只抽了 B1 + A2/A3 的语法即可 |
| 📖 Stories & animation | 13 | AI 短剧 / 手绘日记 / 古诗词国风，叙事形态与新闻无关；个别技法（蜡笔/手绘）与 `brand-system` 的视觉符号体系不符 |
| 🎞 Motion graphics | 11 | 已抽 Lottie（B6）、纸拼贴 B-roll（A6/A7）；剩余是地域/社交 GIF 与 logo 动画包，我们的品牌一致性约束反而排斥这些模板 |
| 🧑‍💼 Avatars | 4 | 全数进 Tier A，**但同时要给 §4 P6 的答案**——它们全是 HeyGen 付费路线，救不了本地 xfuser |
| 📝 Scripts & learning | 9 | 抽了 B8/B9 两个拉片模板；其余是「起号方法论」与 YouTube growth 套件，与本项目业务无关 |
| 🎵 Music videos | 2 | 无业务相关性（我们的 BGM 是 CC-BY 池 + TikTok trending sound 二选一） |
| 🧱 Frameworks | 29 | 抽出 hyperframes（A10）、remotion-dev/skills（A14）、OpenMontage（B5）；余下的 Hermes/HyperFrames 启动脚手架多数是同一模式的重述 |

---

## §4 研究顺序（每步都有完成判据）

> 纪律：每一步结束必须产出**书面证据**（本文件或新的 L2 报告的行 / 一个 GitHub issue），否则不算完成。
> 落地前必读：`docs/agents/proposal-review.md` + `docs/tools-catalog.md` 的工具准入；第三方 skill 一律**符号链接**到 `~/.agents/skills/`（禁止拷贝，见 `docs/installed-skills.md` 更新协议）。

**P0 · 许可与依赖终检（约 1h，不动代码）**
做什么：把 Tier A/B 的每一行补齐 `license / last-push / 是否付费 API 硬绑定 / 是否需 CUDA` 四列（Tier A 的 API 部分今日已跑完，仍需补的是 `video-recap-skills` 付费依赖的替换成本估算、`iart-ai` 四包的 SKILL.md 抽样）。
完成判据：表内无 `[D]` 残留的 Tier A 条目；每个 Tier A 写明「能本地化的前提」。

**P1 · 补 `remotion-dev/skills`（约 30min，唯一已知正向收益）**
做什么：本地 `remotion-markup` v4.0.507 → 上游 v4.0.529，diff 后按上游更新，并在 Remotion Studio 渲 1 帧冒烟。
完成判据：`version` 与上游一致，且任取一条既有 pipeline 复跑，渲染结果无回归。

**P1.5 · A15 的渲染前凭证化门禁（约 2h，2026-09-28 补入）**
做什么：读 [`runesleo/claude-video-kit`](https://github.com/runesleo/claude-video-kit) 的 receipt 机制与 `docs/DESIGN.md`——它的六项 review 检查要求「独立复核 receipt 必须绑定到确切的 `script.json`，否则不能启动渲染」。对照我们 `docs/content-pipeline.md` 的 HITL 与 MRL-3。
完成判据：一张对照表（它的 6 项检查 vs 我们的 gate 项，标「我们有/我们没有/我们有但不可机械校验」），并给出结论——**要不要把 HITL 从文档约定升级为盘上可校验凭证**。注意：我们当前 HITL 是**文档约定**（agent 自觉遵守），它是**机器强制**（进程拒绝渲染），这个差别本身就是收益点。

**P2 · iart-ai 语法包抽样（半天）**
做什么：只读 `short-form-video`、`caption-animation`、`explainer-video-skills`、`data-animation-skills` 的 SKILL.md。
完成判据：产出一张对照表——它的 retention grammar 条目 vs 我们 MRL-2 的 W7/W8/W9 与 `docs/tiktok/tiktok-hook-patterns-best-practices.md` 的 P1–P6；表上标出「我们有/我们没有/我们有但不可机械检查」三态，并给出 ≤3 条建议转入机械检查的候选。

**P3 · 镜头卡与 B-roll 工艺（半天）**
做什么：判断 A1（Apache-2.0，可商用）的 152 张镜头配方卡是否值得抽成我们的内部 visual taxonomy；同时读 A5 的语义分镜与「改一镜只重渲受影响镜头」的缓存语义。
完成判据：写出「是否新增 `mediaStrategy: collage` 分支」的建议与代价；若建议是「是」，同时给出它在 `scene-data` 的字段形态。

**P4 · 抽象视觉计划 B 实测（半天，含一次真实试跑）**
做什么：按 A6（MIT）在本机跑一次竖屏片段，验证它「无需 image model」的声明；本机已有 Qwen3.8 VLM + ffmpeg，不再额外装依赖。
完成判据：有一个可观看的 10–20s 产物 + 一份「本机阻抗/依赖」清单；若它无法套上 `brand-system` 的 brand tokens，直接出 No-Go。

**P5 · 二创路线 Go/No-Go（约 1 天）**
做什么：读 A8 + A9 + B8；回答两个问题——(a) 要不要在 Stage 0 增加「参考爆款视频」输入源；(b) 要不要开「长视频 → 我们的解释类短视频」第二条产线。
完成判据：一份书面结论，含**缺口映射与预估成本**；Go 则同时新开一个 tracking issue（按 `docs/agents/issue-tracker.md`），No-Go 则写明触发条件（什么情况下重开评估）。

**P6 · 数字人 fallback 决策（需你授权付费口径）**
做什么：把 A11/A12/A13 三条 HeyGen API 路线的单价、肖像/授权条款，与我们本地路线的卡点（xfuser 依赖）并列。
完成判据：一个清楚的二选一建议。**这一步我不自行开口子——是否启用付费头像 API 是你的决策。**

**P7 · HyperFrames 战略观察（spike，不接入）**
做什么：仅做一次 A10 的 hello-world + 看它的 issues 密度。
完成判据：在本文追加一段判断——「什么条件下我们会认真考虑第二个渲染内核」，并与 `docs/video-production-runbook.md` 的渲染章节互链。**任何结论都不改变 Remotion 的现有主体地位。**

---

## §5 与你的自筛清单对账（2026-09-28）

你的那份是**按名字对口度扫全表**，我这份是**按「每个缺口只留一个代表」筛**。两个选择函数不同，输出必然不同；所以差异不等于谁对谁错，要看每条差异能不能落成动作。

### 5.1 共识（两份都判高相关，可直接推进）

| Repo | 我的位置 |
| --- | --- |
| `zenstory-ai/video-recap-skills` | A8 |
| `iart-ai/tiktok-video-skills` | A3 |
| `erduo1998-cell/erduo-broll-loop-engineering` | A5 |
| `remotion-dev/skills` | A14 |
| `iart-ai/motion-skills`（含 `explainer-video-skills`） | A2 |
| `pyang5166/gbro-collage-broll` | A6 |
| `iart-ai/data-animation-skills` | A4 |
| `AgriciDaniel/claude-shorts` | A9 |
| `hassancs91/claude-faceless-shorts-creator` | B（beat grammar 对照） |
| `wocha-xiaoli/video-shot-analysis-feishu` / `liuliu-66-create/ll-video-decomposer` | B（缺口③候选） |
| `calesthio/OpenMontage` / `heygen-com/hyperframes` | B / A10 |

### 5.2 我漏了、确实该补的（2 个，已回写）

| Repo | 处置 | 理由 |
| --- | --- | --- |
| `runesleo/claude-video-kit` · 120★ · MIT · **push 2026-09-27（清单发布当天仍在推）** | **补为 A15** | 我没扫到它，是我的遗漏——它 9:16 explainer + 词级对齐 + Remotion 的形态跟我们高度同构，更有价值的是**渲染前凭证化门禁**（见 P1.5）。这是本次对账唯一真正的收获 |
| `znyupup/knowledge-explainer-skill` · 45★ · MIT · 2026-04-29 | **Tier B 只读** | markdown → Remotion **动画/物理仿真/数据可视化**（双摆、对折 42 次等真实 showcase），正对缺口①里「数据可视化动画」那半边。但 5 个月未 push，按口径 4 降为只读 |

### 5.3 分歧（判级不同，但根因清楚）

| Repo | 你 | 我 | 分歧根因 / 处置 |
| --- | --- | --- | --- |
| `Vincentwei1021/video-talkcraft`（1.2k★） | A | B | **分歧在许可证，不在相关度**。它 109 张 motion 卡 + 逐词 voiceover sync 确实对口，但 **PolyForm 非商用** → 代码不进产线。收它的方法学，不收代码 |
| `sharon-laicc/viral-video-decomposer`（5★） | A | 让位给 `ll-video-decomposer`（24★） | 两个都极小，**P5 阶段顺手各扫一遍（<30min）**，不在筛选阶段分高下。我按「结构化程度」选，你按「名字对口」选 |
| `ops120/video-recap-skills-plus`（39★） | B | 跳过 | 硬绑小米 MiMo 付费 key，且 2026-07-09 后未更。唯一增量是**剪映草稿导出**，我们不做人工精修产线 → 无落点 |
| `Yuuhann1999/codex-storyboard`（345★ · MIT · 2026-09-15） | B | **只读数据模型，不安装** | 它是 Codex 插件 / MCP 形态，与我们的 agent-tool agnostic 约束冲突；但它的**分镜表字段（A-ROLL / B-ROLL / 素材类型 / 生成方式）+ 生成结果自动回填**值得抽出来对照我们的 `scene-data` |
| `naive-kun/naive-video-skill`（130★ · MIT） | B | 只读一环 | 「导师式一次问一个问题」的交互对我们全自动化管线无用；但它的**静态关键帧检查**与我们 MRL-3 帧审计同类，值得对照 |

### 5.4 你列中相关、我判跳过的（逐条理由）

| Repo · 实测 | 跳过理由 |
| --- | --- |
| `Liamrjohnston/remotion-motion-graphics-skill` · 73 · MIT · 2026-07-24 | 与 A2 / A14 完全重叠；组件库性质，扫 A14 时顺带看即可 |
| `jhartquist/claude-remotion-kickstart` · 120 · MIT · **2025-12-09** | 10 个月未更，跨了 Remotion 4，脚手架类不值得考古 |
| `vibe-motion/remotion-starter` · 7 · MIT | 7★，信息量已被上面的覆盖 |
| `znyupup/ai-video-editing-skill` · 135 · MIT · 2026-04-27 | vlog 自动剪辑，硬绑付费 Vision API，且停更 5 个月 |
| `wyuzhi/qisi-video-remix` · 111 · MIT · 2026-09-11 | 「参考视频 → 新故事 → 提示词」是**创意改编**，不是 #300 要的结构化反推；属我们明确不做的生成式彩票 |
| `coding-ax/docvideoer` · 5 · MIT · 2026-05-05 | 5★ + 停更 5 个月，同类已被 A8 / `znyupup` 覆盖 |
| `jackjls/jtxvideo-skill` · 5 · MIT | 5★ |
| `jincheng2026/jc-remotion-skills` · 14 · **NOASSERTION** | 许可不明 + 14★，按口径 1 直接出局 |
| `cclank/lanshu-html2video-skill` · 15 · MIT | 15★，且「网页 → 视频」与我们的内容源不同（我们是结构化 scene-data） |

### 5.5 对账净增量

真正新增的只有 **2 个动作**（A15 收、`znyupup/knowledge-explainer-skill` 只读）+ **1 个顺手扫**（`viral-video-decomposer`）。其余差异全部可以在筛选阶段就结案，不需要额外研究时间。

---

## §6 我们 vs 社区普遍做法：ElevenLabs 那条路，我们走的是同一条吗？

**结论：骨架同（TTS → 对齐 → 字幕 → Remotion 渲染），但 TTS 这一环我们是刻意不走 ElevenLabs 的，且这不是落后。**

**证据**：全仓搜 `elevenlabs`（含 `scripts` / `docs` / `src`，排除 vendored 的 `docs/research/MoneyPrinterTurbo`）**业务代码里只有 1 处命中**——`scripts/short-video/lib/tts/pacing.mjs:27` 的一行注释：

> `Everything clamps to [1.0, MAX_TTS_SPEED]: 1.5x native loses 36% spectral flux (transient smearing, STFT-measured); ElevenLabs' product ceiling is 1.2.`

**我们是把它当反面参照引用，不是调用它。** 没有 key、没有 SDK、没有网络出口。

| 维度 | 我们（`docs/video-production-runbook.md` §TTS Engine） | 社区普遍做法 |
| --- | --- | --- |
| 引擎 | **CosyVoice3-Kaggle-CUDA（默认，ADR-0019，Apache-2.0，免费 30h/周）** → CosyVoice3-MLX 本地兜底 → F5-TTS-MLX → Qwen3-TTS → edge-tts → macOS `say` | ElevenLabs API（付费，按字符） |
| 成本 | 边际成本 0（Kaggle 免费档 / 本地 M2 Pro） | 每集按字符计费，量大了是持续成本 |
| 数据出口 | 文稿与音频不出本机 | 文稿与声音样本发往第三方 |
| 对齐 | **wav2vec2 forced alignment**（`text-align.py`）产出逐词时间戳，驱动 `\k` karaoke ASS | 多数是 Whisper 句/段级，或直接按估算时长铺字幕 |
| 质量控制 | 双轨文本（`ttsText` spoken vs display）+ **TTS Quality Gate 自愈**（#234）+ 按 `(engine, engine.info, text)` 缓存 + Max Effort Rule（本地模型必须满算力） | 生成一次，不验证，不满意就重跑 |
| 语速 | 按 STFT 实测把 speed clamp 在 `[1.0, MAX_TTS_SPEED]`，理由是 1.5x 损失 36% 频谱通量 | 依赖厂商上限（ElevenLabs 1.2x） |
| 声音 | ref-audio 克隆（24 kHz mono 规范） | 同样支持克隆 —— **这一条两边相同** |

所以要向社区学的**不是 TTS**。本次对账真正提醒我的是另一件事：**他们在「渲染前门禁」上比我们工程化**（A15 的 receipt 机制是机器强制，我们的 HITL 还只是文档约定）。

---

## §7 证据边界（写清楚了才好复核）

- `[R]` 项（读过 README 片段）：`iart-ai/tiktok-video-skills`、`erduo-broll-loop-engineering`、`video-recap-skills`、`claude-faceless-shorts-creator`、`video-talkcraft`、`claude-shorts`、`runesleo/claude-video-kit`、`naive-video-skill`、`codex-storyboard`、`qisi-video-remix`、`ops120/video-recap-skills-plus`、`znyupup/knowledge-explainer-skill`、`zhuyansen/awesome-claude-video-skills` 全文。
- `[M]` 项：Tier A/B 中所有星数/许可/push 时间为今日 API 实测；`license.spdx_id` 为 `-` 的表示 GitHub 未识别（如 `remotion-dev/skills`），这类必须回看仓库内 LICENSE 文件，才能支撑落地结论。
- `[D]` 项：`ll-video-decomposer`、`video-shot-analysis-feishu` 只依据清单描述 → **列入 B 是「候选」，不是结论**，P5 阶段先补齐这一行 的证据。
- 未验证：作者 X 长文里的主观评价；列表自己的「安全评级」（那是 Agent Skills Hub 对 README 的评级，不是我们自己的投入产出审计，与我们采用的判定口径无关）。
