# Lovable file structure constraints: immutable areas

## Context

The project is deployed via **Lovable Cloud**, which syncs the GitHub repo and builds the TanStack Start app. Certain file paths, naming conventions, and directory structures are not merely organizational preferences — they are **hard deployment dependencies**. Restructuring them breaks Lovable's build, routing, or auth gating.

This ADR exists so that architecture review tools (e.g. `improve-codebase-architecture` skill) automatically read these constraints and do not propose refactors that would break deployment.

## Decision

The following areas are **immutable** — do not move, rename, or restructure without explicit deployment verification:

### 1. Route files — `src/routes/`

TanStack Start uses **file-based routing**. The file tree under `src/routes/` _is_ the route tree.

- `src/routes/__root.tsx` — root layout, must render `<Outlet />`
- `src/routes/_authenticated/` — auth-gated layout route; `route.tsx` inside it handles `requireSupabaseAuth`
- `src/routes/_authenticated/admin.tsx` — admin page with `isAdmin` check
- `src/routes/api/public/*` — public API routes that bypass auth

Do **not**:

- Introduce `react-router-dom`, `BrowserRouter`, or Next.js/Remix routing
- Hand-edit the generated `src/routeTree.gen.ts`
- Move route files to a different directory
- Change the `_authenticated` path layout naming (TanStack uses `_` prefix for pathless layout routes)

### 2. Server functions — `src/lib/*.functions.ts`

Server functions created via `createServerFn` must live in `src/lib/*.functions.ts` (or `src/lib/**/*.functions.ts`). The `.functions.ts` suffix is the convention the build system and Lovable recognize.

- Client-importable server functions go in `src/lib/*.functions.ts`
- Server-only modules (`.server.ts`, `*.server.ts`) must **never** be imported into client code
- `src/server/` modules are server-only — do not re-export to client

### 3. Supabase client — `src/integrations/supabase/`

- `src/integrations/supabase/client.ts` — browser-side Supabase client
- `src/integrations/supabase/client.server.ts` — server-side admin client (dynamic import only, after auth check)

Do not merge or relocate these; the import path `@/integrations/supabase/client` is referenced across the codebase.

### 4. Email templates — `src/lib/email-templates/`

Lovable's email infrastructure expects templates here. The From address must be `China AI News <noreply@chinaai.news>`. Moving templates would break Lovable's email event routing (`src/routes/lovable/email/events.ts`).

### 5. Migrations — `supabase/migrations/`

Migration files are immutable history. New schema changes must add new migration files, never edit existing ones.

### 6. Widget registry — `src/components/widgets/registry.ts`

The registry's import path and lazy-load pattern are referenced by both the article renderer and the admin editor. Changing its location breaks the widget marker system.

## Consequences

- Architecture review skills **must** treat these paths as constraints, not refactoring candidates.
- If a deepening opportunity touches any of these areas, it must be marked as **ADR-conflicting** and include a deployment verification plan.
- New immutable areas should be added to this ADR (or a successor) as the project evolves.
- This ADR does **not** prevent internal refactoring within these modules (e.g. extracting helper functions inside a route file) — it prevents relocating or renaming the module itself.
