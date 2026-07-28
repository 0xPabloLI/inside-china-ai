# Supabase refresh token for programmatic DB writes

The Supabase project is managed by Lovable, so the project owner has no direct Supabase dashboard access and no service role key. To allow the Coding Agent to update article content programmatically without requiring browser interaction each time, we store the user's Supabase refresh token in `.env.local` (gitignored via `*.local` in `.gitignore`).

A helper script (`scripts/update-post.mjs`) uses the refresh token to obtain a fresh access token on demand, calls the Supabase REST API to read or update post content, and writes the new refresh token back to `.env.local` after each run.

## Why not alternatives

- **Service role key**: not available because Supabase is under Lovable's account.
- **Email/password auth**: the user authenticates via Google OAuth, no password is set.
- **Browser token extraction each time**: too cumbersome for frequent updates.

## Consequences

- The refresh token must be used at least once every 30 days to stay valid (Supabase default).
- If the token expires, the user must re-extract from browser DevTools (Local Storage → `sb-*-auth-token`).
- `.env.local` must never be committed to git (protected by `*.local` in `.gitignore`).
- The script bypasses the admin UI but still operates within RLS (the user is admin).
