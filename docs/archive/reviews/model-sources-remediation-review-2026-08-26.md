# Code Review: Model Sources Reference Remediation

> **审查日期**：2026-08-26
>
> **审查范围**：`docs/research/model-sources-reference.md` 的 10 个审阅修复

## Standards

**检查结果**：通过

1. **writing-for-agents 强制加载判定**：本次修改不改变 Agent 信息结构（不新增/删除/合并章节，不改规则层级），是事实值修复，不需要加载 ✅
2. **L2 文档规范**：文档在 `docs/research/`，修改后仍写"why this was chosen"，不含执行指令 ✅
3. **跨章节矛盾检查**：
   - 原 §5 行 233 "进入风险评估而非直接淘汰" vs 行 238 "淘汰" → 已修复为统一状态机（可验证/需缓解/不适用）✅
   - §1.8 优先级表第 4 行已标为归档，§4 Step 5 已同步更新为 arXiv/HF Papers 流程 ✅
   - §5 准入条件 "需缓解" vs §5 评分 "可验证" — 一致链路 ✅
4. **指针目标完整性**：
   - `docs/research/vlm-model-selection-benchmark.md` §4 — 文件存在 ✅
   - `docs/research/voice-cloning-solutions-m2-pro.md` — 存在 ✅
   - `docs/research/digital-human-solutions-m2-pro.md` — 存在 ✅
   - AGENTS.md L159 引用 `model-sources-reference.md` → "模型选择通用标准"标题不变 ✅
5. **文件存在性**：所有引用文件已用 `ls` 验证存在 ✅

**发现**：无 Standards 违规。

## Spec

**检查结果**：通过（所有验收标准满足或将在后续 step 完成）

| 验收标准 | 状态 |
|---------|------|
| PapersWithCode 入口删除，替换为 arXiv/HF Papers 发现流程 | ✅ |
| HF Open LLM Leaderboard 标为归档，替换为 Eval Results | ✅ |
| 硬性门槛矛盾修复（统一状态机） | ✅ |
| NC 许可证段改为"需法务确认" | ✅ |
| 格式表增加类别标注 | ✅ |
| GitHub 搜索新增完成条件 | ✅ |
| Ollama 分类重写，删除固定内存数 | ✅ |
| 来源增加最小元数据（API 端点） | ✅ |
| 新增 Step 6a 候选证据卡 | ✅ |
| memory 指针替换为仓库内路径 | ✅ |
| AGENTS.md 引用不破坏（grep 验证） | ✅ |
| DOCS-INDEX 更新 | 待 Step 8 |
| review 文件归档 | 待 Step 8 |
| lint + build + tsc 通过 | 待 Step 6 |

**发现**：无 Spec 偏差。所有文档修改已完成，剩余为归档和验证步骤。

## Summary

- **Standards**：0 个发现
- **Spec**：0 个发现（所有文档修改完成，归档/验证待后续 step）
