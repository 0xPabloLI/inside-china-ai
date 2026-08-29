> **完成状态（2026-08-30）**：T1-T9 全部完成。8 commits（9781fe1..803ccfa）push 至 main。
> 验证：491 相关测试绿；全套件 2683 过（11 失败均为存量）；RAG 真跑 109 sources；Remotion 帧渲染通过。

# Tickets: 素材相关性重构（spec: docs/spec-asset-relevance-refactor.md ｜ parent issue #130）

> 压缩安全 checklist：本文件是唯一可靠的 ticket 状态来源。GitHub issues = #131-#139。
> 每 ticket 完成后立即在此打 `[x]`。

## T1 — RAG indexer summary fix（#131）
- [x] `allSourceIds` hoist + summary 修复
- [x] `node --check` 通过；rag 套件 184/184 绿
- [x] 真实增量重建 smoke（Step 6 统一执行）

## T2 — assetNeed 约定 + scene-rules B13（#132）
- [x] `checkAssetNeedAnnotation` FAIL 检查（voiceover 含 `[ASSET NEEDED`）
- [x] 注册进 `runAllSceneDataChecks`；现有 scene-rules 套件回归全绿（130/130）
- [x] 矩阵行 #3 单测覆盖

## T3 — lib/claim-keywords.mjs（#133）
- [x] `extractSceneClaims`（空/空白 assetNeed、mediaOptOut 优先、NO_MEDIA_TYPES 排除）
- [x] `claimToKeywords`（停用词、最多 3 关键词、确定性）
- [x] 矩阵行 #1/#4/#5 单测 + qwen4-preview 真实 scene-data smoke（10/10 绿）

## T4 — lib/used-asset-index.mjs（#134）
- [x] `buildUsedAssetIndex`（hash + canonicalizeUrl、排除当前 slug、降级语义）
- [x] `isReusedAsset`
- [x] 矩阵行 #11/#12/#13 单测 + 真实 content/ smoke（10/10 绿）

## T5 — VLM relevance 链路（#135）
- [x] vlm_analyzer.py：claim 参数 + `## Relevance` prompt/解析（claim=None 向后兼容快照；含 known_keys 覆盖 bug 修复）
- [x] visual-analyzer.mjs：透传（DEGRADED_RESULT + 请求序列化）+ relevance 字段
- [x] 矩阵行 #7 parse 单测（新测试全绿 + 旧 parse 10/10 + 消费方 272/272 回归）

## T8 — 衬线基准化（#136）
- [x] Remotion 全局 + base-styles.mjs 显式 Times 栈（BRAND_FONT_STACK 单一来源）
- [x] base-styles 测试 21/21 + Remotion tsc 干净
- [x] 真实帧 smoke（Step 6）

## T6 — gate + 绑定 + 40% cap（#137）
- [x] assignAssetsToScenes 扩展（绑定不 spill、overlap gate、fail-closed、40% 在线贪心）
- [x] 审计字段（relevanceScore/Source/Reason、reuseStats）
- [x] 矩阵行 #8/#9/#14/#15/#16/#17/#18/#19/#20/#26 单测 + 回归全绿

## T7 — 编排接线（#138）
- [x] asset-sourcer main() per-claim 搜索 + fallback 保留 + `--relevance-threshold`
- [x] main.mjs Step 1.5 不再传 companies[0]
- [x] 矩阵行 #2/#6/#10/#21 单测（网络 mock）
- [x] Real Data Smoke（qwen4-preview 链路，不下载不推理）

## T9 — 文档同步 + 归档 + issue 收尾（#139）
- [x] writing-for-agents 加载判定 → 4 docs + CONTEXT.md 更新（三查通过）
- [x] spec/tickets/review 归档 docs/archive/
- [x] GitHub issues 关闭 + roadmap 更新
