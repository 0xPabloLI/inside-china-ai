# Supabase admin auth for programmatic DB writes

The Supabase project is managed by Lovable, so the project owner has no direct Supabase dashboard access and no service role key. To allow the Coding Agent to update article content programmatically, we store admin credentials (email + password) in `.env.local` (gitignored via `*.local` in `.gitignore`).

A helper script (`scripts/update-post.mjs`) authenticates via Supabase Auth password grant on each run, obtains a fresh access token, and calls the Supabase REST API to read or update post content. No persistent tokens are stored — each run authenticates independently.

## Why not alternatives

- **Service role key**: not available because Supabase is under Lovable's account.
- **Google OAuth / Magic Link**: no password to authenticate programmatically; refresh tokens are single-use and fragile.
- **Browser token extraction**: too cumbersome for frequent updates.

## Consequences

- `.env.local` must never be committed to git (protected by `*.local` in `.gitignore`).
- The admin account is a dedicated email/password account, separate from the owner's Google OAuth account.
- The script operates within RLS (the admin account has admin role via `has_role` RPC).
