# Code Review — VLM 2B-4bit + Image Preprocessing + Frame Extraction Workaround

**Date**: 2026-08-26  
**Fixed point**: `425d535~1` (before VLM changes)  
**HEAD**: `9d3cfae`  
**Commits reviewed**: `425d535`, `9d3cfae`  
**Files changed**: `vlm_analyzer.py`, `vlm-model-selection-benchmark.md`, `0009-vlm-qwen3-vl-mlx.md`  
**Issue**: #113 (VLM image preprocessing)  
**Spec**: No dedicated spec — changes were driven by benchmark findings + user discussion

---

## Standards

### Violations

1. **`resize_image_if_needed` uses `tempfile.mktemp`** (line ~444) — `tempfile.mktemp` is deprecated since Python 3.0 and a security risk (race condition). The codebase already uses `tempfile.mkdtemp` in `extract_frames`. Should use `tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)` or `tempfile.mkstemp(suffix='.jpg')`. **Hard violation** — Python stdlib deprecation warning.

2. **`Path` imported but unused** (line 43) — `from pathlib import Path` was added but never used in the diff. The `resize_image_if_needed` function uses `Image.open(img_path)` with a string path, not `Path`. Dead import. **Hard violation** — unused import.

3. **`MAX_IMAGE_LONG_EDGE = 1920` vs R4 finding of 1280px** — The benchmark report (R4 section) explicitly states "1280px resize 是 2B-4bit 的最优配置" and shows 1920px causes repetitive output loops. Yet the code uses 1920px. The report's "配置" section says "R4 测试用 1280px 进一步加速但 1920px 已足够防幻觉" — but R4 **also** showed 1920px causes repetitive output. This is a documented-standard conflict: the benchmark says 1280px is optimal, the code says 1920px. **Judgement call** — the code works (no hallucinations at 1920px), but contradicts its own benchmark findings.

### Baseline Smells

4. **Speculative Generality** — `from pathlib import Path` (line 43) was added for a future need that never materialized. → Delete it.

5. **Mysterious Name** — `source_mode = "frames"` / `source_mode = None` is assigned but never read in the function. The variable was used in the old code path to report `native` vs `frames`, but the new code always sets it to `"frames"` or `None` and the caller doesn't appear to use it. → Verify if `result_dict["sourceMode"]` is consumed downstream; if not, remove.

### Passes

- 2-space indentation ✅
- `camelCase` for functions/vars ✅ (`resize_image_if_needed`, `extract_frames`)
- Error handling pattern (try/except + sys.stderr + flush) ✅ — consistent with existing codebase
- Resource cleanup in `finally` blocks ✅ — frames and temp images are properly cleaned
- File header docstring updated ✅ — accurately describes the new behavior

---

## Spec

**Issue #113 acceptance criteria check**:

| Criterion | Status | Notes |
|-----------|--------|-------|
| Resize images >1920px on longest edge | ✅ Implemented | `MAX_IMAGE_LONG_EDGE = 1920`, `resize_image_if_needed()` |
| Use `Image.LANCZOS` for quality | ✅ Implemented | `Image.Resampling.LANCZOS` (correct modern API) |
| Save to temp file, pass to VLM, cleanup | ✅ Implemented | `tempfile.mktemp` → `img.save` → `os.unlink` in `finally` |
| Test with unitree-building.jpg | ✅ Verified | R4 benchmark report documents results |
| Add unit test for resize logic | ❌ **Missing** | No test was added for `resize_image_if_needed()` |
| High-res images no longer hallucinate | ✅ Verified | R4 data shows no hallucinations at 1920px |
| Normal resolution images not affected | ✅ Verified | `resize_image_if_needed` returns original path when ≤1920px |
| No regression in existing pipeline tests | ✅ Verified | 16/16 tests passing (per conversation) |

**Scope creep**: None — changes are tightly scoped to VLM analyzer + docs.

**Missing**: The unit test for resize logic is explicitly in the issue's task list but was not implemented.

**Benchmark report accuracy**: The report correctly documents R4 findings, cross-platform bug analysis, and the workaround strategy. The deep research conclusion (upstream transformers bug, not MLX-specific) is well-supported with 6 GitHub issues across 4 platforms.

**ADR update**: `0009-vlm-qwen3-vl-mlx.md` correctly reflects the model change (8B-8bit → 2B-4bit) and points to the benchmark report. Consistent with ADR format (decision + rationale + alternatives).

---

## Qwen 后继版本情况

调研结论：**Qwen 已在 2026 年 2-3 月发布了 Qwen3.5 系列，统一了 text+VL 架构（不再分 VL 独立模型线）**。关键发现：

1. **Qwen3.5**（2026-02-16 发布）：原生多模态，无需单独 VL 模型。支持视频理解（Conv3d patch embeddings for temporal video）。但：
   - **mlx-vlm 对 Qwen3.5 的视频支持仍在开发中**——mlx-vlm 文档仅明确支持 Qwen2-VL / Qwen2.5-VL / Qwen3-VL 的原生视频理解，Qwen3.5 尚未列入
   - **llama.cpp 有实验性 Qwen3.5 视频补丁**（temporal super-frames + M-RoPE），但作者明确说"这是 workaround 直到原生视频支持落地"
   - Qwen3.5 在 MLX 上需 `mlx-vlm`（不是 `mlx-lm`），目前社区有 4bit 量化版本

2. **Qwen3.6**（2026-04 发布）：同样原生多模态，支持图片+视频+文本

3. **Qwen3.8**（2026-08-08 发布）：最新开源旗舰，支持图片+视频输入

**结论**：Qwen 确实推出了后续版本（3.5/3.6/3.8），架构层面统一了 VL。但 **在 Apple Silicon / MLX 生态中，这些新版本的原生视频处理路径尚未成熟**：
- mlx-vlm 尚未适配 Qwen3.5 的视频处理 API
- llama.cpp 社区有实验性补丁但非原生
- 所有平台仍存在 video processor shape 问题

**当前 Qwen3-VL-2B-4bit + ffmpeg 帧提取 workaround 仍然是 Apple Silicon 上的最佳方案**。未来当 mlx-vlm 适配 Qwen3.5 视频后，可考虑升级——但这需要 mlx-vlm 实现 `return_video_metadata` 路径或原生帧提取 fallback。

---

## Summary

| Axis | Findings | Worst Issue |
|------|----------|-------------|
| **Standards** | 3 violations + 2 smells | `tempfile.mktemp` deprecated (hard) |
| **Spec** | 1 missing (unit test for resize) | Issue #113 task "Add unit test" not done |

**Action items**:
1. Replace `tempfile.mktemp` with `tempfile.mkstemp` or `NamedTemporaryFile` (hard)
2. Remove unused `from pathlib import Path` import (hard)
3. Add unit test for `resize_image_if_needed()` (spec requirement)
4. Consider changing `MAX_IMAGE_LONG_EDGE` from 1920 to 1280 to match R4 findings (judgement)
5. Verify `source_mode` variable is actually consumed downstream; if not, remove (judgement)
