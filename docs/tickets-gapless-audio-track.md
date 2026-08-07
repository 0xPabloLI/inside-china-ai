# Tickets: 无间隙连续音轨 + 终片音频同步验证

> Spec: `docs/spec-gapless-audio-track.md`
> 依赖顺序执行，每张票独立可验证。

---

# 01 — WAV 读写（`lib/audio/wav.mjs`）

**What to build:** s16 PCM mono WAV 的读写原语，作为 track 构建与终检的公共底座。

**Blocked by:** None

**Status:** done

- [x] `buildWavBuffer(samples, sampleRate)` 纯函数 → Buffer（44 字节 RIFF 头 + 数据）
- [x] `writeWavPcm(path, samples, sampleRate)` / `readWavPcm(path)` → `{sampleRate, samples: Float32Array}`
- [x] 非 s16 / 多声道输入 → 明确抛错
- [x] round-trip 单测（写→读全等）+ 头字段断言
- [x] （审查后新增）`decodeToWavFile(input, output, rate)` —— 子系统唯一 ffmpeg 解码桥，track 与 sync 共用

---

# 02 — FFT 互相关（`lib/audio/fft.mjs`）

**What to build:** radix-2 FFT 与 `findOnset(haystack, needle, sampleRate)`——在长音轨中定位一段已知音频的实际起点。

**Blocked by:** 01

**Status:** done

- [x] `fft(re, im)` 就地 radix-2（位反转 + 蝶形）
- [x] `findOnset`：补零到下一 2 幂，`ifft(fft(hay)×conj(fft(needle)))`，argmax → `{sample, seconds}`
  - 实施记录：逆变换用 conj-FFT-conj（两次正变换会得到时间反转结果，峰值落在 N−onset）
- [x] needle 长于 haystack → 抛错
- [x] 合成信号单测：已知偏移的噪声/正弦突发，起点偏差 ≤2 样本；非 2 幂长度；DC/幅度差异鲁棒

---

# 03 — 连续 PCM 音轨（`lib/audio/track.mjs`）

**What to build:** 把各 scene 音频拼成一根样本级精确、长度 == Σ clipDuration 的连续音轨。

**Blocked by:** 01, 02

**Status:** done

- [x] `assembleTrackPcm(scenePcms, ttsDurations)` 纯函数：每段目标样本数 `round(sceneClipDuration(d)×44100)`，超长抛错
- [x] `buildVoiceoverTrack({sceneAudioPaths, ttsDurations, outputPath})` 胶水：经 `decodeToWavFile` 解码（44.1k mono s16）→ 拼接 → 写文件，临时文件自动清理
- [x] 单测：合成 PCM 3 段拼接，总长 == Σ round(clip×44100)，逐段起点用 findOnset 断言精确

---

# 04 — 装配改造（`lib/assemble.mjs`）

**What to build:** scene clip 纯视频；voiceover.wav 成为唯一音频源；最终封装单次 AAC 编码。

**Blocked by:** 03

**Status:** done

- [x] scene 编码命令去掉音频输入/输出（`-an`），`-frames:v` 不变
- [x] scene 循环后构建 `voiceover.wav`（场景 4：无 audioPath / 空 scenes 抛错）
- [x] 最终 concat：`-i voiceover.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ar 44100`
- [x] 空 scenes 保护
- [x] （审查后新增）无 `audioPath` 守卫的单测（infra-paths.test.mjs）

---

# 05 — 终检接入（`lib/audio/sync.mjs` + `lib/verify-subtitles.mjs`）

**What to build:** 对最终成片做逐段音频起点互相关，FAIL 类门禁接入验证报告。

**Blocked by:** 02, 04

**Status:** done

- [x] `evaluateAudioSync(measurements, tolerance=0.08)` 纯判定（含边界 ≤ 语义，+1e-9 epsilon 防浮点边界误判）
- [x] `verifyAudioSync({videoPath, outputDir, sceneDurations})`：解码终片+各 scene 到 **4kHz**（spec 修订）→ findOnset → 判定；缺失文件跳过
- [x] `verifySubtitles()` 报告加 `audioSync`；FAIL 计入 `summary.errors` → `passed=false`（场景 6/12）
- [x] 终片解码失败 → 计错误（场景 9）
- [x] （审查后新增）scene 文件存在但解码失败 → `failedScenes` 计入错误，判 FAIL（场景 16，fail-closed）
- [x] 单测：evaluateAudioSync 边界 + applyAudioSyncToSummary 合并
- [x] （审查后新增）verifyAudioSync 真实 ffmpeg 集成测试 ×5：精确起点 / +200ms 漂移 FAIL / 缺失跳过 / 损坏 FAIL / 终片无音轨 FAIL
- [x] （审查后新增）容差常量单一源：`AUDIO_SYNC_TOLERANCE`；字幕侧 `SYNC_TOLERANCE` re-export

---

# 06 — 真渲染验证与文档

**What to build:** 对真实产物证明修复：音频轨无间隙、逐段起点在容差内；文档同步。

**Blocked by:** 05

**Status:** done

- [x] `render-only.mjs --content restraint/pt1` 重渲染（v2026-08-06T15-08-44，exit 0）
- [x] ffprobe packet dump：0 个 >0.1s 间隙；音频流 73.866009s == 视频流 73.866016s
- [x] Step 6 audioSync 在真实产物上 PASS（11/11 场景 0ms 漂移）
- [x] （审查后新增）BGM 档 Runtime Verify：直接 `assembleVideo` + `--bgm` 路径，混音成品 11/11 场景 0ms 漂移 PASS（场景 10）
- [x] `docs/video-workflow.md` 更新装配/验证章节（Gapless Audio Track 取代 AAC priming 章节、文件树加 lib/audio/、CLI 第 5 参）
- [x] `npx vitest run` 全绿、`npx tsc --noEmit`、`npm run build`
