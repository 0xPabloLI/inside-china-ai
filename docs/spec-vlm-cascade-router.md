# Spec: VLM Cascade Router

> **Issue**: [#127](https://github.com/0xPabloLI/inside-china-ai/issues/127)
> **Date**: 2026-08-27
> **Status**: ready-for-agent
> **Related**: `docs/research/vlm-model-selection-benchmark.md` §9-13, `docs/handoffs/handoff-vlm-cascade-router-2026-08-27.md`, ADR-0009

---

## Problem Statement

The video pipeline's VLM analyzer (`vlm_analyzer.py`) currently uses a single Qwen3-VL-2B-4bit model for all asset analysis. While fast (~3-5s/image), it struggles with complex images — particularly Chinese text recognition and brand/logo identification. A deeper model (GLM-4.1V-9B-Thinking-4bit) has been benchmarked (R6-R8) and proven superior at Chinese recognition (恒生, 中国农业银行, 宇树科技) but is ~6x slower (28.5s/image). Using it for all assets would make 20-asset analysis take 9+ minutes instead of ~1 minute.

Additionally, the current architecture has a **Fallback model** (`Qwen3-VL-4B-Instruct-8bit`) that is dead code — it's only used when the primary 2B model fails to load, but the 4B offers no quality advantage (R7 showed Qwen3.5-4B is 8.3x slower than 2B with no quality gain) and just adds complexity. The Fallback and Cascade concepts overlap confusingly.

## Solution

Replace the single-model + Fallback architecture with a **Cascade Router**: Qwen3-VL-2B runs first (Fast Path). If its output shows signs of low confidence, the same request is re-run with GLM-4.1V-9B (Deep Path). The Fallback model is deleted entirely. GLM is loaded lazily (only when first escalation occurs), keeping startup fast.

## User Stories

1. As a video pipeline operator, I want complex images (Chinese text, brand logos) to be analyzed by a deeper model automatically, so that asset descriptions and fit decisions are accurate without manual intervention.
2. As a video pipeline operator, I want standard images to be analyzed quickly (~3-5s) by the fast model, so that 20-asset analysis completes in ~2-3 minutes.
3. As a video pipeline operator, I want the deep model to load only when needed, so that pipeline startup is not slowed down when all images are simple.
4. As a video pipeline operator, I want video assets to also benefit from the Cascade, so that complex video frames get deeper analysis when the fast model's output is insufficient.
5. As a developer, I want the Fallback model code removed, so that the architecture is simpler and there's no confusion between "Fallback" (error recovery) and "Cascade" (quality escalation).
6. As a developer, I want a memory check before loading GLM, so that the process doesn't crash on machines with insufficient RAM.
7. As a developer, I want the cascade escalation signals to be deterministic and testable, so that I can unit-test the routing logic without running actual VLM inference.
8. As a developer, I want the Node-side `visual-analyzer.mjs` to remain unchanged, so that the IPC contract stays stable and no downstream changes are needed.
9. As a developer, I want ADR-0009 updated to reflect the Cascade architecture, so that future developers understand the dual-model design.

## Implementation Decisions

### 1. Delete Fallback Model

- Remove `FALLBACK_MODEL_ID` constant and all fallback logic from `vlm_analyzer.py`.
- If 2B model load fails, the process exits with code 1 and an error JSON — no silent fallback.
- Rationale: The 4B model offers no quality advantage (R7 benchmark) and the fallback path masks real errors.

### 2. Add Deep Model Constants

- `DEEP_MODEL_ID = "mlx-community/GLM-4.1V-9B-Thinking-4bit"` (6.6GB disk, 1.1GB peak memory).
- `DEEP_MODEL_MIN_RAM_GB = 16` — minimum free RAM required to load GLM.
- GLM is loaded lazily on first escalation, not at startup.

### 3. Implement `should_escalate()` Function

A pure function that inspects the 2B model's parsed output and returns `True`/`False`. Signals (any one triggers escalation):

| Signal | Condition | Rationale |
|--------|-----------|-----------|
| Short output | `len(description or "") < 100` characters | 2B often produces 1-2 words for complex images it can't parse |
| Missing fit | `fit is None` (for images) | 2B sometimes skips fit entirely when confused |
| Empty description | `not description or not description.strip()` | Complete failure to describe |
| Repetition | Same word/phrase repeated ≥3 times in description | 2B loop symptom on hard images |

**Note**: `contentKind == "other"` was considered but dropped — "other" is a valid classification for abstract images, not necessarily a low-confidence signal.

### 4. Implement `check_ram_available()` Function

- Uses `psutil.virtual_memory().available` (cross-platform, already a dependency of mlx-vlm).
- Returns `True` if available RAM ≥ `DEEP_MODEL_MIN_RAM_GB`.
- If psutil import fails, returns `True` (fail-open — better to try and fail than to never try).
- Called before loading GLM. If `False`, logs a warning and returns the 2B result as-is.

### 5. Modify `handle_analyze_semantics()`

After the 2B model generates and parses output:

1. Call `should_escalate(result)`.
2. If `True` and GLM not yet loaded:
   a. Call `check_ram_available()`.
   b. If RAM insufficient → return 2B result as-is (with `escalated: False` metadata).
   c. If RAM OK → load GLM (`load_model(DEEP_MODEL_ID)`), store in module-level variable.
3. If `True` and GLM already loaded (or just loaded):
   a. Re-run `generate_response()` with GLM model/processor.
   b. Parse the new output.
   c. Return the GLM result (with `escalated: True` metadata).
4. If `False` → return 2B result as-is (with `escalated: False` metadata).

**Video assets**: The same cascade applies. GLM-4.1V supports native video input (verified via smoke test, `experiments/glm-video-smoke-test.py`). The `generate_response()` function already accepts `video_path` — it works with any model that supports video in mlx-vlm. GLM uses the same `generate()` call path.

**Prompt reuse**: GLM uses the same `SEMANTICS_PROMPT_IMAGE` / `SEMANTICS_PROMPT_VIDEO` prompts. GLM's Thinking chain is part of its output but `parse_markdown_to_dict()` already handles arbitrary text by extracting `## Section` headers.

### 6. Add `escalated` Field to Response

- New field: `"escalated": True/False` in the JSON response from Python.
- `False` = 2B result used as-is. `True` = GLM result used.
- Node-side `visual-analyzer.mjs` passes this through transparently (it already spreads all response fields).
- Downstream consumers (`asset-sourcer.mjs`) can optionally read this field for logging but are not required to.

### 7. Module-Level GLM State

```python
# Module-level variables for lazy-loaded GLM
_deep_model = None
_deep_processor = None
_deep_loaded = False
```

- `load_model()` is called once on first escalation. Subsequent escalations reuse the cached model.
- If GLM load fails, `_deep_loaded` stays `False`, and future escalations will retry the load.
- If GLM generation fails (after successful load), the 2B result is returned as-is (graceful degradation within cascade).

### 8. No Changes to `visual-analyzer.mjs`

- The Node IPC layer is unchanged. It sends `{"action": "analyze_semantics", "path": "...", "window": {...}}` and receives a JSON response.
- The `escalated` field flows through transparently.
- No new actions, no new IPC protocol changes.

### 9. Update ADR-0009

- Add a "Cascade Router" section describing the dual-model architecture.
- Remove the "fallback: 4B-8bit" reference.
- Reference the benchmark data (R6-R8) supporting the decision.

## Testing Decisions

### Test Seam: `should_escalate()` as Pure Function

The escalation logic is a pure function `should_escalate(parsed_result: dict) -> bool`. This is the primary test seam — it can be unit-tested without spawning Python subprocesses or loading VLM models.

### Test Categories

1. **`should_escalate()` unit tests** (Python, pytest or direct assertion):
   - Each signal individually: short output, missing fit, empty description, repetition
   - Multiple signals simultaneously
   - Normal output (no escalation)
   - Video output (no fit field — should NOT trigger missing-fit escalation)
   - Edge cases: `None` description, empty dict, all fields present

2. **`check_ram_available()` unit tests** (Python, mock psutil):
   - Sufficient RAM → True
   - Insufficient RAM → False
   - psutil import fails → True (fail-open)

3. **Existing `visual-analyzer.test.mjs` tests** (Node, vitest):
   - All existing tests must pass unchanged (IPC contract stable).
   - No new Node tests needed — cascade is entirely Python-side.

4. **Integration smoke test** (manual):
   - Run `vlm_analyzer.py` with a real complex image (e.g., `assets/bing_news-bytedance-03.jpg`) and verify `escalated: True` in output.
   - Run with a simple image and verify `escalated: False`.

### Prior Art

- Existing tests in `__tests__/visual-analyzer.test.mjs` mock `child_process.spawn` and test IPC protocol.
- `focus_detector.py` has no Python unit tests — it's tested via Node integration tests. We follow a different pattern for `should_escalate()` because it's pure logic worth testing in isolation.
- The `parse_markdown_to_dict()` function is a precedent for testing pure Python functions in this codebase.

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `scripts/short-video/lib/vlm_analyzer.py` | Delete `FALLBACK_MODEL_ID` + fallback logic; add `DEEP_MODEL_ID`, `should_escalate()`, `check_ram_available()`, cascade flow in `handle_analyze_semantics()`, `escalated` field in response, module-level GLM state | **Medium** | Core VLM analysis path. Existing tests mock the IPC layer (Node-side), so Python changes are covered by integration tests. New pure functions (`should_escalate`, `check_ram_available`) get dedicated unit tests. Risk: if cascade logic breaks, 2B result still returns (graceful degradation). Worst case: GLM fails to load → 2B result returned with `escalated: False` — same as current behavior. |
| `scripts/short-video/lib/visual-analyzer.mjs` | **No changes** | N/A | IPC contract unchanged. `escalated` field passes through via object spread. |
| `scripts/short-video/lib/asset-sourcer.mjs` | **No changes** | N/A | Consumes `analyzeAssetSemantics()` output. `escalated` field is optional metadata — existing code doesn't reference it. |
| `docs/adr/0009-vlm-qwen3-vl-mlx.md` | Add Cascade Router section; remove fallback reference | **Low** | Documentation only. No runtime impact. |
| `scripts/short-video/__tests__/visual-analyzer.test.mjs` | **No changes** to existing tests; new tests are Python-side | N/A | Existing tests verify IPC contract which is unchanged. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Simple image, 2B produces full output (>100 chars, fit present) | `escalated: False`, 2B result returned | Low | Normal path, well-tested |
| 2 | Complex image (Chinese text), 2B produces <100 chars | `escalated: True`, GLM result returned | Medium | GLM load may fail → 2B result returned (graceful) |
| 3 | Complex image, 2B returns `fit: None` | `escalated: True`, GLM result returned | Medium | Same as #2 |
| 4 | Complex image, 2B returns empty description | `escalated: True`, GLM result returned | Medium | Same as #2 |
| 5 | Complex image, 2B repeats same word 3+ times | `escalated: True`, GLM result returned | Medium | Same as #2 |
| 6 | Video asset, 2B produces short description | `escalated: True`, GLM re-analyzes video via native video path | Medium | GLM video path verified via smoke test. If GLM video fails, 2B result returned. |
| 7 | Video asset, 2B produces full description | `escalated: False`, 2B result returned | Low | Normal video path |
| 8 | 2B model fails to load at startup | Process exits with code 1 + error JSON | Medium | No silent fallback. Node-side handles error JSON → degraded result. |
| 9 | GLM fails to load on first escalation | Warning logged, 2B result returned with `escalated: False` | Medium | Graceful degradation. Future escalations will retry GLM load. |
| 10 | GLM loaded but generation fails | Warning logged, 2B result returned with `escalated: False` | Medium | Exception caught in try/except, 2B result preserved. |
| 11 | Insufficient RAM for GLM (<16GB free) | Warning logged, 2B result returned with `escalated: False` | Low | `check_ram_available()` gates GLM load. Fail-open if psutil unavailable. |
| 12 | Multiple escalations in sequence (2nd, 3rd, etc.) | GLM is already loaded → reused, no re-load | Low | Module-level cache `_deep_model` / `_deep_processor`. |
| 13 | 2B output has `fit: None` but it's a video (no fit field expected) | `should_escalate` does NOT trigger on missing fit for videos | Medium | `should_escalate` checks `is_video` flag or fit field absence is expected for video prompt. |
| 14 | `escalated` field in response JSON | Node-side passes it through via object spread | Low | `visual-analyzer.mjs` `handleResponse()` already spreads all fields. |
| 15 | GLM Thinking chain in raw output | `parse_markdown_to_dict()` extracts `## Section` headers, ignores Thinking prose | Low | Parser already handles arbitrary pre-header text. |
| 16 | 20 assets, 3 flagged as complex | 17×3s + 3×28s ≈ 144s total | Low | Performance projection from R6 benchmark data. |
| 17 | 2B produces normal output but `contentKind: "other"` | `should_escalate` returns `False` (no longer a signal) | Low | Removed from signals per grill decision. |
| 18 | GLM model files not on disk (not downloaded) | `load_model()` raises exception → caught → 2B result returned | Medium | Graceful degradation. stderr log: "GLM model not found". |

## Out of Scope

- **Auto-download of GLM model**: The model must be pre-downloaded via `huggingface-cli download` or `hf download`. No runtime download logic.
- **Confidence scoring**: No probabilistic confidence score from 2B model. Escalation is rule-based, not ML-based.
- **Dynamic model switching at Node level**: The Node-side `visual-analyzer.mjs` remains unchanged. All cascade logic is Python-side.
- **Ollama integration**: Ollama VLM models are 5-7x slower than mlx-vlm (R5 benchmark). Not considered for production.
- **Cloud VLM API fallback**: Out of scope. Local-first is a design principle (ADR-0008).
- **Benchmarking new models post-implementation**: FastVLM, Moondream3, Phi-4-MM were evaluated (R8) and rejected. No further benchmarking planned.

## Further Notes

- **Benchmark data**: See `docs/research/vlm-model-selection-benchmark.md` §9-13 for R5-R8 results.
- **GLM video verification**: `scripts/short-video/experiments/glm-video-smoke-test.py` confirms GLM-4.1V native video path works with mlx-vlm 0.6.16+.
- **Memory safety**: Qwen2B (1.8GB) + GLM-4.1V (1.1GB peak) = ~3GB total. On 32GB M2 Pro (system ~8GB, free ~24GB), this is well within limits.
- **Lazy loading benefit**: If all 20 images are simple, GLM never loads → no 7.4s startup penalty. Only complex images trigger the ~7.4s GLM load.
