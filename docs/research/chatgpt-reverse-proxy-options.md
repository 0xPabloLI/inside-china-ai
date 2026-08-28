# 免费 LLM API 方案对比 — 程序化调用 LLM 的所有方法

## Executive Summary

将 ChatGPT 的聊天功能程序化请求出来，在技术上有三条路径，每条的成熟度、风险和适用场景差异很大。第一条是 **官方 API**（`api.openai.com`），这是 OpenAI 唯一正式支持的程序化接口，按 token 计费，稳定可靠但需要付费。第二条是 **Codex OAuth 后端 API**（`chatgpt.com/backend-api/codex`），这是 2025 年底出现的新路径——OpenAI 的 Codex CLI 使用 OAuth token 通过 ChatGPT 订阅（Plus/Pro）调用模型，社区项目 `openai-oauth` 等已成功复用此机制，将 ChatGPT 订阅变为 OpenAI 兼容 API 端点。第三条是 **Web 后端 API 逆向**（`chatgpt.com/backend-api/f/conversation`），这是对 ChatGPT 网页版后端的直接逆向，但 OpenAI 已部署了多层防护（Cloudflare Turnstile、Sentinel、Proof-of-Work、行为生物特征），维护成本极高。

2023 年的早期逆向项目（`acheong08/ChatGPT` / revChatGPT）已全部于 2023 年 8 月归档停止维护。当前活跃的方案主要围绕 Codex OAuth 路径展开，代表了"用 ChatGPT 订阅替代 API 付费"的最新技术方向。此外，`Puter.js` 提供了一种"User-Pays"模式的前端 SDK，无需 API key 即可在浏览器中调用 OpenAI 模型，由用户承担自己的 AI 使用费用。

所有非官方 API 路径都存在违反 OpenAI 使用条款（Terms of Use）的风险，可能导致账号被封禁。OpenAI 的服务条款明确禁止逆向工程其服务，并对检测到的违规行为保留暂停或终止账号的权利。

## Key Findings

### 1. 官方 API — 唯一合规的路径

OpenAI 提供 REST API（`api.openai.com/v1/chat/completions` 等），是唯一正式支持的程序化接口。特点：

- **认证方式**：API Key（`sk-...`），从 OpenAI Platform 账号生成
- **计费**：按 token 使用量计费，与 ChatGPT 订阅（Plus $20/月）分离
- **可用模型**：GPT-5.6 Sol/Terra/Luna、GPT-5.4、GPT-5.4-mini 等（取决于 API tier）
- **优势**：稳定、有官方文档、合规、支持 streaming/tools/function calling
- **劣势**：需要单独付费，不能复用 ChatGPT Plus 订阅额度

来源：[OpenAI Platform](https://openai.com/policies/services-agreement/) — Tier 1（官方文档）

### 2. Codex OAuth 后端 API — 当前最活跃的"白灰色"方案

**核心原理**：OpenAI 的 Codex CLI 通过 OAuth 2.0 + PKCE 设备码流认证用户身份，然后使用 `chatgpt.com/backend-api/codex/responses` 端点调用模型。模型调用费用从用户的 ChatGPT 订阅（Plus/Pro/Team/Enterprise）扣除，而非 API 计费。社区发现这个 OAuth token 可以被复用于任意第三方程序。

**关键项目**：

#### a) `openai-oauth`（EvanZhouDev，最成熟）

- **仓库**：https://github.com/EvanZhouDev/openai-oauth
- **机制**：复用 Codex CLI 的 OAuth token，在本地启动一个 OpenAI 兼容的 HTTP 代理
- **使用方式**：
  ```bash
  npx openai-oauth@latest
  # OpenAI-compatible endpoint ready at http://127.0.0.1:10531/v1
  # No API key is required.
  ```
- **支持端点**：`/v1/responses`、`/v1/chat/completions`、`/v1/models`、`/v1/images/generations`、`/v1/images/edits`
- **支持特性**：Streaming、Tool calls、Reasoning traces
- **可用模型**：由 Codex 支持的模型列表决定（如 `gpt-5.6-terra`、`gpt-5.6-sol`、`gpt-image-2` 等），取决于 ChatGPT 套餐
- **额外功能**："Sign in with ChatGPT" React 组件，让应用用户用自己的 ChatGPT 账号登录
- **凭据存储**：`~/.codex/auth.json`（与 Codex CLI 共用）
- **许可证**：Apache-2.0（可用于开源和闭源项目）
- **维护状态**：活跃维护（2025-2026 年持续更新）
- **限制**：
  - 仅 Codex 支持的模型可用
  - `/v1/responses` 端点无状态，调用者需发送完整对话历史
  - 浏览器登录仅支持 Chrome/Firefox
  - 因 CORS 限制，浏览器无法直接请求

#### b) `CLIProxyAPI`（router-for-me，多 provider 聚合）

- **仓库**：https://github.com/router-for-me/CLIProxyAPI
- **机制**：Go 语言代理服务器，支持 OpenAI Codex OAuth + Claude Code OAuth + Gemini OAuth + Grok OAuth + Kimi OAuth
- **特性**：多账号轮询负载均衡、streaming、function calling、多模态输入
- **生态**：30+ 衍生项目（桌面客户端、VS Code 扩展、管理面板等）
- **许可证**：MIT
- **维护状态**：非常活跃（30+ 衍生项目，多个赞助商）
- **注意**：该项目围绕"将 AI 编程工具订阅变为 API"的生态，有大量中转服务赞助，商业化程度较高

#### c) `claude-code-proxy`（raine，专注 Claude Code + ChatGPT）

- **仓库**：https://github.com/raine/claude-code-proxy
- **机制**：本地代理，将 Claude Code 的 Anthropic API 流量翻译为 ChatGPT/Kimi/Cursor/Grok 订阅服务
- **特点**：内置监控 TUI、session 管理、请求诊断
- **安装**：`brew install raine/claude-code-proxy/claude-code-proxy`
- **许可证**：MIT

#### d) `webchat2api`（zqbxdev，全面逆向方案）

- **仓库**：https://github.com/zqbxdev/webchat2api
- **机制**：将 GPT/ChatGPT Web、Grok/xAI Web、Gemini Web 封装为标准 API
- **特性**：FastAPI 后端 + Next.js 管理端、账号池管理、文生文/文生图、Turnstile 求解器
- **维护状态**：活跃（项目页面可访问，搜索结果有更新）
- **风险**：项目自带免责声明——"仅供个人学习、技术研究与非商业性技术交流使用"

来源：[openai-oauth GitHub](https://github.com/EvanZhouDev/openai-oauth) — Tier 1（源码）；[Puter.js OpenAI OAuth 教程](https://developer.puter.com/tutorials/openai-oauth) — Tier 1（官方文档）；[Reddit r/codex 讨论](https://www.reddit.com/r/codex/comments/1uz4dw8/) — Tier 2

### 3. Web 后端 API 逆向 — 高维护成本、高封号风险

**核心架构**（基于 `performance.dev` 逆向分析和 HAR 分析）：

ChatGPT 网页版使用 `chatgpt.com/backend-api/*` 作为后端前端（BFF）网关。对话流程：

1. **页面加载**：SSR 渲染 shell → React Router 7 + TanStack Query hydrate
2. **Sentinel 前置检查**：`POST /backend-api/sentinel/chat-requirements/prepare` 获取挑战参数
3. **Proof-of-Work 求解**：根据返回的参数在本地计算工作量证明
4. **Turnstile Token 生成**：Cloudflare Turnstile 在浏览器中运行字节码 VM，生成浏览器指纹 token。字节码经过加密（XOR + base64），需要反编译 VM 执行
5. **Signal Orchestrator**：行为生物特征层，监控键盘节奏、鼠标速度等
6. **对话请求**：`POST /backend-api/f/conversation`（SSE stream），需携带 sentinel token + proof token + turnstile token + conduit token

**多层防护**：
- **Cloudflare**：CDN + bot defense + Turnstile CAPTCHA
- **Sentinel 系统**：三层挑战 — Turnstile（浏览器指纹 VM）、Proof-of-Work（计算证明）、Signal Orchestrator（行为生物特征）
- **设备指纹**：`oai-device-id` cookie 持久标识
- **客户端版本**：`oai-client-version` 必须匹配页面构建版本
- **Timing 模拟**：`oai-echo-logs` 包含用户交互时间数据

**历史项目**：

| 项目 | 语言 | 状态 | 最后更新 |
|------|------|------|----------|
| `acheong08/ChatGPT` (revChatGPT) | Python | ❌ 2023-08-10 归档 | archived |
| `acheong08/ChatGPT-Proxy-V4` | Go | ❌ 随主项目归档 | archived |
| `linweiyuan/go-chatgpt-api` | Go | ❌ 停止维护 | ~2024 |
| `dreamhunter2333/chatgpt_reverse_proxy` | Python (浏览器) | ⚠️ 可能失效 | — |
| `Zai-Kun/reverse-engineered-chatgpt` | Python | ⚠️ 可能失效 | — |
| `theAbdoSabbagh/UnlimitedGPT` | Python (undetected_chromedriver) | ⚠️ 可能失效 | — |

**关键教训**：所有直接逆向 `backend-api/f/conversation` 的项目都面临极高的维护成本——OpenAI 每次更新 Sentinel/Turnstile/PoW 机制都会导致项目失效。revChatGPT 在 2023 年 8 月归档前，issue 中充满了 403 错误报告。

来源：[performance.dev 逆向分析](https://performance.dev/chatgpt) — Tier 2（深度技术分析）；[Gigazine Sentinel 分析](https://gigazine.net/gsc_news/en/20260502-chatgpt-cloudflare/) — Tier 2；[HAR 架构分析](https://alinr.com/experiments/chatgpt-har-architecture-conversation-data.html) — Tier 2；[acheong08/ChatGPT 归档](https://github.com/acheong08/ChatGPT) — Tier 1（源码）

### 4. Puter.js — "User-Pays" 免 API Key 模式

- **网站**：https://developer.puter.com
- **机制**：前端 JS SDK，用户通过 Puter 账号认证，费用由用户自己的 Puter 账户承担
- **无需 API key**：`<script src="https://js.puter.com/v2/"></script>` 即可使用
- **可用模型**：GPT-5.6 Sol/Terra/Luna、GPT-5.4、GPT Image 2、Claude、Gemini、DeepSeek 等 400+ 模型
- **适用场景**：前端应用、AI 编程工具生成的应用（Claude Code、Codex、Lovable 等）
- **优势**：开发者零成本、无后端、无 key 管理
- **劣势**：用户需要有 Puter 账号、速率限制由 Puter 控制、不适合后端服务端调用

来源：[Puter.js 教程](https://developer.puter.com/tutorials/free-unlimited-openai-api/) — Tier 1（官方文档）

### 5. 免费替代方案 — 不逆向 ChatGPT 也能用 GPT 级模型

如果不一定要用 ChatGPT 本身，多个平台提供免费 GPT 级 API：

| 平台 | 模型 | 免费额度 | 限制 |
|------|------|----------|------|
| Google AI Studio | Gemini 3.7 Flash / 3.5 Flash-Lite | ~1,500 req/day | 5-15 RPM，仅 Flash 系列（Pro 已移到付费）；2026-03 起新用户可能被要求 Prepay |
| Groq | GPT-OSS 120B, Llama 3.3 70B, Qwen3-32B 等 | ~14,400 req/day | 30 RPM，所有模型免费 |
| SiliconFlow (硅基流动) | GLM-4-9B, Qwen3-8B, GLM-Z1-9B 等 | 免费模型按模型计 | 中国平台，中文好，无公开 pricing API |
| OpenRouter | 多个免费模型 | 各异 | 质量不一 |
| Cloudflare Workers AI | 多种小模型 | 10K req/day | 模型较小 |
| DeepSeek | DeepSeek V4 (1.6T MoE) | 已转付费（2026 年 8 月） | 审查敏感话题 |
| Microsoft Copilot | GPT-5.x | 每日限制 | 非标准 API |

来源：[TokenMix 分析](https://tokenmix.ai/blog/chatgpt-api-alternative-free) — Tier 2；[serverspace 对比](https://serverspace.io/about/blog/the-best-chatgpt-alternatives-free-in-2026-15-ai-tools-for-text-code-and-productivity/) — Tier 2；[Google AI 定价](https://ai.google.dev/gemini-api/docs/pricing) — Tier 1；[Groq 文档](https://console.groq.com/docs/models) — Tier 1

## Detailed Analysis

### 路径一：官方 API — 唯一推荐的生产方案

OpenAI 官方 API 是唯一不违反 ToS 的程序化访问方式。它使用标准 Bearer token 认证，提供完整的 REST + SSE streaming 接口，支持 function calling、vision、image generation 等全部功能。

计费方面，OpenAI API 与 ChatGPT 订阅完全分离。ChatGPT Plus（$20/月）的订阅额度**不能**用于 API 调用。API 按 token 计费，费率取决于模型选择——GPT-5.4-mini 等轻量模型费用很低，GPT-5.6 等旗舰模型费用较高。

### 路径二：Codex OAuth — "用订阅替代 API 计费"的灰色地带

2025 年 11 月，Simon Willison 逆向了 Codex CLI，发现它使用 `chatgpt.com/backend-api/codex/responses` 端点运行模型，认证方式是 OAuth token，费用从用户的 ChatGPT 订阅扣除。这与传统 API 调用（`api.openai.com`）是完全不同的端点和认证体系。

社区迅速利用这一发现。`openai-oauth` 项目是最成熟的实现——它复用 Codex CLI 的 OAuth flow 登录，获取 token 后在本地启动一个 OpenAI 兼容的 HTTP 代理。任何使用 OpenAI SDK 的程序（LangChain、Vercel AI SDK、curl 等）都可以直接指向 `localhost:10531/v1` 使用，无需 API key。

**OpenAI 的态度**：目前 OpenAI 对这种使用方式"决定不作出反应"（Reddit 讨论中开发者观察到）。推测原因：OpenAI 可能认为这有助于推动"统一 ChatGPT 和 Codex 计费"的方向。但这并不意味着将来不会改变政策——Anthropic 已于 2026 年 4 月关闭了 Claude 的等效通道，Google 也对 Gemini CLI 做了类似变更。

**合规风险评估**：
- OpenAI 使用条款（Services Agreement）明确禁止"Reverse Engineer"——包括"逆向编译、反编译、翻译、模型提取或窃取攻击"
- Codex OAuth 路径虽然使用了 OpenAI 自己的 OAuth flow，但将其用于非 Codex CLI 的第三方程序，可能构成对 ToS 的违反
- VerifyWise 的分析指出："System manipulation attempts such as prompt injection, jailbreaking, or reverse engineering model behavior are explicitly forbidden"
- 封号风险：中等——OpenAI 目前未积极封禁此类使用，但保留随时封禁的权利

### 路径三：Web 后端 API 逆向 — 不推荐

ChatGPT 网页版的对话端点（`/backend-api/f/conversation`）受到多层防护保护：

1. **Cloudflare Turnstile**：不是简单的 CAPTCHA，而是一个字节码虚拟机。浏览器收到加密的字节码 blob，需要 XOR 解密后执行，生成浏览器指纹 token。Gigazine 的分析指出，即使伪造浏览器指纹，不正确渲染 ChatGPT SPA 的 bot 也会被检测到。

2. **Sentinel 系统**：三层挑战
   - Turnstile（浏览器指纹 VM）
   - Proof-of-Work（计算证明，类似 hashcash）
   - Signal Orchestrator（行为生物特征——键盘节奏、鼠标速度）

3. **动态参数**：`oai-client-version` 必须匹配当前构建版本，`oai-device-id` 需要持久化，`oai-echo-logs` 包含时间数据。

所有 2023 年的逆向项目（revChatGPT、go-chatgpt-api 等）都已停止维护或归档。原因不是技术能力不足，而是维护成本过高——OpenAI 每次更新防护机制都需要重新逆向。

当前仍在尝试维护的方案（如 `webchat2api`、`chatgpt2api`）需要集成 Proof-of-Work 生成器、Turnstile 求解器、WARP/FlareSolverr 代理等复杂组件，且稳定性无法保证。

### 路径四：Puter.js — 独特的前端"免 key"模式

Puter.js 采用"User-Pays"模型——开发者无需管理 API key，用户通过自己的 Puter 账号认证并承担 AI 使用费用。在前端 HTML 中加入一行 `<script>` 即可调用 GPT-5.6、Claude、Gemini 等模型。

这个方案的本质是 Puter 作为中间层代理 AI 请求，Puter 向 OpenAI 付费购买 API 访问，然后通过用户付费（Puter 订阅）覆盖成本。因此这不是逆向 ChatGPT，而是通过 Puter 平台合法使用 OpenAI API。

### 路径五：OpenAI Apps SDK — 官方的"在 ChatGPT 内运行应用"路径

OpenAI 还提供了 Apps SDK / ChatGPT 第三方应用路径。你的应用作为 ChatGPT 可调用的工具在 ChatGPT 内运行，用户通过 ChatGPT 界面与你的应用交互。这不适用于"程序化请求 ChatGPT"的场景，但值得了解作为官方扩展路径。

## Contrarian Views & Risks

### "OpenAI 可能随时关闭 Codex OAuth 路径"

Reddit 社区中多位开发者指出，OpenAI 对 Codex OAuth 第三方使用"决定不作出反应"可能只是暂时的。Anthropic 已在 2026 年 4 月关闭了 Claude 的等效通道，Google 也对 Gemini CLI 做了类似变更。OpenAI 跟进只是时间问题。任何依赖此路径的生产系统都应有 fallback 方案。

### "逆向方案不可持续"

所有历史逆向项目最终都停止了维护。这不是巧合——OpenAI 有专门的团队持续更新反 bot 机制。社区开发者无法长期跟进。即使是目前活跃的 `webchat2api` 等项目，也面临随时被 OpenAI 更新打破的风险。

### "免费替代品质量已够用"

2026 年，DeepSeek V4（1.6T MoE，Pro/Flash 版本）在多项基准测试中接近 GPT-5.2 水平，但已于 8 月转付费。Google Gemini 3.7 Flash 在 agentic 和编码基准上**超过** Gemini 3.1 Pro，且 AI Studio 免费层可用。Groq 免费 GPT-OSS 120B 智能指数 ≈ Claude 4 Sonnet（24 vs 25），推理速度 ~470 tokens/s，远快于 SiliconFlow GLM-4-9B 的 ~40 tokens/s。对于大多数应用场景，免费替代方案的性价比已远超逆向 ChatGPT 所付出的努力和风险。

### 封号后果严重

OpenAI 的封禁可能是永久的。ChatGPT Plus 订阅被 ban 后，OpenAI 通常会按比例退还未使用的订阅费用，但账号无法恢复。更重要的是，被封禁的账号关联的邮箱可能无法注册新账号。

## Open Questions

1. **Codex OAuth 的未来**：OpenAI 会在何时（如果会的话）关闭第三方对 Codex backend API 的访问？
2. **Codex 模型 vs API 模型的质量差异**：通过 Codex OAuth 调用的模型是否与官方 API 调用的完全一致，还是有隐含的质量降级？
3. **Puter.js 的可持续性**：Puter 的 User-Pays 模式在经济上是否可持续？用户使用量超过 Puter 订阅费用时会怎样？
4. **OpenAI 统一计费方向**：OpenAI 是否会最终统一 Codex 和 ChatGPT 计费，使第三方 OAuth 使用变得官方支持？

## 方案推荐总结

| 方案 | 合规性 | 稳定性 | 成本 | 推荐度 |
|------|--------|--------|------|--------|
| 官方 API | ✅ 完全合规 | ✅ 最稳定 | 💰 按 token 付费 | ⭐⭐⭐⭐⭐ |
| Codex OAuth (openai-oauth) | ⚠️ 灰色地带 | ⚠️ OpenAI 可能随时关闭 | 🔄 复用 ChatGPT 订阅 | ⭐⭐⭐（实验/个人用） |
| Web API 逆向 | ❌ 违反 ToS | ❌ 极不稳定 | ⏰ 维护成本极高 | ⭐（不推荐） |
| Puter.js | ✅ 通过 Puter 合法代理 | ✅ 稳定 | 🔄 用户付费 | ⭐⭐⭐⭐（前端应用） |
| 免费替代（Gemini Flash / Groq GPT-OSS / SiliconFlow） | ✅ 各平台合规 | ✅ 稳定 | 🆓 免费额度 | ⭐⭐⭐⭐⭐（非必须 GPT） |

## Sources

1. [OpenAI Services Agreement](https://openai.com/policies/services-agreement/) — 官方服务条款，禁止逆向工程 — Tier 1
2. [OpenAI Usage Policies](https://openai.com/policies/usage-policies/) — 官方使用政策 — Tier 1
3. [openai-oauth GitHub](https://github.com/EvanZhouDev/openai-oauth) — Codex OAuth 代理项目，活跃维护 — Tier 1
4. [Puter.js OpenAI OAuth 教程](https://developer.puter.com/tutorials/openai-oauth) — 解释 Codex OAuth 与 API key 的区别 — Tier 1
5. [CLIProxyAPI GitHub](https://github.com/router-for-me/CLIProxyAPI) — 多 provider OAuth 代理，Go 实现 — Tier 1
6. [claude-code-proxy GitHub](https://github.com/raine/claude-code-proxy) — Claude Code + ChatGPT 订阅代理 — Tier 1
7. [webchat2api GitHub](https://github.com/zqbxdev/webchat2api) — ChatGPT/Grok/Gemini Web 逆向封装 — Tier 1
8. [performance.dev ChatGPT 逆向](https://performance.dev/chatgpt) — ChatGPT Web 架构深度分析 — Tier 2
9. [Gigazine Sentinel 分析](https://gigazine.net/gsc_news/en/20260502-chatgpt-cloudflare/) — Turnstile/Sentinel 机制详解 — Tier 2
10. [HAR 架构分析](https://alinr.com/experiments/chatgpt-har-architecture-conversation-data.html) — ChatGPT 请求流程分析 — Tier 2
11. [acheong08/ChatGPT (archived)](https://github.com/acheong08/ChatGPT) — 已归档的 revChatGPT 项目 — Tier 1
12. [Simon Willison: Codex CLI 逆向](https://simonwillison.net/2025/Nov/9/gpt-5-codex-mini/) — 发现 `chatgpt.com/backend-api/codex/responses` 端点 — Tier 2
13. [Reddit r/codex: openai-oauth 讨论](https://www.reddit.com/r/codex/comments/1uz4dw8/) — 开发者社区讨论 — Tier 2
14. [Reddit r/ChatGPTCoding: 无 API key 工具](https://www.reddit.com/r/ChatGPTCoding/comments/1mu8eyg/) — 封号风险讨论 — Tier 2
15. [VerifyWise: OpenAI Usage Policies](https://verifywise.ai/ai-governance-library/policies-and-internal-governance/openai-usage-policy) — ToS 合规分析 — Tier 2
16. [TokenMix: 免费 GPT API 替代](https://tokenmix.ai/blog/chatgpt-api-alternative-free) — 免费替代方案对比 — Tier 2
17. [Puter.js 免费 OpenAI API 教程](https://developer.puter.com/tutorials/free-unlimited-openai-api/) — User-Pays 模式文档 — Tier 1
18. [DeepWiki: chatgpt2api](https://deepwiki.com/basketikun/chatgpt2api) — 逆向项目架构分析 — Tier 2
19. [DeepWiki: Token Generation Pipeline](https://deepwiki.com/realasfngl/ChatGPT/4.2-token-generation-pipeline) — Sentinel token 生成流程 — Tier 2
20. [Nstbrowser: ChatGPT 封号](https://www.nstbrowser.io/en/blog/chatgpt-ban) — 封号原因与预防 — Tier 3
21. [DEV Community: 逆向 ChatGPT UI](https://dev.to/gautamvhavle/i-reverse-engineered-chatgpts-ui-into-an-openai-compatible-api-and-heres-why-you-shouldnt-ch) — 浏览器自动化逆向方案 — Tier 3
22. [OpenClaw: Codex OAuth 文档](https://docs.openclaw.ai/providers/openai) — 第三方使用 Codex OAuth 的实践 — Tier 2
23. [opencodex: Providers 文档](https://opencodex.me/guides/providers/) — ChatGPT passthrough 机制 — Tier 2
24. [Google AI Studio Billing](https://ai.google.dev/gemini-api/docs/billing) — Prepay/Postpay 计费变更（2026-03-23） — Tier 1
25. [Google Cloud: Disable Billing](https://docs.cloud.google.com/billing/docs/how-to/modify-project) — 解绑 Billing Account 回退 Free Tier — Tier 1
26. [DataCamp: Gemini 3.7 Flash](https://www.datacamp.com/blog/gemini-3-7-flash) — 基准测试和定价 — Tier 2
27. [Artificial Analysis: GPT-OSS 120B vs Claude 4 Sonnet](https://artificialanalysis.ai/models/comparisons/gpt-oss-120b-vs-claude-4-sonnet) — 智能指数对比 — Tier 2
28. [Groq Free Tier](https://pricepertoken.com/endpoints/groq/free) — Groq 免费层限速和模型列表 — Tier 2
29. [PricePerToken: Google AI Studio Free Tier](https://pricepertoken.com/endpoints/google-ai-studio/free) — AI Studio 免费层分析（Pro 已移到付费） — Tier 2
30. [felloai: Gemini Model Comparison](https://felloai.com/ultimate-gemini-model-comparison/) — Gemini 三层级（Pro/Flash/Flash-Lite）版本说明 — Tier 2

## Appendix: 实测数据（2026-08-28）

### API Key 可用性测试

| API | 模型 | 状态 | 备注 |
|-----|------|------|------|
| Google AI Studio | Gemini 3.7 Flash | ⚠️ 503 临时高负载 | 免费层已通（非 Prepay 报错） |
| Google AI Studio | Gemini 3.6 Flash | ✅ 但默认开思维链导致极慢（66s） | 92 thinking tokens / 4 output tokens |
| Google AI Studio | Gemini 3.5 Flash-Lite | ✅ 稳定，2.8s | 最快的 Gemini 免费选项 |
| Groq | GPT-OSS 120B | ✅ 1.05s | ~470 tokens/s |
| SiliconFlow | GLM-4-9B-0414 | ✅ ~4.7s | ~40 tokens/s，中文好 |

### 吞吐量对比（同一段 200 词摘要 prompt）

| 平台 | 模型 | 输出 tokens | 推理耗时 | 吞吐量 (tokens/s) |
|------|------|------------|---------|-------------------|
| Groq | GPT-OSS 120B | 500 (含 498 推理) | 1.05s | **~470** |
| Gemini AI Studio | 3.5 Flash-Lite | 260 | 2.8s | **~93** |
| SiliconFlow | GLM-4-9B-0414 | 185 | 4.7s | **~40** |
| 本地 (MPS) | Qwen3-VL-2B-4bit | — | ~8-10s/图 | ~20-30 (VLM，不同任务) |

### Gemini 三层级说明

Google 将 Gemini 分为三个独立版本线的层级（版本号不统一）：

| 层级 | 当前最新 | 定位 | 免费层 |
|------|---------|------|--------|
| Pro | Gemini 3.1 Pro (2026-02) | 旗舰推理，最难关题 | ❌ 2026-04 移到付费 |
| Flash | Gemini 3.7 Flash (2026-08) | 快速日常主力，agentic workflow | ✅ |
| Flash-Lite | Gemini 3.5 Flash-Lite (2026-07) | 最便宜，高吞吐低延迟 | ✅ |

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

| 维度 | SiliconFlow (GLM-4-9B) | Groq (GPT-OSS 120B) |
|------|----------------------|---------------------|
| 参数量 | 9B | 120B (MoE, 激活 5.1B/token) |
| 智能等级 | 小模型，简单任务够用 | ≈ Claude 4 Sonnet |
| 推理速度 | ~40 tokens/s | ~470 tokens/s (11x) |
| 上下文窗口 | 8K | 128K (16x) |
| 中文能力 | ✅ 好（清华系） | 一般 |
| 训练数据截止 | 较新 | 2024-04（旧） |
| 适合场景 | 简单分类/格式化（DeFi 术语等） | 复杂推理/长文档 |

**结论**：简单窄任务（如 Aave Merkl 分类）用 SiliconFlow GLM-4-9B 即可；复杂推理/长文档用 Groq GPT-OSS 120B；需要最新知识或多模态用 Gemini Flash。三个平台做 fallback 链最稳。
