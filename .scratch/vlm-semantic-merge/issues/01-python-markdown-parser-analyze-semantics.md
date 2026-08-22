# 01 — Python: Markdown parser + analyze_semantics handler

**What to build:** The VLM Python subprocess (`vlm_analyzer.py`) gets a new `analyze_semantics` action that outputs Markdown (not JSON) with 6 sections. A pure-code `parse_markdown_to_dict` function parses the Markdown into a dict. Old handlers (`describe_image`, `describe_video`, `analyze_fit`), old prompts (`PROMPT`, `FIT_PROMPT`), and old parser (`_parse_fit_output`) are deleted.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** `docs/specs/spec-vlm-semantic-merge.md`

- [ ] `SEMANTICS_PROMPT_IMAGE` constant — Markdown-section format with 6 sections (Description, Subjects, Content Kind, Fit, Critical Edge Text, Reason) + 2 few-shot examples
- [ ] `SEMANTICS_PROMPT_VIDEO` constant — same sections minus Fit + Critical Edge Text (video doesn't do fit analysis)
- [ ] `parse_markdown_to_dict(raw_text)` function — pure string parsing: strip code fences, split by `## `, key=section name→snake_case, value=section body. Handle: comma vs newline for subjects, enum validation for contentKind/fit, unknown sections preserved, no-`##` fallback to description. Always returns dict with all 6 keys (null for missing).
- [ ] `handle_analyze_semantics(model, processor, path)` handler — dispatches image vs video prompt based on file extension, calls `generate_response` with appropriate prompt, parses output via `parse_markdown_to_dict`
- [ ] Main loop: `analyze_semantics` action replaces `describe_image`, `describe_video`, `analyze_fit`. Old actions removed from dispatch.
- [ ] Delete: `PROMPT`, `FIT_PROMPT`, `handle_describe_image`, `handle_describe_video`, `handle_analyze_fit`, `_parse_fit_output`
- [ ] Response format: `{"description": "...", "subjects": ["..."], "contentKind": "...", "fit": "..."|null, "criticalEdgeText": "..."|null, "reason": "..."|null, "error": null}`
- [ ] Python test file `test_parse_markdown.py` — 10 boundary cases covering: normal Markdown, code-fenced, extra sections, no headers (free text), partial sections, subjects comma vs newline, non-standard contentKind, non-standard fit, empty text, whitespace-only
- [ ] Existing `idle_timer`, `load_model`, `generate_response`, `extract_frames`, `_cleanup_frames` functions unchanged
