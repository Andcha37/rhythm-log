# Pre-production test plan

## Auth and uniqueness
1. Create Clerk application with username/password only, no required email or phone.
2. Enter a new username (e.g., `testalpha_21`), click **아이디 중복 확인**. Preflight should be available if Cloudflare Worker configured.
3. Create the account; check that Clerk `user.username` is the given identifier.
4. Sign out and try the same username again: check button should say used; Clerk signup MUST also reject it, independently of prior check.
5. Change case (e.g., `TestAlpha_21`): collision must still be rejected.
6. Check invalid username, password <8 chars and mismatched password confirmation.
7. Sign in with username/password, refresh, ensure session persists, sign out and ensure workspace is hidden.

## Supabase RLS (must be verified with two real Clerk users)
1. Sign in as A, create a meal with one food and a sleep session.
2. Sign in as B and verify A's records are absent from B's dashboard.
3. Using B's JWT, attempt to `SELECT` A's meal by ID: 0 rows.
4. Using B's JWT, attempt `UPDATE` and `DELETE` A's meal/sleep row: 0 rows affected.
5. Using B's JWT, attempt `INSERT` with A's `user_id`: RLS error.
6. Using B's JWT, attempt to INSERT `meal_items` whose `meal_id` belongs to A: RLS/composite FK denial.
7. Anonymous direct REST calls with publishable key: no access.
8. Via A, confirm create_meal inserts parent+items atomically; deliberately invalid item rolls back parent.
9. After logout, ensure old async responses do not repopulate workspace.

## Natural language & WebLLM
1. Manual meal/sleep insert works before trying WebLLM.
2. Chrome/Edge WebGPU model selection reports supported/unsupported Qwen2.5-7B accurately.
3. “어제 저녁 7시 닭가슴살 200g” -> expected values, calories NULL, user approval step.
4. “어젯밤 23시~오늘 7시” -> 480 min, saved in UTC, displayed local.
5. Malformed JSON / injected instructions -> no execution or automatic write.
6. 14-day charts distinguish unrecorded days from 0 and incomplete food values.

## Deployment checks
1. npm test and npm run build succeed; GitHub Pages deployment status `success`.
2. Final domain is a Clerk allowed origin and Cloudflare Worker `ALLOWED_ORIGINS` includes exact site origin.
3. Check request confirms 200 with no server token in response; check throttle/rate rules.
4. Verify CSP allows Clerk and Supabase APIs but no arbitrary script hosts.
5. Install PWA on desktop, sign in, close and reopen, verify cloud sync.
6. Confirm Operator can only access records using privileged infrastructure, not via normal user app.
7. Set a public privacy notice, data deletion flow and incident response before inviting actual users.
