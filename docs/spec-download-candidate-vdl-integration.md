# Spec: downloadCandidate Helper + VDL Integration

> **Issue:** #115 + #75 VDL 集成
> **日期:** 2026-08-27
> **状态:** Ready for tickets
> **前置:** #63 (URL dedup) ✅ 已完成

## 背景

`asset-sourcer.mjs` 中 5 个下载块（Phase 0 cached images、API sources、yt-dlp sources、CDP sources、Tier 3）重复相同的 7 步模式：URL dedup check → pre-filter → build filename → destPath → download → mark URL → push asset/failed。同时 VDL（`video-downloaders.mjs`）已实现但未接入管线。

本 spec 将 5 个重复的下载块提取为统一的 `downloadCandidate()` helper，并在 helper 内部调用 VDL `downloadVideo()` 替代旧的 `downloadAsset()` / `downloadYtdlp()`。

## 做什么

### 1. 创建 `lib/download-candidate.mjs`

提取统一的 `downloadCandidate()` helper：

```js
export async function downloadCandidate(candidate, opts) → { success, path?, error?, skipped? }
```

**职责：**
- 文件存在检查（`existsSync(destPath)` → 跳过）
- 调用 VDL `downloadVideo(candidate.url)` 获取 `DownloadResult`
- VDL status 映射：
  - `downloaded` + `buffer` → `writeFileSync(destPath, buffer)` → 返回 `{ success: true, path: relativePath, skipped: false }`
  - `skipped`（Cobalt 不可用等）→ 返回 `{ success: false, error: reason, skipped: true }`
  - `unsupported` → 返回 `{ success: false, error: reason, skipped: true }`
  - `needs-selection` → 返回 `{ success: false, error: "needs-selection" }`
  - `failed` → 返回 `{ success: false, error: reason }`
- Path 转换：`destPath.replace(contentDir + "/", "")` → 相对路径
- 确保 `assetsDir` 目录存在

**不做什么：**
- 不做 URL dedup check（caller 负责，因为 `downloadedUrls` Set 是共享状态）
- 不做 pre-filter（caller 负责，因为 pre-filter 结果决定 skipped vs continue）
- 不做 push allAssets / failed（caller 负责）
- 不做 markDownloaded（caller 负责）
- 不做 Wikimedia license fetch（caller 后处理）
- 不做 text-only handling（caller 前置处理）

### 2. 扩展 VDL 支持图片

**`video-downloaders.mjs` 改动：**

- `DIRECT_MEDIA_EXTENSIONS`：追加 `.jpg`, `.png`, `.webp`, `.gif`
- `downloadDirectHttp()` MIME 检查：`video/*` → `video/* || image/* || octet-stream`
- `DIRECT_MEDIA_DOMAINS`：追加图片 CDN 域名（`images.unsplash.com` 已在，追加 `img.pexels.com`）

### 3. 替换 `asset-sourcer.mjs` 的 5 个下载块

每个下载块从 ~15 行缩减为 ~5 行：

```js
// Before: 15行重复
const dlResult = await downloadAsset(candidate.url, destPath, headers);
if (dlResult.success) downloadedUrls.add(candidate.url);
if (dlResult.success) { allAssets.push({...}); } else { failed.push({...}); }

// After: 5行
const dl = await downloadCandidate(candidate, { destPath, contentDir, fetchFn, cobaltAdapter });
if (dl.success) downloadedUrls.add(candidate.url);
if (dl.success) { allAssets.push({...}); } else { failed.push({...}); }
```

**保留不动的特殊路径：**
- CDP text-only candidates（`type === "text"`）→ 不走 `downloadCandidate()`
- Wikimedia license fetch → `downloadCandidate()` 成功后 caller 自行处理
- Phase 0 的 `headers` 参数 → `downloadCandidate()` 接受可选 `headers` 传给 VDL（DirectHttp adapter 的 fetch headers）

## 不做什么

- 不新增平台 adapter（douyin/weibo/xhs 专用 adapter 是 #75 第二批遗留）
- 不修改 `source-registry.mjs` schema（等 #77）
- 不自动调配 Clash Verge 节点
- 不删除旧的 `downloadAsset()` / `downloadYtdlp()` 函数（保留导出，避免 break 其他消费者）

## 接口契约

### `downloadCandidate()` 签名

```js
/**
 * @param {Object} candidate - { url, type, source, ... }
 * @param {Object} opts
 * @param {string} opts.destPath - 绝对目标文件路径
 * @param {string} opts.contentDir - 内容目录绝对路径（用于相对路径转换）
 * @param {Object} [opts.headers] - 可选 HTTP headers（传给 DirectHttp adapter）
 * @param {typeof fetch} [opts.fetchFn] - 可注入的 fetch（测试用）
 * @param {CobaltAdapter} [opts.cobaltAdapter] - 可注入的 Cobalt adapter（测试用）
 * @returns {Promise<{success: boolean, path?: string, error?: string, skipped?: boolean}>}
 */
```

### 返回值消费

- `success: true` + `path` → caller: `allAssets.push({ ...candidate, path: dl.path, status: dl.skipped ? "already exists" : "downloaded" })`
- `success: false` + `error` → caller: `failed.push({ source, keyword, error: dl.error })`
- `skipped: true` → caller: `skipped.push({ source, reason: dl.error })`

### VDL DownloadResult → downloadCandidate 返回值映射

| VDL status | downloadCandidate 返回 | caller 行为 |
|------------|----------------------|-------------|
| `downloaded` (有 buffer) | `{ success: true, path: rel, skipped: false }` | push allAssets |
| `skipped` | `{ success: false, error: reason, skipped: true }` | push skipped |
| `unsupported` | `{ success: false, error: reason, skipped: true }` | push skipped |
| `needs-selection` | `{ success: false, error: "needs-selection" }` | push failed |
| `failed` | `{ success: false, error: reason }` | push failed |
| `downloaded` (无 buffer) | `{ success: false, error: "no-buffer" }` | push failed |

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `asset-sourcer.mjs` | 替换 5 个下载块为 `downloadCandidate()` 调用 | Medium | 核心下载路径变更。缓解：保留旧 `downloadAsset()`/`downloadYtdlp()` 导出，回归测试覆盖 5 个路径。wikimedia license fetch + text-only 保持原位。 |
| `video-downloaders.mjs` | 扩展 `DIRECT_MEDIA_EXTENSIONS` + 放宽 `downloadDirectHttp` MIME | Medium | DirectHttp adapter 行为变更。缓解：现有 42 个测试验证不回归 + 新增图片 MIME 测试。 |
| `download-candidate.mjs` (new) | 新建 helper | Low | 纯新增，不影响现有代码。 |
| `asset-sourcer.test.mjs` | 新增 downloadCandidate 集成测试 | Low | 纯追加。 |
| `video-downloaders.test.mjs` | 新增图片扩展名 + 图片 MIME 测试 | Low | 纯追加。 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | 图片 URL（`.jpg`）→ VDL `selectStrategy` | 选中 `direct-http`（扩展后） | Low | 扩展 `DIRECT_MEDIA_EXTENSIONS` |
| 2 | 图片 MIME（`image/jpeg`）→ `downloadDirectHttp` | 接受（扩展后） | Low | MIME 检查放宽 |
| 3 | 视频 URL（`.mp4`）→ VDL `selectStrategy` | 选中 `direct-http`（不变） | None | 无行为变更 |
| 4 | YouTube URL → VDL → `downloadYtdlpAdapter` | 调用 yt-dlp 下载 | Low | VDL 已有测试覆盖 |
| 5 | Cobalt 不可用 → VDL 返回 `skipped` | `downloadCandidate` 返回 `{ success: false, skipped: true }` | Low | Cobalt 是 fallback，不影响 direct-http/yt-dlp 路径 |
| 6 | 文件已存在 → `existsSync(destPath)` | `downloadCandidate` 返回 `{ success: true, path: rel, skipped: true }` | Low | 复用旧逻辑 |
| 7 | VDL 返回 `downloaded` + buffer | `downloadCandidate` 写文件 + 返回 `{ success: true, path: rel }` | Medium | 新逻辑，需测试 buffer 写入 |
| 8 | VDL 返回 `failed` | `downloadCandidate` 返回 `{ success: false, error: reason }` | Low | 错误传播 |
| 9 | VDL 返回 `needs-selection`（Cobalt picker） | `downloadCandidate` 返回 `{ success: false, error: "needs-selection" }` | Low | 无 buffer，不写文件 |
| 10 | VDL 返回 `unsupported`（local-processing） | `downloadCandidate` 返回 `{ success: false, skipped: true, error: reason }` | Low | 同 skipped 路径 |
| 11 | `candidate.url` 为 null/undefined | VDL `selectStrategy` 返回 `skipped` → `downloadCandidate` 返回 `{ success: false, skipped: true, error: "empty-url" }` | Low | VDL 已处理 |
| 12 | destPath 目录不存在 | `downloadCandidate` `mkdirSync` 创建 | Low | 复用旧逻辑 |
| 13 | `writeFileSync` 失败（磁盘满/权限） | `downloadCandidate` try/catch 返回 `{ success: false, error }` | Low | 错误传播 |
| 14 | Phase 0 cached images 走 VDL | 图片 URL → direct-http → buffer → 写文件 | Medium | 原走 `downloadAsset()`，现在走 VDL。需验证 headers 传递 |
| 15 | API sources 走 VDL（含 wikimedia） | 图片 URL → direct-http → buffer → 写文件 → wikimedia license fetch | Medium | wikimedia headers (`User-Agent`) 需传递 |
| 16 | yt-dlp sources 走 VDL | YouTube/B站 URL → ytdlp adapter → buffer → 写文件 | Medium | 原走 `downloadYtdlp()`，现在走 VDL。yt-dlp 参数一致性 |
| 17 | CDP sources 走 VDL | 图片 URL → direct-http → buffer → 写文件 | Medium | 原走 `downloadAsset()`，现在走 VDL |
| 18 | CDP text-only candidates | 不走 `downloadCandidate()`，直接 push | None | 不变 |
| 19 | Tier 3 走 VDL | 图片 URL → direct-http → buffer → 写文件 | Medium | 原走 `downloadAsset()`，现在走 VDL |
| 20 | headers 传递（User-Agent for wikimedia） | `downloadCandidate` opts.headers → DirectHttp fetch headers | Medium | 需确认 VDL DirectHttp 是否支持自定义 headers |
| 21 | 旧 `downloadAsset()` / `downloadYtdlp()` 仍可导出 | 其他消费者不受影响 | Low | 保留导出，不删除 |

## headers 传递方案

**问题**：VDL `downloadDirectHttp(url, opts)` 当前只接受 `fetchFn`，不接受自定义 headers。但 wikimedia 需要 `User-Agent` header。

**方案**：在 `downloadDirectHttp()` 的 `opts` 中新增 `headers` 参数，传给 `fetchFn(url, { headers })`。`downloadVideo()` 的 `opts` 新增 `headers`，透传给 `downloadDirectHttp()`。

```js
// downloadDirectHttp 改动:
const resp = await fetchFn(url, opts.headers ? { headers: opts.headers } : undefined);

// downloadVideo 改动:
case ADAPTER_IDS.DIRECT_HTTP:
  return downloadDirectHttp(canonicalUrl, { fetchFn, headers: opts.headers });
```

`downloadCandidate()` 接受 `opts.headers`，传给 `downloadVideo(url, { headers: opts.headers, fetchFn, cobaltAdapter })`。

## 实施计划

### Ticket 1: 扩展 VDL 支持图片 + headers 传递
- 扩展 `DIRECT_MEDIA_EXTENSIONS` + `DIRECT_MEDIA_DOMAINS`
- 放宽 `downloadDirectHttp` MIME 检查
- `downloadDirectHttp` + `downloadVideo` 新增 `headers` 参数
- 测试：图片扩展名选择、图片 MIME 接受、headers 传递

### Ticket 2: 创建 `download-candidate.mjs`
- 实现 `downloadCandidate()` helper
- 文件存在检查、VDL 调用、status 映射、文件写入、path 转换
- 测试：全部 21 个场景矩阵行

### Ticket 3: 替换 `asset-sourcer.mjs` 5 个下载块
- 替换 Phase 0 / API / yt-dlp / CDP / Tier 3 下载块
- 保留 text-only handling + wikimedia license fetch
- 测试：回归测试验证 5 个路径不 break
