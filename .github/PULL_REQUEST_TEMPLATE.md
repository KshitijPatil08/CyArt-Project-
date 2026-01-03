## PR: Security Audit & Hardening — pr/security-FULL-audit1

Summary
- Performed a repo-wide security audit and applied prioritized hardening fixes across server and API routes, middleware, scripts, and dependency configuration. This PR contains only non-breaking, safety-first changes intended to make the project production-ready and easier to review/operate.

What I changed (high level)
- Centralized and fixed CORS handling across API routes using `getCorsHeaders(request)`; removed undefined `corsHeaders` usages and fixed origin validation.
- Prevented server-side fallbacks to `NEXT_PUBLIC_*` secrets; validated server-only env vars in `lib/supabase/*` and `lib/supabase/admin.ts`.
- Redacted sensitive outputs in deployment scripts and added validation for migration/verification helper scripts.
- Replaced sensitive direct comparisons with timing-safe comparisons for `AGENT_SECRET_KEY` verification.
- Added runtime checks and clear errors for missing server envs.
- Added `xss` dependency and sanitizer utility to protect against XSS when rendering user-sourced content.
- Moved `@upstash/redis` to `optionalDependencies` and updated rate-limiter to return early on successful Redis checks.
- Fixed duplicate/typo issues in `package.json` and other minor cleanups.

Files touched (representative)
- lib/api-utils.ts — timing-safe agent comparison, CORS helper usage
- lib/supabase/admin.ts, lib/supabase/server.ts — server env validation
- app/api/**/route.ts — many API routes: replaced undefined `corsHeaders`, standardized `headers`
- middleware.ts — rate limiter early-return and in-memory fallback improvements
- scripts/*.ps1, scripts/*.sh — env migration/rotation/verify script hardening and secret masking
- package.json — dependency cleanup, add `xss`, move upstash to optionalDependencies

Build & tests
- `npm run build` completes successfully in CI/local run. There are runtime warnings about some dependencies using Node APIs in the Edge runtime (supabase realtime, upstash). These are warnings only and do not block build.

Security notes & recommendations (operator)
- P0: Add the following server secrets to your hosting provider's secret store immediately and do not commit them to source control: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `AGENT_SECRET_KEY`, `APP_URL`. See `DEPLOYMENT.md` and `.env.local.example`.
- P0: Rotate Supabase keys and `JWT_SECRET` after deployment (see docs/ROTATION-CHECKLIST.md).
- P1: Address Edge-runtime warnings by moving server-only imports to Node runtime routes or adjusting route `runtime` metadata where appropriate.

Instructions for reviewer
1. Run `npm ci` then `npm run build` locally to validate.
2. Focus review on server/client boundary changes in `lib/supabase/*`, `lib/api-utils.ts`, and API route updates in `app/api/**`.
3. Verify scripts in `scripts/` for safe operational use (they now mask secrets and validate inputs).

Next steps (optional)
- Convert any Edge-routed API handlers that import Node-only libs to Node runtime or lazy-import server-only modules.
- Final verification after operator adds secrets and rotates keys: run `scripts/verify-envs.ps1` or `scripts/verify-envs.sh` in CI/staging.

Notes
- This PR intentionally avoids application feature changes; it focuses on security, configuration, and operational readiness. If you prefer smaller, incremental PRs split by area (scripts, CORS, supabase), tell me and I can split this branch into smaller PRs.

Link to create PR in browser:
https://github.com/KshitijPatil08/CyArt-Project-/pull/new/pr/security-FULL-audit1
