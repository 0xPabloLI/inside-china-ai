# Spec: Asset Catalog RAG Integration

> Status: Ready
> Date: 2026-08-14
> Parent: N/A

## Problem Statement

The short-video pipeline has media assets (videos, images) scattered across content directories with no searchable catalog. When authoring new scene-data, there's no way to ask "do we already have footage of a robot walking?" — you have to manually check each `content/{slug}/assets/` directory. As the asset library grows, this becomes unmanageable.

## Solution

Create a machine-readable asset catalog (`assets/catalog.yml`) with text metadata for each media asset. Integrate it into the existing RAG system so Agent can semantically search for assets: "find footage of a robot walking" → returns the file path. The catalog uses text-metadata embeddings (not multimodal embeddings) because asset count is small (<20) and each asset has a human-written description — text embedding via existing `bge-m3` model is sufficient.

## User Stories

1. As an Agent authoring scene-data, I want to search for existing media assets by description, so that I can reuse assets instead of downloading duplicates.
2. As an Agent, I want RAG query results to clearly indicate when a result is an asset catalog entry (not an article or scene-data), so that I know the result points to a media file.
3. As an Agent, I want the catalog to include file path, media type, source, and license, so that I can assess whether an asset is suitable for a new video.
4. As a developer, I want `collectAssetCatalog()` to be a new collector in `index.mjs`, parallel to `collectArticles()` and `collectSceneData()`, so that the RAG rebuild pipeline automatically indexes catalog entries.
5. As a developer, I want `chunkCatalog()` to be a new chunker in `chunker.mjs`, parallel to `chunkMarkdown()` and `chunkSceneData()`, so that each catalog entry becomes one embeddable chunk.
6. As a developer, I want orphan cleanup to automatically remove deleted catalog entries from the RAG index, so that stale entries don't pollute search results.
7. As a developer, I want `query.mjs --type asset-catalog` to filter results to only asset catalog entries, so that I can search specifically for media assets.
8. As a developer, I want the catalog.yml file to be optional (graceful degradation when missing or empty), so that the RAG pipeline doesn't break if no catalog exists.

## Implementation Decisions

### Catalog file format

`scripts/short-video/assets/catalog.yml` — pure YAML, machine-readable. Each entry is an array element with fields: `file`, `type`, `description`, `source`, `license` (optional), `used_in` (optional), `keywords` (optional).

### Chunking strategy

New `chunkCatalog(entries, sourceIdPrefix)` function in `chunker.mjs`. Each YAML entry → one chunk. Chunk text = `description` + `keywords` + `file` + `source` (only fields that exist). Chunk title = file path basename. This is NOT using `chunkMarkdown()` — YAML has no `##` headings.

### content_type

`"asset-catalog"` — used as the `content_type` field in `content_embeddings` table. Queryable via `query.mjs --type asset-catalog`.

### source_id

The `file` field value (e.g., `content/unitree/assets/unitree-demo.mp4`). Each entry has `chunk_index: 0` (one chunk per entry). The UNIQUE constraint `(content_type, source_id, chunk_index)` prevents duplicates.

### metadata

Normalized via existing `normalizeMetadata()` in `normalizer.mjs`:

```json
{
  "media_type": "video",
  "file_path": "content/unitree/assets/unitree-demo.mp4",
  "source": "YouTube (yt-dlp)",
  "license": "Unitree Robotics official",
  "used_in": ["unitree/S2", "unitree/S5", "unitree/S6"],
  "keywords": ["robot", "humanoid", "unitree", "walking", "backflip"]
}
```

### Index integration

New `collectAssetCatalog()` function in `index.mjs`, called in main() alongside existing collectors. Returns array of chunk objects (same shape as `collectArticles()` output). Added to `allChunks` array before embedding step.

### Query integration

No changes to `query.mjs` — `--type asset-catalog` works via existing `match_content` RPC's `filter_content_type` parameter.

## Testing Decisions

- **Test `chunkCatalog()` as pure function** in `scripts/rag/__tests__/chunker.test.mjs` (prior art: existing `chunkMarkdown` and `chunkSceneData` tests)
- **Test `collectAssetCatalog()` indirectly** via integration check in `index.mjs` (prior art: existing `infra-paths.test.mjs` pattern for file existence)
- Test external behavior, not implementation details:
  - Empty/missing catalog → empty array
  - 2 entries → 2 chunks with correct text composition
  - Missing optional fields → chunk_text only includes present fields
  - YAML parse error → graceful skip with warning

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File                             | Modification                                                                    | Risk | Assessment                                           |
| -------------------------------- | ------------------------------------------------------------------------------- | ---- | ---------------------------------------------------- |
| `scripts/rag/index.mjs`          | Add `collectAssetCatalog()` + add to `allChunks`                                | Low  | Pure addition, no modification to existing functions |
| `scripts/rag/lib/chunker.mjs`    | Add `chunkCatalog()` function                                                   | Low  | Pure addition, no modification to existing functions |
| `scripts/rag/lib/normalizer.mjs` | No change needed — existing `normalizeMetadata` passes through arbitrary fields | Low  | Verified: normalizer is generic                      |

### Section 2: Behavioral Scenarios

| #   | Scenario                                     | Expected Behavior                                             | Risk   | Mitigation                   |
| --- | -------------------------------------------- | ------------------------------------------------------------- | ------ | ---------------------------- |
| 1   | catalog.yml does not exist                   | collectAssetCatalog() returns [], no error                    | Low    | existsSync check             |
| 2   | catalog.yml exists but empty array           | Returns [], no error                                          | Low    | YAML parse returns []        |
| 3   | Entry missing `license` field                | chunk_text omits license line, metadata omits license         | Low    | Optional field via `?.`      |
| 4   | Entry missing `keywords` field               | chunk_text omits keywords line                                | Low    | Same                         |
| 5   | YAML syntax error                            | console.warn, skip file, don't block index                    | Medium | try/catch around yaml.load   |
| 6   | Normal 2 entries                             | 2 chunks, content_type=asset-catalog, correct source_id       | Low    | Standard path                |
| 7   | Entry file path doesn't exist on disk        | Still indexed (catalog may precede file)                      | Low    | No file existence check      |
| 8   | Rebuild index after deleting a catalog entry | cleanupOrphans removes stale embedding                        | Low    | Existing mechanism covers    |
| 9   | query.mjs --type asset-catalog               | Returns only asset-catalog chunks                             | Low    | Existing RPC filter          |
| 10  | Entry with `used_in` array                   | metadata.used_in = array, chunk_text includes "Used in:" line | Low    | Array handling in chunk text |

## Out of Scope

- Downloading 20+ assets (separate task — see `docs/research/media-asset-strategy.md` §4.3)
- Multimodal embeddings (CLIP, nomic-embed-vision) — deferred, see `docs/media-asset-management.md` §2
- Auto-generating catalog entries from existing assets (future tooling)
- Modifying `query.mjs` (works as-is with `--type asset-catalog`)

## Further Notes

- The catalog.yml format is YAML (not markdown) because it's machine-written/machine-read. The Agent writes entries when downloading assets.
- `js-yaml` is already a dependency (used in `eval.mjs` for golden-queries.yaml).
- The catalog is Git-tracked (lives in `assets/` which is Git-tracked). This ensures catalog entries survive across machines and sessions.
