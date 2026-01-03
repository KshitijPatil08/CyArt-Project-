# PowerShell helper template for rotating secrets
Write-Output "ROTATE SECRETS HELPER"

Write-Output "1) Generate new secrets (do not commit to disk). Example using cryptographically secure RNG:" 
Write-Output "   # PowerShell (Windows PowerShell / PowerShell Core):"
Write-Output "   $bytes = New-Object 'System.Byte[]' 32"
Write-Output "   [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)"
Write-Output "   $env:SUPABASE_ANON_KEY = [Convert]::ToBase64String($bytes)"
Write-Output "   # Repeat with desired lengths for other secrets (e.g. 48 bytes for service role / JWT_SECRET)."
Write-Output "   # IMPORTANT: Do NOT write secrets to stdout. The example above shows how to generate them securely in memory."

Write-Output "\n2) Add values to your hosting provider's secret store (Vercel/AWS/Azure/GCP)."
Write-Output "3) Deploy the application and verify functionality."
Write-Output "4) Revoke old keys in Supabase dashboard once verified."

Write-Output "Note: This is a template helper. Use the Supabase dashboard to generate and revoke keys. Do not echo secrets to logs or CI outputs." 