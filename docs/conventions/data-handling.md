# Data Handling — PII inventory and rules

> What personal data this product holds, where it lives, and the rules any
> agent or contributor must follow when touching it. Schema truth lives in
> `supabase/migrations/`; this document tracks the inventory and the handling
> rules, not the schema.

## PII inventory

| Data                                   | Where                                                        | Access path                                                              |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Subscriber emails                      | `public.subscribers` (email, created_at, last_sent_at)       | RLS on; anon INSERT-only, SELECT/DELETE admin-only (see migration 20260726) |
| Account identity (auth)                | `auth.users` (Supabase-managed) + `public.profiles`          | Supabase Auth; app reads via `isAdmin`-gated checks, `public.user_roles`  |
| Email delivery events                  | Unsubscribe / bounce / complaint → `public.subscribers` sync | `src/routes/lovable/email/events.ts`                                     |
| Outbound email                         | `notify.chinaai.news` domain, From `noreply@chinaai.news`    | Lovable Cloud → Emails; templates in `src/lib/email-templates/`          |

Not PII: TikTok analytics CSVs and `pending-analysis.json` hold content
metrics (views, likes), not subscriber identities. They are gitignored and
never leave the machine.

## Rules for agents and code

1. **Never copy real PII into code.** Subscriber emails and account data stay
   in the database. Tests, fixtures, seeds, and examples use
   `user@example.com`-style throwaways only.
2. **Never log PII.** Emails and account identifiers are not logged, even at
   debug level. Log counts or IDs, not addresses.
3. **Respect the RLS boundary.** The admin-only SELECT/DELETE policies on
   `subscribers` and the `isAdmin` + authenticated-layout checks are
   coordinated security boundaries (AGENTS.md hard gates) — a new feature
   never widens them; a new query reads through RLS, not around it.
4. **Data leaves the database only through the product.** No ad-hoc exports of
   `subscribers` to files, tickets, PRs, or chat — including "just to debug".
5. **Deletion path exists.** Admins can delete a subscriber row (RLS policy);
   unsubscribes flow through the email-event sync. A deletion request is
   satisfied by those paths — no manual database surgery.

## Retention

Subscriber rows live until unsubscribed (event sync) or admin-deleted.
Account rows are Supabase Auth's lifecycle. No other copies are authorized to
exist — which is exactly why rule 1 and rule 4 matter.
