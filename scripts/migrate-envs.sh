#!/usr/bin/env bash
# Simple migration helper to map NEXT_PUBLIC_* vars to server-side names.
# Run locally to prepare your new environment variable set for deployment.

set -e

export SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-}
export SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}

echo "New SUPABASE_URL="$SUPABASE_URL
echo "New SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY

echo "Please copy these values into your production secret store as SUPABASE_URL and SUPABASE_ANON_KEY."

echo "Important: rotate keys after deploying and then remove any fallback code that reads NEXT_PUBLIC_* from server files."