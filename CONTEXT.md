# China AI News

A content/blog platform covering China's AI industry, with an admin editor, interactive article widgets, a short video pipeline, and an email newsletter system.

## Content

**Article**: The content itself — a frontmatter markdown file with title, slug, excerpt, and body. Exists before publication as a draft and after publication as the source of a Post. The pipeline script `publish-article.mjs` publishes an Article to create or update a Post.
_Avoid_: Draft (too narrow — an Article is an Article whether drafted or published)

**Post**: The database entity representing a published Article on the website. A Post has an id, slug, status, content, and attachments. An Article becomes a Post when published via the pipeline.
_Avoid_: Article, entry, blog post (use Post for the database row; use Article for the content file)

**Frontmatter**: YAML metadata block at the top of an Article file, containing `title`, `slug`, `excerpt`, and `published` flag. Consumed by `publish-article.mjs` to create or update a Post.
_Avoid_: Metadata, header

**Source Material**: A raw input file (PDF, report, transcript, URL content) used by the content pipeline to generate an Article. Stored in `docs/refs/source-materials/`.
_Avoid_: Source file, reference (too generic)

**Attachment**: A file uploaded to a Post's storage path (`{postId}/{fileName}`) and listed on the article page for readers to download. Tracked in the `post_attachments` table.
_Avoid_: Media, file (too generic)

## Widgets

**Widget**: An interactive React component embedded inside a Post's markdown content via an HTML comment marker (e.g., `<!-- widget:deepseek-talent -->`). Each widget is a self-contained component with its own hardcoded data. Widgets are registered in a central registry and lazy-loaded on demand.
_Avoid_: Dashboard (legacy term from the standalone HTML prototype), embed, block

**Widget Marker**: An HTML comment in the post's markdown content that signals the renderer to insert a specific widget at that position. Format: `<!-- widget:<name> -->`.
_Avoid_: Tag, shortcode, directive

**Widget Registry**: A TypeScript module (`src/components/widgets/registry.ts`) that maps widget names to lazy-loaded React components. Adding a new widget = create the component + add one line to the registry. The article page and editor dropdown read from this registry.
_Avoid_: Plugin system, widget manager

**Content Splitter**: The logic in the article page that parses post content for widget markers, splits the markdown into segments, and renders alternating Markdown content and Widget components.
_Avoid_: Parser, renderer (those are too generic)

**Data Package**: A named grouping of widgets that share a common data source (e.g., `deepseek` widgets all use data from the DeepSeek investor meeting). Widget names use a `package:view` convention (e.g., `deepseek:talent`), though single-name widgets without a package prefix are also valid.
_Avoid_: Dataset, module

## Subscribers & Newsletters

**Subscriber**: A person who provided their email to receive newsletters. Stored in the `subscribers` table. Anyone can subscribe; only admins can view or remove subscribers.
_Avoid_: Member, contact, user (use Subscriber for email list entries)

**Newsletter**: An email campaign — content, subject line, and optional scheduling. Created by an admin, dispatched to all Subscribers. Stored in the `newsletters` table with status `draft` / `scheduled` / `sent` / `failed`.
_Avoid_: Email, campaign, blast

**Newsletter Send**: A single delivery record for one recipient within a Newsletter dispatch. Tracked in the `newsletter_sends` table with per-recipient status (`sent` / `failed` / `suppressed`).
_Avoid_: Delivery, send log

**Suppression List**: The set of email addresses blocked from receiving Newsletters due to bounces, complaints, or unsubscribes. Managed by Lovable's email infrastructure and synced via email events.
_Avoid_: Blocklist, deny list

## Video Pipeline

**Scene**: A single visual segment in a short video, with a `visualType` (hook, content, cta), voiceover text, on-screen texts, and duration. A video is composed of 8-12 Scenes.
_Avoid_: Shot, frame, clip

**Scene Data**: A `.mjs` file (`scene-data.mjs` or `scene-data-ptN.mjs`) containing all Scene definitions for one video. Written by the agent from an Article, consumed by the video pipeline (`main.mjs`).
_Avoid_: Script, storyboard (too generic)

**Part**: A single video in a multi-part series. When an Article is too rich for one 60s video, it splits into Parts (max 3). Each Part has its own Scene Data file. Published with `Part X/Y` labels.
_Avoid_: Episode (use Episode only when referencing the evaluator's internal concept)

**Series**: A collection of Parts sharing a `seriesMeta` block (part number, total parts, prev/next part slugs). Published over 1-3 days with inter-episode linking (pinned comments, hashtags).
_Avoid_: Playlist, collection

**Trend**: A trending topic discovered by scanning news media, social platforms, and monitored accounts via `search-sources.mjs --trend`. Used as input to the content pipeline when no Source Material is provided.
_Avoid_: Topic (too generic), keyword

**Source Registry**: The single source of truth for all source definitions in `source-registry.mjs`. Contains 59 sources (news, self-media, western, stock APIs, video platforms, WeChat RSS). Each source has an optional `capabilities` object declaring what data types it provides (`articles`, `images`, `videos`) and how (CDP scripts, API config, yt-dlp platform). Consumers query by capability: `search-sources.mjs` filters `capabilities.articles`, `asset-sourcer.mjs` filters `capabilities.images` / `capabilities.videos`. Adding a source = adding one object with capabilities; no code changes in consumers.
_Avoid_: Feed, scraper

**Capabilities**: An optional field on each source in the Source Registry, declaring what data types the source can provide and the access method for each. Shape: `{ articles?: {...}, images?: {...}, videos?: {...} }`. A source can have one, two, or all three capabilities (e.g., all 9 CDP search sources have `articles` + `images`; Pexels has `images` + `videos`; arXiv has `articles` only). For dual-capability CDP sources, `extractScript` returns `{ url: articleUrl, imageUrl }` for trend discovery, while `capabilities.images.primaryScript` returns `{ url: imageUrl, type: 'image' }` for asset sourcing — same DOM, different field semantics.
_Avoid_: Source config, source flags

## TTS & Voice

**TTS Engine Adapter**: A module in `lib/tts/` that implements a common interface (`isAvailable()`, `generate()`, `info`) for a specific TTS provider. Registered in `registry.mjs` via `ENGINE_FACTORIES` and selected by `PRIORITY` order or `TTS_ENGINE` env override. Current engines: F5-TTS-MLX (default), Qwen3-TTS (backup), edge-tts (fallback), macOS `say` (last resort).
_Avoid_: TTS provider, voice generator

**Reference Voice**: The paired WAV audio sample + matching transcript used by F5-TTS-MLX and Qwen3-TTS for zero-shot voice cloning. All videos use the same Reference Voice for brand consistency. Format (24kHz mono WAV) and path details: `docs/video-workflow.md` → F5-TTS-MLX.
_Avoid_: Voice sample, ref audio (use Reference Voice for the paired audio+text)

**Max Effort**: The highest-quality configuration for a TTS engine (F5-TTS-MLX `steps=32`/`cfg_strength=3.0`/`wps=2.8`/`method='rk4'`; Qwen3 `do_sample=False`/`repetition_penalty=1.3`). Parameters and rationale: `docs/video-workflow.md` → TTS Engine Configuration.
_Avoid_: High quality, max settings (too generic)

## VLM & Asset Analysis

**VLM** (Vision-Language Model): A local AI model (Qwen3-VL-8B-Instruct-8bit via mlx-vlm) that describes images and videos, and analyzes how to fit landscape assets into vertical canvas. Runs as a persistent Python subprocess (`vlm_analyzer.py`) managed by `visual-analyzer.mjs`. See ADR-0009.
_Avoid_: Vision model, image analyzer (too generic)

**Asset Claim**: A scene's declared visual need, written as the structured `assetNeed` field in Scene Data. asset-sourcer turns each claim into deterministic search keywords, sources candidates bound to that scene (`claimSceneId`), and the VLM judges them against the claim. The inline `[ASSET NEEDED: ...]` text annotation is deprecated — scene-rules B13 fails if it leaks into voiceover.
_Avoid_: Asset need annotation, [ASSET NEEDED] marker

**Relevance Gate**: The fail-closed check that an asset must pass before entering media-patch: VLM `Relevance` score (claim-bound assets) or deterministic token overlap vs the scene's voiceover (fallback assets) must reach the threshold (default 60). Below threshold → no media, Scene renders with CSS fallback — 宁缺毋滥. VLM failure counts as below threshold.
_Avoid_: Relevance filter (it gates assignment, not search results)

**Used-Asset Index**: A cross-content index of media already used by previous content packages (file sha256 under `content/*/assets/` + canonicalized URLs from `research/media-cache.json`, current slug excluded). asset-sourcer caps reused assets at 40% of what gets assigned per run. Degrades to empty sets on missing dirs or broken caches.
_Avoid_: Asset dedup cache, media-cache (that name belongs to the per-content research cache)

**Asset Fit Analysis**: A VLM operation that determines whether a landscape image should use `cover` (crop) or `contain` (letterbox) in a 9:16 canvas. The VLM sees a 9:16-cropped version of the image (when landscape) and outputs `{fit, criticalEdgeText, reason}`. The `focus` field is deprecated; crop positioning is handled by Crop Decision.
_Avoid_: Crop analysis, aspect ratio check

**Crop Decision**: A deterministic evaluation of whether a 9:16 cover crop from a candidate focus point preserves all Protected Regions. Produces a `CropDecision` object: `{ status: "safe"|"unsafe"|"indeterminate", policy: "cover"|"contain", cropFocus: {x,y}|null, reason, candidates }`. Uses `resolveObjectPosition` to convert normalized source-space focus into CSS `object-position`. Written to `asset-analysis.json` for human review before `scene-data` mutation. See `docs/spec-vertical-cropping.md`.
_Avoid_: Crop analysis (too generic — use Crop Decision for the contract), fit analysis

**Focus Detection**: A deterministic, lightweight spatial analysis performed by OpenCV (Haar Cascade face detection + Spectral Residual saliency) via a dedicated Python subprocess (`focus_detector.py`). Complements the VLM's semantic analysis. Runs as Phase 2 (after pre-filter Phase 1, before VLM Phase 3) in `analyzeAssets()` — only on assets that survived the free pre-filter gate. **Never rejects** — returns schema-complete degraded results on failure. See ADR-0015.
_Avoid_: Focus analysis, spatial analysis (too generic)

**Protected Region**: A normalized bounding box `[x, y, w, h]` (all in [0, 1]) identifying an area in a source image that should not be covered by text overlays. Currently produced only for faces (`kind: "face"`). Written to `media-patch.json`'s `analysis.focusAnalysis` field for human review.
_Avoid_: Focus box, face box (too narrow — future kinds include body, text, object)

**Saliency Map**: A heatmap of visual attention computed via Spectral Residual algorithm. Summarized as `dispersion` (variance-based concentration, 0 = uniform, 1 = focal point) and `centroid` (weighted center of attention, `[cx, cy]`). Always computed as a soft signal, independent of face detection results.
_Avoid_: Heatmap, attention map

## Rendering

**Remotion**: A React-based video rendering framework used as the primary rendering engine. Renders frames deterministically via server-side rendering (frame-accurate). Replaces Playwright screencast recording. See ADR-0010.
_Avoid_: Video framework, renderer (too generic)

**Playwright Recording** (retired): Previous HTML/CSS + Playwright `page.screencast()` renderer; retired (decision 59, #147), tooling in `scripts/short-video/retired-html-path/`. `renderer-guard.mjs` fails fast on the retired flag; Remotion is the only renderer.
_Avoid_: Browser recording, screencast

**Scene Component**: A Remotion React component that renders one scene type (HookScene, ContentScene, NarrativeScene, DataScene, QuoteScene, CtaScene). Each maps to a `visualType` in Scene Data. See ADR-0010.
_Avoid_: Scene template, scene renderer

## Infrastructure

**Unified Venv**: A single Python 3.12 virtual environment at `~/.video-tts-env` containing F5-TTS-MLX, Qwen3-TTS, whisperx, and mlx-vlm. Replaces 3-4 separate venvs. See ADR-0011.
_Avoid_: Python env, venv (too generic — use Unified Venv for this specific shared environment)

**Collection Layer**: The access method hierarchy for a source in the Source Registry: API → CDP → CDP fallback (Google site: search) → MCP fallback (Grok). Each source defines its own `accessMethod` with primary and fallbacks. See ADR-0013.
_Avoid_: Access method, fetch strategy

## Content Pipeline

**HITL Checkpoint**: A mandatory human-review gate in the content pipeline. The agent must pause, output the review content, and wait for explicit user confirmation before proceeding. One checkpoint: HITL (Video成品审阅), after MRL-3 passes and before publishing. The user reviews the video, article, and scene-data together.
_Avoid_: Review, approval (too generic)

**MRL** (Machine Review Loop): An automated self-review cycle that runs before each HITL Checkpoint. The agent checks its output against a Blocker/Warning checklist, fixes all Blockers, and loops until 0 Blockers before presenting to the user.
_Avoid_: Lint, validation (those are too narrow)

**Pipeline Status**: A JSON file (`scripts/short-video/output/pipeline-status.json`) tracking the current stage, per-stage completion, MRL results, and next action for an in-progress content pipeline run.
_Avoid_: Progress tracker, state file

**Pending Analysis**: A JSON file (`scripts/short-video/output/pending-analysis.json`) written after TikTok publishing, recording that analytics data is not yet available. Checked at session start; if >48h since publish, the user is prompted to export the analytics CSV.
_Avoid_: Analytics tracker, metrics file

## RAG Pipeline

**Embedding**: A vector representation of text content, generated by bge-m3 (1024 dimensions) via Ollama. Used for semantic similarity search. Stored in the `content_embeddings` table's `embedding` column.
_Avoid_: Vector, feature (too generic)

**Chunk**: A semantically coherent unit of content that gets its own Embedding. Typically one `##` section of a markdown file or one Scene's voiceover + visual text. Identified by the tuple `(content_type, source_id, chunk_index)`.
_Avoid_: Segment, fragment (too generic)

**Vector Search**: Retrieving content by computing cosine similarity between a query Embedding and stored Embeddings. Performed by the `match_content` PostgreSQL RPC function. Returns results above a similarity threshold (default 0.7).
_Avoid_: Semantic search, similarity search (those describe the concept; Vector Search is the implementation)

**Reranker**: An optional second-stage ranking model (bge-reranker-base) that reorders Vector Search results for higher precision. Disabled by default; enabled via the `--rerank` CLI flag. Gated on Golden Query evaluation results.
_Avoid_: Re-ranker, second-pass

**Golden Query**: A hand-curated test query with known expected results, used to evaluate retrieval quality. Stored in `docs/refs/rag-eval/golden-queries.yaml`. The evaluation script (`scripts/rag/eval.mjs`) runs all Golden Queries and reports top-5 hit rate.
_Avoid_: Test query, benchmark query

**Orphan Cleanup**: A post-indexing step that deletes Embeddings whose `source_id` no longer corresponds to any content file. Runs once at the end of a full rebuild. Ensures deleted articles or removed source materials don't leave stale Embeddings.
_Avoid_: Garbage collection, prune
