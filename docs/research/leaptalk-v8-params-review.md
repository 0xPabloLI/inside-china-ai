# LeapTalk v8 方案参数合理性评估

> **评估日期**：2026-09-02
> **评估对象**：`docs/research/digital-human-test-progress.md` §LeapTalk v8 规划
> **信源**：arXiv 2608.00079v1 论文全文 + `inference.py`/`inf.sh` 源码 + 本地 v4-v7 实测数据
> **社区经验**：几乎为零（LeapTalk 2026-07-29 刚发表，GitHub 3 issue 全无回复，HF/Reddit/X 无调优反馈）

---

## v8 方案回顾

| 参数        | v8 取值                   | 信源                             |
| ----------- | ------------------------- | -------------------------------- |
| 路线（VAE） | **WanVAE**（`--no_lite`） | v5 肉眼复核 + 论文 Table 1       |
| CFG α       | **{1.6, 2.0, 2.5, 3.0}**  | 论文默认 1.6 + v6 TAEHV 曲线外推 |
| 步数        | **1 步**                  | 论文设计目标                     |
| 分辨率      | **512×512**               | 论文 Appendix F                  |
| model_type  | **pro**                   | `inference.py` 默认              |
| 硬件        | Kaggle T4 15GB            | v4-v7 已验证                     |
| 复用        | v5 C（α=1.6+WanVAE+1步）  | 已存在                           |

---

## 逐项评估

### 1. 路线 WanVAE — ✅ 合理（核心改进）

| 信源                                   | 结论                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 论文 Table 1（arXiv 2608.00079）       | Pro+WanVAE **FID 21** / FVD 197 / FPS 55 vs Lite+TAEHV FID 38 / FVD 285 / FPS 200                     |
| 论文 Table 5                           | WanVAE Dec 5.26s / Dec Mem 10.128GB；TAEHV Dec 0.24s / Dec Mem 0.411GB（WanVAE 慢 ~22×、内存大 ~25×） |
| 论文 §Effect of different Autoencoders | TAEHV "main degradation is **slight blurriness in fine regions such as lips**"                        |
| v5 肉眼复核（2026-09-02 22:39）        | C/D（WanVAE）视觉干净无色块，A/B（TAEHV）有油画/水彩伪影                                              |
| T4 可行性                              | WanVAE Dec Mem 10.128GB < T4 15GB；v5 已实测可跑（508s/变体）                                         |

**结论**：WanVAE 是官方 Pro 配置，FID 21 是论文最佳画质。v5 肉眼复核已确认视觉优于 TAEHV。代价是慢 3×，但 T4 显存充裕。**这是 v8 的核心改进，推翻了 v5-v7 的 TAEHV 隐含路线，有充分证据。**

### 2. CFG 范围 {1.6, 2.0, 2.5, 3.0} — ⚠️ 基本合理，上限可能偏保守

**官方信源**：

- 论文 §Parameter Sensitivity：**"a moderate value around 1.6 achieves the best balance. We therefore use α=1.6"** → 下限 1.6 ✅
- 论文 Table 7（Appendix D）CFG 消融完整数据：

| CFG | Avg Std↑（运动多样性） | BAS↑（音频-运动对齐） |
| --- | ---------------------- | --------------------- |
| 1.0 | 1.655                  | **0.723**             |
| 3.0 | 3.394                  | 0.658                 |
| 5.0 | 5.000                  | 0.696                 |
| 7.0 | 6.323                  | 0.650                 |

- 论文原文：**"pose diversity increases with CFG scale... However, BAS gradually drops as CFG grows, indicating over-strong guidance can hurt audio-motion alignment"**

**注意**：论文 Table 7 **没有测 α=1.6**（只测 1.0/3.0/5.0/7.0），1.6 是从 Figure 8 敏感性曲线推断的"最佳平衡点"。

**v6 实测（TAEHV 路线）**：唇同步 r@lag0 在 α=3.0 达峰（0.677），但 TAEHV 在 α≥3 已视觉毁容。

**评估**：

- 下限 1.6 = 论文官方默认 ✅
- 上限 3.0：**保守但可能偏低**。TAEHV 在 α≥3 视觉毁容，但 **WanVAE 重建能力强（3D Conv），伪影阈值可能更高**。v8 跳过 3.5/4.0 是为了避免重蹈 v7 α=4.0 覆辙，但那是 TAEHV 路线的教训，WanVAE 未必同样。
- **建议**：加 **α=3.5** 探边界。如果 WanVAE 在 3.5 仍干净，可能找到更好的唇同步点（BAS 在 3.0→5.0 间有反弹 0.658→0.696，说明 3.0-5.0 间可能有局部优区）。

### 3. 步数 1 步 — ✅ 合理

| 信源                                   | 结论                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------- |
| 论文 Abstract/Highlights               | "One-step inference, 200 FPS"（设计目标 1 步）                         |
| 论文 Table 1                           | 所有 LeapTalk 结果均为 1 NFE                                           |
| 论文 §Effect of different Autoencoders | "TAEHV blur can be alleviated by increasing 1→2 steps"——**仅对 TAEHV** |
| v5 实测                                | WanVAE 1步(C) vs 2步(D) 视觉几乎一致，2步无收益只增成本（508s→627s）   |

**结论**：1 步是官方设计目标。v5 已证 2 步在 WanVAE 上无视觉收益。✅

### 4. 分辨率 512×512 — ✅ 合理

| 信源                       | 结论                                                            |
| -------------------------- | --------------------------------------------------------------- |
| 论文 Appendix F            | **"All main experiments were conducted at 512×512 resolution"** |
| 论文 Table 9（Appendix F） | 512×512 在 A100 上 104 FPS；768×768 仅 35 FPS                   |
| v7 实测                    | 768×768 在 T4 上 OOM（28.7s 失败）                              |

**结论**：512 是官方主实验分辨率，也是 T4 唯一可行尺寸。✅

### 5. Pro + WanVAE 组合 — ✅ 合理

| 信源                    | 结论                                                |
| ----------------------- | --------------------------------------------------- |
| 论文 Table 1            | OURS (Pro) = Pro weights + WanVAE，FID 21           |
| `inference.py` argparse | `--model_type` default="pro"，`--lite` default=True |
| `inf.sh`                | `LITE="1"` 默认走 TAEHV，切 WanVAE 需 `--no_lite`   |

**结论**：Pro+WanVAE 是论文 Table 1 官方最佳配置。v8 用 `--model_type pro --no_lite` 正确。✅

### 6. T4 硬件可行性 — ✅ 可行

| 指标           | 官方数据               | T4 实测                        |
| -------------- | ---------------------- | ------------------------------ |
| WanVAE Dec Mem | 10.128GB（Table 5）    | T4 15GB 充裕                   |
| WanVAE 速度    | A100 55 FPS（Table 1） | T4 0.28 FPS（v5 C）            |
| 单变体耗时     | —                      | ~8.5 min（v5 C）               |
| v8 总预估      | —                      | ~35 min（3 新变体 + 权重下载） |
| Kaggle 配额    | —                      | 30h/周，35min 远在限内         |

**结论**：T4 可跑 WanVAE，虽慢但在配额内。✅

---

## 潜在问题与建议

### ⚠️ 问题 1：CFG 上限 3.0 可能偏低

**理由**：v8 上限 3.0 是基于 TAEHV 路线的教训（α≥3 视觉毁容），但 WanVAE 是 3D Conv，重建能力远强于 TAEHV（FID 21 vs 38），**高频伪影阈值可能更高**。论文 Table 7 显示 BAS 在 3.0→5.0 间有反弹（0.658→0.696），说明 3.0-5.0 间可能存在局部优区。

**建议**：加 **α=3.5** 作为第 5 个变体。如果 WanVAE 在 3.5 仍视觉干净且唇同步更好，则甜区可扩到 3.5；如果出现伪影，则确认 3.0 是上限。边际成本仅 ~8.5 min。

### ✅ 已排除的非问题

- **α=1.0 基线缺失**：α=1.0 在 TAEHV 上已证唇动极弱（r=0.409），WanVAE 路线有 α=1.6 作基线足够，不需补 1.0。
- **λ_perc=4.0**：论文 Table 3 消融的 λ_perc 是**训练阶段**参数，推理时不涉及。v8 不调此参数正确。
- **shift_gamma=5.0**：`inference.py` 默认值，论文未提推理时需改，沿用默认合理。
- **color_correction_strength=1.0**：`inference.py` 默认全色彩校正，非核心画质参数，可不调。

---

## 总体结论

**v8 方案参数配置基本合理**，符合论文官方推荐。核心改进（WanVAE 路线）有充分的官方证据（Table 1 FID 21）和实测证据（v5 肉眼复核）支持。

| 维度               | 评分    | 说明                                            |
| ------------------ | ------- | ----------------------------------------------- |
| 路线选择（WanVAE） | ✅ 优   | 官方 Pro 配置，FID 21，v5 肉眼确认              |
| CFG 范围           | ⚠️ 良   | 下限 1.6 官方默认，上限 3.0 可能偏保守          |
| 步数（1 步）       | ✅ 优   | 官方设计目标，v5 已证多步无收益                 |
| 分辨率（512）      | ✅ 优   | 官方主实验分辨率，T4 唯一可行                   |
| 硬件（T4）         | ✅ 可行 | 显存充裕，耗时在配额内                          |
| 三层验证           | ✅ 优   | 粗筛→肉眼→1×4 对照，避免重蹈 Laplacian 代理错判 |

**唯一建议**：在 CFG 扫描中加 **α=3.5** 探 WanVAE 伪影边界（边际成本 ~8.5 min）。

---

## 信源清单

1. arXiv 2608.00079v1 论文全文 — https://arxiv.org/html/2608.00079v1 — Tier 1
2. LeapTalk `inference.py` — https://raw.githubusercontent.com/zhangrongxiang/LeapTalk/main/inference.py — Tier 1
3. LeapTalk `inf.sh` — https://raw.githubusercontent.com/zhangrongxiang/LeapTalk/main/inf.sh — Tier 1
4. LeapTalk GitHub README — https://github.com/zhangrongxiang/LeapTalk — Tier 1
5. HuggingFace z-rx/leaptalk 模型卡 — https://huggingface.co/z-rx/leaptalk — Tier 1
6. 本地实测 v4-v7 — `docs/research/digital-human-test-progress.md` — Tier 1（实测）
7. 社区调研（GitHub Issues / HF discussions / Reddit / X）— 几乎无内容 — Tier 3
