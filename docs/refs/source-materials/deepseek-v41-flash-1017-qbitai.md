# Source Material: DeepSeek-V4.1-Flash-1017 release (QbitAI)

- URL: https://mp.weixin.qq.com/s/rnlMFZR6zyJmEimC5k9Oig
- Publisher: 量子位 QbitAI (微信公众号)
- Date: 2026-10-17
- Title: 突发！DeepSeek新模型发布，超级性价比斩杀一切
- Authors: 一水, 鹭羽

## Key facts

1. **Model**: DeepSeek-V4.1-Flash-1017 released Oct 17, 2026. Available on official web, APP and API simultaneously. "1017" = Oct 17, matching DeepSeek's date-snapshot naming convention.
2. **DeepSeek Harness 0.2.1**: new Harness version enhanced together with the model. Official quote: "新模型训练时针对DeepSeek Harness进行了专项优化，在提升任务表现的同时，缩短任务运行时间、减少输出消耗和token费用。" Full capability requires Harness >= 0.2.1-rc.1.
3. **Pareto improvement on performance/cost**: benchmarks rise across the board (code, agent tasks), while task runtime and output length are pushed down at the same time. Official framing: "性能—费用的帕累托改进".
4. **DeepSWE test**: V4.1-Flash-1017 pushes the performance-cost frontier further across multiple agent frameworks. DeepSeek Harness, Tencent CodeBuddy and WorkBuddy all received targeted optimization.
5. **"许愿式编程" (wish-based coding)**: only need to state what you want; the model handles planning, coding, running, checking and fixing on its own. Backed by self-feedback reinforcement learning — after the first draft the model continues to self-inspect and repair.
6. **Official demos**: a 3D walkable Forbidden City (view switching, real-time browsing), a web-based racing game, a Godot remake of Portal 2 that is actually interactive, and a dynamic 3D world spanning prehistory to modern times.
7. **Pre-release leak**: the model briefly appeared in DeepSeek's model list hours before release.
8. **Fingerprint change**: `deepseek-flash` system fingerprint changed from `aeb56401ca74e127821c4f9126dcb669` to `e72d3c7f663d3e1383b00b3884cb4501` — indicating backend model version or deployment config updated.
9. **Community consensus**: "更聪明、更快，输出也更简洁了" (smarter, faster, more concise output). Blogger Chetaslua: new version renders richer detail and more realistic lighting. Another said it is smoother than Gemini 4 Argon. Blogger Hakm's multimodal outputs show stronger 3D generation.
10. **Search API opened**: DeepSeek's self-built search engine ships two endpoints — Search (find pages by keyword, supports site/language/publish-time filters) and Fetch (read the page body as Markdown). Pricing: ¥5 per 1,000 successful requests; failed / no-result / timed-out requests are free. Available when using DeepSeek API inside DeepSeek Harness, Claude Code or Codex. Free until Nov 1, 2026.
11. **Sign-up credit**: eligible users who log into DeepSeek Harness for the first time get ¥6 credit, valid 7 days, while supplies last.
12. **Links**: 
    - HuggingFace: https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017
    - ModelScope: https://modelscope.cn/models/deepseek-ai/DeepSeek-V4.1-Flash-1017
    - Search API docs: https://api-docs.deepseek.com/guides/search/
13. **Cited X posts**: 
    - https://x.com/aitrackerbot/status/2111295736411300047
    - https://x.com/yugen_matuni/status/2111336985554227345
    - https://x.com/hakmgpt/status/2111314470433947988
    - https://x.com/hakmgpt/status/2111314427416895798
14. **Preceding event**: DeepSeek "先崩后补偿" (outage then compensation) a couple of days earlier preceded the release — community read it as a sign of an upcoming change.

## Verified primary sources (full text extracted 2026-10-17)

### HuggingFace official model card (deepseek-ai/DeepSeek-V4.1-Flash-1017)
- "a minor update to DeepSeek-V4.1-Flash, delivering substantial improvements across reasoning, coding, agentic tasks, and visual benchmarks. Alongside these gains, the model reduces task execution time and output length ... advancing the performance–cost Pareto frontier across multiple agent harnesses."
- **License: MIT** (both repository and model weights).
- Official benchmark table:

| Benchmark | DS-V4.1-Flash-1017 | DS-V4.1-Flash | K3 | GLM-5.3 | GPT-5.6 Sol | Opus 5 |
| --- | --- | --- | --- | --- | --- | --- |
| HLE w/o tools | 42.6 (44.0†) | 36.8 (39.1†) | 43.5 | 42.0† | 44.5 | 56.3 |
| Terminal-Bench 4.0 | 42.3 | 31.2 | 12.6 | 37.9 | 39.9 | 51.8 |
| DeepSWE v1.1 | 77.0 | 74.2 | 67.5 | 66.9 | 73.0 | 74.0 |
| ProgramBench | 29.1 | 20.3 | 17.5 | 19.0 | 23.0 | 37.0 |
| NL2Repo-Bench | 68.2 | 65.4 | 58.0 | 58.0 | 56.8 | 75.3 |
| Automation-Bench v1.0.6 | 60.5 | 54.8 | 46.7 | 48.8 | 45.8 | 50.3 |
| Agents' Last Exam | 35.4 | 31.8 | 27.6 | 28.5 | 26.7 | 28.6 |
| Apex Bench v1.1 | 72.1 | 64.6 | 47.8 | 56.6 | 54.3 | 65.8 |
| Chartography (w/tools) | 83.0 | 78.9 | 68.1 | — | 79.9 | 84.0 |
| BabyVision (w/tools) | 92.5 | 89.6 | 85.7 | — | 88.9 | 94.1 |
| ZeroBench-main (w/tools) | 51.0 | 49.0 | 41.0 | — | 53.0 | 52.0 |

† = text-only subset of HLE. Terminal-Bench 4.0 uses the Claude Code harness; DeepSWE v1.1 uses Mini-SWE-V2.
- No Jinja chat template this release; a self-contained `encoding.py` reference implementation ships instead, plus `deepseek-recipe` Rust libraries with Python bindings.
- Recommended sampling: temperature 1.0, top_p 1.0, context window 1M tokens, max_tokens ≥ 256K.
- Paper title: "DeepSeek-V4.1-Flash: Pushing the Limits of KV Cache Compression".

### IT之家 (Oct 17, 16:17 CST)
- API calling method and price unchanged — still call `deepseek-flash` to reach the newest model.
- Weights released on both HuggingFace and ModelScope; continues the V4.1 Flash MIT open-source strategy.
- DeepSeek specifically adapted optimization for DeepSeek Harness, Tencent CodeBuddy and WorkBuddy; upgrade Harness to 0.2.1-rc.1 or higher for full support.

### IT之家 (Oct 17, second report — API-layer changes)
- **Search / Fetch API launched**: both use DeepSeek's in-house search engine. Base URL `api.deepseek.com`, same Bearer auth as the DeepSeek API. Endpoints: `POST /v1/tools/search`, `POST /v1/tools/fetch`.
- Billing: **¥5 per 1,000 successful requests**. Charged only when Search returns a non-empty result list, or Fetch returns body content with HTTP 200. Failed requests, empty results and timeouts are not billed. Number of results does not affect price.
- Rate limits: 5 queries/second each for Search and Fetch, counted independently; Fetch also has a per-domain limit; over-limit returns HTTP 429.
- Search `query` max 128 characters; `count` 1–50 (default 10); results carry title, URL, summary, a longer model-facing summary, optional full content, publish date, rerank score and authority rating.
- Query operators supported: `site:`, `-site:`, `-term`, `-"exact phrase"`, `"phrase"`.
- Free window: searches triggered through Claude Code's Web Search tool or Codex's `web_search` before Nov 1, 2026 carry no Search fee.
- **Snapshot leak**: AI Tracker Bot on X spotted an API entry labeled `deepseek-v4.1-flash-1017`, which was quickly removed. The `1017` suffix matches DeepSeek's dated snapshot convention (V4-Flash-0731, V4-Pro-0813). The same account noted the public `deepseek-flash` still points to V4.1 Flash.
- **Harness v0.2.1-rc1 released**: first RC of the 0.2.1 series. Adds custom plugin index sources, a "let the Agent create a plugin" entry, dependency sync for plugin enable/disable/uninstall/update with hot reload, minimal-mode optional plugins, Official plugin list bundling Claude Code / Codex packages for headless/SDK/ACP profiles, experimental Session state interface, experimental Claude Code Mods compatibility layer (validation only, not full compat), experimental developer-tool bundle with inlined NodeJS DevTools, experimental thinking-process machine translation plugin (Bing / Google / paid DeepSeek Flash), experimental Git Worktrees plugin, per-model reasoning levels configured via UI, `working_directory` tool plus TS/Python SDK interfaces, SSH helper runtime, secrets/token masking by default, and more.

### Pandaily (English, Oct 17)
- Headline: "DeepSeek Harness v0.2.1-rc1 Arrives as an Unannounced V4.1 Flash Snapshot Briefly Surfaces".
- Confirms the `deepseek-v4.1-flash-1017` entry appeared and was removed, and that the public `deepseek-flash` still points to V4.1 Flash at the time of writing.

### RuntimeWire (English, Oct 17 12:08 AM CT)
- Written *before* the official release was public; cautious framing: "A dated label is not evidence of a new model or changed performance; DeepSeek's public materials still map deepseek-flash to V4.1-Flash."
- Notes the fingerprint-change report came from X user @teortaxesTex, who said the model "felt smarter and probably terser" — impressions, not proof.
- Documents the public API model list mapping `deepseek-flash` → display name DeepSeek-V4.1-Flash, context window 1,048,576 tokens; change log dates V4.1-Flash to Sep 10, 2026.

## Editorial angle for this pack

This is the direct sequel to the Oct 14 "silent update" story (`deepseek-flash-silent-update`). That pack's conclusion was: the fingerprint has NOT changed since Sep 10 and there is no new checkpoint. Three days later, the rumored change actually happened — the fingerprint flipped and a new model shipped. The narrative reversal is the differentiator; avoid repeating the Oct 14 angle.
