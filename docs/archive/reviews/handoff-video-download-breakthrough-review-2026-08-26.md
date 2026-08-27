# Review: Video Download Breakthrough Handoff

> **评审日期：** 2026-08-26  
> **评审人：** Manus AI  
> **审阅范围：** `docs/handoffs/handoff-video-download-breakthrough.md`  
> **结论：** **实施前需要修改（Changes requested）**

## 执行摘要

该交接文档正确识别了现有视频素材管线的核心缺口：`asset-sourcer.mjs` 目前只有原生 HTTP 下载和 `yt-dlp` 下载两条实际生效的下载路径，而 `source-registry.mjs` 又明确限制 `yt-dlp` 只面向 YouTube 与 B 站。[1] [2] [3] 将平台专用适配器、通用解析服务和 CDP 兜底纳入同一下载层是合理方向，尤其能够让未知平台的公开 URL 获得可控的降级策略。

但是，文档目前不适合作为 #75 的实现依据。其“所有方法已验证”的状态与维护中的快速参考矛盾；它将**视频发现能力**、**下载能力**和**登录/CDP 运行时能力**压缩成同一个 `capabilities.videos.method` 字段；并且把 Cobalt 的最小成功响应当作完整 API 契约。若按现有伪代码实现，`local-processing`、`picker`、鉴权、限流、非视频响应、文件上限及下载清理均没有定义，且 `method: "cdp"` 并不会被当前 `asset-sourcer.mjs` 的视频执行路径消费。[1] [2] [3] [7]

> **建议决策：** 保留“统一下载层”的目标，但先将交接文档改写为一个可验证的下载器契约：每种策略须声明发现方式、下载适配器、前置会话、输出限制、降级条件和可观测结果。Cobalt 应作为经过实例能力探测的公共 URL 解析器，而非无条件的首个下载调用。随后以一个独立的端到端 adapter 作为最小交付，再逐个平台扩展。

| 评审维度 | 结论 | 实施前必须完成的处置 |
|---|---|---|
| 问题定义 | **成立**。现有下载实现确实没有抖音、小红书、微博与 TikTok 的专用下载器。 | 保留，但区分“发现 URL”与“下载媒体”两类问题。 |
| “已验证”状态 | **不成立**。抖音方案在维护参考中仍标为未验证，Cobalt 没有本仓库验收证据。 | 将状态按平台和环境拆分；没有可复现验收记录不得标为已验证。 |
| Cobalt 集成 | **阻塞性不完整**。只处理了两种成功状态，也没有健康检查、鉴权、限流与文件验证。 | 以完整响应状态机和实例 preflight 重写。 |
| source registry 标注 | **阻塞性不匹配**。拟议的 `method: "cdp"` 不能表达不同下载器，也没有对应的视频 CDP 扁平化/执行器。 | 引入显式的下载适配器配置，不要用 `cdp` 作为下载器同义词。 |
| 运行与合规 | **不完整**。cookie、地区限制、第三方服务与版权归属缺少操作边界。 | 增加会话隔离、公开 URL 限定、数据留存、归属和故障处理要求。 |
| 验收与发布 | **缺失**。没有 fixture、模拟响应或失败矩阵。 | 将下方行为矩阵转为测试与 staged rollout 的准入门槛。 |

## 阻塞性发现

### 1. “所有方法已验证”与维护文档及 issue 状态不一致

交接文档在页首称“all methods verified”，并将抖音 `iesdouyin` 方案写为已经可用；但维护中的 `asset-source-quick-reference.md` 将抖音下载明确标为“Not tested yet / Download untested”，只对小红书 MCP、微博 API 与 TikTok CDP 给出了不同程度的已测试表述。[1] [4] 两份文档也没有提供 Cobalt 本地实例的版本、输入 URL、期望文件哈希、命令输出或失败样本，因此不能支持“P0 通用 fallback 已验证”的结论。

这一差异会直接影响实现顺序。#75 期望先为未标注平台集成下载器并补回归测试；#77 则要求审计现有 59 个 source 的能力标注和 fallback 链。交接文档不能以一个笼统的“verified”跳过这两个 gate。[5] [6]

| 平台/策略 | 交接文档表述 | 维护参考或上游证据 | 本次评审的状态要求 |
|---|---|---|---|
| 抖音 / `iesdouyin` | 无 cookie、无登录、可无水印下载。 | 维护参考仍标为下载未验证；上游 Chubby Skills 将其描述为转录工作流中的 URL 解析步骤，而不是本项目的下载器验收。[4] [9] [10] | **候选方案**。必须以固定的公开样本完成解析、下载、探测和清理测试后才可升级。 |
| 小红书 / RedNote-MCP | 已测试。 | 维护参考指出 MCP 需要显式 init 和人工登录，cookie 由工具保存。[4] | **条件可用**。将登录态存在性与失效视为运行时前置条件。 |
| 微博 / visitor cookie | 已测试。 | 维护参考仅确认 cookie 获取/API 路径；搜索与下载的会话条件不同。[4] | **条件可用**。要求固定 status fixture 与访客 cookie 失效测试。 |
| TikTok / CDP `item/detail` | 已验证。 | 参考实现确实记录了这一浏览器会话内方案，但同时说明地区限制和手动兜底。[11] | **条件可用**。要求 cookie、地区与 URL 规范化失败都可观测。 |
| Cobalt 自部署 | 推荐的 P0 通用 fallback。 | 官方 API 文档定义了五种响应状态；本仓库没有实例配置或验收证据。[7] [8] | **未验证**。先完成 isolated instance smoke test，再决定是否提升为 P0。 |

### 2. `capabilities.videos.method = "cdp"` 不能表达拟议的实现

当前 registry 仅把 B 站和 YouTube 声明为 `ytdlp` 视频能力，并由 `SUPPORTED_YTDLP_PLATFORMS` 强制白名单。`asset-sourcer.mjs` 也只将视频能力归入 API 或 `yt-dlp` 两条候选执行路径；其中 `CDP_SOURCES` 专门从**图片**能力派生，视频 `method: "cdp"` 没有对应的扁平化函数、搜索器或下载器。[2] [3]

因此，文档中将抖音、小红书、微博和 TikTok 都标记为 `method: "cdp"` 会制造错误契约：四者实际依赖的下载机制分别是第三方 CLI/脚本、MCP、访客 cookie API 和浏览器内 API，不能由同一 `cdp` 标签安全调度。#77 对“视频标注”提出的是需要验证的假设，而不是已经可投入生产的 schema。[1] [3] [6]

建议将两种职责拆分。`videoDiscovery` 描述如何获得候选 URL，`videoDownload` 描述如何把候选 URL 变成可用媒体；CDP 只能是其中某个 discovery 或 runtime transport，而不是下载器类型。下载器应具有稳定 adapter ID，例如 `direct-http`、`ytdlp`、`cobalt`、`douyin-share`、`rednote-mcp`、`weibo-visitor-api`、`tiktok-cdp-detail` 和 `cdp-generic`。每个 adapter 都必须声明是否需要登录态、允许的平台、最大尺寸/时长、返回的 provenance 字段与不可恢复失败类别。

| 现有对象 | 当前含义 | 交接文档的问题 | 替代契约 |
|---|---|---|---|
| `capabilities.videos` | 供 `asset-sourcer` 生成候选与选择已有 API/`yt-dlp` 路径。 | 将“可发现视频”和“可下载 URL”混为一谈。 | 保留为发现层；新增显式 `videoDownload.adapters` 或独立 adapter registry。 |
| `method: "cdp"` | 当前只在图片 CDP 来源中被消费。 | 不能告诉系统是执行 `fetch`、调用 MCP、使用 visitor API，还是运行页面资源扫描。 | 使用具名 adapter；仅在 adapter 内标注 `transport: "cdp"`。 |
| `source` 参数 | 目前是 registry source name。 | 伪代码假定它总能映射为下载平台，未知 iframe/重定向 URL 则不能可靠匹配。 | 先 canonicalize URL、解析最终域名与嵌入来源，再选择策略。 |
| `downloadAsset()` | 直接 HTTP 下载，带最小文件大小检查。 | Cobalt 分支绕过统一的文件验证与 provenance 记录。 | 所有 adapter 产出统一 `DownloadResult`，最终由一个写入器执行文件验证与落盘。 |

### 3. Cobalt 的 API 契约、部署前置与失败模型被过度简化

交接文档示例只接受 `tunnel` 和 `redirect`，然后直接对 `data.url` 调用 `fetch()`。Cobalt 的官方 API 还会返回 `local-processing`、`picker` 与 `error`；实例可能启用 API-key 或 Bearer 鉴权，所有主要端点均受限流约束。官方还明确说明公共托管实例不面向未经许可的项目集成，使用 API 时应自托管或取得实例所有者许可。[7]

这使当前伪代码至少会在以下场景失去正确性：多媒体帖返回 `picker`、实例要求本地封装返回 `local-processing`、服务返回非 JSON 错误页、`fetch(data.url)` 得到 HTML/鉴权页，或下载超过管线目前 `yt-dlp` 的 20 MB / 8 秒素材预算。[2] [7] 另外，官方自托管文档要求 Docker 与 Docker Compose、实例配置及必填的 `API_URL`；“Docker 一行命令”和“无需维护”的表述并不准确。[8]

> **替换要求：** 先调用 `GET /` 读取实例 URL、版本、`services`、鉴权和健康状态；再执行 `POST /`。策略只能把 `tunnel` / `redirect` 交给统一下载器；`picker` 必须选择符合短视频约束的单项或返回可审核的 `needs-selection`；`local-processing` 必须明确在本机使用何种安全、可测试的封装器，未实现前返回 `unsupported-response`；`error` 必须按错误 code 分类。所有分支都应使用超时、大小上限、MIME/魔数检查、临时文件原子落盘与删除清理。

### 4. 无条件的 “Cobalt first” 顺序缺少策略依据和隐私边界

文档同时将 Cobalt 定义为“未知 URL 的通用 fallback”，又要求“所有 URL 先走 Cobalt”。对已知平台而言，这会将已有浏览器登录态、平台 cookie 与专用 adapter 的可解释性让位于另一个独立服务；同时还可能把含追踪参数、短链重定向或非公开 URL 送到 self-hosted service。Cobalt 的项目定位是下载公开可访问内容，不应作为登录态受保护内容的通用转发器。[1] [7]

应由**策略选择器**而非固定的线性顺序决定调用次序：直接媒体 URL 走 HTTP；已验证且已配置的专用 adapter 走专用路径；满足公开 URL 与实例 `services` 条件的链接才尝试 Cobalt；最后才进入具有明确同意与资源限制的 CDP 通用提取。若产品坚持 Cobalt-first，必须先提供成功率、耗时、输出合规性与对专用 adapter 回归的对照数据，并在文档中说明为何该顺序优于平台专用路径。

### 5. 现有 CDP 工具不足以直接承载“通用视频提取”承诺

现有 CDP 实现提供开页、执行页面脚本、提取结果和关闭页面等基本能力；当前 `asset-sourcer` 使用它做图片/文章候选搜索，而没有已实现的网络监听、二进制流保存、MSE 分段拼接或 iframe 递归协议。[2] 对 `<video>` / `performance` 资源扫描的提议可以作为研究分支，但不能在没有接口、资源预算和 fixture 的情况下宣称为“零依赖 fallback”。

CDP 通用 adapter 最小范围应只覆盖：公开页面、单一可下载 HTTP(S) URL、非 `blob:` 来源、有限数量的 iframe、有限页面等待时间。发现 MSE、DRM、HLS/DASH 分段、跨域拒绝或需要额外登录时，应返回具名的 `unsupported` 或 `requires-session`，而不是继续尝试或默默失败。

## 要求采用的下载结果与策略边界

所有 adapter 应返回同一个结果对象；任何 adapter 都不得直接写入 `allAssets`。这样可以将写文件、媒体探测、归属记录、去重和错误报告固定在一个边界，而不是分散到 Cobalt、CLI、MCP 和 CDP 分支中。

```js
/** 成功或失败都必须带 strategy、sourceUrl 和可读 reason。 */
{
  status: 'downloaded' | 'skipped' | 'needs-selection' | 'unsupported' | 'failed',
  strategy: 'direct-http' | 'cobalt' | 'douyin-share' | 'rednote-mcp' |
    'weibo-visitor-api' | 'tiktok-cdp-detail' | 'cdp-generic' | 'ytdlp',
  source: 'douyin' | 'xhs' | 'weibo_hot' | 'tiktok_creator' | 'unknown',
  sourceUrl: 'canonical public source URL',
  finalUrl: 'optional resolved media URL; do not persist secrets',
  mimeType: 'video/mp4',
  extension: 'mp4',
  byteLength: 0,
  durationMs: 0,
  provenance: { adapterVersion: '...', authenticated: false },
  reason: 'machine-readable failure or skip reason',
}
```

该对象的完成标准是可检查的：任何 `downloaded` 结果都必须在受控目录中拥有通过 MIME/魔数、大小和媒体探测验证的文件；任何非成功结果都必须说明调用过的 adapter、是否可重试及为何没有写入文件。不要在 review artifact 中存放 cookie、授权头、原始会话 URL 或可能携带短期签名的完整日志。

## 文档一致性与指针检查

| 检查 | 结果 | 证据与必要修正 |
|---|---|---|
| 跨章节一致性 | **失败**。正文称专用方案用于已知平台，但优先级和流程又让全部 URL 先经过 Cobalt。 | 选择并论证一个策略选择规则，删除相互竞争的线性顺序。[1] |
| 活跃文档一致性 | **失败**。交接文档的“all methods verified”与快速参考中的抖音“未测试”冲突。 | 按 adapter 维护单一状态表；以可复现 smoke run 更新状态。[1] [4] |
| #75 / #77 约束覆盖 | **部分通过**。文档提及分工，但没有将 #75 的回归测试、许可证审查及 SVE 目标写入验收，也没有遵守 #77 的“先验证再标注”边界。 | 在范围中声明：哪些是 #75 adapter 集成，哪些必须等待 #77 的 source capability 调研。[5] [6] |
| 指针目标完整性 | **部分通过**。相关研究文件存在，TikTok 细节也能追溯。 | 将 Cobalt 的官方 API、部署文档、版本/实例配置和测试证据作为新指针；不要只引用 star 数和第三方部署页。[7] [8] |
| 文件存在性 | **通过**。交接文档列出的 registry、sourcer 和两份研究文档均存在。 | 将新增 adapter、测试和运行配置列入影响图，防止实现时遗漏。 |

## 必需的文件影响图

| 文件或模块 | 必须完成的修改 | 风险与验证 |
|---|---|---|
| `scripts/short-video/lib/source-registry.mjs` | 将视频发现配置与下载 adapter 配置分离；禁止用泛化 `cdp` 标签承载不同下载器。 | **高**。schema fixture 应验证每个 source 的 adapter ID、前置条件与发现方式。 |
| `scripts/short-video/lib/video-downloaders.mjs`（新增，建议） | 实现策略选择器、统一 `DownloadResult`、Cobalt 状态机、平台 adapter 接口和限制执行器。 | **高**。以 mock HTTP/CDP/MCP 边界完成单元测试，不在测试中请求真实平台。 |
| `scripts/short-video/lib/asset-sourcer.mjs` | 仅调用下载器和统一落盘/归属管道；保留现有 review-first、不直接修改 scene-data 的原则。 | **高**。验证既有 stock、YouTube 和 B 站行为不回归。 |
| `scripts/short-video/lib/cdp-client.mjs` | 仅在决定实现最小 CDP generic adapter 后，添加受限的页面/iframe/资源读取契约。 | **高**。验证 tab 清理、超时、MSE/DRM/跨域拒绝的明确失败。 |
| `scripts/short-video/__tests__/video-downloaders.test.mjs`（新增） | 覆盖策略选择、Cobalt 全响应状态、文件限制、provenance 与错误分类。 | **高**。不依赖真实 cookie、外部服务或实时网页。 |
| `scripts/short-video/__tests__/source-registry*.test.mjs` | 覆盖新 video discovery/download schema 与 #77 要求的 source capability 一致性。 | **高**。每个新增视频 source 都有回归 fixture。 |
| `.env.example`、运行文档或受控部署配置 | 文档化 `COBALT_API_URL`、可选鉴权、安全隔离和不入库的 cookie 路径；实例配置不提交秘密。 | **中**。空配置、无鉴权、需要 API key 和服务不可达均可安全降级。 |
| `docs/research/asset-source-quick-reference.md` 与被审阅交接文档 | 把状态、前置条件和最终 adapter 路由收敛到一个权威表；标记被替换的方案。 | **中**。文档三查：跨章节一致、指针逐字段覆盖、引用文件存在。 |

## 必需的行为验收矩阵

| ID | 场景 | 预期结果 |
|---|---|---|
| VD-01 | 现有 Pexels/Coverr 直接视频候选。 | 继续经 HTTP 下载、文件验证、provenance 与资产报告；无行为回归。 |
| VD-02 | YouTube 或 B 站候选。 | 仍通过受白名单保护的 `yt-dlp` 适配器，保持 20 MB / 8 秒等现有约束。 |
| VD-03 | Cobalt 不可达、未配置或实例 `services` 不包含 URL 平台。 | 策略选择器跳过 Cobalt，记录具名原因，继续尝试适用的已配置 adapter。 |
| VD-04 | Cobalt 返回 `tunnel` 或 `redirect`。 | 经统一下载器落盘；验证 HTTP 状态、MIME/魔数、大小、时长和原子清理。 |
| VD-05 | Cobalt 返回 `picker`、`local-processing` 或 `error`。 | 不把响应误写成 MP4；返回 `needs-selection`、`unsupported` 或可分类失败。 |
| VD-06 | 小红书 adapter 缺少登录态，或 TikTok 因地区/会话失败。 | 返回 `requires-session` / `region-blocked`，不泄露 cookie，不隐式转发私有链接。 |
| VD-07 | 抖音 `iesdouyin` 方案的固定公开样本。 | 解析到可下载媒体、产出合规文件并通过探测；失败时有可重试类别。此项通过前状态保持“未验证”。 |
| VD-08 | 通用 CDP 扫描得到 `blob:`、MSE/HLS/DRM、跨域错误或无视频页面。 | 不尝试伪造直接文件；返回明确 `unsupported`，确保 tab/临时文件清理。 |
| VD-09 | 上游返回 HTML 登录页、重定向页面、非视频 MIME 或小于最小阈值的内容。 | 拒绝写入资产目录，原因记录在 report，已有有效文件不受影响。 |
| VD-10 | 同一 canonical URL、短链重定向与 iframe 最终 URL 重复出现。 | 在最终规范化 URL / 内容哈希层去重，并保留可追溯 source URL。 |
| VD-11 | 所有 adapter 都失败。 | 资产报告记录每个已尝试策略及最终理由；管线继续处理其他候选。 |
| VD-12 | 新增 source capability。 | registry schema、策略选择和回归 fixture 同时通过；未完成 #77 所需调研的 source 不得声明可下载。 |

## 对原交接文档的修订请求（Track Changes 风格）

| 操作 | 位置 | 原始方向 | 请求替换或新增内容 |
|---|---|---|---|
| **Replace** | 页首状态，line 6 | “Ready for implementation — all methods verified”。 | 改为按 adapter 区分的状态表；抖音与 Cobalt 标为“候选/待验收”，并链接可复现 smoke evidence。 |
| **Replace** | Cobalt，lines 89–110 | “所有 URL 先走”“Docker 一行”“`tunnel/redirect` 即下载”。 | 写入实例 preflight、完整响应状态机、鉴权/限流、文件验证、`picker`/`local-processing` 策略与部署前置。 |
| **Replace** | 优先级与下载链路，lines 172–199 | 无条件 Cobalt-first 线性链路。 | 采用按 URL 可公开性、已配置会话、实例服务能力和 adapter 验证状态选择的策略路由。 |
| **Replace** | registry 示例，lines 201–230 | 所有新增平台均标为 `videos.method: 'cdp'`。 | 定义 discovery 与 download adapter 两层 schema；每个平台写入具名 adapter 和前置条件。 |
| **Replace** | `downloadVideo()` 伪代码，lines 233–280 | Cobalt 返回 ArrayBuffer，失败后以 source switch 分派。 | 使用统一 `DownloadResult`、独立 adapter registry、受控写入器和可观测失败代码。 |
| **Add** | 新节：“安全、隐私与资源限制”。 | 无。 | 公开 URL 限定、cookie 路径/不入库要求、超时、最大大小、最大时长、临时文件清理、日志脱敏和版权/provenance 规则。 |
| **Add** | 新节：“验证证据与 Acceptance Matrix”。 | 无。 | 把 VD-01–VD-12 作为实现测试清单；每个平台的 live smoke 明确 opt-in 并记录版本与日期。 |
| **Reconcile** | 相关文档及 issues。 | 仅列出 #75、#77 和研究文档。 | 说明哪些 adapter 属于 #75，哪些 capability 声明必须由 #77 先验收；同步快速参考的状态。 |

## 批准门槛

本评审只有在以下条件满足后才可批准实现：交接文档不再把候选方案称为“已验证”；下载器拥有固定、可测试的输出契约；Cobalt 的实例/API 状态被完整处理；source discovery 与下载 adapter 已分离；以及行为矩阵已被转换为自动测试和少量显式 opt-in 的 live smoke 证据。

随后实施应遵循项目既有的 Grill → Spec → Tickets → TDD → Code Review → Runtime Verify 流程。由于当前工作树已经包含其他未提交改动，本次评审仅新增该文档，未修改实现、依赖或配置。

## References

[1]: ../handoffs/handoff-video-download-breakthrough.md "Handoff: Video Download Breakthrough Research"
[2]: ../../scripts/short-video/lib/asset-sourcer.mjs "Current asset sourcing, direct download, yt-dlp and CDP execution paths"
[3]: ../../scripts/short-video/lib/source-registry.mjs "Current yt-dlp video capability registry and supported-platform allowlist"
[4]: ../research/asset-source-quick-reference.md "Maintained platform download status and prerequisites"
[5]: https://github.com/0xPabloLI/inside-china-ai/issues/75 "Issue #75: Integrate alternate download solutions and video-source labels"
[6]: https://github.com/0xPabloLI/inside-china-ai/issues/77 "Issue #77: Source capability and fallback-chain audit"
[7]: https://github.com/imputnet/cobalt/blob/main/docs/api.md "Cobalt API: responses, authentication, rate limits and instance capabilities"
[8]: https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md "Cobalt self-hosting requirements"
[9]: https://github.com/chubbyguan/chubbyskills "Chubby Skills repository, release, dependencies and license"
[10]: https://github.com/chubbyguan/chubbyskills/blob/main/douyin-transcribe/SKILL.md "Douyin share-page extraction workflow and operating limitations"
[11]: ../research/reference-video-extraction.md "TikTok CDP item/detail extraction, regional constraint and fallback"
