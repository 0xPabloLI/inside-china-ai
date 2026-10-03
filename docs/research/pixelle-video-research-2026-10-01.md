# Deep Research: Pixelle-Video（ATH-MaaS）项目现状全景

> 调研日期：2026-10-01（所有星数、issue 计数、push 日期均为当日实测）
> 研究问题：Pixelle-Video 现在到底是什么状态——谁做的、真正能做什么、以什么形态交付、还活着吗、我们该怎么定位它。
> 深度档：Standard（SCOPE → PLAN → RETRIEVE → TRIANGULATE → SYNTHESIZE → PACKAGE），一手代码 + GitHub API + 官方站三轨并行。

> **路径口径**：本报告正文与 Sources 里的 `docs/zh/...`、`pixelle_video/...`、`api/routers/...`、`services/...`、`templates/...`、`workflows/...`、`pyproject.toml` 等**均指 Pixelle-Video 仓内文件**（本机 clone `/private/tmp/pixelle-video-survey`，浅 clone HEAD 2026-06-14），不是本仓路径；本仓文件一律显式写成 `docs/research/...`、`scripts/short-video/...`。

## Executive Summary

Pixelle-Video 是阿里 **ATH-MaaS**（原 GitHub org `AIDC-AI`，2024-06-13 建 org，整体改名而非新建）出品的「输入一个话题、自动产出一条竖屏短视频」引擎，2025-11-07 建仓，三个半月累积 28,557★ / 4,165 fork，Apache-2.0 可商用 [1][2]。头号作者 `puke3615`＝Zhenran Xu（提交邮箱 `@alibaba-inc.com`，245 commits，第二名 26 commits），同人是 FilmAgent（SIGGRAPH Asia 2024）与 ComfyUI-Copilot（ACL 2025 demo）一作，也是本项目底层 ComfyUI 封装库 `ComfyKit` 的作者 [2][3][4][5]。**项目本身没有论文或技术报告**（arXiv / OpenAlex 检索零命中），它是那条「多智能体影视生成」研究线的工程化出口，而不是研究成果本身 [3]。

它真正的形态不是「视频生成器」，也不是「视频剪辑器」，而是一台**卡片快印机**：LLM 按话题写旁白（默认 5 个分镜、每句 5–20 词）→ 每句配一张 AI 图或一段 AI 视频 → TTS 配音决定每帧时长 → `templates/**/*.html` 模板经 Playwright Chromium 截屏出帧 → `ffmpeg-python` 拼接成片 [6][7][8][9]。这个判断来自代码而非宣传口径：全仓 26,165 行 Python / 117 个文件里没有任何时间轴、转场或动画引擎，`moviepy` 只在「动作迁移」一处被用到，因而被硬锁在 2020 年的 1.0.3 版本 [6][10]。

维护状态是本报告最需要说清的部分，而且四个独立刻度互相印证：**main 最后一次提交停在 2026-06-14**（3.5 个月，`stats/participation` 显示此后连续 15 周 0 提交，8 个分支无一例外）；**官方 release 停在 v0.1.15 / 2026-01-27**，而 `pyproject.toml` 已写成 0.2.0 且没有对应 tag；**文档站最后一次部署是 2026-01-08**，6 月上线的直连 API 媒体功能从未进过文档，数字人/图生视频/动作迁移三大招牌功能在文档站里完全缺失；**官方 B 站教程止于 2026-02-03** [2][11][12][13]。同时 open issue 146 / closed 41（关闭率 22%），23 个 open PR 全部卡死，最新的三张票（2026-09-03 至 09-07）是 0 回复、0 标签、0 指派 [11]。对照证据很关键：**这不是团队解散**——同 org 同作者的 ComfyUI-Copilot 推到 2026-09-11、Ovis 系列推到 2026-09-28，但 Pixelle 产品线（Pixelle-Video、Pixelle-MCP 停 2025-12-17、Pixelle-Studio 停 2026-02-27）全停 [2][14]。唯一解释停摆动机的证据是 issue #127 里一名 `author_association=COLLABORATOR` 在 2026-05-06 写下的「工程师们陆续转岗……目前没有人有权限继续更新维护」，身份由 API 字段证实，但属**单一来源** [11]。

结论落点：按本仓自己的 5 条筛出口径，Pixelle-Video 是 **Tier B「只读取思路」档，不引入代码、不接管实现**——许可过关，但招牌能力绑定第三方付费云（15 类工作流只有 RunningHub 云端版）、本地路线要求 NVIDIA 显卡（我们是 M2 Pro）、活跃度处于「5 个月降只读」的临界、且与我们的 Stage 3–5 能力高度重复。值得抄的是它的 25 个竖屏 HTML 版式库和「把渲染/TTS/生图拆成原子 REST 端点」的接口形态，反面教训是文档落后代码 5 个月、零测试零 CI 与文件服务的词法级白名单校验 [15][16][17][18]。

## Key Findings

1. **归属：阿里 ATH-MaaS，前身 org 名 AIDC-AI。** `orgs/AIDC-AI` 与 `users/AIDC-AI` 均已 404，但 `repos/AIDC-AI/Pixelle-Video`、`/Marco-o1`、`/ComfyUI-Copilot` 全部 301 重定向到 `ATH-MaaS/...`，org `created_at` 保持 2024-06-13 → 改名而非新建 [1][2][14]。**署名并不自洽**：`NOTICE` 第 1 行是 `Copyright (C) 2025 AIDC-AI`，文档站页脚却是 `Copyright © 2025 Pixelle.AI`（无可访问官网），LICENSE 附录仍是未填的 `Copyright [yyyy]` 模板 [19][20]。
2. **无项目专属论文。** arXiv / OpenAlex 零命中；README「系列工作」列的是 FilmAgent、Anim-Director、ComfyUI-Copilot、AniMaker 四篇哈工大深圳 TMG × 阿里合作论文，属作者既往研究线而非本系统的技术报告 [3][4][21]。
3. **架构是「HTML 模板截屏 + ffmpeg 拼接」，不是视频合成引擎。** 出帧由 Playwright Chromium 完成（`frame_html.py` 需要 `playwright install --with-deps chromium`），拼接由 `ffmpeg-python` 完成（`video.py` 自述"High-performance video composition service built on ffmpeg-python"）；分镜契约 `StoryboardFrame` 只有 narration / image_prompt / media_type / duration 等字段，没有时间轴、关键帧或转场概念 [7][8][9]。
4. **三个招牌功能只在云端可用，与 README 的「完全免费」口径冲突。** 29 个工作流文件（selfhost 8 + runninghub 21）、去重 23 类，其中 **15 类只存在于 `workflows/runninghub/`**：全部数字人（`digital_image`/`digital_combination`/`digital_customize`）、动作迁移（`af_scail`）、Wan2.2 与 LTX2 图生视频、SD3.5/SDXL/FLUX.2/Z-Image、Spark TTS、`video_understanding`。README 同页却写「本项目完全支持免费运行！Ollama + 本地 ComfyUI = 0 元」[6][15][16]。这条代码结论被维护者在 issue #229（2026-07-15）独立承认：selfhost 预留选项缺工作流文件导致直接报错 [11]。
5. **维护停摆是可量化的，且不是全面撤退。** 时间线见上；同 org 其它项目仍活跃，说明是注意力转移而非组织瓦解。RunningHub 侧「并发限制与会员等级挂钩」、48GB 实例需配 `plus`，都指向它主推的是付费云路线 [17][22]。
6. **零测试、零测试 CI。** 全仓没有 `test_*.py`、没有 `tests/` 目录，`pytest` 只出现在 dev 依赖里；`.github/workflows` 只有 `docs.yml` [23]。
7. **文件服务的路径白名单是词法级的，可被点段序列绕过。** `api/routers/files.py` 用 `Path.cwd() / full_path` 拼接后做 `relative_to(Path.cwd())` + `startswith` 校验，**全程没有 `resolve()`**；我在隔离目录复现该逻辑（不启服务）：正常文件通过（正对照），`output/../../../etc/passwd` 与 `output/../../../../Users/<user>/.ssh/id_rsa` 同样判为 ALLOWED（因为字符串仍以 `output` 开头），而 `workflows/../../../etc/passwd` 因跳数不足落到不存在路径返回 404（负对照）。这解释了未合并的修复 PR #175/#233 所指问题；**代码层缺陷为 High，端到端可利用性为 Medium**（未对实做 PoC，HTTP 层是否先行规范化点段未测；`api/app.py` 仅挂 CORS，无路径规范化中间件）[18][24][11]。
8. **关注度结构失衡。** 英文社区近乎为零：HN Algolia 精确词 0 命中（无 story 无 comment）、Reddit 只有 Google Pixel 噪音、官方 YouTube 频道 33 订阅；中文侧「报道」多为复述 README 的内容农场（CSDN 批量号、头条 2026-08-30 标题仍写「破万 Star」）。28.5k★ 对应的抽样增长约 24★/天（Events API 2026-09-28→10-01 抽样，83 WatchEvent / 17 ForkEvent），爆发期全部落在 2025-11～2026-06 的活跃窗口内 [12][21][25][26]。
9. **没有 fork 接管。** 无 >5★ fork，绝大多数 fork 的 `pushed_at` 恰等于 2026-06-14（分叉瞬间而非维护）；衍生项目最高 49★ 且止于 2026-05-14。社区「续命」的主要形态是 B 站二开整合包，而评论区直言「百度网盘里面是空的文件」「将近 100G 仍不能本地出语音」[12][27]。

## Detailed Analysis

### 它解决什么问题，以及不解决什么

Pixelle-Video 的野心写在 README 第一屏：把「写文案、配图、配音、配乐、合成」五件事压成一次输入 [6]。蚪云分享社的评价最贴切：**它不是 AI 生视频，是"自动剪辑的工头"**——价值在于把散落在 5–6 个软件里的活编排成一条可拔插换模型的流水线 [25]。这一点在代码里是成立的：`pixelle_video/pipelines/` 只有 4 个具体 pipeline（`linear` 定义 8 段式骨架 `setup_environment → generate_content → determine_title → plan_visuals → initialize_storyboard → produce_assets → post_production → finalize`，`standard`/`asset_based` 继承它，`custom` 供子类化），能力全部下沉到 `services/` 与 workflow JSON，替换成本极低 [28]。

它不解决的是「画面」。鲸吞源码 2026-09-19 的比喻是**快印店 vs 剧组**：Pixelle 承诺产能，不承诺跨镜头人物一致性；对照 VideoClaw 那条线要多出角色设定与参考图两道工序 [26]。issue #39（2025-12-22）里实测者同时给出两个数字——需要 RunningHub 69 元/月，以及成片形态是「插画轮播 + 配音」，而后者正是 YouTube Shorts 严打的重复性内容形态 [11]。这条反馈与我的代码取证完全吻合：既然出帧是 HTML 模板截屏，成片在视觉上就必然退化为带插字的卡片序列，除非每帧都调 AI 视频模型（而 Wan2.2 又只有云端版）[7][15]。

### 交付形态：三种接口，一个生态缺口

Streamlit Web UI（8501，只有 Home/History 两页，数字人与动作迁移各自是 `web/pipelines/` 下的一个类）、FastAPI REST（原子端点 `/llm/narration`、`/content/image-prompt`、`/frame/render`、`/image/generate`、`/tts/synthesize`、`/video/generate/sync`、`/tasks`）、Python SDK（`PixelleVideoCore` 组合服务）[29][30]。把 `/frame/render`、`/tts/synthesize` 这类单步能力暴露成 HTTP 端点，是这个项目对我们最有参考价值的接口设计——它使 agent 可以只调「渲染一帧」而不必跑完整条管线 [29]。

生态缺口也很硬：`fastmcp>=2.0.0` 是声明依赖，但**全仓没有任何一处 import**；MCP 实体在兄弟仓 `Pixelle-MCP`（1,120★），而它停在 2025-12-17 [5][10][14]。也就是说官方 README 里「让 AI 助手直接调用 ComfyUI」这条叙事，其载体已经比主仓更早停摆 [6]。Docker 侧同样有产物无文档：repo 有 `Dockerfile`（`python:3.11-slim`，构建期 `playwright install --with-deps chromium`）与 `docker-compose.yml`，文档站零提及；而 `docs/zh/development/architecture.md` 全篇 50 行、写着 Python 3.10+（`pyproject` 实为 `>=3.11`），末尾是「详细的架构文档即将推出」[10][31][32]。文档不是「略旧」，是从来没跟上。

### 维护状态：四把尺子与一把反面尺子

把代码、发版、文档、社区四个通道并排看，停摆不是一个印象而是一个结构：main 停在 2026-06-14（= 最后合并的 PR #206）、release 停在 2026-01-27、docs 部署停在 2026-01-08、B 站停在 2026-02-03 [2][11][12][13]。仓库 `homepage` 与 README 徽章仍指向 `aidc-ai.github.io`，我实测该 URL 返回 404，同路径在 `ath-maas.github.io` 返回 200——**用正对照排除「github.io 整体不可达」的解释后，可以确认官方入口在改名时被遗忘了** [20]。

反面尺子是「组织仍在运转」：ComfyUI-Copilot 2026-09-11、Ovis 系列 2026-09-28 还在推 [14]。因此把 Pixelle-Video 的现状称为「停摆」而不是「废弃」更准确——Apache-2.0 允许自由 fork，但没有出现接管者 [1][12]。

社区侧最值得记录的是维护者行为的分裂：hit-cxf 在 2026-06-15、06-29、07-15 三次答疑（其中 #229 承认 selfhost 缺陷），但同期 10 回复的长帖 #188、37 回复的 #42 无人回应，用户在评论区互救（「我也一样」「一样 解决了吗」）；23 个 open PR 里 4 个自荐 API 厂商 PR 全卡在 CLA-assistant，7 月 imryanxu 还批量清理垃圾 issue，9 月起垃圾票裸积 [11]。这是典型的「只答不发」晚期形态。安全议题尤其明显：路径穿越修复 #175（2026-05-24 提交）被贡献者于 2026-06-18 自行关闭并留下「24 天无维护者回应……该发现与修复依然有效」，重交的 #233（2026-07-18）至今只有 CLA bot 回复，`SECURITY.md` 提案 #254（2026-09-05）未处理，仓库无 SECURITY.md、security-advisories 为空 [11][24]。

### 真实使用者的话

批评集中在五处，且都能追到一手 issue 而非二手转述：收费引流（#127「除了快，其他所有工作流都在收费平台」；SnoopGER 2026-05-05「90% 是付费 API，本地的还是过时的 wan 2.1」；hss01248「配了 ComfyUI 还报错要 RunningHub Key」）；隐性成本与形态（#39）；算力与画质（蚪云：RTX 3060 出图 2–3 分钟/张、20 分镜等 2–3 小时；#115 Wan2.2 1080P 模糊、0 回复；#109）；依赖与文档坑（#207 Playwright chromium 缺失、#225 ffmpeg、#182 missing_node_type、#165 selfhost 脚本全废至今无人答）；功能残缺（#36 自定义素材根本无法生成、#71 缺 `digital_image.json`、#239 唯一回复是「这是这个项目的已知缺陷，正常，解决不了」）。交流通道本身也坏了：#42「交流群加不进去了」、#234（2026-07-25）「依然无法添加好友」[11]。

正面反馈同样具体：一条可拔插换模型的流水线省掉 5–6 个工具的编排；B 站 AI王知风 2026-05-16 实测「一天 100 条」批量图文口播（6,165 播放）；#222 证实风格提示词可自换 [11][25][27]。需要诚实标注的是：这些称赞全部来自「用它做量产号」的场景，没有一条是在称赞成片美学质量。

### 与本仓管线对照

| 轴 | Pixelle-Video（代码取证） | 本仓 short-video 管线 |
| --- | --- | --- |
| 定位 | 单发工具：话题 → 成片 | 双轨：文章（Stage 0–2）与视频（Stage 3–5）共享素材与事实核验 |
| 出帧 | `templates/**/*.html` + Playwright 截屏 → `ffmpeg-python` 拼接 [7][8] | Remotion React 逐帧（转场、rough-notation 标注、perceptual-scale 动画） |
| 分镜契约 | `StoryboardFrame`：narration / image_prompt / media_type / duration，默认 5 帧 [9] | scene-data + `mediaStrategy`（asset / b-roll / asset-then-broll）+ 首帧安全区 y<1150 |
| 素材来源 | AI 生成为主；15/23 类工作流仅 RunningHub 云端 [15] | stock-first 采购 + VLM claim-based 相关性打分 + 本地 MLX Wan1.3B B-roll |
| 语音 | edge-tts / IndexTTS2 / Spark，经 ComfyUI；克隆靠 `ref_audio` [17][33] | CosyVoice3-Kaggle-CUDA 默认 + MLX 兜底（ADR-0019），TTS 跨 run 缓存 + wav2vec2 forced alignment |
| 文本/字幕 | 旁白文本直接进模板 | `voiceover`/`ttsText`/`original` 三字段契约：朗读可改写、字幕必须原文 |
| 质量门 | 无测试、无 CI 测试、无事实校验 [23] | MRL 自审循环、claim-audit、media gate、Stage 5 verify |
| 发布 | 无平台侧 | TikTok 发布 + HITL 强制批准 + Analytics 回灌 |
| 许可 | Apache-2.0（NOTICE 已列 pillow/fastmcp 等第三方条款） [1][19] | — |

按 `docs/research/agent-video-skills-180-screening-2026-09.md` 的 5 条口径逐条打分：许可 ✓、付费 API 绑定 ✗、NVIDIA/CUDA 假设 ✗（官方要求本地 ComfyUI 6GB+ NVIDIA，我们是 M2 Pro 32GB）[22]、活跃度 △（3.5 个月未 push，该报告的口径 4 先例是「5 个月未 push 降为只读」）、能力重复 ✓。综合 **Tier B 只读**。

值得吸收的三点：其一，25 个竖屏 HTML 模板（`image_blur_card`、`image_neon`、`image_satirical_cartoon`、`static_*` 等）是一批现成的版式候选，可直接作为我们 `mediaStrategy` 模板库的对照清单——Apache-2.0 允许改写 [6][34]。其二，`static_*.html` 与 `image_*.html` / `video_*.html` 的命名前缀即「是否需要 AI 素材」的受控分类，比我们的隐式判断更适合做门禁；FAQ 也证实纯文本模板可以完全不依赖 ComfyUI [16]。其三，原子 REST 端点（尤其 `/frame/render` 单独暴露模板渲染）是比我们「整条 `main.mjs` 跑到底」更利于 agent 局部重试的接口形态 [29]。

## 实跑验证（2026-10-02 追加）

调研后应要求实际跑通了该项目，把两条原本靠代码推断的结论升级为观测级证据。环境：M2 Pro 32GB、macOS，隔离在 `/private/tmp/pixelle-video-survey`（浅 clone HEAD 2026-06-14 + `uv sync` 独立 venv），**未改动本仓任何生产文件**。

**跑通的那条路 = 它最低成本档**：文案＝本地 Ollama `ornith:1.5-9b`（OpenAI 兼容端点）、配音＝edge-tts `zh-CN-YunjianNeural`、版式＝`1080x1920/static_default.html`。全程 0 元、无 ComfyUI、无 RunningHub、无任何付费云。产物 `final.mp4`：**1080×1920、h264+aac、27.04 s、4 个分镜、1.22 MB，端到端 41 秒**（22:17:58 → 22:18:39）。样片与抽帧已存 `scripts/short-video/experiments/pixelle-video-sample/`（gitignored，按 `media-asset-management.md`「临时产物 → experiments/」规则）。

### 三个必须踩过才知道的部署坑

1. **Playwright 内核缺失，且失败点很深。** 它的 `playwright` 版本需要 `chromium_headless_shell-1208`，本机只有本仓在用的 `chromium-1234`（playwright-core 1.63）。报错发生在 `_step_compose_frame` 内部（`frame_html.py:474`），即**跑完 LLM 文案、分镜、TTS 配音之后**才炸；`docs/zh/getting-started/installation.md` 全文没有 `playwright install` 这一步，它只出现在 `Dockerfile:55` 和 `frame_html.py:25` 的注释里。修复：在它的 venv 内 `playwright install chromium`（共享缓存里并列新增目录，不影响本仓那份）。
2. **thinking 模型会让它静默产出空文案。** 该模型把 `max_tokens=2000` 预算全花在 `reasoning_content` 上，`content` 长度为 0；`llm_service.py:200` 确实 warn 了「LLM returned empty text content」，**但继续往下走**，最终死在 `content_generators.py:502` 的 `_parse_json`。这与 main 上那两条 6 月修复（`fix: The issue of null content field returned by LLM`、`handle null LLM content`）是同一类问题——修成了"不崩在调用处"，没修"不要拿空串去解析"。绕法：加一层本地转发，向 Ollama 传 `think:false`。
3. **这个 gguf 在默认批大小下必崩。** `graph_compute ... ret = -3`（Ollama 日志），OpenAI 端点直接 500；只有 `num_ctx 8192 + n_batch 32` 才稳定。代价是生成速度显著变慢。**这三条都是它文档没写、我们若引入会同样踩到的坑。**

### 「轮播」的三条代码级判据（不是观感）

「它不是会生成视频吗」——会，但生成物只是卡片的背景。三条独立证据：

- **静图不加运动**：`video.py:601 create_video_from_image` 的实现是 `ffmpeg.input(image, loop=1)` + `t=音频时长`，即一张静图循环到配音结束；全仓没有 `zoompan` / Ken Burns 一类运镜滤镜。
- **文字层是一张 PNG**：`video.py:514 overlay_image_on_video` 的参数注释写得很清楚，叠加物是 `Transparent overlay image (rendered HTML with transparent background)`。所以走 `video_*` 模板时**背景会动、标题正文页脚一动不动**；字幕也不是独立轨道，是画进图里的（`StoryboardFrame.composed_image_path`）。
- **镜头之间硬切**：`concat_videos` 只有 demuxer 与 filter 两种拼法，无 `xfade`；`video.py:708` 自己写明 `Fade effects are applied to BGM only`——淡入淡出只给音乐。

**实测量化**：对 27 秒成片按每 2 秒抽 1 帧（14 帧），相邻帧灰度平均像素差——同一分镜内为 `0.003 / 0.001 / 0.003 / 0.002 / 0.000 / 0.000 / 0.008 / 0.000 / 0.005 / 0.000`，只有三处跳变 `3.095 / 2.113 / 2.023`，且正好落在分镜切换点。即这 27 秒在数学上是 **4 张静止卡片硬切**。（注：此测量适用于 `static_*` 档；`image_*` 档背景换成 AI 静图、`video_*` 档背景换成 AI 短片，文字层与硬切结构不变。）

### 官方文档站的示例库是坏的

`docs/zh/gallery/index.md` 里每条案例视频的 src 都写成未配置的占位域名 `https://your-oss-bucket.oss-cn-hangzhou.aliyuncs.com/pixelle-video/...`——**文档站上的官方样片一条都放不出来**。能看的官方样本只有 README 内嵌的 14 条 `github.com/user-attachments/assets/...` 直链与 B 站教程 `BV1WzyGBnEVp`，且属厂商自选样本（宣传口径，非第三方评测）。

### 云端后端 RunningHub 是什么（选型判据，非项目本身）

它 15/23 类工作流独占绑定的 RunningHub，经取证是**三合一服务**：云端 ComfyUI 工作流托管 + 工作流/AI 应用市场（有创作者分成，按有效运行人次、收藏数、原创度计酬）+ 模型 API 转售聚合（目录含可灵、Vidu、海螺、Seedance、万相、混元 3D、Seedream、FLUX，且自标「低价渠道版…不稳定」与「已下架」）。运营主体**安徽海马云智能科技发展有限公司**，2025-02-13 成立，注册资本 1000 万，合肥高新区，法定代表人赵珅；母公司为云游戏/云渲染出身的海马云。据 Tier 2 报道，海马云 2026-07 **港股 IPO 申请失效**、累计亏损 14.97 亿、资产负债率 244.29%，咪咕（13.08%）既是股东又是第一大客户、优刻得（7.02%）既是股东又是供应商且对其 1.45 亿应收计提 50% 坏账。**与阿里巴巴未找到任何股权或合作的一手证据**——「Pixelle 默认用它」不等于「两者有合作」。

对我们真正有约束力的是条款，且这条我直读官网原文复核过：《付费服务协议》第 **二.2.2** 条规定许可为「**非商业用途的、可撤销的……只能出于个人、非商业目的使用服务**」，第四.2/四.5 条为不可退款、平台有权单方调整。子 Agent 另报告两条我未能在同一页复现的（§10.3 用户须授予平台全球永久免费可多层再许可地使用其输入与生成内容、含改进模型用途；§7.3 付费用户可要求去除 AI 生成显式标识），**标为单一来源待印证**，不作为已核实结论；但若成立，其合规影响重于非商业条款。稳定性侧：黑猫投诉 9 条（生成失败后客服失联、宣传单价与实际不符、开通会员仍需另充、邀请码拒绝解绑）；官方说明书自认「海外域名卡顿」「同参数运行时间差异」「OOM」；API 变更日志 2026-01-15 移除过端点，破坏性变更有先例。

免费额度方面，官方首页可查到的唯一口径是「邀请 1 名新用户可得 500 RH 币，新用户得 500 RH 币」，**未找到无条件注册赠送额度的官方说法**；RH 币与消费的兑换率与会员档价格均在登录墙后（实测 `/vip-rights/2` 未登录 302、`/api/vip/priceList` 返回 `TOKEN_MISSION`，官方说明书在飞书登录后），因此**无法估算一条测试片要花多少**。API 域名从本机可达（`openapi/v2` 无 key 返回 `HEADER_API_KEY_NOT_FOUND`，服务活着只差凭据）。**结论：本机复现它宣传观感的路径不成立**——直连媒体供应商只支持 OpenAI/DashScope/ARK/Kling，本仓 `.env.local` 一个都没有（只有 GEMINI/GROQ/HF，Gemini 那条 `image_nano_banana` 仍需 ComfyUI 自定义节点）；RunningHub 则受非商业条款约束且额度不可预估。

### 值得学的五点，以及每点和在飞票的关系

1. **让模板声明素材依赖，而不是让调度猜。** 它的 `static_/image_/video_` 前缀就是模板对"我要不要 AI 素材"的契约，pipeline 据此整段跳过生成（`standard.py:161`）。我们的 `visualType` + `mediaStrategy` 是两套词表且靠推断（提案 F4/F7 已记录：缺省 `"asset"` 会静默复用他场景媒体）。注意方向差异：#355/#354 在做的是「把声明从场景上摘掉、变默认链」，而这一层的价值是「**把声明挪到模板上**」——两者不冲突，是同一件事的两个位置。
2. **原子能力 REST 化。** `/frame/render`、`/tts/synthesize`、`/content/image-prompt` 均可单点调用，重做一帧不必重跑全片。我们 `main.mjs` 是整条跑，#421（全量缓存命中跳过 forced alignment 静默产出无字幕视频）、#423（失败路径不落缓存 meta 致已付费 GPU 产物作废）这类票的病根之一正是"没有可独立重跑的局部入口"；#228 的「Remotion 增量渲染」覆盖渲染侧，接口侧仍空。
3. **run 级隔离目录 + 自描述 manifest。** 每次生成一个时间戳 task 目录，`metadata.json` 存本次参数、`storyboard.json` 存分镜，History 页可回看对比。我们 `output/{slug}/` 与 `pipeline-status.json` 是**单文件覆盖式**——本次调研就实际撞上「新跑一条会覆盖在飞的 deepseek-harness-desktop 状态」，这是真缺口且无在案票。
4. **`template_params` 受控定制。** 不改代码即可换 accent_color 等样式参数。我们改风格要动 `remotion/src/` 组件，属 #291「模板视觉系统重做」的同一域。
5. **进度事件带语义步骤名 + 可注入 callback**（`generating_narrations` / `processing_frame` / `concatenating`），观测性优于我们的 console 输出。

需要一并记下的反面：那 41 秒的代价是**没有任何事实与质量门**——它全自主产出的旁白里，「这其实和人的记忆有关，我们记住的东西越多，越容易把不同的事情混在一起记错」是模型编造的类比，无来源。我们不该羡慕速度本身，只该羡慕接口形态。

**落地动作（2026-10-02，用户批准）**：第 3 点新开 **#462**（状态与产物单文件覆盖式）；第 1 点作为票评补进 **#355** 的 D3 视野；第 4 点（含 25 个竖屏版式清单与"动画层是分水岭"的反面判据）补进 **#291**；第 2、5 点（入口粒度与步骤名）补进 **#228**；第 1 点的延伸——版面与素材形态不联动（`NarrativeScene.tsx:52` 只读 `scene.layout`、组件内无视频/静图分支）——新开 **#463**。五点均未在本轮动代码。

## Contrarian Views & Risks

- **「完全免费」是有条件的口径。** 免费路线要求本地 NVIDIA GPU 跑 ComfyUI，或只用 `static_*` 纯文本模板；一旦要用它自己宣传的数字人/图生视频/新视频模型，就必须买 RunningHub 或直连 DashScope/ARK/Kling [15][16][22]。引用这个项目时不要把「0 元」当既成事实。
- **star 与真实触达不匹配，但对停摆的严重性容易被低估。** 英文社区零命中、官方 YouTube 33 订阅 [21][25]。**但本报告不主张刷星**——我们没有星数来源的直接证据，只能说关注度集中于中文圈，把它列为未决问题而非结论。
- **「停摆原因」是单一来源。** #127 的人员自述身份由 `author_association` 字段证实，动机不可验证；官方从未发过停更公告。任何「阿里放弃该项目」的表述都是推断 [11]。
- **内容形态风险大于代码风险。** 「插画轮播 + 配音」是被平台治理过的形态 [26]。即使我们只借它的版式，也要避免把成片退化为静态卡片序列——这正是我们保留 Remotion 动画层的理由。
- **直接复用它做渲染层有安全前科。** 文件服务的词法白名单缺陷仍在 main 上（High 代码层 / Medium 端到端）[18][24]。若某天要参考其 API 形态，路径校验必须 `resolve()` 后再 `relative_to()`，不能用 `startswith`。
- **上游依赖本身也在停摆。** `ComfyKit`（作者自有库，102★）停在 2026-01-06；`moviepy==1.0.3` 是 2020 年版本，2.x 已改掉 `from moviepy.editor import ...`，所以该 pin 不是保守而是被迫 [5][10][14]。

## Open Questions

1. 逐日 star 曲线未取得（stargazers 接口对本机 token 全线 404），只能确认活跃期驱动了全部增长、当前约 24★/天 [12]。
2. 停摆是项目级还是产品线级决策、有无内部 roadmap，无任何一手材料。
3. RunningHub 与该项目是否存在官方合作——只见「主推云端方案」与并发/会员限制，未见合作协议证据 [22]。
4. 是否有人正在私底下做可用 fork（公开面没有：最高 49★ 且更早停）[12]。
5. 社区渠道（微信群二维码 / Discord）是否彻底失效，只有 issue #42/#234 的单方陈述 [11]。

## 证据分级与落笔前更正

- **High**：全部由 GitHub API 或本地 clone 直接证实的事实（日期、计数、文件树、依赖、代码片段）。能力边界（15 类云端独占）额外获得维护者 issue #229 的独立承认，属代码 + issue 双源。
- **Medium**：跨侧结论——安全缺陷的端到端可利用性（代码层已复现，未对实做 PoC）、停摆动机（单一来源，身份已证实）、组织归属中 AIDC→ATH 的划转（一手公告缺失，仅 `NOTICE` + org 改名事实 + 澎湃报道 [1][2][40]）。
- **Low / 仅作线索**：内容农场与自媒体转述的数字与结论（蚪云、鲸吞源码、头条、B 站实测）——它们只用于「社区如何认知」，不用于事实判定 [25][26][27]。
- **落笔前更正两处**：① 我先前在对话中说「31 个工作流」，实际是 **29 个工作流文件（selfhost 8 + runninghub 21）、去重 23 类、15 类云端独占**；② `open_issues_count=169` 含 PR，纯 issue 为 open 146 / closed 41、open PR 23，两组数字自洽 [1][11]。
- **子 Agent 报告的一处日期笔误**（2026-10-29）已按当日实测口径修正为 2026-10-01。
- **2026-10-02 实跑后的分级变化**：「卡片轮播形态」与「免费口径有条件」两条由代码推断**升级为观测级**（成片 27 s / 4 帧 / 同场景帧差 ≤0.008 + 三处切换点跳变）；RunningHub《付费服务协议》二.2.2「非商业用途」为**我已直读官网复核的 High**，而 §10.3 内容再许可授权与 §7.3 付费去除 AI 标识**仅见于子 Agent 抓取、同一页未能复现，降为单一来源待印证**，不得作为已核实结论引用。三个部署坑（Playwright 内核、thinking 空返回、`n_batch` 计算错误）为 High——每条都有本机可复现的报错原文。

## Sources

1. https://api.github.com/repos/ATH-MaaS/Pixelle-Video — 当日元数据（28,557★ / 4,165 fork / Apache-2.0 / created 2025-11-07 / pushed 2026-06-14 / homepage 字段）— Tier 1
2. https://api.github.com/repos/ATH-MaaS/Pixelle-Video/{commits,releases,tags,branches,contributors,languages} — 提交与发版时间线、8 分支上限、245 vs 26 commits、语言体积 — Tier 1
3. https://arxiv.org 与 OpenAlex 检索 "Pixelle-Video" — 零命中（项目无专属论文，否定结论）— Tier 1
4. https://github.com/puke3615 profile + `git log` 提交邮箱 `xuzhenran.xzr@alibaba-inc.com` — 作者身份（自述 company: Alibaba）— Tier 1
5. https://github.com/puke3615/ComfyKit — 102★，pushed 2026-01-06（作者自有底层依赖停摆）— Tier 1
6. https://github.com/ATH-MaaS/Pixelle-Video/blob/main/README.md（本地 clone HEAD 2026-06-14）L19-62 功能宣称、L36-48 更新时间线、L400-470 费用口径与「参考项目/系列工作」— Tier 1
7. `pixelle_video/services/frame_html.py` L25、L328-340 — Playwright Chromium 截屏出帧 — Tier 1
8. `pixelle_video/services/video.py` L16-71 — 合成层为 ffmpeg-python（拼接/concat）— Tier 1
9. `pixelle_video/models/storyboard.py` L23-74 — `StoryboardConfig`/`StoryboardFrame` 契约（默认 5 帧、5–20 词、30fps）— Tier 1
10. `pyproject.toml` L9（`requires-python>=3.11`）、L28（`moviepy==1.0.3`）、`fastmcp>=2.0.0` + `uv.lock`（fastmcp 2.14.4 / mcp 1.26.0 无 import）— Tier 1
11. https://github.com/ATH-MaaS/Pixelle-Video/issues/{127,175,233,254,229,207,222,39,42,234,115,109,165,36,71,226,239,257} 及 issue/PR 计数（open 146/closed 41、23 PR）— Tier 1
12. https://api.github.com/repos/ATH-MaaS/Pixelle-Video/{stats/participation,events,forks,security-advisories} — 周提交峰值 76、连续 15 周 0、抽样 24★/天、fork 画像、无 advisory — Tier 1
13. https://api.github.com/repos/ATH-MaaS/Pixelle-Video/commits?sha=gh-pages — 文档站末次部署 2026-01-08 — Tier 1
14. https://api.github.com/orgs/ATH-MaaS 及 `orgs/AIDC-AI`(404)、`repos/AIDC-AI/*`(301→ATH-MaaS)、`repos/ATH-MaaS/{ComfyUI-Copilot,Pixelle-MCP,Pixelle-Studio}` — org 改名与产品线活跃度对照 — Tier 1
15. `workflows/selfhost/`（8 文件）与 `workflows/runninghub/`（21 文件）文件树差分 — 15 类云端独占（`digital_*`、`af_scail`、`video_wan2.2`、`i2v_LTX2`、`tts_spark`、`video_understanding` 等）— Tier 1
16. `docs/zh/faq.md` L23-32、L60-64；`docs/zh/index.md` L68 — 「不一定需要 ComfyUI」「云端方案费用较高」— Tier 1
17. `config.example.yaml` L9-91 — LLM/OpenAI 兼容、api_providers(openai/dashscope/ark/kling)、comfyui/runninghub 与默认 workflow、模板命名约定 — Tier 1
18. `api/routers/files.py` L58-95 + 本报告的隔离复现（`/tmp/pv-guard-check`，纯逻辑复刻，正/负对照）— 词法白名单可被点段绕过 — Tier 1（代码）+ 自有实验
19. `NOTICE` L1（`Copyright (C) 2025 AIDC-AI`）与 `LICENSE`（Apache-2.0，附录模板未填）— Tier 1
20. https://aidc-ai.github.io/Pixelle-Video/zh （实测 404）与 https://ath-maas.github.io/Pixelle-Video/zh （实测 200，页脚 `Copyright © 2025 Pixelle.AI`）— 官方站改名遗留 + 正对照 — Tier 1
21. https://hn.algolia.com/api/v1/search?query=%22Pixelle%22 — 0 命中（story 与 comment 皆无）— Tier 1
22. `docs/zh/getting-started/installation.md` L17（本地 ComfyUI 建议 NVIDIA 6GB+）、`configuration.md` L42-49（RunningHub 24G/48G、无需本地 GPU）、`reference/config-schema.md` L20/L59-60（`plus` = 48GB）— Tier 1
23. 本仓 clone 检索：无 `test_*.py` / 无 `tests/`；`.github/workflows` 仅 `docs.yml` — Tier 1
24. https://github.com/ATH-MaaS/Pixelle-Video/pull/175（2026-06-18 关闭说明「24 天无维护者回应」）、`SECURITY.md` 404 — Tier 1
25. 蚪云分享社 2026-09-26（RTX 3060 出图 2–3 分钟/张、20 分镜 2–3 小时、「自动剪辑的工头」）；官方 YouTube 频道 33 订阅 — Tier 3
26. 鲸吞源码 2026-09-19（快印店 vs 剧组、跨镜头一致性不承诺、教程与代码脱节警示；其记录的 6-14 推送/v0.1.15 与 API 吻合）；知乎专栏 2026-06-14「狂揽2.2万星」；头条 2026-08-30「破万 Star」 — Tier 3
27. B 站：官方教程 `BV1WzyGBnEVp`（止 2026-02-03）、htc911 二开整合包 `BV1W9RrBfERm`（评论区「网盘是空的」）、AI王知风 2026-05-16 实测「一天 100 条」 — Tier 3
28. `pixelle_video/pipelines/{linear,standard,asset_based,custom}.py` 阶段骨架与子类化设计 — Tier 1
29. `api/app.py` L111-135（仅 CORS 中间件、9 个 router 挂载）+ `api/routers/*.py` 端点清单（`/frame/render`、`/tts/synthesize`、`/video/generate/sync` 等）— Tier 1
30. `web/app.py`、`web/pages/1_🎬_Home.py`、`web/pipelines/{digital_human,action_transfer,api_workflows}.py` — Streamlit 形态与云端/本地工作流来源切换 — Tier 1
31. `docs/zh/development/architecture.md` L1-53 — 50 行、Python 3.10+（与代码冲突）、「详细的架构文档即将推出」— Tier 1
32. `Dockerfile` L4/L55、`docker-compose.yml` — 有产物、文档站零提及 — Tier 1
33. `workflows/runninghub/tts_index2.json` 与 `StoryboardConfig.ref_audio` — IndexTTS2 声音克隆路径（云端）— Tier 1
34. `templates/{1080x1920,1080x1080,1920x1080}/` 计数 25/1/5 与模板命名 — 版式候选库 — Tier 1
35. https://aclanthology.org/2025.acl-demo.61/ — ComfyUI-Copilot（ACL 2025 demo，作者一作）— Tier 1
36. https://arxiv.org/pdf/2501.12909 — FilmAgent（SIGGRAPH Asia 2024，作者一作）— Tier 1
37. https://github.com/harry0703/MoneyPrinterTurbo（gh api：127,818★、open issue 43、pushed 2026-10-01）— 同赛道维护状态反转对照 — Tier 1
38. 本仓 `docs/research/agent-video-skills-180-screening-2026-09.md` §2 五条筛出口径与「5 个月未 push 降只读」先例 — Tier 1（内部）
39. 本仓 `docs/video-production-runbook.md`、`docs/content-pipeline.md` — 对照侧事实（Stage 0–5、CosyVoice3 ADR-0019、三字段文本契约、首帧安全区）— Tier 1（内部）
40. https://m.thepaper.cn/newsDetail_forward_32778860 — 阿里 2026-03-16 内部备忘录：新设 Alibaba Token Hub（ATH）事业群，下辖通义实验室与 MaaS 业务线（解释 org 前缀含义，非一手公告）— Tier 2

### 实跑验证追加（2026-10-02）

41. `scripts/short-video/experiments/pixelle-video-sample/`（`pixelle-text-only-sample.mp4` + `f_02.jpg` / `f_12.jpg`；源产物 `/private/tmp/pixelle-video-survey/output/20261002_221759_68e3/final.mp4`，日志 `/tmp/pv-run3.log`）— 自有实验产物，Tier 1 — ffprobe 实测 1080×1920 / h264+aac / 27.04 s / 1.22 MB / 端到端 41 s
42. `pixelle_video/services/video.py:601` `create_video_from_image` — 静图 `loop=1` + `t=音频时长`，无运镜滤镜 — Tier 1
43. `pixelle_video/services/video.py:514` `overlay_image_on_video` 参数注释 `Transparent overlay image (rendered HTML with transparent background)` — 文字层为单张 PNG — Tier 1
44. `pixelle_video/services/video.py:108-168`（`concat_videos` 仅 demuxer/filter，无 `xfade`）与 `:708`（`Fade effects are applied to BGM only`）— Tier 1
45. `pixelle_video/services/llm_service.py:198-200`（空 content 只 warn 不中断）与 `pixelle_video/utils/content_generators.py:502`（`_parse_json` 抛 `No valid JSON found`）— Tier 1
46. `pixelle_video/services/frame_html.py:25`（注释里的 `playwright install --with-deps chromium`）、`:474`（渲染失败抛错点）、`Dockerfile:55` — 对照 `docs/zh/getting-started/installation.md` 全文无此步骤 — Tier 1
47. 帧差测量：`/tmp/pv-frames/f_*.jpg`（每 2 s 抽 1 帧，14 帧）+ PIL `ImageChops.difference` 灰度均值（脚本在 Pixelle venv 内即时执行，输出见本报告「轮播」节）— 自有实验
48. `docs/zh/gallery/index.md` — 官方示例库视频 src 为未配置占位域名 `your-oss-bucket.oss-cn-hangzhou.aliyuncs.com` — Tier 1
49. https://www.runninghub.cn/defray-protocol — 《付费服务协议》二.2.2「非商业用途的、可撤销的……只能出于个人、非商业目的使用服务」、四.2/四.5 不可退款与平台可调整（**本 Agent 直读复核**）— Tier 1
50. https://www.runninghub.cn/ （2026-10-02 首页：邀请 500 RH 币口径、Seedance2.5/Wan3.0 按秒价、国庆限时免费）+ https://www.runninghub.cn/runninghub-api-doc-cn/api-425749013.md （`instanceType` 24G/48G/84G、错误码 421/415/813/814、`retainSeconds`）+ https://www.runninghub.cn/runninghub-api-doc-cn/llms.txt （模型 API 目录，自标"低价渠道版…不稳定"/"已下架"）+ https://runninghub.feishu.cn/wiki/Vc77w5EaUirOY5kyTQNcrr7GnUd （使用说明书，含"海外域名卡顿""OOM"FAQ；正文需登录，未复现）— Tier 1
51. https://aiqicha.baidu.com/s?q=安徽海马云智能科技发展有限公司 （主体登记信息，源＝国家企业信用信息公示系统）+ https://mp.weixin.qq.com/s/bygc8puWmTmN2KSt7otkwA （量子位 2026-09-10，母公司海马云）+ https://m.sohu.com/a/1074892518_122014422/ （财中社 2026-09-11，IPO 失效 / 亏损 14.97 亿 / 负债率 244.29% / 咪咕与优刻得双重身份）— Tier 1 + Tier 2
52. https://tousu.sina.com.cn/index/search/?keywords=RunningHub — 9 条投诉（2026-04-16～09-12，个人陈述，未见平台公开结论）— Tier 2 平台 / Tier 3 陈述
53. https://github.com/comfyanonymous/ComfyUI （README 经 `gh api` 直读：支持 `NVIDIA, AMD, Intel, Apple Silicon, Ascend`；全文无 MLX；4GB VRAM + 8GB RAM 权重流送宣称；pushed 2026-10-02）— Tier 1（用于判定"MPS 可行 / 无 MLX 后端 / 上游本身仍高频活跃"）
54. 本仓 `.env.local` 键名清单（只列名不取值）：有 `GEMINI_API_KEY` / `GROQ_API_KEY` / `HF_TOKEN`，无 `DASHSCOPE` / `ARK` / `KLING` / `OPENAI` — 判定「按设计跑一条」在本机不可行的依据 — Tier 1（内部）
55. 本仓 `docs/research/media-strategy-unification-proposal-2026-09.md` F4/F7/D1b/D2/D3、`docs/issue-roadmap.md` Wave 3B、开放票 #291 / #228 / #354 / #355 / #421 / #423 — 五条可学习项与在飞工作的对账依据 — Tier 1（内部）
