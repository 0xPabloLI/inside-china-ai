# T4 — 门 1 集成到 main.mjs + render-only.mjs

**What to build:** 在 `main.mjs` Step 4（ASS 生成）和 Step 5（渲染/合成）之间插入 canonical-text 门。在 `render-only.mjs` 的 ASS 生成后、渲染前也插入。门 1 FAIL → 硬失败并提示原因。

**Parent:** #120

**Blocked by:** T3

**Status:** ready-for-agent

- [x] `main.mjs`: 在 `regenerateSubtitles()` 之后、`renderRemotion()`/`assembleVideo()` 之前调用 `verifyCanonicalText()`
- [x] PASS → 继续渲染/合成（正常路径）
- [x] FAIL → 硬失败，`process.exit(1)`，输出失配详情
- [x] `render-only.mjs`: 同样在 ASS 生成后、渲染前调用门 1
- [x] `render-only.mjs` 中 FAIL → 硬失败，提示 "scene-data voiceover has changed but subtitle-timing.json is stale. Run full pipeline: `node main.mjs --content <slug>`"
- [x] 测试：门 1 PASS 时管线正常继续
- [x] 测试：门 1 FAIL 时管线 exit(1) 并输出诊断
