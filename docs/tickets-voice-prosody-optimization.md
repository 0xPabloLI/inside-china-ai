# Tickets — Voice Quality & Prosody Optimization

> 基于 `docs/spec-voice-prosody-optimization.md` 拆分。每个 ticket = 一个可独立验证的切片。
> Phase 间串行（每 Phase 后用户听感 checkpoint），Phase 内 ticket 可并行。

---

## Ticket 依赖图

```
Phase 1:
  VP-1 (替换 ref audio) ──────┐
  VP-2 (音频清洗链 + 双重编码修复) ─┤
  VP-3 (F5 batch WAV 输出) ────┘
                               ↓
                         [用户听感 checkpoint 1]
                               ↓
Phase 2:
  VP-4 (rubberband 参数调优)
                               ↓
                         [用户听感 checkpoint 2]
                               ↓
Phase 3:
  VP-5 (refStyle 映射纯函数) ─┐
  VP-6 (F5 batch 多 ref 分组) ─┤
  VP-7 (f5-mlx.mjs 集成) ──────┘
                               ↓
                         [用户听感 checkpoint 3]
                               ↓
Phase 4:
  VP-8 (Kokoro 安装+适配器) ──┐
  VP-9 (ElevenLabs 适配器) ────┤
  VP-10 (引擎对比脚本) ────────┤
  VP-11 (per-scene 引擎选择) ──┘
                               ↓
                         [用户听感 checkpoint 4]
```

---

## Phase 1: 替换参考音频 + 音频清洗

### VP-1: 替换 F5 参考音频

**目标**：用 voice3.m4a 替换当前 ref audio，更新 ref-text。

**文件**：
- `scripts/short-video/assets/voice-sample-24k.wav`（替换）
- `scripts/short-video/assets/voice-sample-24k-old.wav`（备份旧文件）
- `scripts/short-video/assets/voice-sample-ref-text.txt`（更新文本）

**任务**：
1. 备份旧文件：`cp voice-sample-24k.wav voice-sample-24k-old.wav`
2. 转换 voice3.m4a → 24kHz mono WAV：`ffmpeg -y -i voice3.m4a -ar 24000 -ac 1 -c:a pcm_s16le voice-sample-24k.wav`
3. 更新 ref-text 文件为：`Breaking news from China's AI scene. DeepSeek just paused its entire funding round. The reason? A leaked four-hour investor meeting. And that's the story we're breaking down for you today.`
4. 验证：ffprobe 确认新文件 24kHz mono WAV，时长 10-15s

**依赖**：无
**完成标志**：新 ref audio + ref-text 就位，`f5-mlx.mjs` 无需改动即可使用新 ref

---

### VP-2: 音频清洗链 + 输出比特率提升

**目标**：在 `buildFilter()` 中新增 highpass + afftdn 降噪链，输出比特率从 192k 提升到 320k。

**文件**：
- `scripts/short-video/lib/tts/post-process.mjs`（修改 `buildFilter` + `postProcessAudio`）
- `scripts/short-video/__tests__/tts-post-process.test.mjs`（扩展测试）

**任务**：
1. `buildFilter()` 在所有现有滤镜之前插入清洗链：
   - `highpass=f={TTS_HIGHPASS || 80}` — 可通过 env var 禁用（设 0）
   - `afftdn=nr={TTS_DENOISE || 10}:nf=-25` — 可通过 env var 禁用（设 0）
2. `postProcessAudio()` 输出比特率从 `-b:a 192k` 改为 `-b:a 320k`
3. 测试覆盖场景 #2-#6, #20（见 spec 场景矩阵）

**依赖**：无（与 VP-1/VP-3 并行）
**完成标志**：`npx vitest run tts-post-process.test.mjs` 全绿

---

### VP-3: F5 batch 脚本输出 WAV（消除双重编码）

**目标**：`f5_mlx_batch_tts.py` 输出 WAV 而非 MP3，消除双重有损编码。

**文件**：
- `scripts/short-video/f5_mlx_batch_tts.py`（修改输出格式）
- `scripts/short-video/lib/tts/post-process.mjs`（`postProcessBatch` 适配 .wav 输入）
- `scripts/short-video/lib/tts/f5-mlx.mjs`（manifest output 字段改 .wav）

**任务**：
1. `f5_mlx_batch_tts.py`：WAV→MP3 转换步骤删除，直接输出 WAV（`-c:a pcm_s16le`）
2. `postProcessBatch()`：检测输入后缀，如果是 `.wav` 则 processed 文件后缀为 `-processed.wav`，输出仍为 `.mp3`
3. `f5-mlx.mjs`：manifest 中 `output` 字段从 `scene-{id}.mp3` 改为 `scene-{id}.wav`，但最终 `audioPath` 仍指向 `.mp3`（post-process 后）
4. 测试覆盖场景 #1, #17, #18, #19

**依赖**：无（与 VP-1/VP-2 并行）
**完成标志**：F5 生成的中间文件为 WAV，最终输出为 MP3@320k，无双重编码

---

## Phase 2: Rubberband 参数调优

### VP-4: Rubberband 参数调优

**目标**：根据 Phase 1 听感反馈调整 `PROSODY_PROFILES` 参数。

**文件**：
- `scripts/short-video/lib/tts/post-process.mjs`（修改 `PROSODY_PROFILES` 常量）
- `scripts/short-video/__tests__/tts-post-process.test.mjs`（更新预期值）

**任务**：
1. 等待 Phase 1 用户听感反馈
2. 根据反馈调整参数（预期方向：新 ref audio 自带 prosody 变化，rubberband 幅度需减小）
3. 更新测试中的预期 filter string

**依赖**：Phase 1 完成 + 用户反馈
**完成标志**：参数更新 + 测试全绿 + 用户确认听感改善

---

## Phase 3: 多参考音频系统

### VP-5: refStyle 映射纯函数 + 测试

**目标**：实现 visualType → refStyle 自动映射 + override 逻辑。

**文件**：
- `scripts/short-video/lib/tts/post-process.mjs`（新增 `getRefStyle()` 函数）
- `scripts/short-video/__tests__/tts-post-process.test.mjs`（新增测试）

**函数签名**：
```javascript
getRefStyle(visualType, refStyleOverride?) → "hook" | "narrative" | "cta" | null
```

**映射规则**：
- `visualType === "hook"` → `"hook"`
- `visualType === "cta"` → `"cta"`
- 其他 → `"narrative"`
- `refStyleOverride` 非空时覆盖自动映射

**测试覆盖场景 #9, #10**

**依赖**：无（纯函数，可提前开发）
**完成标志**：`npx vitest run tts-post-process.test.mjs` 全绿

---

### VP-6: F5 batch 脚本支持多参考音频

**目标**：`f5_mlx_batch_tts.py` 支持按 ref audio 分组 batch 处理。

**文件**：
- `scripts/short-video/f5_mlx_batch_tts.py`（重写 manifest 处理逻辑）

**任务**：
1. manifest 支持 per-scene `refAudio` + `refText` 字段
2. 脚本按 `refAudio` 分组，每组 batch 调用 F5（模型加载 N 次）
3. 无 `refAudio` 字段的 scene 走默认 ref（env var `F5_REF_AUDIO` / `F5_REF_TEXT`）
4. 测试覆盖场景 #11, #12, #13

**依赖**：VP-3（WAV 输出格式已就位）
**完成标志**：脚本能处理混合 ref manifest，分组正确

---

### VP-7: f5-mlx.mjs 集成多 ref 逻辑

**目标**：`f5-mlx.mjs` 的 `generate()` 支持 per-scene ref audio 选择。

**文件**：
- `scripts/short-video/lib/tts/f5-mlx.mjs`（修改 generate 逻辑）
- `scripts/short-video/lib/tts/types.mjs`（可能扩展接口）

**任务**：
1. 在 `generate()` 中，为每个 scene 调用 `getRefStyle(scene.visualType, scene.refStyle)` 确定 ref
2. 按 ref 分组 scene，每组构建子 manifest（含 `refAudio` + `refText` 字段）
3. 多次调用 F5 batch 脚本（每组一次）
4. ref 文件不存在时 fallback 到默认 + warning log（场景 #11）
5. 测试覆盖场景 #12, #13

**依赖**：VP-5（getRefStyle 函数）+ VP-6（batch 脚本支持）
**完成标志**：多 ref scene-data 能正确生成不同 prosody 的音频

---

## Phase 4: 引擎评估对比

### VP-8: Kokoro 安装 + 适配器

**目标**：安装 Kokoro TTS，创建引擎适配器。

**文件**：
- `scripts/short-video/lib/tts/kokoro.mjs`（新建适配器）
- `scripts/short-video/kokoro_batch_tts.py`（新建 batch 脚本）

**任务**：
1. 安装 Kokoro：`python3 -m venv ~/.kokoro-env && source ~/.kokoro-env/bin/activate && pip install kokoro`
2. 创建 batch 脚本（类似 `f5_mlx_batch_tts.py` 的结构）
3. 创建适配器（实现 `isAvailable()` + `generate()`）
4. 注册到 `registry.mjs`

**依赖**：无
**完成标志**：`TTS_ENGINE=kokoro node main.mjs` 能生成音频

---

### VP-9: ElevenLabs 适配器

**目标**：创建 ElevenLabs API 引擎适配器。

**文件**：
- `scripts/short-video/lib/tts/elevenlabs.mjs`（新建适配器）
- `.env.local`（添加 `ELEVENLABS_API_KEY`）

**任务**：
1. 安装 npm package：`npm install elevenlabs`
2. 创建适配器，实现：
   - `isAvailable()`：检查 `ELEVENLABS_API_KEY` 是否存在
   - `generate()`：per-scene 调用 API，支持 `voice_id` + `stability` + `style` + `similarity_boost` 参数
3. hook scene 用高 style（0.8）+ 低 stability（0.3）→ 更多情绪
4. 其他 scene 用中 style（0.5）+ 高 stability（0.7）→ 稳定
5. 注册到 `registry.mjs`
6. 测试覆盖场景 #14（API key 未配置时 fallback）

**依赖**：用户提供 API key
**完成标志**：`TTS_ENGINE=elevenlabs node main.mjs` 能生成音频

---

### VP-10: 引擎对比脚本

**目标**：创建标准化对比脚本，用同一段文本测试所有引擎。

**文件**：
- `scripts/short-video/eval-tts-engines.mjs`（新建）

**任务**：
1. 输入：一段标准 hook 文本 + 一段 narrative 文本
2. 对每个可用引擎生成音频
3. 用 FFmpeg 分析 pitch variance、tempo、noise floor
4. 输出对比表格（markdown 格式）

**依赖**：VP-8 + VP-9（引擎适配器就位）
**完成标志**：`node eval-tts-engines.mjs` 输出各引擎对比报告

---

### VP-11: Per-scene 引擎选择

**目标**：`registry.mjs` 支持 per-scene 引擎选择。

**文件**：
- `scripts/short-video/lib/tts/registry.mjs`（修改 `generateTTS` 逻辑）

**任务**：
1. scene-data 可选 `engine` 字段：`"elevenlabs" | "f5-mlx" | "kokoro"`
2. `generateTTS()` 按 engine 分组 scene，每组用不同引擎生成
3. 无 `engine` 字段时走默认优先级（现有行为）
4. 引擎不可用时 fallback + warning（场景 #15）
5. 测试覆盖场景 #15, #16

**依赖**：VP-8 + VP-9（引擎适配器就位）
**完成标志**：混合引擎 scene-data 能正确生成音频

---

## 里程碑

| 里程碑 | Tickets | 用户操作 |
|--------|---------|---------|
| Phase 1 完成 | VP-1, VP-2, VP-3 | 听成品，反馈电磁声 + prosody |
| Phase 2 完成 | VP-4 | 听成品，确认 prosody 改善 |
| Phase 3 完成 | VP-5, VP-6, VP-7 | 录 3 段 ref audio；听成品 |
| Phase 4 完成 | VP-8, VP-9, VP-10, VP-11 | 注册 ElevenLabs；听对比，选引擎 |
