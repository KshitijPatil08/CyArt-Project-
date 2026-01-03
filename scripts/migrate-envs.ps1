# PowerShell migration helper: map NEXT_PUBLIC_* -> server-only env names
param()

if (-not $env:NEXT_PUBLIC_SUPABASE_URL -or -not $env:NEXT_PUBLIC_SUPABASE_ANON_KEY) {
	Write-Error "Source variables NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set in your environment. Load them from .env.local before running this script."
	exit 1
}

$env:SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL
$env:SUPABASE_ANON_KEY = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY

# For safety, do NOT print full secret values to stdout. Print masked previews instead.
function Mask-Secret([string]$s) {
	if (-not $s) { return "(empty)" }
	if ($s.Length -le 8) { return $s }
	return $s.Substring(0,6) + '...' + $s.Substring($s.Length - 4)
}

Write-Output "SUPABASE_URL (preview) = $(Mask-Secret($env:SUPABASE_URL))"
Write-Output "SUPABASE_ANON_KEY (preview) = $(Mask-Secret($env:SUPABASE_ANON_KEY))"

Write-Output "Copy these values into your hosting provider secret store as SUPABASE_URL and SUPABASE_ANON_KEY."
Write-Output "After deploying, rotate the Supabase keys and remove any server fallbacks to NEXT_PUBLIC_* in code."