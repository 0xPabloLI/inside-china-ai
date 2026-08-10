# 数字人模型测试进度追踪

> **最后更新**：2026-08-10
> **设备**：MacBook Pro M2 Pro 32GB, macOS 26.5.1
> **主文档**：`docs/research/digital-human-solutions-m2-pro.md`

---

## 测试总览

| # | 模型 | 技术路线 | 分辨率 | MPS | 商用 | 状态 | 日期 |
|---|------|---------|--------|-----|------|------|------|
| 1 | ~~MuseTalk 1.5 MLX~~ | VAE 替换 | 256px | ✅ MLX | ✅ MIT | ❌ 放弃 | 2026-08-09 |
| 2 | ~~SadTalker~~ | 3DMM | — | ✅ | ❌ | ❌ 效果差 | 2026-08-09 |
| 3 | ~~LatentSync 1.5~~ | 扩散+SyncNet | 256px | ✅ (需 patch) | ✅ OpenRAIL++ | ❌ 效果差 | 2026-08-10 |
| 4 | ~~LatentSync 1.6~~ | 扩散+SyncNet | 512px | ❌ MPS OOM | ✅ OpenRAIL++ | ❌ OOM (32GB 不够) | 2026-08-10 |
| 5 | **Sonic** | SVD 扩散 | — | ✅ 已修复 | ❌ 非商用 | 📋 待测 | — |
| 6 | **V-Express** | 渐进式扩散 | — | ⚠️ 待验证 | ❓ | 📋 待测 | — |
| 7 | **Hallo2** | 分层扩散 | — | ⚠️ 待验证 | ✅ MIT | 📋 待测 | — |
| 8 | **PersonaLive** | 流式扩散 | — | ⚠️ 待验证 | ❌ 非商用 | 📋 待测 | — |

---

## 已完成测试详情

### ❌ MuseTalk 1.5 MLX

- **日期**：2026-08-09
- **结论**：**放弃** — VAE 架构导致嘴部模糊，不可修复的架构问题
- **理由**：VAE 潜空间压缩/解压丢失高频细节（牙齿纹理、嘴唇边缘），单步替换无细化网络
- **清理**：安装目录、模型文件、测试视频均已删除

### ❌ SadTalker

- **日期**：2026-08-09
- **结论**：**效果差** — 恐怖谷眼神，表情僵硬
- **理由**：3DMM 方案虽然嘴部不模糊，但头部运动有限，整体不自然

### ❌ LatentSync 1.5

- **日期**：2026-08-10
- **结论**：**效果差** — 远未达到商用质量
- **MPS Patch**：10 项（详见主文档 §3.2.1）
- **版本教训**：1.5 checkpoint 必须用 1.5 代码，1.6 代码不兼容（`affine_transform.py` 235 行差异）
- **test1/test2**：用 1.6 代码跑 1.5 checkpoint → 嘴巴完全扭曲
- **test3**：纯 1.5 代码 + 1.5 checkpoint → 比前两次好一些但仍然很差
- **根本问题**：256×256 分辨率不足以生成清晰的嘴部细节
- **推理性能**：17 分钟 / 5.28s 视频（affine 8min + diffusion 9min）
- **测试文件**：已删除

---

## 进行中测试

### ❌ LatentSync 1.6

- **日期**：2026-08-10
- **结论**：**失败** — 512px 推理 MPS OOM，32GB 内存不够
- **MPS Patch**：6 项（详见主文档 §3.2.2）
- **Run 1**：标准 MPS 内存限制 → OOM at `scaled_dot_product_attention`（MPS allocated: 29.34 GB, tried to allocate 8 GB more, max allowed: 42.43 GB）
- **Run 2**：`PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0` 禁用内存上限 → 进程在 affine 阶段被系统杀掉（内存压力 killer）
- **根本问题**：512×512 分辨率的 UNet 推理需要 ~38GB 内存，M2 Pro 32GB 物理内存不足。即使使用 swap 也会导致系统不稳定
- **结论**：**M2 Pro 32GB 不可用 LatentSync 1.6**

---

## 待测模型详情

### 📋 Sonic (ComfyUI_Sonic)

- **优先级**：⭐⭐⭐⭐⭐（最高 — 唯一明确 MPS 兼容的扩散方案）
- **来源**：腾讯，CVPR 2025
- **安装**：ComfyUI 插件 `smthemex/ComfyUI_Sonic`
- **MPS**：✅ 已修复（bf16 + OOM + MPS device error）
- **许可证**：CC BY-NC-SA 4.0（非商用）
- **依赖**：SVD checkpoints + Sonic 模型
- **测试重点**：安装复杂度、MPS 实际性能、嘴部清晰度

### 📋 V-Express

- **优先级**：⭐⭐⭐⭐
- **来源**：腾讯 AI Lab
- **MPS**：⚠️ 基于 SD1.5，MPS 可能可行
- **ComfyUI**：`tiankuan93/ComfyUI-V-Express`

### 📋 Hallo2

- **优先级**：⭐⭐⭐⭐（MIT 许可证可商用）
- **来源**：复旦
- **MPS**：⚠️ 官方要求 A100，需验证
- **许可证**：MIT

### 📋 PersonaLive

- **优先级**：⭐⭐⭐
- **来源**：CVPR 2026
- **MPS**：⚠️ 12GB VRAM，MPS 可能可行
- **ComfyUI**：`okdalto/ComfyUI-PersonaLive`

---

## 统一测试素材

- **视频**：`scripts/short-video/assets/IMG_7991.MOV`（用户正面视频）
- **音频**：`scripts/short-video/output/deepseek/audio/scene-1.mp3`（F5-TTS 中文）
- **测试文本**：scene-1 对应的中文文本

## 评估标准

每个模型需验证：
1. **安装可行性**：M2 Pro 上能否成功安装和运行
2. **推理速度**：生成 5-30 秒视频需要多长时间
3. **嘴部清晰度**：与原始视频对比，嘴部是否模糊或变形
4. **音频同步**：口型与音频是否匹配
5. **分辨率**：输出分辨率是否满足需求（至少 512×512）
6. **内存占用**：峰值内存是否在 32GB 以内
