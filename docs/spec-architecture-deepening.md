# Architecture Deepening Spec

> **Origin**: `improve-codebase-architecture` skill review (2026-08-05)
> **Scope**: 8 refactoring candidates across website + video pipeline. Behavior-preserving — no new features.

## How to Use This Document (For New Sessions)

1. 读 **Session Plan** 表格 → 找到状态为 🔲 Pending 的下一个 session
2. 读对应 Candidate 的 **Problem / Solution / Interface** → 理解设计意图
3. 读 **Modified Files Impact** + **Behavioral Scenarios** → 场景矩阵就是测试用例清单
4. 按 **Workflow** 执行 → 每步完成后更新 **Progress Checklist** 和 Session Plan 状态
5. 验证全绿后 commit + push → 用新 commit（amend 仅限未 push 且非 Lovable 连接分支）

## Workflow (Per Session)

本 spec 已完成 Grill + To Spec 阶段（设计 + 场景矩阵已固化）。新 session 从 TDD Implement 开始：

```
1. TDD Implement  — 逐 Candidate 实施
   ├─ 先读当前代码确认设计仍然匹配
   ├─ 按 Behavioral Scenarios 矩阵逐行实现
   └─ 关键逻辑先写测试（矩阵每行 = 一个测试用例）

2. Code Review    — 对照 spec 场景矩阵逐项验证
   ├─ Standards: 遵循 AGENTS.md coding conventions
   └─ Spec: 每个 Behavioral Scenario 行为是否匹配

3. Runtime Verify
   ├─ npm run lint   （仅改动的文件零新错误）
   ├─ npx tsc --noEmit  （零新增 TS 错误）
   ├─ npm run build  （构建通过）
   └─ UI 改动需 dev server 浏览器验证

4. Commit & Push
   ├─ git add <具体路径>   （绝不 git add -A）
   ├─ git commit -m "refactor(scope): ..."
   └─ git push

5. Update This Document
   ├─ Session Plan 表格状态 → ✅ Done
   └─ Progress Checklist 打勾
```

**跳过的标准工作流步骤**（因为这是行为保持的重构，不是新功能）：
- ~~Grill with Docs~~ — 已在初始 session 完成
- ~~To Spec~~ — 本文档就是 spec
- ~~To Tickets~~ — 每个 Candidate 就是一个 ticket，无需额外拆分

## Session Plan

| Session | Candidates | Domain | Status | Commit |
|---------|-----------|--------|--------|--------|
| S1 | 1 + 2 (requireAdmin + useIsAdmin) | Website — auth | ✅ Done | `2eda390` |
| S2 | 5 (TTS engine strategy) | Video pipeline | ✅ Done | `cef738d` |
| S3 | 6 + 7 (Publora client + CDP scraper) | Video pipeline | ✅ Done | `70541c9` |
| S4 | 8 → 3 → 4 (PostEditor → attachment upload → Supabase factory) | Website | ✅ Done | `7ebc78f` |

---

## Candidate 1: Extract `requireAdmin` middleware

### Problem

`has_role` RPC check is copy-pasted into 9 admin server functions across 3 files (`posts.functions.ts`, `subscribers.functions.ts`, `newsletters.functions.ts`). `newsletters.functions.ts` has a local `assertAdmin()` — still shallow, still duplicated.

### Solution

A `requireAdmin` middleware that wraps `requireSupabaseAuth` and adds the role check. All admin server functions declare `.middleware([requireAdmin])`.

### Interface

```typescript
// src/integrations/supabase/require-admin.ts
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ context, next }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    return next({ context: { ...context, isAdmin: true } });
  });
```

### Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `src/integrations/supabase/require-admin.ts` | New file | Low | Pure addition |
| `src/lib/posts.functions.ts` | Replace inline `has_role` with `.middleware([requireAdmin])` on 7 fns | Medium | Auth path — verify all 7 still reject non-admin |
| `src/lib/subscribers.functions.ts` | Replace inline `has_role` with `.middleware([requireAdmin])` on 2 fns | Medium | Same auth path |
| `src/lib/newsletters.functions.ts` | Delete `assertAdmin()`, replace with `.middleware([requireAdmin])` on 6 fns | Medium | `assertAdmin` was local; middleware replaces it |
| `src/integrations/supabase/auth-middleware.ts` | No change | — | `requireAdmin` wraps it, doesn't modify it |

### Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Admin user calls `listAllPostsAdmin` | Returns posts | Low | Existing behavior preserved |
| 2 | Non-admin authenticated user calls `listAllPostsAdmin` | Throws "Forbidden" | Medium | Middleware must throw before handler runs |
| 3 | Unauthenticated user calls `savePost` | Throws "Unauthorized" (from `requireSupabaseAuth`) | Low | `requireSupabaseAuth` runs first in chain |
| 4 | Admin user calls `savePost` with valid data | Saves post | Low | Handler body unchanged |
| 5 | Admin user calls `deletePost` | Deletes post + attachments | Low | Handler body unchanged |
| 6 | Non-admin calls `subscribe` (public fn, no middleware) | Succeeds — no admin required | Medium | `subscribe` must NOT get `requireAdmin` |
| 7 | Non-admin calls `listNewsletters` | Throws "Forbidden" | Medium | Was using `assertAdmin`, now uses middleware |
| 8 | Admin calls `sendNewsletterNow` | Dispatches newsletter | Low | Handler body unchanged |

---

## Candidate 2: Extract `useIsAdmin` hook

### Problem

"Is this user an admin?" has two implementations:
- `admin.tsx`: `useEffect` → `supabase.auth.getUser()` → `supabase.rpc("has_role")`
- `site-header.tsx`: `useEffect` → `supabase.auth.getUser()` → `supabase.from("user_roles").select()`

Two methods, same question — can diverge silently. AGENTS.md flags this as high-risk.

### Solution

A `useIsAdmin()` hook that encapsulates auth check + role lookup. Both components call it.

### Interface

```typescript
// src/hooks/use-is-admin.ts
export function useIsAdmin(): {
  isAdmin: boolean | null;  // null = loading, false = not admin, true = admin
  isLoading: boolean;
}
```

### Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `src/hooks/use-is-admin.ts` | New file | Low | Pure addition |
| `src/routes/_authenticated/admin.tsx` | Replace inline `useEffect` + `has_role` with `useIsAdmin()` | High | AGENTS.md high-risk area — state init timing |
| `src/components/site-header.tsx` | Replace inline `useEffect` + `user_roles` query with `useIsAdmin()` | Medium | Different method (table query → RPC) — verify same result |
| `src/routes/_authenticated/route.tsx` | No change | — | Auth-only check (no role) — stays as-is |

### Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Admin user loads `/admin` | `isAdmin=true`, posts query enabled | High | State init timing — hook must resolve before queries |
| 2 | Non-admin user loads `/admin` | `isAdmin=false`, "no admin access" shown | Medium | Must match current behavior |
| 3 | Unauthenticated user hits `/admin` | Redirected to `/auth` by route guard | Low | `route.tsx` handles this, hook never runs |
| 4 | Admin user loads homepage | `site-header` shows "Admin" link | Medium | Method change: table query → RPC |
| 5 | Non-admin user loads homepage | `site-header` hides "Admin" link | Medium | Same — method change |
| 6 | User logs out while on homepage | `onAuthStateChange` fires → `isAdmin` updates to `false` | Medium | Hook must subscribe to auth state changes |
| 7 | User logs in while on homepage | `isAdmin` updates to `true` (if admin) | Medium | Same — auth state subscription |

---

## Candidate 5: Deepen TTS engine module

### Problem

`generate-tts.mjs` is 470 lines containing 5 TTS engines (F5-MLX, XTTS, Kokoro, edge-tts, macOS say). F5 and XTTS batch paths have nearly identical post-processing loops (copy-pasted). Selection logic is a 40-line if-else chain.

### Solution

A `TTSEngine` interface with one adapter per engine. Registry selects by priority or `TTS_ENGINE` env. Shared `postProcess()` and `runWhisperAlignment()` extracted.

### Interface

```javascript
// scripts/short-video/lib/tts/types.mjs
/** @typedef {{ isAvailable(): Promise<boolean>, generate(scenes, outputDir): Promise<TTSResult[]> }} TTSEngine */

// scripts/short-video/lib/tts/registry.mjs
export async function selectEngine() → TTSEngine
export function generateTTS(scenes, outputDir) → TTSResult[]
```

### Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `scripts/short-video/lib/tts/` | New directory with adapters | Low | Pure addition |
| `scripts/short-video/lib/generate-tts.mjs` | Reduce to import + delegate | High | 470→~20 lines; all callers must see same results |
| `scripts/short-video/lib/assemble.mjs` | No change | — | Consumes `ttsResults` — shape preserved |
| `scripts/short-video/main.mjs` | No change | — | Imports `generateTTS` — interface preserved |

### Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | F5-MLX available, no `TTS_ENGINE` set | Uses F5-MLX | Medium | Priority order must match current |
| 2 | F5 unavailable, XTTS available | Falls back to XTTS | Medium | Same fallback chain |
| 3 | `TTS_ENGINE=kokoro` env set | Uses Kokoro regardless of priority | Low | Env override preserved |
| 4 | No engine available | Throws error with install hints | Low | Same error message |
| 5 | F5 batch generates 8 scenes | Post-process applies to all 8 | Medium | Shared `postProcess` must match F5 path |
| 6 | XTTS batch generates 8 scenes | Post-process with `SILENCE_FILTER` | Medium | Shared `postProcess` must match XTTS path (different filter!) |
| 7 | Edge-TTS generates single scene | Post-process with `SILENCE_FILTER` | Low | Per-scene engines share post-process |
| 8 | `TTS_ATEMPO=1.3` env set | atempo applied to F5 output | Medium | F5 skips `SILENCE_FILTER`, only applies atempo |
| 9 | `text-align.py` exists | `runWhisperAlignment` runs after generation | Low | Shared function, same behavior |
| 10 | `text-align.py` missing | Alignment skipped, warning logged | Low | Same graceful fallback |

---

## Candidate 6: Extract Publora API client

### Problem

`publish-tiktok.mjs` embeds Publora REST client + API key resolution. `fetch-tiktok-analytics.mjs` duplicates key resolution. Adding YouTube publish = copy-paste.

### Solution

A `publora-client.mjs` module with `getApiKey()`, `post()`, `put()`, `uploadToS3()`, `getPlatformId()`.

### Interface

```javascript
// scripts/short-video/lib/publora-client.mjs
export async function getApiKey() → string
export async function publoraPost(path, body, apiKey?) → object
export async function publoraPut(path, body, apiKey?) → object
export async function uploadToS3(uploadUrl, filePath, contentType) → void
export async function getPlatformId(platformPrefix, apiKey?) → string
```

### Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `scripts/short-video/lib/publora-client.mjs` | New file | Low | Pure addition |
| `scripts/short-video/publish-tiktok.mjs` | Delete inline client functions, import from client | Medium | Publish flow must produce same API calls |
| `scripts/short-video/fetch-tiktok-analytics.mjs` | Replace inline key resolution with `getApiKey()` | Low | Key resolution is identical |

### Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | `PUBLORA_API_KEY` env set | `getApiKey()` returns it | Low | Direct passthrough |
| 2 | No env var, MCP settings exist | Falls back to MCP config file | Medium | Two path candidates, same as current |
| 3 | No env var, no MCP settings | Exits with error message | Low | Same error |
| 4 | `publoraPost` returns non-OK | Throws with HTTP status + body | Low | Same error format |
| 5 | `uploadToS3` gets 200 | Upload succeeds | Low | Unchanged |
| 6 | `getPlatformId("tiktok-")` | Returns first TikTok connection ID | Low | Unchanged |

---

## Candidate 7: Extract CDP scraper

### Problem

`discover-trends.mjs` embeds generic CDP utilities alongside trend-specific orchestration.

### Solution

A `cdp-client.mjs` module with generic CDP helpers.

### Interface

```javascript
// scripts/short-video/lib/cdp-client.mjs
export async function cdpNewTab(url) → string (tabId)
export async function cdpEval(tabId, script) → object
export async function cdpCloseTab(tabId) → void
export async function waitForPageLoad(tabId, retries?) → boolean
export async function extractFromTab(tabId, extractScript) → array
export async function checkLogin(tabId, loginCheckScript) → string
```

### Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `scripts/short-video/lib/cdp-client.mjs` | New file | Low | Pure addition |
| `scripts/short-video/discover-trends.mjs` | Delete inline CDP functions, import from client | Medium | ~100 lines removed; behavior preserved |

### Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | CDP proxy available at :3456 | Tab created, page loaded, content extracted | Low | Same flow |
| 2 | CDP proxy not available | Script exits with error | Low | Same error |
| 3 | Tab fails to open | Returns empty array for that source | Low | Same graceful fallback |
| 4 | Page needs login | `checkLogin` returns "need_login", source skipped | Low | Same behavior |

---

## Candidate 8: Extract PostEditor from admin route

### Problem

`admin.tsx` is 740 lines containing route component, PostEditor, AttachmentUploader, and helpers.

### Solution

Extract `PostEditor` and `AttachmentUploader` into `src/components/`.

### Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `src/components/post-editor.tsx` | New file (extracted) | Low | Pure extraction |
| `src/components/attachment-uploader.tsx` | New file (extracted) | Low | Pure extraction |
| `src/routes/_authenticated/admin.tsx` | Import extracted components, delete inline defs | High | AGENTS.md high-risk — state init timing |

### Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Click "New post" | PostEditor renders with empty fields | High | State init — `useState` must default correctly |
| 2 | Click "Edit" on existing post | PostEditor renders with loaded data | High | `key={editingId}` + query data timing |
| 3 | Upload attachment | File uploaded, list refreshed | Medium | Same upload flow |
| 4 | Save post | Data persisted, queries invalidated | Low | `onSave` callback unchanged |

---

## Candidate 3: Move attachment upload behind server function

### Problem

`AttachmentUploader` calls `supabase.storage.upload()` + `supabase.from("post_attachments").insert()` client-side. Delete/rename/list are server fns. Seam is split.

### Solution

An `uploadAttachment` server function. All attachment ops cross one seam.

### Depends on

Candidate 8 (PostEditor extraction) — cleaner to add server fn after component is extracted.

### Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `src/lib/posts.functions.ts` | Add `uploadAttachment` server fn | Low | Pure addition |
| `src/components/attachment-uploader.tsx` | Replace client-side storage calls with server fn | Medium | Upload flow changes from client→storage to client→server fn |

### Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Upload valid file (<50MB) | File stored, metadata inserted, list refreshed | Low | Same outcome |
| 2 | Upload file >50MB | Error "File too large" | Low | Same validation |
| 3 | Upload succeeds but DB insert fails | Orphan file cleaned up | Medium | Cleanup logic moves server-side |
| 4 | Upload to non-existent postId | Error | Low | Server fn validates |

---

## Candidate 4: Consolidate Supabase client factory

### Problem

New-style API key handling duplicated in `publicClient()` (posts.functions.ts) and `createSupabaseFetch()` (auth-middleware.ts).

### Solution

One `createPublicClient()` in `src/integrations/supabase/client.ts`.

### Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `src/integrations/supabase/client.ts` | Add `createPublicClient()` | Low | Pure addition |
| `src/lib/posts.functions.ts` | Replace `publicClient()` with import | Medium | All public queries use this client |
| `src/integrations/supabase/auth-middleware.ts` | ADR-0005 says "auto-generated, do not edit" | High | ⚠ See below |

### ADR Conflict

ADR-0005 states `auth-middleware.ts` is auto-generated and immutable. This candidate should **only** extract the shared logic into `client.ts` and have `posts.functions.ts` use it. `auth-middleware.ts` stays untouched — its `createSupabaseFetch` remains as-is (it's generated code, duplication is expected).

### Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | `listPublishedPosts` called | Uses `createPublicClient()`, returns posts | Low | Same client behavior |
| 2 | New-style key (`sb_publishable_*`) | Bearer header removed, apikey set | Low | Same logic, new location |
| 3 | Old-style key (JWT) | Bearer header kept, apikey also set | Low | Same logic |

---

## Progress Checklist

- [x] S1: Candidate 1 — `requireAdmin` middleware ✅ (commit `2eda390`, 2026-08-05 — also fixed missing admin check on `getPostAdmin`)
- [x] S1: Candidate 2 — `useIsAdmin` hook ✅ (commit `2eda390`, 2026-08-05 — unified auth state subscription + RPC method)
- [x] S2: Candidate 5 — TTS engine strategy ✅ (commit `cef738d`, 2026-08-05 — 470-line monolith → 8 adapter modules + registry + 25 tests)
- [x] S3: Candidate 6 — Publora API client ✅ (2026-08-05 — extracted getApiKey/publoraPost/publoraPut/uploadToS3/getPlatformId; 16 tests)
- [x] S3: Candidate 7 — CDP scraper ✅ (2026-08-05 — extracted cdpNewTab/cdpEval/cdpCloseTab/waitForPageLoad/extractFromTab/checkLogin; 21 tests)
- [x] S4: Candidate 8 — PostEditor extraction ✅ (commit `7ebc78f`, 2026-08-05 — extracted PostEditor + AttachmentUploader into src/components/; admin.tsx 740→264 lines; 14 tests)
- [x] S4: Candidate 3 — Attachment upload server fn ✅ (commit `7ebc78f`, 2026-08-05 — uploadAttachment server fn with base64 decode; orphan cleanup server-side; 13 Zod validation tests)
- [x] S4: Candidate 4 — Supabase client factory ✅ (commit `7ebc78f`, 2026-08-05 — createPublicClient() in client.ts; replaced publicClient() in posts.functions.ts + sitemap.xml.ts; 3 tests)
