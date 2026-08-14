# Media Asset Management

> Status: Active — last updated 2026-08-14
> Scope: Where to put image/video/audio files for the short-video pipeline.

## 1. Where to put new files

Place by purpose, not by file extension:

| File type | Directory | Git tracked? | Example |
|-----------|-----------|-------------|---------|
| Brand logo/mark/avatar | `scripts/short-video/assets/` (under `brand/`, `logos/`) | ✅ | `deepseek.svg` → `assets/logos/` |
| BGM music | `scripts/short-video/assets/bgm/` | ✅ | `news-cc-theme01.mp3` |
| Content-specific media (rendered into video) | `scripts/short-video/content/{slug}/assets/` | ✅ | `unitree-demo.mp4` → `content/unitree/assets/` |
| TTS reference audio (voice profile to clone) | `scripts/short-video/voice-samples/` | ❌ | `voice-sample-24k.wav` |
| Experiment outputs (digital human, TTS comparison) | `scripts/short-video/experiments/` | ❌ | `hallo2-test.mp4` → `experiments/digital-human/` |

**Decision rule**: Is it rendered into a video? → `content/{slug}/assets/`. Is it a global brand asset? → `assets/`. Is it a voice profile for TTS? → `voice-samples/`. Unsure if temporary? → `experiments/`.

`assets/` is for **global, reusable production assets only** — never dump experiment outputs or voice samples here.

## 2. Asset Catalog & RAG

### What RAG indexes now

RAG (`scripts/rag/`) embeds **text** via `bge-m3` (1024-dim, local Ollama). Current sources: article markdown + scene-data text fields. Binary files (mp4, jpg, wav) have no text to embed.

### Asset metadata catalog (implemented 2026-08-14)

An **asset catalog** (`scripts/short-video/assets/catalog.yml`) holds text metadata for each media asset. The catalog is plain YAML — RAG indexes it via `chunkCatalog()` in `scripts/rag/lib/chunker.mjs`, enabling semantic search: `node scripts/rag/query.mjs "robot walking" --type asset-catalog` → returns the file path.

**Catalog entry format**:

```yaml
- file: content/unitree/assets/unitree-demo.mp4
  type: video
  description: "Unitree H1 humanoid robot walking and doing backflips"
  source: YouTube (yt-dlp)
  license: "Unitree Robotics official"
  used_in: [unitree/S2, unitree/S5, unitree/S6]
  keywords: [robot, humanoid, unitree, walking, backflip]
```

Each entry becomes one RAG chunk with `content_type: "asset-catalog"`. The chunk text is composed from `description` + `keywords` + `file` + `source` + `license` + `used_in` (only present fields). Query results include `metadata.file_path` so Agent can locate the file directly.

**Why not multimodal embeddings?** Ollama supports text embedding models (e.g. `bge-m3`, `nomic-embed-text`). Multimodal models that embed images/video frames directly (e.g. CLIP, Llama-Vision-Embed) exist but require a separate embedding pipeline with image extraction from video frames. For a local-first stack with <20 assets, text-metadata catalog is the pragmatic path — the description text captures the semantic content that a vision model would extract, and `bge-m3` already runs locally. When the library grows to 1000+ assets with no human-written descriptions, revisit multimodal.

**Bootstrap plan**: Gather 20+ content assets from existing published videos (DeepSeek, distillation, restraint, light-society, Unitree — each has scenes that could use media), write catalog entries for each, then reindex. See `docs/research/media-asset-strategy.md` §4.3 for validated asset sources.

### When to trigger RAG reindex for multimedia assets

Text assets (articles, scene-data) have auto-triggers in the content pipeline (Stage 2d, Stage 3b). Multimedia assets need a manual trigger — **Agent does this as a natural step** when assets change:

| Trigger point | What Agent does | Command |
|---------------|-----------------|---------|
| After downloading new assets (via `asset-sourcer.mjs` or manual) | Write catalog.yml entries (description, keywords, source, license), then reindex | `node scripts/rag/index.mjs` |
| After video pipeline completes (Stage 4 → Stage 5) | If assets were added/modified during production, reindex | `node scripts/rag/index.mjs` |
| After HITL video modification (adding/replacing assets in Stage 5) | Update catalog.yml if new assets, then reindex | `node scripts/rag/index.mjs` |

**Unified flow** — text and multimedia use the same reindex mechanism:
- Text: `publish-article.mjs` → `triggerRagReindex()` (auto) → `index.mjs` full rebuild
- Multimedia: download → write catalog.yml entry → `triggerRagReindex()` or manual `node scripts/rag/index.mjs`

> Full rebuild is currently ~60s (551 chunks on M2 Pro). As the content library grows (more articles, research docs), rebuild time scales linearly with chunk count — expect ~5-10min at 5000+ chunks. Revisit incremental indexing when rebuild exceeds ~5min. `triggerRagReindex()` is non-blocking — failure prints a warning and suggests manual re-run.

**Catalog entry quality**: Agent writes `description` and `keywords` when downloading assets. Description quality directly affects RAG search relevance — Agent should review and edit entries for clarity before reindexing. Do not auto-generate catalog entries from `asset-sourcer.mjs` (quality control matters).

## 3. Key paths the codebase expects

These are environment facts — the code is the source of truth, this table is a cache for quick lookup:

| What | Path pattern | Set in |
|------|-------------|--------|
| TTS ref audio | `voice-samples/voice-sample-24k.wav` | `lib/tts/{cosyvoice,qwen-tts,f5-mlx,csm}.mjs` via `ROOT_DIR` |
| TTS ref text | `voice-samples/voice-sample-ref-text.txt` | same |
| Company logo SVG | `assets/logos/{key}.svg` | `lib/scene-templates.mjs` `logoSvg()` |
| Brand mark SVG | `assets/china-ai-news-mark-video.svg` | `lib/scene-templates.mjs`, `build-mark-svg.mjs` |
| BGM library | `assets/bgm/*.mp3` | `lib/bgm.mjs` |
| Content media | `content/{slug}/assets/*` | `scene-data.mjs` `media.path` field |
| Remotion static | `remotion/public/assets/` (symlink → `../../assets/`) | `render-remotion.mjs` copies content media here at render time |

## 4. Design Decisions & References

- **Separation by lifecycle**: `assets/` (stable, Git-tracked) vs `experiments/` (disposable, gitignored) vs `voice-samples/` (personal, gitignored). Primary axis is lifecycle stability, not file type.
- **`voice-samples/` not under `assets/`**: TTS reference audio is an **input** (voice profile to clone), not an **asset** (rendered into video). Different lifecycle, different consumers.
- **Symlink `remotion/public/assets → ../../assets`**: Global assets auto-available to Remotion's `staticFile()`. Content-specific assets copied at render time by `render-remotion.mjs`.
- **Catalog over multimodal embeddings**: Text-metadata catalog works with existing `bge-m3` + `chunkMarkdown()` pipeline. Multimodal embeddings would require a separate model + image-extraction step — not worth the complexity for a local-first stack. See §2.
- **Reorganization history**: `assets/` cleaned on 2026-08-14 — removed 12 digital human experiment files, 16 voice samples, 2 TTS comparison files, 2 duplicate content assets, 10 junk files. TTS engine code updated from `assets/` to `voice-samples/`. See `docs/research/media-asset-strategy.md` §4.5.
