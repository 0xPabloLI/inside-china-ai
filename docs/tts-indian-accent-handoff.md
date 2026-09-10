# TTS 印度口音问题 — Handoff 文档

> **状态**：未解决，需更高级 agent 处理
> **创建时间**：2026-09-09
> **内容**：deepseek-v41-flash

## 问题描述

CosyVoice3-Kaggle-CUDA TTS 引擎生成的英文语音出现印度口音，与 2026-09-07 P100 实验样本的声音不一致。用户要求："按照之前实验时候的 cosyvoice3 kaggle p100 那段语音一摸一样的参数"。

## 基准样本（声音好的）

- **路径**：`scripts/short-video/assets/tts-comparison/cosyvoice3-kaggle-p100-cuda/`
- **文件**：
  - `cosyvoice3-hook-shock-en.wav`（11.88s）
  - `cosyvoice3-narrative-calm-en.wav`（11.72s）
  - `cosyvoice3-cta-call-en.wav`（7.6s）
- **生成时间**：2026-09-07（git commit `74dfcf5`）
- **summary.json**：只记录时长/RTF，**没记录 instruct text、ref audio、seed、CosyVoice git commit hash**

## 当前输出（声音差）

- **音频**：`scripts/short-video/output/deepseek-v41-flash/audio/scene-1.wav`
- **视频**：`scripts/short-video/output/deepseek-v41-flash/deepseek-*-short.mp4`
- **症状**：hook scene 一股印度口音，整体速度非常慢

## 做过的调试

### 1. 对比 kernel 推理参数

用 `git show 74dfcf5:scripts/short-video/kaggle/cosyvoice3_cuda_kernel.py` 对比初始版本和当前版本。

**初始版本推理调用**：
```python
cosyvoice.inference_instruct2(t["text"], instruct, ref_path, stream=False)
```
无 seed、无 speed、无 inference_vc。

**当前版本**（已恢复一致）：
```python
speed = t.get("speed")  # None when not in manifest
kwargs = {"stream": False}
if speed is not None: kwargs["speed"] = speed
cosyvoice.inference_instruct2(t["text"], instruct, ref_path, **kwargs)
```
当 manifest 无 speed 时等价于 `inference_instruct2(text, instruct, ref, stream=False)`，与初始版本一致。

### 2. 对比 adapter 后处理参数

初始版本和当前版本的后处理参数完全一致：
- `TTS_HIGHPASS=0`
- `TTS_DENOISE=0`
- `useSilenceFilter: false`（后改为 `true` 解决停顿问题）
- `resample: true`
- `prosody: null`（TTS_PROSODY 未设）

### 3. 我犯的错误

1. **自作主张加 `torch.manual_seed(20260907)`**：用户没要求固定 seed。这个特定 seed 锁定了印度口音。已去掉，改为只在 `TTS_SEED` env 设了才固定。
2. **传 `speed=1.0` 给 inference_instruct2**：初始版本不传 speed。CosyVoice3 的 `inference_instruct2` 的 speed 默认值可能不是 1.0，传 speed=1.0 改变了语速/音色。已改为不传 speed。
3. **用 `inference_vc` 替代 `inference`**：初始版本用 `inference`。已改回。

### 4. 恢复初始版本参数后还是印度口音

即使推理参数和后处理参数与初始版本完全一致，去掉 seed 后重新生成的 TTS 还是印度口音。说明问题不在这些参数。

## 可能原因（参数一致但声音不同）

1. **CosyVoice git clone 版本漂移**：kernel 第 66 行 `git clone https://github.com/FunAudioLLM/CosyVoice.git`，每次 clone 最新版。9/7 和 9/9 的 CosyVoice 代码可能不同，导致推理输出不同（口音/停顿）。
   - **验证方法**：在 Kaggle kernel 里加 `git -C /tmp/CosyVoice rev-parse HEAD` 记录 commit hash，对比 9/7 和 9/9 的 hash。
   - **修复方法**：pin CosyVoice 到特定 commit（`git clone && git checkout <hash>`）。

2. **CosyVoice3 模型权重更新**：模型从 Kaggle dataset `xPabloLI/cosyvoice3-model` 挂载。如果 dataset 内容更新了，模型权重可能不同。
   - **验证方法**：对比 dataset 文件的 md5 和 9/7 时的 md5。
   - **修复方法**：pin 模型版本。

3. **Kaggle 环境差异**：CUDA/torch/onnxruntime 版本可能不同。
   - **验证方法**：在 kernel 里记录 `torch.__version__`, `torch.version.cuda`, `onnxruntime.__version__`，对比 9/7 和 9/9。
   - **修复方法**：pin 依赖版本。

4. **Voice sample 变化**：`voice-sample-24k.wav` 可能被替换。
   - **验证方法**：对比 `voice-sample-24k.wav` 的 md5 和 9/7 时的 md5。
   - **修复方法**：恢复 9/7 的 voice sample。

5. **随机性**：无 seed 固定，每次推理结果不同。9/7 碰巧声音好，9/9 碰巧印度口音。
   - **验证方法**：跑多次 TTS，看声音是否随机变化。
   - **修复方法**：找到好 seed 并固定（但之前 seed 20260907 是印度口音，需要试其他 seed）。

6. **instruct text 差异**：`INSTRUCT_MAP` 可能改过。
   - **验证方法**：`git show 74dfcf5:scripts/short-video/lib/tts/cosyvoice3-kaggle-cuda.mjs` 对比 INSTRUCT_MAP。
   - **已验证**：INSTRUCT_MAP 未变。

## 关键文件

- **Kernel 模板**：`scripts/short-video/kaggle/cosyvoice3_cuda_kernel.py`
  - 推理代码在 `INFERENCE_CODE` r-string（约第 175-243 行）
  - `git clone https://github.com/FunAudioLLM/CosyVoice.git` — **每次 clone 最新版**
  - 模型：`FunAudioLLM/Fun-CosyVoice3-0.5B-2512`（从 Kaggle dataset `xPabloLI/cosyvoice3-model` 挂载）
- **Adapter**：`scripts/short-video/lib/tts/cosyvoice3-kaggle-cuda.mjs`
  - `INSTRUCT_MAP`（第 49-55 行）
  - `buildCV3CudaManifest`（第 82-102 行）
  - 后处理（第 268-300 行）
- **Voice sample**：`scripts/short-video/voice-samples/voice-sample-24k.wav`（通过 Kaggle dataset `xPabloLI/tts-ref-audio` 挂载）
- **初始版本**：`git show 74dfcf5:scripts/short-video/kaggle/cosyvoice3_cuda_kernel.py`
- **P100 基准样本**：`scripts/short-video/assets/tts-comparison/cosyvoice3-kaggle-p100-cuda/`

## 建议排查顺序

1. **先查 CosyVoice git commit hash**：在 kernel 里加 `git -C /tmp/CosyVoice rev-parse HEAD`，看 9/7 和 9/9 是否不同。如果不同，pin 到 9/7 的 commit。
2. **查 voice sample md5**：对比 `voice-sample-24k.wav` 和 9/7 时的版本。
3. **查模型权重 md5**：对比 Kaggle dataset 文件的 md5。
4. **查 Kaggle 环境版本**：记录 torch/CUDA/onnxruntime 版本。
5. **如果以上都一致**：问题可能是随机性，需要跑多次 TTS 找好 seed。

## 反复修改引入新问题的教训（2026-09-09 调试经历）

### 时间线

1. **初始版本**（seed 固定 20260907 + speed=1.0 + inference_vc）：只有印度口音，没有停顿/漏失/语速突变
2. **我去掉 seed 固定**：还是印度口音（随机性）
3. **我去掉 speed + 改 inference_vc→inference**：还是印度口音 + 出现停顿（CosyVoice 代码版本漂移）
4. **我开 silenceremove**：停顿好了，但 scene 4 多 3.65s 额外内容导致字幕漏失
5. **我裁剪 scene 4 尾部**：字幕漏失好了，但语速陡变 + 字幕对不上
6. **回退到步骤 1**：只有印度口音，其他问题消失

### 教训

- **不要同时改多个层面**：TTS 参数 + 后处理 + 裁剪互相影响，改一个引入另一个
- **先理解根因再改**：印度口音的根因是 CosyVoice 代码版本漂移或随机性，不是 seed/speed/inference_vc
- **每次改后充分验证**：不能只看部分 grep 结果就下结论
- **回退是有效策略**：当改出越来越多问题时，回退到只有原始问题的版本

### 当前回退版本参数

- kernel: `torch.manual_seed(20260907)` + `speed=1.0` + `inference_vc`
- adapter: `useSilenceFilter: false`
- 字幕修复保留：ttsReplacements 正确生成（normalize-tts-text.mjs）
- Circle 修复保留：`box="inside"` + padding 20/24px

## 相关 memory

- `project_cosyvoice3_mps_emotion_regression.md` — MPS/MLX emotion 不可修复，Kaggle P100 CUDA 为最终引擎
- `project-cosyvoice3-kaggle-p100-cuda-perf.md` — P100 CUDA 性能基准
- `feedback_tts_requirements_commercial_clone_emotion.md` — TTS 引擎选型要求