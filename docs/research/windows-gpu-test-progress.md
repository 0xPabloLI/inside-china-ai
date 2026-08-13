# Windows 数字人模型测试进度追踪

> **最后更新**：2026-08-13（文档创建，初始待测模型清单）
> **测试设备**：Windows 11 (10.0.19045)，AMD Ryzen 5 1400，NVIDIA GTX 1080 8GB (Pascal CC 6.1)，16GB DDR4，驱动 551.61 / CUDA 12.4
> **分析文档**：`docs/research/windows-gpu-upgrade-and-model-feasibility.md`
> **Mac 对比文档**：`docs/research/digital-human-test-progress.md`（M2 Pro 32GB 设备）
> **用途**：追踪 GTX 1080 8GB 上数字人模型的实际测试进度

---

## 设备信息

| 维度 | 规格 | 备注 |
|------|------|------|
| **OS** | Windows 11 23H2 (10.0.19045) | 原生 Windows，非 WSL |
| **CPU** | AMD Ryzen 5 1400 (4C/8T, 3.2GHz) | 2017 年 Zen 架构，瓶颈在 GPU 不在 CPU |
| **GPU** | NVIDIA GTX 1080 8GB (MSI GAMING X) | Pascal GP104, CC 6.1, 2560 CUDA cores, 180W |
| **GPU 架构限制** | Pascal CC 6.1 | ❌ 不支持 bf16 / ❌ 无 Tensor Core / ❌ 无 Flash Attention / ❌ 无 xformers 加速 / ✅ 支持 FP16 / ✅ 支持 CUDA 12.4 |
| **内存** | 16GB DDR4 | 偏小，Docker + WSL2 开销大 |
| **主板** | MSI B350M MORTAR | PCIe 3.0 x16 |
| **存储** | SSD | 足够 |
| **驱动** | NVIDIA 551.61 / CUDA 12.4 | 满足 ComfyUI 和 HeyGem 要求 |

---

## 测试总览

### 确定可跑（未实测，理论分析确认）

| # | 模型 | 技术路线 | VRAM | 商用许可 | 状态 | 预期 |
|---|------|---------|------|---------|------|------|
| 1 | **HeyGem (社区整合包)** | ONNX 唇同步 | 8GB | ✅ 开源 | 📋 待测 | ✅ 可跑 — 社区明确标注 8GB 可用 |
| 2 | **Wav2Lip** | GAN | ~4GB | ❌ 非商用 | 📋 待测 | ✅ 可跑 — 仅需 4GB，Pascal 兼容 |
| 3 | **SadTalker** | 3DMM | ~6GB | ❌ 非商用 | 📋 待测 | ✅ 可跑 — FP32 推理，不依赖 bf16 |
| 4 | **MuseTalk** | VAE 替换 | 7GB | ✅ MIT | 📋 待测 | ✅ 可跑 — 不依赖 bf16（但 Mac 测试已放弃：嘴部模糊） |
| 5 | **LatentSync 1.5** | 扩散+SyncNet | 8GB | ✅ OpenRAIL++ | 📋 待测 | ✅ 可跑 — FP16 推理（但 Mac 测试已放弃：256px 效果差） |
| 6 | **ComfyUI + SD 1.5** | 扩散出图 | 8GB | ✅ | 📋 待测 | ✅ 可跑 — 秋叶整合包低显存模式 |

### 理论可跑（需代码修改 + 可能 OOM）

| # | 模型 | 技术路线 | VRAM 需求 | 商用许可 | 状态 | 风险 |
|---|------|---------|----------|---------|------|------|
| 7 | **Sonic** | SVD 扩散 | 12GB | ❌ 非商用 | 📋 待测（低优先级） | ⚠️ bf16→FP16 改码 + 8GB<12GB 双重瓶颈，大概率 OOM |
| 8 | **EchoMimicV3** | Wan2.1 扩散 | 12GB | ✅ Apache 2.0 | 📋 待测（低优先级） | ⚠️ 同上，bf16→FP16 + VRAM 不足 |
| 9 | **V-Express** | 渐进式扩散 | ~8GB (`save_gpu_memory`) | ❓ | 📋 待测 | ⚠️ 边缘 — V100 需 7956MiB，8GB 刚好够；CUDA 比 Mac MPS 快 10-20x |

### 待测（轻量级，可能可跑）

| # | 模型 | 技术路线 | VRAM 需求 | 商用许可 | 状态 | 备注 |
|---|------|---------|----------|---------|------|------|
| 10 | **FeatherTalk** | 轻量级框架 | 待测 | ❓ | 📋 待测 | 超轻量级，55 GitHub stars，可能可跑 |

---

## 测试优先级

| 优先级 | 模型 | 理由 |
|--------|------|------|
| ⭐⭐⭐⭐⭐ | **HeyGem (社区整合包)** | 当前设备最佳数字人方案；ONNX 不依赖 bf16；社区明确 8GB 可用；效果远超 Wav2Lip/SadTalker；支持中文 TTS + 声音克隆 |
| ⭐⭐⭐⭐ | **ComfyUI + SD 1.5** | 8GB 足够；可生成数字人形象图片；秋叶整合包低显存模式；为后续 ComfyUI 数字人插件打基础 |
| ⭐⭐⭐ | **V-Express** | 边缘可跑；CUDA 比 Mac MPS 快 10-20x（Mac 17min/step → CUDA 预计 1-2min/step）；Mac 已放弃但 Windows CUDA 值得一试 |
| ⭐⭐⭐ | **FeatherTalk** | 超轻量级；如果可跑，可能是当前设备上最快的方案 |
| ⭐⭐ | **SadTalker** | Mac 已测试效果差（恐怖谷眼神），但 Windows CUDA 上速度更快，可用于快速原型 |
| ⭐⭐ | **Wav2Lip** | 2020 老模型效果差，但 4GB VRAM 需求最低，可作为 fallback |
| ⭐ | **LatentSync 1.5** | Mac 已测试 256px 效果差，Windows 上分辨率不变，预期结果相同 |
| ⭐ | **MuseTalk** | Mac 已测试嘴部模糊（VAE 架构问题），Windows 上架构不变 |
| ⭐ | **Sonic** | 双重瓶颈（bf16 + VRAM），实际可行性极低；即使改码成功也大概率 OOM |
| ⭐ | **EchoMimicV3** | 同上双重瓶颈；但 Mac 上模型文件已下载完成，可直接拷贝测试 |

---

## 已完成测试详情

> 暂无已完成的 Windows 测试。首次测试请从 HeyGem 社区整合包开始。

---

## 待测模型详情

### 📋 HeyGem (社区整合包) — 最高优先级

- **优先级**：⭐⭐⭐⭐⭐
- **来源**：硅基智能 (GuijiAI)，2025 年 3 月开源
- **GitHub**：`github.com/GuijiAI/HeyGem.ai`
- **部署方式**：社区整合包（非官方 Docker 完整版）
- **VRAM**：8GB 可用（社区标注）
- **磁盘**：仅 10GB（vs 官方 100GB + D 盘 30GB）
- **架构兼容性**：✅ ONNX Runtime，Pascal CC 6.1 完全兼容（不依赖 bf16/Flash Attention/Tensor Core）
- **功能**：照片/1 秒视频 → 数字人克隆 → 文字/语音驱动 → 4K 视频输出
- **语言支持**：8 种（中、英、日、韩、法、德、阿拉伯、西班牙）
- **Mac 测试状态**：❌ 不适用（HeyGem 需 NVIDIA GPU，不兼容 Mac）
- **测试重点**：
  1. 社区整合包能否在 8GB 显存 + 16GB 内存上正常启动
  2. Docker + WSL2 内存开销是否导致系统卡顿
  3. 生成质量（嘴部同步、分辨率、声音克隆效果）
  4. 生成速度（30 秒视频需要多长时间）
  5. 中文 TTS 效果
- **安装步骤**：
  1. 安装 Docker Desktop（WSL2 后端）
  2. 下载社区整合包（夸克网盘）
  3. 解压 → 一键启动
  4. 如遇 OOM，降低输出分辨率或使用 `docker-compose-lite.yml`

### 📋 ComfyUI + SD 1.5

- **优先级**：⭐⭐⭐⭐
- **部署方式**：秋叶 ComfyUI 整合包 V9.5+
- **VRAM**：8GB 足够（SD 1.5 512×512）
- **架构兼容性**：✅ PyTorch 2.x 仍包含 `sm_61`（Pascal）CUDA kernel
- **限制**：
  - ❌ 无 xformers 加速（Pascal CC 6.1 < 7.0），fallback 到标准 attention
  - ❌ 无 Flash Attention（需 CC 8.0+）
  - ❌ 无 Tensor Core（FP16 矩阵运算无硬件加速）
  - ❌ 不支持 bf16
- **预期速度**：SD 1.5 512×512 20 steps ~3-5 it/s（约慢 RTX 3060 2-3x）
- **测试重点**：
  1. 秋叶整合包能否正常启动
  2. SD 1.5 512×512 出图速度
  3. 低显存模式效果
  4. SDXL 1024×1024 是否可跑（边缘）
  5. 数字人插件兼容性（Wav2Lip、LatentSync 1.5、HeyGem 封装）
- **安装建议**：
  1. 下载秋叶 ComfyUI 整合包 V9.5
  2. 启动时选择「低显存模式」
  3. 优先跑 SD 1.5 模型
  4. 不要安装 xformers（Pascal 不支持）
  5. 数字人插件优先试 Wav2Lip 和 HeyGem 封装

### 📋 V-Express

- **优先级**：⭐⭐⭐
- **来源**：腾讯 AI Lab
- **VRAM**：~8GB（`save_gpu_memory` 模式，V100 实测 7956MiB）
- **架构兼容性**：✅ 不强制 bf16，FP16 可用
- **Mac 测试状态**：❌ 放弃 — MPS 17min/sub-step，预估 4.7 天
- **Windows 预期**：CUDA 比 MPS 快 10-20x，预计 1-2min/step，25 steps × 16 context ~7-14 小时（仍慢但可能可用）
- **测试重点**：
  1. `save_gpu_memory` 模式下 8GB 是否真的够（V100 需 7956MiB，8192MiB 刚好）
  2. CUDA 推理速度（对比 Mac MPS 17min/step）
  3. 30 秒视频完整推理时间
  4. 是否有 OOM 风险
- **风险**：边缘情况，8GB 刚好够 V100 的 7956MiB 需求，但 GTX 1080 的显存管理可能不如 V100 高效

### 📋 FeatherTalk

- **优先级**：⭐⭐⭐
- **来源**：anliyuan，55 GitHub stars
- **GitHub**：`github.com/anliyuan/FeatherTalk`
- **VRAM**：待测（超轻量级，预期较低）
- **架构兼容性**：⚠️ 待验证
- **Mac 测试状态**：📋 未测试
- **测试重点**：
  1. 超轻量级是否意味着 VRAM 需求低到 8GB 以内
  2. 是否依赖 bf16
  3. 质量是否可接受
  4. Pascal 架构兼容性

### 📋 Sonic（低优先级 — 双重瓶颈）

- **优先级**：⭐
- **来源**：jixiaozhong，1.4k stars
- **VRAM**：12GB（官方）vs 8GB（当前设备）
- **架构兼容性**：❌ Pascal 不支持 bf16；⚠️ 理论可改 FP16 但有溢出风险
- **Mac 测试状态**：❌ 放弃 — fp16/bf16 死锁，fp32 第 1 步 78 分钟后系统崩溃
- **Windows 分析**：
  - bf16→FP16 修改：Sonic 基于 SVD 扩散，代码中 `torch.bfloat16` 改为 `torch.float16`
  - FP16 溢出风险：SVD 扩散数值范围大，FP16（±65504）可能溢出导致 NaN/Inf
  - VRAM 不足：即使 dtype 修改成功，8GB < 12GB 大概率 OOM
  - **双重瓶颈**：bf16→FP16 改码 + 8GB→12GB VRAM 不足
- **测试重点**：
  1. bf16→FP16 修改后是否能加载模型
  2. 推理是否产生 NaN/Inf
  3. 8GB VRAM 是否直接 OOM
- **预期**：实际可行性极低，不建议优先测试

### 📋 EchoMimicV3（低优先级 — 双重瓶颈）

- **优先级**：⭐
- **来源**：蚂蚁集团 BadToBest，48 likes
- **VRAM**：12GB（官方）vs 8GB（当前设备）
- **架构兼容性**：❌ Pascal 不支持 bf16；⚠️ Wan2.1 底模可改 FP16
- **Mac 测试状态**：⚠️ 阻塞 — 模型文件已下载完成，但推理报 `KeyError: 'patch_embedding.weight'`（权重与代码版本不兼容）
- **Windows 分析**：
  - bf16→FP16 修改：Wan2.1 底模可通过 `torch_dtype=float16` 加载
  - VRAM 不足：同 Sonic，8GB < 12GB 大概率 OOM
  - **双重瓶颈**：同 Sonic
- **优势**：Mac 上已下载全部模型文件（~20GB），可直接拷贝到 Windows 测试
- **测试重点**：
  1. bf16→FP16 修改后能否加载
  2. 8GB VRAM 是否 OOM
  3. Mac 上的 `KeyError` 是否在 Windows 最新代码中已修复

### 📋 SadTalker / Wav2Lip / MuseTalk / LatentSync 1.5（低优先级 — Mac 已测试效果差）

| 模型 | Mac 结论 | Windows 测试价值 |
|------|---------|-----------------|
| **SadTalker** | ❌ 效果差（恐怖谷眼神） | Windows CUDA 速度更快，但效果不变 |
| **Wav2Lip** | ❌ 未在 Mac 上测试 | 2020 老模型，4GB VRAM，可作为最低端 fallback |
| **MuseTalk** | ❌ 嘴部模糊（VAE 架构问题） | 架构不变，Windows 上结果相同 |
| **LatentSync 1.5** | ❌ 256px 效果差 | 分辨率不变，Windows 上结果相同 |

> 这 4 个模型在 Mac M2 Pro 上已测试且效果不达标。Windows 上虽然速度会更快（CUDA vs MPS），但效果不会改善（分辨率、架构限制不变）。仅在需要快速原型或对比测试时才测。

---

## Mac vs Windows 测试结果对比

| 模型 | Mac M2 Pro 32GB | Windows GTX 1080 8GB | 差异原因 |
|------|----------------|---------------------|---------|
| MuseTalk | ❌ 嘴部模糊 | 📋 待测 | VAE 架构问题不随设备改变 |
| SadTalker | ❌ 恐怖谷眼神 | 📋 待测 | 3DMM 架构限制不随设备改变 |
| LatentSync 1.5 | ❌ 256px 效果差 | 📋 待测 | 分辨率不随设备改变 |
| LatentSync 1.6 | ❌ MPS OOM (32GB 不够) | ❌ VRAM 不足 (8GB < 18GB) | 两端都不够 |
| Sonic | ❌ MPS 死锁 | 📋 待测（低优先级） | Mac 是 MPS kernel 问题；Windows 是 bf16+VRAM 双重瓶颈 |
| Hallo2 | ❌ 256px 太低 | ❌ VRAM 不足 (8GB < 20GB) | 两端都不够 |
| V-Express | ❌ 17min/step | 📋 待测 | Mac 是 MPS 太慢；Windows CUDA 预计 1-2min/step |
| LongCat MLX q4 | ✅ 成功（18min/1s 视频） | ❌ 不适用 | LongCat 需 MLX 框架，Windows 无 MLX |
| HeyGem | ❌ 不兼容（需 NVIDIA） | 📋 待测（最高优先级） | Mac 无 NVIDIA GPU；Windows 原生支持 |
| EchoMimicV3 | ⚠️ 下载阻塞 + KeyError | 📋 待测（低优先级） | Mac 已下载模型文件可拷贝 |
| ComfyUI SD 1.5 | ✅ 可跑（MPS） | 📋 待测 | Windows CUDA 兼容性更好 |

---

## 统一测试素材

与 Mac 测试使用相同素材，便于跨设备对比：

- **照片**：微信照片 `Weixin Image_2026-08-10_003535_660.jpg`
- **音频**：`scripts/short-video/output/deepseek/audio/scene-1.mp3`（F5-TTS 中文）
- **视频**：`scripts/short-video/assets/IMG_7991.MOV`（用户正面视频）
- **测试文本**：scene-1 对应的中文文本

---

## 评估标准

1. **安装可行性**：GTX 1080 8GB 上能否成功安装和运行
2. **推理速度**：生成 5-30 秒视频需要多长时间
3. **嘴部清晰度**：与原始视频对比，嘴部是否模糊或变形
4. **音频同步**：口型与音频是否匹配
5. **分辨率**：至少 512×512（256px 已确认不够）
6. **显存占用**：峰值在 8GB 以内
7. **Pascal 兼容性**：是否有 bf16/Flash Attention 相关报错

---

## 升级后测试计划（RTX 3060 12GB）

如果升级到 RTX 3060 12GB（Ampere CC 8.6），以下模型将解锁：

| 模型 | GTX 1080 8GB | RTX 3060 12GB | 解锁原因 |
|------|-------------|--------------|---------|
| **Sonic** | ❌ bf16 + VRAM | ✅ 可跑 | Ampere 原生 bf16 + 12GB VRAM |
| **EchoMimicV3** | ❌ bf16 + VRAM | ✅ 可跑 | Ampere 原生 bf16 + 12GB VRAM |
| **V-Express** | ⚠️ 边缘 | ✅ 流畅 | 12GB 富余 + Tensor Core 加速 |
| **PersonaLive** | ❌ VRAM 不足 | ✅ 可跑 | 12GB VRAM |
| **InfiniteTalk** | ❌ VRAM 不足 | ✅ 可能可跑 | 12GB VRAM |
| **AniPortrait** | ❌ VRAM 不足 | ⚠️ 可能 | 12GB VRAM（接近） |

升级后应优先测试 Sonic 和 EchoMimicV3（Ampere bf16 完全解锁）。
