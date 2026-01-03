# Environment Variables Documentation

## Required Environment Variables

This document lists all required environment variables for the CyArt Security Suite to function properly.

### Supabase Configuration

```bash
# Supabase URL (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co

# Supabase Anonymous Key (Required)
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Supabase Service Role Key (Required for admin operations)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### Application Configuration

```bash
# Application URL (Required for CORS)
NEXT_PUBLIC_APP_URL=https://your-domain.com

# API URL (Optional - defaults to same domain)
NEXT_PUBLIC_API_URL=https://your-domain.com

# Allowed CORS Origins (Optional - comma-separated list)
# If not set, defaults to NEXT_PUBLIC_APP_URL and localhost in development
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com,https://admin.your-domain.com
```

### Security Configuration

```bash
# JWT Secret for device authentication (Required)
JWT_SECRET=your-secure-random-string-here
```

### Go Agent Configuration

The Windows agent requires one of the following:

**Option 1: Environment Variable**
```bash
CYART_API_URL=https://your-domain.com
```

**Option 2: Configuration File**

Create `agent.config` in the agent directory (`C:\ProgramData\CyArtAgent\`):
```json
{
  "server_url": "https://your-domain.com"
}
```

> **IMPORTANT**: The Go agent will **NOT** start without proper configuration. There is no hardcoded fallback URL for security reasons.

## Development vs Production

### Development (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-dev-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-dev-service-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
JWT_SECRET=dev-secret-change-in-production
```

### Production (.env.production)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-prod-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-prod-service-key
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
ALLOWED_ORIGINS=https://your-production-domain.com,https://www.your-production-domain.com
JWT_SECRET=your-secure-production-secret

## Supabase (Server-side)

# Server-only (do NOT expose these to the browser)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

## Upstash Redis (Rate Limiting - optional)
UPSTASH_REDIS_REST_URL=https://<rest-url>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<your-upstash-token>
RATE_LIMIT_MAX_REQUESTS=500

## Agent secret (used by agents to authenticate)
AGENT_SECRET_KEY=replace-with-secure-random-string

Notes:
- Migrate from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `SUPABASE_URL` and `SUPABASE_ANON_KEY` for server-side usage.
- Do NOT commit secrets to source control. Use your hosting provider's secret store.

## Secret Rotation (Recommended)

Rotation policy (recommended): rotate Supabase keys and server secrets quarterly or immediately after any suspected compromise.

Steps to rotate Supabase keys safely:
1. In the Supabase dashboard, generate a new `anon` key and a new `service_role` key.
2. Add them to your hosting provider's secret store as `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` and set `SUPABASE_URL` if it changed.
3. Deploy the application (use a maintenance window if needed) so servers pick up the new keys.
4. Verify critical functionality (login, device registration, admin flows).
5. After verification, revoke the old keys in the Supabase dashboard.

Rotate other server secrets:
- `JWT_SECRET`: create a new cryptographically-random secret, deploy, and perform a controlled session invalidation if needed.
- `AGENT_SECRET_KEY`: rotate and update bundled agents or provide a migration path (agents should support fetching a new key from a secure management system).

Notes:
- Do not publish or store keys in source control. Use environment variables or secret managers (Vercel, AWS Secrets Manager, Azure Key Vault, or similar).
- Consider an ephemeral secret delivery mechanism (vault) for one-time device credentials instead of returning passwords through APIs.
```

## Vercel Deployment

When deploying to Vercel, add these environment variables in the Vercel dashboard:

1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add each variable listed above
4. Select the appropriate environment (Production, Preview, Development)

## Security Best Practices

1. **Never commit `.env` files to version control**
   - Add `.env*` to `.gitignore`
   - Use `.env.example` as a template

2. **Use strong, unique values for:**
   - `JWT_SECRET` (minimum 32 characters)
   - `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

3. **Rotate secrets regularly:**
   - Change `JWT_SECRET` periodically
   - Regenerate Supabase keys if compromised

4. **Limit CORS origins:**
   - Only add trusted domains to `ALLOWED_ORIGINS`
   - Never use `*` in production

## Troubleshooting

### "API URL not configured" error in Go agent
- Ensure `CYART_API_URL` environment variable is set, OR
- Create `agent.config` file with `server_url` property

### CORS errors in browser
- Verify `ALLOWED_ORIGINS` includes your frontend domain
- Check that `NEXT_PUBLIC_APP_URL` is set correctly

### "Missing Supabase environment variables" error
- Verify all `NEXT_PUBLIC_SUPABASE_*` variables are set
- Restart the development server after adding variables
