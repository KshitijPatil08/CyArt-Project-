#!/usr/bin/env bash
# Template helper for rotating secrets. This script does not call Supabase APIs.
# Use it to prepare values and update your hosting provider's secret store.

set -euo pipefail

echo "ROTATE SECRETS HELPER"

echo "1) Generate new secrets locally (example, keep these off disk):"
echo "   SUPABASE_ANON_KEY=$(openssl rand -base64 32 | tr -d '\n')"
echo "   SUPABASE_SERVICE_ROLE_KEY=$(openssl rand -base64 48 | tr -d '\n')"
echo "   JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "   AGENT_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n')"

echo "\n2) Add these values to your hosting provider's secret store (Vercel/AWS/Azure/GCP)."

echo "Example (Vercel):"
echo "  vercel env add SUPABASE_ANON_KEY production"
echo "  vercel env add SUPABASE_SERVICE_ROLE_KEY production"
echo "  vercel env add JWT_SECRET production"

echo "3) Deploy your application so new env values are used."
echo "4) Verify functionality."
echo "5) Revoke old keys in Supabase dashboard once verified."

echo "IMPORTANT: This script is a helper and does not interact with Supabase. Always rotate keys via Supabase dashboard and your secret manager."
