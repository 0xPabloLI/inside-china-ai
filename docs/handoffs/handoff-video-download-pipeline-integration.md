# Handoff: Video Download Pipeline Integration

> **日期：** 2026-08-27
> **状态：** Ready for implementation — 需要按顺序执行 3 个 issue
> **作者：** Agent session 2026-08-27
> **关联 Issues：** #63 → #115 (+ #75 VDL 集成) → #114 (后续)

## 背景

asset-sourcer.mjs 的视频下载能力存在三个层面的问题：

1. **URL 去重缺失** — 多个 source 返回同一 URL 时没有去重，导致重复下载
2. **下载代码重复** — 5 个下载块重复相同的 7 步模式，维护成本高
3. **下载能力不足** — 只有 yt-dlp（YouTube/B站）和直接 HTTP 下载，缺少国内平台（抖音/小红书/微博）的下载能力

这三个问题分散在 3 个 issue 中（#63、#115、#75），但它们改的是同一段代码（`asset-sourcer.mjs` 的下载逻辑），且有依赖关系。本 handoff 串联这些 issue，明确执行顺序和集成方案。

## 已完成的工作

### #75 第一批：Video Download Layer (VDL) — ✅ 已完成

- **Commit:** a99e14c (2026-08-26) + dfa98ad (2026-08-27)
- **文件：** `scripts/short-video/lib/video-downloaders.mjs` + `url-normalizer.mjs` + 42 个测试
- **Cobalt 实例：** 已部署（Docker, localhost:9000, v11.7.1, Watchtower 自动更新）
- **集成验证：** VDL `CobaltAdapter.preflight()` + `download()` 与真实 Cobalt 实例验证通过
- **Smoke Test：** YouTube ✅ tunnel 成功 / Streamable ✅ redirect 成功 / 其他平台因 Cobalt parser 过期或代理 IP 被封而失败（不影响 VDL 架构）

**VDL 架构：**
```
URL → canonicalizeUrl → selectStrategy → adapter.download → DownloadResult
                                              ↓
                          ┌─────────────┬──────────────┬──────────────┐
                          ↓             ↓              ↓
                    DirectHttp     YtdlpAdapter    CobaltAdapter
                    (直接 .mp4)    (YouTube/B站)   (国外平台)
```

**VDL 尚未接入管线** — `asset-sourcer.mjs` 没有调用 `downloadVideo()`。这是 #115 要做的集成。

## 待执行的 Issue 链

### 依赖关系图

```
#63 (URL dedup)          无依赖，可立即开始
  ↓
#115 (downloadCandidate)  ← 依赖 #63
  + #75 VDL 集成           ← 合并到 #115 一起做
  ↓
#114 (SVE)               ← #115 完成后的上游消费者（非阻塞，可后续做）
```

### Issue 1: #63 — URL dedup (standalone)

**状态：** OPEN, 无依赖, 可立即开始
**预估：** 小（1 个函数 + 1 个调用点 + 几个测试）

**做什么：**
- 在 `search-sources.mjs` 的 `allArticles.push(...)` 之后、模式分支之前，插入 URL 去重
- 复用 `scripts/short-video/lib/url-normalizer.mjs` 中的 `canonicalizeUrl()`（#75 已实现，不要重写）
- 新增 `dedupByUrl(articles)` 函数在 `trends-utils.mjs`

**不做什么：**
- 不改下载逻辑（那是 #115）
- 不改 source-registry schema

**冲突文件：** `search-sources.mjs`, `trends-utils.mjs`

**与 #75 的重叠：** #63 scope 第 3 项（URL normalization helper）已被 #75 的 `url-normalizer.mjs` 覆盖。#63 直接 import 即可，不要重新实现。已更新 #63 body 标注此重叠。

### Issue 2: #115 — downloadCandidate helper + VDL 集成

**状态：** OPEN, 依赖 #63 先完成
**预估：** 中（提取 helper + 替换 5 个下载块 + 集成 VDL + 测试）

**做什么：**
1. 创建 `lib/download-candidate.mjs`，提取 `asset-sourcer.mjs` 中 5 个重复的下载块为统一的 `downloadCandidate()` helper
2. 在 `downloadCandidate()` 内部调用 VDL `downloadVideo()` 而不是旧的 `downloadAsset()`/`downloadYtdlp()`
3. 替换 `asset-sourcer.mjs` 的 5 个下载块为 `downloadCandidate()` 调用
4. 测试：验证既有 stock/YouTube/B站 行为不回归

**集成后的流程：**
```
asset-sourcer.mjs main()
  → downloadCandidate(candidate, ...)   ← #115 提取的 helper
    → downloadVideo(candidate.url)      ← VDL 入口（#75 第一批已实现）
      → selectStrategy(url)             ← 策略选择器
        → DirectHttp / YtdlpAdapter / CobaltAdapter
      → DownloadResult
    → 如果成功：写入 assets 目录 + 加入 allAssets
    → 如果失败：记录 reason + 加入 failed
```

**不做什么：**
- 不新增平台 adapter（douyin/weibo/xhs 专用 adapter 仍是 #75 第二批遗留）
- 不修改 source-registry.mjs schema（等 #77）
- 不自动调配 Clash Verge 节点（属于未来 enhancement）

**冲突文件：** `asset-sourcer.mjs`, `download-candidate.mjs` (new)

**与 #75 的关系：** #75 的 VDL 代码已写完（第一批），集成工作合并到本 issue。#75 不再单独做集成。已更新 #75 和 #115 的 body 标注此方案。

### Issue 3: #114 — SVE (Single-Visit Extraction)

**状态：** OPEN, 非阻塞，#115 完成后的上游消费者

**做什么：**
- 当 CDP 打开一个 URL 时，同时提取 articles + images + videos（当前只提取 articles + images）
- 提取到的视频 URL 喂给 VDL `downloadVideo()` 下载

**与前面的关系：** SVE 是 VDL 的上游消费者——SVE 提取视频 URL，VDL 负责下载。#115 完成后 VDL 已接入管线，SVE 可以直接调用。但 SVE 不是阻塞项——不做 SVE，管线仍可通过现有 source 的 capabilities.videos 正常工作。

## 非阻塞性的相关 Issue

| Issue | 关系 | 是否阻塞？ |
|-------|------|-----------|
| **#77** (Source type labeling audit) | 审计 59 个 source 的 capabilities 标注。#75 第二批「source-registry capabilities.videos 标注」等 #77 结果 | 否 — #115 集成 VDL 不需要等 #77 |
| **#76** (SSOT violations audit) | 数据结构类型定义审计。#115 的 `downloadCandidate` 输入输出 schema 理想情况应被 #76 覆盖 | 否 — 不阻塞，但 #76 做完后可以回头补类型 |
| **#88** (Rename CDP script fields) | 清理工作，提到 "delete after #63 SVE"。但 #63 现在只是 URL dedup，SVE 在 #114 | 否 — #88 的清理不阻塞 #63/#115 |
| **#116** (Pipeline auto-start CDP proxy) | 让 search-sources.mjs 自启动 CDP proxy | 否 — 独立 issue |

## 前置阻塞检查结论

**没有发现更前置的阻塞 issue。** 依赖链是：

1. #63 — 无依赖，可立即开始
2. #115 + VDL 集成 — 仅依赖 #63
3. #114 — 非阻塞，可后续做

所有其他相关 issue（#77, #76, #88, #116）都是非阻塞的平行 issue。

## Cobalt 维护状态 ⚠️

Cobalt 项目（imputnet/cobalt）处于「有活动但更新极慢」状态：
- repo 未 archived，42K stars，issues 仍活跃
- 但 main 分支最后一次 commit 是 2026-04-06（4 个多月无新代码）
- B站/Twitter/Reddit parser 已失效，无人修复
- 可用但不能作为核心依赖，需要有 fallback

**对管线的影响：** Cobalt 是 VDL 的三个 adapter 之一，策略选择器会优先使用 `direct-http` 和 `ytdlp`，Cobalt 只是 fallback。即使 Cobalt 完全失效，管线仍能通过 yt-dlp 和直接 HTTP 下载视频。Cobalt 只对不支持 yt-dlp 的国外平台（TikTok、Instagram 等）有用。

已将「引入新工具/框架前必须检查维护状态」规则写入 AGENTS.md Proposal Self-Review 第 4 条。

## 本 session 的代码改动

| Commit | 描述 | 文件 |
|--------|------|------|
| a99e14c | VDL 第一批：策略选择器 + 3 个 adapter + 42 个测试 | `video-downloaders.mjs`, `url-normalizer.mjs`, test |
| dfa98ad | Cobalt 默认端口 3000→9000 | `video-downloaders.mjs`, test, `.env.example` |
| c566033 | AGENTS.md 维护状态检查规则 | `AGENTS.md` |

## Issue body 更新记录

| Issue | 更新内容 |
|-------|---------|
| #63 | scope 第 3 项改为 reuse `url-normalizer.mjs`；新增 Code Reuse 章节 |
| #75 | Cobalt 部署状态 + smoke test 结果 + 维护评估 + 集成方案（合并到 #115） |
| #115 | scope 加第 4 项 VDL 集成 + 与 #75 的关系 + 集成后流程图 |

## Review 整合

Manus AI 对旧版 handoff（`handoff-video-download-breakthrough.md`，已归档到 `docs/archive/`）做了详细 review（`docs/archive/reviews/handoff-video-download-breakthrough-review-2026-08-26.md`），提出 5 个阻塞性发现 + 12 个验收矩阵 + 7 条 Track Changes。

整合结论见 `docs/archive/reviews/handoff-video-download-pipeline-integration-review-2026-08-27.md`。

**总结：** Review 总体合理且高质量。5 个阻塞性发现中，3 个已被代码完全解决（Cobalt 状态机、策略选择器、状态标注），1 个部分解决（registry schema 等 #77），1 个不适用（CDP adapter 不在 scope）。12 个验收矩阵中 7 个已完全覆盖，2 个将在 #115 补全，3 个不在当前 scope。

**遗留要求需在后续 issue 中处理：**
- #77：`source-registry.mjs` schema 拆分 discovery + download adapter；`asset-source-quick-reference.md` 更新 Cobalt smoke test 结果
- #115：VD-02 集成测试（yt-dlp 不回归）；VD-06 专用 adapter 路径
- #75 第二批：VD-07 抖音 iesdouyin 固定样本测试

## 建议的下一步

1. **开始 #63**（URL dedup）— 无依赖，小任务，可快速完成
2. **然后 #115 + VDL 集成** — 中等任务，是核心集成工作
3. **#114（SVE）可后续做** — 非阻塞，是 enhancement
