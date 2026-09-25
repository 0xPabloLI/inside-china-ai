# FastMetal-5B-QAD B-roll T2V 评测报告（#298，2026-09-25）

Issue: #298（Tier 1 / P1 / Dominant）。完成标准：评测报告 + 可生产运行脚本，替换 Wan1.3B 的 B-roll T2V。
前置研究：`docs/research/fastmetal-5b-t2v-upgrade-research-2026-09-25.md`（12 源）。
评测执行环境：M2 Pro 32GB，spike venv（fastvideo 0.2.1，mlx 0.32.2，torch 2.x MPS）。

## 结论（先行）

**FastMetal-5B-QAD 通过评测，建议替换。** 同 prompt 同 seed 对比中，5B 在 claim gate 上 4/4 全过且均分更高（85.0 vs 83.75），四维画质矩阵反超（19.0 vs 18.25 / 20），原生 704×1280 分辨率为基线的 2.4 像素倍，峰值内存 11.4 GiB 完全适配 M2 Pro 32GB（也满足官方 16GB+ 档位）。代价：单 clip 生成时间约 8-10 分钟（基线约 2-4 分钟）。

## 评测设计

- **对象**：FastMetal-5B-QAD（Wan2.2-TI2V-5B MLX，DMD 3 步蒸馏）vs 现役 FastMetal-1.3B-QAD（Wan2.1-T2V-1.3B MLX int8）。
- **公平性**：复用 `ant-lingbot-world-13b` 真实生产 prompt 与基线 winner seed（scene 2/4/8/9，见 `fastmetal5b-jobs.json`），两侧经同一评审模型（Qwen3-VL-30B-A3B-4bit）与同一 claim gate（`gate.mjs`，阈值 60）。
- **技术口径**：5B 原生 704×1280×121f@24fps（5.04s）；基线 480×832×81f@16fps（5.06s）——按成片时长对齐，各自发布配置不跨套（研究文档 §7 口径）。解码统一 taehv（`taew2_2.pth`，sha256 钉值校验通过）。
- **规模**：精简版 4 clips（issue triage 场景族：具体实体+人物 / 科技概念 / 数据图形 / 产品特写），单 seed。

## 结果

### Claim gate（生产同款 relevance，越高越好，≥60 过门）

| Scene | 基线 1.3B | FastMetal-5B | 判定 |
|-------|-----------|--------------|------|
| 2 会议舞台（具体实体+人物） | 80 | **85** | 5B 胜 |
| 4 数据中心机架（科技概念） | 85 | 85 | 平 |
| 8 里程碑时间线（数据图形） | 85 | 85 | 平 |
| 9 GPU 卡产品特写 | 85 | 85 | 平 |
| **均分** | **83.75** | **85.0** | **5B 胜** |

两侧理由文本逐 clip 独立且语义一致（5B 在 scene 2 对"主体/构图"的呈现更完整）。原始分：`output/t2v-eval-fastmetal5b-20260925/eval-scores.json`。

### 四维画质矩阵（T2I 横评模板，每维 5 星，单 clip 满分 20）

| Clip | PROMPT 遵循 | 画质 | B-roll 适用 | 缺陷 | 小计 |
|------|------|------|------|------|------|
| scene-2 基线 / 5B | 5 / 5 | 4 / 4 | 4 / 4 | 3 / 3 | 16 / 16 |
| scene-4 基线 / 5B | 5 / 5 | 5 / 5 | 5 / 5 | 5 / 5 | 20 / 20 |
| scene-8 基线 / 5B | 5 / 5 | 5 / 5 | 5 / 5 | 5 / 5 | 20 / 20 |
| scene-9 基线 / 5B | 5 / 5 | 4 / **5** | 5 / 5 | 3 / **5** | 17 / **20** |
| **合计** | | | | | **基线 73 / 5B 76** |

决定性差异在 scene 9（产品特写，最能暴露 720p 升级的价值）：基线有"镜头抖动和伪影，影响流畅感"（QUALITY 4 / DEFECTS 3），5B "几乎无缺陷，仅边缘轻微暗角"（20/20 满分）。逐条文本：`output/t2v-eval-fastmetal5b-20260925/quality-*.txt`。

### 性能与资源（`--metrics-json` 实测，M2 Pro 32GB）

| 指标 | FastMetal-5B-QAD | 基线 1.3B |
|------|------------------|-----------|
| 分辨率 | 704×1280（2.4× 像素） | 480×832 |
| 帧 | 121 @24fps | 81 @16fps |
| 单 clip 墙钟 | 459-595s（去噪 8-9 min 为主体；prompt 编码 29s 且按 prompt 缓存复用） | ~240s（`EST_SECONDS_PER_CLIP`） |
| 峰值内存 | **11.42 GiB** | ~4 GiB（官方 3.87 GiB 口径） |

11.4 GiB 峰值对 32GB 机器余量充足，且落在官方"16GB+"档内——B-roll 生成可在本地全量承接，不触发云 GPU 路由。

## 评测过程发现（除评测结论外的独立产出）

### Bug：mlx_vlm 原生视频输入的陈旧结果串扰

同一进程内对第二支视频调用 `mlx_vlm.generate(video=...)` 会返回**与上一支逐字节相同**的分析（复现两次：正序/反序均复现；温度 0）；在新进程首调用也可能输出与视频无关的模板化幻觉（"人物行走"）。**抽帧路径（`extract_frames` → image 输入）完全正常**。生产管线的视频评分全部带 scene window（走抽帧路径）故未受影响；但任何不带 window 的多视频评分会拿到脏结果。建议：`vlm_analyzer.py` 的原生视频路径应默认改抽帧，或上游升级 mlx_vlm 后回归验证。本评测的两套评分均强制抽帧路径。

### 运维：FastMetal-5B-QAD 权重获取路线

hf-mirror.com 当日多次不可用（308 后无数据），Clash 代理对 `us.aws.cdn.hf.co` 的 xet-bridge 路由时通时断（1MB/s 且 76MB 即断），直连 43KB/s。**最终走 ModelScope 同名仓库**（`modelscope.cn/api/v1/models/FastVideo/FastMetal-5B-QAD`，aria2 16 线程直连 5.8MB/s）。权重 sha256 已对 HF API LFS oid 校验一致（`652c322e…b930a`）。注意：ModelScope 上的 `mlx_dit.safetensors` 与 HF 完全同物（sha256 实证），后续重装可直接走 ModelScope。5B 快照的 `text_encoder/`（11.4GB UMT5 分片）与 `vae/` 权重可跳过不下载：入口源码自身将 5B 的 text encoder 默认指向 1.3B 的同一 UMT5（已缓存），taehv 解码用 `~/.cache/fastvideo/taehv/taew2_2.pth`（sha256 钉值 `d053e216…74c559a` 已验证）。

## 替换路径（生产端口，本 issue 后续提交）

现有产出：`run_fastmetal5b.py`（评测驱动）、`fastmetal5b-jobs.json`（任务定义）、`score_eval.mjs`（claim gate 对评）、`quality_eval.sh`（四维画质矩阵）。生产化改造（独立提交）：

1. `lib/b-roll/mlx_wan22_batch.py`：5B 批量驱动（对齐 `mlx_wan_batch.py` 的 `[batch][results]` 契约；5B 无官方批量入口，需移植循环 + 内存 choreography：编码→DiT→去噪→卸载→解码）。
2. `runner.mjs`：模型档位选择（`BROLL_MODEL` 环境变量或 scene 数据驱动），5B 路径的 `--height 1280 --width 704 --num-frames 121 --fps 24` 竖屏默认。
3. `orchestrator.mjs`：winner 标签去掉硬编码模型串；`EST_SECONDS_PER_CLIP` 按档位区分（240s → 5B 约 600s）。
4. 回归：单 scene 生产链路冒烟。

## 来源

1. `fastvideo-spike/repo/examples/inference/basic/mlx_wan22_generate.py` — 5B 入口 CLI/内存编舞/prompt 缓存
2. `fastvideo-spike/repo/docs/getting_started/installation/mps.md` — 官方 5B 运行命令与 16GB+ 档位
3. `scripts/short-video/output/ant-lingbot-world-13b/b-roll-report.json` — 基线 prompt/seed/relevance
4. 本评测产物 `scripts/short-video/output/t2v-eval-fastmetal5b-20260925/`（gitignored）：4×mp4 + 4×metrics.json + eval-scores.json + quality-*.txt
5. HF API `models/FastVideo/FastMetal-5B-QAD/tree/main` — LFS oid/尺寸（sha256 校验基准）
6. ModelScope `FastVideo/FastMetal-5B-QAD` — 备用下载路线（sha256 与 HF 一致）
