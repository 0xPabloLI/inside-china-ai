# 扫描覆盖矩阵

一句话：这张表回答「仓库哪些范围被扫过、裁决落在哪、还有什么没扫过」。分流规则（报告、裁决、批次票、覆盖缺口各自去哪）的唯一出处是 `docs/agents/issue-tracker.md` §Scanner & Audit Intake Contract；本文件只记状态，不重复规则。

## 维护

- **谁写**：执行该次扫描的 session，与写报告同一步。完成判据：报告已在 `docs/DOCS-INDEX.md` 登记，且本表出现了它对应的一行。
- **何时改**：跑完一次扫描（加行或更新「最近一次」）、裁决落定（更新「裁决落点」）、报告归档（把「报告」列改成 `docs/archive/reviews/` 路径）。
- **本表不记裁决状态**：真/假阳性与是否已吸收写在报告头部的 `裁决状态` 字段，那是唯一来源；本表只指向裁决落在哪（报告内联 + 相关 issue）。
- **覆盖缺口不派工**：表里没有 assignee、没有优先级、没有「待办」列，缺口只作为事实登记，所以它不会长成工作队列。要扫的时候才扫，扫完更新本表。
- **只登记扫描与审计覆盖**：提案复核、review brief 这类不对应代码范围的文档不进本表。
- **契约生效前的报告不回溯归档**：下表那批报告（9 份 `ocr-*`、5 份 `*-audit-*`、`ponytail-adoption-review-brief-*`，共 15 份）仍留在 `docs/reviews/`，没有 `裁决状态` 字段；谁下一次改动其中一份，谁按契约补齐字段并归档。
- **规模列带测量日**：数字用来判断「这份报告还算不算数」，不为保鲜重跑；日期过期不是错误，重跑才是更新。

## 覆盖表

| 范围 | 扫描器 | 最近一次 | 报告 | 裁决落点 | 已知盲区 |
| --- | --- | --- | --- | --- | --- |
| `src/routes/` | open-code-review + qwen3:8b（OCR A/B） | 2026-09-19 | `docs/reviews/ocr-routes-scan-2026-09-19.md` | 报告内联 + #319（PR #608 批次） | 当次扫 31 个文件，当前该目录 37 个 |
| `src/components/` 顶层 | open-code-review + qwen3:8b | 2026-09-20 | `docs/reviews/ocr-components-scan-2026-09-20.md` | 报告内联 + #319 | 当次只扫顶层 16 个文件；子目录见下面两行 |
| `src/components/widgets/` | open-code-review + qwen3:8b | 2026-09-20 | `docs/reviews/ocr-widgets-scan-2026-09-20.md` | 报告内联 + #319 | 当次 37 个文件，3 个测试文件被过滤 |
| `src/components/ui/`（shadcn） | open-code-review v1.12.6 | 2026-09-20 | `docs/reviews/ocr-ui-scan-2026-09-20.md` | 报告内联 + #319 | 当次 47 个文件 |
| `src/lib/` | open-code-review + qwen3:8b | 2026-09-20 | `docs/reviews/ocr-lib-scan-2026-09-20.md` | 报告内联 + #319 | 当次 33 个文件（2 个测试文件被过滤），当前该目录 56 个 |
| `src/integrations/supabase/` | open-code-review + qwen3:8b | 2026-09-20 | `docs/reviews/ocr-supabase-scan-2026-09-20.md` | 报告内联 + #319 | 当次 8 个文件，1 个测试文件被过滤；`src/integrations/lovable/` 未扫 |
| `scripts/short-video/` 核心 5 文件 | open-code-review + qwen3:8b | 2026-09-19 | `docs/reviews/ocr-video-scan-2026-09-19.md` | 报告内联 + #319（PR #608 批次） | `lib/asset-sourcer.mjs` 当时 3353 行、超时未审；今 4005 行 |
| `scripts/short-video/` 脚本批量 | open-code-review + qwen3:8b | 2026-09-20 | `docs/reviews/ocr-video-batch-scan-2026-09-20.md` | 报告内联 + #319 | 只有 batch 1–2（40 / 166 文件），batch 3–8 因扫描模型被删全部失败 |
| 当次工作区改动（增量路径） | open-code-review v1.12.9 + ornith:1.5-9b | 2026-09-24 | `docs/reviews/ocr-scan-2026-09-24.md` | 报告内联（无 issue） | 只覆盖当次 3 个改动文件 |
| 全仓库死码与冗余 | knip 5 + ripgrep + 人工逐项确认 | 2026-09-20 | `docs/reviews/dead-code-audit-2026-09-20.md` | 报告内联 | 基线 commit `dcd88cb`；结论逐条附可复现命令 |
| `scripts/short-video/` 管线信号密度 | 人工审计（对照 ADR-0016） | 2026-09-06 | `docs/reviews/signal-density-audit-2026-09-06.md` | 报告内联 + #68 → #198 | 行号基于 2026-09-06 HEAD |
| `scripts/short-video/` 数据结构 SSOT | 人工审计 | 2026-09-06 | `docs/reviews/ssot-audit-2026-09-06.md` | 报告内联 + #76 → #199 | 行号基于 `7050bbb` |
| source registry 手工维护面 | 人工 + `node` 实测 | 2026-09-06 | `docs/reviews/maintenance-audit-2026-09-06.md` | 报告内联 + #87 → #200 | 行号基于 `1c80bae` |
| 62 条来源链路（静态 + live 探针） | 人工审计 + 真机探针 | 2026-09-15 | `docs/reviews/source-chain-audit-2026-09-15.md` | 报告内联 + #309 | live 探针逐源结果依赖当次网络环境 |

## 已知未扫区域

规模按 2026-11-04 实测；缺口不是待办，只是事实。

- `scripts/short-video/` 其余约 530 个 `.mjs`（该目录共 577 个，已覆盖的只有批量批 1–2 与核心 5 个），含 `lib/b-roll/`（9 个 `.mjs`，另有 2 个 `.py` 与 `t2v-eval/`）等多数模块。
- `scripts/` 根目录的 27 个工具脚本（`lint-*`、`verify-*`、`check-*` 等）没有任何扫描报告。
- `src/` 中不在任何报告范围内的目录：`src/hooks/`（3 个文件）、`src/integrations/lovable/`。
- `src/lib/` 已扫 33 个之外的约 23 个文件；`src/routes/` 当次未纳入的约 6 个文件。
- `supabase/migrations/`（22 个 `.sql`）、`skills/` 从未被代码扫描器覆盖。
