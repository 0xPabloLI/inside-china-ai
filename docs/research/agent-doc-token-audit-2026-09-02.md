# Agent-reached 文档 token 审计报告（2026-09-02）

> 审计阶段零改动（S0/R0）。本报告是审计产出；任何缩减需用户批准后按 S1/S2 × R2 另行实施。
> 评判标准：`writing-for-agents`——逐句找 sediment、no-ops、duplication、该下沉未下沉的 reference。

## 1. 方法与范围

- 对象：handoff 基线表 9 份文档 + 仓库外 installed skills 目录。
- 逐句检查四类问题；每条发现记录行区、类型、预估节省、行为风险。
- 节省按 UTF-8 字节估；文档字节数与 token 比约 4:1（英文）/ 2:1（中文），表中仅给字节。

## 2. 实测基线（2026-09-02）

| 文档                                     | 实测字节    | 加载层级 | 预估可省           | 主要问题类型                                                       |
| ---------------------------------------- | ----------- | -------- | ------------------ | ------------------------------------------------------------------ |
| `AGENTS.md`                              | 6,536       | 常驻注入 | ~400               | pointer 措辞、duplication                                          |
| `DESIGN.md`                              | 17,411      | 常驻注入 | ~2,800             | sediment、duplication（×3 处同义）                                 |
| `CONTEXT.md`                             | 16,272      | 指针     | ~900               | sediment（实现历史）、与 video-workflow 重叠                       |
| `docs/DOCS-INDEX.md`                     | 19,034      | 指针     | （索引本体，不动） | —                                                                  |
| `docs/agents/implementation-workflow.md` | 11,723      | 指针     | ~0（轻触通过）     | 无显著问题                                                         |
| `docs/agents/git-workflow.md`            | 3,583       | 指针     | ~0（轻触通过）     | 无显著问题                                                         |
| `docs/tanstack-lovable-conventions.md`   | 7,138       | 指针     | ~200               | 与 AGENTS.md 的身份行重复                                          |
| `docs/installed-skills.md`               | 7,807       | 指针     | ~400               | 与 skill description 两处维护                                      |
| `docs/content-pipeline.md`               | 34,630      | 指针     | ~3,400             | duplication（三入口写两遍、入口 3 重号）、机器已强制清单的文档副本 |
| `docs/video-workflow.md`                 | 38,554      | 指针     | ~4,300             | 该下沉未下沉（Cloud GPU 章）、环境缓存、尾部索引重复               |
| **合计**                                 | **162,688** |          | **~12,400**        |                                                                    |

与 handoff 基线的偏差：`DOCS-INDEX.md` 18,679→18,813→19,034（审计复核时实测，仍在漂移）、`video-workflow.md` 38,537→38,554，为交接后并行 session 的自然漂移，不影响结论。

## 3. 分文档发现

### 3.1 DESIGN.md（常驻，最大收益项之一）

frontmatter（L1–95，机器消费的 design tokens，Lovable 同步）按结构保留，不动。body 发现：

| #   | 行区                                 | 类型                | 发现                                                                                                                                                                                                           | 节省   | 风险                                       |
| --- | ------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------ |
| D1  | L148,150,181,192,204,214,220,260,262 | sediment            | 变更历史从句（"was 0.22/ΔL 0.04…"、"previous note said…"、"applied/audited 2026-08-08"）。旧值只属于当时的审计对话；保留一句原因（"raised after audit found cards blended into bg"），删数值对比               | ~700   | 低                                         |
| D2  | L109–115                             | duplication         | "Key Characteristics" 逐条复述 §2–§4 的规则（cool off-white、65ch、≤10%、flat elevation 各在后文有 Rule 原句）；cream/sand 拒绝全文出现 3 次（L105、L159、L256）。压缩为无解释的索引行或删除，由各节 Rule 承担 | ~800   | 低–中（Lovable 若依赖摘要，语义仍在 body） |
| D3  | L241–265                             | duplication / no-op | §6 Do/Don't 中 ≥5 条是 §2–§4 Rule 原句复写（hue 260、Dispatch Blue ≤10%、serif-only、shadow、cream）。改为指向规则名的一行引用；保留 checklist 用途                                                            | ~1,200 | 低                                         |
| D4  | L153–155                             | 环境缓存            | Dark mode overrides 指向 `src/styles.css` 实现——环境已承载，只留 gotcha（blockquote 是 content 非 metadata；行高 1.75→1.85）                                                                                   | ~150   | 低                                         |

### 3.2 AGENTS.md（常驻，刚重构——轻触）

| #   | 行区             | 类型         | 发现                                                                                                                                                                | 节省 | 风险 |
| --- | ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- |
| A1  | Router #3（L27） | pointer 措辞 | 尾句 "It classifies work by… through the Skill tool." 是 implementation-workflow 的 identity 描述（cut identity the body already carries）。指针只留触发条件 + 目标 | ~200 | 低   |
| A2  | L51 与 L62       | duplication  | `video-workflow.md` 在 Engineering References 与 Content and Video 两节各有一条指针；合并到一处                                                                     | ~150 | 低   |
| A3  | L80              | no-op 候选   | "Prefer evidence … over speculation" 接近模型默认；若保留，属护栏强化，可接受                                                                                       | ~80  | 低   |

刚重构后残留 no-ops 未发现；主要剩余量在 pointer 措辞。**不建议大动**。

### 3.3 CONTEXT.md（domain 词表，术语完整性优先）

| #   | 行区                           | 类型        | 发现                                                                                                                                                                 | 节省 | 风险 |
| --- | ------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- |
| C1  | L73（Capabilities）            | sediment    | "This replaces the previous pattern where asset-sourcer.mjs maintained separate API_SOURCES/…" 是实现史，属决策记录（ADR 位），非术语语义。保留 shape + 消费方式即可 | ~300 | 低   |
| C2  | L121（Playwright Recording）   | sediment    | retired 词条压缩为一行（renderer-guard 会 fail-fast 退役路径，防混淆价值仅在于词→"已退役"映射）                                                                      | ~150 | 低   |
| C3  | L110（Protected Region）       | sediment    | "Phase 2 will feed these to Remotion" 是未发生的 roadmap                                                                                                             | ~100 | 低   |
| C4  | L84 vs video-workflow L105–128 | duplication | `Max Effort` 参数在词表与执行文档两处维护；词表留定义+指向，参数住 video-workflow。`Reference Voice`（L81）同理留定义，路径细节住 video-workflow                     | ~350 | 低   |

### 3.4 高频 L1：git-workflow / implementation-workflow（刚双轴 review——轻触通过）

- `git-workflow.md`：67 行全为行为规则，无 no-op、无 duplication。**通过**。
- `implementation-workflow.md`：§4 高风险路径速查（L89–95）是环境缓存，但属"lookup 昂贵 + 高频"场景，且有 stale 风险标注价值，**保留**；§9 收尾与 git-workflow §8 的 push 授权重复属安全边界双处强化，**保留**。**通过，建议零改动**。

### 3.5 tanstack-lovable-conventions.md（轻触）

| #   | 行区                | 类型        | 发现                                                                            | 节省 | 风险 |
| --- | ------------------- | ----------- | ------------------------------------------------------------------------------- | ---- | ---- |
| T1  | L5–9（§1 项目身份） | duplication | 与 AGENTS.md Project 节逐字重叠（App 名/定位/栈）。指针到达文档保留一行身份即可 | ~200 | 低   |

其余（gotcha 类如 "GitHub 同步 ≠ 部署"、React Query 初始化陷阱、§13 checklist）密度高，保留。

### 3.6 installed-skills.md

| #   | 行区   | 类型        | 发现                                                                                                                                                                                                                      | 节省 | 风险 |
| --- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- |
| S1  | L46–88 | duplication | 34 个 Matt skill 的 Purpose 与各 skill 自带 description 两处维护；Experimental 组（teach、writing-beats、writing-fragments、writing-shape、loop-me、wait-what、to-questionnaire、setup-ts-deep-modules 等）合并为一句汇总 | ~400 | 低   |

### 3.7 content-pipeline.md（大件，仅内容 session 加载）

| #   | 行区                       | 类型              | 发现                                                                                                                                                                                                                                                                         | 节省   | 风险                                        |
| --- | -------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------- |
| P1  | L8–14 vs L105–137          | duplication       | 管线概览与"如何启动"两处描述三入口；且"入口 3"重号（L121 无输入 vs L135 新 session）——既是重复也是编号 bug                                                                                                                                                                   | ~600   | 低                                          |
| P2  | L307–337（MRL-2 表）       | 该下沉/no-op 候选 | B1–B13 与 W1–W9 逐条列出，但多数已由 `scene-rules.mjs` + `verify-video.mjs --pre` 机器强制（B12 明说 dispatch 表，W6–W9 明说 checkLoopClose 等实现）。机器已强制的清单写第二遍是 cache；保留 Agent 判断项（B6 数据一致性、B8 AI 词汇）+ 指向脚本。**实施前需核对脚本覆盖面** | ~1,800 | 中（若部分 W 项脚本未实现，删表会丢检查点） |
| P3  | L36–51、L213–234、L268–272 | duplication       | `scripts/rag/query.mjs` 命令示例 3 处；触发点留一行，参考归 §2e 一处                                                                                                                                                                                                         | ~400   | 低                                          |
| P4  | L275 vs L291–301           | duplication       | AI Outline：Step 5 步骤与"细则"块重叠（≤30 词、含公司名+数字、降级路径各写两遍）                                                                                                                                                                                             | ~200   | 低                                          |
| P5  | L390–418 vs L457–478       | duplication       | HITL 步骤、检查点总结表、Agent 行为准则三处维护同一语义；准则表压缩                                                                                                                                                                                                          | ~400   | 低                                          |
| P6  | L9                         | 格式 bug          | 概览 ASCII 图内嵌字面 `\n`，应为真实换行                                                                                                                                                                                                                                     | 0      | 0                                           |

### 3.8 video-workflow.md（大件，最大单项收益）

| #   | 行区                          | 类型                      | 发现                                                                                                                                                                                          | 节省   | 风险                                                   |
| --- | ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| V1  | L74–86                        | 该下沉未下沉              | "Cloud GPU Batch-Running" 是 Modal/Kaggle/Colab 通用经验，非本管线执行规则，只在数字人实验 session 相关；`docs/research/cloud-gpu-options.md` 已存在（DOCS-INDEX 登记）。整章迁入，留一行指针 | ~2,200 | 低（内容迁移非删除；实施时先核对该文件是否已含同主题） |
| V2  | L330–391（File Locations 树） | 环境缓存                  | 目录树可由 `ls` 即得；保留 gotcha 行（ffmpeg-full 含 libass、render-only 快速迭代、retired-html-path 冻结、audio/ 诊断模块），删纯描述行（`deepseek/ # DeepSeek story` 类）                   | ~800   | 低                                                     |
| V3  | L105–141                      | duplication               | F5 max-effort 参数（steps=32/cfg_strength=3.0）在引擎表、详情段、CONTEXT.md 三处出现；表格为准，详情段删参数句                                                                                | ~300   | 低                                                     |
| V4  | L143–166                      | duplication               | Prosody 表：F5 已 DISABLED + 原因说明，但每行参数仍展示；压缩为 Qwen-only 一句 + 指向 research                                                                                                | ~200   | 低                                                     |
| V5  | L300–306 vs L486–500          | duplication               | 正文尾部四条内嵌引用与 "Design Decisions & References" 表重复；保留尾部表，删正文重复引用                                                                                                     | ~400   | 低                                                     |
| V6  | L355,387,445 等               | sediment（negation 残留） | "replaces the retired HTML DOM verifier"、"HTML/Playwright path retired 2026-09-01" 等装饰性退役提及；保留 renderer-guard 的 fail-fast 行为说明，删其余                                       | ~150   | 低                                                     |

## 4. Skill 目录统计（仓库外常驻）

实测（2026-09-02）：

| 目录                    | 数量                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `.agents/skills/`       | 174                                                                                                                       |
| `.claude/skills/`       | 173                                                                                                                       |
| SKILL.md 含 description | 173，共 **39,810 字节**（均值 230、最大 895；复核实测单行口径 36,607B、多行 YAML 口径约 38,229B，原值口径略宽，量级一致） |

≈10k tokens：若 harness 全量注入（Claude Code 路径），这是最大的仓库外常驻项——比本表任何单份文档都大。当前 CodeArts harness 实测注入约 38 个（系统 + 项目引用链），非全量；注入策略属 harness 行为，仓库侧可控的是**安装面**。

卸载候选（交用户裁决，本审计不执行）：

| 组             | Skills                                                                                                                                                                                                         | 依据                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| HarmonyOS      | `hmos-dev-pipeline`                                                                                                                                                                                            | 项目为 React/TanStack，无 ArkTS                     |
| SDD 三件套     | `creating-sdd-directory`、`managing-spec-document`、`managing-design-document`、`managing-tasks-document`                                                                                                      | 与 Matt `to-spec`/`to-tickets`/`implement` 职能重叠 |
| bug-fix 工作流 | `issue-analysis`、`issue-reproduction`、`static-root-cause-localization`、`dynamic-root-cause-localization`、`patch-generation`、`codebase-structure`、`fix-build-command`                                     | 与 Matt `diagnosing-bugs` 重叠；若不用该工作流可卸  |
| 文档生成       | `prd`、`doc-expert`                                                                                                                                                                                            | 与 `to-spec` 重叠                                   |
| Matt 实验组    | `teach`、`writing-beats`、`writing-fragments`、`writing-shape`、`loop-me`、`wait-what`、`to-questionnaire`、`setup-ts-deep-modules`、`setup-pre-commit`、`migrate-to-shoehorn`、`wizard`、`scaffold-exercises` | 上游标记 Experimental，无项目引用                   |

保留核心（有明确触发链）：`short-video-pipeline`、`brand-system`、`web-access`、`web-deep-research`、`last30days`、`writing-for-agents`、`impeccable`、`frontend-design`、`remotion-*`、`tdd`、`code-review`、`grill-with-docs`、`to-spec`、`to-tickets`、`implement`、`ask-matt`。

## 5. 实施建议（供批准）

按收益/风险比排序：

1. **video-workflow.md**：V1 下沉 + V2/V5 削减（~3,600B，低风险）。
2. **DESIGN.md**：D1+D3（~1,900B，低风险；D2 涉及 Lovable 消费，先核对）。
3. **content-pipeline.md**：P1（含入口 3 重号修复）+ P3/P4/P5（~1,600B，低风险）；P2 先核对 scene-rules 覆盖面再动。
4. **CONTEXT.md**：C1–C4（~900B，低风险）。
5. **AGENTS.md / tanstack-lovable-conventions / installed-skills**：轻触（~750B）。
6. **Skill 卸载**：用户按 §4 裁决后执行 `docs/installed-skills.md` Update Protocol。

合计预估 ~12,400B（约 7.6%），另加 skill 卸载的常驻收益（候选组合计约占 39.8KB description 的一半以上）。

排序说明：正确性 bug 修复（P1 入口 3 重号、P6 ASCII 图内嵌 `\n`）不受收益排序约束，可随任何批次先行处理。

约束提醒：实施需先载入 `writing-for-agents`；`main` ahead 18/behind 21 不 push；staging 用显式路径并 `git rev-parse HEAD` 核对基线。
