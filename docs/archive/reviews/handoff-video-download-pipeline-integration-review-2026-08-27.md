# Review 整合: Video Download Pipeline Integration

> **评审日期：** 2026-08-27
> **评审人：** Agent session（整合 Manus AI 对 `handoff-video-download-breakthrough.md` 的 review）
> **审阅范围：** 旧版 handoff + 已实现代码（`video-downloaders.mjs` + 42 个测试）+ 新版 handoff（`handoff-video-download-pipeline-integration.md`）
> **结论：** Review 总体合理且高质量，**大部分阻塞性发现已被实际实现解决**，少数仍需后续处理

## Review 背景

Manus AI 对旧版 handoff（`handoff-video-download-breakthrough.md`）做了详细 review，提出 5 个阻塞性发现、12 个验收矩阵和 7 条 Track Changes 修订请求。该 review 写于代码实现之前，针对的是 handoff 文档中的伪代码和方案描述。

此后 Agent 实现了 VDL 第一批代码（`video-downloaders.mjs` + `url-normalizer.mjs` + 42 个测试），并在新版 handoff（`handoff-video-download-pipeline-integration.md`）中重新组织了 issue 依赖链。

本文整合 review 的每一条意见，对照已实现代码判断是否已解决、是否仍需处理。

## 一、阻塞性发现逐条分析

### 发现 1：「所有方法已验证」与维护文档不一致 — ✅ 已解决

**Review 诉求：** 按平台和环境拆分状态；没有可复现验收记录不得标为已验证。

**已实现状态：**

- 旧版 handoff 标题已改为 `Ready for implementation — 需要按顺序执行 3 个 issue`（新版 handoff），删除了 "all methods verified" 表述
- 抖音方案状态：在新版 handoff 中标注为「#75 第二批遗留」，不再声称已验证
- Cobalt smoke test 结果已记录在新版 handoff 中：YouTube ✅ tunnel / Streamable ✅ redirect / 其他平台因 Cobalt parser 过期或代理 IP 被封而失败
- `asset-source-quick-reference.md` 仍标注抖音为"未测试"，与新版 handoff 一致

**遗留：** `asset-source-quick-reference.md` 需要更新 Cobalt smoke test 结果——属于 #77 scope。

### 发现 2：`capabilities.videos.method = "cdp"` 不能表达实现 — ⚠️ 部分解决

**Review 诉求：** 将视频发现配置与下载 adapter 配置分离；禁止用泛化 `cdp` 标签承载不同下载器。

**已实现状态：**

- VDL 代码层面已解决：`ADAPTER_IDS` 定义了 `direct-http`、`ytdlp`、`cobalt` 三个具名 adapter，不再用 `cdp` 作为下载器标签
- `selectStrategy()` 按 URL 路由到具名 adapter，不经过 `source-registry.mjs` 的 `capabilities.videos.method`
- 但 `source-registry.mjs` 的 schema **尚未更新**——仍用旧的 `method: "ytdlp"` / `method: "cdp"` 标签
- Review 提出的 discovery vs download 分离 schema 理念正确，但属于 #77 scope（source capability audit）

**遗留：** #77 需要更新 `source-registry.mjs` schema，将 `capabilities.videos` 拆分为 discovery + download adapter 两层。VDL 代码层面已准备好消费新的 adapter ID，但 registry 标注仍需更新。

### 发现 3：Cobalt API 契约被过度简化 — ✅ 已解决

**Review 诉求：** 实现 preflight（GET /）、完整响应状态机（tunnel/redirect/picker/local-processing/error）、鉴权、限流分类、文件验证（MIME/魔数/大小/清理）。

**已实现状态（对照代码）：**

| Review 要求                      | 代码实现                                                                            | 状态 |
| -------------------------------- | ----------------------------------------------------------------------------------- | ---- |
| `GET /` preflight                | `CobaltAdapter.preflight()` — 检查 version, services, turnstileSitekey              | ✅   |
| `tunnel` / `redirect` → 下载     | switch case 处理，fetch media URL，返回 buffer                                      | ✅   |
| `picker` → needs-selection       | `status: "needs-selection", reason: "picker-response"`                              | ✅   |
| `local-processing` → unsupported | `status: "unsupported", reason: "local-processing-not-supported"`                   | ✅   |
| `error` → 分类                   | `classifyError()` — rate_exceeded(可重试) / auth(不可重试) / fetch / link / content | ✅   |
| 非 JSON 响应 → failed            | Content-Type 检查，HTML → `invalid-response`                                        | ✅   |
| 鉴权 (API key)                   | `Authorization: Api-Key ${this.apiKey}` header                                      | ✅   |
| 限流                             | `classifyError("rate_exceeded")` → retryable=true                                   | ✅   |
| MIME 检查                        | `content-type.startsWith("video/")` + `octet-stream`                                | ✅   |
| 大小限制                         | MIN_FILE_BYTES (1KB) + MAX_FILE_BYTES (20MB)                                        | ✅   |
| 临时文件清理                     | Cobalt 用 buffer（无临时文件）；Ytdlp 用 `unlinkSync(tmpPath)`                      | ✅   |
| HTML/鉴权页检测                  | tunnel media URL 的 Content-Type 检查 → `non-video-response`                        | ✅   |

**所有阻塞性 Cobalt API 问题已在代码中解决。** 42 个测试覆盖了所有 5 种 Cobalt 响应状态 + 错误分类 + 鉴权 + 非 JSON + HTML 伪装 + 大小限制 + 平台不支持。

### 发现 4：无条件的「Cobalt first」顺序 — ✅ 已解决

**Review 诉求：** 由策略选择器而非固定线性顺序决定调用次序。

**已实现状态：**

- `selectStrategy()` 实现了策略选择器：直接媒体 URL → HTTP；YouTube/B站 → ytdlp；未知 URL → cobalt
- **不再 Cobalt-first**——已知平台优先走专用 adapter，Cobalt 只处理未知 URL
- 旧版 handoff 的「所有 URL 先走 Cobalt」已被废弃

**Review 理念与实现完全一致。** 策略选择器按 URL 特征路由，而非固定线性顺序。

### 发现 5：CDP 工具不足以承载「通用视频提取」 — ✅ 不适用

**Review 诉求：** CDP 通用 adapter 需限定范围（公开页面、单一可下载 URL、非 blob:、有限 iframe）；MSE/DRM/HLS 返回明确 unsupported。

**已实现状态：**

- VDL 第一批**没有实现 CDP 通用 adapter**——只有 `direct-http`、`ytdlp`、`cobalt` 三个 adapter
- CDP 通用提取是旧版 handoff 的「6b」方案，属于 #75 第二批或未来 enhancement
- 新版 handoff 的 issue 链中没有 CDP adapter——已被排除在 scope 之外
- 因此 Review 的发现 5 **不适用于当前 scope**，但其约束应在未来 CDP adapter 实现时遵循

## 二、验收矩阵逐条分析

| ID    | Review 场景                          | 已有测试覆盖                                                                       | 状态                                             |
| ----- | ------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| VD-01 | Pexels/Coverr 直接视频候选           | ✅ `downloadDirectHttp` 测试 + `downloadVideo` 路由测试                            | 已覆盖                                           |
| VD-02 | YouTube/B站候选                      | ✅ `selectStrategy` 路由测试（不实际调 yt-dlp）                                    | 部分覆盖（策略选择已测，实际下载需集成测试）     |
| VD-03 | Cobalt 不可达                        | ✅ `preflight fails` + `downloadVideo cobalt unavailable`                          | 已覆盖                                           |
| VD-04 | Cobalt tunnel/redirect               | ✅ tunnel + redirect 两个测试                                                      | 已覆盖                                           |
| VD-05 | Cobalt picker/local-processing/error | ✅ picker + local-processing + rate_exceeded + auth.error 四个测试                 | 已覆盖                                           |
| VD-06 | 小红书/TikTok 登录态缺失             | ⚠️ Cobalt 平台不支持 → skipped 已测；但专用 adapter 尚未实现                       | 部分覆盖（Cobalt 路径已测，专用 adapter 未实现） |
| VD-07 | 抖音 iesdouyin 固定公开样本          | ❌ 未实现——抖音专用 adapter 是 #75 第二批                                          | 未覆盖（不在当前 scope）                         |
| VD-08 | CDP blob/MSE/DRM/跨域                | ❌ 未实现——CDP adapter 不在当前 scope                                              | 不适用                                           |
| VD-09 | HTML 登录页/非视频 MIME/小文件       | ✅ `non-video-mime` + `file-too-small` + `empty-url` + Cobalt `non-video-response` | 已覆盖                                           |
| VD-10 | URL 去重                             | ✅ `canonicalizeUrl` idempotent + 不同 query params 去重                           | 已覆盖（#63 将在管线层面应用）                   |
| VD-11 | 所有 adapter 都失败                  | ✅ `downloadVideo cobalt unavailable` → skipped with reason                        | 已覆盖                                           |
| VD-12 | 新增 source capability               | ❌ 需 #77 source registry schema 更新                                              | 未覆盖（不在当前 scope）                         |

**结论：** 12 个验收矩阵中，7 个已完全覆盖，2 个部分覆盖（将在 #115 集成时补全），3 个不在当前 scope（CDP adapter / 抖音专用 adapter / source registry schema）。

## 三、Track Changes 修订请求逐条分析

| #   | Review 操作                  | Review 诉求                                          | 当前状态                                                     |
| --- | ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Replace 页首状态             | 改为按 adapter 区分状态表                            | ✅ 已解决——新版 handoff 不再声称 "all methods verified"      |
| 2   | Replace Cobalt 伪代码        | 写入 preflight + 完整状态机 + 鉴权/限流 + 文件验证   | ✅ 已解决——代码实现了所有这些                                |
| 3   | Replace 优先级链路           | 用策略选择器替代 Cobalt-first                        | ✅ 已解决——`selectStrategy()` 实现                           |
| 4   | Replace registry 示例        | 定义 discovery + download adapter 两层 schema        | ⚠️ 代码层面已准备好（ADAPTER_IDS），registry schema 等待 #77 |
| 5   | Replace downloadVideo 伪代码 | 用统一 DownloadResult + 独立 adapter registry        | ✅ 已解决——`DownloadResult` typedef + 3 个 adapter           |
| 6   | Add 安全/隐私/资源限制节     | 公开 URL 限定、cookie 路径、超时、大小上限、日志脱敏 | ⚠️ 部分解决——大小上限/MIME/超时已有；cookie/隐私边界需 #77   |
| 7   | Add 验收矩阵节               | VD-01~VD-12 转为测试                                 | ✅ 大部分已转为测试（7/12 完全覆盖）                         |

## 四、Review 提出的 DownloadResult 契约对照

Review 要求的 DownloadResult 字段：

| Review 字段  | 实现字段                                                         | 状态                                           |
| ------------ | ---------------------------------------------------------------- | ---------------------------------------------- |
| `status`     | `status` (downloaded/skipped/needs-selection/unsupported/failed) | ✅ 完全一致                                    |
| `strategy`   | `strategy` (direct-http/ytdlp/cobalt)                            | ✅ 一致（review 列了更多 adapter，那些未实现） |
| `source`     | `source`                                                         | ✅                                             |
| `sourceUrl`  | `sourceUrl`                                                      | ✅                                             |
| `finalUrl`   | `finalUrl` (optional)                                            | ✅                                             |
| `mimeType`   | `mimeType` (optional)                                            | ✅                                             |
| `extension`  | `extension` (optional)                                           | ✅                                             |
| `byteLength` | `byteLength`                                                     | ✅                                             |
| `durationMs` | `durationMs`                                                     | ✅                                             |
| `provenance` | `provenance: { adapterVersion, authenticated }`                  | ✅ 完全一致                                    |
| `reason`     | `reason` (optional)                                              | ✅                                             |
| —            | `buffer` (implementation detail)                                 | 新增（review 未要求但合理）                    |
| —            | `retryable` (for failed)                                         | 新增（review 未要求但合理）                    |

**DownloadResult 契约完全符合 Review 要求**，且额外增加了 `buffer`（实际下载数据）和 `retryable`（重试建议）字段。

## 五、文件影响图对照

| Review 要求的文件                 | 当前状态                                              |
| --------------------------------- | ----------------------------------------------------- |
| `source-registry.mjs`             | ❌ 未修改——schema 分离等 #77                          |
| `video-downloaders.mjs`           | ✅ 已创建——策略选择器 + 3 个 adapter + DownloadResult |
| `asset-sourcer.mjs`               | ❌ 未修改——集成等 #115                                |
| `cdp-client.mjs`                  | ❌ 未修改——CDP adapter 不在当前 scope                 |
| `video-downloaders.test.mjs`      | ✅ 已创建——42 个测试                                  |
| `source-registry*.test.mjs`       | ❌ 未创建——等 #77 schema 更新                         |
| `.env.example`                    | ✅ 已更新——`COBALT_API_URL`                           |
| `asset-source-quick-reference.md` | ❌ 未更新——等 #77 smoke test 结果                     |

## 六、总体结论

| 维度          | 评分       | 说明                                                                                                               |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Review 质量   | ⭐⭐⭐⭐⭐ | 专业、系统、有据可查，每条发现都有代码行引用                                                                       |
| Review 适用性 | ⭐⭐⭐⭐   | 针对旧版 handoff 的伪代码，大部分问题已在实现中解决                                                                |
| 实现完成度    | 80%        | VDL 核心（策略选择器 + 3 adapter + DownloadResult + 42 测试）已完成；管线集成（#115）和 registry schema（#77）未做 |
| 遗留风险      | 低         | Cobalt 维护慢（B站/Twitter parser 失效），但有 fallback（ytdlp + direct-http）                                     |

### 需要在后续 issue 中处理的 Review 要求

| #   | 遗留要求                                                       | 处理 Issue       | 优先级 |
| --- | -------------------------------------------------------------- | ---------------- | ------ |
| 1   | `source-registry.mjs` schema 拆分 discovery + download adapter | #77              | P0     |
| 2   | `asset-source-quick-reference.md` 更新 Cobalt smoke test 结果  | #77              | P1     |
| 3   | `asset-sourcer.mjs` 集成 VDL（调用 `downloadVideo()`）         | #115             | P0     |
| 4   | VD-02 集成测试（实际调 yt-dlp 验证不回归）                     | #115             | P1     |
| 5   | VD-06 专用 adapter（抖音/小红书/微博/TikTok）                  | #75 第二批       | P2     |
| 6   | VD-07 抖音 iesdouyin 固定公开样本测试                          | #75 第二批       | P2     |
| 7   | VD-12 source-registry schema 回归 fixture                      | #77              | P1     |
| 8   | 安全/隐私节（cookie 路径不入库、日志脱敏）                     | #77 或独立 issue | P2     |

### 不需要处理的（已被代码解决）

- Cobalt 完整状态机 → 已实现
- DownloadResult 统一契约 → 已实现
- 策略选择器替代 Cobalt-first → 已实现
- preflight GET / → 已实现
- 鉴权/限流/错误分类 → 已实现
- 文件验证（MIME/大小/清理） → 已实现
- CDP 通用 adapter 约束 → 不在当前 scope，未来实现时参考

## 七、建议

1. **将本 review 整合文档归档到 `docs/archive/reviews/`** — Review 是 ephemeral 文档
2. **在 #115 spec 中引用本 review 的遗留要求** — 确保集成时不遗漏
3. **在 #77 spec 中引用 schema 拆分要求** — Review 发现 2 的 discovery vs download 分离
4. **旧版 handoff（`handoff-video-download-breakthrough.md`）可以归档** — 其伪代码已被实际代码替代，保留仅作历史参考
