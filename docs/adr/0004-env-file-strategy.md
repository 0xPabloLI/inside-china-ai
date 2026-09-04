# Env file strategy: `.env` tracked, `.env.local` gitignored

## Context

The `.env` file is committed to git and pushed to GitHub. This was done by Lovable's bot (`gpt-engineer-app[bot]`) during project initialization (commit `55de7f5`). The `.gitignore` has no `.env` rule — only `*.local`.

## Decision

This is **intentional and correct** for the Lovable + Supabase stack. The project uses a two-layer env separation:

| File         | Contents                                  | In Git                | Why                                                                                                                                                          |
| ------------ | ----------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.env`       | Supabase publishable key, project ID, URL | ✅ Yes                | These are **public by design** — publishable keys are embedded in the frontend bundle and visible to every site visitor. No security benefit in hiding them. |
| `.env.local` | Admin email/password, refresh tokens      | ❌ No (via `*.local`) | Real secrets. Used by server-side scripts (e.g. `publish-article.mjs`). Must never be committed.                                                             |

## Why this is safe

- Supabase's security model relies on **Row Level Security (RLS)**, not key secrecy. Even with the publishable key, an attacker can only perform RLS-allowed operations.
- `VITE_` prefixed variables are designed by Vite to be exposed to the browser.
- Sensitive operations use admin credentials stored exclusively in `.env.local`.

## Consequences

- Do **not** add `.env` to `.gitignore` — it would break Lovable's sync (Lovable reads `.env` from the repo to configure the project).
- Do **not** put any secret/service-role keys in `.env`. Use `.env.local` for anything sensitive.
- `.env.local` is protected by the `*.local` rule in `.gitignore` — keep it that way.
