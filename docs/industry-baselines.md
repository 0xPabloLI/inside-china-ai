# 行业基线（写稿速查，2026-11）

> 用途：写稿时回答「这个模型/这个数，在这个领域算什么档」。**不判断新闻价值**，只给量级坐标与突破判据。
> 读法：先判**档位**，再比数字；凡引用数字必须带 `asOf`，超过 90 天未复核只能写「截至 X 月」。

## 1. 六领域坐标

| 领域 | 端侧档 | 主流档 | 2026-11 旗舰带 | 突破判据（满足其一才写「突破」） | 锚点（总参数 / 激活） |
| --- | --- | --- | --- | --- | --- |
| **LLM** | ≤ 8B | 30B–235B | **1.6T–2.8T / 49B–104B 激活**，1M 上下文 | 同代基准跨档 + 长程 agent 可靠完成 + 1M 上下文成本显著下降 | DeepSeek V4-Pro 1.6T/49B；Kimi K3 2.8T/104B；Qwen3.8 2.4T/95B |
| **世界模型** | 1–3B（端侧实时） | 10–14B | **10–28B 总 / 14B 级推理**，720p 实时、分钟级记忆 | 分辨率/帧率/记忆长度任一跨档，或首次支持可控事件/多智能体 | Genie 3 11B；LingBot-World 28B/14B；lingbot-world-v2 14B、1.3B |
| **视频生成** | 5B | 14B | **27B/14B MoE 或 5B 稠密**，720p@24fps | 原生音频、1080p、长镜头一致性、物理合理性从演示变可交付 | Wan2.2 A14B 27B/14B；TI2V-5B 5B |
| **VLM** | 2B–8B | 30B–32B | **235B 总 / 22B 激活**，256K 交错上下文 | OCR / 长视频时序 grounding / 文档结构出现可复现跨档 | Qwen3-VL 2B/4B/8B/32B、30B-A3B、235B-A22B |
| **TTS** | 0.5B | 1.5B | **0.5B–1.5B**，百万小时级、9 语种零样本 | 跨语种自然度 + 情感/方言可控 + 首包 <250ms 同时改善 | CosyVoice 3 0.5B / 1.5B |
| **全模态** | — | 30B-A3B | **30B-A3B**，文本 119 语种、语音出 10 语种、首包 234ms | 四模态不劣化 + 流式端到端可用（拼四个单模态不算） | Qwen3-Omni-30B-A3B |

## 2. 三条硬规则

1. **总参数 ≠ 激活参数**：MoE 必须先说激活。Wan2.2 A14B 是总 27B / 激活 14B；Kimi K3 是总 2.8T / 激活 104B。把总参数当算力讲是错。
2. **闭源不填参数**：Sora、Veo、Genie 4 不公开参数量，只写能力档与日期，禁止估算。
3. **档位先于数字**：1.3B 世界模型不是「小」，是端侧档；拿它和 14B 旗舰比「差十倍」属于跨档比较，必须写明档位。

## 3. 首次报道与海外认知度

- 首次进入管线的公司/模型家族，必须给一句 `who + where + why it matters` 定位；已有报道历史的不重复讲背景。收录字段与示例见 `docs/research/company-relations.md`。
- 海外认知度分三档（`high` / `mid` / `low`，当前 17/20/31）存于 `scripts/short-video/lib/data/company-relations.json` 的 `overseasAwareness`；`low` 必讲背景，`mid` 视上下文，`high` 直接说本名。

## 4. 维护

- **触发点**：新 Pack 首次报道某实体时只校验该实体；每月抽样复核 `high` 认知度实体与旗舰档模型；每季度全量复核本表 `asOf`。
- **更新方式**：新值入账、旧值标 `superseded` 并记录来源，不直接改写；表中只显示 `current`。
- **降级**：只有媒体来源的参数超过 90 天无官方确认，降为「待核」并从旗舰带剔除。
- **机器可读账本**（S1 已落地）：事实存 `scripts/short-video/lib/data/industry-knowledge.json`（键控事实 + 双时态 `superseded`，字段 `(subject, relation, object, asOf, source, confidence, status)`）；本表是速查视图，数值冲突以账本为准。改数据后跑 `npm run migrate:industry-knowledge -- --check`（公司图投影幂等）与 `npx vitest run industry-knowledge`（schema + 68 实体解析 + 取代回放 + 30/90 天预算）。写稿侧消费尚未接入，属 S2。

## Design Decisions & References

- 基线推导、样本口径、失效证据与机制取舍：`docs/research/industry-knowledge-layer-2026-11.md`（#253 研究切片）。
- 实体收录与首次报道背景规则：`docs/research/company-relations.md`；机器可读 SSOT：`scripts/short-video/lib/data/company-relations.json`（公司图）与 `scripts/short-video/lib/data/industry-knowledge.json`（行业事实账本，S1）。
