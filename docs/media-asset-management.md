# Media Asset Management

> Status: Active — last updated 2026-10-16
> Scope: Where to put image/video/audio files for the short-video pipeline.

## 1. Where to put new files

Place by purpose, not by file extension:

| File type                                          | Directory                                                | Git tracked? | Example                                               |
| -------------------------------------------------- | -------------------------------------------------------- | ------------ | ----------------------------------------------------- |
| Brand logo/mark/avatar                             | `scripts/short-video/assets/` (under `brand/`, `logos/`) | ✅           | `deepseek.svg` → `assets/logos/`                      |
| BGM music                                          | `scripts/short-video/assets/bgm/`                        | ✅           | `news-cc-theme01.mp3`                                 |
| Content-specific media (rendered into video)       | `scripts/short-video/content/{slug}/assets/`             | ❌ 默认忽略  | `unitree-demo.mp4` → `content/unitree/assets/`        |
| Digital-human test fixtures (manual model tests)   | `scripts/short-video/assets/dh-fixtures/`                | ✅           | `scene-10.mp4` → consumers in `dh-fixtures/README.md` |
| TTS reference audio (voice profile to clone)       | `scripts/short-video/voice-samples/`                     | ❌           | `voice-sample-24k.wav`                                |
| Experiment outputs (digital human, TTS comparison) | `scripts/short-video/experiments/`                       | ❌           | `hallo2-test.mp4` → `experiments/digital-human/`      |

**Decision rule**: Is it rendered into a video? → `content/{slug}/assets/`. Is it a global brand asset? → `assets/`. Is it a tracked fixture consumed by a manual model test? → `assets/dh-fixtures/`. Is it a voice profile for TTS? → `voice-samples/`. Unsure if temporary? → `experiments/`.

`assets/` is for **global, reusable production assets only** — never dump experiment outputs or voice samples here.

### Hook 封面绑定

hook 场景的 `media.path` 相对 `content/{slug}/` 解析：全局库的 `scripts/short-video/assets/foo.jpg` **不能**直接写成 `assets/foo.jpg`（那会解析到 `content/{slug}/assets/foo.jpg`）。选定文件后**复制**进 `content/{slug}/assets/`——这是文档化路径，包内副本随包管理；`../../assets/<file>` 只是未文档化的绕行写法，不推荐。

```js
// content/{slug}/scene-data.mjs，scene 1
media: { type: "image", path: "assets/hook-cover.png", source: "...", fit: "cover", overlay: 0.7 }
```

确实要做纯文字 hook 时写 `media: null` 显式豁免。门禁语义见 `docs/content-pipeline.md` → Hook 媒体策展（#299），策展标准见 `docs/video-script-writing-guide.md` → Hook 媒体策展（#299）。

### Why content media is not tracked

`content/**/assets/` is gitignored (`.gitignore`): the files are downloaded or generated per package, and they are large binaries. A package's media is force-added only when a **test consumes the bytes or the asset is hand-made and cannot be re-sourced** — the exceptions are the whole list, and each names its consumer:

| Package            | Tracked files | Consumer                                                                                                             |
| ------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `unitree`          | 3             | `media-bg.test.mjs`, `media-zoom-render.test.mjs`, `chunker.test.mjs`                                                |
| `sensetime-latest` | 5             | `focus-smoke.test.mjs` + `fixtures/focus-golden.json`                                                                |
| `qwen4-preview`    | 2             | `render-remotion.mjs` stages `assets/qwen-{architecture,throughput}.png`; hand-made diagrams no source can reproduce |
| `dh-pilot-qwen4`   | 2             | Same two hand-made diagrams, reused by the digital-human pilot                                                       |

When you add a package whose media a test must read, or whose hand-made asset cannot be re-sourced, force-add exactly those files and add the row here.

### Render staging (`_staged/`)

`render-remotion.mjs` stages content media, backdrop clips and avatar clips into `scripts/short-video/assets/_staged/` before each render, and rewrites the scene paths to `_staged/<filename>`. `remotion/public/assets` is a symlink to `assets/`, so this namespace sits **inside** the curated directory: treat `_staged/` as render scratch that is gitignored and safe to delete, and keep hand-placed assets in the curated root beside it. A copy written to the curated root instead is indistinguishable from a curated asset, and the ignore rules for downloaded files (`pexels-*`, `unsplash-*`, …) do not match arbitrary filenames.

Five content copies committed before this rule landed were handled in #707: the four flat copies were deleted, the digital-human clip the manual MiniCPM scripts read was relocated to `assets/dh-fixtures/` as a test fixture, and the two hand-made Qwen diagrams are now tracked inside `qwen4-preview` and `dh-pilot-qwen4` (the package copies existed but were untracked), so their only tracked copies survive a fresh checkout. They were historical residue, not precedent. Content media belongs in `content/{slug}/assets/`; after #707 no tracked content-name copy remains in the curated root (ignored download copies are covered by the source-prefix rules).

## 2. Asset Catalog & RAG

### What RAG indexes now

RAG (`scripts/rag/`) embeds **text** via `bge-m3` (1024-dim, local Ollama). Current sources: article markdown + scene-data text fields. Binary files (mp4, jpg, wav) have no text to embed.

### Asset metadata catalog (implemented 2026-08-14)

An **asset catalog** (`scripts/short-video/assets/catalog.yml`) holds text metadata for each media asset. The catalog is plain YAML — RAG indexes it via `chunkCatalog()` in `scripts/rag/lib/chunker.mjs`, enabling semantic search: `node scripts/rag/query.mjs "robot walking" --type asset-catalog` → returns the file path.

**Catalog entry format**:

```yaml
- file: assets/robot-walk.jpg
  type: image
  description: "Unitree H1 humanoid robot walking"
  source: YouTube (yt-dlp)
  license: "Unitree Robotics official"
  width: 1080
  height: 1920
  used_in: [unitree/S2, unitree/S5]
  keywords: [robot, humanoid, unitree, walking]
```

`file` and `description` are required (the RAG chunker skips entries without them); `width` / `height` are **required for every new entry** (#1003), both positive integers. `npm run lint:catalog` validates the declarations; `node scripts/rag/index.mjs` runs the same check before indexing and refuses to write on errors:

- a **global-library** entry (catalog path under `assets/`, i.e. `scripts/short-video/assets/`) must be at least 720p on the short side (`DEFAULT_TARGET_SHORT_SIDE`); package-local media under `content/<slug>/assets/` has no floor — it is indexed for search and upscaled per package by `autoUpscaleIfNeeded`;
- when the file is on disk, ffprobe must agree with the declaration; a mismatch is an error naming the file, the declared and the measured sizes;
- a missing file or an ffprobe failure is a warning, not a content verdict — the binaries are gitignored and absent on a clean checkout; `--require-files` makes missing files errors for a local pre-admission check;
- entries that predate the rule and have no readable local file are frozen in `LEGACY_CATALOG_FILES_WITHOUT_DIMENSIONS`; the list may only shrink — the validator errors once a frozen file becomes readable, so backfill the dimensions and delete the path. It also reports a frozen path that disappears from the catalog or gains dimensions.

Each entry becomes one RAG chunk with `content_type: "asset-catalog"`. The chunk text is composed from `description` + `keywords` + `file` + dimensions (when declared) + `source` + `license` + `used_in` (only present fields). Query results include `metadata.file_path`, `metadata.width` and `metadata.height` so Agent can locate the file and check its size directly.

**Why not multimodal embeddings?** Ollama supports text embedding models (e.g. `bge-m3`, `nomic-embed-text`). Multimodal models that embed images/video frames directly (e.g. CLIP, Llama-Vision-Embed) exist but require a separate embedding pipeline with image extraction from video frames. For a local-first stack with <20 assets, text-metadata catalog is the pragmatic path — the description text captures the semantic content that a vision model would extract, and `bge-m3` already runs locally. When the library grows to 1000+ assets with no human-written descriptions, revisit multimodal.

**Bootstrap plan**: Gather 20+ content assets from existing published videos (DeepSeek, distillation, restraint, light-society, Unitree — each has scenes that could use media), write catalog entries for each, then reindex. See `docs/archive/media-asset-strategy.md` §4.3 for validated asset sources.

### When to trigger RAG reindex for multimedia assets

Text assets (articles, scene-data) have auto-triggers in the content pipeline (Stage 2d, Stage 3b). Multimedia assets need a manual trigger — **Agent does this as a natural step** when assets change:

| Trigger point                                                      | What Agent does                                                                  | Command                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------- |
| After downloading new assets (via `asset-sourcer.mjs` or manual)   | Write catalog.yml entries (description, keywords, source, license), then reindex | `node scripts/rag/index.mjs` |
| After video pipeline completes (Stage 4 → Stage 5)                 | If assets were added/modified during production, reindex                         | `node scripts/rag/index.mjs` |
| After HITL video modification (adding/replacing assets in Stage 5) | Update catalog.yml if new assets, then reindex                                   | `node scripts/rag/index.mjs` |

**Unified flow** — text and multimedia use the same reindex mechanism (incremental by default):

- Text: `publish-article.mjs` → `triggerRagReindex()` (auto, incremental) → `index.mjs`
- Multimedia: download → write catalog.yml entry → `triggerRagReindex()` or manual `node scripts/rag/index.mjs`
- Full rebuild: `node scripts/rag/index.mjs --full`

> Incremental indexing is the default — `index.mjs` computes SHA-256 hash per chunk, compares against DB, and only embeds changed chunks. Unchanged chunks are skipped. First run embeds everything; subsequent runs only embed what changed. `triggerRagReindex()` is non-blocking — failure prints a warning and suggests manual re-run.

**Catalog entry quality**: Agent writes `description` and `keywords` when downloading assets. Description quality directly affects RAG search relevance — Agent should review and edit entries for clarity before reindexing. Do not auto-generate catalog entries from `asset-sourcer.mjs` (quality control matters).

### 素材缺口账本（#293）

`knowledge/asset-gaps.json` 是「场景声明了素材需求、sourcing 却没给到」的 durable 缺口记录。它是跨包资产：Stage 3 生产结束写入，下一轮 Stage 0 预获取读取——素材库因此逐轮增长，而不是每次从零撞运气。`output/<slug>/media-patch.json` 只活到本包结束，不能当账本。

- **写入**：`node scripts/short-video/asset-gaps.mjs --record --content <slug>`（`docs/content-pipeline.md` Stage 3 第 8d 步，必须执行）。证据来自 scene-data + `media-patch.json` + 8b 的 `stock-relevance-report.json` + Stage 4 的 `b-roll-report.json`；不重新搜索、不下载。
- **读取**：`--query "<实体,概念>"`（按需短路）或 `--list`（默认只看 open）。
- **关闭**：素材真正入库后 `--satisfy <gap-id|need 子串> --by <catalog 路径>`。已 satisfied 的缺口再次 miss 会重新 open——库里有图但 sourcing 没用上，同样是缺口。
- **归因**：`no-candidates`（什么都没搜到/下载到）、`relevance-rejected`（候选被打分但都过不了准入）、`vlm-unavailable`（工具失败，不是内容判决）、`fell-through-to-generation`（`asset-then-*` 策略或 #355 默认链的 `auto` 条目在 `b-roll-report.json` 里落到了生成：sourcing 没给出可用素材）、`unclassified`（历史产物没有 per-scene 证据）。工具失败不得写成内容判决，口径同 `lib/relevance-verdict.mjs`（#294）。
- **边界**：「要不要素材」与 sourcing 用同一个判据 `skipsMediaSourcing`（`lib/claim-keywords.mjs`）——纯生成策略（`b-roll` / `ai-image`）、`visualType: "hook"`（#299 手工策展）、`media: null`、`mediaOptOut` 与已经有 `media` 的场景都不入账：sourcing 从不尝试，记下来的缺口永远关不掉。**「声明」指显式 `assetNeed`**：#354 的 voiceover 派生认领是 best-effort 供给，不写入账本——否则每个氛围场景都会留下一条无法用素材库关闭的泛化缺口。纯生成策略的唯一例外是 8b 已经评判过该场景（报告有记录）——因判据不可满足而改成生成策略，缺口仍然保留。缺口按 need 文本去重（大小写/空白归一），同一 need 在新包再次 miss 才累加 `seenCount`，重放同一个包只刷新原因、不累加。
- **体积**：每缺口最多保留 20 条出现记录（按最近见到时间淘汰），文件不会随轮次无限增长。

### Cross-content reuse cap (asset-sourcer)

asset-sourcer 构建跨内容已用素材索引（扫描各内容包 `assets/` 的文件 sha256 + `research/media-cache.json` 的 URL，排除当前 slug），单次 sourcing 的采用素材中与历史重复的比例超过 40% 即拒绝后续重复候选——治「素材同质化」。索引纯按文件系统扫描，**不依赖 catalog.yml**（catalog 是给 RAG 语义检索用的，两者独立）。降级安全：目录缺失、JSON 损坏、单文件 hash 失败都只产生空集合，不会误判或中断。

### 第三方横屏素材的默认构图（#963）

自动取材对第三方横屏素材（源宽高比 ≥ 1.2）写 `fit: "contain"`：画面整幅保留，底边挂在文字条上方，文字条落在画面外。依据是 2026-11-01 用户裁决「第三方横屏素材完整展示」——cover 塞进 1080×1309 媒体带只保留 16:9 源宽度的约 46%，且没有逐帧保护。竖屏/方形素材仍默认 cover（填满画幅不损失内容）；手写 pack 显式声明的 `fit` 不受影响；AI 生成的 B-roll 不经 `assignAssetsToScenes`，保持既有构图。

尺寸来源按序：下载后的 ffprobe（`width`/`height`，已按 rotation 归一到观看方向）、focus frame、取源元数据 `resolution`。三者都没有时按非横屏处理（维持 cover），不猜。

Hook 与正文同构：pack 自己声明了正文 `fit` 时沿用声明多数（`hookRequiredFitFor`）；没有声明的 pack，hook 按自身源宽高比（横屏 contain、竖/方 cover），不再写死 cover——把竖屏 hook 强塞进 contain 会让前 3 秒变成窄条。`contain` 自 #1021 起对 hook 合法。

## 3. Key paths the codebase expects

These are environment facts — the code is the source of truth, this table is a cache for quick lookup:

| What             | Path pattern                                          | Set in                                                                      |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| TTS ref audio    | `voice-samples/voice-sample-24k.wav`                  | `lib/tts/{cosyvoice3-mlx,f5-mlx}.mjs` via `ROOT_DIR`                        |
| TTS ref text     | `voice-samples/voice-sample-ref-text.txt`             | same                                                                        |
| Company logo SVG | `assets/logos/{key}.svg`                              | `remotion/src/scenes/HookScene.tsx` (staticFile)                            |
| Brand mark SVG   | `assets/china-ai-news-mark-video.svg`                 | `build-mark-svg.mjs`（生成）；`remotion/src`（CtaScene / visuals.tsx 消费） |
| BGM library      | `assets/bgm/*.mp3`                                    | `lib/bgm.mjs`                                                               |
| Content media    | `content/{slug}/assets/*`                             | `scene-data.mjs` `media.path` field                                         |
| Asset gap ledger | `knowledge/asset-gaps.json`                           | `scripts/short-video/asset-gaps.mjs` (`DEFAULT_LEDGER`)                     |
| Remotion static  | `remotion/public/assets/` (symlink → `../../assets/`) | `render-remotion.mjs` stages content media into `_staged/` at render time   |

## Design Decisions & References

- **Separation by lifecycle**: `assets/` (stable, Git-tracked) vs `experiments/` (disposable, gitignored) vs `voice-samples/` (personal, gitignored). Primary axis is lifecycle stability, not file type.
- **`voice-samples/` not under `assets/`**: TTS reference audio is an **input** (voice profile to clone), not an **asset** (rendered into video). Different lifecycle, different consumers.
- **Symlink `remotion/public/assets → ../../assets`**: Global assets auto-available to Remotion's `staticFile()`. Content-specific assets are staged into the gitignored `_staged/` subdirectory at render time by `render-remotion.mjs`.
- **Catalog over multimodal embeddings**: Text-metadata catalog works with existing `bge-m3` + `chunkMarkdown()` pipeline. Multimodal embeddings would require a separate model + image-extraction step — not worth the complexity for a local-first stack. See §2.
- **Binaries in regular Git, NOT LFS** (2026-09-05, #196 方案 B): LFS tracking was removed — the repo had drifted into a split state (old binaries committed raw, newer ones as LFS pointers) that broke fresh checkouts/worktrees and made `git lfs pull` destructive. Total media is ~7MB with slow growth; regular Git storage is the simpler, failure-mode-free home. Do NOT re-add `filter=lfs` patterns without an approved design. SVG stays as text (diffable). RAG catalog paths unaffected.
- **Reorganization history**: `assets/` cleaned on 2026-08-14 — removed 12 digital human experiment files, 16 voice samples, 2 TTS comparison files, 2 duplicate content assets, 10 junk files. TTS engine code updated from `assets/` to `voice-samples/`. See `docs/archive/media-asset-strategy.md` §4.5.

## 5. Evolution Plan: Multimodal Asset Description

> Status: Research notes — not yet implemented. Trigger when catalog exceeds ~50 entries or Agent-written descriptions become imprecise.

### Current approach and its ceiling

Agent writes catalog.yml entries (description + keywords) for each new asset. Works for <50 assets. Beyond that: (a) Agent hasn't viewed the actual video content, so descriptions are inferred from filenames and context, not visual ground truth; (b) scaling becomes a bottleneck.

### Three upgrade paths

| Path                                          | What it does                                                                                                                     | Local models                                                                      | Integration effort                                                          | When to adopt                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| **A. VLM-assisted description** (recommended) | VLM watches extracted frames → writes description → Agent reviews → catalog.yml → bge-m3 embedding (existing pipeline unchanged) | moondream2 (1.9GB), MiniCPM-V 8B (5GB), Llava-llama3 8B (4.7GB), Qwen2.5-VL 3B/7B | Low: add `ffmpeg` frame extraction + `ollama run` call before catalog entry | >50 assets or description quality drops   |
| **B. CLIP direct embedding**                  | CLIP encodes image → 512/768-dim vector → separate pgvector column → hybrid text+image search                                    | CLIP ViT-B/32 (350MB, ONNX), OpenCLIP ViT-L/14 (1.7GB)                            | High: new embedding pipeline, new DB column, hybrid query logic             | >200 assets, zero-human-touch pipeline    |
| **C. Unified multimodal embedding**           | One model embeds both text and images into the same vector space                                                                 | Jina CLIP v2 (text+image, 768-dim), Nomic Embed Vision (text+image)               | Medium: replaces bge-m3 for all content, single table                       | >500 assets + proven need for cross-modal |

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

| Model                          | Runtime                       | Size   | Notes                                                              |
| ------------------------------ | ----------------------------- | ------ | ------------------------------------------------------------------ |
| **Jina CLIP v2**               | `transformers` (PyTorch/ONNX) | 600MB  | Text + image in same 768-dim space — could replace bge-m3 entirely |
| **Nomic Embed Vision**         | `transformers`                | 300MB  | Paired with nomic-embed-text — text+image unified                  |
| **OpenCLIP ViT-L/14**          | `transformers`/ONNX           | 1.7GB  | Classic CLIP, widest community support                             |
| **Llama 3.2 Vision (11B/90B)** | Ollama or `transformers`      | 7-60GB | Meta's VLM, 11B runs on M2 Pro                                     |
| **Qwen-VL-Max (cloud)**        | API only                      | —      | Alibaba's SOTA VLM, API with Chinese optimization                  |

### Decision criteria

- **Now (<50 assets)**: Agent catalog + bge-m3. No change needed.
- **50-200 assets**: Path A — Qwen3-VL-2B via mlx-vlm generates descriptions from extracted frames. Agent reviews. Pipeline: `ffmpeg` frame → VLM description → catalog.yml → bge-m3 → pgvector. Minimal infra change.
- **200+ assets**: Path B or C — CLIP/Jina-CLIP direct image embedding. Separate vector column or unified model replacement. Full automation, no human review.
- **Trigger for review**: When catalog entries >50, or when Agent descriptions are observed to be inaccurate (e.g., describing "robot walking" when video shows "robot doing backflip").
