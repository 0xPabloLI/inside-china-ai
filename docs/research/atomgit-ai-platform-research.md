# AtomGit AI 平台调研报告

> **调研日期**：2026-09-03
> **调研方法**：浏览器 CDP 实测 ai.atomgit.com + 官方文档（`/docs/models/billing/`、`/docs/models/model-availability-test/`、`/docs/notebooks/`）+ API 实测（12 个模型全部调用成功）
> **调研目标**：评估 AtomGit 作为模型来源 / 免费推理 API / 数字人模型测试平台的价值
> **最终定位**：**备选平台**——模型库托管 ≠ API 可调用；数字人模型全部不可跑；但保留 200 万 Token/月 + 1000 核时/月 NPU 免费额度，万一未来有适配模型可零成本启用

---

## 0. GitCode 与 AtomGit 的关系

**GitCode** 是 CSDN 推出的代码托管平台（类似 GitHub/Gitee）。

**AtomGit** 是开放原子开源基金会 + CSDN（开源共创科技）+ 华为云 CodeArts 联合打造的「开源+AI」一体化平台品牌。

**关系**：2025 年 11 月，AtomGit 完成与 GitCode 的深度融合升级——AtomGit 是**前台品牌**，GitCode 是**底层基础设施**。证据：

- AtomGit 静态资源 CDN：`cdn-static.gitcode.com`
- AI 推理 API 域名：`api-ai.gitcode.com`（GitCode 域名）
- 认证方式沿用 GitCode 风格（`PRIVATE-TOKEN` header 而非标准 Bearer）
- 官方文档（docs.atomgit.com）自述"CSDN 开发者社区与华为云 CodeArts 联合打造"

对开发者的影响：**GitCode 账号 ≈ AtomGit 账号**，token 体系互通（这就是为什么 code-hosting token 和 AI token 容易混淆——它们本质是同一套 GitCode 账号体系下的不同权限 scope）。

---

## 1. AtomGit 是什么

AtomGit AI 是开放原子开源基金会（联合阿里云、CSDN、中电科十五所、北航）建设的「开源+AI」一体化平台（ai.atomgit.com）。定位：**融合 GitHub + HuggingFace 优势的新一代开源 AI 社区**——覆盖"模型托管→推理→训练→应用"全链路。

**规模**：160 万开发者、90 亿开源项目数据、模型库约 39,400 个。

---

## 2. 核心产品构成

| 产品 | 入口 | 用途 | 额度 |
|------|------|------|------|
| **模型库** | `/models` | 浏览/搜索/在线体验 15 种任务类型的模型 | 在线体验消耗 Token |
| **昇腾模型平台** | `/serverless-api` | 包含 CodingPlan + 模型在线体验 | 分开计量 |
| **Spaces** | `/space` | 部署 AI 应用（Gradio/Static），NPU 910B 算力 | 1000 核时/月（免费） |
| **Notebook** | User→我的Notebook | 在线编程环境（文档称 CPU，实测 NPU 910B） | 同 1000 核时/月 |
| **API 密钥** | `/dashboard/api-key` | OpenAI 兼容推理 API | 200 万 Token/月（免费） |

---

## 3. Token 额度实测

来源：用户后台 `/dashboard/free-token` 截图 + `/dashboard/free-core-time` 截图。

| 维度 | 数值 | 周期 | 说明 |
|------|------|------|------|
| **免费推理 Token** | **200 万 (2M)** | **月度** | 用于在线体验 + API 推理，"已使用 N / 2M"计量 |
| **免费核时** | **文档未明确标注总量**（显示"N 核时/月"） | **月度** | Notebook + Space 算力 |

**支持的 15 种 Token 消耗任务类型**（来自后台筛选标签）：
多模态、自由转换、音频分类、自动语音识别、图文转文本、图像生成图像、图像生成文本、图像生成视频、目标检测、句子相似度、文本生成、文本生成图像、文本转语音、文本生成视频、翻译。

**Token 计量规则**（来自官方 `/docs/models/billing/`）：

| 模型类型 | 中文 Token 估算 | 英文 Token 估算 |
|---------|----------------|----------------|
| 文本生成 | 1 Token ≈ 1.5-1.8 字 | 1 Token ≈ 4 字符 |
| 图文转文本 | 文字同上 + 图像（512×512 ≈ 334 Token） | 同左 |
| 自动语音识别 | 50,000 Token/次 | — |
| 文生图 | 50,000 Token/张 | — |

**核时计量规则**：`核时 = CPU 核数 × 运行小时数`

| vCPU | 1 小时消耗 |
|------|-----------|
| 0.5 核 | 0.5 核时 |
| 4 核 | 4 核时 |
| 16 核 | 16 核时 |

---

## 4. CodingPlan（编码助手）— 与推理 Token 独立

AtomCode CodingPlan 是独立产品（对标 Claude Code，开源 Rust 实现），**与 200 万推理 Token 完全分开计量**。

| 套餐 | 调用频率 | 支持模型 | 状态 |
|------|---------|---------|------|
| Lite 体验版 | ~200 次调用/5h 滚动窗口 | mimo-v2.5, qwen3.8-27b, mimo-v2.5-pro | 限时免费 500 人/日，7 天有效 |
| Lite 高阶版 | ~300 次调用/5h | + deepseek-v4-flash | 敬请期待 |
| Pro | ~500 次调用/5h | + GLM-5.2 | 敬请期待 |

**关键结论**：模型**不可自由切换**，按套餐绑定模型。

---

## 5. API 格式

**OpenAI 兼容**（来自 `/docs/models/model-availability-test/`）：

| 任务类型 | 推理端口 |
|---------|---------|
| 文本生成 / VLM / 多模态 | `/v1/chat_completions` |
| 文本转语音（TTS） | `/v1/audio/speech` |
| 自动语音识别（ASR） | `/v1/audio/transcriptions` |
| 向量化（Embedding） | `/v1/embeddings` |

**认证**：在工作台 `/dashboard/api-key` 新建 API Key。
> ⚠️ **实测**：AtomGit AI API 使用 **`PRIVATE-TOKEN` header** 认证（GitCode 风格），NOT Bearer <REDACTED>！
> 
> ```bash
> ✅ curl -H "PRIVATE-TOKEN: <key>" https://api-ai.gitcode.com/v1/models
> ❌ curl -H "Authorization: Bearer <key>" ...  → 401 token not found
> ```

也可以通过 `?access_token=<key>` query 传递。

---

## 6. 硬件：仅 NPU 910B，无 GPU

实测 Space 创建页「算力资源」下拉选项：

| 选项 | 硬件 |
|------|------|
| 默认 | `[限时免费] NPU basic · 1 × NPU 910B · 4vCPU · 8GB` |
| 高阶 | `[限时免费] NPU basic · 1 × NPU 910B · 16vCPU · ...` |

**镜像版本**：`ubuntu22-cann8.5-py311-torch2.8-gradio6.9-v1.0.0`（CANN 8.5）。

**没有 NVIDIA GPU 选项**。

### NPU 910B vs CUDA GPU 对比

| 维度 | NPU 910B | NVIDIA A100 | RTX 4090 |
|------|---------|-------------|----------|
| 架构 | 达芬奇 Da Vinci | Ampere | Ada Lovelace |
| FP16 | 256-376 TFLOPS | 312 TFLOPS | ~82 TFLOPS |
| 显存 | 64GB HBM2e | 80GB HBM2e | 24GB GDDR6X |
| 显存带宽 | ~392 GB/s (HBM2e) / 1.2-1.6 TB/s (HBM3e) | 2.0 TB/s | 1008 GB/s |
| CUDA | ❌ 不支持（需 CANN 转换，~90% 算子自动迁移，性能损耗 14-38%） | ✅ | ✅ |

**对数字人模型的影响**：LatentSync、Sonic、SadTalker、MuseTalk 等 CUDA 硬编码（xformers / `device="cuda"` / bitsandbytes）的模型**在 NPU 910B 上跑不了**。除非社区做了 Ascend 适配版（实测模型库中未发现这些模型的 NPU 版）。

---

## 7. API 可调用模型（实测验证，2026-09-03）

实测可调用模型共 12 个（`GET /v1/models`），与"模型库"39,454 个模型不等价 — 库中大部分权重需下载到 NPU Notebook 本地跑：

| 模型 | 参数量/类型 | 用途 | 实测状态 |
|------|-----------|------|---------|
| **Qwen/Qwen3-30B-A3B** | 30B MoE (3B active) | 文本生成 | ✅ |
| **Qwen/Qwen3-30B-A3B-Instruct-2507** | 30B MoE | 指令跟随 | ✅ |
| **Qwen/Qwen3-30B-A3B-Thinking-2507** | 30B MoE | 链式推理 | ✅ |
| **Qwen/Qwen3-32B** | 32B dense | 文本生成 | ✅ |
| **Qwen/Qwen3-4B-Instruct-2507** | 4B dense | 轻量文本 | ✅ |
| **Qwen/Qwen2-VL-72B** | 72B VLM | 图像+文本多模态 | ✅（纯文本测试通过）|
| **deepseek-ai/DeepSeek-V4-Flash** | MoE | GPT-4o 级文本推理 | ✅ |
| **deepseek-ai/DeepSeek-V4-Pro** | MoE | DeepSeek 旗舰 | ✅ |
| **ascend-tribe/openPangu-2.0-Flash** | 华为开源 | 前沿多任务 | ✅ |
| **openpangu-2.0-pro** | 华为 | Pangu Pro | ✅ |
| **MoonshotAI/Kimi-K2.6** | Moonshot | Kimi 最新 | ✅ |
| **zai-org/GLM-5.2** | Zhipu | GLM 最新 | ✅ |

**关键结论**：
- API 可调用模型 ≪ 模型库模型（12 vs 39,454）
- 大量 GLM-5.3-Flash、MiniMax-H3、LTX-2.5、OpenMOSS 等**模型库有但 API 不可直接调用**
- 可调用模型无一是数字人唇同步模型

| 代表模型 | 类型 | 参数量 |
|---------|------|--------|
| 智谱AI/GLM-5.3-Flash | 图文转文本 | 164.2B |
| 智谱AI/GLM-5.3 | 文本生成 | 377.8B |
| tencent_hunyuan/Hy4-preview | 文本生成 | 18B |
| Qwen/Qwen3.8-27B | 图文转文本 | 27.8B |
| Qwen/Qwen3.8-Flash-Next | 图文转文本 | 180B |
| Atomgit-Ascend/GLM-5.3-Flash-W8A8 | 文本生成（昇腾原生量化） | 7.4B |
| deepseek-ai/DeepSeek-V4-Flash-Vision-Exp | 图文转文本 | 83.9B |
| Lightricks/LTX-2.5 | 图生视频 | — |
| OpenMOSS/Qwen3-8B-base-mla-* | 文本生成（MLA 架构） | 8.2B |
| MiniMax-AI/MiniMax-H3 | 图文生成视频 | — |

部分模型以 `hf_mirrors/` 前缀表示 HuggingFace 镜像，大量是昇腾 NPU 优化版（`Atomgit-Ascend/`）。

---

## 8. 竞品对比

### 国内类 HuggingFace 平台

| 平台 | 运营方 | 定位 |
|------|--------|------|
| **ModelScope 魔搭** | 阿里达摩院 | 最接近 HF 的中国版 |
| **AtomGit AI** | 开放原子基金会 + CSDN | GitHub + HF + 算力三合一 |
| **OpenXLab** | 上海 AI Lab | 国际开源模型平台 |
| **Gitee AI / 模力方舟** | 开源中国 | 代码+模型双平台，信创背景 |

### 国际类 HF 平台

| 平台 | 定位 |
|------|------|
| Replicate | 模型推理 API 商店，按秒计费 |
| CivitAI | SD/FLUX 文生图社区 |
| Together AI | 开源模型 API，支持微调 |
| Fal.ai | 图片/视频模型 API |

---

## 9. 免费额度汇总

以下在本文档范围内已记录的免费 Cloud GPU + Token API 平台：

| 平台 | 免费 Cloud GPU | 免费 Token API | 性质 |
|------|---------------|---------------|------|
| **AtomGit** | 1000 核时/月（NPU 910B） | 200 万/月 | 周期性刷新 |
| **Kaggle** | 30h/周（T4/P100） | — | 周期性刷新 |
| **Google Colab** | 有限 GPU（T4，会话限制） | — | 周期性刷新 |
| **Google AI Studio** | — | ~1,500 req/day | 周期性刷新 |
| **Groq** | — | ~14,400 req/day | 周期性刷新 |
| **SiliconFlow** | — | 按模型各异 | 周期性刷新 |
| **Cloudflare Workers AI** | — | 10K req/day | 周期性刷新 |
| **GitHub Models** | — | 15 req/min; 150 req/day; 50K tokens/min | 速率限制 |
| **ModelScope 魔搭** | — | 2000 次/天 (DeepSeek-R1 限 200) | 周期性刷新 |

---

## 10. 评估结论

| 维度 | 评估 |
|------|------|
| **作为 Hugging Face 替代品？** | ❌ 不能替代。模型库以昇腾 NPU 优化版为主，CUDA/MPS 硬件 |
 | | 用不了。不可下载权重到本地 CUDA 机器直接跑。 |
 | | ✅ 可作为中文模型发现入口和在线体验平台（体验后再去 HF 下载 CUDA 版）。 |
| **作为免费推理 API？** | ⚠️ 有限。已验证 12 个模型 API 可调用（而非全部 39k+）：|
 | | - 文本生成：Qwen3-30B-A3B / Qwen3-32B / DeepSeek-V4-Flash（前沿旗舰级）|
 | | - 图像理解：Qwen2-VL-72B |
 | | - 推理：Qwen3-30B-A3B-Thinking-2507（链式推理）|
 | | **局限**：200 万 Token/月对大模型用量偏少，性价比不如本地小模型；|
 | | TTS/ASR/文生图任务类型在后台筛选中存在，但**对应模型不在 12 个 |
 | | API 可调用列表内**，实际不可通过 API 使用。 |
| **作为数字人模型测试平台？** | ❌ 不可用。NPU 910B 无法运行 CUDA 硬编码的 LatentSync/Sonic/ |
 | | SadTalker/MuseTalk/EchoMimicV3/LongCat-VA/InfiniteTalk。|
 | | MiniMax-H3/LTX-2.5 虽在模型库但不在 12 个 API 可调用模型内，|
 | | 且无 NPU 适配版可下载到 Notebook 运行。|
| **作为编码助手？** | ✅ CodingPlan 可作为 Claude Code 替代品，按 5h 滚动窗口发 |
 | | 额度，模型受限（qwen3.8/mimo/deepseek-v4-flash/GLM-5.2）。 |

---

## 11. 与我们的资源对比：哪些可替代本地小模型？（实测后修正）

基于 API 实测（12 个可调用模型），对照我们实际在用的本地模型：

| 本地能力 | AtomGit 可替代？ | 说明 |
|------------|-----------------|------|
| 本地小模型（Qwen 系列 LLM/VL） | ⚠️ 理论可，但**无必要** | 本地跑免费无限制；AtomGit 200 万 Token/月偏紧且接入需额外 auth 处理 |
| ASR（Whisper 本地） | ❌ | ASR 任务类型存在但对应模型不在 API 列表 |
| TTS | ❌ | 同上 |
| 文生图/视频 | ❌ | MiniMax-H3、LTX-2.5 库里有但 API 不可调 |
| 数字人唇同步 | ❌ | CUDA 硬依赖 + NPU 无适配版 |

**最终结论**：AtomGit 对我们当前 pipeline **没有直接替代价值**。定位为**备选平台**：200 万 Token/月 + 1000 核时/月 NPU 免费额度保留，若未来出现（a）NPU 适配的数字人模型或（b）ASR/TTS 模型进入 API 列表，可零成本启用。
