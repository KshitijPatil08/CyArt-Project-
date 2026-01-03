Upstash Redis (Rate Limiting)

This project can use Upstash Redis to provide a distributed rate limiter used by middleware.

Required environment variables (set in your hosting provider):

- UPSTASH_REDIS_REST_URL: REST endpoint URL from Upstash.
- UPSTASH_REDIS_REST_TOKEN: REST token for auth.
- RATE_LIMIT_MAX_REQUESTS: max requests per window (default 500).

Quick setup:

1. Create an Upstash Redis instance at https://upstash.com.
2. In the Upstash console, copy the REST URL and Token.
3. Add them to your production environment variables.
4. Deploy the app. The middleware will automatically use Upstash if these variables are present.

Notes:
- If Upstash env vars are missing, middleware falls back to an in-memory limiter (not recommended for multi-instance deployment).
- Keep tokens secret and rotate regularly.
