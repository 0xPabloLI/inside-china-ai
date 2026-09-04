# 免费 LLM API 方案对比 — 合规的程序化 LLM 调用路径

## Executive Summary

将 LLM 的能力程序化调用出来，合规路径有三类，成熟度和适用场景差异明显。第一类是 **官方 API**（`api.openai.com` 等），平台唯一正式支持的程序化接口，按 token 计费，稳定可靠但需要付费。第二类是 **"User-Pays" 前端 SDK**（`Puter.js`），无需开发者 API key，在浏览器中直接调用 OpenAI/Claude/Gemini 等 400+ 模型，费用由终端用户自己的 Puter 账户承担。第三类是 **免费替代平台**（Google AI Studio、Groq、SiliconFlow 等），提供免费额度的 GPT 级模型，对大多数程序化场景性价比最高。

> **范围说明**：本文不收录「复用 ChatGPT/Codex 订阅 OAuth token」与「Web 后端 API 逆向」两类方案。两者均违反 OpenAI 服务条款（明确禁止逆向工程其服务），存在封号风险；且逆向方案维护成本极高——OpenAI 每次更新防护机制都会导致项目失效，2023 年的逆向项目已全部归档停止维护。详见 [OpenAI Services Agreement](https://openai.com/policies/services-agreement/)。

## Key Findings

### 1. 官方 API — 唯一合规的 OpenAI 路径

OpenAI 提供 REST API（`api.openai.com/v1/chat/completions` 等），是唯一正式支持的程序化接口。特点：

- **认证方式**：API Key（`sk-...`），从 OpenAI Platform 账号生成
- **计费**：按 token 使用量计费，与 ChatGPT 订阅（Plus $20/月）分离
- **可用模型**：GPT-5.6 Sol/Terra/Luna、GPT-5.4、GPT-5.4-mini 等（取决于 API tier）
- **优势**：稳定、有官方文档、合规、支持 streaming/tools/function calling
- **劣势**：需要单独付费，不能复用 ChatGPT Plus 订阅额度

来源：[OpenAI Platform](https://openai.com/policies/services-agreement/) — Tier 1（官方文档）

### 2. Puter.js — "User-Pays" 免 API Key 模式

- **网站**：https://developer.puter.com
- **机制**：前端 JS SDK，用户通过 Puter 账号认证，费用由用户自己的 Puter 账户承担
- **无需 API key**：`<script src="https://js.puter.com/v2/"></script>` 即可使用
- **可用模型**：GPT-5.6 Sol/Terra/Luna、GPT-5.4、GPT Image 2、Claude、Gemini、DeepSeek 等 400+ 模型
- **适用场景**：前端应用、AI 编程工具生成的应用（Claude Code、Codex、Lovable 等）
- **优势**：开发者零成本、无后端、无 key 管理
- **劣势**：用户需要有 Puter 账号、速率限制由 Puter 控制、不适合后端服务端调用

来源：[Puter.js 教程](https://developer.puter.com/tutorials/free-unlimited-openai-api/) — Tier 1（官方文档）

### 3. 免费替代方案 — 免费额度内的 GPT 级模型

如果不一定要用 ChatGPT 本身，多个平台提供免费 GPT 级 API：

| 平台                       | 模型                                                                                                                                          | 免费额度                                          | 限制                                                                                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google AI Studio           | Gemini 3.7 Flash / 3.5 Flash-Lite                                                                                                             | ~1,500 req/day                                    | 5-15 RPM，仅 Flash 系列（Pro 已移到付费）；2026-03 起新用户可能被要求 Prepay                                                                                                                                                             |
| Groq                       | GPT-OSS 120B, Llama 3.3 70B, Qwen3-32B 等                                                                                                     | ~14,400 req/day                                   | 30 RPM，所有模型免费                                                                                                                                                                                                                     |
| SiliconFlow (硅基流动)     | GLM-4-9B, Qwen3-8B, GLM-Z1-9B 等                                                                                                              | 免费模型按模型计                                  | 中国平台，中文好，无公开 pricing API                                                                                                                                                                                                     |
| Cloudflare Workers AI      | Llama-3.1-70B-Instruct-BF16、Llama-3-8B-Instruct、Mixtral-8x7B、Mistral-7B-Instruct、Gemma-7B、Qwen 1.5 (0.5B/7B/14B)、Hermes-3-Llama-3.1-70B | 10K req/day                                       | 模型较小、速度快，仅限文本生成                                                                                                                                                                                                           |
| **GitHub Models**          | Llama-3.3-70B-Instruct-FP8-Fast、Phi-4、GPT-2、Whisper-Large-V3、Phi-4-Mini-Reasoning                                                         | 15 req/min；150 req/day；50K tokens/min；不可商用 | 免费层有 RPM 限制；模型适合 demo；需要 GitHub 账户                                                                                                                                                                                       |
| **AtomGit (昇腾模型平台)** | **实测仅 12 个模型 API 可调用**：Qwen3-30B-A3B、Qwen3-32B、Qwen2-VL-72B、DeepSeek-V4-Flash/Pro、GLM-5.2、Kimi-K2.6、openPangu-2.0 等          | **200 万 Token/月**（月度刷新）                   | 昇腾 NPU 平台，OpenAI 端点兼容但**认证用 `PRIVATE-TOKEN` header**（非 Bearer）；模型库 39k+ 但大部分不可 API 调用；额外 1000 核时/月 NPU 算力；**定位为备选**——当前无我们需要的数字人/ASR/TTS 模型，详见 atomgit-ai-platform-research.md |
| **ModelScope (魔搭)**      | Qwen 全系、DeepSeek 全系、InternVL、InternLM、CosyVoice、Qwen2-Audio 等 17 万+ 模型                                                           | **2000 次/天**，DeepSeek-R1 限 200 次/天          | 国内下载速度快（30-100MB/s CDN）；接入阿里云 DashScope 全面；免费额度按 App/模型对应不同；最直接的"中国版 Hugging Face"；需阿里云实名认证                                                                                                |
| DeepSeek                   | DeepSeek V4 (1.6T MoE)                                                                                                                        | 已转付费（2026 年 8 月）                          | 审查敏感话题                                                                                                                                                                                                                             |
| Microsoft Copilot          | GPT-5.x                                                                                                                                       | 每日限制                                          | 非标准 API                                                                                                                                                                                                                               |

来源：[TokenMix 分析](https://tokenmix.ai/blog/chatgpt-api-alternative-free) — Tier 2；[serverspace 对比](https://serverspace.io/about/blog/the-best-chatgpt-alternatives-free-in-2026-15-ai-tools-for-text-code-and-productivity/) — Tier 2；[Google AI 定价](https://ai.google.dev/gemini-api/docs/pricing) — Tier 1；[Groq 文档](https://console.groq.com/docs/models) — Tier 1

## Detailed Analysis

### 路径一：官方 API — 唯一推荐的生产方案

OpenAI 官方 API 是 OpenAI 唯一正式支持的程序化访问方式。它使用标准 Bearer token 认证，提供完整的 REST + SSE streaming 接口，支持 function calling、vision、image generation 等全部功能。

计费方面，OpenAI API 与 ChatGPT 订阅完全分离。ChatGPT Plus（$20/月）的订阅额度**不能**用于 API 调用。API 按 token 计费，费率取决于模型选择——GPT-5.4-mini 等轻量模型费用很低，GPT-5.6 等旗舰模型费用较高。

### 路径二：Puter.js — 独特的前端"免 key"模式

Puter.js 采用"User-Pays"模型——开发者无需管理 API key，用户通过自己的 Puter 账号认证并承担 AI 使用费用。在前端 HTML 中加入一行 `<script>` 即可调用 GPT-5.6、Claude、Gemini 等模型。

这个方案的本质是 Puter 作为中间层代理 AI 请求，Puter 向 OpenAI 付费购买 API 访问，然后通过用户付费（Puter 订阅）覆盖成本。因此这不是逆向 ChatGPT，而是通过 Puter 平台合法使用 OpenAI API。

### 路径三：OpenAI Apps SDK — 官方的"在 ChatGPT 内运行应用"路径

OpenAI 还提供了 Apps SDK / ChatGPT 第三方应用路径。你的应用作为 ChatGPT 可调用的工具在 ChatGPT 内运行，用户通过 ChatGPT 界面与你的应用交互。这不适用于"程序化请求 ChatGPT"的场景，但值得了解作为官方扩展路径。

## Contrarian Views & Risks

### "免费替代品质量已够用"

2026 年，DeepSeek V4（1.6T MoE，Pro/Flash 版本）在多项基准测试中接近 GPT-5.2 水平，但已于 8 月转付费。Google Gemini 3.7 Flash 在 agentic 和编码基准上**超过** Gemini 3.1 Pro，且 AI Studio 免费层可用。Groq 免费 GPT-OSS 120B 智能指数 ≈ Claude 4 Sonnet（24 vs 25），推理速度 ~470 tokens/s，远快于 SiliconFlow GLM-4-9B 的 ~40 tokens/s。对于大多数应用场景，免费替代方案的性价比已经足够高。

### 封号后果严重

使用违反服务条款的访问方式，OpenAI 的封禁可能是永久的。ChatGPT Plus 订阅被 ban 后，OpenAI 通常会按比例退还未使用的订阅费用，但账号无法恢复。更重要的是，被封禁的账号关联的邮箱可能无法注册新账号。这是本文只收录合规路径的直接原因。

## Open Questions

1. **Puter.js 的可持续性**：Puter 的 User-Pays 模式在经济上是否可持续？用户使用量超过 Puter 订阅费用时会怎样？
2. **免费额度政策的变化速度**：Google AI Studio 2026-03 引入 Prepay 门槛、DeepSeek 2026-08 转付费——免费额度的窗口期通常有多长？管线选型应假设免费层随时收紧。

## 方案推荐总结

| 方案                                                  | 合规性                 | 稳定性    | 成本             | 推荐度                   |
| ----------------------------------------------------- | ---------------------- | --------- | ---------------- | ------------------------ |
| 官方 API                                              | ✅ 完全合规            | ✅ 最稳定 | 💰 按 token 付费 | ⭐⭐⭐⭐⭐               |
| Puter.js                                              | ✅ 通过 Puter 合法代理 | ✅ 稳定   | 🔄 用户付费      | ⭐⭐⭐⭐（前端应用）     |
| 免费替代（Gemini Flash / Groq GPT-OSS / SiliconFlow） | ✅ 各平台合规          | ✅ 稳定   | 🆓 免费额度      | ⭐⭐⭐⭐⭐（非必须 GPT） |

## Sources

1. [OpenAI Services Agreement](https://openai.com/policies/services-agreement/) — 官方服务条款，禁止逆向工程 — Tier 1
2. [OpenAI Usage Policies](https://openai.com/policies/usage-policies/) — 官方使用政策 — Tier 1
3. [Puter.js 免费 OpenAI API 教程](https://developer.puter.com/tutorials/free-unlimited-openai-api/) — User-Pays 模式文档 — Tier 1
4. [TokenMix: 免费 GPT API 替代](https://tokenmix.ai/blog/chatgpt-api-alternative-free) — 免费替代方案对比 — Tier 2
5. [Google AI 定价](https://ai.google.dev/gemini-api/docs/pricing) — Gemini API 官方定价 — Tier 1
6. [Groq 文档](https://console.groq.com/docs/models) — Groq 模型列表 — Tier 1
7. [Google AI Studio Billing](https://ai.google.dev/gemini-api/docs/billing) — Prepay/Postpay 计费变更（2026-03-23） — Tier 1
8. [Google Cloud: Disable Billing](https://docs.cloud.google.com/billing/docs/how-to/modify-project) — 解绑 Billing Account 回退 Free Tier — Tier 1
9. [DataCamp: Gemini 3.7 Flash](https://www.datacamp.com/blog/gemini-3-7-flash) — 基准测试和定价 — Tier 2
10. [Artificial Analysis: GPT-OSS 120B vs Claude 4 Sonnet](https://artificialanalysis.ai/models/comparisons/gpt-oss-120b-vs-claude-4-sonnet) — 智能指数对比 — Tier 2
11. [Groq Free Tier](https://pricepertoken.com/endpoints/groq/free) — Groq 免费层限速和模型列表 — Tier 2
12. [PricePerToken: Google AI Studio Free Tier](https://pricepertoken.com/endpoints/google-ai-studio/free) — AI Studio 免费层分析（Pro 已移到付费） — Tier 2
13. [felloai: Gemini Model Comparison](https://felloai.com/ultimate-gemini-model-comparison/) — Gemini 三层级（Pro/Flash/Flash-Lite）版本说明 — Tier 2

## Appendix: 实测数据（2026-08-28）

### API Key 可用性测试

| API              | 模型                  | 状态                             | 备注                                 |
| ---------------- | --------------------- | -------------------------------- | ------------------------------------ |
| Google AI Studio | Gemini 3.7 Flash      | ⚠️ 503 临时高负载                | 免费层已通（非 Prepay 报错）         |
| Google AI Studio | Gemini 3.6 Flash      | ✅ 但默认开思维链导致极慢（66s） | 92 thinking tokens / 4 output tokens |
| Google AI Studio | Gemini 3.5 Flash-Lite | ✅ 稳定，2.8s                    | 最快的 Gemini 免费选项               |
| Groq             | GPT-OSS 120B          | ✅ 1.05s                         | ~470 tokens/s                        |
| SiliconFlow      | GLM-4-9B-0414         | ✅ ~4.7s                         | ~40 tokens/s，中文好                 |

### 吞吐量对比（同一段 200 词摘要 prompt）

| 平台             | 模型             | 输出 tokens       | 推理耗时  | 吞吐量 (tokens/s)      |
| ---------------- | ---------------- | ----------------- | --------- | ---------------------- |
| Groq             | GPT-OSS 120B     | 500 (含 498 推理) | 1.05s     | **~470**               |
| Gemini AI Studio | 3.5 Flash-Lite   | 260               | 2.8s      | **~93**                |
| SiliconFlow      | GLM-4-9B-0414    | 185               | 4.7s      | **~40**                |
| 本地 (MPS)       | Qwen3-VL-2B-4bit | —                 | ~8-10s/图 | ~20-30 (VLM，不同任务) |

### Gemini 三层级说明

Google 将 Gemini 分为三个独立版本线的层级（版本号不统一）：

| 层级       | 当前最新                        | 定位                           | 免费层              |
| ---------- | ------------------------------- | ------------------------------ | ------------------- |
| Pro        | Gemini 3.1 Pro (2026-02)        | 旗舰推理，最难关题             | ❌ 2026-04 移到付费 |
| Flash      | Gemini 3.7 Flash (2026-08)      | 快速日常主力，agentic workflow | ✅                  |
| Flash-Lite | Gemini 3.5 Flash-Lite (2026-07) | 最便宜，高吞吐低延迟           | ✅                  |

Flash 3.7 在 agentic 和编码基准上已超过 Pro 3.1。Flash-Lite 在 MMLU-Pro 上 83%，但 AIME 2025 仅 16.7%——不擅长复杂推理。

### GPT-OSS 120B 定位

- 智能指数 24（Artificial Analysis），≈ Claude 4 Sonnet (25)，略低
- 非 GPT-5 级别，但比 GPT-4o 强
- 117B 参数 MoE，每 token 激活 5.1B
- 训练数据截止 2024-04（偏旧，不知道 2025+ 事件）
- 128K 上下文窗口
- Groq 上免费，LPU 硬件推理极快

### AI Studio Prepay 陷阱

2026-03-23 起 Google 引入 Prepay/Postpay 计费：

- 绑定 Billing Account 的项目被分配为 Prepay，余额 $0 时所有 API 调用返回 429
- Prepay → Postpay 不可逆
- **解法**：disable billing on project → 降回 Free Tier；或新建不绑 billing 的 project + 新 key
- 免费层使用 Flash/Flash-Lite 不需要付费，但 Prepay 模式下仍需余额 > 0

### SiliconFlow vs Groq 选型

| 维度         | SiliconFlow (GLM-4-9B) | Groq (GPT-OSS 120B)         |
| ------------ | ---------------------- | --------------------------- |
| 参数量       | 9B                     | 120B (MoE, 激活 5.1B/token) |
| 智能等级     | 小模型，简单任务够用   | ≈ Claude 4 Sonnet           |
| 推理速度     | ~40 tokens/s           | ~470 tokens/s (11x)         |
| 上下文窗口   | 8K                     | 128K (16x)                  |
| 中文能力     | ✅ 好（清华系）        | 一般                        |
| 训练数据截止 | 较新                   | 2024-04（旧）               |
| 适合场景     | 简单分类/格式化        | 复杂推理/长文档             |

**结论**：简单窄任务（如分类/格式化）用 SiliconFlow GLM-4-9B 即可；复杂推理/长文档用 Groq GPT-OSS 120B；需要最新知识或多模态用 Gemini Flash。三个平台做 fallback 链最稳。
