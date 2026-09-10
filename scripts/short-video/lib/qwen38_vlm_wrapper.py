#!/usr/bin/env python3
"""
Qwen3.8-27B VLM Wrapper — 统一封装 MLX 和 Ollama 两个后端。

两个后端各有优势，根据场景切换：
  - MLX (mlx-vlm)：支持 image + video，速度快（8-12 tok/s），不支持 tool calling
  - Ollama：支持 image + tool calling，不支持 video

封装的坑（均来自实测）：
  1. image 必须传给 generate(image=...)，不能只放 chat template（否则模型看不到图片）
  2. 图片必须预处理到 ≤512x512，否则 Metal GPU watchdog ~200ms 超时 crash（MLX 和 Ollama 都会）
  3. 用 mlx_vlm.prompt_utils.apply_chat_template 而非 processor.apply_chat_template
     （后者可能触发 thinking 模式，thinking 混在输出里）
  4. Qwen 官方推荐采样参数：instruct mode temp=0.7 top_p=0.80 top_k=20 presence_penalty=1.5
  5. max_tokens 需 ≥1000（thinking tokens 占空间，200 只够 thinking 开头）

视频不需要手动预处理：Qwen3 VL processor 内部 _smart_resize_video 会自动缩放
（max_pixels=12.6M 是所有帧总和，帧越多每帧自动越小）。
长视频（>8s）自动分段处理：用 ffmpeg 无损切分成 8s 段，每段单独分析后合并结果。

用法：
  from qwen38_vlm_wrapper import ask

  # 自动选择后端：有 video → MLX，有 tools → Ollama，否则 MLX
  text = ask("描述这张图片", image="path/to/image.jpg")
  text = ask("视频里在做什么", video="path/to/video.mp4")
  text = ask("你好", tools=[...])  # 用 Ollama（支持 tool calling）

  # 手动指定后端
  text = ask("...", backend="ollama")
  text = ask("...", backend="mlx")
"""

import os
import base64
import tempfile
import subprocess
import requests
from PIL import Image

MAX_IMAGE_EDGE = 512  # Metal GPU watchdog ~200ms，512x512 足够（patch_size=16 → 32x32 patches）
OLLAMA_GENERATE_URL = "http://localhost:11434/api/generate"
OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "qwen3.8:27b-mlx"
MLX_MODEL_PATH = os.path.expanduser("~/models/Qwen3.8-27B-4bit")

VIDEO_SEGMENT_SECONDS = 8  # 每段最长 8 秒，超过则分段分析后合并
FFPROBE_PATH = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe"
FFMPEG_PATH = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"


def preprocess_image(image_path, max_edge=MAX_IMAGE_EDGE):
    """Resize 图片到最长边 ≤ max_edge，返回新路径（如不需 resize 返回原路径）。

    Why: Metal GPU 处理大图会触发 kIOGPUCommandBufferCallbackErrorImpactingInteractivity
    （~200ms watchdog 超时，非模型限制）。实测 1.3MB 原图直传 MLX 和 Ollama 都 crash。
    """
    img = Image.open(image_path)
    w, h = img.size
    longest = max(w, h)
    if longest <= max_edge:
        return image_path
    scale = max_edge / longest
    new_w, new_h = int(w * scale), int(h * scale)
    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    suffix = os.path.splitext(image_path)[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    img.save(tmp.name)
    return tmp.name


def get_video_duration(video_path):
    """用 ffprobe 获取视频时长（秒），失败返回 0。"""
    try:
        result = subprocess.run(
            [FFPROBE_PATH, "-v", "quiet", "-print_format", "json",
             "-show_format", video_path],
            capture_output=True, timeout=10, text=True,
        )
        import json
        info = json.loads(result.stdout)
        return float(info["format"]["duration"])
    except Exception:
        return 0.0


def split_video_segments(video_path, segment_seconds=VIDEO_SEGMENT_SECONDS):
    """把长视频分成多段，返回临时文件路径列表。

    视频时长 ≤ segment_seconds 时返回 [video_path]（不切分）。
    切分用 ffmpeg -ss/-t copy（无损快速切分）。
    """
    duration = get_video_duration(video_path)
    if duration <= segment_seconds or duration == 0:
        return [video_path]

    segments = []
    start = 0.0
    while start < duration:
        tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
        tmp.close()
        cmd = [
            FFMPEG_PATH, "-y",
            "-ss", str(start),
            "-i", video_path,
            "-t", str(segment_seconds),
            "-c", "copy",
            tmp.name,
        ]
        try:
            subprocess.run(cmd, capture_output=True, timeout=30, check=True)
            segments.append(tmp.name)
        except Exception:
            os.unlink(tmp.name)
            break
        start += segment_seconds
    return segments if segments else [video_path]


def analyze_video_segmented(prompt, video_path, ask_fn, **kwargs):
    """对长视频分段分析后合并结果。

    短视频（≤8s）直接单次分析。
    长视频切分成 N 段，每段单独分析，结果拼接。
    """
    segments = split_video_segments(video_path)
    if len(segments) == 1:
        return ask_fn(prompt, video=video_path, **kwargs)

    results = []
    for i, seg in enumerate(segments):
        seg_prompt = f"{prompt}\n\n（这是视频第 {i+1}/{len(segments)} 段）"
        try:
            r = ask_fn(seg_prompt, video=seg, **kwargs)
            results.append(r)
        except Exception as e:
            results.append(f"[段 {i+1} 分析失败: {e}]")
        finally:
            if seg != video_path:
                try:
                    os.unlink(seg)
                except OSError:
                    pass

    return "\n\n---\n\n".join(results)


# ─── MLX 后端 ───

_mlx_instance = None


class Qwen38MLX:
    """MLX 后端：支持 image + video，不支持 tool calling。"""

    def __init__(self, model_path=MLX_MODEL_PATH):
        from mlx_vlm import load
        from mlx_vlm.utils import load_config

        self.model_path = model_path
        self.model, self.processor = load(model_path)
        self.config = load_config(model_path)

    def ask(self, prompt, image=None, video=None, max_tokens=1000,
            temperature=0.7, top_p=0.80, top_k=20, presence_penalty=1.5):
        from mlx_vlm import generate
        from mlx_vlm.prompt_utils import apply_chat_template

        image_paths = None
        video_paths = None
        temp_files = []

        try:
            num_images = 0
            if image is not None:
                if isinstance(image, str):
                    image = [image]
                image_paths = []
                for img_path in image:
                    resized = preprocess_image(img_path)
                    if resized != img_path:
                        temp_files.append(resized)
                    image_paths.append(resized)
                num_images = len(image_paths)

            if video is not None:
                if isinstance(video, str):
                    video = [video]
                video_paths = video

            formatted = apply_chat_template(
                self.processor, self.config, prompt,
                num_images=num_images,
            )

            kwargs = dict(
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                top_k=top_k,
                presence_penalty=presence_penalty,
                verbose=False,
            )
            if image_paths is not None:
                kwargs["image"] = image_paths
            if video_paths is not None:
                kwargs["video"] = video_paths

            response = generate(self.model, self.processor, formatted, **kwargs)

            if hasattr(response, "text"):
                return response.text
            elif isinstance(response, dict):
                return response.get("text", str(response))
            return str(response)
        finally:
            for f in temp_files:
                try:
                    os.unlink(f)
                except OSError:
                    pass


# ─── Ollama 后端 ───

class Qwen38Ollama:
    """Ollama 后端：支持 image + tool calling，不支持 video。"""

    def __init__(self, model=OLLAMA_MODEL, generate_url=OLLAMA_GENERATE_URL, chat_url=OLLAMA_CHAT_URL):
        self.model = model
        self.generate_url = generate_url
        self.chat_url = chat_url

    def ask(self, prompt, image=None, max_tokens=1000,
            temperature=0.7, top_p=0.80, top_k=20, presence_penalty=1.5,
            tools=None):
        temp_files = []
        try:
            images_b64 = None
            if image is not None:
                if isinstance(image, str):
                    image = [image]
                images_b64 = []
                for img_path in image:
                    resized = preprocess_image(img_path)
                    if resized != img_path:
                        temp_files.append(resized)
                    with open(resized, "rb") as f:
                        images_b64.append(base64.b64encode(f.read()).decode())

            if tools:
                payload = {
                    "model": self.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "tools": tools,
                    "options": {
                        "temperature": temperature,
                        "top_p": top_p,
                        "top_k": top_k,
                        "num_predict": max_tokens,
                    },
                }
                if images_b64:
                    payload["messages"][0]["images"] = images_b64
                resp = requests.post(self.chat_url, json=payload, timeout=600)
                data = resp.json()
                msg = data.get("message", {})
                tool_calls = msg.get("tool_calls", [])
                if tool_calls:
                    return {"text": msg.get("content", ""), "tool_calls": tool_calls}
                return msg.get("content", "").strip()

            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "top_p": top_p,
                    "top_k": top_k,
                    "num_predict": max_tokens,
                },
            }
            if images_b64:
                payload["images"] = images_b64

            resp = requests.post(self.generate_url, json=payload, timeout=600)
            data = resp.json()
            return data.get("response", "").strip()
        finally:
            for f in temp_files:
                try:
                    os.unlink(f)
                except OSError:
                    pass


# ─── 统一接口（带内存管理）───

_mlx_instance = None
_active_backend = None


def _unload_mlx():
    """释放 MLX 模型内存（del model + gc.collect）。"""
    global _mlx_instance
    if _mlx_instance is not None:
        del _mlx_instance.model
        del _mlx_instance.processor
        _mlx_instance = None
        import gc; gc.collect()


def _unload_ollama():
    """让 Ollama server 卸载模型（keep_alive=0）。"""
    try:
        requests.post("http://localhost:11434/api/generate", json={
            "model": OLLAMA_MODEL, "keep_alive": 0
        }, timeout=10)
    except Exception:
        pass


def ask(prompt, image=None, video=None, tools=None, backend="auto",
        max_tokens=1000, **kwargs):
    """统一接口，自动或手动选择后端，切后端时释放另一个后端的内存。

    后端选择逻辑（backend="auto"）：
      - 有 video → MLX（Ollama 不支持 video）
      - 有 tools → Ollama（MLX 不支持 tool calling）
      - 否则 → MLX（速度快）

    切后端时自动释放另一个后端的内存（MLX ~16GB / Ollama ~18GB），
    避免两个后端同时占内存导致 32GB 机器 OOM。

    Args:
        prompt: 问题/指令文本
        image: 图片路径（str 或 list[str]），自动 resize 到 ≤512x512
        video: 视频路径（str），仅 MLX 支持
        tools: tool calling 定义列表，仅 Ollama 支持
        backend: "auto" | "mlx" | "ollama"
        max_tokens: 默认 1000

    Returns:
        模型输出的文本（str），或 tool call 结果（dict，含 text + tool_calls）
    """
    global _mlx_instance, _active_backend

    if backend == "auto":
        if video is not None:
            backend = "mlx"
        elif tools is not None:
            backend = "ollama"
        else:
            backend = "mlx"

    if _active_backend is not None and _active_backend != backend:
        if _active_backend == "mlx":
            _unload_mlx()
        elif _active_backend == "ollama":
            _unload_ollama()
        _active_backend = None

    if backend == "mlx":
        if _mlx_instance is None:
            _mlx_instance = Qwen38MLX()
        _active_backend = "mlx"
        if video is not None and isinstance(video, str):
            return analyze_video_segmented(
                prompt, video, _mlx_instance.ask,
                image=image, max_tokens=max_tokens, **kwargs,
            )
        return _mlx_instance.ask(prompt, image=image, video=video,
                                 max_tokens=max_tokens, **kwargs)
    elif backend == "ollama":
        _active_backend = "ollama"
        return Qwen38Ollama().ask(prompt, image=image, tools=tools,
                                  max_tokens=max_tokens, **kwargs)
    else:
        raise ValueError(f"Unknown backend: {backend}")
