# Tickets: Model Sources Reference Remediation

> **Source spec**: `docs/spec-model-sources-remediation.md`
>
> **Note**: 纯文档修复任务，无代码逻辑。TDD 不适用——验证方式为 grep/搜索 + lint。

## Ticket Dependencies

```
T1 (§1.5 + Step 5) → T2 (§1.8 信源表) → T3 (§2 格式表) → T4 (§3 + §4 流程) → T5 (§5 准入 + NC) → T6 (归档 + 索引)
```

所有 ticket 串行（同一文件修改）。

---

## T1: 删除 PapersWithCode + 更新搜索流程 Step 5

**Covers**: MSR-01 (阻塞), S1
**File**: `docs/research/model-sources-reference.md`

- [x] 删除 §1.5 PapersWithCode 条目（行 82-86）
- [x] §1.7 其他来源表中删除 PapersWithCode 行（行 96）
- [x] §4 搜索流程 Step 5 更新：从 "PapersWithCode 搜索" 改为 "arXiv/HF Papers 发现论文 → 在 GitHub/HF/ModelScope 查实现"
- [x] arXiv 在 §1.7 表中已有，保持

---

## T2: 修复 §1.8 信源表 + Ollama 分类

**Covers**: MSR-02 (阻塞), MSR-07 (重要), S2, S7
**File**: `docs/research/model-sources-reference.md`

- [x] §1.8 优先级表第 4 行：HF Open LLM Leaderboard → 标为"已归档（历史结果）"，替换为"Hugging Face Eval Results + 任务社区榜单"
- [x] §1.8 "信源 vs 推理引擎 vs 模型仓库"段重写为四分类：模型目录/权重仓库/评测结果/运行时
- [x] §1.8 Ollama 内存段：删除"常驻进程"措辞，保留"默认 5 分钟后卸载"，标注 `keep_alive` / `OLLAMA_KEEP_ALIVE` 可配，附 FAQ 链接

---

## T3: 修复 §2 格式表

**Covers**: MSR-05 (重要), S5
**File**: `docs/research/model-sources-reference.md`

- [x] §2 权重容器表增加"文件格式"标注 + 性能说明
- [x] 删除无基准支撑的性能断言（原文未发现，新增性能说明防止未来引入）
- [x] Apple Silicon 决策段保留（事实正确）

---

## T4: 修复 §4 搜索流程 + GitHub 完成条件 + 候选证据卡 + memory 指针

**Covers**: MSR-06 (重要), MSR-09 (改进), MSR-10 (改进), S6, S9, S10
**File**: `docs/research/model-sources-reference.md`

- [x] §4 Step 1 后新增 GitHub 搜索完成条件：记录查询/日期/total_count/incomplete_results，incomplete_results=true 时缩小查询
- [x] §4 Step 6 和 Step 7 之间新增 Step 6a: 候选证据卡（用途/官方URL/版本/许可证/设备/运行时/安装结果/smoke test/性能/限制/验证日期）
- [x] §4 Step 7 教训段：memory 指针替换为 `docs/research/vlm-model-selection-benchmark.md` §4 的仓库内路径

---

## T5: 修复 §5 硬性门槛矛盾 + NC 许可证段

**Covers**: MSR-03 (阻塞), MSR-04 (阻塞), S3, S4
**File**: `docs/research/model-sources-reference.md`

- [x] §5 "模型选择通用标准" 开头：统一准入状态为 可验证/需缓解/不适用
- [x] 硬性门槛第 2 条：删除"仅支持 CUDA 或纯 CPU 的淘汰"，改为"仅支持 CUDA 或纯 CPU → 标为不适用"
- [x] NC 许可证风险评估段：改为"需法务确认"状态
- [x] 删除推测性段落："被发现概率""权利人可监控下载列表""赔偿金额"
- [x] 保留风险评估维度框架：分别记录/状态/缓解路径/决策标准
- [x] 综合评分段：状态为"可验证"的候选才进入评分

---

## T6: 归档 review + 更新 DOCS-INDEX

**Covers**: S12, 归档流程
**Files**: `docs/research/model-sources-reference-review.md` → `docs/archive/reviews/`, `docs/DOCS-INDEX.md`

- [ ] 移动 `model-sources-reference-review.md` 到 `docs/archive/reviews/`（Step 8 归档）
- [ ] DOCS-INDEX: review 行标记为已归档或移除（Step 8 归档）
- [ ] DOCS-INDEX: 检查 `model-sources-reference.md` 行描述是否需更新（Step 8 归档）
- [ ] spec + tickets 文件归档到 `docs/archive/`（Step 8 归档）

---

## T7: 来源元数据增强

**Covers**: MSR-08 (改进), S8
**File**: `docs/research/model-sources-reference.md`

- [x] 为 §1.1-§1.3 中的 API 端点增加官方文档链接
- [x] 为 API 端点标注"最后验证日期"
- [x] 网页入口保持简洁，不强加元数据
