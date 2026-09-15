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

## Subject requests (GDPR / CCPA)

The product's data-minimization posture keeps the request surface small: the
only personal data is the subscriber list and auth accounts, so every request
type maps onto an existing, admin-operated path:

| Request type                    | Path                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Deletion (GDPR erasure / CCPA)  | Admin deletes the subscriber row (RLS policy) or the account (Supabase Auth); email-event sync keeps `subscribers` consistent |
| Access / export (GDPR Art. 15)  | Admin reads the subscriber's own row via the admin UI — the row contains only the fields in the inventory above |
| Opt-out (GDPR objection / sale) | Unsubscribe link in every email → bounce/complaint event sync removes the row                     |

No manual database surgery is authorized for requests — the paths above are
auditable and RLS-respecting (rule 3 and rule 5).

## Tracking and consent

The product ships no third-party tracking or advertising SDK — no cookies for
ad measurement, no cross-site identifiers — so there is no tracking-consent
surface to manage. If a product analytics SDK is ever introduced, it must be
evaluated through the proposal review (`docs/agents/proposal-review.md`) and
this section updated with the consent mechanism before it ships.
