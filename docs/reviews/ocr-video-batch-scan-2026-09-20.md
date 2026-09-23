# OCR Scan Report: Video Scripts (batch 1-2)

**Date**: 2026-09-20
**Tool**: open-code-review v1.12.6
**Provider**: Ollama (qwen3:8b local)
**Scope**: 40 files (batch 1-2 of 166, batches 3-8 failed due to model deletion)
**Concurrency**: 4, --no-plan

## Summary

- **Total comments**: 41
- **Critical**: 3
- **High**: 11
- **Medium**: 23
- **Low**: 4

## Findings

### 1. [CRITICAL] scripts/short-video/compile-series-reconstruct.mjs:0-0 (bug)

The `mergeScenes` function incorrectly takes the original first and last scenes from the scene arrays instead of the filtered ones. This leads to including hook/CTA scenes that should be excluded.

### 2. [CRITICAL] scripts/short-video/generate-calendar.mjs:47-47 (bug)

The INPUT_PATH is incorrectly set to the output directory (OUTPUT_DIR), which is where the script writes its output. This will cause the script to read from the output directory instead of an input directory, leading to a 'trending-topics.json' file not found error.

### 3. [CRITICAL] scripts/short-video/rerender.mjs:12-12 (performance)

The script uses "await" at the top level without being wrapped in an async function, which is invalid in ES modules. This will cause a syntax error.

### 4. [HIGH] scripts/short-video/compile-series-reconstruct.mjs:113-113 (security)

The script uses `import()` with dynamic paths, which could allow directory traversal if user input is not properly sanitized. Ensure all file paths are validated to prevent arbitrary file reads.

### 5. [HIGH] scripts/short-video/generate-calendar.mjs:50-50 (security)

The script lacks error handling for file operations. If 'trending-topics.json' is missing or malformed, 'readFileSync' will throw an error, causing the script to crash without a helpful message.

### 6. [HIGH] scripts/short-video/mix-bgm.mjs:0-0 (security)

Potential command injection risk via user-provided paths. Ensure videoPath and bgmPath are sanitized to prevent directory traversal attacks.

### 7. [HIGH] scripts/short-video/mix-bgm.mjs:0-0 (security)

The ffmpeg command uses user-provided paths without validation. Potential directory traversal or path manipulation vulnerabilities.

### 8. [HIGH] scripts/short-video/cosyvoice3_mlx_batch_tts.py:32-36 (other)

Missing error handling around manifest loading and subprocess calls. Critical operations like loading the manifest and running ffprobe should be wrapped in try-except blocks to handle potential failures gracefully. Subprocess calls for ffprobe are used multiple times without error handling. Missing 

### 9. [HIGH] scripts/short-video/realign-render.mjs:48-48 (performance)

Missing error handling for async operations and file reads. This can lead to unhandled rejections and crashes.

### 10. [HIGH] scripts/short-video/render-only.mjs:35-36 (security)

Potential command injection vulnerability via user-controlled 'contentDir' argument. User-provided input is used in file paths without validation, risking directory traversal or path traversal attacks.

### 11. [HIGH] scripts/short-video/render-only.mjs:72-74 (security)

Potential command injection via 'scene.id' in audio file paths. User-controlled input is directly used in file paths without validation, risking path traversal attacks.

### 12. [HIGH] scripts/short-video/render-only.mjs:119-123 (security)

Potential command injection via 'bgmFileOverride' argument. User-provided input is used in file paths without validation, risking directory traversal or path manipulation attacks.

### 13. [HIGH] scripts/short-video/render-only.mjs:58-58 (security)

Potential command injection via 'meta.pipelineId' in output directory construction. User-controlled input is used in directory paths without validation, risking directory traversal attacks.

### 14. [HIGH] scripts/short-video/rerender.mjs:0-0 (test)

Missing error handling for async operations like imports and renderRemotion(). This could lead to unhandled rejections.

### 15. [MEDIUM] scripts/short-video/compile-series-reconstruct.mjs:51-51 (maintainability)

The `filterHookAndCta` function assumes all scenes have at least 3 elements to slice, but it returns an empty array if scenes.length <= 2. This could lead to unexpected behavior if a scene array has only 1 or 2 scenes.

### 16. [MEDIUM] scripts/short-video/compile-series-reconstruct.mjs:145-145 (performance)

The script uses `JSON.stringify(merged, null, 2)` to generate the output, which could be memory-intensive for very large scene arrays. Consider using streaming or chunking for better performance with large datasets.

### 17. [MEDIUM] scripts/short-video/compile-series-reconstruct.mjs:0-0 (test)

The exported functions `filterHookAndCta` and `mergeScenes` are not tested. Add unit tests to verify their behavior with edge cases like empty arrays, single-scene arrays, and varying scene lengths.

### 18. [MEDIUM] scripts/short-video/export-analytics.mjs:32-32 (security)

The API key is read from a file with a macOS-specific path (Library/Application Support...). This will not work on Windows or other OSes. Consider using a more cross-platform path or environment variables.

### 19. [MEDIUM] scripts/short-video/export-analytics.mjs:27-27 (maintainability)

The PUB_BASE_URL is hardcoded. Consider using a configuration file or environment variable for better maintainability.

### 20. [MEDIUM] scripts/short-video/export-analytics.mjs:77-77 (security)

The script writes exported data to a file without access control. Ensure the output directory has proper permissions to prevent unauthorized access.

### 21. [MEDIUM] scripts/short-video/export-analytics.mjs:0-0 (performance)

Fetching all posts with a single request (limit=100) may fail if there are more than 100 posts. Consider implementing pagination or rate limiting.

### 22. [MEDIUM] scripts/short-video/generate-calendar.mjs:0-0 (maintainability)

The default ratio (40,30,20,10) is hardcoded in both the comment and the code. This violates the rule against hardcoding business-related values. Consider storing ratios in a configuration file or environment variables.

### 23. [MEDIUM] scripts/short-video/mix-bgm.mjs:0-0 (performance)

The try-catch block for ffprobe duration calculation silently ignores errors. Consider logging errors or handling them explicitly.

### 24. [MEDIUM] scripts/short-video/cosyvoice3_mlx_batch_tts.py:106-109 (security)

Environment variables for ref_audio, model_dir, F5_REF_AUDIO, and F5_REF_TEXT are used without validation. These could allow invalid/malicious paths if not properly sanitized. Ensure these paths are within a trusted directory and prevent path traversal.

### 25. [MEDIUM] scripts/short-video/cosyvoice3_mlx_batch_tts.py:0-0 (security)

Potential directory traversal vulnerability in output path construction. The output_path is constructed using user-provided scene data, which could allow path traversal if not properly sanitized.

### 26. [MEDIUM] scripts/short-video/f5_mlx_batch_tts.py:154-154 (maintainability)

Missing directory existence check for output_dir. Could cause errors if the directory doesn't exist.

### 27. [MEDIUM] scripts/short-video/render-only.mjs:171-178 (maintainability)

Null dereference risk when accessing 'subtitles.assPath'. 'subtitles' could be undefined if Step 3 fails, leading to runtime errors.

### 28. [MEDIUM] scripts/short-video/realign-render.mjs:0-0 (security)

Parsing JSON from untrusted sources without validation could lead to JSON injection vulnerabilities.

### 29. [MEDIUM] scripts/short-video/rerender.mjs:17-17 (security)

Potential security risk: Using JSON.parse() on untrusted files without validation could lead to code injection if the file content is malicious.

### 30. [MEDIUM] scripts/short-video/realign-render.mjs:0-0 (maintainability)

Dynamic imports should be wrapped in try-catch blocks to handle missing modules gracefully.

### 31. [MEDIUM] scripts/short-video/rerender.mjs:0-0 (maintainability)

The script lacks proper error handling for file operations. Missing error checks for readFileSync() and existsSync() could cause crashes.

### 32. [MEDIUM] scripts/short-video/research-pipeline.mjs:0-0 (maintainability)

The 'getArg' function could be replaced with a more robust argument parsing mechanism (e.g., minimist) for better error handling and user feedback.

### 33. [MEDIUM] scripts/short-video/research-pipeline.mjs:79-79 (security)

The 'readResearchArtifact' and 'writeResearchArtifact' functions handle file operations but lack explicit validation of file paths to prevent directory traversal attacks.

### 34. [MEDIUM] scripts/short-video/research-pipeline.mjs:79-79 (performance)

Synchronous file reads (e.g., 'readFileSync') could block the event loop; consider using asynchronous alternatives where feasible.

### 35. [MEDIUM] scripts/short-video/research-pipeline.mjs:0-0 (test)

The 'auditOnly' flag skips brief building but doesn't validate if required files (evidence-pack.json, claim-map.json) exist, which could lead to unhandled errors.

### 36. [MEDIUM] scripts/short-video/trending-sounds.mjs:0-0 (maintainability)

The try-catch block in loadKeywords() silently ignores errors. Consider logging errors or rethrowing them for debugging.

### 37. [MEDIUM] scripts/short-video/trending-sounds.mjs:0-0 (security)

Hardcoded TikTok URLs may limit flexibility and expose sensitive endpoints. Consider externalizing URLs via configuration.

### 38. [LOW] scripts/short-video/export-analytics.mjs:91-91 (security)

The API key is not properly sanitized in error messages. While the code avoids exposing it in logs, ensure no indirect exposure through stack traces or other means.

### 39. [LOW] scripts/short-video/cosyvoice3_mlx_batch_tts.py:76-80 (performance)

Subprocess calls to ffprobe for duration calculation could be slow. Consider using a more efficient method to get audio file duration if performance is critical.

### 40. [LOW] scripts/short-video/trending-sounds.mjs:138-138 (security)

User-provided keywords could potentially trigger SSRF if not properly validated. Ensure all inputs are sanitized.

### 41. [LOW] scripts/short-video/trending-sounds.mjs:0-0 (performance)

The prioritized searchURLs array could benefit from a more efficient filtering mechanism to avoid redundant iterations.

