# 数字人：云端平台、人脸匹配、推荐架构与参考来源

> **来源**：从 `digital-human-solutions-m2-pro.md` offload 的 disclosed reference 内容。
> **回溯指针**：主文档 §4/§5/§6/§9 指向此文件。

---

## 云端数字人平台评估

### HeyGen

| 属性               | 详情                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **定位**           | "Create Realistic AI Videos of Yourself in Minutes"                                                                                                                 |
| **核心功能**       | 自定义 Avatar 克隆（从视频）、Photo Avatar（从照片）、文本转语音、多语言                                                                                            |
| **Avatar 类型**    | Photo Avatar（单张照片生成）、Custom Avatar（视频克隆，最高质量）、Instant Avatar                                                                                   |
| **API**            | 有（v2/v3，Bearer `X-Api-Key` 认证）                                                                                                                                |
| **账户状态**       | Wallet 计费，余额 $3.60；API quota 216；TTS 免费 600 credits                                                                                                        |
| **已有 Avatar**    | ✅ 自定义 Avatar "Pablo LI"（半身，avatar_id: `17b0de081a8b4a049284039a3fdac4ad`）                                                                                  |
| **可用资源**       | 1266 个 Avatar（含上半身变体），2454 个声音（含 23 个中文声音）                                                                                                     |
| **定价**           | Free $0（3视频/月，≤1min）；Creator $29/月（600 credits，1080p）；Pro $49/月（1000 credits，4K）。Credit 用量：Avatar III 3 credits/min，Avatar IV/V 20 credits/min |
| **test:true 参数** | ⚠️ API 有 `test:true` 参数，但**未经文档确认是否免费**。本 session 曾使用该参数生成视频，但不应假设其不扣费。使用 HeyGen API 前必须征得用户同意                     |
| **适合场景**       | 专业视频制作、营销、自媒体                                                                                                                                          |
| **优势**           | 画质业界顶级，自定义 Avatar 极其逼真；已有个人 Avatar 可直接使用                                                                                                    |
| **劣势**           | API 调用费用高；不只改嘴部，会做全身动画（录制时需注意头部静止）                                                                                                    |
| **测试结果**       | ✅ **已验证**：自定义 Avatar + 中文 TTS → 1920×1080 H.264 视频，4.0s，467KB。`test:true` 模式不消耗 credits                                                         |

**API 调用示例**：

```bash
# 生成视频（test 模式不扣费）
curl -s -H "X-Api-Key: YOUR_KEY" -H "Content-Type: application/json" \
  -X POST "https://api.heygen.com/v2/video/generate" \
  -d '{"video_inputs":[{"character":{"type":"avatar","avatar_id":"YOUR_AVATAR_ID"},"voice":{"type":"text","input_text":"你好","voice_id":"CHINESE_VOICE_ID"}}],"test":true}'

# 查询状态
curl -s -H "X-Api-Key: YOUR_KEY" \
  "https://api.heygen.com/v1/video_status.get?video_id=VIDEO_ID"
```

**录制建议**：

- 用后摄或大疆录制（前摄画质不足）
- 保持头部尽量静止（减少不必要的身体动画）
- 良好光线，正面朝向

### D-ID

| 属性                    | 详情                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **定位**                | "The #1 Choice for AI Generated Video Creation Platform"                                                                                        |
| **核心功能**            | 照片 + 音频/文本 → 说话视频（几秒内完成）；Clips → 上半身动画视频                                                                               |
| **两个端点**            | `/talks`（照片→说话，仅头/面部）+ `/clips`（Presenter→说话，**含上半身动作**）                                                                  |
| **Avatar 类型**         | `/talks`: 从照片直接生成；`/clips`: 使用 D-ID 预置 Presenter（jack/Amber/Adam 等）或训练自定义 Premium+ Avatar                                  |
| **API**                 | 有（REST API，广泛集成）                                                                                                                        |
| **API 认证**            | **Basic Auth**（`Authorization: Basic <base64(key)>`），**不是 Bearer**                                                                         |
| **账户状态**            | Plan: `deid-trial`；Features: clips:write, stitch, scene, expressives, premium-plus                                                             |
| **API 验证**            | ✅ `/talks` + `/clips` 均已验证成功                                                                                                             |
| **自定义照片+音频测试** | ✅ **已验证**（`/talks`）：Weixin 照片 + F5-TTS 音频 → 826×1062 视频，12.7s，1.55MB                                                             |
| **Clips 测试**          | ✅ **已验证**（`/clips`）：预置 Presenter "jack" + TTS → 1080×1080 视频，5.08s，1.7MB，**含上半身动作**                                         |
| **Clips 限制**          | `/clips` 使用 D-ID 预置人物（非用户照片）；要用自定义面容需训练 Premium+ Avatar（从视频）                                                       |
| **定价**                | Trial $0（3分钟）；Lite $4.7/月（40 credits，10分钟）；Pro $16/月（60 credits，15分钟）；Advanced $108/月（400 credits，100分钟）               |
| **自定义 Avatar 训练**  | 需两步：(1) consent 验证（录制读指定文本的视频）→ (2) 上传训练视频（V3 Instant ≥1分钟，Premium+ ≥3分钟）。trimedmuse.mov（30s）太短，不满足要求 |
| **适合场景**            | 快速生成、客服、教育                                                                                                                            |
| **优势**                | `/talks` 最快速"照片→说话"；`/clips` 有上半身动作但需用 D-ID 人物                                                                               |
| **劣势**                | `/talks` 仅头/面部；`/clips` 不能用自己照片（除非训练 Premium+）                                                                                |

**API 调用示例**：

```bash
# 认证（Basic Auth，不是 Bearer）
curl -X GET "https://api.d-id.com/talks" \
  -H "Authorization: Basic $(echo -n 'YOUR_API_KEY' | base64)" \
  -H "Content-Type: application/json"

# 创建说话视频（照片 + 音频）
curl -X POST "https://api.d-id.com/talks" \
  -H "Authorization: Basic $(echo -n 'YOUR_API_KEY' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "source_url": "IMAGE_URL",
    "driver": {
      "type": "audio",
      "audio_url": "AUDIO_URL"
    }
  }'
```

**网页端**：https://studio.d-id.com — 注册后免费额度约 20 credits（约 5 分钟视频）

### Synthesia

| 属性            | 详情                                           |
| --------------- | ---------------------------------------------- |
| **定位**        | "#1 AI Video Platform for Business"            |
| **核心功能**    | 140+ 语言 TTS、预置 Avatar、Custom Avatar      |
| **Avatar 类型** | 230+ 预置 Avatar，Custom Avatar 需 studio 拍摄 |
| **API**         | 有                                             |
| **适合场景**    | 企业培训、内部沟通、多语言视频                 |
| **优势**        | 语言覆盖最广，预置 Avatar 丰富                 |
| **劣势**        | Custom Avatar 需专业拍摄，不能从照片直接生成   |

### Sync.so

| 属性         | 详情                                                       |
| ------------ | ---------------------------------------------------------- |
| **定位**     | "AI lipsync and visual dubbing"                            |
| **核心功能** | 音频 + 视频 → 高质量唇形同步（Wav2Lip 商用版 lipsync-2）   |
| **API**      | 有（Python SDK `syncsdk` + TypeScript SDK `@sync.so/sdk`） |
| **适合场景** | 已有视频 + 想替换音频的场景（配音、多语言版本）            |
| **优势**     | 唇形同步质量极高，API 简洁                                 |
| **劣势**     | 仅做唇形同步，不做 TTS 或 Avatar 创建                      |

### 云端平台对比

| 平台          | 照片→说话        | 上半身动作              | 视频克隆           | TTS | API | 认证方式  | 中文     | 价格             |
| ------------- | ---------------- | ----------------------- | ------------------ | --- | --- | --------- | -------- | ---------------- |
| **HeyGen**    | ✅ Photo Avatar  | ✅ Custom Avatar        | ✅ Custom Avatar   | ✅  | ✅  | Bearer    | ✅       | ~$0.30-0.60/分钟 |
| **D-ID**      | ✅ `/talks` 最快 | ✅ `/clips`（预置人物） | ❌ 需训练 Premium+ | ✅  | ✅  | **Basic** | ✅       | Pro ~$29/月      |
| **Synthesia** | ❌ 需 studio     | ✅                      | ✅ 140+语言        | ✅  | —   | ✅        | $29+/月  |
| **Sync.so**   | ❌ 仅唇形同步    | ❌                      | ❌                 | ✅  | —   | N/A       | 按量付费 |

---

## 人脸相似度匹配方案

### 需求分析

用户希望：给定一张个人照片，从预置数字人库中选出外貌最相似的一个。

### 技术方案：人脸嵌入 + 余弦相似度

**Step 1：人脸嵌入提取**

| 模型                      | 维度 | macOS 支持      | HuggingFace               | 说明              |
| ------------------------- | ---- | --------------- | ------------------------- | ----------------- |
| **InsightFace (ArcFace)** | 512  | ✅ ONNX Runtime | `public-data/insightface` | 业界标准，最推荐  |
| FaceNet                   | 512  | ✅ PyTorch MPS  | `py-feat/facenet`         | Google 经典方案   |
| ArcFace (独立)            | 512  | ✅ ONNX         | `garavv/arcface-onnx`     | 直接 ArcFace ONNX |

**推荐 InsightFace**：

- ONNX Runtime 在 macOS 上原生支持（不需要 CUDA）
- ArcFace backbone 提取 512 维人脸嵌入
- 同时提供人脸检测、对齐、属性识别
- Hallo 项目也使用 InsightFace 做 face embedding，生态成熟

**Step 2：相似度计算**

```python
import numpy as np
from numpy.linalg import norm

def cosine_similarity(emb1, emb2):
    return np.dot(emb1, emb2) / (norm(emb1) * norm(emb2))

def find_most_similar_avatar(user_photo_path, avatar_db):
    user_emb = extract_embedding(user_photo_path)  # InsightFace
    similarities = {}
    for avatar_id, avatar_emb in avatar_db.items():
        similarities[avatar_id] = cosine_similarity(user_emb, avatar_emb)
    best_match = max(similarities, key=similarities.get)
    return best_match, similarities[best_match]
```

**Step 3：Avatar 模板库构建**

预置 Avatar 模板来源：

- HDTF 数据集（高清说话人脸视频）
- 自己录制的基准视频（最佳质量）
- 云端平台预置 Avatar（HeyGen/D-ID）

对每个 Avatar 模板：

1. 取首帧 → InsightFace 提取嵌入 → 存入 embedding DB
2. 保存对应的基准视频/图片路径

### 高级匹配策略

除了纯人脸嵌入相似度，可以组合多个维度：

| 维度      | 方法                           | 权重建议 |
| --------- | ------------------------------ | -------- |
| 人脸特征  | InsightFace ArcFace 余弦相似度 | 0.6      |
| 性别/年龄 | InsightFace 属性识别           | 0.2      |
| 发型/发色 | 颜色直方图 + 简单分类          | 0.1      |
| 体型/姿态 | DWPose 骨骼关键点              | 0.1      |

---

## 推荐架构：完整数字人管线

### 本地方案（首选方向）

```
                    ┌─────────────────────┐
  用户照片 ────────→│  InsightFace (ONNX)  │── 512 维嵌入
                    └─────────────────────┘         │
                                                    ↓
                    ┌─────────────────────┐    余弦相似度匹配
                    │  Avatar 模板嵌入库   │←───────┘
                    └─────────────────────┘
                              │
                              ↓ 最相似 Avatar 基准视频/照片
                    ┌─────────────────────┐
  文本输入 ────────→│  F5-TTS-MLX (已有)   │── 音频 WAV
                    └─────────────────────┘         │
                                                    ↓
                    ┌─────────────────────┐
                    │  唇同步模型（待定）    │── 说话视频
                    │  LongCat MLX (本地)  │
                    │  EchoMimicV3 (云GPU) │
                    └─────────────────────┘         │
                                                    ↓
                    ┌─────────────────────┐
                    │  FFmpeg 后处理       │── 最终数字人视频
                    │  (已有管线)          │
                    └─────────────────────┘
```

### 混合方案（本地 + 云端）

```
文本 → F5-TTS-MLX (本地) → 音频 → D-ID API → 说话视频
文本 → F5-TTS-MLX (本地) → 音频 → HeyGen API → 说话视频（质量最高但贵）
```

**适用场景**：本地模型测试未完成时的过渡方案。

### 纯云方案

```
  文本 → HeyGen API (TTS + Avatar) → 说话视频
  照片 → D-ID API → 说话视频
```

**适用场景**：不想本地部署、追求最快上线。

---

## 参考来源

### 论文

1. MuseTalk: Real-Time High-Fidelity Video Dubbing via Spatio-Temporal Sampling — arxiv 2410.10122
2. SadTalker: Learning Realistic 3D Motion Coefficients for Stylized Audio-Driven Single Image Talking Face Animation — arxiv 2211.12194
3. Hallo: Hierarchical Audio-Driven Visual Synthesis for Portrait Image Animation — arxiv 2406.08801
4. Hallo2: Long-Duration High-Resolution Audio-Driven Portrait Image Animation — arxiv 2410.07718
5. **Hallo3: Highly Dynamic and Realistic Portrait Image Animation with Diffusion Transformer Networks** — CVPR 2025, arxiv 2412.00733
6. **Hallo4** — arxiv 2505.23525
7. **EMO: Emote Portrait Alive — Generating Expressive Portrait Videos with Audio2Video Diffusion Model** — ECCV 2024, arxiv 2402.17485
8. **PersonaLive: Expressive Portrait Image Animation for Live Streaming** — CVPR 2026, arxiv 2512.11253
9. **JoyVASA: Portrait and Animal Image Animation with Diffusion-Based Audio-Driven Facial Dynamics** — arxiv 2411.09209
10. **V-Express: Conditional Dropout for Progressive Training of Portrait Video Generation** — arxiv 2406.02511
11. EchoMimic: Lifelike Audio-Driven Portrait Animations through Editable Landmark Conditions — arxiv 2407.08136
12. Wav2Lip: A Lip Sync Expert Is All You Need for Speech to Lip Generation In The Wild — ACM MM 2020, arxiv 2008.10010
13. **LatentSync: Taming Audio-Conditioned Latent Diffusion Models for Lip Sync with SyncNet Supervision** — arxiv 2412.09262
14. **Sonic: Shifting Focus to Global Audio Perception in Portrait Animation** — CVPR 2025, arxiv 2411.16331
15. **DICE-Talk: Disentangle Identity, Cooperate Emotion** — ACM MM 2025, arxiv 2504.18087
16. **StyleSync: High-Fidelity Generative and Viseme-Aware Style Transfer** — CVPR 2023

### 代码仓库与模型

17. ~~MuseTalk (PyTorch 原版): github.com/TMElyralab/MuseTalk~~ — 已放弃
18. ~~MuseTalk MLX 移植: huggingface.co/mlx-community/MuseTalk-1.5-fp16~~ — 已放弃
19. **LatentSync**: github.com/bytedance/LatentSync, HF: `ByteDance/LatentSync-1.5` / `ByteDance/LatentSync-1.6`
20. **ComfyUI-LatentSyncWrapper**: github.com/ShmuelRonen/ComfyUI-LatentSyncWrapper (957 stars)
21. **Sonic**: github.com/jixiaozhong/Sonic
22. **ComfyUI_Sonic (MPS 修复)**: github.com/smthemex/ComfyUI_Sonic
23. **Hallo (系列)**: github.com/fudan-generative-vision/hallo (8658 stars), HF: `fudan-generative-ai/hallo2` / `hallo3` / `hallo4` / `Hallo-Live`
24. **Hallo3**: github.com/fudan-generative-vision/hallo3, HF: `fudan-generative-ai/hallo3` (CVPR 2025)
25. **EMO**: github.com/HumanAIGC/EMO (7601 stars, ECCV 2024)
26. **PersonaLive**: github.com/GVCLab/PersonaLive (3489 stars, CVPR 2026), ComfyUI: `okdalto/ComfyUI-PersonaLive`
27. **JoyVASA**: github.com/jdh-algo/JoyVASA (876 stars)
28. **V-Express**: github.com/tencent-ailab/V-Express (2357 stars), ComfyUI: `tiankuan93/ComfyUI-V-Express`
29. **DreamTalk**: github.com/ali-vilab/dreamtalk (1789 stars)
30. **AniPortrait**: github.com/Zejun-Yang/AniPortrait (5019 stars), HF: `ZJYang/AniPortrait`
31. **DICE-Talk**: github.com/toto222/DICE-Talk
32. **StyleSync**: github.com/guanjz20/StyleSync (328 stars, CVPR 2023)
33. SadTalker: huggingface.co/vinthony/SadTalker
34. EchoMimic: huggingface.co/BadToBest/EchoMimic
35. EchoMimicV2: huggingface.co/BadToBest/EchoMimicV2 (4279 stars), github.com/antgroup/echomimicv2
36. LivePortrait: huggingface.co/KlingTeam/LivePortrait (486 likes)
37. Wav2Lip: github.com/Rudrabha/Wav2Lip
38. InsightFace: huggingface.co/public-data/insightface
39. **HeyGem**: github.com/Holasyb918/HeyGem-Linux-Python-Hack (486 stars), ComfyUI: github.com/billwuhao/Comfyui_HeyGem (280 stars)
40. **Linly-Talker**: github.com/Kedreamix/Linly-Talker (3424 stars)

### 云端平台

41. HeyGen: heygen.com (API: api.heygen.com, Bearer X-Api-Key)
42. D-ID: d-id.com (API: api.d-id.com, Basic Auth)
43. Synthesia: synthesia.io
44. Sync.so: sync.so
