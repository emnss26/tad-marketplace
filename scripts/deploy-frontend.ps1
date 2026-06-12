#requires -Version 5.1
<#
.SYNOPSIS
  Build the Next.js static export and deploy it to the marketplace
  S3 bucket + CloudFront distribution created by infra/.

.DESCRIPTION
  1. Reads bucket name + distribution id from `terraform output` in infra/.
  2. Builds the frontend with NEXT_PUBLIC_API_URL pointing at the prod API
     (build-time inlined by Next.js — runtime env has no effect).
  3. Two-pass `aws s3 sync`:
       - assets (everything except *.html / *.txt): long immutable cache
       - HTML + txt: no-cache, so deploys show up after the invalidation
     The --exclude filters also protect HTML from the --delete pass.
  4. CloudFront invalidation on /*.

.EXAMPLE
  pwsh ./scripts/deploy-frontend.ps1
  pwsh ./scripts/deploy-frontend.ps1 -Profile tad -ApiUrl https://api.marketplace.tad.com.mx
#>
param(
  [string]$Profile = '',
  [string]$ApiUrl = 'https://api.marketplace.tad.com.mx'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$InfraDir = Join-Path $RepoRoot 'infra'
$OutDir = Join-Path $RepoRoot 'frontend\out'

$AwsArgs = @()
if ($Profile -ne '') { $AwsArgs += @('--profile', $Profile) }

# ----- 1. Terraform outputs --------------------------------------------------
Write-Host '=== Reading terraform outputs ===' -ForegroundColor Cyan
Push-Location $InfraDir
try {
  $Bucket = (& terraform output -raw frontend_bucket).Trim()
  if ($LASTEXITCODE -ne 0 -or $Bucket -eq '') { throw 'terraform output frontend_bucket failed — has infra been applied?' }
  $DistributionId = (& terraform output -raw cloudfront_distribution_id).Trim()
  if ($LASTEXITCODE -ne 0 -or $DistributionId -eq '') { throw 'terraform output cloudfront_distribution_id failed' }
} finally {
  Pop-Location
}
Write-Host ("  bucket       : {0}" -f $Bucket)
Write-Host ("  distribution : {0}" -f $DistributionId)

# ----- 2. Build the static export --------------------------------------------
Write-Host '=== Building frontend (static export) ===' -ForegroundColor Cyan
$env:NEXT_PUBLIC_API_URL = $ApiUrl
Push-Location $RepoRoot
try {
  & npm run build --workspace frontend
  if ($LASTEXITCODE -ne 0) { throw 'frontend build failed' }
} finally {
  Pop-Location
}
if (-not (Test-Path $OutDir)) {
  throw "Expected static export at $OutDir — is `output: 'export'` set in frontend/next.config.mjs?"
}

# ----- 3. Sync to S3 ----------------------------------------------------------
Write-Host '=== Syncing assets (immutable cache) ===' -ForegroundColor Cyan
& aws s3 sync $OutDir "s3://$Bucket" `
  --delete `
  --exclude '*.html' --exclude '*.txt' `
  --cache-control 'public,max-age=31536000,immutable' `
  @AwsArgs
if ($LASTEXITCODE -ne 0) { throw 's3 sync (assets) failed' }

Write-Host '=== Syncing HTML (no-cache) ===' -ForegroundColor Cyan
& aws s3 sync $OutDir "s3://$Bucket" `
  --exclude '*' --include '*.html' --include '*.txt' `
  --cache-control 'no-cache' `
  @AwsArgs
if ($LASTEXITCODE -ne 0) { throw 's3 sync (html) failed' }

# ----- 4. Invalidate CloudFront -----------------------------------------------
Write-Host '=== Creating CloudFront invalidation ===' -ForegroundColor Cyan
& aws cloudfront create-invalidation `
  --distribution-id $DistributionId `
  --paths '/*' `
  @AwsArgs | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'create-invalidation failed' }

Write-Host ''
Write-Host 'Deployed. https://marketplace.tad.com.mx' -ForegroundColor Green
