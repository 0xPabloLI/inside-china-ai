# Tickets: VLM 选型文档修订

> **来源 spec**：`docs/spec-vlm-docs-remediation.md`
> **创建日期**：2026-08-26

## 依赖图

```
T1 (benchmark 视频章节重构)
  ↓ 无依赖（独立修改 benchmark 内部）
T2 (benchmark §5/§7/§8 修正)
  ↓ 无依赖（同文件不同章节）
T3 (ADR-0009 Ollama 修正)
  ↓ 无依赖（独立文件）
T4 (handoff 待办收束 + memory 指针 + 断言修正)
  ↓ 无依赖（独立文件）
T5 (model-sources 信源分层 + 格式表拆分 + 性能断言)
  ↓ 无依赖（独立文件）
T6 (跨文档一致性验证)
  ↓ 依赖 T1-T5 全部完成
```

T1-T5 可并行执行，T6 是验证 ticket。

---

## T1: benchmark §4 视频章节重构

**依赖**：无
**文件**：`docs/research/vlm-model-selection-benchmark.md`
**场景覆盖**：S1, S9, S12

### Checklist

- [ ] 将 §4 视频分析（第 116-150 行）重构为三个子节：
  - `#### 已废弃结论` — 包含废弃原因 + 保留跨平台证据表（标注为历史记录）
  - `#### 当前结论` — 验证记录格式（状态/验证日期/环境/模型/输入/调用方式/结果/证据/失效条件）
  - `#### 仍存在的限制` — 保留原文第 150 行
- [ ] 移除 `[[memory:...]]` 指针（如有）
- [ ] 废弃结论中明确标注废弃原因：API 调用方式错误导致的误报
- [ ] 当前结论引用 `vlm_analyzer.py` L326-337 + L494-523 作为证据
- [ ] 当前结论包含失效条件：mlx-vlm 或 transformers 升级后需重新 smoke test

### 完成标准

S1: Agent 读 §4 时先看到已废弃结论（标注原因），再看到当前结论（含验证日期、环境、证据），不会混淆。
S9: "影响所有平台"只出现在"已废弃结论"小节内。
S12: 与 handoff 背景描述一致。

---

## T2: benchmark §5/§7/§8 补充修正

**依赖**：无
**文件**：`docs/research/vlm-model-selection-benchmark.md`
**场景覆盖**：无直接场景（支撑性修正）

### Checklist

- [ ] §5 社区评价表第 163 行改为"Qwen3-VL video processor 曾有跨平台 issue（已被 mlx-vlm 0.6.16 numpy processor 绕过）"
- [ ] §7 Pipeline 集成 → 待办新增：公平 A/B 升级评估待办（F5）
- [ ] §8 待办第 213 行修正为"[x] 升级 mlx-vlm 到 0.6.16，原生视频路径验证成功"

### 完成标准

§5 不再无条件声称"影响所有平台"。§7 包含 A/B 评估待办。§8 待办状态与实际一致。

---

## T3: ADR-0009 Ollama 视觉能力修正

**依赖**：无
**文件**：`docs/adr/0009-vlm-qwen3-vl-mlx.md`
**场景覆盖**：S2, S11

### Checklist

- [ ] 第 13 行改为"Ollama 支持部分视觉模型（如 qwen3.5:4b），但本项目以 mlx-vlm 为主路径（现有 pipeline + 原生视频 fallback 已围绕它建立）。将 Ollama 用作替代路径前需完成同 corpus 的性能、视频和集成验证。"

### 完成标准

S2: 不出现"does not support vision"。
S11: 与 handoff 对 Ollama 的表述一致。

---

## T4: handoff 待办收束 + 断言修正

**依赖**：无
**文件**：`docs/handoffs/handoff-vlm-model-sources-2026-08-26.md`
**场景覆盖**：S3, S4, S7, S8, S12

### Checklist

- [ ] 第 12 行移除 `[[memory:17877336917687800217]]`，替换为验证记录（日期、环境、证据路径）
- [ ] 第 46-47 行 Qwen3.8 断言修正（"最强开源 VLM" → "本项目候选集内的高容量候选"；"只能通过 Ollama" → "当前仅通过 Ollama 验证了 MLX 变体"；"24GB+ Mac" → "需实际加载测量"）
- [ ] 第 76-85 行模型格式表删除，替换为指针指向 model-sources §2
- [ ] 第 89 行 Ollama 进程内存 `~16MB` 修正
- [ ] 第 94-100 行"待落盘"section 替换为"已完成"section + 指针
- [ ] 第 168 行待办第 1 项标记 `[x]`

### 完成标准

S3: "待落盘"不出现。
S4: "最强开源 VLM"不出现。
S7: `[[memory:` 不出现。
S8: `~16MB` 不出现。

---

## T5: model-sources 信源分层 + 格式表拆分 + 性能断言修正

**依赖**：无
**文件**：`docs/research/model-sources-reference.md`
**场景覆盖**：S5, S6, S7, S8, S10

### Checklist

- [ ] §1.8 线性表后新增"决策证据分层"4 层表格（第一方事实/发行与安装/独立评估/本机决策）
- [ ] §2 格式表拆成"权重容器"（GGUF/MLX/safetensors）和"量化方法"（K-quants/MLX量化/GPTQ/AWQ/EXL2）两个子表
- [ ] §2 删除"Apple Silicon 上比 GGUF（Metal 后端）快 30-50%；跨平台比 NVIDIA CUDA 慢 2-4x"
- [ ] §1.8 Ollama 进程内存 `~16MB` 修正
- [ ] §4 Step 7 第 199 行 `[[memory:17877336917687800217]]` 替换为指向 benchmark §4 的指针

### 完成标准

S5: §2 有两个子表。
S6: §1.8 有决策证据分层。
S7: `[[memory:` 不出现。
S8: `~16MB` 不出现。
S10: "快 30-50%"或"慢 2-4x"不出现。

---

## T6: 跨文档一致性验证

**依赖**：T1, T2, T3, T4, T5
**文件**：全部 4 个文件（只读验证）
**场景覆盖**：S7, S8, S9, S10, S11, S12

### Checklist

- [ ] grep `[[memory:` in all 4 files → 0 hits
- [ ] grep `~16MB\|16 MB` in all 4 files → 0 hits
- [ ] grep `does not support vision` in ADR-0009 → 0 hits
- [ ] grep `待落盘` in handoff → 0 hits
- [ ] grep `最强开源 VLM` in handoff → 0 hits
- [ ] grep `影响所有平台` in benchmark → only in "已废弃结论" section
- [ ] grep `快 30-50%\|慢 2-4x` in model-sources → 0 hits
- [ ] ADR-0009 和 handoff 对 Ollama 表述一致
- [ ] benchmark §4 当前结论和 handoff 背景描述一致

### 完成标准

全部 grep 检查通过。跨文档一致性确认。
