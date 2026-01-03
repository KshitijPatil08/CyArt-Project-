# PowerShell migration helper: map NEXT_PUBLIC_* -> server-only env names
param()

$env:SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL
$env:SUPABASE_ANON_KEY = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY

Write-Output "SUPABASE_URL = $($env:SUPABASE_URL)"
Write-Output "SUPABASE_ANON_KEY = $($env:SUPABASE_ANON_KEY)"

Write-Output "Copy these into your hosting provider secret store as SUPABASE_URL and SUPABASE_ANON_KEY."
Write-Output "After deploying, rotate the Supabase keys and remove any server fallbacks to NEXT_PUBLIC_* in code."