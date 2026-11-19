# Spec — Run 身份与产物历史（#1432 Stage 3）

Status: archived（2026-11-19，S1–S5 全部交付） · Parent issue: #1432 · Planning scale: S2 · Risk: R3（产物路径、发布回执、清理授权）

## Problem Statement

`#462` Stage 1/2 只解除了**状态文件**（`pipeline-status.json`、`pending-analysis.json`）的互相覆盖。产物目录仍是覆盖式写入：同一 slug 重跑会覆盖 `output/<slug>/` 下的成片、逐场音频、profile 与发布包，记录里也没有 run 维度。后果是两版成片/审核/回执不能并存，无法回答「这份产物属于哪次 run」，也无法做同篇 A/B 对比。

## Decisions（durable）

- **D1 布局**：`output/<slug>/runs/<runId>/` 存一次 run 的全部产物；`output/<slug>/runs/manifest.json` 是追加式索引；`output/<slug>/latest.json` 指向最近一次**成功** run。slug 根仍是唯一发现入口，legacy `output/<slug>/` 原样保留。否决 `output/<slug>/<revision>/`：会把 `audio/`、`profile-*.json` 等既有一级文件名全部变成保留字，legacy 读取无法区分 revision 与文件。
- **D2 runId**：`r-<YYYYMMDDTHHMMSS>-<6 hex>`（UTC）。显式传入重复 id 直接报错；自动生成的 id 撞车重试 5 次后放弃。否决纯时间戳（同秒并发会撞）与递增序号（跨机器/克隆不可合并）。
- **D3 latest 语义**：只有终态成功（`rendered` / `published`）才移动 `latest.json`。失败/中断 run 留在 manifest 里、产物留在自己的目录，但永不成为 latest——失败不得遮蔽上一个好包。
- **D4 保留策略**：本 spec 的 S1–S3 一律 **keep-all**，不实现删除。`prune` 是独立切片，删除前必须证明目标 run 不被 latest、发布回执、`pending-analysis.json` 或 in-flight 锁引用；默认 dry-run，显式确认才删。理由：保留条数是产品决策（HITL），默认不能造成数据丢失。
- **D5 legacy 回退**：消费者按 `显式 runId → latest → legacy output/<slug>` 解析；指针指向的目录消失时回退 legacy 并标注 `source: "legacy"`，不读半删除路径。迁移命令默认 dry-run。
- **D6 staging 不动**：`public/audio`、`public/media`、Remotion bundle 在 S1–S3 继续共享并沿用现有串行锁。按 run 隔离 staging 需要先量渲染并发收益，不在本 spec 承诺。
- **D7 回执绑定**：`postGroupId` / 发布记录在 S4 增加 `runId`；在 S4 之前，回执仍按 slug 归属，读侧不得假装已绑定。

## Seams

| 层        | 文件                                                                                                                                | 切片 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 核心      | `lib/run-history.mjs`（已交付）                                                                                                     | S1   |
| 写侧      | `main.mjs`（allocate / write / mark）、`lib/profiler.mjs` 的 `outputDir`                                                            | S2   |
| 读侧      | `render-only.mjs`、`still-frame.mjs`、`qa-final-review.mjs`、`verify-remotion-frames.mjs`、`verify-hook-payoff.mjs`、`rerender.mjs` | S3   |
| 回执      | `publish-tiktok.mjs`、`tiktok-upload-prep.mjs`                                                                                      | S4   |
| 迁移/清理 | 新 CLI（`run-history.mjs migrate                                                                                                    | list | prune`）、`docs/content-pipeline.md` 布局节 | S5  |

## Slices

- **S1（本 PR）**：`lib/run-history.mjs` + `__tests__/run-history.test.mjs`。纯新增，不接线，运行时行为零变化。
  - 完成标准：15 条单测覆盖 id 形态/拒绝重复、manifest 追加、latest 只在成功时移动、失败不遮蔽、显式/latest/legacy 解析、两个 slug 隔离、坏 manifest 报错、路径逃逸拒绝。
- **S2 写侧**：`main.mjs` 启动时 `createRun`，全部产物写进 run 目录，成功 `markRun(rendered)`，异常 `markRun(failed)`。
  - 完成标准：真实 run 后 `runs/<id>/` 有音频/字幕/成片/profile；失败注入后 `latest.json` 不变。
- **S3 读侧**：消费者默认读 latest，`--run <id>` 显式选旧 run；legacy 包仍能 `render-only`。
  - 完成标准：旧包 render-only 走 legacy；新包 `--run` 重渲上一版不覆盖当前 latest。
- **S4 回执绑定**：发布记录写 `runId`，审计命令能列出 run→回执。
  - 完成标准：两次 run 的 `postGroupId` 不串。
- **S5 迁移与清理**：legacy dry-run 迁移；`prune` 引用保护。
  - 完成标准：任何被 latest/回执/pending-analysis 引用的 run 删不掉；迁移默认不写盘。

## Risks & scenarios

- **失败 run 遮蔽好包**：D3 + 单测「失败不移动 latest」。
- **latest 指针悬空**（目录被手删）：回退 legacy + 单测。
- **同 slug 并发**：runId 唯一，但 staging 仍共享，沿用串行锁；并发锁本身不在本 spec 改。
- **两个 slug 并行**：目录树与 manifest 各自独立 + 单测。
- **manifest 损坏**：报错并保留原文件，不静默重建 + 单测。
- **发布回执串 run**：S4 前不声称已绑定；审计命令在 S4 才给结论。
- **磁盘增长**：keep-all 到 S5；S5 前用 `run-history.mjs list` 观测体积，不自动删。

## Out of scope

- 同篇 A/B 对比界面、素材库 run 溯源（#310）、云存储/对象存储迁移。

## Verification

- S1：`npx vitest run scripts/short-video/__tests__/run-history.test.mjs`（15 tests）。
- S2–S5：每条切片以真实 run 或注入失败的运行证据验收，不以单测代替。
