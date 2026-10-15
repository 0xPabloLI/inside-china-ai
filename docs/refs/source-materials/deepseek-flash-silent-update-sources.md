# Source Materials — DeepSeek flash API 悄悄更新（2026-10-14）

> Stage 0 素材集合。用户提供线索（量子位微信文章 URL）+ 一手来源核实。
> 用途：Stage 1 文章与 Stage 3 scene-data 的共同素材源。
> **核实状态：已核实**（2026-10-14 10:10 CST 结束，见文末 §4 核实日志；逐条结论以 §3 为准——官方口径、X 原帖与第三方归档均已核实，量子位不再是单一来源）。

## 0. 用户提供线索（原始）

- **URL**: https://mp.weixin.qq.com/s/qRFi0UYEm5APrQIbcSkfeQ
- **标题**: DeepSeek又悄悄更新了？！实测：API突然变强
- **作者**: 鱼羊（量子位 / 公众号 QbitAI）
- **发布时间**: 2026-10-14 09:08（北京，页面 meta 显示）

### 文章核心事实（逐条）

1. DeepSeek 官方没有任何公告，但用户发现官方 `deepseek-flash` 接口「返回的东西不一样了」。
2. 最早发现者：X 博主 @ItsmeAjayKV（文中称 AJ）；他称**生成速度变得稍慢了一些**。
3. 对比：左边 9 月份 deepseek-v4.1-flash 的产出 vs 右边 10 月 12 日 API 吐出的结果 —— 更丰富的细节表现。
4. 动画流畅性：10 月 12 日版 API 输出较 9 月版「优化良多」（来源 x@quimedesu）。
5. 光影效果更精细，美学风格有倾向变化（来源 x@ItsmeAjayKV）。
6. 与 GPT 6 Luna 的对比：提示词为「制作一个极其逼真的 Minecraft 克隆版，做到精良且与原版完全一致。运用你所掌握的一切知识，不遗漏任何细节，使用 JavaScript，并使其极其逼真。」——结论：光影和材质表现上细节略逊，但整体挺不错（来源 x@GuneyNar59589）。
7. 量子位编辑自测：「鹈鹕骑自行车」（9 月 9 日 v4.1 flash 上线时的同款测试）—— 作者称新车把「可算是有 hu 把着了」（即细节改善）。
8. 社区猜测三种可能：**DeepSeek-v4.2-flash** / **DeepSeek-v4.1-flash 的新 checkpoint** / **v4.1-pro 返场**。
9. **反证（重要）**：也有人坚定认为「自己测试后没有发现明显区别，这可能只是模型输出的随机波动」。
10. 文章自认：「官方盖章之前，一切还只是坊间推测」。

### 文章引用的参考链接

- [1] https://x.com/ItsmeAjayKV/status/2109886995241832863
- [2] https://x.com/ItsmeAjayKV/status/2109554096491606483
- [3] https://x.com/GuneyNar59589/status/2110020190864072922
- 另提及 @quimedesu（无链接）

### 页面媒体（SVE 缓存，见 `content/deepseek-flash-silent-update/research/media-cache.json`）

- 4 张图片（mmbiz.qpic.cn，其中 1 张为正文头图）
- 4 段 mp4（mpvideo.qpic.cn，即文中对比视频，含 50s / 31s / 30s / 30s 四段；URL 带 auth_key，**可能过期**）
- og:image: https://mmbiz.qpic.cn/mmbiz_jpg/A6fTew8FFGHURJnFcWDYjhic5OhjQUjbib3kmao60ROtqFFxbNAgNFBf8SaV9TnoHCCGpmkAoub4wp1O6VULGh7XMDicPcsZxweZmmrkicZb9FQ/0?wx_fmt=jpeg

## 1. 文章全文（抓取原文，中文）

> 抓取方式：web-access CDP（`#js_content` → markdown），2026-10-14 09:49 CST。

##### 鱼羊 发自 凹非寺量子位 | 公众号 QbitAI

DeepSeek又悄么声更新模型了！

还是熟悉的配方，还是熟悉的味道，官方一点动静没有，但热心网友们还是发现：

官方「deepseek-flash」接口，返回的东西不一样了。

来看直观对比：

（视频 1，时长 00:50，来源 x@ItsmeAjayKV）左边是 9 月份 deepseek-v4.1-flash 的出品，右边是 10 月 12 日 API 吐出的结果。很明显有了更丰富的细节表现。并且就最早发现这事儿的博主 AJ 说，生成速度变得稍慢了一些。

这事儿一传开，大肥鱼爱好者们纷纷相互验证。一大波测试来袭的同时，几种猜测开始被热议：

- DeepSeek-v4.2-flash；
- DeepSeek-v4.1-flash 的新 checkpoint；
- 甚至可能 v4.1-pro 要返场了？！

## DeepSeek API突然变强

官方未宣之前，咱们还是先来品鉴一波实测对比。

左边是 9 月 9 日版 v4.1，右边是「最新版」：

（视频 2，时长 00:31，来源 x@quimedesu）可以看到，在动画的流畅性上，10 月 12 日版 API 的输出结果较之 9 月版优化良多。

（视频 3，时长 00:30，来源 x@ItsmeAjayKV）光影效果也明显表现得更精细了。并且美学风格似乎也有了一些倾向变化。

除了自身对比，还有网友把 10 月 DeepSeek API 的输出结果，和 GPT 6 Luna 做了对比。

提示词是：

> 制作一个极其逼真的 Minecraft 克隆版，做到精良且与原版完全一致。运用你所掌握的一切知识，不遗漏任何细节，使用 JavaScript，并使其极其逼真。

（视频 4，时长 00:30，来源 x@GuneyNar59589）光影和材质表现上细节略逊，但整体挺不错！

刚好 9 月 9 日 v4.1 flash 悄悄（怎么又是悄悄）上线的时候，我让鹈鹕浅蹬了把自行车：（图片）

这就当场再蹬一把看看有啥不一样：（图片）

该说不说，这车把手可算是有 hu 把着了。

这一对比，大肥鱼爱好者已经迫不及待搓手搓手了，毕竟这种悄摸整活的事，正是 DeepSeek 的风格（bushi）。（图片）

不过，也有人坚定认为：自己测试后没有发现明显区别，这可能只是模型输出的随机波动。（图片）

当然啦，官方盖章之前，一切还只是坊间推测。

不知道在座大肥鱼爱好者最新蹬起模型来是否也体验到了不同？欢迎随时来评论区分享蹬后感啊！

另外就是，坐等官方～

参考链接：
[1] https://x.com/ItsmeAjayKV/status/2109886995241832863
[2] https://x.com/ItsmeAjayKV/status/2109554096491606483
[3] https://x.com/GuneyNar59589/status/2110020190864072922

## 2. 项目内已有相关背景（RAG 检索结果，2026-10-14）

| 已有内容 | 角度 | 与本条的差异 |
| --- | --- | --- |
| `deepseek-v41-flash`（视频，09-10 发布） | V4.1 Flash 测试/上线、架构与价格 | 本次是**同一端点在上线一个月后再次变化**，属后续事件 |
| `deepseek-v41-flash-report`（文章+视频，09-12） | V4.1 Flash 发布、Pro API 接管 | 同上；本次不重复发布叙事 |
| `deepseek-harness-desktop`（09-30） | 桌面 agent 产品 | 无关 |
| `deepseek-embodied-ai`（10-13，HITL 中） | 具身智能投资 | 无关 |

- RAG 查询词：`DeepSeek flash API 更新 v4.1`（article + scene-data 各一次，Ollama bge-m3，0.40.2 在线）
- 结论：**无角度碰撞**，本条是 v4.1-flash 发布之后的「静默更新」事件，可独立成片。

## 3. 核实结果

### V2 官方口径 — ✅ 已核实：官方无任何 10 月公告

核实范围与结果（抓取日 2026-10-14）：

| 官方渠道 | 最后更新 | 10 月有无内容 |
| --- | --- | --- |
| API 文档 Models & Pricing（api-docs.deepseek.com/quick_start/pricing） | 列 2 个模型：`deepseek-flash`（DeepSeek-V4.1-Flash）、`deepseek-v4-pro`（DeepSeek-V4-Pro-0813） | 无 10 月新模型 |
| API Change Log（api-docs.deepseek.com/updates） | 最新条目 **2026-09-10**（V4.1-Flash Release） | **无** |
| API News（/news/news260910） | 最新一篇 2026-09-10 | **无** |
| 平台公告栏（platform.deepseek.com） | 最新公告 = V4.1-Flash 发布（2026-09-10） | **无** |
| 官网 /news | 最新 2026-09-10 | **无** |
| X @deepseek_ai | 最新帖 2026-10-02（桌面版 Harness，非模型）；上一条 2026-09-10 | **无** |
| HuggingFace deepseek-ai | 10-12 有提交，但为社区维护者（GeeeekExplorer）的 gitignore / 删 `__pycache__` / chat template 提交，**非官方模型发布**；权重与 README 的官方提交停在 2026-09-10 | 无官方发布 |
| 官方微信公众号 | 无法一手核实（无公开归档） | 未知 |

**关键官方原文（定价页脚注）**：

> Use `deepseek-flash` as the model name. The legacy names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are still accepted, but the corresponding models have been retired, their requests are served by the DeepSeek-V4.1-Flash model and billed at the Flash price.

→ 即：`deepseek-flash` 是 V4.1-Flash 的唯一入口名；不存在独立的 `v4.2` 或新 checkpoint 命名。官方最后一次相关公告为 2026-09-10。

### V5 反证与 V7 猜测性质 — ✅ 已核实：反证存在，猜测均为社区推测

**独立佐证强度：弱（基本单源）**

- 除量子位外，**无机构媒体**独立报道（机器之心 / 36氪 / InfoQ / 智东西 / APPSO 均无 10-10~10-14 相关原创）。
- 中文侧实际存在的同期来源是 AI 聚合站（什么值得买，页面明确标注「内容由AI生成」）+ 个人用户发言（知乎提问、B 站视频、微博），且它们聚焦 **10-13 的网页/App 灰测**，而非 10-12 的 API 端点变化。
- 英文社区无独立讨论：HN 窗口内无相关帖（仅 1 个 1 分 0 评论的链接帖）；Reddit 直读被网络策略拦截，索引中未见窗口内相关帖。

**硬指标整体偏反证**：

| 观测点 | 结果 |
| --- | --- |
| `system_fingerprint` 监控归档（deepseek-monitor-archive.pages.dev，导出 2026-10-13） | `deepseek-flash` 指纹自 2026-09-10 起一直为 `aeb56401ca74e127821c4f9126dcb669`，**10-12 前后无任何指纹变更事件**；最近一条事件是 2026-09-19 12:45 |
| 官方 Change Log | 停在 2026-09-10 |
| Artificial Analysis Changelog | 10-12 / 10-13 新条目为 Gemini 4 Argon、GPT-6 Luna、Muse Wonder 等，**无 DeepSeek**；最近一次 DeepSeek 条目是 10-09（为已在册模型补 provider 数据，非新版本） |
| OpenRouter（deepseek/deepseek-v4.1-flash） | Released Sep 10, 2026，无版本/日期变化；模型族中**没有 v4.2-flash** |

**反证原话**：

- 量子位文内自带：「不过，也有人坚定认为：自己测试后没有发现明显区别，这可能只是模型输出的随机波动。」
- B 站视频标题（BV1d1pR6zE4C）：「谨慎相信！DS新模型灰测在X被爆出，**无较大差异**」

**「变慢」的量化（单一开发者转述，未获原文核对）**：smzdm 聚合文转述一位开发者 10-12 起测速：平均 **175.41 tok/s**（最低 146.7 / 最高 234.6）。该文自身也指出：「变慢不等于变弱……只能证明端点背后发生了变化，证明不了变化的方向。」

### 另一半故事（量子位未覆盖）：10-13 网页/App 灰测与「降智」争议

这是本事件**方向相反的另一半**——API 侧传闻是「变强」，而网页/App 侧同期出现大量「变弱/降智」投诉：

| 来源 | 标题 / 主张 | 日期 | URL |
| --- | --- | --- | --- |
| 什么值得买（AI 生成） | DeepSeek新模型开启前端灰测：是什么、变没变弱，都还没有官方答案 —— 10-12 夜~13 日网页/App 灰测；海外有人发现 API 端点行为改变 | 2026-10-13 | https://post.smzdm.com/p/a9569el0/ |
| 什么值得买（AI 生成） | DeepSeek悄悄换了新版本被骂降智… —— 10-12 API 静默更新 + 10-13 网页灰测 | 2026-10-13/14 | https://post.smzdm.com/p/avgp7k99/ |
| 知乎（个人提问） | 10月13日DeepSeek 再次灰度测试能力下降怎么看？—— 5 回答 / 9 关注 / ~9092 浏览，多为吐槽（「路由到Fable」、「变成英文了」），无技术结论 | 2026-10-13 | https://zhihu.com/question/2093330572101923174 |
| B 站（个人 UP） | 【奇区无比？】Deepseek突现1013灰测前端是什么水平？—— 5.8 万播放，灰测实测 | 2026-10-12 23:29 | https://bilibili.com/video/BV1Pipf6AEAP/ |
| B 站（个人 UP） | 【DeepSeek V41】灰测性能前瞻 四则测试例「前端 游戏设计」 | 2026-10-13 | https://bilibili.com/video/BV1evWF6QE62 |

**反证性技术背景（smzdm 引用，未获原文核对）**：字节 Seed 论文称分块 KV 压缩的「相位敏感性」导致 V4-Flash 长文检索准确率落差 40.23 个百分点，V4 后训练降到 19.1，V4.1-Flash 进一步降到 6.1；AI 科技评论用现役 V4.1-Flash 复测「64 次固定采样设置…全部补全为正确答案 '8'，没有出现翻转」。

### 核实状态汇总

| # | 主张 | 状态 |
| --- | --- | --- |
| V1 | 变更发生在 2026-10-12 前后 | ⚠️ 部分核实：社区报告集中在 10-12~10-13；无独立第三方确认 |
| V2 | 官方无公告 | ✅ 已核实（8 个官方渠道，最后更新停在 2026-09-10） |
| V3 | 变化内容与「速度变慢」 | ⚠️ 部分核实：仅主观视频对比；「变慢」为单一开发者测速转述，未获原文核对 |
| V4 | 端点名确为 `deepseek-flash` | ✅ 已核实（官方定价页脚注 + 模型表） |
| V5 | 存在反证 | ✅ 已核实（指纹归档无变更 + 量子位文内自带反证 + B 站「无较大差异」） |
| V6 | 与 GPT-6 Luna 的对比细节 | ✅ 已核实：见下方 §3.4（该帖仅 8 浏览、0 喜欢，不构成佐证） |
| V7 | 社区猜测系推测非事实 | ✅ 已核实（官方无对应命名/公告） |

> **⚠️ 编辑部结论**：这是一则**基于主观视频对比的社区传闻**，缺乏独立第三方可验证证据，且存在明确反证（指纹未变、官方静默、聚合平台无新版本）。同时，社区在**变化方向**上自相矛盾（API 侧说变强、网页/App 侧说降智）。文章与视频必须以此为准，不得复述「API 变强」为既定事实。

### 3.4 X 一手证据逐帖核实（2026-10-14）

> 抓取方式：web-access CDP 直读 X（登录态 @silenlee，中文界面，逐条「显示原文」）。所有时间为 UTC。

| Handle | 时间 | 原话要点 | 证据 | 互动 |
| --- | --- | --- | --- | --- |
| @loktar00 | 10-12 14:27 | 「这是 Deepseek V4.1 Flash，他们在幕后偷偷升级吗？1 prompt、0 revision、直连 API」 | 视频（蚂蚁动画，无对比标签） | 705 赞 / 4.4 万浏览 |
| @ItsmeAjayKV | 10-12 10:05 | 「`deepseek-flash` 端点现在似乎路由到不同模型；可能是 v4.2-flash 或 v4.1-flash 更新检查点；因也稍慢，怀疑 v4.1-pro 在端点后悄悄测试」 | 视频（Sep release vs Oct 12 对比） | 279 赞 |
| @ItsmeAjayKV | 10-12 06:28 | 测速自测：平均 **175.41 tok/s**（最低 146.7 / 最高 234.6），称「这是我见过的 DeepSeek-V4.1-Flash 最慢的速度」 | 数字 | — |
| @ItsmeAjayKV | 10-12 07:57 | 日文：「感觉 `DeepSeek-V4.1-Flash` 在背后被更新了……现在的 `deepseek-flash` 端点感觉比以前好多了」（原文用「気がします」= 感觉） | 视频，画面标注左 `deepseek-v4.1-flash-September` / 右 `deepseek-v4.1-flash-October-12` | 31 赞 / 15,490 浏览 |
| @quimedesu | 10-12 18:49 | 「Deepseek v4.1 flash 在幕后获得了新更新，@ItsmeAjayKV、@loktar00 和我**相信**是这样」 | 视频，缩略图标注左 `Deepseek v4.1 Sep 9th` / 右 `Deepseek v4.1 Oct 12th` | 425 赞 / **115,692 浏览** |
| @ItsmeAjayKV | 10-13 06:00 | 「Deepseek-v4.1-flash 变了，现在其他人也看到了」；追问官方会叫 `-1013` 还是 `v4.2-flash` | 引用 quimedesu 的同一视频 | 620 赞 / 52,044 浏览 |
| @MikelEcheve | 10-13 07:19 | 「v4.1-flash 刚刚静默更新，差异明显；体素图像生成显著改进」 | 视频 | — |
| @xiax0603（中文） | 10-13 07:22 | 「💥实锤！DeepSeek-v4.1-Flash 悄悄变强……多名社区测试者交叉验证、已被确认属实」（**「实锤」属过度断言**） | 转述 | — |
| @unbug（中文） | 10-13 15:12 | 「所以这是 DeepSeek-V4.1-Flash-1013 吗？不确定，但绝对更具创造性」 | 转述 | — |
| @lilililiMozi（中文） | 10-13 23:39 | 「DeepSeek 4.1 Flash 1013 真有点东西」（3D 鹈鹕测试） | 视频 | 8,409 浏览 |
| **@dummerspast39（反驳者）** | 10-12 16:22 | 「官方 API 上没有新的 DeepSeek 检查点……测了很多（知识、视觉、SVG），读了推理，对比旧 4.1 flash —— 结果是：模型就是**随机得要命**」 | 文字 | 16 赞 |
| @GuneyNar59589 | 10-13 14:49 | 「Deepseek V4.2 Vs Gpt 6 Luna」Minecraft 对比（标题断言 v4.2 已存在，无日期/版本对照） | 视频 | **仅 8 浏览 / 0 赞** |

**关键结论**：

1. 传闻**在 X 上确有其事**，且传播量真实（单条对比视频 11.5 万浏览，三条主帖合计 20 万+）。
2. 但**全部证据都是主观视觉对比**——没有任何一条帖子报告 API 返回的 `model` / version 字段或 `expires` 标签发生变化。
3. 存在**明确反驳者**（@dummerspast39，实测后称无新 checkpoint、只是随机性），且量子位自己也承认有人测不出差异。
4. 「速度变慢」只有 @ItsmeAjayKV 一人的自测（175.41 tok/s 均值），无第二方复现。
5. 量子位引用的第三条（@GuneyNar59589）只有 8 浏览、0 喜欢，**实质不构成佐证**——量子位把它与另两条并列，夸大了证据强度。
6. @xiax0603 的「实锤」等中文转述进一步放大了断言强度（「已被确认属实」），属于**二次放大**。

## 4. 核实日志

- 2026-10-14 09:49 CST：抓取量子位原文 + SVE 媒体缓存；RAG 查询完成（无角度碰撞）。
- 2026-10-14 09:55 CST：`search-sources.mjs --keyword "DeepSeek flash" --research --content-id deepseek-flash-silent-update` 完成（768 篇 → 去重 505 条，0 失败源），落盘 `research/discovery.json`。
- 2026-10-14 10:00 CST：三个并行核实子任务启动（X 原帖 / 官方口径 / 社区交叉验证）。
- 2026-10-14 10:12 CST：官方口径核实完成（V2/V4/V7 ✅）；社区交叉验证完成（V5 ✅，并发现 10-13 灰测「降智」的另一半故事）。
- 2026-10-14 10:10 CST：X 一手证据核实完成（V6 ✅，§3.4）。**Stage 0 核实全部结束。**

## 5. 视频证据截图（2026-10-14 补录）

Stage 5 HITL 复审时用户指出视频缺视觉素材。按用户裁决（只用真实截图 + 明确风格化的示意图；只补关键证据场景），用 web-access CDP（自动化 profile `~/chrome-tiktok-profile`:9229）实拍以下页面，落盘 `scripts/short-video/content/deepseek-flash-silent-update/assets/`。

**全部为真实页面截图，无任何伪造或重构的产品页面。** 每条断言都指向它实际依赖的那个页面。

| 素材 | 对应场景 | 页面 | 抓取方式 |
| --- | --- | --- | --- |
| `changelog-hook.png` | S1 hook | https://api-docs.deepseek.com/updates | 两次滚动截图（y=0 / y=890）纵向拼接 → 按正文栏 1916px 宽裁出精确 9:16（1916×3406） |
| `loktar-evidence.png` | S2 首发帖 | https://x.com/loktar00/status/2109652056063582631 | 隐藏 header/sidebar + 译文 UI 后截 article，裁 handle→正文；合成到 1080×814 暗底（避开品牌栏与字幕道） |
| `quimedesu-evidence.png` | S3 对比视频 | https://x.com/quimedesu/status/2109718081681449325 | 取该帖视频封面原图（X CDN `amplify_video_thumb`，1200×900），裁掉底部黑边后合成暗底 |
| `dummer-evidence.png` | S5 反证帖 | https://x.com/dummerspast39/status/2109681157742760299 | 同上（隐藏译文 UI，裁 handle→正文） |
| `archive-log.png` | S6 指纹记录 | https://deepseek-monitor-archive.pages.dev/fingerprints/ | 深色模式，滚动到「监控记录」列表，裁左侧事件卡栏 |

**第二轮抓取（2026-10-14 晚，用户指出「截图不完整」后重拍）**：S2/S5 两张 X 帖重抓，改动三点——(1) 每帖先点「显示原文」把正文切回**英文原文**（X 的自动翻译会把帖文译成中文，截图前必须切回），(2) 隐藏「显示翻译／翻译自 英语」这行浏览者界面元素（它不属于帖子内容），(3) 裁切点放在**元素边界**上：正文底 → 卡片下沿之间的空白处，不再把配图/视频从中间切开。S2 帖内含视频、S5 帖内含两张测试截图，整卡（1272 设备像素高）在 614px 的媒体窗口里按可读字号放不下——放大到能读就要切图，整卡塞下则正文只剩约 13px。选择保住正文可读性、在元素边界收口，成片里不再出现半个元素。S3 为视频封面整图（源图左右两侧本就是满幅出血，非裁切），未改动。

> X 界面语言：用户已把账号语言改为英文，自动化 profile 重新加载后确认 `document.documentElement.lang === "en"`（此前那批截图是改设置之前加载的页面，故带中文界面）。S2/S5 卡面里可见的 chrome 只有 X 图标与「…」菜单，与语言无关；帖文正文为英文原文。

**素材构图约束（MRL-3 第一轮证据渲染失败后确定）**：`media-bottom-bar` 的媒体窗口是 y∈[0,814] 的 1080 宽画面，而 TikTok 右侧操作栏从 x=880 起（y∈[640,1775]），帧门禁（`verify-remotion-frames.mjs`）要求该区域亮像素 <5%。白色网页整幅都是亮像素（实测 S2 15.5% / S3 13.0% → FAIL），故三个 X 帖素材统一重构为 **880×814**：y<200 留暗带给品牌栏，正文卡按 0.815 缩放居中，y>700 为暗底，两侧由 `fit:"contain"` 的画布底衬补齐。**不采用「提高 overlay」方案**：白色页压到 α>0.72 方能过门禁，但页内正文对比度只剩约 2.3:1，证据就不可读了。

**关键数字的页面口径（截图当日实读，与正文数字一致）**：

| 数字 | 页面出处 |
| --- | --- |
| 44,577 views | @loktar00 帖 DOM `aria-label`：`64 回复、30 次转帖、709 喜欢、92 书签、44577 次观看` |
| 115,692 / 121,079 views | @quimedesu 帖 DOM `aria-label`：`12 回复、21 次转帖、432 喜欢、54 书签、121079 次观看`（页面显示「12.1万」；§3.4 记录的 115,692 为 10-14 早间读数，浏览仍在增长，视频采用 115,692） |
| 10 个指纹事件 / 最近 2026-09-19 12:45 | 归档首页统计「模型指纹 事件 10」+ 事件列表首条 |
| `deepseek-flash` → `aeb56401ca74e127821c4f9126dcb669` | 归档「当前指纹」表：`deepseek-flash` 与 `deepseek-v4-flash` 都路由到同一指纹 |

**未能取得的素材（已放弃，不影响成片）**：量子位文中 4 段对比 mp4 走 `mpvideo.qpic.cn` 且带 `auth_key`，外部请求一律 403（含 Referer/UA 伪装与页面内 fetch），浏览器内 blob 也无法导出。改用其中一段的官方封面帧（`quimedesu-evidence.png`），信息量等价且无版权模糊地带。


