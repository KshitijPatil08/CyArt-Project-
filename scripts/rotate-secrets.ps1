# PowerShell helper template for rotating secrets
Write-Output "ROTATE SECRETS HELPER"

Write-Output "1) Generate new secrets (do not commit to disk):"
Write-Output "   $env:SUPABASE_ANON_KEY = [System.Convert]::ToBase64String((New-Object Byte[] 32 | %{Get-Random -Maximum 256}))"
Write-Output "   $env:SUPABASE_SERVICE_ROLE_KEY = [System.Convert]::ToBase64String((New-Object Byte[] 48 | %{Get-Random -Maximum 256}))"
Write-Output "   $env:JWT_SECRET = [System.Convert]::ToBase64String((New-Object Byte[] 48 | %{Get-Random -Maximum 256}))"
Write-Output "   $env:AGENT_SECRET_KEY = [System.Convert]::ToBase64String((New-Object Byte[] 32 | %{Get-Random -Maximum 256}))"

Write-Output "\n2) Add values to your hosting provider's secret store (Vercel/AWS/Azure/GCP)."
Write-Output "3) Deploy the application and verify functionality."
Write-Output "4) Revoke old keys in Supabase dashboard once verified."

Write-Output "Note: This is a template helper. Use the Supabase dashboard to generate and revoke keys."