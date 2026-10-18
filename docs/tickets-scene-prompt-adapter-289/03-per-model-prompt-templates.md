# Ticket 03 — per-model prompt 模板（可拆分增量）

> Spec: [spec-scene-prompt-adapter-289.md](../specs/spec-scene-prompt-adapter-289.md) · Part 3（D4） · **descopable**，不阻塞 01/02

## Scope

新增一个 per-model prompt 模板模块（由跟进票创建，本票不建）：按目标 T2V 模型 family（默认档 FastMetal-5B-QAD；`BROLL_MODEL=fastmetal-1.3b` 退路）给 prompt 的格式/语言偏好。附 `docs/research/` 笔记记录依据。

## Blocking edges

- 外部事实调研（模型官方示例 / 社区 prompt 工程经验）→ 按 AGENTS.md §7 proposal-review，需证据与许可边界记录。
- **若本 session 无法在收尾前完成**：转为独立跟进 issue，Spec/本票标注「deferred」，不作本票验收项。

## Demo path

模块可 import 加载（无副作用）；导出按 family 的模板表。

## Acceptance criteria

- [ ] 模块加载无副作用；导出 per-family 模板表  
- [ ] research 笔记记录来源、许可、可复用边界  
- [ ] 未接线（不改生成路径），故无运行时行为变化  
- [ ] 若 defer：创建跟进 issue 并在本票交付评论标注
