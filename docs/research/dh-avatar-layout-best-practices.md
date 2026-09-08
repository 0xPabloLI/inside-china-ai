# Deep Research: 数字人 talking-head 与素材/字幕同屏的短视频版面最佳实践

> 2026-09-07 · 为 #214（数字人生成管线整合）S2 spec 前置调研 · Standard 档（5 角度 13 源）
> 研究问题：新闻播报类短视频账号中，AI 数字人/talking-head 与背景素材、字幕同屏时的版面最佳实践（位置/大小/比例，不遮挡关键内容）。

## Executive Summary

三个独立信息域（平台 safe zone 实测、PiP/反应视频版式实践、数字人产品形态）在结论上高度收敛：**9:16 竖屏中数字人应以画中画（PiP）/分区形式与素材同屏——主素材区占 60–70% 版面，数字人 inset 占 30–40%，整体置于平台 UI 死区之内（1080×1920 画布：上 ≥140px、下 ≥400px、右 ≥180px、左 ≥60px 的保守交集内）**。全屏 anchor 形态存在于新华社等机构产品中，但那是「演播室全帧 + 素材插播」模式，与开源 talking-head 模型（512²–816px 输出、超分后仍有限）的画质与僵硬感约束不匹配。

对我们三个候选版面的直接裁决：**右侧竖条变体被平台 UI 否决**（TikTok 右侧 action rail 死区 100–242px，数字人会被点赞/评论按钮叠压）；右下角卡片与底部主播条可行但必须内收进安全区。开源模型输出比例（EchoMimicV3 624×816 竖条）与「安全区内的竖形卡片」天然兼容——只需把卡片从右缘内收，而非贴边。

另一个关键实践（**2026-09-08 降级修正**，原标"多源"系以讹传讹）：「AI 面孔 3 秒法」的精确数字（连续出镜 3–4 秒）唯一可溯原始出处是 PandaiTech（Tier 3 单源），其原始理由是"AI 视频动作僵硬"的画质观察，不是留存数据；多源支持的只是"AI 面孔不宜长时间连续出镜"的定性方向。可引用的替代依据：单构图 ≤3–5s / 每 2–3s 视觉变化的 pattern interrupt 节奏（从业者多源收敛），以及学术侧更根本的发现——中保真 avatar 最触发恐怖谷、高保真最可信（网状 meta N=2,343）。详见 `dh-presenter-usage-strategy-research.md` Key Finding #1。这与我们「按 scene 可选声明、先 hook/CTA 试点」的既定决策互洽——单 scene 时长 5–15s 处于边界，spec 应写明「数字人段内允许 b-roll/图表切出，数字人不必满段在屏」。

## Key Findings

1. **Safe zone 数据（1080×1920，多源三角验证）**：TikTok 顶部死区 130–150px（用户名/音乐标签）、底部 320–400px（字幕/音频行/进度条）、右侧 100–242px（点赞/评论/分享栏，2026-01 新增 Playlist 按钮再 +20px）、左侧约 60px。保守交集约 880×1420 居中 [1][2][3][4]。字幕最佳位置为垂直居中带（中心约 52% 高度处），最低字幕像素不超过 y=1250（65%）[5]。仓库现有 `SAFE_ZONES` 与此一致量级，spec 时对表校准即可。
2. **PiP 版式语义（多源一致）**：inset 小窗暗示「讲者 secondary、内容 primary」的层级——正是数字人 + 背景素材场景的语义。共识比例：主内容 60–70%、讲者 30–40%；位置固定不漂移；放在低冲突角落（避开主视觉动线与 UI 死区）[6][7][8]。
3. **竖屏反应/讲者版式四式**：stacked（上下 40/60）、active-speaker cut、split-screen、PiP——两位/双元素竖屏布局中 stacked 的面部尺寸最大，PiP 的层级感最强，split 在竖屏中最弱（面部过小）[8][9]。
4. **「3 秒法」（2026-09-08 降级）**：AI avatar 连续出镜后切 b-roll 的段内切换是常见留存策略；"3–4 秒"精确数字仅 PandaiTech 单源（Tier 3，原始理由=AI 动作僵硬），多源支持的只是定性方向；AI 头部长时间静止/僵硬是掉留存主因 [10][11]。对管线的含义：数字人 scene 的版面应支持「数字人在屏 ⇄ 素材满屏」的段内切换，而非强制满段在屏。
5. **中文机构实践**：新华社 AI 合主播家族（坐姿→站立→3D）走「演播室全帧主播 + 融媒体素材插播」路线，竖屏分发已有成熟先例 [12][13]；华为/讯飞数字人产品均把「画中画 + 形象位置可调 + 自定义背景」作为标准能力 [14][15]——PiP 布局是中文数字人新闻的既定范式。
6. **合成/抠像技术路线**：HeyGen 官方把 removeBackground（matting）作为 avatar 叠加自定义背景的前提 [16]。开源模型（SoulX/EchoMimicV3）输出整帧视频无 alpha，做圆角卡片分层无需抠像；若未来要「数字人融进背景场景」需增加 matting 步骤（ out of scope 候选）。

## 对三个候选版面的裁决

| 候选 | 裁决 | 依据 |
| --- | --- | --- |
| 变体 1 右下角卡片 | ✅ 可行，需内收 | 卡片右缘离右边 ≥180px、底缘在底部死区（≈400px）之上；落在安全区内即无遮挡 |
| 变体 2 底部主播条 | ⚠️ 可行，但横条底缘必须抬到 y≈1520 之上 | 底部 320–400px 是最高危死区 [3][4]；主播条 + CTA 文字需整体上移 |
| 变体 3 右侧竖条 | ❌ 平台 UI 否决 | 右侧 action rail 死区 100–242px [1][2][3][4]，数字人脸部/身体会被按钮叠压；比例契合是伪优势 |

修正后的推荐形态：**安全区内右下/右中竖形卡片（约 420–500px 宽，624×816 比例内收）**，主素材区满屏铺底，字幕带（52% 高度带）与 CTA 区各安其位；数字人段内支持切出素材满屏（3 秒法）。此形态 Kaggle 免费档（EchoMimicV3 624×816 + dh-upscale 2x）画质足够。

## Contrarian Views & Risks

- **「数字人根本不该常驻」**：3 秒法的定性方向支持者认为 AI 头长时间连续出镜在消耗留存（精确数字单源，见 Key Finding #4 降级注）[10]。我们的对冲：数字人声明按 scene 可选、段内可切出；试点先 CTA（时长短、承诺强）。使用时机白名单/黑名单见 `dh-presenter-usage-strategy-research.md`。
- **Safe zone 数字会漂移**：各源数字不一（右 100 vs 180 vs 242），平台 UI 持续改版（2025-2026 已两次扩张）[3][4]。对冲：取保守交集 + 发布前真机预览；仓库 safe-zones.mjs 单点维护，随 TikTok 改版走既有更新机制。
- **广告位数据比自然流更严**：In-Feed 广告右侧死区实测 242px、底部 707px [4]——若将来投流，PiP 卡片需再缩。当前自然流分发按保守交集设计即可。

## Open Questions

- EchoMimicV3 624×816 卡片内收后，主素材区从现有 CtaScene 全幅改为满屏铺底+前景卡片，视觉上是否与现有 brand 模板协调——用修正版 mockup 验证。
- 数字人段内 b-roll 切出的版式（素材满屏 vs 缩小卡片）属 scene 级设计，留 spec 的 layout 契约决定。

## Sources

1. [BlitzCut — Best Caption Placement for Short-Form Video](https://blitzcutai.com/blog/best-caption-placement-short-form-video) — TikTok/Reels/Shorts 死区实测表（top 130/bottom 320-350/right 120-164） — Tier 3
2. [Argil — TikTok Aspect Ratio Explained 2026](https://www.argil.ai/blog/tiktok-aspect-ratio-cec4c) — safe area ~880×1420、top 150/right 100/bottom 350 — Tier 3
3. [CreaMate — TikTok Safe Zone Guide 2026](https://creamate.ai/en/blog/tiktok-safe-zone-guide) — 保守设计预设 top 140/bottom 400/right 180 + 三平台对照 — Tier 3
4. [AdKit — TikTok Ad Safe Zones](https://adkit.so/tools/safe-zones/tiktok) — In-Feed 广告位实测 right 242px/bottom 707px（官方 ad preview 测量） — Tier 2
5. [ContentEngineAI — Subtitle Best Practices](https://github.com/stkzlv/ContentEngineAI/blob/main/docs/subtitle-best-practices.md) — 字幕中心 52%、y≤1250、跨平台 safe zone union — Tier 2
6. [CapCut — PiP Workflow for Reaction Reels](https://www.capcut.com/create/picture-in-picture-workflow-capcut-match-reaction-reels) — overlay 低冲突角落、固定位置、不遮主内容 — Tier 2
7. [Golpo — Picture-in-Picture Guide](https://video.golpoai.com/guide/golpo-picture-in-picture-guide) — presenter 30-35% 分割/圆形 overlay/上下置放的取舍表 — Tier 2
8. [CutFast — Video Collage Layouts 2026](https://cutfa.st/blog/video-collage-split-screen-reaction-2026-guide-en) — source 60-70% vs reactor 30-40%；竖屏 reaction 40/60 stacked — Tier 3
9. [Quickreel — Framing Two Speakers in One Vertical Clip](https://quickreel.ai/blog/frame-two-speakers-vertical-video) — 四式竖屏双头布局与 PiP 层级语义 — Tier 3
10. [PandaiTech — HeyGen + ElevenLabs faceless workflow](https://pandaitech.my/alpha/bina-video-content-viral-tanpa-wajah-dengan-heygen-8c459f2a) — 「3 秒法」avatar 只出 hook 3-4s — Tier 3
11. [8frame — How to Make a Podcast Video with AI](https://www.8frame.co/blog/how-to-make-podcast-video-with-ai) — talking head 每 45-90s 切 b-roll 的节奏 — Tier 3
12. [新华网 — 新华社 AI 合主播全新升级](https://www.xinhuanet.com/politics/2019-02/19/c_1124136341.htm) — 站立式 AI 主播、竖屏短视频分发先例 — Tier 2
13. [佛山plus — 3D 版 AI 合主播「新小微」](https://content.foshanplus.com/simpleNewsDetails.html?newsId=441844) — 多机位/虚拟演播室全帧形态 — Tier 2
14. [CSDN — 虚拟数字人会替代新闻主播吗](https://blog.csdn.net/weixin_49343044/article/details/109526156) — 华为数字人：画中画/形象位置可调/自定义背景 — Tier 3
15. [讯飞青岛 — A.I. 虚拟主播解决方案](https://qingdao.xfyun.cn/solutions/virtual-host-solution) — 多轨混编/画中画编辑一站式数字人演播室 — Tier 2
16. [Runware/HeyGen Avatar V — Backgrounds & Framing Guide](https://runware.ai/docs/models/heygen-avatar-v/guides/backgrounds-and-framing) — matting/removeBackground 前提、fit mode、9:16 强制 — Tier 1（官方文档）
