# VLM Relevance 准确性测试方案

> 关联 issue: #334
> 目的: 为 `vlm_analyzer.py` 的 claim-mode relevance 判断设计可量化评估方案，
> 用于对比 2B / GLM-9B / 30B-A3B 三模型在 B-roll gate 场景下的准确性。
> 本文档仅设计测试方案，实际执行在 issue #334 实施时评估。

## 1. 背景

### 1.1 Claim prompt 结构

`build_semantics_prompt(is_video, claim)` 在基础 prompt 上追加：

```
## Scene Claim (judge relevance against this)
Scene narration: "{voiceover}"
Desired visual: "{assetNeed}"

## Relevance
Score 0-100: how well this asset supports the scene claim above.
100 = directly supports it, 50 = loosely related, 0 = completely unrelated.
Output the bare integer only.

## Relevance Reason
One sentence explaining the score.
```

### 1.2 Relevance 的实际用途

B-roll gate：对每个候选素材 × 场景 claim 对，模型输出 0-100 分，
分数高于阈值的素材进入 B-roll 候选池。误判代价：
- **假高**（不相关素材得高分）→ B-roll 画面与旁白不匹配，观众出戏
- **假低**（相关素材得低分）→ 好素材被过滤，B-roll 池枯竭

### 1.3 当前 cascade 在 claim mode 下的行为

`should_escalate(claim_mode=True)` 只检查 `relevance is None`（解析失败才升级）。
意味着 2B 的 relevance 分数直接被采用，不升级到 GLM。
**如果 2B relevance 不准，错误直接传导到 B-roll gate。**

## 2. 测试集设计

### 2.1 素材选择

从 `scripts/short-video/assets/` 选取覆盖多种 content kind 的素材：

| ID | 文件 | Content Kind | 说明 |
|----|------|-------------|------|
| A | pexels-alibaba-01.jpg | product_demo | Alibaba 展台/产品 |
| B | pexels-ai-chip.jpg | product_demo | AI 芯片特写 |
| C | pexels-chart-01.jpg | chart | 数据图表 |
| D | pexels-code-02.jpg | text_screenshot | 代码截图 |
| E | pexels-dc-server.jpg | landscape | 数据中心服务器机房 |
| F | pexels-architecture-03.jpg | landscape | 建筑外观 |
| G | pexels-video-alibaba-01.mp4 | other | Alibaba 气球视频 |
| H | scene-1-seed1024.mp4 | product_demo | 游戏画面视频 |

### 2.2 Claim 设计

为每个素材设计 3-4 个 claim，覆盖 4 个相关性等级。

**Ground truth 标注规则**：
- **90-100** (直接匹配): 素材视觉内容直接展示 claim 所述场景
- **60-80** (主题相关): 同一主题领域但视觉不完全匹配
- **30-50** (弱相关): 有部分元素关联但主体不符
- **0-20** (不相关): 完全不同主题/视觉

### 2.3 Asset-Claim 对（测试集）

| # | Asset | Claim voiceover | Claim assetNeed | GT | 等级 | 设计理由 |
|---|-------|-----------------|-----------------|-----|------|---------|
| 1 | A (Alibaba) | "阿里巴巴发布通义千问3，性能超越DeepSeek。" | "Alibaba AI 产品/展台" | 95 | 直接匹配 | 素材就是 Alibaba 展台 |
| 2 | A (Alibaba) | "DeepSeek 开源 DeepSeek-V3 模型。" | "DeepSeek 产品/logo" | 15 | 不相关 | Alibaba ≠ DeepSeek |
| 3 | A (Alibaba) | "中国 AI 企业加速布局大模型。" | "中国科技公司/展台" | 70 | 主题相关 | Alibaba 是中国科技公司但非泛指 |
| 4 | B (AI chip) | "英伟达发布新一代 AI 加速芯片。" | "AI 芯片/处理器特写" | 90 | 直接匹配 | 素材就是芯片特写 |
| 5 | B (AI chip) | "阿里云通义千问3 API 价格降低。" | "API 定价/云服务界面" | 10 | 不相关 | 芯片 ≠ API 定价 |
| 6 | C (chart) | "GPT-4o 在 MMLU 基准测试中得分第一。" | "benchmark 对比图表" | 85 | 直接匹配 | 素材就是图表 |
| 7 | C (chart) | "OpenAI 发布 GPT-4o 模型。" | "OpenAI 产品/发布" | 25 | 弱相关 | 图表可能相关但非产品展示 |
| 8 | D (code) | "DeepSeek 开源代码在 GitHub 获得万星。" | "代码截图/GitHub" | 80 | 直接匹配 | 素材就是代码 |
| 9 | D (code) | "中国 AI 芯片产能持续增长。" | "芯片制造/工厂" | 5 | 不相关 | 代码 ≠ 芯片制造 |
| 10 | E (server) | "阿里云建设超大规模智算中心。" | "数据中心/服务器机房" | 90 | 直接匹配 | 素材就是机房 |
| 11 | E (server) | "通义千问3 支持 128K 上下文长度。" | "模型能力/文本生成" | 15 | 不相关 | 机房 ≠ 模型能力 |
| 12 | F (building) | "北京智源研究院成立人工智能实验室。" | "建筑/机构外观" | 75 | 主题相关 | 建筑可能是机构但不确定 |
| 13 | F (building) | "GPT-4o 实时语音对话能力演示。" | "AI 产品 demo/界面" | 10 | 不相关 | 建筑 ≠ 产品 demo |
| 14 | G (video-Alibaba) | "阿里巴巴在云栖大会展示 AI 技术。" | "Alibaba 活动/展台视频" | 80 | 直接匹配 | 视频是 Alibaba 气球活动 |
| 15 | G (video-Alibaba) | "AI 模型训练算力需求激增。" | "GPU/算力/训练" | 20 | 不相关 | 气球活动 ≠ 算力 |
| 16 | H (video-game) | "AI 游戏引擎实现实时渲染突破。" | "游戏/AI 渲染" | 65 | 主题相关 | 游戏画面但非 AI 渲染 |
| 17 | H (video-game) | "阿里云通义千问3 发布。" | "Alibaba AI 产品" | 5 | 不相关 | 游戏 ≠ Alibaba |

**总计 17 对**：直接匹配 5, 主题相关 3, 弱相关 1, 不相关 8

### 2.4 分层目标

确保测试集覆盖以下维度：

| 维度 | 覆盖情况 |
|------|---------|
| 图片 vs 视频 | 图片 13 对, 视频 4 对 |
| Content Kind | product_demo 7, chart 2, text_screenshot 2, landscape 4, other 2 |
| 相关性等级 | 高(80+) 5, 中(60-79) 3, 低(20-59) 2, 无(0-19) 7 |
| 主题领域 | Alibaba, DeepSeek, 芯片, 算力, 代码, 建筑, 游戏 |

## 3. 评估指标

### 3.1 逐对指标

| 指标 | 公式 | 含义 |
|------|------|------|
| AE | `|model_score - GT|` | 单对绝对误差 |
| 桶分类 | 见下 | 分桶后是否正确 |
| Gate 决策 | `model >= threshold == GT >= threshold` | B-roll gate 通过/拒绝是否正确 |

**分桶定义**：
- High: 70-100
- Medium: 40-69
- Low: 1-39
- None: 0

### 3.2 聚合指标

| 指标 | 公式 | 合格阈值 |
|------|------|---------|
| MAE | `mean(AE)` | ≤ 15 |
| 桶准确率 | `correct_buckets / 17` | ≥ 80% |
| Gate 准确率 (threshold=50) | `correct_gate_decisions / 17` | ≥ 85% |
| Spearman ρ | rank correlation | ≥ 0.75 |
| 假高率 (FPR) | `model >= 50 但 GT < 30 的比例` | ≤ 10% |
| 假低率 (FNR) | `model < 50 但 GT >= 70 的比例` | ≤ 10% |

**假高比假低更严重**：假高导致不相关素材进入 B-roll 池，观众出戏。
假低只是好素材被浪费，可由候选池大小缓冲。

### 3.3 退化检测

额外检查：
- relevance 输出是否为裸整数（非 "Score: 80" 等格式）
- Relevance Reason 是否为有效一句话（非重复退化）
- 2B 特有：Subjects 是否出现重复退化（已知风险）

## 4. 测试执行方法

### 4.1 脚本设计

```python
# /tmp/vlm_relevance_test.py
# 对每个 asset-claim 对，用三模型分别推理，记录 relevance 分数和原始输出

TEST_CASES = [
    {"asset": "pexels-alibaba-01.jpg", "is_video": False,
     "claim": {"voiceover": "...", "assetNeed": "..."}, "gt": 95},
    # ... 17 对
]

MODELS = [
    ("2B", "mlx-community/Qwen3-VL-2B-Instruct-4bit"),
    ("GLM-9B", "mlx-community/GLM-4.1V-9B-Thinking-4bit"),
    ("30B-A3B", str(Path.home() / "models/Qwen3-VL-30B-A3B-Instruct-4bit")),
]

# 对每个 model × test_case:
#   prompt = build_semantics_prompt(is_video, claim)
#   raw = run_vlm_inference(model, processor, path, is_video, prompt)
#   parsed = parse_markdown_to_dict(raw)
#   record: {model, case_id, gt, model_score, raw_output, parse_ok, time}
```

### 4.2 执行流程

1. 逐模型加载（一次加载，跑全部 17 对）
2. 每对推理：图片直接传，视频用帧提取（与生产一致）
3. 记录：raw output、parsed relevance、推理时间
4. 输出 JSON + Markdown 报告

### 4.3 预计耗时

| 模型 | 单对预估 | 17 对总计 |
|------|---------|---------|
| 2B | 5-25s | 2-7 min |
| GLM-9B | 30-140s | 8-40 min |
| 30B-A3B | 10-210s | 3-60 min |

总计约 15-110 min（取决于视频对比例）。

## 5. 结果分析框架

### 5.1 输出格式

```
## Relevance Accuracy Test Results

### Per-Model Summary
| Model | MAE | Bucket Acc | Gate Acc(50) | Spearman ρ | FPR | FNR |
|-------|-----|-----------|-------------|-----------|-----|-----|
| 2B    | ?   | ?         | ?           | ?         | ?   | ?   |
| GLM   | ?   | ?         | ?           | ?         | ?   | ?   |
| 30B   | ?   | ?         | ?           | ?         | ?   | ?   |

### Per-Case Detail
| # | Asset | GT | 2B | GLM | 30B | 2B AE | GLM AE | 30B AE |
|---|-------|-----|-----|-----|------|-------|--------|--------|
| 1 | A     | 95  | ?   | ?   | ?    | ?     | ?      | ?      |
...

### Failure Analysis
- 哪些对误差最大？
- 假高/假低集中在哪类素材/claim？
- 2B 是否有退化？
```

### 5.2 决策规则

- 如果 30B 的 MAE ≤ 2B 的 MAE 且 Gate 准确率 ≥ 2B → 30B 可替代 2B+GLM
- 如果 2B FPR > 15% → 当前 cascade 的 claim_mode 不升级策略有风险
- 如果某模型在"直接匹配"类别 AE > 20 → 模型基础视觉理解有问题

## 6. 注意事项

1. **GT 标注主观性**：ground truth 是人工标注，有主观偏差。缓解：
   - GT 用范围而非精确值（如 85-95），模型落在范围内算正确
   - 多人标注取中位数（如有条件）

2. **Prompt 一致性**：测试必须用 `build_semantics_prompt()` 生成 prompt，
   不能手写简化版（R10 教训：简化 prompt 导致虚假退化结论）

3. **帧提取一致性**：视频测试用与生产相同的帧提取参数
   （fps=1.0, max 8s），不能改参数

4. **模型加载顺序**：先跑 2B（最快），确认无退化后再跑 GLM 和 30B。
   如果 2B 出现退化，记录退化对但不中断测试。

5. **30B 原生视频**：如果同时测试原生视频路径（`generate(video=)`），
   需单独标注，不与帧提取结果混在一起比较。