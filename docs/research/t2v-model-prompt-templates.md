# T2V 逐模型 prompt 模板研究（#757）

> 触发问题（#757，从 #289 交付 deferred 的 Part 3）：declared b-roll prompt 现在只有一条通用 compose 路径，长度/格式/语言靠 agent 自觉。不同 T2V 模型的文本编码器、槽位偏好、运镜词表与 negative 机制不同，是否需要一层 per-model 模板？
>
> 本笔记只回答「各 family 官方契约是什么、哪些可复用、模板表该长什么样」。**不改生成路径**（接线另票，见 §5）。

## 0. 结论

1. **本仓唯一实际生成路径是 Wan 家族**：默认 `fastmetal-5b`（FastMetal-5B-QAD，base = Wan2.2-TI2V-5B），退路 `fastmetal-1.3b`（FastMetal-1.3B-QAD，base = Wan2.1-T2V-1.3B）。两者都走 UMT5-XXL、512 token 上限（1.3B 走 `--max-sequence-length`，5B 在驱动里写死 512）。因此模板层的第一价值是**槽位顺序 + 镜头词表 + token 预算**，不是「换模型」。
2. **四个候选 family 的官方 prompt 契约都能一手取证**，但准入结论不同：
   - **Wan 2.1 / 2.2**：Apache-2.0，官方 prompt 公式 = Entity + Scene + Motion（高级再加 Aesthetic control + Stylization）；云 API 原生 `negative_prompt`（≤500 字符）。**在产线，准入。**
   - **Seedance 1.0**：闭源商业 API；官方公式 =（镜头语言 + 光影）+ 主体 + 主体运动 + 场景 +（氛围）+（风格）；官方运镜词表最全（推/拉/摇/移/环绕/跟随/升/降/变焦）；无 negative 参数。**只吸规则，不吸代码/权重。**
   - **HunyuanVideo 1.5**：官方公式 = Subject + Motion + Scene + [Shot Type] + [Camera Movement] + [Lighting] + [Style] + [Atmosphere]；许可为 **Tencent Hunyuan Community License**（EU / UK / South Korea 不适用），不是 Apache-2.0；仓库最近提交 2026-04-10（距本笔记 >6 个月）。**不推荐引入（许可 + 活跃度）。**
   - **CogVideoX**：T5-XXL、英文长 prompt、2B/5B token 上限 224/226；代码与 2B 为 Apache-2.0，5B 为自定义 CogVideoX LICENSE（商用需登记、月访问 100 万封顶）；仓库最近提交 2025-11-04（约 12 个月）。**不推荐引入（活跃度 + 5B 许可附加条件）。**
3. **negative 机制不能统一伪造**：Wan 云 API 有 `negative_prompt` 参数，但本地 MLX 驱动没有该参数（`mlx_wan_batch.py` 只收 `{label, prompt, output_path, seed}`），现状是代码把 `no text / no hands / no watermark` 作为**正向 prompt 子句**注入；Seedance / Hunyuan / CogVideoX 官方 prompt 文档均无 negative 参数。模板表因此声明 `negativeMode`，而不是给每个模型编一个 negative 列表。
4. **建议模板表收 3 个 family**：`wan2.2`、`wan2.1`（在产线）+ `seedance`（唯一有独立官方契约、且可能成为云端备选的候选）。Hunyuan / CogVideoX 的证据保留在本笔记，不进模块——避免把不推荐的模型固化成死配置（见 §3 与 §6）。

## 1. 本仓现状（Tier 1：本地代码）

| 事实 | 位置 |
| --- | --- |
| 生成 prompt = declared prompt + BRAND 条件注入 + 缺失 NEGATIVE 子句 | `scripts/short-video/lib/b-roll/prompt-injection.mjs` `composeGenerationPrompt` / `composeImagePrompt` |
| 文本编码器上限 512，预算硬门禁 480 | `runner.mjs` `MAX_SEQUENCE_LENGTH = 512`；`prompt-budget.mjs` `MAX_PROMPT_TOKENS = 480`（#922 自 prompt-injection.mjs 拆出） |
| 两个模型档位 | `runner.mjs` `MODEL_TIERS`：`fastmetal-5b`（704×1280×121f@24fps，UMT5 512，预量化）/ `fastmetal-1.3b`（480×832×81f@16fps，int8） |
| 本地驱动只接受 prompt 字符串 | `mlx_wan_batch.py` jobs 字段 `{label, prompt, output_path, seed?}`，无 negative 参数 |
| declared prompt 写作协议与 8 维归属 | `docs/video-script-writing-guide.md` §Declared b-roll prompt 写作协议；`prompt-injection.mjs` 头注释 |
| 现无 per-model 模板 | 本票新增模块前，全仓无 `modelId → 模板` 映射 |

结论：模板层必须与既有注入层**同向**——只消费 declared prompt 与 8 维语义，不改 NEGATIVE/BRAND 的代码归属。

## 2. 逐模型官方 prompt 契约

### 2.1 Wan 2.1 / 2.2（阿里）

**官方公式（两档）**

- 基础：`Prompt = Entity + Scene + Motion`
- 高级：`Prompt = Entity (description) + Scene (description) + Motion (description) + Aesthetic control + Stylization`
- Aesthetic control 含光源/光照环境/景别/机位/镜头/运镜；官方明确「运镜带情绪意图」：push-in = 亲密/紧张，pull-out = 尺度/孤立，tracking = 与主体同行，orbit = 强调主体，fixed camera = 静止/聚焦。
- 图像条件模式：`Prompt = Motion + Camera movement`。

**运镜词表（官方示例口径）**：`camera pushes in`、`camera moves left/right`、`camera moves up/down`、`camera pulls back`、`camera tilts`、`camera pans`、`camera orbits`、`camera rotates 360 degrees`、`camera follows`、`fixed camera`。短标签式（`dolly in` / `pan left`）见官方 prompt dictionary，但公式段示例一律用完整句子 `the camera ...`。

**Negative**：云 API（Wan 2.1–2.6）支持 `negative_prompt`，支持中英文，**≤500 字符**，超出自动截断。本地 MLX 驱动无此参数——现状只能把排除子句写进正向 prompt。

**语言 / 长度**：官方示例以英文为主，API 支持中英文；本地 UMT5-XXL 上限 512 token，现有 compose 预算 480（含注入常量）。

**双源校验**：官方 prompt guide（更新于 2026-10-10）+ 官方 API reference（negative_prompt）+ 官方仓库（Apache-2.0、TI2V-5B 入口）一致；`FastMetal-5B-QAD` 模型卡确认 base 为 Wan2.2-TI2V-5B、Apache-2.0。

### 2.2 Seedance 1.0（字节 / 火山引擎）

**官方公式（文生视频）**：`Prompt =（镜头语言 + 光影）+ 主体（主体描述）+ 主体运动 + 场景（场景描述）+（氛围）+（风格）`；括号项可删。官方示例强调「像写分镜一样写 prompt」，支持多镜头叙事（Shot 1 / Shot 2 分段）。

**运镜词表（官方最全）**：基础运镜 `推、拉、摇、移、环绕、跟随、升、降、变焦`；景别 `远景 / 全景 / 中景 / 近景 / 特写`；机位 `水下 / 航拍 / 高机位俯拍 / 低机位仰拍 / 微距 / 以 xx 为前景`。官方示例用中文「镜头推近 / 镜头右摇 / 镜头环绕 / 镜头跟随 / 镜头升起 / 变焦镜头」。

**参数**：`resolution` / `ratio` / `duration` / `seed` / `camera_fixed` / `watermark`；`camera_fixed` 是布尔参数，**不是 prompt 文本**。无 `negative_prompt`。

**语言 / 长度**：提示词支持中英文；官方未给 token 上限（商业 API 内部处理），模板不设硬预算。

### 2.3 HunyuanVideo 1.5（腾讯）

**官方公式**（Prompt Handbook）：`Prompt = Subject + Motion + Scene + [Shot Type] + [Camera Movement] + [Lighting] + [Style] + [Atmosphere]`；括号内可选，官方建议「更长、更细的自然语言」。

**运镜库**：`camera moves upward/downward`、`moves left/right`、`moves forward/back`、`tilts up/down`、`pans left/right`、`circles around`、`rotates 360 degrees`、`follows`、`remains static / fixed camera position`。

**语言**：官方示例中英混杂，均受支持。

**许可（重要更正）**：Hugging Face 模型卡标注 `License: tencent-hunyuan-community`，LICENSE 原文写明 **不适用于 EU / UK / South Korea**。这与 `docs/research/open-source-video-generation-landscape-2026.md` L21「HunyuanVideo 1.5 为 Apache 2.0」冲突——那一结论来自 Tier 3 横评，按事实双源规则以官方 LICENSE 为准，**旧结论应视为错误**。

**活跃度**：GitHub 最近提交 2026-04-10，距本笔记已超过 6 个月，按 `docs/agents/proposal-review.md` §4 不推荐引入。

### 2.4 CogVideoX（智谱 / THUDM）

**官方 prompt 契约**：模型用长 prompt 训练，官方要求先用 LLM（GLM-4 或同类）把用户输入改写成结构化长描述；prompt 语言英文；**token 上限：CogVideoX-2B 224 / CogVideoX-5B 226**。官方没有独立运镜词表（运镜写在自然语言里），无 negative 参数。

**许可**：仓库代码与 CogVideoX-2B 为 Apache-2.0；CogVideoX-5B（含 I2V/T2V）为自定义 `CogVideoX LICENSE`——学术免费，商用需在 open.bigmodel.cn 登记，月访问 ≤100 万。

**活跃度**：GitHub 最近提交 2025-11-04（约 12 个月），按 §4 不推荐引入。

## 3. 模板映射表的决策

模块只导出**已准入**的 family；每个 family 的槽位名对齐仓库 8 维契约（SUBJECT / VISUAL METAPHOR / REFERENCE / CAMERA / MOTION / LIGHTING），BRAND / NEGATIVE 仍由注入层拥有。**可执行值（槽位顺序、词表、预算、`negativeMode`）的单一事实来源是模块本身**，下表只记录准入决策与外部事实：

| familyId | 状态 | 官方公式（外部事实） | 准入理由 | negative 能力（外部事实） |
| --- | --- | --- | --- | --- |
| `wan2.2` | 在产线（默认 `fastmetal-5b`） | Entity + Scene + Motion + Aesthetic control + Stylization | Apache-2.0 + 现役默认档 | 云 API 有 `negative_prompt`（≤500 字符）；本地 MLX 驱动无该参数 |
| `wan2.1` | 在产线（退路 `fastmetal-1.3b`） | 同 `wan2.2` | Apache-2.0 + 现役退路档 | 同 `wan2.2` |
| `seedance` | 候选（云端 API，未接线） | （镜头语言 + 光影）+ 主体 + 主体运动 + 场景 +（氛围）+（风格） | 唯一有独立官方契约的云端候选；闭源 API 只吸规则 | 官方文档无 negative 参数 |

实现：`scripts/short-video/lib/b-roll/prompt-templates.mjs`（导出 `PROMPT_SLOTS`、`PROMPT_TEMPLATES`、`MODEL_TIER_FAMILIES`、`familyForModelTier`、`getPromptTemplate`、`renderPromptForModel`、`renderDeclaredPrompt`，纯函数）。`MODEL_TIER_FAMILIES` 由各模板的 `modelTiers` 在 import 时派生（含同档位重复归属报错），测试同时校验其 key 都在 `runner.mjs` 的 `MODEL_TIERS` 内。测试：`scripts/short-video/lib/__tests__/b-roll-prompt-templates.test.mjs`。

**未入表（证据保留在本笔记）**：`hunyuanvideo`（community license + 仓库 >6 个月无提交）、`cogvideox`（5B 商用登记 + 仓库约 12 个月无提交）。若后续重新准入，按本笔记 §2.3 / §2.4 的官方公式补表即可，不改模块结构。

**模板层不负责**：BRAND / NEGATIVE 的注入（`prompt-injection.mjs` 拥有）、生成参数（steps / CFG / seed）、模型选择（`BROLL_MODEL` 环境变量）、scene-data 结构。

## 4. 许可分级与可复用边界

| 来源 | 许可 | 分级 | 可复用边界 |
| --- | --- | --- | --- |
| Wan2.1 / Wan2.2 官方文档与仓库 | Apache-2.0（`LICENSE.txt` 实测） | **Tier A** | 公式、词表、示例结构可吸收进代码与文档，保留署名 |
| FastMetal-5B-QAD 模型卡 | Apache-2.0 | **Tier A** | 档位参数与入口结论可引用 |
| Seedance 1.0 官方提示词指南 | 闭源商业 API 文档 | **Tier B** | 只吸「公式 / 运镜词表 / 参数行为」事实，不复制文档段落、不取代码或权重 |
| HunyuanVideo 1.5 Prompt Handbook | Tencent Hunyuan Community License（EU/UK/KR 排除） | **Tier B** | 只吸公式与词表事实；代码/权重不入产线 |
| CogVideoX 文档与代码 | Apache-2.0（代码/2B）；CogVideoX LICENSE（5B） | **Tier A / B** | 代码/2B 可复用；5B 商用需登记，且仓库停滞 → 当前不引入 |

外部事实均按 `docs/agents/proposal-review.md` §3 做了双源校验：官方 prompt guide + 官方 API/repo/model card；许可以 LICENSE 原文为准，不以横评转述为准。

## 5. 接线现状（#922）与仍未接线项

#922 已把模板层接进 b-roll 生成路径，采用**最小接线**：不解析 `SUBJECT:` 式标签、不新增结构化字段、不重排现有 prompt，因此现有内容包的 declared / composed prompt 逐字不变。接线的是四件事：

1. **family 解析** — `orchestrator.mjs` 的 `runBrollStage` 每次 run 用 `familyForModelTier(resolveModelTier(env))` 解析一次（约等于档位 → family 的单一映射）。
2. **family 预算门禁** — `composeGenerationPrompt(scene, familyId)` 先过 `renderDeclaredPrompt()`：declared 超预算抛 `RangeError`，orchestrator 写 `failed` entry（reason 带 family、实际 tokens 与超出量）；composed 再用 `getPromptTemplate(familyId).maxPromptTokens` 判一次，reason 同样带 family 与超出量。
3. **report provenance** — 视频 entry 记录 `promptFamily`；图片 entry 不记（T2I 不骑 T2V family）。
4. **local negative-mode 守卫** — `renderDeclaredPrompt()` 拒绝 `integration !== "pipeline"` 或 `negativeMode !== "prompt-clause"` 的 family，因为本地 MLX 驱动没有 negative 参数。

历史四条要求的落点（保留）：

1. 用已导出的 `familyForModelTier()` / `MODEL_TIER_FAMILIES` 把 `resolveModelTier()` 的结果转成 familyId，不要再建第二套模型命名 → 已由 `runBrollStage` 消费。
2. 云端 Wan API 才可使用 `negative_prompt` 参数；本地路径继续用正向排除子句，二者不能互换 → `renderDeclaredPrompt()` 的 `negativeMode` 守卫把非 `prompt-clause` family 挡在产线外。
3. 模板渲染必须过 `MAX_PROMPT_TOKENS`（480），超预算要在接线层报出，而不是静默截断 → declared 门禁抛 `RangeError`，composed 门禁写 `token-budget` failure reason。
4. 渲染结果必须与 VLM claim gate 使用的 raw declared prompt 分离（沿用 #166 的 gate separation）→ `composeGenerationPrompt` 只作用于 generation jobs；`buildClaim` 仍读 raw prompt，由 #922 测试锁定。

**仍未接线**：

- **槽位重排**（`renderPromptForModel`）：现有 declared prompt 是不透明单 clause，且两个在产 family 的 `slotOrder` 完全相同；重排需要先有结构化 clause，否则只会产生零收益 diff。
- **Seedance**：`integration: "candidate"`，云端 API 候选，非产线。

## 6. 已否决的替代方案

- **单一通用模板**：无法表达 Wan 的 5 维公式、Seedance 的「镜头语言 + 光影」前置、CogVideoX 的 224 token 英文长 prompt；等于维持现状。
- **把所有 prompt 统一翻成中文**：Wan 本地 UMT5 对中英文都支持，但现有 333 个有声场景的 declared prompt 全为英文，翻译会引入无收益的 diff 与缓存失效（prompt-embed cache 以字符串为键）。
- **给每个 family 手写 negative 词表并注入**：只有 Wan 云 API 有官方 `negative_prompt` 语义；其余三家官方无此参数，编词表属于无来源的猜测，且会与 `NEGATIVE_GROUPS` 的代码所有权冲突。
- **现在就把 Hunyuan / CogVideoX 写进模板表**：触发 §4 的许可/活跃度红线，且没有接线计划；保留研究证据即可。

## Sources

1. https://help.aliyun.com/en/model-studio/text-to-video-prompt — Alibaba Cloud Model Studio：Video generation prompt guide，更新 2026-10-10（基础/高级公式、Aesthetic control、运镜情绪意图、prompt dictionary、多镜头公式）— **Tier 1**，访问 2026-10-24。
2. https://help.aliyun.com/zh/model-studio/legacy-wan-text-to-video-api-reference — 万相文生视频 API（2.1–2.6）：`negative_prompt` 支持中英文、≤500 字符 — **Tier 1**，访问 2026-10-24。
3. https://github.com/Wan-Video/Wan2.2 — Wan2.2 官方仓库：Apache-2.0 `LICENSE.txt`、TI2V-5B 入口、`--use_prompt_extend`（DashScope / local_qwen）— **Tier 1**，访问 2026-10-24。
4. https://huggingface.co/FastVideo/FastMetal-5B-QAD — FastMetal-5B-QAD 模型卡：base Wan2.2-TI2V-5B、INT8 QAT、Apache-2.0 — **Tier 1**，访问 2026-10-24。
5. 本地代码：`scripts/short-video/lib/b-roll/runner.mjs`（`MAX_SEQUENCE_LENGTH=512`、`MODEL_TIERS`）、`mlx_wan_batch.py`（jobs 无 negative 字段）、`prompt-injection.mjs`（compose）、`prompt-budget.mjs`（预算 480）— **Tier 1 本地实测**，2026-10-24。
6. https://www.volcengine.com/docs/82379/1631633?lang=zh — 火山引擎：Seedance-1.0-pro & pro-fast 提示词指南（参数、基础/复杂运镜、景别、多镜头示例）— **Tier 1**，访问 2026-10-24。
7. https://www.volcengine.com/docs/86081/1805694 — 火山引擎智能视频：文生视频 prompt 公式「（镜头语言 + 光影）+ 主体 + 主体运动 + 场景 +（氛围）+（风格）」— **Tier 1**，访问 2026-10-24。
8. https://huggingface.co/tencent/HunyuanVideo-1.5 — 腾讯混元 1.5 模型卡：`License: tencent-hunyuan-community`、Prompt Guide 入口 — **Tier 1**，访问 2026-10-24。
9. https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5/blob/main/assets/HunyuanVideo_1_5_Prompt_Handbook_EN.md — HunyuanVideo 1.5 Prompt Handbook：公式、运镜库、光照/风格/氛围写法 — **Tier 1**，访问 2026-10-24。
10. https://raw.githubusercontent.com/Tencent-Hunyuan/HunyuanVideo-1.5/main/LICENSE — Tencent Hunyuan Community License：EU / UK / South Korea 不适用 — **Tier 1**，访问 2026-10-24。
11. https://github.com/zai-org/CogVideo — CogVideoX README：prompt optimization（GLM-4）、长 prompt、英文、token 上限 224/226、许可分工（代码/2B Apache-2.0、5B 自定义）— **Tier 1**，访问 2026-10-24。
12. https://huggingface.co/THUDM/CogVideoX-5b/raw/main/LICENSE — CogVideoX LICENSE：学术免费、商用需登记、月访问 ≤100 万 — **Tier 1**，访问 2026-10-24。
13. `docs/research/open-source-video-generation-landscape-2026.md` L21 — 旧结论「HunyuanVideo 1.5 为 Apache 2.0」来自 Tier 3 横评，与官方 LICENSE 冲突，以来源 10 为准 — **Tier 3（已更正）**。
14. GitHub API `pushedAt`（2026-10-24）：Wan2.2 `2026-09-21`、HunyuanVideo-1.5 `2026-04-10`、CogVideo `2025-11-04` — **Tier 1**。
