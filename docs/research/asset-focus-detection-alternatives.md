# Deep Research: 素材重点内容检测替代方案

## Executive Summary

在短视频制作管线中，需要自动检测图片/视频素材的重点内容位置，以避免文字叠加遮挡素材关键区域。当前使用的 Qwen3-VL-8B 在 JSON 结构化输出方面表现稳定（100% parse 成功率），但在空间定位（focusRegion top/center/bottom）方面不稳定（同一张图两个 prompt 给出不同结果），overlay 数值推荐缺乏梯度（全部输出 0.3）。

本报告调研了 5 类替代技术手段，评估其在本项目 macOS 本地环境（无 NVIDIA GPU）中的可行性，结论是：**OpenCV Saliency + Face Detection 组合方案**是最实用的——零模型下载、毫秒级速度、macOS 原生支持、与现有管线无缝集成。Apple Vision Framework 是次选（macOS 原生、质量高，但需要 Swift bridge），YOLO/SAM 方案需要额外 GPU 或大型模型下载，ROI 不如前两者。

## Key Findings

### 1. OpenCV Saliency Detection（推荐方案）

OpenCV 内置 `saliency` 模块，提供三种算法：

| 算法                             | 类型       | 原理                                                            | 适用场景     |
| -------------------------------- | ---------- | --------------------------------------------------------------- | ------------ |
| `StaticSaliencySpectralResidual` | 静态       | 频谱残差（Hou & Zhang 2007 CVPR），分析图像 log-spectrum 的残差 | 任意静态图片 |
| `StaticSaliencyFineGrained`      | 静态       | 细粒度特征                                                      | 高精度需求   |
| `ObjectnessBING`                 | Objectness | BING 算法，生成候选物体 bounding box                            | 多物体场景   |

**输出**：灰度热力图（float [0,1]，1=salient），`ObjectnessBING` 额外输出 bounding box 列表。

**关键优势**：

- **零模型下载**：OpenCV `opencv-contrib-python` 自带，无需额外下载模型
- **毫秒级速度**：单张图片 <100ms（对比 Qwen3-VL 18-20s）
- **macOS 原生**：不依赖 GPU，CPU 即可运行
- **已有依赖**：项目已使用 OpenCV（`text-align.py` 的 wav2vec2 依赖），无需额外安装

**局限**：

- 频谱残差法对简单背景效果好，复杂场景精度一般
- 不输出语义信息（不知道是人脸还是产品）
- 视频需要逐帧分析（但可只取首帧或关键帧）

**输出接口**：

```python
import cv2
saliency = cv2.saliency.StaticSaliencySpectralResidual_create()
success, saliencyMap = saliency.computeSaliency(image)
# saliencyMap: float32 grayscale, values [0,1]
# 可以计算 salient region 的 centroid → top/center/bottom
```

**来源**：

- OpenCV Saliency API 文档（Tier 1）：https://docs.opencv.org/4.13.0/d8/d65/group__saliency.html
- PyImageSearch 教程（Tier 2）：https://pyimagesearch.com/2018/07/16/opencv-saliency-detection/
- GitHub 实现（Tier 3）：https://github.com/ivanred6/image_saliency_opencv

---

### 2. Apple Vision Framework（macOS 原生方案）

macOS/iOS 内置的 Vision Framework 提供两种 saliency 请求：

| API                                             | 类型                     | 输出                            |
| ----------------------------------------------- | ------------------------ | ------------------------------- |
| `VNGenerateAttentionBasedSaliencyImageRequest`  | 注意力（人眼注视点模型） | 热力图 + 1 个 bounding box      |
| `VNGenerateObjectnessBasedSaliencyImageRequest` | 物体性（物体存在概率）   | 热力图 + 最多 3 个 bounding box |

**关键优势**：

- **macOS 原生**：不需要安装任何东西，每个 Apple 设备都有
- **质量高**：Apple 的 attention-based saliency 模型基于真人眼动数据训练
- **速度快**：on-device 处理，毫秒级
- **直接输出 bounding box**：不需要自己从热力图计算
- **WWDC 2026 更新**：Apple 在 WWDC26 上新增了 `CalculateImageAestheticsScoresRequest`（美学评分）和 tap-to-segment API

**局限**：

- **需要 Swift bridge**：Python 调用需要 `pyobjc` 或写一个 Swift CLI 小工具
- **图片 only**：原生不支持视频（需要逐帧提取）
- **平台锁定**：只能在 macOS/iOS 上运行（但项目就是 macOS 本地开发）

**输出接口**（Swift）：

```swift
let request = VNGenerateAttentionBasedSaliencyImageRequest()
let handler = VNImageRequestHandler(url: imageURL)
try? handler.perform([request])
let observation = request.results?.first as? VNSaliencyImageObservation
// observation.heatMap — CVPixelBuffer 热力图
// observation.salientObjects — [VNNormalizedRect] bounding boxes
```

**来源**：

- Apple Developer Documentation（Tier 1）：https://developer.apple.com/documentation/vision/cropping-images-using-saliency
- WWDC 2019 Session 222（Tier 1）：https://developer.apple.com/videos/play/wwdc2019/222
- WWDC 2026 Session 237（Tier 1）：https://developer.apple.com/videos/play/wwdc2026/237
- Blake Crosley blog（Tier 2）：https://blakecrosley.com/blog/vision-framework-built-in/

---

### 3. Face Detection（人脸专用方案）

对于"CEO 说话""人物特写"类素材，人脸检测是最直接的手段：

| 方案         | 库          | 速度          | 精度                    | 模型大小     |
| ------------ | ----------- | ------------- | ----------------------- | ------------ |
| Haar Cascade | OpenCV 内置 | 极快（<50ms） | 低（false positive 多） | ~1MB（XML）  |
| HOG + SVM    | dlib        | 快（~100ms）  | 中                      | ~5MB         |
| YuNet        | OpenCV DNN  | 快（~100ms）  | 高                      | ~5MB（ONNX） |
| MediaPipe    | Google      | 极快（<50ms） | 高                      | ~3MB         |

**关键优势**：

- 人脸位置 = 不可遮挡区域，直接用 bounding box 避让
- OpenCV Haar Cascade **无需下载模型**（`haarcascade_frontalface_default.xml` 随 OpenCV 附带）
- 可与 saliency detection 组合：先 face detection，再 saliency 补充

**局限**：

- 只能检测人脸，不适用于产品/场景/数据类素材
- Haar Cascade 精度有限（侧脸、遮挡时容易漏检）
- 需要组合使用才能覆盖所有素材类型

**输出接口**：

```python
import cv2
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
# faces: [(x, y, w, h), ...] — 直接可用的 bounding box
```

**来源**：

- PyImageSearch（Tier 2）：https://pyimagesearch.com/2021/04/05/opencv-face-detection-with-haar-cascades/
- LearnOpenCV（Tier 2）：https://learnopencv.com/what-is-face-detection-the-ultimate-guide/

---

### 4. YOLO Object Detection（通用物体检测方案）

YOLO 系列模型可以检测 COCO 80 类物体的 bounding box：

| 模型     | 大小 | 速度（CPU） | 速度（GPU） | 精度 |
| -------- | ---- | ----------- | ----------- | ---- |
| YOLOv8n  | ~6MB | ~300ms      | ~10ms       | 中   |
| YOLOv11n | ~6MB | ~300ms      | ~10ms       | 中高 |
| YOLO26n  | ~6MB | ~300ms      | ~10ms       | 高   |

**关键优势**：

- 直接输出 bounding box + class label + confidence
- COCO 80 类包含 person、cell phone、laptop、tv 等常见物体
- 可以同时检测多个物体

**局限**：

- **需要下载模型**（~6MB，不大但需要管理）
- **CPU 速度一般**：~300ms/帧（对比 OpenCV saliency <100ms）
- **不覆盖所有素材类型**：COCO 80 类不包含"robot""data center"等领域特定物体
- **macOS MPS 支持有限**：YOLO 官方对 MPS 支持不稳定，主要靠 CPU

**来源**：

- Ultralytics 文档（Tier 1）：https://docs.ultralytics.com/tasks/detect
- arXiv 综述（Tier 1）：https://arxiv.org/html/2504.18586v1

---

### 5. SAM / SAM 2（Segment Anything Model）

Meta 的 SAM 可以对任意物体做像素级分割，也能输出 bounding box：

**关键优势**：

- **零样本分割**：不需要预定义类别，可以分割任意物体
- **高精度**：像素级 mask，比 bounding box 精确
- SAM 2 支持视频分割（实时跟踪）

**局限**：

- **模型大**：SAM base ~358MB，SAM 2 ~162MB（对比 OpenCV 0MB）
- **CPU 速度慢**：~2-5s/帧（不适合批量处理 20+ 素材）
- **macOS MPS 支持不完善**：主要设计为 GPU 推理
- **不输出语义信息**：只分割，不知道分割的是什么
- **过于复杂**：我们只需要 bounding box，不需要 pixel-level mask

**来源**：

- Ultralytics SAM 文档（Tier 1）：https://docs.ultralytics.com/models/sam
- Roboflow 教程（Tier 2）：https://blog.roboflow.com/how-to-use-segment-anything-model-sam

---

### 6. FFmpeg cropdetect（视频专用）

FFmpeg 内置 `cropdetect` filter 可以检测视频中的非黑区域：

| 模式            | 原理                | 用途                   |
| --------------- | ------------------- | ---------------------- |
| `black`（默认） | 检测黑边            | 去 letterbox/pillarbox |
| `mvedges`       | 运动向量 + 边缘检测 | 检测运动区域           |

**局限**：cropdetect 只检测**非黑区域**，不是 saliency——它无法判断画面中哪个物体是焦点，只能找到"有内容的区域"。对于我们的素材遮挡问题基本无用。

**来源**：

- FFmpeg Filters Documentation（Tier 1）：https://ffmpeg.org/ffmpeg-filters.html

---

### 7. SmartOverlays 论文（学术方案参考）

ICCVW 2019 论文 "SmartOverlays" 专门研究了"基于视觉显著性驱动的标签放置"：

- 定义了 **LOS (Label Occlusion over Saliency)** 度量指标
- 流程：生成 saliency map → 按显著度排序物体 → 依次放置标签到遮挡 salient region 最少的位置
- 三个优化目标：标签靠近对应物体、连接线不交叉、满足对角启发式和中心偏置

这验证了"saliency → 文字避让"的技术路线是可行的，但该论文使用自定义 saliency 模型，不适合直接使用。

**来源**：

- ICCVW 2019 paper（Tier 1）：https://openaccess.thecvf.com/content_ICCVW_2019/papers/OpenEDS/Hegde_SmartOverlays_A_Visual_Saliency_Driven_Label_Placement_for_Intelligent_Human-Computer_ICCVW_2019_paper.pdf

## Detailed Analysis

### 方案对比矩阵

| 维度             | OpenCV Saliency | Apple Vision       | Face Detection | YOLO        | SAM 2          |
| ---------------- | --------------- | ------------------ | -------------- | ----------- | -------------- |
| **安装成本**     | ✅ 已有         | ✅ macOS 内置      | ✅ 已有        | ⚠️ 下载 6MB | ❌ 下载 162MB+ |
| **速度（单张）** | <100ms          | <100ms             | <50ms          | ~300ms      | ~2-5s          |
| **输出**         | 热力图          | 热力图 + bbox      | 人脸 bbox      | 80类 bbox   | pixel mask     |
| **语义信息**     | ❌ 无           | ❌ 无              | ✅ "face"      | ✅ 80类标签 | ❌ 无          |
| **视频支持**     | 逐帧            | ❌ 图片 only       | 逐帧           | 逐帧        | ✅ 原生        |
| **GPU 依赖**     | ✅ 无           | ✅ 无              | ✅ 无          | ⚠️ CPU 慢   | ❌ 需要        |
| **macOS 兼容**   | ✅              | ✅                 | ✅             | ⚠️          | ⚠️             |
| **精度**         | 中              | 高                 | 高（人脸）     | 中高        | 最高           |
| **覆盖素材类型** | 全部            | 全部               | 仅人物         | 80类        | 全部           |
| **集成复杂度**   | 低              | 高（Swift bridge） | 低             | 中          | 高             |

### 推荐组合方案

**方案 A：OpenCV Saliency + Face Detection（推荐）**

两步组合：

1. **Face Detection（Haar Cascade）** — 先检测人脸，输出 bounding box
2. **OpenCV Saliency（Spectral Residual）** — 生成热力图，计算 salient region centroid

然后将 bounding box + salient centroid 映射到画面坐标系（top/center/bottom），驱动文字 slot 偏移。

**优势**：

- 零下载（OpenCV 自带全部模型）
- <200ms/张（对比 Qwen3-VL 18-20s，快 100 倍）
- 覆盖所有素材类型（人脸用 face detection，非人脸用 saliency）
- 可在 pre-render 阶段异步处理
- 与现有 `vlm_analyzer.py` 架构平行（另一个 Python action）

**输出方案**：

```python
def analyze_focus_region(image_path):
    """Return {region: 'top|center|bottom|full', face_boxes: [...], saliency_centroid: (x, y)}"""
    img = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Step 1: Face detection
    faces = face_cascade.detectMultiScale(gray, 1.1, 5)

    # Step 2: Saliency map
    saliency = cv2.saliency.StaticSaliencySpectralResidual_create()
    _, sal_map = saliency.computeSaliency(img)

    # Step 3: Determine region
    if len(faces) > 0:
        # Face region — use face centroid
        fx, fy = faces[0][0] + faces[0][2]//2, faces[0][1] + faces[0][3]//2
    else:
        # Saliency centroid — use weighted mean of salient pixels
        ys = np.arange(sal_map.shape[0])
        sal_y = np.sum(ys[:, None] * sal_map, axis=(0,1)) / np.sum(sal_map)

    # Map y to region (0-640=top, 640-1280=center, 1280-1920=bottom)
    region_y = (fy if len(faces) > 0 else sal_y) / img.shape[0]
    if region_y < 0.33:
        region = "top"
    elif region_y < 0.66:
        region = "center"
    else:
        region = "bottom"

    return {"region": region, "face_boxes": faces.tolist(), "saliency_centroid": ...}
```

---

**方案 B：Apple Vision Framework（次选，质量更高）**

写一个 Swift CLI 工具，通过 `VNGenerateAttentionBasedSaliencyImageRequest` 输出热力图和 bounding box，Python 通过 subprocess 调用。

**优势**：

- 质量最高（基于真人眼动数据训练）
- 直接输出 bounding box（不需要自己算）
- macOS 原生，零安装

**劣势**：

- 需要 Swift 开发（学习曲线 + bridge 复杂度）
- 图片 only（视频需要逐帧提取）
- 项目目前没有 Swift 代码

---

**方案 C：VLM 现有能力（当前基线，维持不变）**

继续使用 Qwen3-VLM 输出：

- `description`（高质量，保持）
- `fullscreen: true/false`（二元判断，稳定可用）
- 不依赖 `focusRegion`（不稳定，已验证）

## Contrarian Views & Risks

### 风险 1：OpenCV Saliency 精度可能不够

频谱残差法是 2007 年的算法，对于复杂场景（如多个物体、低对比度）精度有限。**缓解**：先用 4 张测试素材验证，如果精度不够则升级到 Apple Vision。

### 风险 2：Face Detection 对亚洲人脸可能精度下降

Haar Cascade 训练集偏向欧美人脸。**缓解**：使用 YuNet（OpenCV DNN，COCO 训练）替代 Haar Cascade，精度更高且仍然 <100ms。

### 风险 3：Saliency centroid 对"全景"素材可能无意义

全景图（如天际线）没有明确焦点，saliency map 会均匀分布。**缓解**：当 saliency 方差低于阈值时，fallback 到 `region: "full"` + `fullscreen: true`。

### 风险 4：视频需要逐帧分析

虽然方案 A 速度很快（<200ms/帧），但视频有 30fps × 5s = 150 帧，逐帧分析仍需 30s。**缓解**：只取首帧 + 1fps 采样（5 帧），<1s 完成。

## Open Questions

1. OpenCV Saliency 在实际素材上的精度如何？需要用 4 张测试图片验证。
2. Apple Vision Framework 的 Swift bridge 实现成本是否值得？方案 A 精度够用就不需要。
3. 如果方案 A + B 组合都不够精确，是否值得在 Kaggle/Colab GPU 上跑 YOLO？当前判断 ROI 不高。

## Sources

1. OpenCV Saliency API — https://docs.opencv.org/4.13.0/d8/d65/group__saliency.html — Tier 1
2. PyImageSearch OpenCV Saliency — https://pyimagesearch.com/2018/07/16/opencv-saliency-detection — Tier 2
3. GitHub image_saliency_opencv — https://github.com/ivanred6/image_saliency_opencv — Tier 3
4. Apple Vision Cropping Images Using Saliency — https://developer.apple.com/documentation/vision/cropping-images-using-saliency — Tier 1
5. WWDC 2019 Session 222: Understanding Images in Vision Framework — https://developer.apple.com/videos/play/wwdc2019/222 — Tier 1
6. WWDC 2026 Session 237: What's new in image understanding — https://developer.apple.com/videos/play/wwdc2026/237 — Tier 1
7. Blake Crosley: Apple Vision Framework — https://blakecrosley.com/blog/vision-framework-built-in — Tier 2
8. PyImageSearch Haar Cascades — https://pyimagesearch.com/2021/04/05/opencv-face-detection-with-haar-cascades — Tier 2
9. LearnOpenCV Face Detection Guide — https://learnopencv.com/what-is-face-detection-the-ultimate-guide — Tier 2
10. Ultralytics YOLO Object Detection — https://docs.ultralytics.com/tasks/detect — Tier 1
11. Ultralytics SAM Documentation — https://docs.ultralytics.com/models/sam — Tier 1
12. Roboflow SAM Tutorial — https://blog.roboflow.com/how-to-use-segment-anything-model-sam — Tier 2
13. FFmpeg cropdetect Filter — https://ffmpeg.org/ffmpeg-filters.html — Tier 1
14. SmartOverlays ICCVW 2019 Paper — https://openaccess.thecvf.com/content_ICCVW_2019/papers/OpenEDS/Hegde_SmartOverlays_A_Visual_Saliency_Driven_Label_Placement_for_Intelligent_Human-Computer_ICCVW_2019_paper.pdf — Tier 1
15. arXiv: A Decade of YOLO — https://arxiv.org/html/2504.18586v1 — Tier 1
