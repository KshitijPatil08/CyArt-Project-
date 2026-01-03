#!/usr/bin/env bash
# Simple migration helper to map NEXT_PUBLIC_* vars to server-side names.
# Run locally to prepare your new environment variable set for deployment.

set -e

if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
	echo "Error: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in your environment" >&2
	echo "Load them from your .env.local file first: export \$(grep -v '^#' .env.local | xargs)" >&2
	exit 1
fi

export SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
export SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

# Do NOT print full secrets. Show masked previews.
mask() {
	s="$1"
	if [ -z "$s" ]; then
		echo "(empty)"
		return
	fi
	if [ ${#s} -le 8 ]; then
		echo "$s"
		return
	fi
	prefix=${s:0:6}
	suffix=${s: -4}
	echo "${prefix}...${suffix}"
}

echo "New SUPABASE_URL (preview)=$(mask "$SUPABASE_URL")"
echo "New SUPABASE_ANON_KEY (preview)=$(mask "$SUPABASE_ANON_KEY")"

echo "Please copy these values into your production secret store as SUPABASE_URL and SUPABASE_ANON_KEY."
echo "Important: rotate keys after deploying and then remove any fallback code that reads NEXT_PUBLIC_* from server files."