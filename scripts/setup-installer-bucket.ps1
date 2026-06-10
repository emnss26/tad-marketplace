#requires -Version 5.1
<#
.SYNOPSIS
  Creates the private S3 bucket `tad-installers` used to serve TAD product
  installers (.msi / .exe / .zip) via short-lived presigned URLs.

.DESCRIPTION
  Configuration:
    - Private (Block All Public Access on)
    - Versioning enabled (so we can rollback if a bad installer ships)
    - AES256 server-side encryption (AWS-owned KMS)
    - Tagged Project=marketplace

  Object layout (admin uploads manually until Sprint 1 Terraform):
    s3://tad-installers/{product_id}/latest/installer

  The `installer-download` handler signs `GetObject` with
  `ResponseContentDisposition` so the browser saves the file with a friendly
  name (TAD-MCP-Revit-Setup.msi etc).

  Idempotent. Safe to re-run.

.EXAMPLE
  .\scripts\setup-installer-bucket.ps1
  .\scripts\setup-installer-bucket.ps1 -Region us-east-1 -Profile tad
#>
param(
  [string]$Bucket  = 'tad-installers',
  [string]$Region  = 'us-east-1',
  [string]$Profile = ''
)

$ErrorActionPreference = 'Continue'

$AwsBaseArgs = @('--region', $Region)
if ($Profile -ne '') { $AwsBaseArgs += @('--profile', $Profile) }

function Test-Bucket {
  param([Parameter(Mandatory)][string]$Name)
  $null = & aws s3api head-bucket --bucket $Name @AwsBaseArgs 2>&1 | Out-Null
  return $LASTEXITCODE -eq 0
}

Write-Host ''
Write-Host '=== Installer bucket ===' -ForegroundColor Cyan

if (Test-Bucket $Bucket) {
  Write-Host ('  SKIP   create-bucket ' + $Bucket) -ForegroundColor Yellow
} else {
  # us-east-1 must NOT pass a LocationConstraint, other regions must. We're
  # us-east-1 so the basic form works.
  & aws s3api create-bucket --bucket $Bucket @AwsBaseArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw ('create-bucket failed for ' + $Bucket) }
  Write-Host ('  CREATE ' + $Bucket) -ForegroundColor Green
}

# Block All Public Access — non-negotiable for installers.
& aws s3api put-public-access-block `
  --bucket $Bucket `
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true `
  @AwsBaseArgs | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'put-public-access-block failed' }
Write-Host '  CONFIG Block All Public Access' -ForegroundColor Green

# Versioning on (rollback safety for installers).
& aws s3api put-bucket-versioning `
  --bucket $Bucket `
  --versioning-configuration Status=Enabled `
  @AwsBaseArgs | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'put-bucket-versioning failed' }
Write-Host '  CONFIG Versioning enabled' -ForegroundColor Green

# Server-side encryption (AES256, AWS-managed).
$encryptionJson = @'
{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}
'@
$encPath = Join-Path $env:TEMP ('tad-bucket-enc-' + [Guid]::NewGuid().ToString('N').Substring(0,8) + '.json')
Set-Content -Path $encPath -Value $encryptionJson -Encoding ASCII
& aws s3api put-bucket-encryption `
  --bucket $Bucket `
  --server-side-encryption-configuration ('file://' + $encPath) `
  @AwsBaseArgs | Out-Null
$encExit = $LASTEXITCODE
Remove-Item -Force $encPath -ErrorAction SilentlyContinue
if ($encExit -ne 0) { throw 'put-bucket-encryption failed' }
Write-Host '  CONFIG SSE-S3 (AES256) default encryption' -ForegroundColor Green

# Tag.
& aws s3api put-bucket-tagging `
  --bucket $Bucket `
  --tagging 'TagSet=[{Key=Project,Value=marketplace}]' `
  @AwsBaseArgs | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'put-bucket-tagging failed' }
Write-Host '  CONFIG Tag Project=marketplace' -ForegroundColor Green

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host ''
Write-Host 'Next: upload your installer.' -ForegroundColor Cyan
Write-Host '  aws s3 cp .\path\to\setup.msi s3://tad-installers/prd_revit_mcp/latest/installer'
