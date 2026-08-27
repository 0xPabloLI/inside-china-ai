# Tickets: downloadCandidate Helper + VDL Integration

> **Spec:** `docs/spec-download-candidate-vdl-integration.md`
> **日期:** 2026-08-27
> **Issue:** #115 + #75 VDL 集成

## 依赖图

```
T1 (VDL 扩展图片 + headers) ← 无前置依赖
  ↓
T2 (download-candidate.mjs) ← 依赖 T1（VDL 支持图片 + headers 后 helper 才能正确调用）
  ↓
T3 (替换 asset-sourcer.mjs 5 个下载块) ← 依赖 T2（helper 就绪后才能替换）
```

## T1: 扩展 VDL 支持图片 + headers 传递

**状态:** Ready
**前置:** 无
**文件:** `scripts/short-video/lib/video-downloaders.mjs` + `scripts/short-video/__tests__/video-downloaders.test.mjs`

### Checklist

- [x] T1.1: 扩展 `DIRECT_MEDIA_EXTENSIONS` 追加 `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`
- [x] T1.2: 追加 `DIRECT_MEDIA_DOMAINS`：`img.pexels.com`
- [x] T1.3: 放宽 `downloadDirectHttp()` MIME 检查：`image/*` 也接受
- [x] T1.4: `downloadDirectHttp()` 新增 `opts.headers` 参数，传给 `fetchFn(url, { headers })`
- [x] T1.5: `downloadVideo()` 新增 `opts.headers` 透传给 DirectHttp adapter
- [x] T1.6: 测试：图片 `.jpg` URL → `selectStrategy` 选中 `direct-http`（场景 #1）
- [x] T1.7: 测试：`image/jpeg` MIME → `downloadDirectHttp` 接受（场景 #2）
- [x] T1.8: 测试：自定义 headers 传递到 fetch 调用（场景 #20）
- [x] T1.9: 测试：视频 `.mp4` URL 行为不回归（场景 #3）
- [x] T1.10: 测试：`non-media-mime` 不再对 `image/*` 触发（回归验证）

## T2: 创建 `download-candidate.mjs`

**状态:** Blocked by T1
**前置:** T1（VDL 支持图片 + headers）
**文件:** `scripts/short-video/lib/download-candidate.mjs` (new) + `scripts/short-video/__tests__/download-candidate.test.mjs` (new)

### Checklist

- [x] T2.1: 实现 `downloadCandidate(candidate, opts)` 函数签名
- [x] T2.2: 文件存在检查 `existsSync(destPath)` → 返回 `{ success: true, path: rel, skipped: true }`（场景 #6）
- [x] T2.3: 调用 VDL `downloadVideo(candidate.url, { headers, fetchFn, cobaltAdapter })`
- [x] T2.4: VDL `downloaded` + buffer → `writeFileSync(destPath, buffer)` + `mkdirSync` + 返回 `{ success: true, path: rel }`（场景 #7, #12）
- [x] T2.5: VDL `downloaded` 无 buffer → 返回 `{ success: false, error: "no-buffer" }`（场景 #21）
- [x] T2.6: VDL `skipped` → 返回 `{ success: false, error: reason, skipped: true }`（场景 #5）
- [x] T2.7: VDL `unsupported` → 返回 `{ success: false, error: reason, skipped: true }`（场景 #10）
- [x] T2.8: VDL `needs-selection` → 返回 `{ success: false, error: "needs-selection" }`（场景 #9）
- [x] T2.9: VDL `failed` → 返回 `{ success: false, error: reason }`（场景 #8）
- [x] T2.10: VDL null/undefined URL → `skipped` + `empty-url`（场景 #11）
- [x] T2.11: `writeFileSync` 失败 → try/catch 返回 `{ success: false, error }`（场景 #13）
- [x] T2.12: path 转换 `destPath.replace(contentDir + "/", "")` → 相对路径（跨 step 契约）

## T3: 替换 `asset-sourcer.mjs` 5 个下载块

**状态:** Blocked by T2
**前置:** T2（helper 就绪）
**文件:** `scripts/short-video/lib/asset-sourcer.mjs` + `scripts/short-video/__tests__/asset-sourcer.test.mjs`

### Checklist

- [x] T3.1: import `downloadCandidate` from `download-candidate.mjs`
- [x] T3.2: 替换 Phase 0（cached images）下载块为 `downloadCandidate()` 调用（场景 #14）
- [x] T3.3: 替换 API sources 下载块为 `downloadCandidate()` 调用（场景 #15）
  - 保留 wikimedia license fetch 后处理
  - wikimedia headers (`User-Agent`) 传递
- [x] T3.4: 替换 yt-dlp sources 下载块为 `downloadCandidate()` 调用（场景 #16）
- [x] T3.5: 替换 CDP sources 下载块为 `downloadCandidate()` 调用（场景 #17）
  - 保留 text-only handling 不变（场景 #18）
- [x] T3.6: 替换 Tier 3 下载块为 `downloadCandidate()` 调用（场景 #19）
- [x] T3.7: 确认旧 `downloadAsset()` / `downloadYtdlp()` 仍导出（场景 #21）
- [x] T3.8: 回归测试：所有现有 asset-sourcer.test.mjs 测试通过
- [x] T3.9: 回归测试：所有现有 video-downloaders.test.mjs 测试通过
