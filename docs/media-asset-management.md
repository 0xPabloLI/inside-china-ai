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

**Bootstrap plan**: Gather 20+ content assets from existing published videos (DeepSeek, distillation, restraint, light-society, Unitree — each has scenes that could use media), write catalog entries for each, then reindex. See `docs/archive/media-asset-strategy.md` §4.3 for validated asset sources.

### When to trigger RAG reindex for multimedia assets

Text assets (articles, scene-data) have auto-triggers in the content pipeline (Stage 2d, Stage 3b). Multimedia assets need a manual trigger — **Agent does this as a natural step** when assets change:

| Trigger point | What Agent does | Command |
|---------------|-----------------|---------|
| After downloading new assets (via `asset-sourcer.mjs` or manual) | Write catalog.yml entries (description, keywords, source, license), then reindex | `node scripts/rag/index.mjs` |
| After video pipeline completes (Stage 4 → Stage 5) | If assets were added/modified during production, reindex | `node scripts/rag/index.mjs` |
| After HITL video modification (adding/replacing assets in Stage 5) | Update catalog.yml if new assets, then reindex | `node scripts/rag/index.mjs` |

**Unified flow** — text and multimedia use the same reindex mechanism (incremental by default):
- Text: `publish-article.mjs` → `triggerRagReindex()` (auto, incremental) → `index.mjs`
- Multimedia: download → write catalog.yml entry → `triggerRagReindex()` or manual `node scripts/rag/index.mjs`
- Full rebuild: `node scripts/rag/index.mjs --full`

> Incremental indexing is the default — `index.mjs` computes SHA-256 hash per chunk, compares against DB, and only embeds changed chunks. Unchanged chunks are skipped. First run embeds everything; subsequent runs only embed what changed. `triggerRagReindex()` is non-blocking — failure prints a warning and suggests manual re-run.

**Catalog entry quality**: Agent writes `description` and `keywords` when downloading assets. Description quality directly affects RAG search relevance — Agent should review and edit entries for clarity before reindexing. Do not auto-generate catalog entries from `asset-sourcer.mjs` (quality control matters).

## 3. Key paths the codebase expects

These are environment facts — the code is the source of truth, this table is a cache for quick lookup:

| What | Path pattern | Set in |
|------|-------------|--------|
| TTS ref audio | `voice-samples/voice-sample-24k.wav` | `lib/tts/{qwen-tts,f5-mlx}.mjs` via `ROOT_DIR` |
| TTS ref text | `voice-samples/voice-sample-ref-text.txt` | same |
| Company logo SVG | `assets/logos/{key}.svg` | `lib/scene-templates.mjs` `logoSvg()` |
| Brand mark SVG | `assets/china-ai-news-mark-video.svg` | `lib/scene-templates.mjs`, `build-mark-svg.mjs` |
| BGM library | `assets/bgm/*.mp3` | `lib/bgm.mjs` |
| Content media | `content/{slug}/assets/*` | `scene-data.mjs` `media.path` field |
| Remotion static | `remotion/public/assets/` (symlink → `../../assets/`) | `render-remotion.mjs` copies content media here at render time |

## Design Decisions & References

- **Separation by lifecycle**: `assets/` (stable, Git-tracked) vs `experiments/` (disposable, gitignored) vs `voice-samples/` (personal, gitignored). Primary axis is lifecycle stability, not file type.
- **`voice-samples/` not under `assets/`**: TTS reference audio is an **input** (voice profile to clone), not an **asset** (rendered into video). Different lifecycle, different consumers.
- **Symlink `remotion/public/assets → ../../assets`**: Global assets auto-available to Remotion's `staticFile()`. Content-specific assets copied at render time by `render-remotion.mjs`.
- **Catalog over multimodal embeddings**: Text-metadata catalog works with existing `bge-m3` + `chunkMarkdown()` pipeline. Multimodal embeddings would require a separate model + image-extraction step — not worth the complexity for a local-first stack. See §2.
- **Git LFS for new binary files**: `.gitattributes` tracks `*.mp4` / `*.mp3` / `*.wav` / `*.png` / `*.jpg` etc. via LFS (commit `60505a6`). Old files remain in regular Git (no history rewrite). SVG kept as text (diffable). Git LFS is transparent — files stay at the same paths in the working tree, RAG catalog paths are unaffected.
- **Reorganization history**: `assets/` cleaned on 2026-08-14 — removed 12 digital human experiment files, 16 voice samples, 2 TTS comparison files, 2 duplicate content assets, 10 junk files. TTS engine code updated from `assets/` to `voice-samples/`. See `docs/archive/media-asset-strategy.md` §4.5.

## 5. Evolution Plan: Multimodal Asset Description

> Status: Research notes — not yet implemented. Trigger when catalog exceeds ~50 entries or Agent-written descriptions become imprecise.

### Current approach and its ceiling

Agent writes catalog.yml entries (description + keywords) for each new asset. Works for <50 assets. Beyond that: (a) Agent hasn't viewed the actual video content, so descriptions are inferred from filenames and context, not visual ground truth; (b) scaling becomes a bottleneck.

### Three upgrade paths

| Path | What it does | Local models | Integration effort | When to adopt |
|------|-------------|--------------|-------------------|---------------|
| **A. VLM-assisted description** (recommended) | VLM watches extracted frames → writes description → Agent reviews → catalog.yml → bge-m3 embedding (existing pipeline unchanged) | moondream2 (1.9GB), MiniCPM-V 8B (5GB), Llava-llama3 8B (4.7GB), Qwen2.5-VL 3B/7B | Low: add `ffmpeg` frame extraction + `ollama run` call before catalog entry | >50 assets or description quality drops |
| **B. CLIP direct embedding** | CLIP encodes image → 512/768-dim vector → separate pgvector column → hybrid text+image search | CLIP ViT-B/32 (350MB, ONNX), OpenCLIP ViT-L/14 (1.7GB) | High: new embedding pipeline, new DB column, hybrid query logic | >200 assets, zero-human-touch pipeline |
| **C. Unified multimodal embedding** | One model embeds both text and images into the same vector space | Jina CLIP v2 (text+image, 768-dim), Nomic Embed Vision (text+image) | Medium: replaces bge-m3 for all content, single table | >500 assets + proven need for cross-modal |

### CLIP vs VLM — fundamental distinction

**CLIP** is a model **type** (Contrastive Language-Image Pre-training), not a single model. It maps images and text into the **same vector space** for similarity comparison. Variants: OpenAI CLIP, OpenCLIP, Chinese-CLIP, Jina CLIP. CLIP does **not** generate text — it only produces vectors.

**VLM** (Vision-Language Model) is a broader category: any model that takes images as input and produces text (or takes text+image and produces text). GPT-4o, Qwen-VL, Llava, moondream are VLMs. A large multimodal LLM's vision capabilities are VLM capabilities. CLIP is **not** a VLM — it doesn't generate text, it only embeds.

**Key difference for our use case**:
- VLM → generates description text → feeds into existing `bge-m3` text pipeline (no infra change)
- CLIP → generates image vectors directly → needs separate vector storage and hybrid query

### VLM landscape (Mac M2 Pro 32GB)

The video pipeline uses `mlx-community/Qwen3-VL-2B-Instruct-4bit` via mlx-vlm. For full benchmark comparison across 2B/4B/8B variants, community feedback, and selection rationale, see `docs/research/vlm-model-selection-benchmark.md`.

For the catalog upgrade path, any Qwen3-VL variant can be used — the 2B-4bit is recommended for its speed/memory efficiency. All variants are Apache-2.0.

### Beyond Ollama options

If Ollama models are insufficient, these run locally via `transformers` / `mlx-vlm`:

| Model | Runtime | Size | Notes |
|-------|---------|------|-------|
| **Jina CLIP v2** | `transformers` (PyTorch/ONNX) | 600MB | Text + image in same 768-dim space — could replace bge-m3 entirely |
| **Nomic Embed Vision** | `transformers` | 300MB | Paired with nomic-embed-text — text+image unified |
| **OpenCLIP ViT-L/14** | `transformers`/ONNX | 1.7GB | Classic CLIP, widest community support |
| **Llama 3.2 Vision (11B/90B)** | Ollama or `transformers` | 7-60GB | Meta's VLM, 11B runs on M2 Pro |
| **Qwen-VL-Max (cloud)** | API only | — | Alibaba's SOTA VLM, API with Chinese optimization |

### Decision criteria

- **Now (<50 assets)**: Agent catalog + bge-m3. No change needed.
- **50-200 assets**: Path A — Qwen3-VL-2B via mlx-vlm generates descriptions from extracted frames. Agent reviews. Pipeline: `ffmpeg` frame → VLM description → catalog.yml → bge-m3 → pgvector. Minimal infra change.
- **200+ assets**: Path B or C — CLIP/Jina-CLIP direct image embedding. Separate vector column or unified model replacement. Full automation, no human review.
- **Trigger for review**: When catalog entries >50, or when Agent descriptions are observed to be inaccurate (e.g., describing "robot walking" when video shows "robot doing backflip").
