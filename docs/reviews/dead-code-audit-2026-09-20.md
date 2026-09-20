# Dead Code 与历史冗余审计报告

| 项 | 值 |
|---|---|
| 审计日期 | 2026-09-20 |
| 审计范围 | 全仓库（`src/`、`scripts/`、`skills/`、`docs/`、根目录历史目录） |
| 检测工具 | knip 5（`npx knip`）+ ripgrep 引用验证 + 人工逐项确认 |
| 审计基线 commit | `dcd88cb`（`docs(roadmap): register #322`） |
| 文档目的 | 供第三方 review 后决定是否删除；删除敏感，每项均附验证方法可复现 |
| 修订记录 | v3（2026-09-20）：v2 获第三方 Approved，采纳 3 点微调（E-3 精确 entry、A-1 补业务文档指针、C-3 符号数修正为 26），见 §13 修订记录 |

---

## 0. 方法论与可复现性（v2 修订：补充盲区说明）

每一条结论都可用以下命令独立复现，review 者无需信任本文档：

```bash
# 1. 运行 knip（项目已有配置）
npx knip

# 2. 验证某文件/符号无引用 —— 必须同时搜代码 AND 文档 AND skills
grep -rn "tiktok-csi" . --include="*.mjs" --include="*.ts" --include="*.tsx" --include="*.md" --include="*.sh" \
  | grep -v node_modules | grep -v ".git/"

# 3. 确认 git 追踪状态（删前必做）
git ls-files <path>          # 是否被追踪
git check-ignore -v <path>   # 是否被 gitignore

# 4. 确认某目录是否被代码 import（排除自身和 node_modules）
grep -rn "<dir-name>" --include="*.ts" --include="*.tsx" --include="*.mjs" src/ scripts/ skills/ docs/ \
  | grep -v node_modules | grep -v "<dir-name>/"
```

### v1 的方法论盲区（已纠正）

v1 报告出现误判的核心原因在于审计手段过于单一，具体盲区：

1. **过度依赖纯代码 import 关系**：grep 只过滤 `*.mjs/*.ts/*.tsx`，漏掉了 `docs/`（运行手册）、`skills/`（skill 引用）、shell 脚本及 CLI 工具的直接调用。**A-1 tiktok-csi.mjs 误判即源于此**——它是 CLI 工具，被 `docs/research/tiktok-creator-tools.md` 作为标准操作指令调用，不是供 import 的库文件。
2. **未核实 git 追踪机制与 `.gitignore`**：v1 对 `routeTree.gen.ts` 作出"提交更新"建议前未执行 `git ls-files` / `git check-ignore`，未发现该文件已被 `.gitignore:16` 忽略且 commit `55f8cb7` 专门排除。
3. **未做建议的负荷验证**：v1 建议在 `knip.json` 全局开启 `exports`/`types` 时，未提前运行测试以评估报警规模。实测会爆出 **135 个 Unused exports + 13 个 Unused exported types = 148 项**，直接阻断 CI。

**v2 纠正**：所有"零引用"判定现在要求同时搜 `docs/` + `skills/` + 代码；所有涉及 git 操作的建议先验证追踪状态和 gitignore；所有配置变更建议先做负荷验证。

---

## 1. 风险评级标准

| 等级 | 含义 | 处置 |
|---|---|---|
| 🟢 零风险 | 已确认零引用（代码+文档+skills），删除不影响任何运行路径 | 可直接删 |
| 🟡 低风险 | 无代码引用，但被注释/文档/错误信息提到，或有历史参考价值 | 删前确认无归档需求 |
| 🟠 中风险 | 行为不变仅缩减 API 表面，但可能影响外部消费者或测试 | 删前跑测试 |
| 🔴 误判已撤回 | v1 判定有误，v2 撤回 | 不动 / 改为修配置 |
| 🔵 配置修复 | 不是删代码而是修配置 | 改配置即可 |

---

## 2. 分类汇总（v2 修订）

| 类别 | 条目数 | 风险 | 说明 |
|---|---|---|---|
| A. 确认的 dead code | 1 | 🟢 | v1 的 8 项中 7 项已撤回（见 §13），仅剩 A-2 |
| B. 历史冗余目录/文件 | 4 | 🟡 | B-2 已修正为"被研究文档引用" |
| C. 过度暴露的命名导出 | 26 | 🟠 | 去掉 `export` 即可，行为不变；A-2 去重移入 A 类 |
| D. ~~过期生成文件~~ | 0 | 🔴 | v1 的 D-1 已撤回（routeTree.gen.ts 是 .gitignore 产物） |
| E. knip 配置问题 | 2 | 🔵 | E-1 改为渐进式开启 |
| F. 本地未追踪磁盘冗余 | 多 | — | 不进仓库，仅占本地磁盘 |

---

## 3. A 类 — 确认的 dead code（🟢 零风险，可直接删）

### ~~A-1. `scripts/short-video/lib/tiktok-csi.mjs`~~（🔴 v2 撤回）

> **v1 误判**：判定为"零引用可直接删"。
>
> **实证事实**（核实成立）：
> - 该文件是**独立 CLI 工具**，含 `process.argv` 参数解析（支持 `--check`、`--content-gap`、`--recommended`、`--detail`），不是供 import 的库文件。
> - `docs/research/tiktok-creator-tools.md:311-320` 直接给出调用命令：
>   ```bash
>   node scripts/short-video/lib/tiktok-csi.mjs --check
>   node scripts/short-video/lib/tiktok-csi.mjs --content-gap [--limit 20]
>   node scripts/short-video/lib/tiktok-csi.mjs --recommended [--limit 20]
>   node scripts/short-video/lib/tiktok-csi.mjs --detail <topicId>
>   ```
> - `docs/analytics-workflow.md:47-48,84-87`（L1 现行生产指南第 ④c 步 "CSI Content Gap 对比"）直接要求执行该 CLI：
>   ```bash
>   node scripts/short-video/lib/tiktok-csi.mjs --content-gap --limit 20
>   node scripts/short-video/lib/tiktok-csi.mjs --recommended --limit 20
>   ```
> - `docs/archive/spec-tiktok-csi-integration.md`、`docs/archive/tickets-tiktok-csi-integration.md` 均将其作为核心产出。
>
> **knip 误报根因**：`knip.json` 的 `workspaces["."].entry` 只配置了 `scripts/short-video/*.mjs`，未包含 `scripts/short-video/lib/` 下的独立 CLI 入口。
>
> **v2 结论**：**绝不能删除**。应将该文件添加到 `knip.json` 的 entry（见 E-3）。

### A-2. `src/components/widgets/registry.ts` → `getWidget()` 函数

| 项 | 值 |
|---|---|
| git 追踪 | ✅ 已追踪 |
| knip 判定 | 未报（因 include 缺 exports） |
| 人工验证 | 全仓库仅有定义，无任何调用；路由使用 `WIDGETS` / `isRegisteredWidget` / `isBreakoutWidget` |
| 删除影响 | 无；删除函数定义即可，保留其余导出 |
| 文档引用 | 无（grep `getWidget` 在 docs/ skills/ 无命中） |

> **v2 去重说明**：v1 在 C-1 重复列了此项，v2 将其归入 A 类，C 类不再重复。

### ~~A-3 ~ A-8. 邮件模板冗余 default export~~（🟠 v2 降级为"保留现状"）

> **v1 建议**：删除 6 个邮件模板的 `export default`。
>
> **v2 考量**：这些文件由 Lovable / React Email 标准脚手架生成。在 React Email 生态中，`export default` 通常作为邮件预览开发服务（React Email dev preview）的标准挂载入口，而业务代码（如 `webhook.ts`、`preview.ts`）使用命名导入。删除 `export default` 仅节省 6 行代码，但在后续使用 React Email 工具链或 Lovable 模板同步时可能带来额外摩擦。
>
> **v2 结论**：属于极低收益的语法微优化，**保持现状更稳妥**。如确需清理，应在确认不再使用 React Email dev preview 后进行。

---

## 4. B 类 — 历史冗余目录/文件（🟡 低风险，删前确认归档需求）

### B-1. `.scratch/`（30 个被追踪文件）

| 项 | 值 |
|---|---|
| git 追踪 | ✅ 30 个文件 |
| 内容 | issue 草稿、工作笔记、子任务 issues 目录（如 `verify-retry-loop/issues/*.md`、`vlm-semantic-merge/issues/*.md`、`issue-cascade-audit.md` 等） |
| 代码引用 | 无（grep `.scratch` 在 src/scripts/skills/docs 中无命中，仅 experiments 的 site-packages 库源码含 "scratch" 字样，无关） |
| 归档价值 | 中 — 记录了历史 issue 的拆解过程，但 issue 本身已在 GitHub tracker 关闭 |

**完整文件清单**（供 review 者逐项判断是否保留）：
```
.scratch/code-review-doc-hierarchy.md
.scratch/issue-cascade-audit.md
.scratch/issue-scorecandidate.md
.scratch/media-patch-apply/issues/01-validation-conflict-detection.md
.scratch/media-patch-apply/issues/02-patch-application-atomic-write.md
.scratch/media-patch-apply/issues/03-receipt-dryrun-output.md
.scratch/pipeline-generalization/issues/01-verify-subject-visibility.md
.scratch/pipeline-generalization/issues/02-verify-goal-loopclose.md
.scratch/pipeline-generalization/issues/03-subtitle-coverage.md
.scratch/pipeline-generalization/issues/04-currency-autofix.md
.scratch/pipeline-generalization/issues/05-media-upscale.md
.scratch/pipeline-generalization/issues/06-layout-spacing.md
.scratch/pipeline-generalization/issues/07-asset-sourcer-integration.md
.scratch/research-evidence-pipeline/issues/01-schema-validators.md
.scratch/research-evidence-pipeline/issues/02-research-workspace.md
.scratch/research-evidence-pipeline/issues/03-brief-builder.md
.scratch/research-evidence-pipeline/issues/04-search-sources-scoped.md
.scratch/research-evidence-pipeline/issues/05-claim-evidence-auditor.md
.scratch/research-evidence-pipeline/issues/06-scene-data-claimids.md
.scratch/verify-retry-loop/issues/01-remotion-audio-fix.md
.scratch/verify-retry-loop/issues/02-failure-classifier.md
.scratch/verify-retry-loop/issues/03-audio-drift-compensation.md
.scratch/verify-retry-loop/issues/04-cue-gap-relaxation.md
.scratch/verify-retry-loop/issues/05-verify-retry-loop.md
.scratch/verify-retry-loop/issues/06-wire-into-main.md
.scratch/vlm-semantic-merge/issues/01-python-markdown-parser-analyze-semantics.md
.scratch/vlm-semantic-merge/issues/02-node-analyze-asset-semantics-gateway.md
.scratch/vlm-semantic-merge/issues/03-scorecandidate-rebalance-prefilter.md
.scratch/vlm-semantic-merge/issues/04-analyze-assets-rewrite-artifact.md
.scratch/vlm-semantic-merge/issues/05-vlm-validation-script.md
```

### B-2. `scripts/short-video/experiments/`（3 个被追踪文件 + 4.6GB 本地未追踪）— v2 修正

| 项 | 值 |
|---|---|
| git 追踪 | ✅ 3 个 `.py` 文件（76K） |
| 未追踪本地 | 4.6GB（venv、site-packages、实验输出）— 不进仓库，但占磁盘 |
| 被追踪文件 | `modal-echomimicv3-nf4.py`、`modal-infinitetalk.py`、`modal-longcat-avatar.py` |
| 代码 import | 无 |
| **文档引用** | **有**（v1 漏检）— `docs/research/digital-human-test-progress.md:544,659`、`docs/research/echomimicv3-optimization-options.md:398`、`docs/archive/handoffs/handoff-infinitetalk-*.md` 多处引用，作为数字人选型与调优的真实复现代码 |
| knip 状态 | 被 `knip.json` ignore |
| 归档价值 | 中 — 被研究文档引用，是实验复现的依据 |

**v2 建议**：**不要直接删**。若确需清理代码目录，应按 `docs/DOCS-INDEX.md` 的 L3 规范先归档或更新 `docs/research/` 和 `docs/archive/handoffs/` 中指向这些脚本的文档指针，避免留下悬空失效引用。4.6GB 未追踪 venv 可本地清理。

### B-3. `scripts/short-video/retired-html-path/`（7 个被追踪文件，72K）

| 项 | 值 |
|---|---|
| git 追踪 | ✅ 7 个文件 |
| 内容 | 冻结归档的退役 HTML/Playwright 渲染器（`base-styles.mjs`、`record-scenes.mjs` 等） |
| 代码 import | 无（无任何 `import ... from .../retired-html-path/`） |
| 注释/文档引用 | 有 — 多处注释 "see retired-html-path/README.md"，`renderer-guard.mjs` 错误信息提到该路径 |
| knip 状态 | 被 `knip.json` ignore |
| 归档价值 | 中 — 作为退役路径的参考实现，有注释指向它 |

**建议**：保留，或在确认无人再查阅后移除。删除时需同步清理指向它的注释（涉及 `verify-remotion-frames.mjs`、`README.md`、`audio-sync.test.mjs`、`renderer-guard.test.mjs`、`frame-analysis.mjs`、`renderer-guard.mjs`、`text-slots.mjs`、`safe-zones.mjs`、`media-bg.mjs`）。

### B-4. `scripts/short-video/.tmp-dump-cookies.mjs`

| 项 | 值 |
|---|---|
| git 追踪 | ❌ 未追踪（本地文件） |
| 代码引用 | 无（仅在 `knip.json` 的 ignore 列表中） |
| knip 提示 | "Remove from ignore"（ignore 项指向的文件不在追踪中） |
| 归档价值 | 无 — 临时 cookie dump 脚本 |

**建议**：本地删除 + 从 `knip.json` ignore 移除。

---

## 5. C 类 — 过度暴露的命名导出（🟠 中风险，去掉 `export` 即可）

这些符号有 `export` 关键字但全仓库无任何外部 `import`，仅在定义文件内部使用。去掉 `export` 不改变行为，仅缩减公共 API 表面。

> **v2 修订**：A-2 的 `getWidget` 已移入 A 类，此处不再重复。v1 的 C-1 条目撤回。

### C-3. 仅内部使用的导出（去掉 `export` 关键字）

| 文件 | 多余的导出符号 |
|---|---|
| `src/lib/article-og-image.ts` | `escapeSvg`, `wrapArticleTitle`, `formatArticleDate` |
| `src/lib/ask-retrieval.server.ts` | `extractTerms` |
| `src/lib/ask.server.ts` | `buildInput`, `HOURLY_LIMIT`, `DAILY_LIMIT` |
| `src/lib/error-capture.ts` | `describeError` |
| `src/lib/keyword-tracking.server.ts` | `loadAlertSettings`, `AlertSettings`(type), `DOMAIN`, `DEFAULT_DROP_THRESHOLD`, `DEFAULT_ALERT_ON_LOST_RANKING` |
| `src/lib/keyword-tracking.functions.ts` | `DROP_THRESHOLD` |
| `src/lib/semrush.server.ts` | `semrushGet`, `SemrushRow`(type) |
| `src/lib/structured-data.ts` | `ORG_ID`, `orgRef` |
| `src/lib/og.ts` | `OG_COMPARE` |
| `src/lib/posts.functions.ts` | `attachmentPublicUrl` |
| `src/lib/email-templates/registry.ts` | `TemplateData`(type) |
| `src/components/widgets/registry.ts` | `BREAKOUT_WIDGETS`, `WidgetComponent`(type) |
| `src/components/widgets/distillation/data/moonshot-funding.ts` | `FundingStatus`(type) |
| `src/components/widgets/deepseek/data/pricing.ts` | `PricingModel`(interface) |
| `src/components/widgets/deepseek/data/companies.ts` | `Quote`(interface) |

**风险**：🟠 — 若有外部包通过 deep import 消费这些符号（非推荐用法但可能存在），去掉 export 会破坏。建议删前跑一次 `bun test` 和 `vite build` 确认。

### C-4. 不建议改动（自动生成代码）

`src/integrations/supabase/types.ts` 顶部注释为自动生成。以下聚合类型导出未被消费，但属于 Supabase 生成器标准公共 API，删除会在下次生成时复现：

- `Tables`, `TablesInsert`, `TablesUpdate` (type)
- `CompositeTypes`, `Enums`, `Constants` (type)
- `Json` (type)

**建议**：不动。

---

## 6. ~~D 类 — 过期生成文件~~（🔴 v2 整类撤回）

### ~~D-1. `src/routeTree.gen.ts`~~

> **v1 误判**：建议"跑路由生成命令，提交更新后的 routeTree.gen.ts"。
>
> **实证事实**（核实成立）：
> - `git ls-files src/routeTree.gen.ts` 返回空 — **未被 git 追踪**。
> - `git check-ignore -v` 确认 `.gitignore:16` 已明确忽略该文件。
> - commit `55f8cb7`（`chore: gitignore routeTree.gen.ts — TanStack auto-generated build artifact`）专门提交了忽略规则。
>
> **v2 结论**：该文件是本地构建产物，**不应提交到 git**。v1"提交更新"的建议错误。本地若有过期版本，跑 `vite dev` 会自动重新生成，无需人工干预。

---

## 7. E 类 — knip 配置问题（🔵 配置修复）

### E-1. `knip.json` include 缺 `exports` / `types` — v2 改为渐进式

当前：
```json
"include": ["files", "dependencies", "devDependencies", "unlisted", "binaries", "unresolved"]
```

**v1 建议**：全局加 `exports`/`types`。
**v2 负荷验证**：实测 `npx knip --include exports,types` 爆出 **135 个 Unused exports + 13 个 Unused exported types = 148 项**，绝大多数在 `scripts/short-video/lib/` 下。若贸然全局打开，`npm run check:dead` 会直接阻断 CI 流水线。

**v2 建议**：**渐进式开启**，避免波及脚本工具库：
- 方案 A：按 workspace 分别配置 include，只在 `src/` 前端 workspace 开 `exports`/`types`，脚本 workspace 不开。
- 方案 B：全局开 `exports`/`types`，但用 `ignore` 暂时排除 `scripts/short-video/lib/**`，待逐步清理后再移除 ignore。
- 无论哪种方案，开启后应先在本地跑 `npx knip` 确认 0 报警再合入 CI。

### E-2. knip 自身提示的 stale ignore 项

knip 运行时输出 6 条 Configuration hints：

| ignore 项 | knip 建议 | 说明 |
|---|---|---|
| `scripts/short-video/experiments/**` | Remove from ignore | 该目录下被追踪文件仅 3 个 .py，knip 可正常分析 |
| `scripts/short-video/.tmp-dump-cookies.mjs` | Remove from ignore | 文件未追踪，ignore 无意义 |
| `@lovable.dev/vite-tanstack-config` | Remove from ignoreDependencies | 依赖已用上 |
| `nitro` | Remove from ignoreDependencies | 同上 |
| `jscpd` | Remove from ignoreDependencies | 同上 |
| `.css` | Compiled extension excluded by project | knip 提示，非错误 |

**建议**：逐条确认后清理。前两项与 B-2/B-4 关联。

### E-3. knip entry 缺失 CLI 入口（v2 新增）

`knip.json` 的 `workspaces["."].entry` 配置了 `scripts/short-video/*.mjs`，但未包含 `scripts/short-video/lib/` 下的独立 CLI 工具入口（如 `tiktok-csi.mjs`）。这导致 knip 将 CLI 工具误报为 unused file。

**v2 建议**：在 entryGlob 中补充已知 CLI 入口。**v3 精确化**（避免大通配符豁免整个 lib 目录）：

`scripts/short-video/lib/` 包含数十个内部库模块（如 `video-downloaders.mjs`、`asset-sourcer.mjs` 等）。若直接将整个 `scripts/short-video/lib/*.mjs` 加入 entry，所有内部库模块都将被豁免死代码检测，未来若内部模块废弃，knip 将永久失效。

**v3 建议**：在 `knip.json` 的 `workspaces["."].entry` 数组中**精确添加单点 CLI 文件**：

```json
"entry": [
  ...
  "scripts/short-video/lib/tiktok-csi.mjs",
  ...
]
```

或者未来将此类具有 CLI 入口性质的脚本移至 `scripts/short-video/` 一级目录下。

---

## 8. F 类 — 本地未追踪磁盘冗余（不进仓库，仅占本地磁盘）

以下目录/文件未被 git 追踪，不影响仓库，但占用本地磁盘。列出供本地清理参考，**不在本次 review 删除范围**。

| 路径 | 说明 |
|---|---|
| `output/` | 历史渲染输出（leaptalk-v5~v7、pipeline 日志等） |
| `.output/` | Nitro 构建输出 |
| `2026-08-15-f4af3899/` | 日期命名的临时目录 |
| `test-results/` | vitest 基线快照 |
| `.playwright-cli/` | Playwright CLI 历史日志（console/page yml） |
| `scripts/short-video/experiments/` 的 4.6GB | venv + site-packages + 实验输出 |
| `.v2c/` `.video_agent/` `.workbuddy/` `.atomcode/` `.codebuddy/` `.joycode/` `.cursor/` `.claude/` `.agents/` `.arts/` `.codeartsdoer/` `.session-pilot/` `.tanstack/` `.wrangler/` `agent/` | 各 agent/工具的本地工作目录 |

**建议**：确认无本地需要后清理；或加入 `.gitignore` 显式忽略（部分可能已在 `.gitignore` 中）。

---

## 9. 给 review 者的逐项确认 checklist（v2 修订）

review 者请逐条确认后签字。每条均可独立复现（见 §0 方法论）。

### A 类（可直接删）

- [x] ~~A-1 `tiktok-csi.mjs`~~ — 🔴 v2 撤回，不删
- [x] A-2 `registry.ts` 的 `getWidget()` — 确认无调用且无文档引用 → 已删（2026-09-20）
- [x] ~~A-3~A-8 邮件模板 default export~~ — 🟠 v2 降级，保留现状

### B 类（删前确认归档）

- [x] B-1 `.scratch/` 30 个文件 — 确认 issue 已在 tracker 关闭且无需本地留档 → 已删目录（2026-09-20）
- [x] B-2 `experiments/` 3 个 .py — 已先更新 `docs/research/` 与 `docs/archive/handoffs/` 引用指针（标注 2026-09-20 删除）后删；本地 4.6GB venv 保留（用户决定）
- [x] B-3 `retired-html-path/` 7 个文件 — 已删目录 + 清理指向注释/错误信息/配置（12 处代码、4 处配置、7 处活跃文档，归档文档保留历史原文）（2026-09-20）
- [x] B-4 `.tmp-dump-cookies.mjs` — 已删本地文件 + 从 knip.json ignore 移除（2026-09-20）

### C 类（去掉 export，跑测试确认）

- [x] C-3 表中 15 个文件、26 个符号 — 已逐文件去掉 `export`，`vitest run src/ scripts/` 3988 测试通过（2026-09-20）
- [x] C-4 Supabase 生成类型 — 确认不动

### D 类

- [x] ~~D-1 routeTree.gen.ts~~ — 🔴 v2 撤回，不提交（.gitignore 产物）

### E 类（修配置）

- [ ] E-1 `knip.json` include 渐进式加 `exports`/`types`（按 workspace 或加 ignore 排除脚本库）→ 本地确认 0 报警后再入 CI（**未执行**，留待后续）
- [x] E-2 清理 knip 提示的 stale ignore 项 — `.tmp-dump-cookies.mjs`、`retired-html-path/**` 已移除；`experiments/**` 因本地 venv 保留暂不动；3 条 ignoreDependencies 与 `.css` hint 属 knip 正常提示，保留（2026-09-20）
- [x] E-3 knip entry 精确添加 `scripts/short-video/lib/tiktok-csi.mjs`（单点，不用 `lib/*.mjs` 通配符）→ `npx knip` Unused files 报警消失（2026-09-20）

### F 类（本地清理，可选）

- [x] 用户确认：各 agent/编程工具工作目录（`.claude/`、`.codebuddy/` 等）**均在用，保留不删**；构建产物类（`output/`、`.output/`、`test-results/`、`.playwright-cli/`）可日后按需手动清理，不入仓库（2026-09-20）

> **执行记录（2026-09-20）**：上述已勾选项由 Droid session `20260920-deadcode-cleanup-9f3e2a` 按 §10 顺序实施，6 个原子提交；验证证据：`npx knip` 零报警 + `npx vitest run src/ scripts/` 3988 passed。E-1 未执行，见 checklist。

---

## 10. 建议执行顺序（v3 修订）

1. **E-3**（精确添加 `scripts/short-video/lib/tiktok-csi.mjs` 到 knip entry，单点不用通配符）→ 消除 tiktok-csi.mjs 误报
2. **A-2**（删 `getWidget`，零风险）→ 直接删
3. **E-1**（渐进式开 exports/types）→ 本地确认 0 报警后入 CI
4. **C-3**（去掉 26 个符号的 `export`）→ 跑 `bun test` + `vite build` 确认后提交
5. **B 类**（4 项，逐项确认归档需求后删；B-2 需先更新文档指针）
6. **E-2**（清理 knip stale ignore）
7. **F 类**（本地清理，可选）

每步建议独立提交，便于回滚。

---

## 11. 审计边界与未覆盖项

本审计**未覆盖**以下范围（如需可补查）：

- `docs/` 下的历史文档冗余（文档不进 knip，需人工判断时效性）
- `supabase/migrations/` 中被后续 migration 取代的旧 migration（Supabase migration 不应删除，保留历史链）
- `skills/` 下 18 个被追踪文件中是否有失效 skill（需结合 `docs/installed-skills.md` 判断）
- `public/` 下的历史静态资源
- 动态 `import()` 的字符串拼接路径（knip 和 grep 均可能漏检，需人工确认）
- **CLI 工具脚本的命令行调用关系**（v1 漏检，v2 已对 `scripts/short-video/lib/*.mjs` 补查 docs/ 引用，但其他 CLI 入口未全面排查）

---

## 12. 签字栏

| 角色 | 确认 | 日期 |
|---|---|---|
| 审计者 | CodeArts (GLM-5.2) | 2026-09-20 |
| Review 者（v1） | 第三方 | 2026-09-20 |
| v1 Review 结论 | 3 处严重误判 + 2 处次优，已采纳修订为 v2 | 2026-09-20 |
| Review 者（v2） | 第三方 | 2026-09-20 |
| v2 Review 结论 | **Approved with minor suggestions**，采纳 3 点微调修订为 v3 | 2026-09-20 |
| v3 Review 者 | 第三方 | 2026-09-20 |
| v3 Review 结论 | **正式通过（Approved）**，3 点微调全部闭环，逻辑自洽 | 2026-09-20 |
| 批准删除 | ________ | ________ |

---

## 13. 修订记录

### v1 → v2（2026-09-20，基于第三方 review）

| # | v1 判定 | 问题 | v2 纠正 |
|---|---|---|---|
| 1 | A-1 `tiktok-csi.mjs` 🟢可直接删 | 严重误判：是 CLI 工具，被 `docs/research/tiktok-creator-tools.md` 调用 | 🔴 撤回，不删；改为 E-3 补 knip entry |
| 2 | D-1 提交更新 `routeTree.gen.ts` | 严重误判：文件未被 git 追踪，`.gitignore:16` 已忽略 | 🔴 撤回，不提交 |
| 3 | E-1 全局开 `exports`/`types` | 配置破坏风险：实测爆 148 项报警，阻断 CI | 🔵 改为渐进式（按 workspace 或加 ignore 排除脚本库） |
| 4 | A-3~A-8 删邮件模板 default export | 次优：React Email 生态用 default 作预览入口 | 🟠 降级为保留现状 |
| 5 | B-2 experiments "零引用" | 次优：3 个 .py 被研究文档引用 | 🟡 修正为"删前需更新文档指针" |
| 6 | A-2 与 C-1 重复分类 | 口径重复 | A-2 归 A 类，C-1 撤回 |

**方法论改进**（已写入 §0）：所有"零引用"判定现在要求同时搜 `docs/` + `skills/` + 代码；所有涉及 git 操作的建议先验证追踪状态和 gitignore；所有配置变更建议先做负荷验证。
### v2 → v3（2026-09-20，基于第三方 v2 复核 Approved with minor suggestions）

| # | v2 现状 | 微调建议 | v3 落实 |
|---|---|---|---|
| 1 | E-3 建议 `scripts/short-video/lib/*.mjs` 通配符 | 大通配符会豁免整个 lib 目录的 dead code 检测 | 改为精确单点 `scripts/short-video/lib/tiktok-csi.mjs` |
| 2 | A-1 撤回理由仅引 `docs/research/tiktok-creator-tools.md` | 补 L1 生产指南 `docs/analytics-workflow.md` 第 ④c 步 | 已补充 `:47-48,84-87` 的直接调用命令 |
| 3 | C-3 符号数写"~29" | 实际 26 个（逐行核实） | §2 汇总 + §9 checklist 均改为"26" |

**v3 状态**：已采纳全部 3 点微调，文档达可批准执行标准。

### 执行记录（2026-09-20，v3 批准后实施）

v3 批准后由 Droid session `20260920-deadcode-cleanup-9f3e2a` 按 §10 顺序实施：

| 步骤 | 结果 | 提交 |
|---|---|---|
| E-3 | ✅ knip entry 已加，Unused files 报警消失 | `chore(knip)` |
| A-2 | ✅ `getWidget()` 已删 | `refactor(src)` |
| E-1 | ⏸ 未执行（渐进式开 exports/types 留待后续） | — |
| C-3 | ✅ 26 符号去 export，vitest 3988 passed | `refactor(src)` |
| B-1~B-4 | ✅ 全部执行（B-2 先更新文档指针；B-3 清理 12 处代码 + 4 处配置 + 7 处活跃文档引用） | `chore(scratch)` / `chore(experiments)` / `chore(render)` |
| E-2 | ✅ 部分清理（`experiments/**` ignore 因本地 venv 保留暂不动） | `chore(knip)` / `chore(render)` |
| F 类 | ✅ 用户确认 agent/编程工具目录在用，保留 | — |

验证证据：`npx knip` 零报警（仅剩 Configuration hints）+ `npx vitest run src/ scripts/` 3988 passed / 205 files。B-4 `.tmp-dump-cookies.mjs` 与 `retired-html-path/**` 的 stale ignore 已随对应提交移除。
