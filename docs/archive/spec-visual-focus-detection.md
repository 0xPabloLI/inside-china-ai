# Spec: 视觉焦点检测 + AI 分析层重构

> Status: **Revised v7 — v6 终审通过，P1 实现加固，进入实现**
> Created: 2026-08-17
> Revised: 2026-08-17 v2 (初审 P0-1~4 + P1-1~8), v3 (复审 P0-1~2 + P1-1~7), v4 (终审 P0-1~3 + P1-1~7), v5 (v4 复审 P0-1~2 + P1-1~5 + 消费者梳理), v6 (v5 复审 P1-1~4 + idle 统一 + exit 语义 + 输出边界 + golden 阻断), v7 (v6 终审 P1-1~2 + IdleTimer Event+Lock + 超时注入 + apply-media-patch 测试)
> Supersedes: `docs/specs/spec-asset-first-hook-media-focus-detection.md` §5 (改动 C)
> Related research: `docs/research/asset-focus-detection-alternatives.md` + `docs/research/asset-focus-detection-alternatives-review.md`
> Review: `docs/specs/spec-visual-focus-detection-review.md` (初审 + 复审)

## 1. 问题陈述

短视频管线的 AI 分析层（当前名 `ai-analyzer`）使用 Qwen3-VL-8B 做素材分析。VLM 测试发现：

- **VLM 擅长语义判断**（"这是什么"）→ `description` 稳定可用
- **VLM 不擅长空间定位**（"焦点在哪"）→ `focusRegion` 不稳定（同一张图两个 prompt 给出不同值），`overlay` 无梯度（全部输出 0.3）

> **注**（终审 P1-5）：VLM 当前只输出 `description` 和 `analyze_fit`（返回 fit/focus/reason）。`fullscreen` 作为媒体模式值存在于 `media-bg.mjs` 的 `VALID_MODES` 中，但 VLM 从不产出此字段。spec 不声称 VLM `fullscreen` 稳定可用。

需要一个**确定性、轻量的空间定位能力**与 VLM 互补。并行审阅指出：

1. **输出不应是 top/center/bottom 三分区**——丢失横向位置、多主体、面积信息
2. **必须做 source → 9:16 canvas 坐标变换**——`MediaBackground.tsx` 的 `objectFit: cover` + scale/translate 会让原图坐标失效
3. **"零下载、已有依赖"不成立**——项目当前无 OpenCV 依赖
4. **速度/精度数字需实测**——不能直接引用文档值

## 2. 方案概述

三个独立改动，按审阅建议分 commit 实施：

| 改动 | 描述 | 影响范围 | Commit |
|------|------|----------|--------|
| **A: 命名重构** | `ai-analyzer` → `visual-analyzer`（文件、模块、文档） | 全管线引用 | 独立 commit 1 |
| **B: 视觉焦点检测（图片 only）** | 新增独立 OpenCV 子进程，输出结构化保护区域 | 新建 2 文件 + 改 3 文件 | 独立 commit 2 |
| **C: analyzeFit 迁移策略** | 保留 fit 输出，停止把不稳定 focus 当真值 | `asset-sourcer.mjs` + `MediaField` 类型 | 合入 commit 2 |

### 不做什么

- **不做 slot 评分/候选矩形优化**——Phase 2 再做
- **不做坐标变换**——Phase 2 再做（需要接入 Remotion `MediaBackground` 的 cover/scale/translate 参数）
- **不做视频焦点检测**——Phase 1a 只支持图片；视频返回明确降级状态（审阅 P0-3）
- **不做素材先行 + Hook Media**——已在 `spec-asset-first-hook-media-focus-detection.md` 改动 A/B 中定义
- **不改 Remotion 渲染层**——Phase 1 的 `protectedRegions` 只写入 `media-patch.json` 供人工审阅，不自动改变文字位置（审阅 P0-1）

## 3. 改动 A: 命名重构

### 3.1 动机

`ai-analyzer` 暗示通用 AI 分析能力（含 NLP/文本）。实际只做视觉素材分析（VLM 图像/视频描述 + OpenCV 焦点检测）。改名 `visual-analyzer` 消除歧义。

### 3.2 重命名映射

| 当前 | 重命名后 | 性质 |
|------|---------|------|
| `lib/ai-analyzer.mjs` | `lib/visual-analyzer.mjs` | Node API 网关 |
| `lib/ai_analyzer.py` | `lib/vlm_analyzer.py` | VLM Python 子进程 |
| `lib/focus_detector.py` | （新建） | OpenCV Python 子进程 |
| `describeImage()` | 不变 | 公共 API |
| `describeVideo()` | 不变 | 公共 API |
| `analyzeFit()` | 保留（见改动 C） | 公共 API |
| `detectFocus()` | （新增） | 公共 API |
| `closeAnalyzer()` | `closeVisualAnalyzer()` | 同时关闭两个子进程 |

### 3.3 影响文件清单

**决策：一次性全量改完**（不保留兼容层）。审阅 P1-8 指出兼容层增加维护负担且无法回滚测试。重命名作为独立 commit，先于功能改动。

实施前执行仓库级检索：
```bash
grep -rn 'ai-analyzer\|ai_analyzer\|aiAnalyzer\|closeAnalyzer' \
  --include='*.mjs' --include='*.py' --include='*.ts' --include='*.tsx' --include='*.md' \
  scripts/short-video/ docs/ README.md
```

**代码文件**（需改 import / 函数名）：
- `lib/asset-sourcer.mjs` — `import("./ai-analyzer.mjs")` → `import("./visual-analyzer.mjs")`
- `__tests__/ai-analyzer.test.mjs` → `__tests__/visual-analyzer.test.mjs`
- `__tests__/asset-sourcer-ai-integration.test.mjs` → `__tests__/asset-sourcer-visual-integration.test.mjs`

**文档文件**（需改引用）：
- `scripts/short-video/README.md`
- `README.md`（根目录）

**活动文档**（非 archive，需改引用）：
- `docs/specs/spec-asset-first-hook-media-focus-detection.md` — §5 引用了旧模块名
- `docs/research/asset-focus-detection-alternatives.md` — §4.1 提到 `ai_analyzer.py`
- `docs/content-pipeline.md` — Stage 3b 提到 AI analysis

**归档文件**：不改（`docs/archive/` 下的历史文档保持原名）

## 4. 改动 B: 视觉焦点检测（图片 only）

### 4.1 架构

```
scripts/short-video/lib/
  ├── visual-analyzer.mjs       ← 统一 Node API 网关
  │   ├─ describeImage()       → 转发给 vlm_analyzer.py (VLM, ~11GB)
  │   ├─ describeVideo()       → 转发给 vlm_analyzer.py
  │   ├─ analyzeFit()           → 转发给 vlm_analyzer.py
  │   ├─ detectFocus()          → 转发给 focus_detector.py (OpenCV)  ← NEW
  │   ├─ closeVisualAnalyzer()  → 关闭两个子进程
  │   └─ 生命周期管理：两个独立 Python 子进程
  │
  ├── vlm_analyzer.py           ← VLM 子进程（重命名自 ai_analyzer.py，内容不变）
  ├── focus_detector.py          ← OpenCV 子进程（新建）
  │
  └── asset-sourcer.mjs          ← 编排层（改 import + analyzeAssets 流程）
```

### 4.2 两个子进程的生命周期

| 子进程 | 脚本 | 内存（目标） | 启动时间（待测） | idle 超时 | 用途 |
|--------|------|------------|----------------|-----------|------|
| VLM | `vlm_analyzer.py` | ~11GB | 12-17s | 5min（已有） | description + analyzeFit |
| Focus | `focus_detector.py` | ~200MB（待测） | <1s（待测） | 60s（新建） | protectedRegions + saliency |

> 以上内存和速度数字均为**目标/待测值**，不是文档引用值。实施后需回填实测 P50/P95、冷/热启动与峰值 RSS。

**顺序执行策略**（峰值不叠加）：

```
Phase 1: detectFocus() 批量调用  → try/finally 确保关闭 → closeFocusDetector() → 释放 focus 内存
Phase 2: describeImage/Video()   → 完成后 closeVisualAnalyzer() → 释放 VLM 内存
```

**failure-safe 契约**（初审 P0-4 + 复审 P0-1）：`detectFocus()` **永不 reject**。失败时返回 schema 完整的空结果 + `status: "degraded"` + `errorCode`，不阻塞 VLM 阶段。`analyzeAssets()` 中用 `try/finally` 确保关闭 focus 子进程。

**IPC 请求关联与超时隔离**（终审 P0-1 修复：双端协议闭环 + pending Promise 结算）：

1. **requestId 路由（双端闭环）**：请求与响应都含 `requestId`（UUID v4）。Node 网关生成 requestId 并注入请求；Python 主循环读取 requestId 并在每个响应信封中回写同一值。网关按 ID 路由，不按 FIFO 假定一进一出。

   ```json
   // stdin request (Node → Python)
   {"requestId": "uuid-v4", "action": "analyze", "path": "/abs/path.jpg"}

   // stdout response (Python → Node)
   {"requestId": "uuid-v4", "result": {"status": "ok", "errorCode": null, "frame": {}, "protectedRegions": [], "saliency": {}}}
   ```

   Python 主循环协议（伪代码，v6 P1-1: idle timer 统一为 IdleTimer 单一状态源；v5 P0-2: dispatch 包装器保证每请求一个响应）：
   ```python
   import json, sys

   def write_envelope(req_id, result):
       """Write a single response envelope to stdout."""
       response = {"requestId": req_id, "result": result}
       sys.stdout.write(json.dumps(response) + "\n")
       sys.stdout.flush()

   def dispatch(req_id, action, path, timer):
       """v5 P0-2: dispatch wrapper — guarantees every valid analyze request gets a response."""
       timer.touch()  # v6 P1-1: mark activity at dispatch start
       try:
           result, _ = handle_analyze(path)
       except Exception as exc:
           sys.stderr.write(f"[focus_detector] Handler exception for {req_id}: {exc}\n")
           sys.stderr.flush()
           result = _degraded("focus_internal_error")
       timer.touch()  # v6 P1-1: mark activity after long analysis
       write_envelope(req_id, result)

   # v6 P1-1: IdleTimer is the single source of truth for activity state.
   # See §4.4 for IdleTimer class definition. No scalar last_activity here.
   timer = IdleTimer(timeout=60)
   timer.start()

   for line in sys.stdin:
       line = line.strip()
       if not line:
           continue
       timer.touch()  # v6 P1-1: mark activity on receive

       try:
           request = json.loads(line)
       except json.JSONDecodeError:
           sys.stderr.write(f"[focus_detector] Invalid JSON: {line[:200]}\n")
           sys.stderr.flush()
           continue  # invalid JSON: no requestId, skip, keep reading

       req_id = request.get("requestId", "")
       action = request.get("action", "")

       if action == "exit":
           timer.stop()  # v6 P1-1: stop timer before exit
           break
           # exit is a no-response control command — see §4.3
       elif action == "analyze":
           path = request.get("path", "")
           dispatch(req_id, action, path, timer)  # v5 P0-2: never leaves loop
       else:
           write_envelope(req_id, _degraded("focus_protocol_error"))
   ```

2. **`pending: Map<requestId, {resolve, timer, workerGeneration}>`**（终审 P0-1 核心）：Node 网关用 Map 跟踪每个待完成请求。`detectFocus()` 返回的 Promise 只在自身 `requestId` 匹配的响应到达时 resolve。

3. **`FOCUS_RESPONSE_TIMEOUT_MS`**：初始值 10_000（10s）。超时时当前请求 resolve 为 `{status: "degraded", errorCode: "focus_timeout", ...}`。最终值以本机 P95 实测校准。

4. **worker 隔离与 pending 结算**（终审 P0-1 关键修复）：超时、stdout 非 JSON、子进程 exit 或 pipe 写入失败后，网关必须：
   a. 标记旧 worker 为失效（increment `workerGeneration`）
   b. **逐一 resolve** 属于该 worker generation 的所有 pending 项为完整的 `{status: "degraded", errorCode: "focus_worker_reset", frame: null, protectedRegions: [], saliency: {available: false, ...}}`——不得只删除引用而不结算，否则 Promise 永久 pending，违背 "永不 reject / 所有 Promise resolve" 承诺
   c. 终止旧子进程，后续请求使用新进程
   d. 旧 worker 的晚到响应必须被丢弃（`workerGeneration` 不匹配或 `requestId` 不在 pending Map 中时忽略）

5. **`closeFocusDetector()` 幂等**：多次调用不抛错。关闭时也结算所有 pending Promise 为 `focus_worker_reset` 降级结果。Phase 1 `finally` 关闭后，调用方随后的 `closeVisualAnalyzer()` 再次关闭不影响 VLM。

6. **协议测试 fixture**（§8）：
   - 请求 A 超时后晚到响应、请求 B 紧随其后 → B 绝不拿到 A 的结果
   - 两个并发请求在 worker exit 时均在 timeout 内返回 schema 完整的 `focus_worker_reset` 降级结果（终审 P0-1 新增）

### 4.3 `focus_detector.py` 设计

**IPC 协议**（与 `vlm_analyzer.py` 同模式：stdin JSON → stdout JSON，信封含 `requestId`——终审 P0-1）：

```
stdin (Node → Python):
  - analyze:  {"requestId": "uuid-v4", "action": "analyze", "path": "/abs/path/to/file.jpg"}
  - exit:     {"action": "exit"}               ← v6 P1-2: 无响应控制命令，不需要 requestId

stdout (Python → Node):
  - result:   {"requestId": "uuid-v4", "result": {<focus_analysis_output>}}
```

> **v6 P1-2: 控制命令语义明确**。`exit` 是**无响应的控制命令**，不进入 Node 的 `pending` Map，Node 以进程关闭或 SIGTERM 作为完成条件。“每个有效请求均有且仅有一个同 requestId 的响应”仅适用于 `analyze`。Node 发送 `exit` 后不等信封，直接进入 kill timer（先等进程自然退出 100ms，超时则 SIGTERM）。

> Python 主循环在处理 `analyze` 请求时，无论成功、失败、unsupported 还是异常，每个 `analyze` 请求都必须有且仅有一个对应 `requestId` 的响应信封。`exit` 不产生响应。

**Phase 1a 限制**（初审 P0-3 + 终审 P1-1）：只支持静态图片。使用**允许的图片格式白名单**判定，非图片格式返回 `unsupported_media_type`，不进入 Pillow/cv2 解码路径。

```
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}
```

视频文件（.mp4/.mov/.avi/.mkv/.webm/.m4v 等）和非图片文件返回 `unsupported` + `unsupported_media_type` 或 `video_not_supported`。

**输出契约**（采纳审阅修正：结构化保护区域 + 归一化坐标 + status + orientationNormalized）：

```json
{
  "status": "ok",
  "errorCode": null,
  "frame": {
    "width": 1920,
    "height": 1080,
    "orientation": "landscape",
    "orientationNormalized": true
  },
  "protectedRegions": [
    {
      "rect": [0.31, 0.10, 0.20, 0.42],
      "kind": "face",
      "confidence": null,
      "confidenceKind": "not_provided"
    }
  ],
  "saliency": {
    "available": true,
    "dispersion": 0.62,
    "centroid": [0.45, 0.38]
  }
}
```

**字段语义**（终审 P0-3：枚举收敛为单一契约）：

- `status` ∈ `"ok" | "partial" | "low_information" | "degraded" | "unsupported"`
  - `ok`：正常分析完成
  - `partial`：saliency 计算失败但人脸检测有效（或反之）——部分结果可用
  - `low_information`：saliency 方差极低（全景图/纯色图），保护区域为空但分析已执行
  - `degraded`：OpenCV 不可用、图片损坏、分类器加载失败、超时、worker reset 等错误
  - `unsupported`：视频文件或非图片格式（Phase 1a 不支持）

- `errorCode` 统一枚举表（v5 P0-1/P0-2: 新增 `focus_internal_error` / `focus_dependency_not_available` / `pillow_not_available` / `numpy_not_available`）：

  | `status` | 允许的 `errorCode` |
  |---|---|
  | `ok` / `low_information` | `null` |
  | `partial` | `saliency_compute_failed` |
  | `degraded` | `opencv_not_available`、`pillow_not_available`、`numpy_not_available`、`focus_dependency_not_available`、`classifier_load_failed`、`cannot_read_image`、`saliency_compute_failed`、`focus_timeout`、`focus_worker_reset`、`focus_protocol_error`、`focus_internal_error` |
  | `unsupported` | `video_not_supported`、`unsupported_media_type` |
- `rect` = `[x, y, w, h]`，归一化 [0, 1]，相对于**原图（已规范化方向后）**
- `kind` ∈ `"face"`（Phase 1a 只产出此值；`"body"` / `"text"` / `"object"` 为保留值，本期不会产生）
- `confidence`：Phase 1a 始终为 `null`（Haar 无内置 confidence，不使用伪精度固定值）。`confidenceKind` = `"not_provided"`。Phase 2 切换 YuNet 后使用模型原生分数（`confidenceKind: "model"`）。
- `saliency.dispersion`：saliency map 方差归一化值（**不伪装为概率置信度**）。缩放因子 `min(variance * SCALING_FACTOR, 1.0)` 中 `SCALING_FACTOR` 为待标定配置项，初始值 10.0
- `frame.orientationNormalized`：是否已做 EXIF rotation 校正（复审 P0-2，见 §4.3 坐标规范化）
- `saliency.centroid` = `[cx, cy]`，归一化加权质心

**算法选择**：

| Step | 算法 | 来源 | 输出 |
|------|------|------|------|
| 1 | Haar Cascade Face Detection | OpenCV 自带 `haarcascade_frontalface_default.xml` | 人脸 bounding box（全部，不只第一个） |
| 2 | Static Saliency Spectral Residual | `cv2.saliency.StaticSaliencySpectralResidual_create()` | 热力图 → centroid + dispersion |

**人脸 = 硬保护区；saliency = 始终计算的软信号**（审阅 P1-2 修正）。两者独立计算，不互斥。

**坐标规范化**（初审 P1-5 + 复审 P0-2）：**Phase 1a 实现 EXIF 规范化**。使用 Pillow `ImageOps.exif_transpose()` 校正方向后再转 OpenCV 数组。原点为左上。坐标相对已规范化的 source frame。输出 `frame.orientationNormalized: true`。增加旋转 90°/180°/270° JPEG fixture 与人脸框回归测试。

> 不能以"Pexels/Unsplash 通常已处理"作为契约依据；这既没有验收机制，也无法覆盖用户手动素材。EXIF 规范化是本期唯一价值（让人工看懂源图中的保护区域）的前提——方向错了框就错了。

### 4.4 `focus_detector.py` 伪代码

```python
# ─── v5 P0-1: 延迟加载依赖，避免模块顶层导入崩溃 ───

import os
import sys
import json
import time
import threading

_DEPS = None
_DEP_ERROR = None


def load_deps():
    """Lazy-load cv2, numpy, PIL. Returns tuple or None on failure."""
    global _DEPS, _DEP_ERROR
    if _DEPS is not None:
        return _DEPS
    if _DEP_ERROR is not None:
        return None
    try:
        import cv2
        import numpy as np
        from PIL import Image, ImageOps, UnidentifiedImageError
        _DEPS = (cv2, np, Image, ImageOps, UnidentifiedImageError)
    except ImportError as exc:
        _DEP_ERROR = exc
        sys.stderr.write(f"[focus_detector] Dependency import failed: {exc}\n")
        sys.stderr.flush()
    return _DEPS


_face_cascade = None
_cascade_loaded = False

# v5 P1-1: 图片格式白名单
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}
VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".flv"}


def init_classifier():
    """Load Haar Cascade once at startup. Set _cascade_loaded flag."""
    global _face_cascade, _cascade_loaded
    deps = load_deps()
    if deps is None:
        _cascade_loaded = False
        return
    cv2 = deps[0]
    try:
        _face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        _cascade_loaded = not _face_cascade.empty()
    except Exception:
        _cascade_loaded = False

# Call init_classifier() once at process start, before main loop.


def _degraded(error_code):
    """Return a schema-complete degraded result."""
    return {
        "status": "degraded",
        "errorCode": error_code,
        "frame": None,
        "protectedRegions": [],
        "saliency": {"available": False, "dispersion": 0.0, "centroid": [0.5, 0.5]},
    }


def _unsupported(error_code):
    """Return a schema-complete unsupported result."""
    return {
        "status": "unsupported",
        "errorCode": error_code,
        "frame": None,
        "protectedRegions": [],
        "saliency": {"available": False, "dispersion": 0.0, "centroid": [0.5, 0.5]},
    }


def handle_analyze(path):
    """Analyze a static image. Returns (result_dict, error_string)."""
    # v5 P1-1: 图片格式白名单判定
    ext = os.path.splitext(path)[1].lower()
    if ext in VIDEO_EXTS:
        return _unsupported("video_not_supported"), None
    if ext not in ALLOWED_IMAGE_EXTS:
        return _unsupported("unsupported_media_type"), None

    # v5 P0-1: 延迟加载依赖
    deps = load_deps()
    if deps is None:
        # 依赖不可用——返回准确的 errorCode 而非崩溃
        missing = str(_DEP_ERROR) if _DEP_ERROR else "unknown"
        if "cv2" in missing or "opencv" in missing.lower():
            return _degraded("opencv_not_available"), None
        elif "PIL" in missing or "pillow" in missing.lower():
            return _degraded("pillow_not_available"), None
        elif "numpy" in missing.lower():
            return _degraded("numpy_not_available"), None
        return _degraded("focus_dependency_not_available"), None

    cv2, np, Image, ImageOps, UnidentifiedImageError = deps

    # ── Check classifier ──
    if not _cascade_loaded:
        return _degraded("classifier_load_failed"), None

    # v4 P0-2: 单一规范化入口（EXIF + 颜色模式 + 异常映射）
    def load_normalized_rgb(path):
        """Load image with EXIF rotation + RGB conversion."""
        with Image.open(path) as source:
            normalized = ImageOps.exif_transpose(source).convert("RGB")
            return np.asarray(normalized).copy()

    try:
        rgb = load_normalized_rgb(path)
    except (UnidentifiedImageError, OSError, Exception) as e:
        sys.stderr.write(f"[focus_detector] Cannot read image {path}: {e}\n")
        sys.stderr.flush()
        return _degraded("cannot_read_image"), None

    img = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # ── Step 1: Face detection — output ALL faces ──
    faces = _face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5
    )

    protected = []
    for (fx, fy, fw, fh) in faces:
        protected.append({
            "rect": [fx / w, fy / h, fw / w, fh / h],
            "kind": "face",
            "confidence": None,
            "confidenceKind": "not_provided",
        })

    # ── Step 2: Saliency — always compute as soft signal ──
    sal_success = False
    sal_map = None
    try:
        saliency = cv2.saliency.StaticSaliencySpectralResidual_create()
        sal_success, sal_map = saliency.computeSaliency(img)
    except Exception as e:
        sys.stderr.write(f"[focus_detector] Saliency computation error: {e}\n")
        sys.stderr.flush()
        sal_success = False

    sal_dispersion = 0.0
    sal_centroid = [0.5, 0.5]
    if sal_success and sal_map is not None:
        sal_variance = float(np.var(sal_map))
        sal_dispersion = min(sal_variance * 10.0, 1.0)
        ys = np.arange(h)
        xs = np.arange(w)
        total = np.sum(sal_map) + 1e-8
        sal_cy = float(np.sum(ys[:, None] * sal_map) / total) / h
        sal_cx = float(np.sum(xs[None, :] * sal_map) / total) / w
        sal_centroid = [sal_cx, sal_cy]

    # ── Determine status ──
    if not sal_success and len(protected) == 0:
        status = "degraded"
        error_code = "saliency_compute_failed"
    elif not sal_success and len(protected) > 0:
        status = "partial"
        error_code = "saliency_compute_failed"
    elif sal_dispersion < 0.01 and len(protected) == 0:
        status = "low_information"
        error_code = None
    else:
        status = "ok"
        error_code = None

    return {
        "status": status,
        "errorCode": error_code,
        "frame": {
            "width": w, "height": h,
            "orientation": "landscape" if w > h else "portrait",
            "orientationNormalized": True,
        },
        "protectedRegions": protected,
        "saliency": {
            "available": sal_success,
            "dispersion": sal_dispersion,
            "centroid": sal_centroid,
        },
    }, None


# v7 P1-1: IdleTimer — 复用 vlm_analyzer.py 的 Event+Lock 模式，轮询粒度 10s
# 不复制两个不同形状的 last_activity；timeout 可注入用于测试
class IdleTimer:
    """Single source of truth for activity state. Daemon thread exits after timeout.
    Uses Event.wait(poll_interval) instead of sleep(timeout) to avoid doubling."""
    def __init__(self, timeout=60, poll_interval=None):
        self.timeout = timeout
        # v7 P1-1: 轮询粒度 = min(10, timeout/10)，保证退出上界 ≤ timeout + poll_interval
        self._poll = poll_interval or min(10.0, timeout / 10.0)
        self._last = time.monotonic()
        self._lock = threading.Lock()       # v7 P1-1: lock 保护 _last
        self._stop = threading.Event()       # v7 P1-1: Event 替代裸 boolean
        self._thread = None

    def touch(self):
        """Mark activity. Called on receive, dispatch start, and after analysis."""
        with self._lock:
            self._last = time.monotonic()

    def start(self):
        """Start daemon watchdog thread."""
        self._thread = threading.Thread(target=self._watchdog, daemon=True)
        self._thread.start()

    def stop(self):
        """Stop timer before graceful exit."""
        self._stop.set()

    def _watchdog(self):
        # v7 P1-1: Event.wait(poll) 每 poll 秒醒来检查，不会把 timeout 翻倍
        while not self._stop.wait(self._poll):
            with self._lock:
                elapsed = time.monotonic() - self._last
            if elapsed >= self.timeout:
                sys.stderr.write(f"[focus_detector] Idle {int(elapsed)}s, exiting.\n")
                sys.stderr.flush()
                os._exit(0)

# In main: timer = IdleTimer(timeout=60); timer.start()
# For tests: timer = IdleTimer(timeout=0.1, poll_interval=0.05)
# Call timer.touch() on each received line, at dispatch start, and after analysis.
# Call timer.stop() before break on exit.
```

### 4.5 `visual-analyzer.mjs` 新增 API

```javascript
/**
 * Detect focus regions and protected areas in an image.
 * Uses OpenCV Saliency + Face Detection (lightweight subprocess).
 * Independent from VLM — does NOT load the 11GB model.
 *
 * NEVER rejects. On failure, returns a schema-complete empty result
 * with status="degraded" or "unsupported".
 *
 * status ∈ {"ok", "partial", "low_information", "degraded", "unsupported"}
 * errorCode ∈ {null, "opencv_not_available", "pillow_not_available",
 *   "numpy_not_available", "focus_dependency_not_available",
 *   "classifier_load_failed", "cannot_read_image",
 *   "saliency_compute_failed", "focus_timeout",
 *   "focus_worker_reset", "focus_protocol_error",
 *   "focus_internal_error",
 *   "video_not_supported", "unsupported_media_type"}
 *
 * Phase 1a: only supports static images. Video files return
 * status="unsupported" without calling cv2.imread().
 *
 * @param {string} assetPath - Absolute path to image file.
 * @returns {Promise<{status: string, errorCode: string|null, frame: Object|null,
 *   protectedRegions: Array, saliency: Object}>}
 */
export function detectFocus(assetPath) { ... }

/**
 * Close the focus detector subprocess.
 * Does NOT close the VLM subprocess.
 */
export function closeFocusDetector() { ... }

/**
 * Close both subprocesses (VLM + focus detector).
 */
export function closeVisualAnalyzer() { ... }
```

### 4.6 `asset-sourcer.mjs` 集成

**关键修正**（审阅 P0-2 + P0-4）：保留现有 `analyzeFit()` 调用逻辑，新增 focus detection 为独立前置阶段，`try/finally` 确保资源释放。

```javascript
export async function analyzeAssets(assets) {
  const { describeImage, describeVideo, analyzeFit, detectFocus,
          closeFocusDetector, closeVisualAnalyzer } =
    await import("./visual-analyzer.mjs");
  const { checkResolution } = await import("./upscale.mjs");

  // ── Phase 1: Focus detection (fast, lightweight) ──
  // detectFocus NEVER rejects — see failure-safe contract in §4.2
  try {
    for (const asset of assets) {
      if (!asset.path) continue;
      const focus = await detectFocus(asset.path);
      asset.focusAnalysis = focus;
    }
  } finally {
    await closeFocusDetector();  // always release focus subprocess
  }

  // ── Phase 2: VLM description + analyzeFit (existing logic preserved) ──
  const report = [];
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const absPath = asset.path || "";
    if (!absPath) {
      report.push({ path: "", description: "", success: false, analysisTimeMs: 0 });
      continue;
    }

    const startTime = Date.now();
    console.log(`  🔍 Analyzing: ${absPath}... (${i + 1}/${assets.length})`);

    // ── Existing: VLM description ──
    let description = "";
    let success = false;
    try {
      if (asset.type === "video") {
        description = await describeVideo(absPath);
      } else {
        description = await describeImage(absPath);
      }
      success = description.length > 0;
    } catch (err) {
      console.warn(`  ⚠️  Analysis failed for ${absPath}: ${err.message}`);
    }

    // ── Existing: analyzeFit for landscape assets (审阅 P0-2: 保留) ──
    // 改动 C: 保留 fit 输出，但不再把不稳定的 focus 当真值
    try {
      const res = checkResolution(absPath);
      const aspect = res.height > 0 ? res.width / res.height : 0;
      if (aspect > 1.2) {
        console.log(`  📐 Landscape asset (aspect ${aspect.toFixed(2)}), analyzing fit...`);
        const fitResult = await analyzeFit(absPath);
        if (fitResult.fit) {
          asset.aiFit = fitResult.fit;       // 保留 — fit 相对稳定
          // 不再回写 asset.aiFocus — focus 由 detectFocus() 的 protectedRegions 替代
          asset.aiFitReason = fitResult.reason || "";
          console.log(`     → fit: ${fitResult.fit}`);
        }
      }
    } catch (fitErr) {
      console.warn(`  ⚠️  Fit analysis skipped for ${absPath}: ${fitErr.message}`);
    }

    const analysisTimeMs = Date.now() - startTime;
    asset.aiDescription = description;

    report.push({ path: absPath, description, success, analysisTimeMs });
  }
  // closeVisualAnalyzer() called by caller in finally block (existing pattern)
  return report;
}
```

### 4.7 数据消费（审阅 P0-1 修正）

**`focusAnalysis` 不进入 `media` 对象**（`assignAssetsToScenes()` 是白名单构造，不会自动透传未知字段）。Phase 1 将其置于 `media-patch.json` 的顶层 `analysis` 字段，供人工审阅：

```json
{
  "sceneId": 3,
  "sceneName": "Unitree Demo",
  "visualType": "narrative",
  "media": {
    "type": "image",
    "path": "content/unitree/assets/unitree-demo.jpg",
    "source": "pexels",
    "animation": "fade",
    "overlay": 0.7,
    "fit": "cover"
  },
  "analysis": {
    "focusAnalysis": {
      "status": "ok",
      "errorCode": null,
      "frame": {
        "width": 1920,
        "height": 1080,
        "orientation": "landscape",
        "orientationNormalized": true
      },
      "protectedRegions": [
        {"rect": [0.31, 0.10, 0.20, 0.42], "kind": "face", "confidence": null, "confidenceKind": "not_provided"}
      ],
      "saliency": {
        "available": true,
        "dispersion": 0.62,
        "centroid": [0.45, 0.38]
      }
    }
  },
  "assetScore": 85,
  "source": "pexels",
  "status": "assigned"
}
```

> `protectedRegions` 是**源图坐标系中的分析产物**，本期只写入 `media-patch.json` 供人工审阅和后续阶段消费。它不会在本期直接改变 Remotion 的文字位置、`objectPosition` 或 `fit`。当没有可用视觉信号时，响应仍为 schema 有效的分析结果，并通过 `status` / `errorCode` 表达低信息或降级原因。

**Phase 1 消费者与行动规则**（v5 P1-4 + 消费者梳理）：

| 消费者 | 渠道 | 行动规则 |
|--------|------|---------|
| **创作者（人工审阅）** | `media-patch.json` → `analysis.focusAnalysis` | `status=ok`：参考 `protectedRegions` 手动避开人脸/主体区域放置文字。`status=partial`：`protectedRegions` 可用但 `saliency` 不可用——依据人脸框放置，跳过 salience 辅助。`status=low_information`：无保护区域，正常放置。`status=degraded`：忽略 focusAnalysis，按默认位置放置。`status=unsupported`（视频素材）：不适用，按 VLM description 判断。 |
| **`apply-media-patch.mjs`**（格式化输出工具） | 读取 `media-patch.json` | **v6 P1-3: 输出人工审阅摘要，不输出可复制的 `analysis` 字段**。在 `media: { ... }` 代码块上方输出注释形式的人工审阅摘要。`status=ok`/`partial`：输出可读摘要（status、protectedRegions rect 列表、saliency available/unavailable）。`status=degraded`/`unsupported`：输出 warning 行。复制的 `media` 对象保持既有 `MediaField` 合法形状，不含 `analysis` 或 `focusAnalysis`。 |

**Phase 2 消费者候选**（本 spec 不实施，列此供后续接入）：

| 消费者 | 路径 | 接入方式 |
|--------|------|---------|
| Remotion `MediaBackground.tsx` | `remotion/src/components/MediaBackground.tsx` | 读取 `protectedRegions` 做 slot 评分 + `objectPosition` 偏移。需做 source → 9:16 canvas 坐标变换（`objectFit: cover` + scale/translate）。 |
| `verify-video.mjs` | `scripts/short-video/verify-video.mjs` | 帧分析检查文字是否遮挡 `protectedRegions`（需坐标变换到渲染帧坐标系）。 |
| `scene-layout.mjs` | `lib/scene-layout.mjs` | `SLOTS` 布局可参考 `protectedRegions` 动态调整 slot 位置（当前为固定像素 slot）。 |

**`assignAssetsToScenes()` 需新增字段映射**：在构造 patch 条目时，显式复制 `asset.focusAnalysis` 到 `analysis.focusAnalysis`。

### 4.8 改动 C: analyzeFit 迁移策略

审阅 P0-2 指出 `MediaBackground.tsx` 仍消费 `media.fit` 和 `media.focus`。

**决策**：
- **保留 `analyzeFit()` 的 `fit` 输出**（cover vs contain）——fit 相对稳定，且 Remotion 需要它
- **停止回写 `asset.aiFocus`**——focus 由 `detectFocus()` 的 `protectedRegions` 替代
- **`analyzeFit()` 解析器解耦**（复审 P1-4 + 终审确认）：当前 `_parse_fit_output()` 和 `parseFitResponse()` 要求 fit 与 focus 同时有效才返回结果。修改为 `fit` 必填、`focus` 可选。解析器单独校验 `fit`，focus 缺失/无效时仍保留 fit。旧 scene-data 已有 `media.focus` 可继续渲染，但新自动分析不再写它。增加"fit 有效、focus 缺失仍保留 fit"的回归测试。

  ```python
  # 修改后：fit 必填，focus 可选
  if fit in ("cover", "contain"):
      # focus 可以为 None 或无效——不再丢弃整个结果
      return fit, focus, reason or ""
  return None, None, ""
  ```
- **`MediaField.focus` 字段保留但标注为 deprecated**——现有 scene-data 中的 `focus` 值仍被渲染层使用，不做破坏性删除
- **不修改 Remotion `MediaBackground.tsx`**——Phase 2 再接入 protectedRegions

`types.ts` 变更：

```typescript
export interface MediaField {
  type: "image" | "video";
  path: string;
  mode?: "background" | "fullscreen";
  fit?: "cover" | "contain";
  /** @deprecated Replaced by protectedRegions from detectFocus() in Phase 2. */
  focus?: "top" | "center" | "bottom";
  source?: string;
  animation?: "fade" | "ken-burns" | "slide" | "zoom" | "none";
  overlay?: number;
  volume?: number;
}
```

## 5. 依赖管理

### 5.1 新增依赖

| 包 | 安装位置 | 版本 | 大小 | 许可 |
|----|---------|------|------|------|
| `opencv-contrib-python` | `~/.video-tts-env` | **锁定版本**（安装时 `pip install opencv-contrib-python==4.10.0.84`，实测后回填到 requirements） | ~80MB | Apache 2.0 |
| `numpy` | 已有 | — | — | — |
| `Pillow` | 已有（VLM 代码已使用） | — | — | — |

> 依赖版本**锁定精确版本号**，不使用 `latest`。安装后记录 Python 版本、平台、Haar XML 版本，纳入 preflight 检查。

`opencv-contrib-python` 包含 `cv2.saliency` 模块（普通 `opencv-python` 不含）。

### 5.2 依赖版本锁定文件（终审 P1-3）

新建 `scripts/short-video/lib/requirements-focus.txt`，作为 focus_detector.py 依赖的唯一来源：

```text
# focus_detector.py dependencies — pinned versions (v5 P1-1)
# 实测后冻结精确版本号，不使用 >= 范围
opencv-contrib-python==4.10.0.84
Pillow==10.4.0
numpy==1.26.4
```

> 此文件在同一 commit 中创建并加入 preflight 检查。安装命令：
> `pip install -r scripts/short-video/lib/requirements-focus.txt`

### 5.3 Haar Cascade 数据文件

`haarcascade_frontalface_default.xml` 随 `opencv-contrib-python` 安装，位于 `cv2.data.haarcascades` 目录。无需单独下载。加载时检查 `CascadeClassifier.empty()`。

## 6. Modified Files Impact

### Section 1: Modified Files

| 文件 | 修改内容 | 风险 | 评估 |
|------|---------|------|------|
| `lib/ai-analyzer.mjs` → `lib/visual-analyzer.mjs` | 重命名 + 新增 `detectFocus()` + `closeFocusDetector()` + `closeVisualAnalyzer()`。内部管理两个子进程。 | **Medium** | 独立 commit。缓解：全量改完，仓库级 grep 确认无遗漏。 |
| `lib/ai_analyzer.py` → `lib/vlm_analyzer.py` | 纯重命名，内容不变。 | **Low** | 只影响 `visual-analyzer.mjs` 中的路径引用。 |
| `lib/focus_detector.py` | 新建。OpenCV IPC 子进程。 | **Low** | 纯新增文件，不改现有代码。 |
| `lib/requirements-focus.txt` | 新建。focus_detector.py 依赖版本锁定。 | **Low** | 纯新增文件（终审 P1-3）。 |
| `lib/focus-detector-benchmark.mjs` | 新建。性能 benchmark 脚本。 | **Low** | 纯新增文件（终审 P1-4/P1-7）。输出到 `experiments/focus-benchmark/`（gitignored）。 |
| `__tests__/fixtures/exif/` | 新建目录。EXIF 旋转 90°/180°/270° JPEG fixtures。 | **Low** | 测试素材（终审 P1-4）。 |
| `__tests__/fixtures/benchmark/` | 新建目录。受控 benchmark fixture（已知人脸/无脸/纯色图）。 | **Low** | v5 P1-2。 |
| `__tests__/fixtures/golden/` | 新建目录。golden fixture（人工标注的正面照/合照）。**v6 P1-4: 硬门槛阻断回归——不通过 = CI 红**。 | **Low** | v5 P1-5 + v6 P1-4。 |
| `__tests__/fixtures/baseline/` | 新建目录。baseline observation fixture（遮挡/侧脸/低光样本）。记录命中/漏检率，不阻断回归。 | **Low** | v6 P1-4。 |
| `apply-media-patch.mjs` | 新增人工审阅摘要输出（注释形式，不进入 `media` 代码块）。 | **Low** | v6 P1-3 消费者边界。 |
| `__tests__/apply-media-patch.test.mjs` | 新建。输出边界测试（v7 P1-2）。断言：1) `ok`/`partial` 输出摘要注释含 status、保护框、saliency 可用性；2) `degraded`/`unsupported` 输出 warning；3) `media` 对象不含 `analysis`/`focusAnalysis`/`protectedRegions`/`saliency`；4) 无 `analysis.focusAnalysis` 的旧 patch 仍输出兼容的 media block。 | **Low** | v7 P1-2 实现稳健性。 |
| `lib/asset-sourcer.mjs` | 1) import 路径改名 2) `analyzeAssets()` 新增 Phase 1 focus detection（前置）3) 保留现有 `analyzeFit` 调用 4) 停止回写 `aiFocus` 5) `assignAssetsToScenes()` 新增 `analysis.focusAnalysis` 映射 | **Medium** | 保留了既有 VLM/fit 路径。缓解：Phase 1 失败不阻塞 Phase 2（try/finally）。 |
| `remotion/src/types.ts` | `MediaField.focus` 标注 deprecated 注释 | **Low** | 纯注释，不改类型结构。 |
| `__tests__/ai-analyzer.test.mjs` → `__tests__/visual-analyzer.test.mjs` | 重命名 + 新增 detectFocus 测试 | **Low** | 测试文件。 |
| `__tests__/asset-sourcer-ai-integration.test.mjs` | 重命名 + 适配两阶段流程 + 验证 analyzeFit 保留 | **Low** | 同上。 |
| `scripts/short-video/README.md` | 更新模块名 + 新增 focus_detector 描述 | **Low** | 文档。 |
| `README.md`（根目录） | 更新 AI 分析层描述 | **Low** | 文档。 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| S1 | OpenCV 未安装 | `detectFocus()` 返回 `{status: "degraded", errorCode: "opencv_not_available", protectedRegions: []}` | Low | 优雅降级。`init_classifier()` 检测失败。 |
| S2 | 图片读取失败 | 返回 `{status: "degraded", errorCode: "cannot_read_image"}` | Low | `cv2.imread` 返回 None 时处理。 |
| S3 | 纯黑/纯白图片 | `saliency.dispersion` ≈ 0，`protectedRegions` 为空，`status: "low_information"` | Low | 方差阈值检测。 |
| S4 | 单人正面照（golden fixture） | **v6 P1-4: 硬门槛阻断回归**——检出 ≥1 个 face protectedRegion，IoU ≥0.5 vs 人工标注框。不通过 = CI 红。Golden fixture = 稳定、正面、受控样本。 | Low | Haar Cascade 正面人脸检测可靠。golden fixture = 人工标注的受控 fixture。 |
| S5 | 多人合照（golden fixture） | **v6 P1-4: 硬门槛阻断回归**——检出 ≥1 个 face protectedRegions，计数误差在人工标注 ±1 以内。不通过 = CI 红。Golden fixture = 稳定、正面、受控样本。 | Low | `detectMultiScale` 返回所有匹配。golden fixture + IoU + 计数容差。 |
| S6 | 侧面/遮挡人脸（baseline observation fixture） | **v6 P1-4: 不阻断回归**——Haar Cascade 漏检 → `protectedRegions` 为空 → `status: "ok"` + saliency centroid 作为软信号。记录命中/漏检率与样例，不伪称稳定精度 | Medium | Phase 2 用 YuNet 替代。baseline observation fixture = 遮挡/侧脸/低光样本。 |
| S7 | 产品/场景图（无人脸） | `protectedRegions` 为空，saliency centroid 作为软信号 | Low | 人脸=硬保护区；saliency=软信号。 |
| S8 | 风景/天际线（saliency 均匀分布） | `saliency.dispersion` 低，`status: "low_information"` | Low | 方差阈值。 |
| S9 | 横图（landscape） | `frame.orientation: "landscape"`，坐标归一化 | Low | 归一化坐标与方向无关。 |
| S10 | 竖图（portrait） | `frame.orientation: "portrait"` | Low | 同上。 |
| S11 | 视频文件（.mp4） | 返回 `{status: "unsupported", errorCode: "video_not_supported"}`，不调用 cv2.imread | Low | Phase 1a 只支持图片。 |
| S12 | VLM 子进程先于 focus 子进程启动 | 两个子进程独立，启动顺序不影响 | Low | `visual-analyzer.mjs` 分别管理。 |
| S13 | focus 子进程 idle 60s | `IdleTimer` Event+Lock watchdog 每 `poll_interval` 秒检查，退出上界 ≤ timeout + poll_interval（v7 P1-1） | Low | `IdleTimer` 类实现，复用 VLM 同模式。 |
| S14 | focus 子进程崩溃 | `detectFocus()` 返回 `{status: "degraded"}`，不阻塞 VLM 阶段 | Low | `try/finally` 确保 `closeFocusDetector()`。子进程 exit → 重置状态 → 下次调用重新 spawn。 |
| S15 | VLM 子进程崩溃 | Phase 2 失败，但 Phase 1 focusAnalysis 已保存 | Low | 两阶段独立，Phase 1 结果不丢。 |
| S16 | `detectFocus()` 被外部模块调用（verify-video 等） | 返回相同结果，不依赖 asset-sourcer 上下文 | Low | `detectFocus` 是通用 API。 |
| S17 | `closeVisualAnalyzer()` 关闭两个子进程 | VLM + focus 都被 SIGTERM | Low | 先发 exit 命令，100ms 后 kill。 |
| S18 | 重命名后旧代码 `import("./ai-analyzer.mjs")` | 找不到模块 → 报错 | Medium | 一次性全量改完 + 仓库级 grep 确认。 |
| S19 | `assignAssetsToScenes()` 构造 media-patch.json | `analysis.focusAnalysis` 显式映射，不被白名单丢弃 | Low | 新增字段映射代码。 |
| S20 | `analyzeFit` 仍被调用（横图） | `asset.aiFit` 保留，`asset.aiFocus` 不再回写 | Low | 改动 C 迁移策略。 |
| S21 | `detectFocus()` 返回 `unsupported`（视频素材） | asset.focusAnalysis 存入降级结果，VLM 阶段继续正常 describeVideo | Low | failure-safe 契约。 |
| S22 | `handle_analyze()` 抛出未预期异常（v5 P0-2） | dispatch 包装器捕获异常，返回 `{status: "degraded", errorCode: "focus_internal_error"}`，子进程不崩溃 | Low | dispatch wrapper try/except + `focus_internal_error`。 |
| S23 | focus 子进程 idle 60s（v5 P1-3） | `IdleTimer` Event+Lock watchdog（v7 P1-1: 轮询 `min(10, timeout/10)` 秒，退出上界 ≤ timeout + poll_interval）。CI 用 `IdleTimer(timeout=0.1, poll_interval=0.05)` 注入测试 | Low | `IdleTimer` 类实现。 |
| S24 | 依赖 Pillow 缺失（v5 P0-1） | `load_deps()` 返回 None，返回 `{status: "degraded", errorCode: "pillow_not_available"}`，子进程不崩溃 | Low | 延迟加载 + errorCode 映射。 |

## 7. 不做清单（Phase 2 候选）

| 能力 | 审阅建议 | 不做原因 | Phase 2 触发条件 |
|------|---------|---------|-----------------|
| 候选 slot 评分（`cost(c)` 多目标优化） | P0 | 工程量大，需先验证 Phase 1 精度 | 接口、回归和手工 smoke 全通过后 |
| source → 9:16 canvas 坐标变换 | P0 | 需接入 MediaBackground cover/scale/translate | Phase 1 验证后接入渲染层 |
| 视频焦点检测（`samples[]` + 时间戳） | P0 | 需定义跨帧合并规则 | 图片质量合格后 |
| YuNet 替代 Haar Cascade | P1 | Haar 够用作基线 | Haar 精度不达标 |
| 时间平滑（temporal_jitter） | P0 | 视频不是 Phase 1 场景 | 视频遮挡率不达标 |
| OCR 文字保护区 | 审阅建议 | 需额外依赖 | 素材含图表/海报文字遮挡 |
| 分层素材集评测（80-120 张） | 审阅建议 | 需人工标注 | 接口+回归+手工 smoke 全通过后 |

## 8. 验证计划

### Phase 1: 自动契约测试 + 人工 Smoke Test

**自动契约测试**（审阅建议的分层测试）：

| 测试层 | 样本/断言 | 通过条件 |
|--------|---------|---------|
| 单元测试 | 坏路径、纯黑图、无脸图、单脸图、多脸图、伪造 saliency 空图、**handler 异常 → `focus_internal_error`**（v5 S22）、**依赖缺失 → `pillow_not_available` / `numpy_not_available`**（v5 S24） | 每一响应都有完整 schema；空结果不抛异常；每个 `rect` 值在 [0,1]；dispatch 包装器不泄漏异常 |
| 进程协议测试 | 连续请求、idle 自动退出（v7 P1-1: `IdleTimer` Event+Lock+轮询 10s，退出上界 ≤ timeout + poll_interval）、**可测试超时注入**（`IdleTimer(timeout=0.1, poll_interval=0.05)`，CI 不等 60s）、stderr 噪声、子进程非 0 退出、重启后请求、**请求 A 超时后晚到响应 + 请求 B 紧随其后**（复审 P0-1）、**两个并发请求在 worker exit 时均返回 schema 完整的 `focus_worker_reset` 降级结果**（终审 P0-1）、**handler 异常 → `focus_internal_error` 响应**（v5 S22）、**延迟加载依赖缺失 → 准确 errorCode 而非崩溃**（v5 S24）、**graceful exit: `timer.stop()` 后 watchdog 不调 `os._exit(0)`**（v7 P1-1） | request queue 不错配；B 绝不拿到 A 的结果；所有 Promise 在约定时间内 resolve；退出后可重新 spawn；worker exit 时所有 pending Promise 均结算为 schema 完整的降级结果；dispatch 异常被捕获；延迟加载返回准确 errorCode；**无活动时退出时间 ≤ timeout + poll_interval**；**持续活动时不退出**；**stop() 后不退出** |
| 集成测试 | `analyzeAssets()` 中 Focus 任一资产失败、全阶段失败、VLM 失败、close 调用、**fit 有效但 focus 缺失仍保留 fit**（复审 P1-4）、**`apply-media-patch.mjs` 输出人工审阅摘要**（v6 P1-3） | Focus 失败仍完成 VLM；Focus 子进程必被关闭；现有 `aiFit` 行为保留；`analyzeFit` 解析器不要求 focus；`apply-media-patch.mjs` 输出注释形式摘要且 `media` 对象不含 `analysis`/`focusAnalysis` |
| patch 测试 | 运行 `assignAssetsToScenes()` 后读取实际 `media-patch.json` | `analysis.focusAnalysis` 出现且符合**完整 schema**（含 `status`、`errorCode`、`frame`、`protectedRegions`、`saliency`） |

**人工 smoke test**（审阅指出 4 张素材都无人脸，无法验证核心能力）。

**v6 P1-4: fixture 分类**：golden fixture（稳定正面照/合照）= 硬门槛阻断回归，不通过 CI 红；baseline observation fixture（遮挡/侧脸/低光）= 记录命中/漏检率，不阻断。

| 素材 | 期望 |
|------|------|
| 单人正面照（需新增） | 1 个 face protectedRegion，归一化坐标合理 |
| 多人合照（需新增） | 多个 face protectedRegions |
| 侧脸/遮挡（需新增） | Haar 可能漏检 → `protectedRegions` 为空 → `status: "ok"` + saliency centroid |
| 横图（landscape） | `frame.orientation: "landscape"`，坐标归一化 |
| 竖图（portrait） | `frame.orientation: "portrait"` |
| EXIF 旋转 90°/180°/270° JPEG（需新增） | `frame.orientationNormalized: true`，规范化后的宽高正确（90°/270° → 宽高互换），人脸框在正确位置（与正向图对比 IoU ≥0.5）（终审 P0-2/P1-6） |
| `shanghai-skyline.jpg` | 无人脸 → `status: "low_information"` 或 saliency 均匀 |
| `ai-robot-hand.jpg` | 无人脸 → saliency centroid 在手部区域 |
| `financial-chart.jpg` | 无人脸 → saliency 在图表区域 |
| `data-center.jpg` | 无人脸 → saliency 在服务器排列区域 |

> 不把"质心正好居中"作为唯一成功标准。记录检测结果与手工期望对比。

**验证指标**（全部为待测值）：
- [ ] `focus_detector.py` 启动时间（目标 < 1s，实测后回填）
- [ ] 单张分析延迟 P50/P95（目标 < 200ms，实测后回填）
- [ ] 输出 JSON 结构符合完整契约（含 `status`、`errorCode`、`frame`、`protectedRegions`、`saliency`）
- [ ] 归一化坐标在 [0, 1] 范围内
- [ ] `frame.orientationNormalized: true`（EXIF 已校正）
- [ ] `closeFocusDetector()` 后子进程退出
- [ ] `closeFocusDetector()` 幂等（复审 P0-1）
- [ ] VLM 阶段不受 focus 子进程影响
- [ ] 内存峰值不叠加（focus 内存释放后 VLM 才启动）
- [ ] `media-patch.json` 中 `analysis.focusAnalysis` 字段存在且符合完整 schema
- [ ] requestId 路由：A 超时后晚到响应不被错误分配给 B（复审 P0-1）
- [ ] worker exit 时所有 pending Promise 均在 timeout 内 resolve 为 schema 完整的 `focus_worker_reset` 降级结果（终审 P0-1）

**Benchmark 规范**（复审 P1-5 + 终审 P1-7）：

```bash
# 可重复的 benchmark 命令 (v5 P1-2: 受控 fixture 目录)
node scripts/short-video/lib/focus-detector-benchmark.mjs \
  --assets-dir __tests__/fixtures/benchmark/ --runs 20
```

输入目录：`scripts/short-video/__tests__/fixtures/benchmark/`（受控 fixture，含已知人脸/无脸/纯色图，避免随机抓取生产 `assets/`）。输出目录：`scripts/short-video/experiments/focus-benchmark/`（已 gitignored）。输出 JSON 结果写入该目录下。

输出 JSON 结果字段：
```json
{
  "machine": "MacBookPro M2 Pro",
  "macOS": "15.x",
  "python": "3.12.14",
  "opencv": "4.10.0",
  "inputSizes": ["1920×1080", "1080×1920"],
  "N": 20,
  "coldStart": {"p50": 0, "p95": 0},
  "warmStart": {"p50": 0, "p95": 0},
  "peakRSS_MB": 0,
  "failureRate": 0
}
```

### Phase 2: 生产门槛验证（审阅建议，本 spec 不实施）

- 80-120 张分层素材 + 15-20 段视频
- 危险遮挡率 ≤ 1%
- 人工可接受率 ≥ 95%
- P95 延迟待定
- 视频无连续 0.5s 以上遮挡

## 9. Open Questions

1. **Haar Cascade confidence 值**：Phase 1a 始终为 `null`（`confidenceKind: "not_provided"`）。Phase 2 用 YuNet 替代时使用模型原生分数（`confidenceKind: "model"`）。
2. **saliency dispersion 的缩放因子**：`SCALING_FACTOR` 初始值 10.0，需要实测调参。
3. **EXIF rotation 规范化**：✅ 已在 Phase 1a 中实现（使用 Pillow `ImageOps.exif_transpose()`）。~~是否在 Phase 1a 就实现？~~ 已决定实现（复审 P0-2）。
4. **`MediaField.focus` deprecated 后的消费者**：Remotion `MediaBackground.tsx` 当前用 `focus` 做 cover 裁切偏移。Phase 2 接入 `protectedRegions` 后，`focus` 字段是否完全移除，还是保留作为 fallback？
5. **`status: "partial"` 的下游消费**：✅ 已在 §4.7 中定义行动规则（v5 P1-4）：创作者依据人脸框放置，跳过 saliency 辅助。