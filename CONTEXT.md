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

**Trend**: A trending topic discovered by scanning news media, social platforms, and monitored accounts via `discover-trends.mjs`. Used as input to the content pipeline when no Source Material is provided.
_Avoid_: Topic (too generic), keyword

**Trend Source**: A configurable source in `trend-sources.mjs` that `discover-trends.mjs` scrapes for Trends. 15 sources across news media, social platforms, and monitored WeChat accounts. Pluggable: adding a source = adding a collector object.
_Avoid_: Feed, scraper

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
