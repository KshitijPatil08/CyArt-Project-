Production Deployment Guide

1) Prepare secrets (store in your host's secret manager)
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- JWT_SECRET
- AGENT_SECRET_KEY
- APP_URL (https://your-production-domain.com)
- UPSTASH_REDIS_REST_URL (optional)
- UPSTASH_REDIS_REST_TOKEN (optional)
- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (only if required)

2) Local verification
- Copy `.env.local.example` to `.env.local` and fill values (do not commit).
- Run the verification script:
  PowerShell:
  ```powershell
  .\scripts\verify-envs.ps1
  ```
  Bash:
  ```bash
  ./scripts/verify-envs.sh
  ```
- Start local dev server:
  ```bash
  npm run dev
  ```

3) Push to repository
```bash
git add .
git commit -m "chore: security hardening, env & deploy helpers"
git push origin main
```

4) Vercel deployment (recommended quick flow)
- In Vercel dashboard: Create new project -> Import from Git -> select repo.
- In Project Settings -> Environment Variables, add the server secrets listed above.
- Deploy; wait for build to finish.

Vercel CLI (optional):
```bash
npm i -g vercel
vercel login
vercel --prod
# ensure env vars are set in the dashboard or using `vercel env add``
```

5) Smoke tests (after deploy)
- Verify home page loads: `curl -I https://your-production-domain.com`
- Verify API with Origin header:
  ```bash
  curl -i -H "Origin: https://your-production-domain.com" https://your-production-domain.com/api/devices/list
  ```
- Manual checks: login, device registration, device auth, device list for user/admin, software approval, quarantine/release flows. Confirm `password: "REDACTED"` from credentials endpoint.

6) Post-deploy: rotate and revoke old keys
- Follow `docs/ROTATION-CHECKLIST.md` to rotate and revoke old keys once verified.

7) Monitoring & rollback
- Add Sentry/Datadog/CloudWatch integration for alerts.
- If issues, rollback via Vercel UI or CI pipeline.

Notes
- Never commit `.env.local` to git.
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is only in production secrets and not accessible from client code.
- For multi-instance deployments, enable Upstash Redis and set `UPSTASH_REDIS_REST_URL`/`TOKEN` for distributed rate limiting.
