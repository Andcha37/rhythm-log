# Rhythm Log privacy and access boundary (v0.2)

## Identity
- A Clerk username/password account provides a stable `user_...` subject claim; *not* an email alias.
- Supabase must register Clerk as a trusted **third-party Auth provider** so Clerk's session includes role `authenticated`.
- SQL uses `user_id text` and `auth.jwt()->>'sub'`. JWTs must be validated by Supabase. Frontend-supplied owner IDs can never replace this check.

## Database
- `meals`, `meal_items`, `sleep_sessions` have RLS enabled with owner equality on SELECT/INSERT/UPDATE/DELETE.
- `meal_items(meal_id,user_id)` must refer to a meal belonging to the same `user_id`, blocking cross-user linking.
- `create_meal` uses SECURITY INVOKER, and creates the entire meal and all its items transactionally, with the authenticated subject as the owner.
- `anon` has no access. No client-side service_role / secret. Operator database administrators can still bypass RLS; do not claim data is inaccessible to the operator.
- App code may filter by owner for convenience, but RLS—not that filter—is the security boundary.

## Username availability API
- Public endpoint (Cloudflare Worker) queries Clerk Backend API using the Worker Secret `CLERK_SECRET_KEY` (never visible to client).
- Returns only `{available:boolean}`; no user list. Exact allowed origins and rate-limiting required.
- Existence checks are a user-enumeration surface; final registration uniqueness is enforced independently by Clerk.
- Avoid an open username endpoint that exposes your Clerk credential or user profile data.

## Privacy and rollout
- Stored records include potentially sensitive meal and sleep details. Publish a privacy notice and data retention/deletion process before real users use it.
- If users delete their Clerk account, use an authenticated deletion flow/webhook to delete matching Supabase rows; there is no automatic `auth.users` foreign-key cascade with Clerk IDs.
- No clinical diagnosis or calorie prescription. Unknown nutrient fields remain NULL.
- The PWA only caches same-origin static UI/assets; no Cloud Supabase or Clerk API responses.
- User must verify that two different accounts cannot view/edit/delete one another's rows. Consider monitoring, abuse protection, backups, deletion and incident response.
