Param()
$required = @('SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','JWT_SECRET','AGENT_SECRET_KEY','APP_URL')
$missing = @()
foreach ($v in $required) {
    if (-not ${env:$v}) { $missing += $v }
}
if ($missing.Count -gt 0) {
    Write-Host "Missing required environment variables: $($missing -join ', ')" -ForegroundColor Yellow
    exit 2
}
Write-Host "All required env vars present." -ForegroundColor Green

Write-Host "Running basic smoke check against $($env:APP_URL) (GET /)" -ForegroundColor Cyan
try {
    $resp = Invoke-WebRequest -Uri "$($env:APP_URL.TrimEnd('/'))/" -UseBasicParsing -TimeoutSec 10
    Write-Host "HTTP $($resp.StatusCode) returned from $($env:APP_URL)/"
} catch {
    Write-Host "Warning: could not connect to $($env:APP_URL). Ensure the app is running and accessible." -ForegroundColor Yellow
}
Write-Host "Smoke checks completed. For protected endpoints run explicit authenticated tests." -ForegroundColor Green
