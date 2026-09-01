# Handoff: 短视频素材 prompt 质量 + FastVideo 生成参数优化

> Created: 2026-08-31 ｜ 状态：**方案已调研清楚，待新 session 实施**
> 上游 session：在 `scripts/short-video/experiments/fastvideo-spike/` 跑了 FastVideo MLX (Wan 1.3B) 文生视频 spike，
> 生成了 qwen4-preview 的 3 条 B-roll（path1/scene6、path2/scene5、path2/scene8），并回答了用户两个问题：
> (1) 有没有专用开源项目/skill 写场景→素材 prompt、推荐什么模型、prompt 要不要更多 context；
> (2) 现在生成参数是否最优、能否开 "max effort"。
> **本文自包含**——所有结论与证据已写回，新 session 无需回溯对话即可执行。

---

## 1. 背景与目标

用户在做 qwen4-preview 短视频，用 FastVideo MLX（本地 Apple Silicon）把 scene 文案生成 B-roll 视频素材。
两个待解决点：

1. **prompt 质量差**：生成的 B-roll 是抽象"科技辉光"，和具体 scene 数据（1/9 训练成本、8.6× 吞吐）对不上，
   用户原话"感觉和我的 scene 没关系"。
2. **参数是否最优**：用户以为开了 `mx.compile` 就能"常驻编译一次、多条 prompt 秒级"，现实不是；
   并问能否把生成质量拉到 "max effort"。

**目标**：让 B-roll 真正贴 scene（视觉隐喻对齐数据 + 品牌视觉），并在 M3 Max 内存约束内把生成质量尽量拉高。

---

## 2. 已确认事实（本 session 已用源码/实测核实）

### 2.1 编译复用 ≠ "秒级"（已实测，见 `mlx_wan_batch.py` 计时日志）
- job1 去噪 **314.9s**（含首次 trace），job2 去噪 **226.8s**（延迟解码后**复用**了编译图，省 ~88s trace）。
- 日志无 `falling back to eager` → `mx.compile` 确实跨 job 复用。
- 但每条 prompt 仍要跑完整 **3 步 DMD 去噪**（1.3B DiT @ 832×480×81 帧），每步 ~60–90s → **每条 clip 分钟级**。
- 根因：原脚本"去噪→解码"循环里 `taehv` 解码后端每次 `mx.clear_cache()` 释放编译图
  （`repo/fastvideo/mlx_runtime/vaes/wanvae.py` → `memory.py`），导致每条 job 重 trace。
  修复：改成"先全部去噪、最后统一解码"（`mlx_wan_batch.py` 已是该版本）。
- **结论**：batching 只能省"模型加载(~0.05s) + 一次性 trace(~88s)"，省不掉 3 步推理。"秒级多条"对 1.3B 在 M3 Max 不成立。

### 2.2 FastVideo 自带 prompt 增强，但本地模型太弱
- `repo/fastvideo/mlx_runtime/prompt_enhance.py`：`--enhance-prompt` 有两后端：
  - `template`：确定性补电影感词，但**只在 prompt 缺相机/光提示且 <160 字符时才展开**（`_already_rich` 阈值）。
  - `mlx-lm`：调本地 `Qwen2.5-0.5B-Instruct-4bit` 扩写，`max_tokens=128`、`temp=0.6` —— **模型太小，扩写能力有限**。
- **结论**：不要用 0.5B 本地 enhancer 当主力；用强 LLM 预写 rich prompt 更可靠。

### 2.3 当前 3 条 prompt（贴 scene 但太薄）
| 输出 | scene | 当前 prompt |
|---|---|---|
| path1_scene6_architecture | scene6 混合架构（3 层 memory + 1 层 sparse-attention） | "hybrid neural network architecture: three stacked memory layers… one sparse-attention layer firing bright lookup beams…" |
| path2_scene5_cost | scene5 训练成本 = Qwen3.7-Plus 的 1/9 | "AI training cost collapsing, nine stacked neon blocks compressing into a single bright block…" |
| path2_scene8_throughput | scene8 百万上下文 prefill 吞吐 8.6× | "text tokens racing through a neural pipeline… throughput meters climbing…" |

只有抽象隐喻，无品牌色、无参考资产、无镜头/负向约束 → 生成结果不可控、不像你的内容。

---

## 3. 调研结论（Web Deep Research，2026-08-30/31，三角验证）

### 3.1 场景→素材 prompt 的专用开源项目 / skill
| 项目 | 类型 | 适用 | 许可 |
|---|---|---|---|
| **AutoVio** [1] | 开源管道 + MCP（`autovio-mcp`，25+ 工具，接 Claude/Cursor） | 最贴"文本→LLM 写逐场景剧本→每场景出图→图动画成视频" | **PolyForm Noncommercial 1.0.0**（非商用！你的新闻站商用要避开） |
| **Scene Creator** (CoriChui) [Web] | prompt 工具 | 只产出视频 prompt（给 Sora/Kling） | 看仓库 |
| **Promptist** (microsoft/LMOps) [7] | 学术/RL | 把短 prompt 自动优化成"模型偏好 prompt"的概念奠基 | MIT |
| **Prompt-A-Video** (arXiv 2412.15156) [5] | 论文 | **文生视频专用** prompt 适配：图那套模板对 T2V 不够，需补运动/时序结构 | 论文 |
| **ComfyUI MCP server** (joenorton) [8] | MCP | agent 用本地 ComfyUI 迭代生成/精修图、音频、视频 | — |
| **FastVideo `dreamverse` 内 App** [repo] | 本地代码 | 自带 `PromptEnhancer`（rewrite_model / temperature / system_prompt 可配） | 随仓库 |

### 3.2 推荐模型
- **写 prompt 的 LLM（prompt-writer）**：用**强模型**吃场景 context —— Claude（Opus/Sonnet）、GPT-4o、Gemini 2.5/3。
  它们懂摄影语言，能把"语音稿 + 具体数据 + 品牌色 + 参考资产 + 镜头 + 负向"揉成结构化、Wan 偏好的 prompt。
- **生成模型（若换掉本地 1.3B）**，2026-03 对比 [2]：
  - 画质：**LTX 2.3**（22B，原生 4K，时间一致性最佳，需 24–80GB VRAM）
  - 速度：**Helios**（14B，单 H100 实时 19.5 FPS，Apache 2.0）
  - 性价比/消费级：**Wan 2.2**（16GB，动漫/风格化最强）
  - 电影感：**HunyuanVideo**（13B，但 40GB+ 且**许可证对商用有限制**）
  - ⚠️ M3 Max 本地只能跑 FastVideo MLX / Wan 的 MLX 端口；换大模型要 GPU，且须按 AGENTS.md
    "推理参数不跨模型借鉴"重新核它自己的默认步数/CFG。

### 3.3 prompt 要不要更多 context？——**要，这是"和 scene 没关系"的根因**
证据：[3] FastVideo `_already_rich` 只在 prompt 稀疏时才补词、rich prompt 原样保留；
[5] T2V prompt 需补运动/时序；[6] 结构化 context-rich 指令显著提升遵循度。
**该喂给 prompt-writer 的 context**（见 §4 模板）：语音稿/具体数据点、品牌视觉、参考资产描述、镜头语言、负向、目标模型。

### 3.4 生成参数有没有 "effort / max effort"？——**没有这个参数名**
真实画质旋钮（来自 `repo/examples/inference/basic/mlx_wan_prompt_to_video.py` 源码 [4]）：

| 旋钮 | 默认 | "拉满画质"怎么设 | 代价 |
|---|---|---|---|
| `--refine`（两遍 DMD：低清 + 高清 refiner） | 关 | 开 | 显存翻倍，**M3 Max 大概率 OOM** |
| `--decode-backend` | `taehv`（快/低显存） | `wan-vae`（高保真） | 更慢更吃显存 |
| `--enhance-prompt` | 关 | 开 | 小模型扩写有限 |
| `--mlx-quantization` | `int8` | `none`（全精度） | 显存 ×~2，可能爆 |
| `--max-sequence-length` | 512 | 提 512+ | 防 rich prompt 截断（但 prompt 通常不到 512 token） |
| `--num-inference-steps` / `--dmd-denoising-steps` | 3 / `1000,757,522` | DMD 蒸馏模型加步数**通常反伤质**，别乱加 | — |
| `--fast` / `--fast-spatial` | 关 | 用 `--fast-spatial`（质量路径）而非 `--fast`（RIFE 插帧=降质） | — |

**结论**：当前是默认档（速度/显存最优，非画质最优）。"max effort"在 M3 Max 基本不可行
（refine + wan-vae + 全精度超 32GB）。**性价比最高真改进**：强 LLM 预写 rich prompt + 开 `--enhance-prompt` +
保持 int8/taehv（不爆内存）。

---

## 4. 方案（任务拆分 + 完成标准）

### 任务 A：重写 qwen4-preview 的 `aiVideo` prompt（核心，立竿见影）
- **输入**：`scripts/short-video/content/qwen4-preview/scene-data.mjs`（含 `aiVideo` 字段）；
  品牌视觉见 `docs/brand-system.md`（深蓝/青色、技术感）；参考资产 `scripts/short-video/assets/qwen-architecture.png` 等。
- **动作**：用强 LLM（Claude/GPT-4o/Gemini）按以下模板为每条需出视频的 scene 重写 `aiVideo` prompt，
  并对需要静态配图（架构图/数据图）的 scene 补 `aiImage` prompt：

  ```
  [SUBJECT] <scene 讲什么，带上具体数据点，如 "training cost = 1/9 of Qwen3.7-Plus">
  [VISUAL METAPHOR] <具体可生成的物体/场景，不要"abstract glow">
  [BRAND] deep blue / cyan palette, technical aesthetic (见 docs/brand-system.md)
  [REFERENCE] <参考资产概念，如 qwen-architecture.png 的层结构>
  [CAMERA] <景别 + 运镜 + 镜头，如 "close-up, slow orbital, 35mm anamorphic">
  [MOTION] <时间维度上什么在动>
  [LIGHTING] <布光>
  [NEGATIVE] no hands, no text, no watermark, no UI, no human face
  [TARGET MODEL] FastVideo / Wan（用 Wan 偏好的词序）
  ```
- **关键约束**：T2V **生成不了字面数字**（"1/9""8.6×"）。具体数字放**画面字幕**（Remotion 模板），
  不要指望视频生成去"演"数字。prompt 只负责视觉隐喻与氛围。
- **完成标准**：scene-data 中每条 video scene 的 `aiVideo` 含上述 8 个维度；
  抽象辉光类措辞清零；新增的 `aiImage`（如有）同样结构化。

### 任务 B：定一份 M3 Max 安全的 FastVideo 参数档（写入 spike 脚本 / 文档）
- **推荐档（Tier A，M3 Max 可跑）**：`--num-inference-steps 3 --mlx-quantization int8
  --decode-backend taehv --enhance-prompt --enhance-prompt-backend mlx-lm --max-sequence-length 512`
  （或：若任务 A 已预写 rich prompt，可不开 enhance，直接喂 rich prompt）。
- **Max-effort 档（Tier B，仅 GPU/大显存）**：Tier A + `--refine` + `--decode-backend wan-vae` + `--mlx-quantization none`。
  在 M3 Max 标注"会 OOM，需验证或放弃"。
- **动作**：把这两档写成 `mlx_wan_batch.py` 的可选 preset（或 `scripts/short-video/` 下的小说明），
  并更新 `docs/video-workflow.md` 的 FastVideo 参数段。
- **完成标准**：两档参数在脚本内可一键切换；Tier B 明确标注内存前提；`docs/video-workflow.md` 同步。

### 任务 C（可选）：做个 "scene → 素材 prompt" 生成器 / skill
- 把任务 A 的"强 LLM + 模板 + 品牌规范 + 参考资产"固化为一个可复用脚本或 skill：
  输入 scene-data + brand-system + 参考资产目录 → 输出 `aiVideo`/`aiImage` prompt。
- 参考 [1][8] 的 MCP/agent 思路，但**不要直接引 AutoVio**（非商用许可）。
- **完成标准**：给定任意 qwen 系列 scene-data，能产出结构化素材 prompt；或明确判定"当前手动写更划算，不做"。

### 任务 D（可选）：评估换生成模型
- 若用户对 1.3B 画质不满意，按 [2] 在 GPU 环境评估 LTX 2.3 / Wan 2.2 / Helios，
  **先核各自官方默认推理参数**再决定。M3 Max 本地不在此范围。
- **完成标准**：给出"是否换模型 + 换哪个 + 参数从哪查"的明确结论，或标注"维持本地 FastVideo"。

---

## 5. 验收标准

1. **任务 A**：重渲染 qwen4-preview 的 3 条 B-roll（path1/scene6、path2/scene5、path2/scene8），
   人工核对画面隐喻是否对齐 scene 数据 + 品牌色；抽象辉光措辞已清零。
2. **任务 B**：Tier A 参数在 M3 Max 实跑通（3 条 clip 出片，不 OOM）；
   Tier B 标注内存前提或实测 OOM 后标注"放弃"。
3. **任务 C/D（如做）**：见各任务完成标准。
4. **文档**：`docs/video-workflow.md` 的 FastVideo 参数段 + 素材 prompt 写法更新到位。
5. **验证**：`npm run lint && npx tsc --noEmit` 通过（若改了 `scripts/short-video/` 代码）；
   spike 改动属 `experiments/`（gitignored），无需 lint。

---

## 6. 风险与开放问题

- **许可**：AutoVio 非商用；HunyuanVideo 商用受限。商用平台选 LTX 2.3 / Wan 2.2 / Helios（Apache 2.0 类）。
- **内存**：M3 Max 32GB + swap 已吃紧；Tier B（refine/wan-vae/全精度）大概率 OOM，需先验证。
- **模型 ckpt 位置**：spike 用的 `/tmp/fastmetal_model` 在 /tmp，可能已被清；重新跑需从 HF cache 拉或重下。
- **"秒级"预期**：用户需接受"本地 1.3B = 每条分钟级"是硬件上限，不是参数能解决的。
- **T2V 不演数字**：具体数据必须进字幕层，不在视频 prompt 层。

---

## 7. 来源

1. AutoVio — https://github.com/Auto-Vio/autovio （场景→图→视频管道，MCP；PolyForm Noncommercial）
2. Apatero, "Open Source T2V Models Compared 2026", 2026-03-27 — https://apatero.com/blog/text-to-video-open-source-models-compared-2026
3. 本地源码 `repo/fastvideo/mlx_runtime/prompt_enhance.py`（`_already_rich` 160 字符阈值、template/mlx-lm 后端）
4. 本地源码 `repo/examples/inference/basic/mlx_wan_prompt_to_video.py`（refine / decode-backend / fast-spatial / quant / max-sequence-length）
5. Prompt-A-Video, arXiv 2412.15156 — https://arxiv.org/pdf/2412.15156v1
6. upuply, "Text-to-Video Prompt Engineering" — https://www.upuply.com/blog/text-to-video-prompt
7. microsoft/LMOps (Promptist) — https://github.com/microsoft/LMOps
8. comfyui-mcp-server (joenorton) — https://www.mcpworld.com/en/detail/33cb193e1c10eafb04fd738e4f8a7a69

---

## 8. 关联文件 / 目录（新 session 起点）

- Spike 脚本与日志：`scripts/short-video/experiments/fastvideo-spike/`（`mlx_wan_batch.py`、`jobs.json`、`output_mirror/*.mp4`）
- FastVideo 源码：`scripts/short-video/experiments/fastvideo-spike/repo/`
- 待改 scene-data：`scripts/short-video/content/qwen4-preview/scene-data.mjs`
- 品牌规范：`docs/brand-system.md`
- 管线文档：`docs/video-workflow.md`、`docs/content-pipeline.md`
- 参考资产：`scripts/short-video/assets/qwen-architecture.png`、`qwen-throughput.png`
