# Spec: Model Sources Reference Remediation

> **来源**：`docs/research/model-sources-reference-review.md`（Manus AI 审阅报告，2026-08-26）
>
> **目标**：修复 10 个审阅发现（4 阻塞 + 3 重要 + 3 改进），使 `model-sources-reference.md` 达到可执行性、内部一致性、引用目标完整性。

---

## Scope

**修改文件**：

1. `docs/research/model-sources-reference.md` — 原位修复
2. `docs/research/model-sources-reference-review.md` → 归档到 `docs/archive/reviews/`
3. `docs/DOCS-INDEX.md` — 更新归档状态

**不修改**：

- `AGENTS.md` — 引用行不改变（章节标题不变）
- `handoff-vlm-model-sources-2026-08-26.md` — 已归档，不再维护
- `vlm-model-selection-benchmark.md` — 独立文档，不在本次范围

---

## Modified Files Impact

| 文件                                              | 修改内容                                                               | 风险等级 | 评估                                                                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/research/model-sources-reference.md`        | 修复 10 个审阅发现：删除失效来源、修复门槛矛盾、改进格式表、增强证据链 | Medium   | 被 AGENTS.md L159 引用 → 模型选择通用标准章节标题不变，引用不破坏。被 handoff-vlm-model-sources 引用 §1.8/§2/§4 → 章节编号不变。修改是内容修复，不改变信息结构 |
| `docs/research/model-sources-reference-review.md` | 移动到 `docs/archive/reviews/`                                         | Low      | 审阅报告是 ephemeral 文档，归档是标准流程                                                                                                                      |
| `docs/DOCS-INDEX.md`                              | 更新 review 行为归档状态                                               | Low      | 仅状态标记更新                                                                                                                                                 |

---

## Behavioral Scenarios

| #   | Scenario                              | Expected behavior                                                                  | Risk                         | Mitigation                                     |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| S1  | Agent 按文档搜 PapersWithCode         | 不再有 PapersWithCode 搜索入口，改为 arXiv/HF Papers → GitHub/HF/ModelScope 查实现 | Medium — 改变搜索流程 Step 5 | Step 5 同步更新为 arXiv 发现流程               |
| S2  | Agent 查 HF Open LLM Leaderboard 排名 | 标为历史归档来源，改用 HF Eval Results / 任务社区榜单                              | Low — 替换信源               | §1.8 优先级表更新条目                          |
| S3  | Agent 遇到 CUDA-only 模型             | 统一状态机：可验证/需缓解/不适用，不再有"进入风险评估"和"淘汰"矛盾                 | High — 改变准入逻辑          | 硬性门槛段重写，删除"淘汰"措辞，统一为"不适用" |
| S4  | Agent 评估 NC 许可证模型              | 标为"需法务确认"，删除推测性段落（被发现概率/赔偿金额）                            | Medium — 删除有用参考信息    | 保留风险评估维度框架，删除确定性结论           |
| S5  | Agent 查模型格式表                    | 格式/量化方法/运行时清晰区分                                                       | Low — 加列区分               | 同一表格增加"类别"列                           |
| S6  | Agent 用 GitHub API 搜索              | 有完成条件：记录查询/日期/total_count/incomplete_results                           | Low — 纯追加                 | Step 1 后追加完成条件                          |
| S7  | Agent 查 Ollama 分类                  | 四分类清晰（模型目录/权重仓库/评测结果/运行时），无固定内存数                      | Low — 重写分类段             | 删除 ~16MB 常驻内存断言                        |
| S8  | Agent 查来源元数据                    | 每个来源有最小元数据（类型/用途/验证日期）                                         | Low — 纯追加                 | 为 API 端点增加元数据，网页入口保持简洁        |
| S9  | Agent 到 Step 6 推荐方案              | 先有候选证据卡，再进入评分                                                         | Low — 新增 Step 6a           | 在 Step 6 和评分之间插入证据卡要求             |
| S10 | Agent 查 Step 7 教训引用              | memory 指针替换为仓库内路径                                                        | Low — 替换引用               | 指向 `vlm-model-selection-benchmark.md` §4     |
| S11 | AGENTS.md L159 引用文档               | 章节标题"模型选择通用标准"不变                                                     | Low — 不改变标题             | 验证 grep AGENTS.md 引用                       |
| S12 | 归档后 DOCS-INDEX 指向正确            | review 行标记为归档                                                                | Low — 状态标记               | 更新 DOCS-INDEX                                |

---

## Implementation Notes

### 不做的事（审阅建议但选择不采纳或调整）

1. **MSR-05 三张表**：不拆为三张表（会膨胀），改为同一表格增加"类别"列区分权重容器/量化方法。
2. **MSR-08 完整元数据**：不为每个来源增加 6 字段元数据（文档过长），只对 API 端点增加官方文档链接和验证日期。
3. **MSR-04 完全删除 NC 风险评估**：保留风险评估维度框架（发现渠道、风险类型、缓解措施），但改为"需法务确认"状态，删除确定性结论（"属于 commercial use"、"权利人可监控下载列表"等）。
4. **审阅建议的四阶段结构**（发现/证实/本机验证/决策）：不新增四阶段顶层结构（过度重构），而是在现有 §4 搜索流程模板中嵌入证据卡和完成条件。

### 做的事

按审阅报告 10 个发现逐条修复，加上归档和索引更新。

---

## Acceptance Criteria

- [ ] PapersWithCode 入口删除，替换为 arXiv/HF Papers 发现流程
- [ ] HF Open LLM Leaderboard 标为归档，替换为 Eval Results
- [ ] 硬性门槛矛盾修复（统一状态机）
- [ ] NC 许可证段改为"需法务确认"
- [ ] 格式表增加类别列
- [ ] GitHub 搜索新增完成条件
- [ ] Ollama 分类重写，删除固定内存数
- [ ] 来源增加最小元数据（API 端点）
- [ ] 新增 Step 6a 候选证据卡
- [ ] memory 指针替换为仓库内路径
- [ ] AGENTS.md 引用不破坏（grep 验证）
- [ ] DOCS-INDEX 更新
- [ ] review 文件归档
- [ ] lint + build + tsc 通过
