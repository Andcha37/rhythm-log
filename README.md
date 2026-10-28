# Rhythm Log v0.3 — username sign-in · meal & sleep journal · browser AI

**Deploy-ready source**, not a currently hosted service. This revision changes the original email-based mock-up to **real username/password authentication** using Clerk (no synthetic email aliases), with Supabase PostgreSQL Row Level Security. The separate username availability button uses a Cloudflare Worker; Clerk performs authoritative uniqueness enforcement on registration even if the preflight service isn't configured.

## Included

- Beautiful dark-responsive static web app (Vite) with installable PWA shell.
- **Username-only signup / login**: 4–24 characters, starting with a Latin letter; `a-z`, digits and underscore; case-insensitive UI normalisation. Signup password confirmation.
- **No extra provider needed**: By default the button checks username format locally; Clerk's signup backend authoritatively rejects duplicate usernames. A separate availability pre-check API is **optional**, not needed for safe signup.
- Meal & sleep AI JSON extraction using WebLLM in the user's WebGPU-capable browser; preferred Qwen2.5-7B with honest compatibility checks. Manual entry remains available.
- Editable review before saving; generic foods may receive **clearly labeled unverified estimates** from an embedded reference table (not a validated product database); unmatched foods remain SQL NULL.
- PostgreSQL tables with authenticated row ownership (Clerk `sub` JWT claim), all-four CRUD RLS policies and a composite foreign key enforcing meal-item ownership; transactional meal insert RPC.
- Dashboard, 14-day trend chart, meal and sleep logs, report download, JSON export, PWA installation.

## Prerequisites and pricing

- **Clerk**: a new application; username + password sign-up and sign-in, **email not required**, with other identifiers disabled. Check the current Hobby plan limits and your expected traffic; free tiers are not unlimited.
- **Supabase**: a new project (use a *new* project, SQL v0.2 uses Clerk text IDs and is **not** backwards compatible with the email+UUID schema). Check the current free quotas.
- **Cloudflare Workers (optional for preflight)**: the check button needs a free Worker and a server-side Clerk Secret. Without this Worker, uniqueness is **still** validated by Clerk during actual signup, but the check button explicitly shows that preflight is unavailable.
- **GitHub Pages**: host the Vite build under HTTPS (a new repository, separate from Career Signal); no central GPU or paid LLM API is needed.

## Setup — verified configuration sequence

1. **Clerk**: Create a new app at https://dashboard.clerk.com . In **User & authentication**, configure **Username** as the sign-up and sign-in identifier and **Password**; turn off required email / phone identifiers and unrelated OAuth providers. For no-email recovery, users should be informed that account recovery may not be available unless another recovery method is added. Copy only its `pk_...` Publishable Key. For the free usage entitlement, check the current Clerk pricing.
2. **Supabase**: Create a new project. Enable the **Clerk third-party auth provider** under **Authentication → Sign In / Providers → Add provider → Clerk**. Activate Supabase integration in Clerk and use the Clerk domain provided by Clerk. This integration is mandatory for Supabase to trust Clerk JWTs with `role: authenticated`.
3. In **Supabase SQL Editor**, run `supabase/migrations/001_initial.sql` on a *new empty project*. For any later migration use a new version. Never use the original v0.1 email+UUID schema here.
4. Set `app/config.js`: `CLERK_PUBLISHABLE_KEY`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`. **Only publishable keys** belong in client code. Never paste `CLERK_SECRET_KEY`, `service_role`, database credentials or any password into JavaScript/commits.
5. **No Cloudflare setup is required.** The username format check runs locally, while Clerk rejects duplicates during signup. If you explicitly require an availability check *before* signup, you can optionally deploy the included Worker or a Supabase Edge Function, using a server-side Clerk secret; that is extra complexity and must be rate-limited.
6. In the project root run:
   ```sh
   npm install
   npm test
   npm run dev
   ```
   Open `http://localhost:5173`. Test **two separate Clerk accounts**. Test that one user cannot SELECT, INSERT, UPDATE or DELETE another user's meals, meal items, or sleep sessions (see `docs/TEST_PLAN.md`).
7. Create a **new** GitHub repository for Rhythm Log. Push its files to the `main` branch, enable **Settings → Pages → GitHub Actions**. Included `.github/workflows/pages.yml` runs tests, builds Vite with `base:'./'` and deploys `dist` on every push. Once published, configure the final origin in `wrangler.username.toml` and update Worker; HTTPS allows PWA installation.

## Security & privacy

- All user data is stored by Supabase; **WebLLM inference happens locally**. This is not an end-to-end encrypted storage app. Supabase project owners and privileged admins may bypass RLS at the infrastructure level. App users never get an admin-by-role override.
- Database `user_id` is a Clerk **text string**, not a UUID; all SQL policies use `auth.jwt()->>'sub'`. `service_role` and Clerk secret are never embedded in the site.
- A browser-side log-in wall is only UI. PostgreSQL RLS is the **authorization boundary**. You must set up Clerk's third-party token integration correctly for RLS to work.
- Username preflight can reveal whether an account exists (user enumeration). Use conservative rate limiting and privacy notices. It is not proof that the name will still be free at the moment of registration.
- User-initiated data deletion is available after applying `002_user_data_purge.sql`. Full account removal has not been implemented yet. Configure a secure deletion workflow and privacy notice **before public rollout**, including deleting the user’s app records when a Clerk account is deleted (Clerk user IDs are external, so `ON DELETE CASCADE` from `auth.users` does not apply).
- Generic-food calories/macros are explicitly labeled unverified in `source_note`; never present them as measured intake, product labels or health recommendations. Actual deployed WebLLM/7B GPU performance is device-dependent and not verified in this environment.

## Validation status

Local JavaScript parser/security/unit tests pass. **Production integrations (real Clerk signup, Supabase authenticated RLS, Cloudflare worker, Qwen7B WebGPU and GitHub Pages) have NOT been verified without your project credentials and an actual deployed environment.** Do not claim the app is publicly ready until the full test plan passes.

## Official references

- https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options
- https://clerk.com/docs/guides/development/integrations/databases/supabase
- https://clerk.com/docs/reference/backend/user/get-user-list
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://webllm.mlc.ai/docs/user/get_started.html


## 한국어 웹 배포 가이드

See [`DEPLOY_KO.md`](DEPLOY_KO.md), including Windows PowerShell deployment and two-account RLS validation. The v0.3 rollout includes an optional self-service **delete all records** operation. Run both SQL migrations in order.

## Planned independent domain

Target `https://rhythm-log.io` requires separate domain ownership, DNS and GitHub Pages verification. See [`docs/CUSTOM_DOMAIN.md`](docs/CUSTOM_DOMAIN.md). Until then, the default Pages URL will be `https://andcha37.github.io/rhythm-log/`.

## AI 모델 기본값 (2026-10-29)

- 기본: `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (WebLLM WebGPU; 초기 다운로드 필요)
- 고성능: `Qwen2.5-3B-Instruct-q4f16_1-MLC`
- 기존 7B 및 다른 대안 모델은 선택 UI와 모델 매핑에서 제거했습니다. 이전에 다운로드한 7B 모델 캐시는 브라우저에 남을 수 있으며, 새 버전에서는 불러오지 않습니다.
- 모델 선택은 정확한 WebLLM 런타임 모델 ID를 기준으로 합니다. 대역폭/메모리와 실제 추출 정확도는 장치별로 검증해야 합니다.

## Korean meal segmentation

The deterministic food parser supports multiple foods even without explicit connectors (for example `밥 1공기 닭가슴살 200g`), as well as `과/와`, `하고`, `랑`, commas, plus signs, and Korean counters. Each food renders as an independent editable card; missing quantities stay unknown rather than being inferred. The user may remove an individual food before saving. Non-food/unrecognized phrases fall back to the model rather than being silently inserted.
