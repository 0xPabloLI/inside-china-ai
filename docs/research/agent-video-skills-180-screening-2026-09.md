# Agent 视频 Skill 开源生态筛选（180 库 × 我们的管线）

> L2 研究依据。对象：推文 2026-09-27 指向、当天开源的 180 个「让 Claude Code / Codex 做视频」的 skill 仓库。
> 目的：从 180 个里**选出有用的内容**，逐个**拆解并解释对我们哪里有用**（五问报告，见 §4）。
> **怎么应用到 code space 是另一件事**：研究阶段只产出报告；任何安装 / 改码 / 改管线动作单独讨论、单独批准（§4.0 纪律）。
> 本文中所有星数 / 许可证 / 最后提交时间均为 2026-09-28 用 GitHub REST API 实测值，不抄 README 数字。
>
> **并行产出提示**：`docs/tools-catalog.md` §「视频 Skill 储备」由**另一 session 以同一份清单**产出（A/B/C/D 速览 + 安全标记，工具准入视角）。本文是研究层：**缺口映射 → 研究顺序 → 完成判据 → 证据强度**。两者互补，不互相替代；若结论冲突，以本文为准——本文每个数字都是当日 API 实测，速览表里的星数来自榜单快照。

## TL;DR

- 这份清单对我们**不是「抄整套 pipeline」的价值**——选题、脚本、TTS 质量控制、逐词卡拉 OK 字幕、验证闭锁这些我们已有且更细；它们的普遍做法是 ElevenLabs + Remotion + ffmpeg 三件套，对我们的场景属于降级。
- 真正的价值在 **6 个具体缺口**：① 镜头/动效语法库的广度；② 无真实素材时的抽象视觉计划 B；③ 「看懂别人的视频 → 结构化反推」的 rubric；④ 已成片的时间级选段/修剪；⑤ Remotion vs HyperFrames 的长期内核判断；⑥ 数字人的付费 fallback。
- 研究计划 **v2（2026-09-28 你定版）**：Tier A **15 个全部出五问报告**、**「装来用」档保留**、归堆增删由我定（`codex-storyboard` 并入竞品反推堆）。研究按**内容归堆**推进而非按仓库推进，**竞品反推堆你点名最优先**。顺序与判据见 §4；报告落点 §8。
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
| 渲染/文本安全 | Remotion + TextGate 硬门 + `remotion-*` skill 已安装 | 本地 skill 落后 22 个 patch 的差距**已于 2026-09-28 同步补齐**（见 §4.5） |
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
| A2 | [`iart-ai/motion-skills`](https://github.com/iart-ai/motion-skills) `[M]` | 516 | MIT | 2026-09-23 | ①③ | **索引仓**（本体 9 文件；53 skill 实体在 16 个分仓，R2.2 更正）；分仓按需读：`motion-design-skills`（9，含 shot-composition/beat-sync）、`kinetic-typography-skills`、`explainer-video-skills` |
| A3 | [`iart-ai/tiktok-video-skills`](https://github.com/iart-ai/tiktok-video-skills) `[R]` | 11 | MIT | 2026-06-22 | ③ | 它把 hook → retention → loop 写成机械语法（pattern interrupt、safe-area、per-word pop）——**正好是我们 MRL-2 W7/W8 想要机械化的东西**；缺点是停更 3 个月 |
| A4 | [`iart-ai/data-animation-skills`](https://github.com/iart-ai/data-animation-skills) `[M]` | 6 | MIT | 2026-06-22 | ① | CSV → 「每帧数字都准确」的动画图表；我们文章的 Widget `dataPoints` 进视频一直靠静态图，这是现成对照物 |
| A5 | [`erduo1998-cell/erduo-broll-loop-engineering`](https://github.com/erduo1998-cell/erduo-broll-loop-engineering) `[R]` | 203 | MIT | 2026-09-21 | ①⑤ | 三条可抄工艺：**按语义分镜而非一句字幕一镜**、改一镜只重渲受影响镜头（我们的 TTS 缓存已有类似思想，媒体轨没有）、独立 Reviewer 看真实画面。**它的 README 自曝 Remotion 路线翻过车**（20/20 技术通过但视觉不合格），所以只抄约束，别照搬它的双后端路由 |
| A6 | [`pyang5166/gbro-collage-broll`](https://github.com/pyang5166/gbro-collage-broll) `[M]` | 1,311 | MIT | 2026-07-15 | ② | 半调纸拼贴 B-roll，三闸门审批设计。~~宣称不依赖 image model~~ **R4 已证伪**：绑 GEMINI_API_KEY 付费视频模型 + Codex image_gen（见 R4.1） |
| A7 | [`MegaTroll222/VOX-COLLAGE-BROLL`](https://github.com/MegaTroll222/VOX-COLLAGE-BROLL) `[M]` | 212 | NOASSERTION | 2026-07-17 | ② | A6 的英文改编版；只作为「抽帧/质疑清单」读，代码不进产线（许可不明） |
| A8 | [`zenstory-ai/video-recap-skills`](https://github.com/zenstory-ai/video-recap-skills) `[R]` | 537 | MIT | 2026-09-27 | ③④ | 「看懂别人的视频 → 中文解说 → 成片」全链路 + `timeline.json` 可导出剪映；**最有价值的是它的 `recap_story_plan.json` 语法**（观众承诺 / POV / 戏剧问题 / beat），可直接改成我们 review 自己成片的 rubric。硬依赖：小米 MiMo API key；本地化需换成 Qwen3.8 VLM + whisper 双轨（本机两侧组件都已具备） |
| A9 | [`AgriciDaniel/claude-shorts`](https://github.com/AgriciDaniel/claude-shorts) `[R]` | 217 | MIT | 2026-07-11 | ④ | Claude 读全文 transcript 按 5 维打分（hook strength / coherence / emotion / value density / payoff）选 8–12 段；切点吸附到词/句/静音点。我们有 forced alignment 数据，这套打分 rubric 可以照搬；但 NVENC/CUDA 假设要重写 |
| A10 | [`heygen-com/hyperframes`](https://github.com/heygen-com/hyperframes) `[M]` | 53,574 | Apache-2.0 | 2026-09-27 | ⑤ | 战略观察：**写 HTML/CSS 渲视频 vs Remotion React**。社区里 erduo、gbro、oh-my-cassette 都已支持 HF 路由。244 个 open issue 说明它仍在剧烈演化 → **只做 spike，绝不现在接入** |
| A11 | [`heygen-com/skills`](https://github.com/heygen-com/skills) `[M]` | 456 | MIT | 2026-07-14 | ⑥ | 数字人付费 API 路线的官方封装（avatar 创建 + v3 Video Agent） |
| A12 | [`Upload-Post/avatar-mix`](https://github.com/Upload-Post/avatar-mix) `[M]` | 130 | MIT | 2026-07-15 | ⑥ | 9:16 数字人 + HyperFrames 背景 + Hormozi 字幕 + 多平台发布，最接近我们业务的成品形态 |
| A13 | [`AgriciDaniel/lipnardo`](https://github.com/AgriciDaniel/lipnardo) `[M]` | 22 | NOASSERTION | 2026-04-18 | ⑥ | 纯 stdlib Python 的批量/模板/avatar 翻译；参考它的工程组织即可 |
| A14 | [`remotion-dev/skills`](https://github.com/remotion-dev/skills) `[M]` | 4,741 | 未标注 SPDX | 2026-09-25 | ① | Remotion 官方 skills（12 个包）。**维护性条目**：本地 `remotion-markup` 已于 2026-09-28 同步到上游 v4.0.529（逐字复制上游，未做任何改动；旧版归档 `~/.agents/skills-archive-20260928-remotion/`） |
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
| 🧑‍💼 Avatars | 4 | 全数进 Tier A，**但同时要给 §4 R7 的答案**——它们全是 HeyGen 付费路线，救不了本地 xfuser |
| 📝 Scripts & learning | 9 | 抽了 B8/B9 两个拉片模板；其余是「起号方法论」与 YouTube growth 套件，与本项目业务无关 |
| 🎵 Music videos | 2 | 无业务相关性（我们的 BGM 是 CC-BY 池 + TikTok trending sound 二选一） |
| 🧱 Frameworks | 29 | 抽出 hyperframes（A10）、remotion-dev/skills（A14）、OpenMontage（B5）；余下的 Hermes/HyperFrames 启动脚手架多数是同一模式的重述 |

---

## §4 研究计划 v2：按内容拆解（2026-09-28 你定版）

> 本计划**只产出报告**。任何应用动作（装 skill、改 lib、改管线）不在此计划内，单独讨论、单独批准。
> 每一轮结束必须产出**书面证据**（§8 的五问报告行），否则不算完成。

### 4.0 应用三档（纪律）

| 档位 | 含义 | 是否需要批准 |
| --- | --- | --- |
| **读思路** | 只读 README/SKILL.md/源码，借鉴方法写进报告 | 不需要（默认档） |
| **抄结构** | 搬数据模型 / 字段设计 / schema 形态（不搬代码），写成对照表 | 报告里给建议，实施前单独批 |
| **装来用** | 符号链接装进 `~/.agents/skills/`（禁止拷贝） | **保留此档，但每一例单独提请批准** + 走 `docs/tools-catalog.md` 工具准入与安全审计 |

### 4.1 五问模板（Tier A 15 个，每个一份）

1. **它是什么** —— 一段话，含形态（skill / 脚手架 / 数据集）与依赖。
2. **里面具体有什么可拆的** —— 细到文件名 / 机制 / schema 级，注明证据等级 `[R]/[M]/[D]`。
3. **对我们哪个环节有用** —— 映射到 Stage 0–5 与缺口①–⑥；说清「用了它之后我们哪个动作会变」。
4. **怎么用** —— 三档取其一，默认「读思路」；升档必须给出理由与代价。
5. **应用代价** —— 许可证 / 付费 API 绑定 / CUDA / 迁移工作量；以及**不采用的话我们失去什么**。

### 4.2 内容归堆（10 堆；R1 是你点名的最优先）

| 轮次 | 堆 | 缺口 | Repo（Tier A 加粗） | 预判能拆出的内容 |
| --- | --- | --- | --- | --- |
| **R1** | **竞品反推** | ③ | **A8 `video-recap-skills`**；`ll-video-decomposer`、`viral-video-decomposer`、`wocha-xiaoli`、`codex-storyboard`（只读数据模型） | 拉片模板 + `recap_story_plan.json` schema（观众承诺 / POV / beat）→ 改造成我们 review 成片与对标竞品的 rubric；`codex-storyboard` 的分镜表字段（A-ROLL/B-ROLL/素材类型/生成方式 + 结果回填）作为竞品拆解记录 schema 的参照 |
| R2 | 镜头 / 视觉语法 | ① | **A1 `video-shotcraft`**、**A2 `motion-skills`**（索引仓，按需读分仓）、**A4 `data-animation-skills`**；`knowledge-explainer-skill`、B6 `lottie`、B5 `OpenMontage`（仅目录学） | 157 张镜头配方卡（demo 实测 218 个 .tsx / 10 类）→ `mediaStrategy` 受控词表候选；数据动画「帧是唯一时钟」与 fail-loud 校验；CTA/Lottie 资产化 |
| R3 | 平台留存语法 | ③ | **A3 `tiktok-video-skills`**；B1 `faceless-shorts-creator` | hook→retention→loop 机械语法 vs 我们 MRL-2 W7/W8/W9 与 P1–P6 的三态对照表 |
| R4 | 无素材计划 B | ② | **A6 `gbro-collage-broll`**、**A7 `VOX-COLLAGE-BROLL`**；B7 `vox-director`（阶段切分） | 三闸门审批协议 + 隐喻命题模板；**实测三家全绑付费生成 API**（更正见 R4.1）→ collage 裁决见 R4.4 |
| R5 | 渲染前门禁 | — | **A15 `claude-video-kit`** | receipt 机制 vs 我们 HITL/MRL-3 的对照表（「有 / 没有 / 有但不可机械校验」），结论：要不要把 HITL 升级为盘上凭证 |
| R6 | 成片选段与剪辑工程 | ④ | **A9 `claude-shorts`**、**A5 `erduo-broll`**；B2 `talkcraft`（仅手法）、B3 `OpenStoryline`、B4 `chengfeng`、B10 `cut-video` | 5 维选段 rubric（套 forced alignment 数据）；语义分镜 + 局部重渲缓存语义；以文稿为真值剪录音 |
| R7 | 数字人 fallback | ⑥ | **A11 `heygen-com/skills`**、**A12 `avatar-mix`**、**A13 `lipnardo`** | 三条付费路线单价 / 肖像授权条款 vs 本地 xfuser 卡点；**开不开口子是你的决策** |
| R8 | 渲染内核观察 | ⑤ | **A10 `hyperframes`** | spike + issues 密度 → 「什么条件下考虑第二内核」一段判断；**不改变 Remotion 主体** |
| R0 | 官方同步（已完成） | ① | **A14 `remotion-dev/skills`** | 见 §4.5 |
| — | 杂项 | — | B7 `vox-director` 并入 R4；B8 并入 R1；B10 并入 R6 | — |

### 4.3 轮次顺序与完成判据

顺序：**R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8**（R0 已完成）。R1–R4 全程只读；R8 含一次 hello-world spike；其余不含任何执行。

| 轮次 | 完成判据 |
| --- | --- |
| R1 | 每个 repo 一份五问报告；额外产出「竞品拆解记录 schema 草案」（字段级，供 #300 讨论，**不建表**） |
| R2 | 五问报告 ×4（A1/A2/A4/knowledge-explainer）+ 「是否新增 `mediaStrategy: collage` 分支」的建议与 `scene-data` 字段形态 |
| R3 | 一张 retention grammar 三态对照表 + ≤3 条建议转机械检查的候选 |
| R4 | A6 五问报告 + 本机阻抗清单；若无法套 `brand-system` brand tokens，直接 No-Go |
| R5 | R5 对照表 + 「HITL 是否升级为盘上凭证」的书面结论（含代价：跑批会被卡、receipt 写入权归属） |
| R6 | 五问报告 ×2（A9/A5）+ 「是否开二创产线」Go/No-Go 建议（Go 则另开 tracking issue，No-Go 写明重开条件） |
| R7 | 三条路线成本并列表 + 二选一建议；**不代做决策** |
| R8 | 「第二内核条件」判断一段，与 `docs/video-production-runbook.md` 渲染章节互链 |

### 4.4 报告落点

所有五问报告追加到 **§8**，按堆分小节，一条 repo 一小节。报告里所有「抄结构 / 装来用」建议**只写不做**，等你在 §8 上逐条批。

### 4.5 已完成 / 已变更记录

- **2026-09-28 · A14 同步**：`remotion-markup` 4.0.507 → 4.0.529（Remotion 官方上游，逐字复制，未做任何改动；旧版归档 `~/.agents/skills-archive-20260928-remotion/`）。**偏离原 P1 判据说明**：未跑渲染冒烟——该 skill 是纯文档（.md + assets），不触碰运行时，回归风险为零。此次执行先于本计划 v2 定稿，属授权误读，已写入会话日志；后续轮次不再含此类动作。
- **2026-09-28 · R5 前置讨论**：渲染前门禁的两种形态（文档约定 vs 凭证化 receipt）已与用户聊清，正式对照表待 R5 产出。
- **2026-09-28 · R1 完成**：五问报告 ×5 全部 `[R]` 级（直读各仓库 schema/模板/示例一手文件）+ R1.6 竞品拆解记录 schema 草案（字段级）。零实现；三条「抄结构」候选进入 §8 R1 待批清单，逐条等用户批。R1 五仓当日实测均为 MIT。
- **2026-09-28 · R1 待批清单获批**：三条全部批准（草案方向 / #300 格式起点 / 精度诚实声明意向）。注意边界：贴 #300 是远端 Issue 写操作、改 alignment 文档是另一处文档改动，**均另行单独请示后才动**。
- **2026-09-28 · R2 完成**：五问报告 ×4 全部 `[R]` 级 + R2.5 `mediaStrategy` 受控词表建议（讨论稿）。**一处更正**：A2 `motion-skills` 是索引仓（9 文件），53 skill 实体在 16 个独立分仓——§3 Tier A 表对它的描述据此修正为"索引 + 分仓"。`collage` 分支裁决推迟到 R4（证据归属）。四条「抄结构」候选进入 R2 待批清单。
- **2026-09-28 · #300 已贴**：R1.6 草案全文内联贴入 issue #300（评论 `5865492050`，用户授权），附 3 个待讨论问题；等社区侧/后续排期回收反馈。
- **2026-09-28 · R3 完成**：五问报告 ×2（A3 / B1）+ 三态对照表 12 行 + ≤3 条机械检查候选（dead air / hook 前置 / interrupt 密度，全部只是建议）。**一处判级更正**：我们的 MRL-2 实为机器强制（`scene-rules.mjs`），不是筛选阶段假设的"文档约定"——W7/W8/W9 已机械检查，社区语法 12 条中 4 条我们已机械覆盖、4 条缺失、4 条部分或人工。
- **2026-09-28 · R4–R8 一轮完成（用户授权批量推进）**：五轮全部 `[R]` 级一手取证。**两处事实更正**：① gbro「无需 image model」不成立（SKILL.md 实文：默认 `gemini-omni-flash-preview` 付费按量 + Gate 2 依赖 Codex 内置 image_gen）；② B3 清单链接 `zenstory-ai/FireRed-OpenStoryline` 已 404，现址 `FireRedTeam/FireRed-OpenStoryline`（3,448★）。**悬案裁决**：`mediaStrategy: collage` 有条件 Go（R4.4）。R5 交付 11 项对照表 + 发布入口 receipt 试点建议（执行另批）；R7 只给成本事实与触发条件，**数字人开口子留给用户**；R8 给出第二内核四条触发条件，spike 实测留执行。累计待批 ≈ 11 条，全部执行时再批。

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
| `runesleo/claude-video-kit` · 120★ · MIT · **push 2026-09-27（清单发布当天仍在推）** | **补为 A15** | 我没扫到它，是我的遗漏——它 9:16 explainer + 词级对齐 + Remotion 的形态跟我们高度同构，更有价值的是**渲染前凭证化门禁**（见 §4 R5）。这是本次对账唯一真正的收获 |
| `znyupup/knowledge-explainer-skill` · 45★ · MIT · 2026-04-29 | **Tier B 只读** | markdown → Remotion **动画/物理仿真/数据可视化**（双摆、对折 42 次等真实 showcase），正对缺口①里「数据可视化动画」那半边。但 5 个月未 push，按口径 4 降为只读 |

### 5.3 分歧（判级不同，但根因清楚）

| Repo | 你 | 我 | 分歧根因 / 处置 |
| --- | --- | --- | --- |
| `Vincentwei1021/video-talkcraft`（1.2k★） | A | B | **分歧在许可证，不在相关度**。它 109 张 motion 卡 + 逐词 voiceover sync 确实对口，但 **PolyForm 非商用** → 代码不进产线。收它的方法学，不收代码 |
| `sharon-laicc/viral-video-decomposer`（5★） | A | 让位给 `ll-video-decomposer`（24★） | 两个都极小，**R1 竞品反推轮顺手各扫一遍（<30min）**，不在筛选阶段分高下。我按「结构化程度」选，你按「名字对口」选 |
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

- `[R]` 项（读过一手文件）：`iart-ai/tiktok-video-skills`、`erduo-broll-loop-engineering`、`video-recap-skills`、`claude-faceless-shorts-creator`、`video-talkcraft`、`claude-shorts`（scoring-rubric 全文）、`runesleo/claude-video-kit`（pre-render-review 全文）、`naive-video-skill`、`codex-storyboard`、`qisi-video-remix`、`ops120/video-recap-skills-plus`、`znyupup/knowledge-explainer-skill`、`zhuyansen/awesome-claude-video-skills` 全文；R1–R8 各仓核心文件（SKILL.md / DESIGN / rubric / 价格表 / 契约）——明细见各轮报告。
- `[M]` 项：Tier A/B 中所有星数/许可/push 时间为今日 API 实测；`license.spdx_id` 为 `-` 的表示 GitHub 未识别（如 `remotion-dev/skills`），这类必须回看仓库内 LICENSE 文件，才能支撑落地结论。R4/R6 中标「仓库含 LICENSE 文件，SPDX 未核」的（gbro / VOX-COLLAGE / vox-director / cut-video / claude-shorts），实施前同样先核 SPDX。
- **R4–R8 的新更正**：① `gbro-collage-broll` 的「无需 image model」为 README 宣传口径，SKILL.md 实文推翻（付费 Gemini 视频模型 + Codex image_gen 依赖）；② `FireRed-OpenStoryline` 清单链接 404，现址 `FireRedTeam/`（3,448★）；③ `chengfeng-videocut-skills` 为 MCP 插件形态，与 agent-tool agnostic 冲突，已结案跳过。
- 未验证：作者 X 长文里的主观评价；列表自己的「安全评级」（那是 Agent Skills Hub 对 README 的评级，不是我们自己的投入产出审计，与我们采用的判定口径无关）。

---

## §8 五问研究记录（按堆追加，报告只写不做）

> 每轮研究把五问报告追加到这里，一条 repo 一小节。报告中的「抄结构 / 装来用」建议**只写不做**，等你逐条批。

### R1 竞品反推（2026-09-28 完成）

> 研究方法：全程只读，经 GitHub API 直读各仓库的关键文件（非 README 转述）。五个仓库当日全部实测 `MIT` 许可、未归档。星数/`pushed_at` 为当日 API 实测值。

#### R1.1 A8 `zenstory-ai/video-recap-skills`（539★，MIT，push 2026-09-28）

1. **它是什么**：把长视频（剧集/电影）拆成结构化理解、再正向产出中文解说 recap 成片的 4-skill 管线（`video-understanding → video-script → video-voiceover → video-assemble`，另有 `video-cut`），352 个文件，Python 脚本 + SKILL.md 形态，带剪映 draft 导出、素材资源库、只读 dashboard。与我们的 Stage 1–5 同构，但**用途可以反过来**：它的中间产物 schema 正是竞品拆解要的东西。
2. **有什么可拆的** `[R]`（今日直读）：
   - **`recap_story_plan.json`**（示例项目 `examples/guohuo-60s/`）：三层结构。① `director_intent`：`viewer_promise`（观众承诺）/ `pov`（跟随谁的认知）/ `dramatic_question` / `emotional_start→end` / `ending_aftertaste`（结尾余味）/ `withhold_reveal`（悬念何时揭晓）；② `hypotheses[]` + `chosen_hypothesis` + `choice_reason`（**先立多条叙事线假设再选线**，这是"设计决策显式化"的做法）；③ `beats[]`：`function`（hook/setup/escalation）、`event`、`change`（`knowledge:` / `relationship:` / `emotion:` / `power:` 四类认知变化前缀）、**`audience_question_in` / `audience_question_out`（每拍进出时观众心里的问题）**、`must_keep_moment`、`evidence: [asr, vlm, hard_subtitle]`。
   - **`video-understanding/references/data-schema.md`**：`vlm_analysis.json`（scene + `frame_facts` 帧级事实字典）+ **`asr_timing_evidence.json`**——一个独立证据 sidecar，显式声明 ASR 精度边界（`window_timing: COARSE_SEGMENT_WINDOWS` / `word_alignment: NOT_PERFORMED` / `empty_text ≠ silence`）。**给中间产物写"精度诚实声明"这个做法，直接可用于我们的 ASR/alignment 层文档。**
   - `.agents/notes/implemented/` 目录是他们自己的架构决策日志（cut-first-narrate-second、no-content-hashing 等），ADR 写法可参考。
3. **对我们哪个环节有用**：缺口③主参照。`audience_question_in/out` 链条是我们 MRL-2 没有的字段——它能回答"这条视频为什么留得住人"而不只是"每拍在演什么"；`evidence` 标签与我们的 claim-audit 同源，但它是**打到 beat 粒度**的。用了它之后，我们 review 自己成片和对标竞品时多了一张"认知流"维度的表。
4. **怎么用**：**读思路**（默认档）。`recap_story_plan.json` 的 `director_intent` + `beats` 字段设计 → **抄结构候选**，已并入 R1.6 草案（待你批）。
5. **应用代价**：MIT；ASR 环节绑小米 MiMo API，但我们只取 schema 不取管线，无此依赖。不采用失去：audience-question 链、多假设选线、精度 sidecar 三个字段级设计。

#### R1.2 `sharon-laicc/viral-video-decomposer`（6★，MIT，push 2026-06-12）

1. **它是什么**：单文件型拆解 skill（`skill/` 与 `plugins/` 双份同内容），把一条爆款视频拆成三件套产出：`拉片拆解.md` + `图文拆解报告.html` + `video_generation_brief.json`，附 2 个小红书完整示例（含逐镜头真实产出）。
2. **有什么可拆的** `[R]`：
   - **`skill/references/output-contract.md`**：① 爆款模式字段——`hook_type` 7 值枚举（反常识/痛点反问/结果先行/冲突悬念/情绪共鸣/视觉奇观/身份代入）、`emotion_driver`、`audience_promise`、`curiosity_gap`、`rhythm`、`visual_density`、`trust_signals`、**`comment_trigger`（评论区钩子）**、`conversion_move`；② Shot Object——`shot_size` 7 值、`emotional_function` + `narrative_function` **双标注**、`generation_prompt`、`confidence`；③ Production Template——每段落带 `job` / `required_shots` / `rules`。
   - **真实产出示例**（xhs-smelly-cat）：10 镜头表，每镜头"叙事功能+情绪功能"双列，叙事功能连成一条词表链：`Setup → Evidence Setup → Curiosity Gap → Reveal → Reaction → Proof → Personification → Punchline → Aftertaste → Comment Trigger`——**一份现成的叙事功能词表**。
3. **对我们哪个环节有用**：缺口③。`emotional_function` 双标注、`comment_trigger`（结尾给评论区留问题）是我们现有 rubric 没有的维度；`conversion_move` 对 TikTok 同样适用。7 值 hook 枚举可与我们的 P1–P6 hook 模式表对照合并。
4. **怎么用**：**读思路**。Shot Object 与双功能词表 → **抄结构候选**，已并入 R1.6。
5. **应用代价**：MIT；6★ 极小众但文档质量与示例完整度高；停更 3.5 个月——对纯提示词资产类 skill 无碍。不采用失去：双功能标注与叙事功能词表。

#### R1.3 `liuliu-66-create/ll-video-decomposer`（24★，MIT，push 2026-07-29）

1. **它是什么**：五层深度拆解报告 skill（`workbuddy/` + `codex/` 双发行目录，含 WorkBuddy 适配版），带 8 个辅助脚本（抽帧/转写路由/清洗）与 8 个测试场景文档；核心价值在两份 references 文档。
2. **有什么可拆的** `[R]`：
   - **`single-video-report-template.md`**：五层报告骨架——0 证据与基本信息 / 一 整体定位（含"是否值得分析"三态判断）/ 二 爆款结构（黄金 3 秒 / Body 按转折拆 3–6 段带占比 / Payoff 兑现检查 / **一条箭头链路概括推进逻辑**）/ 三 内容价值与表达 / 四 视听语言 / 五 创作策略（可套用框架 / 3 个必须具体到可执行的技巧 / **不能直接复制的因素** / 模仿风险 / 改进差异化 / 延伸选题）。硬规则：证据不足写"当前输入无法判断"，不许猜；视频不值得模仿也要完成报告。
   - **`evidence-and-confidence-rules.md`**：能力矩阵（完整视频/只有音频/只有逐字稿 → 各自"可以分析什么 vs 不得猜测什么"）+ 结论三级（已确认/合理推断/无法判断）+ BGM 四规则（无直接证据不写歌名，只给风格描述 + 3–5 个素材库搜索词）。
3. **对我们哪个环节有用**：五层模板可直接改造成我们的竞品拆解报告骨架；**能力矩阵 + 结论三级**这套证据纪律，正是我们 claim-audit（审事实声明）之外缺的另一半——**审"分析产物本身的可信度"**。与我们 source-health 的 verdict 词汇表思想同源。
4. **怎么用**：**读思路**。结论三级 + 能力矩阵 → **抄结构候选**，已并入 R1.6。
5. **应用代价**：MIT；脚本依赖 whisper 等，我们只取文档不取脚本。不采用失去：分析结论的证据分级纪律。

#### R1.4 `wocha-xiaoli/video-shot-analysis-feishu`（36★，MIT，push 2026-04-25）

1. **它是什么**：7 文件微型 skill：`extract_shots.py`（ffprobe 时长 + 场景检测抽镜头与代表帧）→ VLM 逐镜头分析 → 经 lark-cli 写入飞书多维表格。落表字段定义齐全（19 个字段，含 select 枚举）。
2. **有什么可拆的** `[R]`：19 字段的镜头级落表定义——镜头序号 / 截图附件 / 起止时间码 / 时长 / 概述 / 叙事作用 / **景别 10 值枚举**（远景→大特写，含屏录/混合）/ 画面元素 / 镜头运动 / 转场 / 字幕台词 / 声音音乐 / 情绪节奏 / 视觉风格 / **倒推生成分镜提示词 / 倒推生成视频提示词**（两个"倒推"字段是特色）/ 备注置信度。
3. **对我们哪个环节有用**：它就是"竞品拆解记录落表"这一步的现成字段参照。我们不用飞书（拆解记录落 GitHub/本地 JSON），但 19 字段取子集即可构成 R1.6 草案的镜头层；"倒推提示词"字段对应我们 Stage 2 的 `mediaStrategy` 输入形态。
4. **怎么用**：**读思路**。景别 10 值枚举 → 抄结构候选，已并入 R1.6。
5. **应用代价**：MIT；停更 5 个月；抽帧能力我们已有（`focus_detector.py` 的 cv2 栈），无需取其脚本。不采用失去：景别 10 值枚举与倒推提示词字段。

#### R1.5 `Yuuhann1999/codex-storyboard`（345★，MIT，push 2026-09-15）

1. **它是什么**：Codex 插件形态的"分镜工作台"——原生 Node HTTP + 无依赖前端，agent 经 API 读写分镜表，图片/视频生成后把素材文件复制进项目目录并回填预览。**我们只取数据模型，形态本身与 agent-tool agnostic 冲突，不装。**
2. **有什么可拆的** `[R]`：分镜表 8 字段（`docs/2026-06-22-storyboard-mvp-design.md`）——`rollType`（A-ROLL/B-ROLL）/ `mediaType`（image/video）/ `duration` / `dialogue` / `visualPrompt`（画面描述兼生成提示词）/ **`generator`（`manual` / `image-gen` / `hyperframes` / `remotion`）** / `mediaUrl`（回填） / `notes`；项目级 `aspectRatio` 唯一设置统一驱动素材框、生成任务与 Remotion/HyperFrames 画布。
3. **对我们哪个环节有用**：`generator` 枚举是"这一镜谁来产"的显式记录——我们的 `scene-data` 有 `mediaStrategy` 但没有把**实际生成后端**写进分镜记录的约定；素材回填 API（复制进项目目录 + 回填引用）可与 `docs/media-asset-management.md` 的落盘规则对照校验。
4. **怎么用**：**读思路**。`generator` 枚举 → 抄结构候选，已并入 R1.6。
5. **应用代价**：MIT；Codex 专用插件形态，仅作数据模型参照无迁移成本。不采用失去：一个 8 字段的极简分镜 schema 基准（可对照检查我们自己的 schema 是否过度设计）。

#### R1.6 竞品拆解记录 schema 草案（字段级，供 #300 讨论，**不建表**）

> 综合以上四家字段设计（recap 的认知流 + viral 的双功能标注 + ll 的证据纪律 + wocha 的镜头层 + codex 的 generator 枚举）。草案分五层；每个字段标注来源仓库。**这是讨论稿——采纳哪些字段、落在哪个文件格式，等你批。**

```jsonc
{
  "meta": {                                    // ll + viral
    "video_url": "", "platform": "", "captured_at": "",
    "extraction_method": "direct|downloaded|screenshots|transcript_only|mixed",
    "confidence": "high|medium|low",           // viral 证据注记
    "limitations": []                          // viral：blocked_playback / no_exact_timestamps…
  },
  "verdict": {                                 // viral 一句话判断 + ll「是否值得分析」
    "one_liner": "",
    "worth_analyzing": "yes|light|no_mimic",
    "why": ""
  },
  "story_level": {                             // recap director_intent + ll 推进逻辑
    "viewer_promise": "",                      // recap
    "curiosity_gap": "",                       // viral
    "emotional_arc": { "start": "", "end": "", "aftertaste": "" },  // recap
    "withhold_reveal": "",                     // recap
    "progression_chain": "A → B → C",          // ll 一条箭头链
    "hook_type": "7 值枚举或我们的 P1–P6 词汇",   // viral × 我们对照合并
    "comment_trigger": "",                     // viral
    "conversion_move": ""                      // viral
  },
  "beats": [{                                  // recap beats 为骨架
    "timecode": "",
    "function": "",                            // recap hook/setup/escalation × viral 词表链合并
    "emotional_function": "",                  // viral 双标注之一
    "event": "",
    "change": "knowledge|relationship|emotion|power: …",  // recap
    "audience_question_in": "",                // recap（我们现有 rubric 缺的字段）
    "audience_question_out": "",
    "evidence": ["asr", "vlm", "hard_subtitle"]  // recap：beat 粒度证据标签
  }],
  "shots": [{                                  // viral Shot Object × wocha 子集
    "shot_id": "S001",
    "timecode": "", "duration_sec": 0,
    "shot_size": "10 值枚举（wocha）",
    "visual": "", "dialogue_or_caption": "",
    "sound": { "voice": "", "music": "", "sfx": "" },
    "transition": "",
    "generator_inferred": "manual|image-gen|motion-graphics|stock|unknown",  // codex 枚举思想，加 inferred 前缀
    "evidence": "confirmed|inferred|unknown"   // ll 结论三级，落到镜头粒度
  }],
  "learnings": {                               // ll 五
    "reusable_framework": "",
    "top3_executable_tips": [],
    "cannot_copy_factors": [],                 // 身份/粉丝/独家资源/热点
    "improvement_differentiation": "",
    "extension_topics": []
  }
}
```

**三条使用纪律**（取自 ll，写入草案一并供批）：① BGM 无直接证据只写风格 + 搜索词，不写歌名；② 数据（播放量/互动率）缺失不猜；③ 每条视听结论尽量带时间码，可回看验证。

**R1 待批清单**（2026-09-28 用户已全部批准 ✅；批准 ≠ 立即实施——各条的实际落地动作见括号说明）：
- [x] 抄结构①：把 `recap_story_plan.json` 的 `director_intent` / `audience_question_in/out` / `evidence` 字段吸收进 R1.6 草案（草案已按此写，**批的是"草案方向"本身**）→ 已批准，无需后续动作
- [x] 抄结构②：R1.6 草案作为 #300 竞品基准的记录格式起点（讨论用，不建表不写码）→ **已执行**：草案全文内联贴入 [#300 评论](https://github.com/0xPabloLI/inside-china-ai/issues/300#issuecomment-5865492050)（2026-09-28，用户授权；因本文档未 push 远端，评论贴草案本体而非文档链接），并附 3 个待讨论问题
- [x] 读思路③：ASR 精度 sidecar 的"精度诚实声明"做法 → 未来写进我们 alignment 层文档（意向已批准，作为既定方向记录；实际改 `lib/subtitles` 相关文档时单独提请）

### R2 镜头 / 视觉语法（2026-09-28 完成）

> 方法同 R1：全程只读，GitHub API 直读一手文件。当日实测：`video-shotcraft` Apache-2.0（**代码许可；音频资产另带 ATTRIBUTION 文件**），iart-ai 两包 MIT，`knowledge-explainer-skill` MIT。

#### R2.1 A1 `Vincentwei1021/video-shotcraft`（9.7k★，Apache-2.0）

1. **它是什么**：自包含的 Remotion 制作能力库（985 文件）：镜头配方卡 + 已验收宣传片模板（Ink Press）+ 可复用组件/音频资产 + 六阶段工作流。每张卡 = 一段 Remotion `.tsx` demo + 线上动态样片画廊。
2. **有什么可拆的** `[R]`：
   - **镜头卡词表（10 类）**：文件树实测 demo `.tsx` 共 **218 个**（SKILL.md 自称 157 张卡，两数差异 = 多 demo 对一卡的映射，未逐张核对），分 10 类：`ui-entrance 35 / typography 32 / transition 30 / effects 29 / rhythm 20 / interaction 19 / data 18 / camera 17 / opening 10 / outro 8`。**这 10 个类名本身就是一份现成的视觉语法分类学**。
   - 可复用组件 `assets/lib/`：`Caption / ClipCard / DigitRoll / FlashCut / FlatPanel / PageCam / VerticalTicker` + helpers（motion/shake/camera/rand）。
   - 音频资产按语义目录组织（bgm 5 首 + sfx 按 camera/counter/crowd/data/… 分类），带 ATTRIBUTION。
   - **三种创作模式**（SKILL.md）：模板替换 / 自主自由创作 / 共同创作——其中"共同创作"模式定义了逐确认节点（产品简报→视觉方向→镜头映射→分镜→放行制作），**是一份设计好的 HITL 交互范式**；选模式前先做"最小只读产品检查"再给推荐。与我们 MRL-3/HITL 直接可比。
3. **对我们哪个环节有用**：缺口①。10 类词表 → `mediaStrategy` 词表候选（本次 R2 的核心交付，见 R2.5）；组件层与音频组织方式是将来"装来用"档的主要目标物；三模式 HITL 范式给 R5 对照表多一个参照。
4. **怎么用**：**读思路**（本轮）。词表抽到 `mediaStrategy` 候选 = **抄结构候选**（待批）。组件/音频"装来用"留待 R4 之后统一评估——它 985 文件是大库，整装需工具准入 + 安全审计。
5. **应用代价**：Apache-2.0 覆盖**代码**；`assets/audio/ATTRIBUTION.md` 存在说明音频有单独署名要求——任何"装来用"前必须逐文件核音频许可。体量大（985 文件），不建议整仓安装。不采用失去：10 类视觉词表与组件层参照。

#### R2.2 A2 `iart-ai/motion-skills`（516★，MIT）——是索引仓，不是技能仓

1. **它是什么**：**修正早前认知**：`motion-skills` 本体只有 9 个文件（README + 验证脚本），所谓"50+ skill"实体在 **16 个独立分仓**里（tiktok 4 / explainer 5 / motion-design 9 / web 9 / data-animation 3 / …）。§3 Tier A 表把它当"一个 50-skill 包"是不准确的，已在此更正。
2. **有什么可拆的** `[R]`：索引结构本身 + 分仓清单。本轮抽读与视觉语法最相关的三仓的 SKILL 清单与样本：
   - `motion-design-skills` 9 个 skill：`shot-composition / animation-principles / beat-sync-editing / motion-art-direction / color-motion / logo-animation / motion-background / remotion-video / after-effects`。
   - **`shot-composition` 样本读毕**：12 栏网格带具体数字（1920px 帧：外边距 80–120px、gutter 24–32px）、决策树（静帧构图/出入画/景深运镜/多比例适配四分支）、**9:16 用 RESTACK 重排而非裁切**、标题安全区、三层运动（Primary/Secondary/Ambient 映射 bg/mid/fg）、**每拍只允许一个镜头运动**。质量显著高于社区平均，是可执行的工艺文档而非口号。
   - `kinetic-typography-skills`（1 skill）、`explainer-video-skills`（5 skill：diagram/isometric/whiteboard/wrapped）清单已核，内容未逐份读——**按需补读，不占本轮**。
3. **对我们哪个环节有用**：缺口①。`shot-composition` 的三层运动 + 一拍一运动两条规则，可直接对照我们 `remotion-markup` 的写法规范补缺；beat-sync-editing 待读（对应我们节奏卡点）。
4. **怎么用**：**读思路**。分仓按需逐个读（每仓 1–9 个 skill，体量小）；不建议安装——它们面向"从零搭动效"，我们已有 Remotion 主体与 `remotion-markup`。
5. **应用代价**：MIT；分仓分散 = 工具准入要按仓走。不采用失去：构图/动画原理两份工艺文档的对照补缺。**验证脚本值得注意**：分仓自带 `probe-mp4 / contact-sheet / seek-shot` 三件套——与我们 `verify-remotion-frames` 思路同源，可对照补功能。

#### R2.3 A4 `iart-ai/data-animation-skills`（MIT，3 skill）

1. **它是什么**：iart-ai 16 分仓之一：`chart-animation / animated-infographic / presentation-video` 三 skill，纯文档 + 验证脚本，Remotion 路线。
2. **有什么可拆的** `[R]`（`chart-animation` SKILL + `data-pipeline.md` 读毕）：
   - **「帧是唯一时钟」规则**：每个可见值必须是 `useCurrentFrame()` 的纯函数，禁用一切第三方动画钟（Chart.js `animation:false`、D3 不用 `.transition()` 只用它的 scale/shape）——否则渲出的 MP4 会闪/失同步。**"ease 的是数值本身而非透明度"**（`easeOutCubic` 读作"数字落定"，排名反超用 spring 带重量感）。
   - **CSV → 渲染前 fail loud**：解析+校验全在渲染前，`NaN` 直接抛错——"静默 NaN 变成一根本不该是 0 的柱子，你要渲完 3 分钟才发现"。校验过的 props 落 JSON 走 `--props`。
   - **template × CSV 批量渲染**：一份模板 × N 份 CSV → N 条视频，主题 token 保证批量在-brand。
3. **对我们哪个环节有用**：缺口①数据动画分支。我们的新闻数据可视化场景直接适用三条：帧时钟纪律（大概率已隐式遵守，但没写成规范）、**渲染前数据校验 fail loud**（我们 scene-data 目前没有这层）、批量渲染模式（专题系列视频可复用）。
4. **怎么用**：**读思路**；「fail-loud 数据校验 + 帧时钟规范」两条 → **抄结构候选**（写进我们 Remotion 写法约定的建议，待批，实施单独请示）。
5. **应用代价**：MIT；纯文档零依赖。不采用失去：数据动画的三条工艺纪律。

#### R2.4 `znyupup/knowledge-explainer-skill`（45★，MIT，v0.2.0 stable）

1. **它是什么**：markdown → 讲解动画视频的**完整可跑工具**（`cli.js` + parser + generator + Remotion 模板），本地渲染、不依赖云 API。中文社区作品（nyx研究所）。
2. **有什么可拆的** `[R]`（SKILL + 双摆示例读毕）：
   - **script.md 极简 scene-plan 格式**：每个章节一行 `## 模板名` + `duration` 秒 + caption 字段——一种比我们 `scene-data` 轻一个数量级的中间格式。
   - **内置 6 排版模板**（Title/ContentCard/TwoColumn/Triangle/BeforeAfter/Outro）+ **`custom/` 逃生舱**：复杂可视化直接写 JSX，文件名=段名。三个 showcase 值钱：`DoublePendulum.jsx`（物理仿真，微分方程数值积分）、`PaperFold.jsx`（指数/log scale 数据 viz）、`AlgorithmBubble.jsx`（离散状态机 + 时间轴编排）。
3. **对我们哪个环节有用**：缺口②（无素材时的抽象视觉计划）的**第三条路线**——物理仿真/算法可视化不靠 image model 也不靠拼贴，靠程序化 JSX。双摆那类"初始角差 0.001° 走向混沌"正是 AI 新闻里"混沌/不可预测"类叙事的现成视觉隐喻。极简 script 格式可对照检查我们 scene-data 是否过重。
4. **怎么用**：**读思路**。`custom/` 三个 showcase 的"逃生舱"模式（模板覆盖不了的写 custom JSX + 命名约定）→ **抄结构候选**（我们 Remotion 工程已有等价物雏形，可规范化）。
5. **应用代价**：MIT；工具整体与我们管线重叠度高（我们不该换用它），只取范式。不采用失去：程序化抽象视觉这条路线的现成范式。

#### R2.5 建议：「是否新增 `mediaStrategy: collage` 分支」与 `scene-data` 字段形态

- **本轮证据支持的结论**：`mediaStrategy` 值域应该是一张**受控词表**而不是开放字符串。shotcraft 的 10 类 + R1 的叙事功能词表给了两套候选词汇；`collage` 分支本身**属于 R4 的证据范围**（gbro/VOX 的拼贴工艺），本轮不裁决。
- **建议的字段形态**（写出来供讨论，**不改 scene-data**）：`mediaStrategy: "card:<category>"` 前缀式受控词表，`<category>` 初版取 shotcraft 10 类的子集（我们的场景大概率只用到 `typography / data / camera / transition / opening / outro` 六类）；`collage` 与 `simulation`（R2.4 路线）作为 R4/R6 后补候选。每值需绑定：示例镜头卡引用 + 许可来源 + 本机可渲验证。
- **此建议是讨论稿**，是否落 `scene-data` 等你批，且落在 R4 结束后一并裁决。

**R2 待批清单**（只写不做）：
- [ ] 抄结构①：shotcraft 10 类词表 → `mediaStrategy` 受控词表候选方向（R2.5，最终裁决在 R4 后）
- [ ] 抄结构②：data-animation 三条纪律（帧时钟 / fail-loud 校验 / 批量渲染）写进我们 Remotion 写法约定的建议
- [ ] 抄结构③：knowledge-explainer 的 `custom/` 逃生舱命名约定 → 规范化我们等价机制的建议
- [ ] 读思路④：shotcraft「共同创作」三模式 HITL → 并入 R5 对照表的输入项（无需单独动作）

### R3 平台留存语法（2026-09-28 完成）

> 方法同前：只读 + GitHub API 直读。当日实测：iart-ai 两包 MIT；`faceless-shorts-creator` 无 SPDX 标注（README 未声明，用前须核仓库 LICENSE 文件——它仓库里实际有 LICENSE 文件，SPDX 显示空是 API 元数据缺失）。

#### R3.1 A3 `iart-ai/tiktok-video-skills`（MIT，4 skill）

1. **它是什么**：iart-ai 16 分仓中的 TikTok/Reels/Shorts 包：`short-form-video`（主 skill）、`caption-animation`、`countdown-video`、`lower-thirds`，纯文档 + 验证脚本，Remotion 路线。
2. **有什么可拆的** `[R]`（`short-form-video` SKILL + `retention-pacing.md` 读毕）：
   - **留存契约四规则**：① 一条视频只有一个 payoff（第二idea就是第二条视频）；② loop 在前 3 秒打开、最后关闭，中途绝不提前解答；③ 无 dead air——每一拍要么推进要么重置注意力，寒暄式开场（"hey guys…"）就是划走点；④ **编辑对象是留存曲线不是剪辑**——"让每秒留存曲线持平的丑剪辑胜过让曲线垮的好剪辑"。
   - **留存弧线秒级预算**（20s 模板）：Hook 0–1s（一帧+一句）、张力保持、payoff、loop/CTA 各有预算表。
   - 平台分发阈值（其声称）：~87% 观众 3 秒内决定去留；分发门槛约 70%+ 平均完播（Shorts ~73% / TikTok ~78% / Reels ~65%）。
   - **可运行实现**：完整 `<Short>` 组合——帧驱动 shot scheduler（不均匀切法读作动量）、**punch-in 是最便宜的模式打断**（snap 在切点上）、hook 文本 frame 0 即在屏（micro-overshoot，无 fade-up）、9:16 安全区 overlay（仅 dev）、frame 0 == 末帧的无缝 loop、同一文件换 props 批量出片。
3. **对我们哪个环节有用**：缺口③+留存机制。四规则中①③是我们 MRL-2 没有明确对应的（见 R3.3 表）；punch-in / hook 无过渡直出 / 无缝 loop 是三个可落 Remotion 的具体技法。
4. **怎么用**：**读思路**。技能本身与我们管线重叠（我们更完整），只取语法条目与技法。
5. **应用代价**：MIT；纯文档。不采用失去：留存弧线秒级预算表与三个具体技法。

#### R3.2 B1 `hassancs91/claude-faceless-shorts-creator`（268★，许可证待核）

1. **它是什么**：faceless Shorts 工厂，三条产线共享一个骨架：**TSX**（纯 Remotion 代码零素材）/ **Generative**（fal 视频模型 + 锁定复现角色）/ **Collage**（Vox 纸拼贴）；ElevenLabs 语音 + word-exact 字幕、逐帧 QA、自增长 SFX 库、无缝 loop。12 个完整示例产（脚本 + beats contract + SFX cue sheet 逐帧可复现）。
2. **有什么可拆的** `[R]`（README + 仓库结构读毕）：
   - **beats contract + SFX cue sheet 随片存档**的做法——每条示例产都带"节拍契约"与音效提示单，成片可被精确复现与审计，与我们 media-asset-management 的溯源思路同源但粒度到镜头音效。
   - 六-beat 语法（40s short 值不值得看完的判据，详见其站外指南，本文未抓取全文）。
   - TSX 产线与我们的栈完全同构；Generative/Collage 两条线分别对接 R7（数字人/付费）与 R4（拼贴）。
3. **对我们哪个环节有用**：缺口③（beats contract 存档法）与缺口④的边界参照。其"自增长 SFX 库"（用过的音效入库存档复用）对我们 SFX 组织有参照价值。
4. **怎么用**：**读思路**（Tier B 口径不变）。Generative 产线绑定 fal + ElevenLabs 双付费 API——我们明确不走。
5. **应用代价**：许可证 SPDX 元数据为空，**任何进一步动作前先核仓库 LICENSE 文件**；ElevenLabs/fal 硬绑定仅在其 Generative 产线，TSX 产线无此绑定。不采用失去：beats contract 存档范式。

#### R3.3 三态对照表：社区留存语法 vs 我们的现状

> 我们的 MRL-2 实际是**机器强制**的（`verify-video.mjs --pre` → `scene-rules.mjs` `runAllSceneDataChecks`，B1–B13 + W1–W9），本表据此判级——这比筛选阶段"文档约定"的假设更好。W7=open loop(S2)、W8=pattern interrupt(S5)、W9=loop closure(S9) 均机器检查。

| 社区语法条目 | 我们的对应 | 状态 |
| --- | --- | --- |
| loop 前 3s 打开、最后关闭 | W7 open loop + W9 loop closure（机器检查） | ✅ 有且机械 |
| pattern interrupt 定期重置注意力 | W8 pattern interrupt（机器检查）+ P4 模式打断句式 | ⚠️ 有且机械，但**只查存在不查密度** |
| hook 0–1s 一帧一句、frame 0 在屏 | W2 Hook 具体性（**Agent 判断项**，非机械） | ⚠️ 有但不可机械 |
| hook 句式原型库 | P1–P6 六模式 + 三层 Hook Stack（`tiktok-hook-patterns-best-practices.md`） | ✅ 有（文档级，写稿人工套用） |
| 一条视频只一个 payoff | S.T.A.R.T. `narrativeRole` 逐 scene 标注（间接约束） | ⚠️ 有但不可直接机械（未见"单 payoff"检查项） |
| 无 dead air | W1 字数 + spoken/display 双轨（间接） | ❌ 没有（对应对齐间隙的检查） |
| 无缝 loop（frame 0 == 末帧） | 未见对应 | ❌ 没有 |
| word-exact 字幕 | forced alignment + `\k` karaoke + Quality Gate #234 | ✅ 有且机械 |
| 9:16 安全区 | brand-system + 模板（实现级） | ✅ 有 |
| 留存弧线秒级预算表 | scene `duration` 字段存在，但无预算阈值检查 | ❌ 没有 |
| template × 主题批量出片 | 未见产线机制 | ❌ 没有 |
| 自增长 SFX 库 | media-asset-management（素材入库有规范，SFX 复用机制未见） | ⚠️ 部分 |

#### R3.4 建议转机械检查的候选（≤3 条，按性价比排序）

1. **dead air 检查**（性价比最高）：forced alignment 已有逐词时间戳，voiceover 词间隙 > 阈值（如 2s）即 W 级告警——**纯计算、零新增依赖、数据已在盘上**。
2. **hook 前置机械化**：第一 scene 是否含 hook 文本 + 时长 ≤ 预算（scene-data 字段可算）；W2 的"具体性"语义保留人工，位置与时长转机械。
3. **pattern interrupt 密度**：任意 N 秒窗口内至少一个 W8 类 scene（可从 scene 时间戳直接算）——把 W8 从"存在性"升级为"密度"。

三条全部只是建议，转不转、怎么转（写进 `scene-rules.mjs` 属 pipeline 代码改动）**单独走 proposal-review + 你批**。

**R3 待批清单**（只写不做）：
- [ ] 抄结构①：留存弧线秒级预算表 → 引入我们 Stage 2 scene 预算设计的建议（先给 schema 形态再谈实施）
- [ ] 读思路②：beats contract + SFX cue sheet 存档法 → 并入 media-asset-management 演进议题的意向
- [ ] 读思路③：punch-in / hook 直出 / 无缝 loop 三技法 → 记入 Remotion 技法储备清单的意向（不动代码）

### R4 无素材计划 B（2026-09-28 完成）

#### R4.1 A6 `pyang5166/gbro-collage-broll`（1.3k★，许可证：仓库含 LICENSE 文件，SPDX 未核）

**它是什么**：把一句约 5 秒口播压成一个视觉隐喻，做成 editorial 半调纸拼贴 B-roll 组装动画。

**有什么可拆的**：① **三闸门审批协议**——Gate 1 只提视觉隐喻（用户确认后才开始花钱）、Gate 2 只生成最终静帧（再次确认）、Gate 3 才调视频生成 + QA。闸门设计动机写得直白：「让用户把注意力放在审美和方向上，避免错误隐喻或静帧直接消耗视频生成成本」。② **隐喻命题模板**：核心含义 / 情绪 / 一句视觉命题 / 3–6 个关键对象 / 建议背景色与局部点缀色 / 组装顺序——每条口播先填这张表再动手。③ 环境自检脚本先行（缺配置不进 Gate 1）。

**⚠️ 重大更正（推翻本文件 Tier A 表的旧判读）**：SKILL.md 明写默认视频模型为 `gemini-omni-flash-preview`（按量计费，绑 `GEMINI_API_KEY`），且 **Gate 2 依赖 Codex 内置 `image_gen` 工具**——「无需 image model」的旧判读来自 README 宣传口径，实测不成立：静帧需要图像生成，动画需要付费视频模型，且我们不在 Codex 环境。三家 collage 仓库没有一家能绕开付费生成 API（见 R4.2/R4.3）。

**对我们哪个环节有用**：缺口②。但可用的是**协议与模板**，不是它的执行链路。

**怎么用**：读思路。隐喻命题模板 + 三闸门协议可直接吸收进我们未来的 B-roll 设计流程（人工确认点设计与我们 HITL 同构）。

**应用代价**：执行链路不可用（付费 API + Codex 绑定 + GEMINI_API_KEY）；模板与协议零成本。

#### R4.2 A7 `MegaTroll222/VOX-COLLAGE-BROLL`（许可证：仓库含 LICENSE 文件，SPDX 未核）

与 R4.1 **同工艺同模型**：半调纸拼贴 + 锁定 `gemini-omni-flash`，走 MaxFusion MCP（付费）；同样三闸门（隐喻→静帧→组装动画）。增量信息只有一条：它把「本地文件处理」（抽帧、QA、混音）与「沙箱 agent 降级模式」（纯 prompt 色匹配、跳过逐帧自检）分开写清了——沙箱环境的能力边界声明做法可借鉴。**结论：与 R4.1 二选一读，本文以 R4.1 为准，此仓不再单独跟进。**

#### R4.3 B7 `Alisa0808/vox-director`（47 文件，许可证：仓库含 LICENSE 文件，SPDX 未核）

**它是什么**：一句话主题 → 完整 Vox 纸片拼贴讲解/广告视频，全程 Atlas Cloud API（付费）+ 本地 ffmpeg。

**可拆的一条核心思路**：「**样子诞生在生图这一步，动效是之后加的**」——所有拼贴 DNA（撕纸、胶带、半调、大字标题）在静帧海报里定死，动画只是让海报动起来；要更炸效果才拆件做逐零件组装。它的文档分层（`prompt-guide.md` 管 LOOK 层 / `beat-layer.md` 管 STORY 层：叙事弧库 + 运镜）也是干净的分层法。

**怎么用**：读思路。与 R4.1/R4.2 同属付费 API 路线，执行链路不取。

#### R4.4 `mediaStrategy: collage` 分支裁决（R2.5 悬案，本轮给出）

**裁决：有条件 Go（词表预留，实现另批）。** 依据：① 三家社区实现证明拼贴工艺的**审美价值**真实存在（gbro 1.3k★、vox-director 有完整 showcase），缺口②确实缺一条非 image-model 视频的 B-roll 路线；② 但三家执行链路全绑付费 API，**不可直接采用**；③ 我们的可行路线是「本地静帧生成（取决于 `docs/research/local-image-gen-models-2026.md` 的结论）+ Remotion 程序化组装动画」——拼贴动画本质是分层 PNG 的位移动画，Remotion 完全胜任。**条件**：本地图像模型研究给出可用结论；若该研究 No-Go，`collage` 分支同步 No-Go。实施（词表字段、组装模板）属执行阶段，单独走 proposal-review。

### R5 渲染前门禁（2026-09-28 完成）

#### R5.1 A15 `runesleo/claude-video-kit`（120★，MIT，push 2026-09-27）

**receipt 机制全貌**（`docs/pre-render-review.md` 一手读取）：

- **11 项检查**：facts / structure / duration / visual_feasibility / hierarchy / simplicity / clarity / legibility / craft / privacy / copyright。前 4 项是内容与工程项，中间 5 项是设计质量项（自注以 Apple 平台设计指南为质量透镜、**不是**视觉风格目标，品牌系统仍以 `config/design-system.json` 为准），最后 2 项是合规项。
- **凭证语义**：reviewer 必须**不同于 script 作者**；复核绑定**确切那份 `script.json` 的字节**；任何 `fix`/`block` 停渲染；脚本一旦再编辑 receipt 即失效。渲染入口是 guarded entrypoint（`scripts/video-explainer.mjs review` → `render.sh`）。
- **它自己也承认 pre-render 不够**：渲后还有第二道 video-bound review gate（重查 5 项设计质量 + `audio_consistency`（章节级 LUFS，自注尚未自动化）+ `end_card`）。两道门 + 客观验证器的三层结构。

**R5.2 对照表：它的 11 项 vs 我们的 gate**

| 检查项 | 我们的状态 |
| --- | --- |
| facts（事实核查） | 有——claim-audit / fact cards，渲前审 scene-data |
| structure（hook/过渡/收尾连贯） | 有——MRL-2 W2（Hook 具体性）等，部分为 Agent 判断项（B5/B6/W2） |
| duration | 有——MRL-2 时长预算 + TTS pacing |
| visual_feasibility（场景映射到已支持组件） | 有——scene-data → 模板映射，B 类 Blocker 覆盖 |
| hierarchy / simplicity / clarity / legibility / craft（5 项设计质量） | **有但不可机械校验**——DESIGN.md 有规范，`scene-rules.mjs` 无对应自动项 |
| privacy / copyright | 有——MRL-3 内容检查 + media-asset-management 授权约定 |
| receipt（盘上凭证、字节绑定、reviewer≠author） | **没有**——HITL 是对话中的确认 + 文档约定（agent 必须暂停），发布动作无盘上凭证 |
| 渲后独立复查 | 有——`verify-video.mjs` 渲后验证（我们做得更细） |

**R5.3 结论建议（执行阶段另行讨论，本轮不动任何代码/脚本）**

关键洞察：他们的 gate 落在**渲染**入口，因为渲染贵（云端重渲）；**我们的渲染本地便宜，贵的动作是「公开」**（文章公开发布 + TikTok 上传 + 附件上传）。所以 receipt 模式对我们最有价值的落点不是渲染 gate，而是**发布入口凭证化**：HITL 确认后生成一份 receipt，绑定内容包（article draft + scene-data + 视频 mp4）的内容哈希，`publish-article.mjs` / TikTok 上传脚本启动时校验——哈希不匹配（内容在确认后被改过）、receipt 缺失或状态不对，拒绝执行公开动作。

- **收益**：HITL 从「agent 自觉暂停」升级为「机器强制」；中间任何一环被改，下游自动失效。
- **代价**：多一道流程（跑批时会被卡）；需定义 receipt 写入者（单人场景实质是你或代审 agent）；publish 脚本要加校验逻辑。
- **不采用会失去什么**：维持现状——质量靠 MRL-2/3 机器自审 + agent 纪律，泄露路径（确认后改动再发布）无盘上防护。
- **建议**：值得试点，范围仅限发布入口（不动渲染链）。具体设计（receipt 格式、写入时机、校验点）在实施前提 proposal 给你批。

### R6 成片选段与剪辑工程（2026-09-28 完成）

#### R6.1 A9 `AgriciDaniel/claude-shorts`（217★，许可证：仓库含 LICENSE 文件）

**它是什么**：长视频 → 短视频选段生产器，Remotion 渲染，带完整评分体系。

**可拆的（`references/scoring-rubric.md` 全文一手）**：5 维加权选段 rubric，公式 `final = hook×0.30 + coherence×0.25 + emotion×0.20 + value×0.15 + payoff×0.10`。每一维都有**分值锚定的枚举表**，不是模糊描述：

- **Hook Strength 0.30**：8 个 archetype 各带分值区间（Bold/Contrarian 80–100 … Weak/Generic 10–40）+ boosters（含具体数字 +5–10、点名知名实体 +5–10、暗示亲历 +5–10）。
- **Standalone Coherence 0.25**：5 档自洽度 + **red flags 自动低分**（"as I mentioned earlier"、无先行词代词、句中截断）。
- **Emotional Intensity 0.20** / **Value Density 0.15**（含 >30% 填充物惩罚）/ **Payoff Quality 0.10**。
- 选段操作参数：30–60 分钟素材出 8–12 个候选、甜点 15–55s（峰值 25–40s）、阈值 60、同子话题去重、源内间距 ≥2 分钟、句边界对齐；hook 双行文本规范（不与口播首句重复，是补充不是复述）。

**对我们哪个环节有用**：缺口④（已成片的时间级选段）。这套 rubric 的分值锚定枚举 + red flags 形态可以直接套在我们 forced alignment 产出的句级/词级数据上——我们已有逐词时间戳，缺的就是这个评分层。

**怎么用**：抄结构候选（rubric 表 → 改造成我们 Stage 0/5 的选段评分词表）；执行另批。

#### R6.2 A5 `erduo1998-cell/erduo-broll-loop-engineering`（203★，MIT）

**本轮新增可拆的两条**（`docs/V1.0.0-DESIGN.md` 一手）：

- **画面理解合同**：每个 Recipe 必须先写明「观众第一眼看到的具体锚点、发生的动作、最后得到的结果」；抽象隐喻允许，但必须由立即可读的对象/关系/状态/空间变化承载，「不能只剩抽象材质、能量线或巨型文字」。这条对我们 `scene-data` 的场景抽象描述是现成的验收标准（与 R4 拼贴隐喻模板互补：一个管"怎么想出画面"，一个管"画面算不算成立"）。
- **Token/成本事实诚实记录**：计量字段无可靠事实时全部写 `unknown`，不估算；脚本不读宿主私人路径、不把绝对 production path 写入公开记录。与我们 alignment 层的「精度诚实声明」（R1.1）同一族纪律。
- 增量重渲（改一镜只重渲受影响镜头）的缓存语义本轮未在 DESIGN 中定位到具体章节，标 `[R]`（部分）——**执行阶段若决定做增量渲染，再回头精读**，不在研究阶段深挖。

#### R6.3 B10 `louisedesadeleer/cut-video`（4 文件小仓，许可证：仓库含 LICENSE 文件）

**它是什么**： aggressively 收紧长录音（去静音/填充词/口误/重复，保留笑声），MFA 词边界驱动剪辑。

**最值钱的是它的教训，不是功能**：SKILL.md 开篇就自曝翻车记录——**「MFA times 是 DRAFT，不是 ground truth」**：retake 密集的素材上 Whisper 会把重复句塌缩成一条转写，MFA 就把一次转写对齐到多次实际口播上，实测后半段漂移 **1–6 秒**（给了具体数字：MFA 说 217.2s、真实起点 225.4s）。对策：每个 keep boundary 必须用 isolated-window 重新转写校验后才准渲染。

**对我们的直接意义**：我们用 wav2vec2 forced alignment，同为 forced aligner，**同一类失败模式适用**——我们的素材是文稿驱动（TTS 朗读、无 retake），风险远低于它的口播素材，但「对齐时间是草稿、发布前要抽查校验」这条纪律应该进我们 alignment 层的共识（与 R1.1 的精度诚实声明合并为一条待批项）。

#### R6.4 B3 归属更正 + B4/B2 结案

- **B3 更正**：清单里的 `zenstory-ai/FireRed-OpenStoryline` 已 **404**（仓库迁移/转移），现址 `FireRedTeam/FireRed-OpenStoryline`（3,448★，push 2026-07-31）——小红书 FireRed 团队的开源讲解视频工作流，有 ModelScope Demo 与 HuggingFace 组织页。它是**重模型路线**（自研模型栈），与我们「TTS + Remotion 轻管线」不同向，本轮只做归属更正，不深读。
- **B4 `chengfeng-videocut-skills` 结案**：形态是 MCP 插件（`.mcp.json` + `server.mjs`），绑 MCP server 交付，与 agent-tool agnostic 冲突，只读价值低——跳过细节，不再跟进。
- **B2 `video-talkcraft` 结案**：PolyForm 非商用维持原判（§5.3）；109 个 motion presets 的手法层面可在 Remotion 实践中参考思路，代码不进。

**R6 待批清单**：
- [ ] 抄结构①：claude-shorts 5 维 rubric（分值锚定枚举 + red flags 形态）改造成我们选段评分词表（实施前先出 schema 提案）
- [ ] 读思路②：erduo「画面理解合同」三问（锚点/动作/结果）并入 scene-data 场景描述验收标准的意向
- [ ] 读思路③：cut-video「对齐时间是草稿」+ R1.1 精度诚实声明，合并为 alignment 层文档的一条纪律意向（与 R1 待批③同源，落地时合并处理）

### R7 数字人 fallback（2026-09-28 完成；**开口子与否是你的决策，本轮只给成本事实与建议触发条件**）

#### R7.1 成本事实（`AgriciDaniel/lipnardo` → `references/credit-costs.md` 一手读取）

| HeyGen 能力 | 单价 | 折合 |
| --- | --- | --- |
| Avatar III（预置头像） | $0.0167/s | ≈ $1.00/分钟 |
| Video Agent（prompt→视频） | $0.0333/s | ≈ $2.00/分钟 |
| Photo Avatar IV（用户照片定制，单条 ≤3 分钟） | $0.0500/s | ≈ $3.00/分钟 |
| Digital Twin IV（棚录定制） | $0.0667/s | ≈ $4.00/分钟 |
| Translation（Fast / Quality） | $2–4/分钟 | 精准口型取 Quality |
| Starfish TTS（仅音频） | $0.000667/s | ≈ $0.04/分钟 |

计费规则：$5 起按量付、无月费；**MCP credits 与 API credits 分开**不通用；余额查询 `GET /v2/user/remaining_quota`；`--test true` 可免费生成带水印测试片。折算我们典型 40s 竖屏：Avatar III ≈ **$0.67/条**，Photo Avatar ≈ $2.00/条，Digital Twin ≈ $2.67/条。对比我们 CosyVoice3/MLX 自托管 TTS 边际成本 ≈ 0。

#### R7.2 三条路线形态（一手 README/结构）

- **A11 `heygen-com/skills`（官方）**：3 个 skill（`heygen-avatar` / `heygen-video` / `heygen-translate`），面向 Claude Code/Codex/Cursor 等多 agent 的标准安装流，本质是 API key + REST 的 skill 化封装。
- **A12 `Upload-Post/avatar-mix`**：HeyGen Avatar V + HyperFrames + ffmpeg + TTS word-timing + Upload-Post（发布服务）的复合管线，同一头像片段出 16:9 与 9:16 双版。工程形态值得看，执行链路绑两重付费服务（HeyGen + Upload-Post）。
- **A13 `lipnardo`**：HeyGen API 的 skill 化封装（资产/批量/余额管理脚本 + 错误码参考），文档质量是三条里最好的。

#### R7.3 结论与建议触发条件（留执行时讨论）

- 三条路线**全部是 HeyGen 付费 API**，清单里的 4 个数字人仓库无一能缓解本地 xfuser 依赖缺失的卡点。
- **本决策本轮不请求拍板**。写下的建议触发条件：① 出现**明确需要真人出镜口播**的选题（AI 新闻讲解场景当前并不需要）；② 需要时先用 `--test true` 免费水印片评估质量与口型自然度，再决定是否付费；③ 若启用，从 Avatar III（$1/min，无需定制脸）起步，不先上 Photo/Twin。
- 本地路线（xfuser）修复后重估——数字人自托管是否可行届时再看。

### R8 渲染内核观察（2026-09-28 完成；spike 实测留执行阶段）

#### R8.1 A10 `heygen-com/hyperframes` 实测快照（2026-09-28 API 实测）

- Apache-2.0；**53,738★**；push **当天**（2026-09-28T08:23Z）；最新 release `v0.8.82` 也在当天——发布节奏极快；open issues 248；Node ≥22；npm 包 `hyperframes`；8,254 个文件，含 `.agents/skills/` 下十几个官方 skill。
- 定位：「Write HTML. Render video. Built for agents.」——HTML/CSS/媒体 + seekable 动画 → 确定性 MP4；CLI 本地用 / agent 插件用 / 托管渲染内核三种形态。HeyGen 商业团队维护，文档/展示/playground 齐全。

#### R8.2 意外收获：`motion-doctrine`（运动设计方法学，与运行时无关）

hyperframes 内置的 gateway skill 是一份**不依赖其运行时**的运动设计法则，直接可用于我们 Remotion 实践：

- **向量法则**：怎么出去决定怎么进来（含 Z 轴 scale-sign 规则）——跨镜头动量连续，避免「每镜独立动画、切口动量归零」。
- **禁 idle wobble**：motion must PERFORM, not breathe——元素不承担叙事就不许晃。
- **stillness-before-climax**：高潮前静止蓄力。
- **「写-戳-验」工作流**：vector ledger（`ledger.json`）→ `seam-stamp.mjs` 戳主缝合点 → `seam-gate.mjs` 构建期强制校验——又是「gate 前置、构建期机器强制」的范式，与 R5 receipt 同族。

**怎么用**：读思路（候选：向量法则与「禁 idle wobble」记入 Remotion 技法储备，与 R3 待批③合并落点）。

#### R8.3 「什么条件下认真考虑第二渲染内核」判断（结论不改变 Remotion 主体）

同时满足以下任一条件时重开评估，否则维持 Remotion 主体：

1. Remotion 出现**维护/许可的不利变化**（更新停滞、许可收紧、价格策略变化）；
2. 大量需要 **HTML/CSS 现成生态**（图表库、CSS 排印）且 Remotion 侧实现成本明显更高；
3. 我们需要 **seam-gate 类构建期强制门**而 Remotion 体系内无法等价实现；
4. 产出瓶颈被**渲染表达力**卡住（不是流程或选题瓶颈）——先排除后两者再谈内核。

**spike（hello-world 实测渲染）留执行阶段**：属「跑本机渲染」类动作，按本轮纪律不在研究阶段执行。届时验证点：渲染确定性、与 ffmpeg 管线的拼装成本、bundle 体积。

### R4–R8 完成小结

- 五轮全部 `[R]` 级一手取证（GitHub API 直读 SKILL/DESIGN/rubric/价格表），两处事实更正：**gbro 并非「无需 image model」**（绑 GEMINI_API_KEY 付费视频模型 + Codex 内置 image_gen）；**OpenStoryline 已迁至 `FireRedTeam/`**（清单原链接 404）。
- 悬案裁决：`mediaStrategy: collage` = 有条件 Go（词表预留、本地静帧 + Remotion 组装路线、执行另批）。
- 累计待批清单：R1 3 条（已批）+ R2 4 条 + R3 3 条 + R6 3 条 + R8 1 条（读思路，与 R3③同落点）≈ 11 条在册，全部「执行时再批」。R4/R5/R7 的落地项（collage 实施、发布 receipt 试点、数字人口子）各附触发条件，**均留执行阶段单独提请**。
