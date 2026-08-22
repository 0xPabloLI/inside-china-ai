# 05 — VLM validation script (5-test end-to-end verification)

**What to build:** A validation script in `experiments/vlm-p3-validation/` that calls the real VLM (Qwen3-VL-8B via mlx-vlm) to empirically verify the new approach. Tests: Markdown format stability, Python parser robustness, pre-filter accuracy, end-to-end latency, semantic scoring (optional). This is not a formal test suite — it's an experiment that produces a report.

**Blocked by:** 04 — needs the full pipeline working to test end-to-end.

**Status:** ready-for-agent

**Spec:** `docs/specs/spec-vlm-semantic-merge.md` (Validation Plan section)

- [ ] Test 1: VLM Markdown format stability — 5 existing images (shanghai-skyline.jpg, ai-robot-hand.jpg, etc.) × 3 runs at temp 0.0. Check: each output has `## Description`, `## Subjects`, `## Content Kind`, `## Fit`, `## Critical Edge Text`, `## Reason`. Pass: ≥80% format correctness.
- [ ] Test 2: Python parser robustness — 10 hand-crafted boundary inputs fed to `parse_markdown_to_dict`. Pass: 10/10 no crash, ≥8/10 key fields present.
- [ ] Test 3: Pre-filter accuracy — 20 simulated candidates (5 good, 5 garbage, 5 borderline, 5 good-content-poor-metadata). Run pre-filter. Pass: 0 false rejects, ≤20% false accepts.
- [ ] Test 4: End-to-end latency — 3 images through full pipeline (pre-filter → VLM → parse → artifact). Compare single-call time vs old double-call time. Pass: single ≤ 60% of double.
- [ ] Test 5 (optional): Semantic scoring — 10 assets + 3 scene contexts. Old keyword token overlap vs new subjects+description matching. Ground truth: human annotation. Pass: new top-3 ≥ old top-3.
- [ ] Output: `experiments/vlm-p3-validation/report.md` with results table for each test
- [ ] All scripts in `experiments/vlm-p3-validation/` — gitignored, can be deleted after validation
- [ ] No production code changes — purely observational
