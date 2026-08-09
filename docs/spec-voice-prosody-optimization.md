# Spec: Voice Quality & Prosody Optimization (4-Layer)

> Created: 2026-08-09
> Based on: Grill session (Round 1-3) + `docs/research/voice-prosody-hook-optimization.md`
> Phases: D+A → A-tune → B → C (sequential, each with user listen checkpoint)

---

## Problem Statement

TTS 生成的语音存在两个问题：
1. **电磁底噪/金属 artifact** — F5 生成音频经双重 MP3 编码（Python MP3@192k → FFmpeg MP3@192k）后叠加 artifact，听感有持续电子底噪
2. **Prosody 平淡** — F5 从单一参考音频学习 prosody，所有场景（hook/narrative/CTA）语调一致，缺乏层次变化，听感像机器人念稿

---

## Solution

分 4 层逐步优化，每层做完用户听成品再继续：

### Phase 1: 替换参考音频 + 音频清洗 (D + A-extension)
- 用用户录制的 `voice3.m4a`（prosody 更丰富）替换当前 `voice-sample-24k.wav`
- 在 `buildFilter()` 中新增音频清洗链：highpass + afftdn 降噪
- 消除双重 MP3 编码：Python 端输出 WAV，FFmpeg 端做最终 MP3 编码

### Phase 2: Rubberband 参数调优 (A-tune)
- 根据 Phase 1 听感反馈调整 per-scene prosody 参数
- 可能方向：如果 ref audio 自带 prosody 变化，rubberband 参数需减小

### Phase 3: 多参考音频系统 (B)
- 3 种参考音频：hook(高能量) / narrative(稳定) / CTA(温暖)
- F5 batch 脚本支持 per-scene ref audio（分组 batch）
- scene-data 自动映射 visualType → refStyle，可选 `refStyle` 字段 override

### Phase 4: 引擎评估对比 (C)
- 安装并测试 Kokoro、StyleTTS-V2（本地免费）
- 注册并测试 ElevenLabs Free Tier（API，每月 10k chars）
- 对比各引擎 prosody 控制能力，决定是否采用混合引擎策略

---

## User Stories

1. 作为视频观众，我希望听不到电子底噪/电磁声，这样不会觉得是 AI 生成的
2. 作为视频观众，我希望 hook 场景声音有能量和紧迫感，这样会被吸引继续看
3. 作为视频观众，我希望数据场景声音沉稳权威，这样会觉得信息可信
4. 作为视频观众，我希望 CTA 场景声音温暖柔和，这样会更愿意采取行动
5. 作为视频管线开发者，我希望参考音频可以轻松替换，这样迭代优化时不需要改代码
6. 作为视频管线开发者，我希望音频后处理包含降噪链，这样 F5 生成的 artifact 被自动清除
7. 作为视频管线开发者，我希望 F5 batch 脚本支持多参考音频，这样不同场景类型可以有不同 prosody
8. 作为视频管线开发者，我希望 scene-data 能指定 refStyle，这样特殊场景可以 override 默认映射
9. 作为视频管线开发者，我希望引擎选择是 per-scene 的，这样 hook 可以用 ElevenLabs 其他用 F5
10. 作为视频管线开发者，我希望引擎对比有标准化测试脚本，这样能客观评估各引擎 prosody 质量
11. 作为视频管线开发者，我希望中间文件用 WAV 而非 MP3，这样避免双重有损编码
12. 作为视频管线开发者，我希望音频清洗参数可配置，这样能针对不同引擎的 artifact 特征调整
13. 作为视频创作者，我希望每层优化后能听成品再决定下一步，这样不会浪费精力在无效优化上

---

## Implementation Decisions

### 1. 参考音频替换 (Phase 1 — D)

- `voice3.m4a` → 转为 `voice-sample-24k.wav`（24kHz mono WAV）
- ref-text: `Breaking news from China's AI scene. DeepSeek just paused its entire funding round. The reason? A leaked four-hour investor meeting. And that's the story we're breaking down for you today.`
- 旧文件保留为 `voice-sample-24k-old.wav`（备份）
- `voice-sample-ref-text.txt` 更新为新文本

### 2. 音频清洗链 (Phase 1 — A-extension)

在 `buildFilter()` 中，silenceremove 之前插入清洗链：

```
highpass=f=80,          // 去掉 80Hz 以下低频嗡嗡声
afftdn=nr=10:nf=-25,    // 自适应频域降噪，噪声底 -25dB
[现有 silenceremove/rubberband/atempo 链]
```

- 清洗参数通过 env var 可配置：`TTS_HIGHPASS`（默认 80）、`TTS_DENOISE`（默认 10）
- 设 `TTS_DENOISE=0` 可禁用降噪
- `TTS_HIGHPASS=0` 可禁用高通

### 3. 消除双重 MP3 编码 (Phase 1)

- `f5_mlx_batch_tts.py`: 输出 WAV 而非 MP3（`-c:a pcm_s16le` 替代 `libmp3lame`）
- `post-process.mjs`: 输入可能为 WAV 或 MP3，输出统一为 MP3@320k（提升比特率）
- `postProcessBatch()`: temp 文件后缀从 `.mp3` 改为 `.wav` 处理

### 4. Rubberband 参数调优 (Phase 2)

- 参数存储在 `PROSODY_PROFILES` 常量中，当前值：
  - hook: pitch=1.08, tempo=1.12
  - data: pitch=0.97, tempo=0.97
  - quote: pitch=1.0, tempo=0.95
  - cta: pitch=0.96, tempo=0.92
- Phase 1 听感反馈后调整，可能减小 pitch 幅度（因为新 ref audio 自带 prosody 变化）

### 5. 多参考音频系统 (Phase 3 — B)

**Ref audio 映射规则**（自动映射 + override）：
- `visualType === "hook"` → `ref-hook-24k.wav`
- `visualType === "cta"` 或 `scene.id === lastScene` → `ref-cta-24k.wav`
- 其他 → `ref-narrative-24k.wav`（= Phase 1 的 voice3）
- scene-data 可选 `refStyle: "hook" | "narrative" | "cta"` 字段 override

**F5 batch 脚本改造**：
- manifest 支持 per-scene `refAudio` + `refText` 字段
- 脚本按 refAudio 分组，每组 batch 调用 F5（模型加载 N 次，N = ref 种类数）
- 无 refAudio 字段的 scene 走默认 ref（env var）

**文件结构**：
```
assets/
  ref-hook-24k.wav      # 用户录制，高能量
  ref-narrative-24k.wav  # = Phase 1 的 voice3
  ref-cta-24k.wav        # 用户录制，温暖
  ref-hook-text.txt
  ref-narrative-text.txt
  ref-cta-text.txt
```

### 6. 引擎评估对比 (Phase 4 — C)

**安装**：
- Kokoro: `pip install kokoro` → 新 venv `~/.kokoro-env`
- StyleTTS-V2: `pip install StyleTTS2` → 新 venv `~/.styletts-env`
- ElevenLabs: API key in `.env.local`，npm package `elevenlabs`

**对比测试脚本**：
- `scripts/short-video/lib/tts/eval-engines.mjs`
- 输入：同一段 hook 文本
- 输出：各引擎生成的音频 + prosody 分析报告（pitch variance、tempo variance）
- 评估维度：prosody 自然度、声音克隆相似度、生成速度、成本

**混合引擎策略**（如果评估支持）：
- `registry.mjs` 支持 per-scene 引擎选择
- scene-data 可选 `engine: "elevenlabs" | "f5-mlx" | "kokoro"` 字段
- 默认：hook → ElevenLabs（如可用），其他 → F5-MLX

### 7. FFmpeg 路径

所有 FFmpeg/ffprobe 命令统一使用 `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`（支持 rubberband + libass），已在 `post-process.mjs` 中实现 [[memory:17862429060283302855]]。

---

## Testing Decisions

### 测试 seam

主要测试 seam：`scripts/short-video/__tests__/tts-post-process.test.mjs`（已有，扩展）

测试外部行为（buildFilter 输出的 filter string），不测 FFmpeg 实际执行。

### 测试模块

1. **`buildFilter()`** — 验证清洗链、prosody、atempo 的组合输出
2. **`getProsodyProfile()`** — 验证 visualType → profile 映射（已有，扩展）
3. **`getRefStyle()`** (新增) — 验证 visualType → refStyle 自动映射 + override 逻辑
4. **`groupScenesByRef()`** (新增) — 验证 scene 分组逻辑
5. **`selectEngineForScene()`** (新增, Phase 4) — 验证 per-scene 引擎选择

### Prior art

- `tts-post-process.test.mjs` 现有模式：mock `child_process.exec`，验证传入命令字符串
- `caption-utils.test.mjs`：纯函数测试模式

---

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `lib/tts/post-process.mjs` | buildFilter 增加清洗链 + 输出 320k | Medium | 核心后处理逻辑，所有引擎依赖。新增滤镜是追加式的，不影响现有 filter 链顺序。通过 env var 可禁用 |
| `f5_mlx_batch_tts.py` | 输出 WAV 替代 MP3 | Medium | 改变中间文件格式。下游 postProcessBatch 需适配 .wav 后缀。风险：如果 post-process 跳过，最终输出可能为 WAV（需确保最终输出仍为 MP3） |
| `lib/tts/f5-mlx.mjs` | 支持 per-scene ref audio + refStyle 映射 | Medium | 改变 generate() 内部逻辑。无 refStyle 字段时走默认 ref（向后兼容） |
| `lib/tts/types.mjs` | TTSEngine 接口可能扩展 | Low | 纯类型定义，无运行时影响 |
| `lib/tts/registry.mjs` | 支持 per-scene 引擎选择 (Phase 4) | Medium | 改变 generateTTS() 的引擎委派逻辑。无 engine 字段时走现有优先级（向后兼容） |
| `assets/voice-sample-24k.wav` | 替换为 voice3 | Low | 文件替换，不改代码。旧文件备份 |
| `assets/voice-sample-ref-text.txt` | 更新文本 | Low | 必须与新 wav 精确匹配 |
| `docs/video-workflow.md` | 更新 TTS 引擎表 + prosody 参数表 | Low | 文档同步 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | F5 生成 WAV → post-process 输出 MP3@320k | 最终输出为 MP3，无中间 MP3 | Medium | postProcessBatch 检测输入后缀，统一输出 MP3 |
| 2 | TTS_DENOISE=0 | buildFilter 不包含 afftdn 滤镜 | Low | env var 条件判断 |
| 3 | TTS_HIGHPASS=0 | buildFilter 不包含 highpass 滤镜 | Low | env var 条件判断 |
| 4 | 默认清洗参数（未设 env） | highpass=80 + afftdn=nr=10 | Low | 合理默认值，可禁用 |
| 5 | 清洗链 + silenceremove + rubberband + atempo 同时存在 | filter 链顺序正确：清洗 → silenceremove → rubberband → atempo | Medium | buildFilter 测试验证顺序 |
| 6 | 清洗链 + rubberband（F5 path, 无 silenceremove） | filter 链：highpass → afftdn → rubberband → atempo | Medium | buildFilter 测试验证 |
| 7 | 新 ref audio (voice3) 替换旧 ref | F5 生成的语音 prosody 有变化 | Low | 向后兼容，仅文件替换 |
| 8 | ref-text 与 ref-audio 不匹配 | F5 生成语音有泄漏/质量下降 | High | ref-text 从文件读取，确保精确匹配。测试验证文件内容 |
| 9 | Phase 3: scene 无 refStyle 字段 | 走 visualType 自动映射 | Low | 向后兼容 |
| 10 | Phase 3: scene 有 refStyle="hook" | 使用 ref-hook-24k.wav | Low | override 逻辑 |
| 11 | Phase 3: ref-hook-24k.wav 不存在 | fallback 到默认 ref + warning log | Medium | isAvailable 检查 + 优雅降级 |
| 12 | Phase 3: 所有 scene 都是同一 visualType | 只加载 1 次 F5 模型 | Low | 分组逻辑自动合并 |
| 13 | Phase 3: F5 batch manifest 有混合 refAudio/no-refAudio | 有 refAudio 的用指定 ref，无的用默认 | Medium | 分组逻辑正确处理 |
| 14 | Phase 4: ElevenLabs API key 未配置 | 跳过 ElevenLabs，走 F5 fallback | Low | registry 现有 isAvailable 模式 |
| 15 | Phase 4: scene 指定 engine="elevenlabs" 但引擎不可用 | fallback 到 F5 + warning | Medium | selectEngineForScene 降级逻辑 |
| 16 | Phase 4: Kokoro venv 未安装 | 跳过 Kokoro，走优先级链 | Low | registry 现有 isAvailable 模式 |
| 17 | postProcessBatch 输入 .wav 后缀（F5 新行为） | 正确处理，输出 .mp3 | Medium | 后缀检测逻辑 |
| 18 | postProcessBatch 输入 .mp3 后缀（XTTS 旧行为） | 仍然正确工作 | Low | 向后兼容 |
| 19 | 最终 MP3 比特率从 192k → 320k | 文件增大 ~67%，音质提升 | Low | 磁盘空间可接受 |
| 20 | 清洗链 afftdn 过度降噪导致语音失真 | 语音听起来"水下" | Medium | nr=10 是保守值；TTS_DENOISE env 可调低；Phase 1 听感验证 |

---

## Out of Scope

- 实时 TTS（流式生成）— 当前管线是 batch 模式，不需要实时
- TTS 引擎训练/微调 — 使用预训练模型
- 音频可视化分析工具 — 只需要频谱/音量检测，用 FFmpeg 命令行
- 字幕对齐改进 — `text-align.py` 不受 prosody/audio quality 影响
- 视频合成逻辑 — `assemble.mjs` 不受影响
- 多语言 TTS — 当前只用英文
- 语音克隆精度优化 — 使用现有 F5 克隆能力，不改进克隆本身

---

## Further Notes

### Phase 间依赖关系

```
Phase 1 (D+A-ext) → 听 → Phase 2 (A-tune) → 听 → Phase 3 (B) → 听 → Phase 4 (C) → 听
```

- Phase 2 依赖 Phase 1 的听感反馈（参数调优方向）
- Phase 3 依赖 Phase 2 确定的参数（B 加了多 ref 后 A 参数需重校）
- Phase 4 独立于 1-3，但放在最后因为需要用户注册 ElevenLabs（可并行）

### 用户需要做的操作

1. **Phase 1**: 确认 ref-text（已确认 ✅）
2. **Phase 3**: 录制 3 段不同风格参考音频（hook/narrative/CTA）
3. **Phase 4**: 注册 ElevenLabs Free Tier，提供 API key

### 与现有 ADR 的关系

- 无新 ADR 需要——所有决策都是现有 TTS 管线的增量优化，不涉及不可逆架构变更
- `docs/research/voice-prosody-hook-optimization.md` 是此 spec 的 research basis
