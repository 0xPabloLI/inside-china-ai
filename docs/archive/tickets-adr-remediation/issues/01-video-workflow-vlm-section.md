# 01 — video-workflow.md: add VLM section + dual-track rendering note

**What to build:** Add a new "VLM Asset Analysis" section to `docs/video-workflow.md` (between TTS Engine Configuration and Logo Handling) with: two-subprocess architecture, two-phase execution, performance characteristics, graceful degradation, 180s timeout, known limitations. Add a dual-track rendering note to Pipeline Steps table (Step 3). This is the L1 landing zone that ADR-0009/0015 Consequences will point to.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `docs/video-workflow.md` has new "VLM Asset Analysis" section with: two subprocesses (focus_detector.py OpenCV ~180ms/image, vlm_analyzer.py Qwen3-VL-8B ~20-30s/image ~100-120s/video), two-phase execution (focus batch → close → VLM batch → close), graceful degradation (Python unavailable → empty strings, pipeline continues), 180s timeout, known limitations (slow video, 8B hallucination, objc warnings)
- [ ] `docs/video-workflow.md` Pipeline Steps Step 3 has dual-track rendering note (`--remotion` flag / `meta.renderer === "remotion"` → Remotion; default → Playwright legacy)
- [ ] Section uses pointer to ADR-0009, ADR-0015, and `docs/research/asset-focus-detection-alternatives.md`
- [ ] No existing content in video-workflow.md is modified or deleted
