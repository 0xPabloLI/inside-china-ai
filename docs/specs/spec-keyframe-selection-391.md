# Spec: #391 VLM 长视频关键帧选帧实验（TMRoPE walk around）

> 2026-09-27 · R2（管线代码可切换实验 + 真模型基准，默认行为不变）· 研究依据 `docs/research/keyframe-extraction-research.md`

## 1. 问题

MiniCPM-o 无时序编码（TMRoPE 不可移植，HANDOFF §二.5），当前 `_extract_minicpm_frames`（vlm_analyzer.py:745）经 mlx_vlm `resolve_video_inputs` 均匀采样 16 帧 @2fps：静态画面浪费帧预算、高密度场景帧不足（用户在 361 session 明确质疑过 16 帧上限）。

## 2. 目标

把帧提取做成**可切换策略**并用真模型基准产出决策数据；默认行为在本票内**保持 uniform**（切默认由实验数据裁决后另行提交）。

## 3. 方案决策

- **D1 策略开关**：`vlm_analyzer.py` 新增 CLI/IPC 参数 `frame_strategy`（`uniform`（默认，现状逐字节等价）/ `scene`）。scene 策略在 Python 侧用 ffmpeg `select` 滤镜取帧：`gt(scene,0.08)+eq(n,0)+not(mod(t,8))`，480p 下采样，vfr pipe 解码为 PIL Image——研究配方，本地已冒烟（0.36s/11帧@30s）。
- **D2 参数化**：`max_frames`（cap，默认 16 不变）与 `sample_fps`（uniform 解码率，默认 2.0 不变）提升为可传参；scene 策略下 cap 生效、sample_fps 不适用。
- **D3 每窗生效**：与 #360 分窗共存——scene 策略在每个窗口的 [startMs,endMs] 段内独立执行（-ss/-t 切段后跑 select），fallback `mod(t,8)` 以窗口起点对齐。
- **D4 实验矩阵**（bench 脚本，不入生产路径）：素材 = HANDOFF `.scratch/len-compare/` 的 content_ABC_av.mp4（15s+音频）、content_ABCx2_30s.mp4（30s），外加 1 个真实 >20s 素材（output/ 下有则用，无则注明）；配置 = uniform(16@2, 现状基线) / uniform(32@2) / uniform(32@1) / uniform(64@1) / scene(cap16) / scene(cap32)；输出完整原始材料：逐帧时间戳列表、最终 prompt、模型输出全文、端到端时延、帧提取耗时。**导出原始输出由用户亲自判断**（361 遗留偏好 §六.4）。
- **D5 focus_detector YuNet 旁路评估**：不动生产代码；下载 opencv_zoo face_detection_yunet onnx（MIT，~345KB）至 scratch，对 bench 素材抽帧做 Haar vs YuNet 并排检测（检出数/置信度/耗时），产出对比数据供升级决策。

## 4. 场景

| # | 场景 | 预期 |
|---|---|---|
| S1 | `frame_strategy` 缺省/`uniform` | 输出与现状逐帧一致（回归基线） |
| S2 | `scene` 策略 + 静态循环素材 | 帧数 < cap（切换少，兜底帧兜住覆盖） |
| S3 | `scene` 策略 + 高密度切换素材 | 帧数逼近 cap，取到切换后帧 |
| S4 | `scene` + >30s 分窗素材 | 每窗独立选帧，合并契约不变（#360 八字段） |
| S5 | 未知参数值 | 报错拒绝启动（fail-fast，同现有参数风格） |
| S6 | bench 产物 | 每配置一份 JSON+原始文本，路径清单交用户 |

## 5. 非目标

- 时间戳文本标记进 prompt（MiniCPM-o 无时序训练，未验证）
- AKS/神经选帧（无 query 场景，远期候选）
- Qwen3-VL native 路径（原生视频输入，不经过帧提取）
- 更换默认引擎/采样默认值（本票只产数据，不裁决）

## 6. 验收

- [ ] 全量 vitest + pytest 过，coverage 不低于棘轮；`frame_strategy` 缺省路径有回归断言（S1）
- [ ] bench 原始产物落 `.scratch/keyframe-bench/results/`（gitignored）并在报告中给路径清单
- [ ] 真实模型跑通全部矩阵配置（mlx-vlm venv），无 OOM/挂死
- [ ] YuNet 并排检测数据产出（不做生产切换）
