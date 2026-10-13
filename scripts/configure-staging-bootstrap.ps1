$ErrorActionPreference = "Stop"

$required = @(
  "LEX_STAGING_API_URL",
  "LEX_PRIMARY_OWNER_PHONE",
  "LEX_PRIMARY_OWNER_EMAIL",
  "LEX_PARTNER_OWNER_PHONE",
  "LEX_PARTNER_OWNER_EMAIL"
)
foreach ($name in $required) {
  if (-not [Environment]::GetEnvironmentVariable($name)) {
    throw "Missing secure staging environment variable: $name"
  }
}

$randomBytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($randomBytes)
$rng.Dispose()
$bootstrapToken = [Convert]::ToBase64String($randomBytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")
$hashBytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($bootstrapToken))
$bootstrapHash = [Convert]::ToBase64String($hashBytes)

try {
  pnpm exec wrangler deploy --config apps/cloudflare-api/wrangler.jsonc --var "FOUNDER_BOOTSTRAP_TOKEN_HASH:$bootstrapHash"
  if ($LASTEXITCODE -ne 0) { throw "Could not deploy the one-time staging bootstrap hash" }
  Start-Sleep -Seconds 5
  # The short-lived hash is itself a 256-bit bearer value and is removed by
  # the normal API redeploy in finally. This avoids shell newline changes.
  $env:LEX_FOUNDER_BOOTSTRAP_TOKEN = $bootstrapHash
  node scripts/bootstrap-founders.mjs
  if ($LASTEXITCODE -ne 0) { throw "Founder bootstrap failed" }
  node scripts/openai-staging-smoke.mjs
  if ($LASTEXITCODE -ne 0) { throw "OpenAI staging smoke failed" }
} finally {
  $env:LEX_FOUNDER_BOOTSTRAP_TOKEN = $null
  $bootstrapToken = $null
  pnpm --filter @lex/cloudflare-api run deploy
  if ($LASTEXITCODE -ne 0) { throw "Could not remove the one-time staging bootstrap hash" }
}

Write-Output "Founder bootstrap and OpenAI smoke completed; the one-time authorization was removed."
