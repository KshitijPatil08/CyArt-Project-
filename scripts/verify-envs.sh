#!/usr/bin/env bash
set -euo pipefail

REQUIRED=(SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY JWT_SECRET AGENT_SECRET_KEY APP_URL)
MISSING=()

for v in "${REQUIRED[@]}"; do
  if [ -z "${!v-}" ]; then
    MISSING+=("$v")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "Missing required environment variables: ${MISSING[*]}"
  echo "Set them in your environment or CI secrets and re-run."
  exit 2
fi

echo "All required env vars present."

# Basic smoke checks
echo "Running basic smoke checks against $APP_URL (GET /)"
HTTP_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' "${APP_URL%/}/") || true
if [ "$HTTP_STATUS" = "000" ]; then
  echo "Warning: could not connect to ${APP_URL}. Ensure the app is running and accessible." 
else
  echo "HTTP $HTTP_STATUS returned from ${APP_URL}/"
fi

echo "Smoke checks completed. For protected endpoints run explicit authenticated tests." 
