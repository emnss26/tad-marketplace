#requires -Version 5.1
<#
.SYNOPSIS
  Creates the 5 shared DynamoDB tables (tad-mcp-aws-*) shared with TAD_MCP_AWS.

.DESCRIPTION
  Normally these are created by TAD_MCP_AWS/infra/dynamodb.tf. Until that
  Terraform deploy happens, this script creates them out-of-band with the exact
  schema from CONTROL_PLANE.md so the marketplace can write tenants + licenses.

  Tables created:
    - tad-mcp-aws-tenants       PK tenant_id
    - tad-mcp-aws-licenses      PK tenant_id, SK license_id, GSI product_idx
    - tad-mcp-aws-seats         PK seat_id, GSI token_hash_idx (projection ALL)
    - tad-mcp-aws-usage-events  PK tenant_id_month, SK ts_event_id, TTL ttl_epoch
    - tad-mcp-aws-products      PK product_id

  All PAY_PER_REQUEST. Tagged Project=marketplace.
  Idempotent. Re-running skips tables that already exist.

.EXAMPLE
  .\scripts\setup-shared-tables.ps1
  .\scripts\setup-shared-tables.ps1 -Region us-east-1 -Profile tad
#>
param(
  [string]$Region  = 'us-east-1',
  [string]$Profile = ''
)

$ErrorActionPreference = 'Continue'

$AwsBaseArgs = @('--region', $Region)
if ($Profile -ne '') { $AwsBaseArgs += @('--profile', $Profile) }

# Create a temp dir for GSI JSON files. AWS CLI on Windows PowerShell handles
# JSON args way more reliably via file:// than inline (escaping nightmare).
$TempDir = Join-Path $env:TEMP ('tad-setup-shared-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

function Test-Table {
  param([Parameter(Mandatory)][string]$Name)
  $null = & aws dynamodb describe-table --table-name $Name @AwsBaseArgs 2>&1 | Out-Null
  return $LASTEXITCODE -eq 0
}

function Wait-Active {
  param([Parameter(Mandatory)][string]$Name)
  Write-Host ('  WAIT   ' + $Name + ' -> ACTIVE')
  & aws dynamodb wait table-exists --table-name $Name @AwsBaseArgs
  if ($LASTEXITCODE -ne 0) { throw ('wait table-exists failed for ' + $Name) }
}

function Write-JsonFile {
  param(
    [Parameter(Mandatory)][string]$FileName,
    [Parameter(Mandatory)][string]$Content
  )
  $path = Join-Path $TempDir $FileName
  Set-Content -Path $path -Value $Content -Encoding ASCII
  return $path
}

Write-Host ''
Write-Host '=== Shared tables (tad-mcp-aws-*) ===' -ForegroundColor Cyan

# 1. tenants -----------------------------------------------------------------
if (Test-Table 'tad-mcp-aws-tenants') {
  Write-Host '  SKIP   tad-mcp-aws-tenants' -ForegroundColor Yellow
} else {
  & aws dynamodb create-table `
    --table-name tad-mcp-aws-tenants `
    --attribute-definitions AttributeName=tenant_id,AttributeType=S `
    --key-schema AttributeName=tenant_id,KeyType=HASH `
    --billing-mode PAY_PER_REQUEST `
    --tags Key=Project,Value=marketplace `
    @AwsBaseArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'create tad-mcp-aws-tenants failed' }
  Wait-Active 'tad-mcp-aws-tenants'
  Write-Host '  CREATE tad-mcp-aws-tenants' -ForegroundColor Green
}

# 2. licenses (with GSI product_idx) -----------------------------------------
if (Test-Table 'tad-mcp-aws-licenses') {
  Write-Host '  SKIP   tad-mcp-aws-licenses' -ForegroundColor Yellow
} else {
  $licensesGsiJson = @'
[
  {
    "IndexName": "product_idx",
    "KeySchema": [
      {"AttributeName": "product_id", "KeyType": "HASH"},
      {"AttributeName": "created_at", "KeyType": "RANGE"}
    ],
    "Projection": {"ProjectionType": "ALL"}
  }
]
'@
  $licensesGsiPath = Write-JsonFile -FileName 'licenses-gsi.json' -Content $licensesGsiJson
  & aws dynamodb create-table `
    --table-name tad-mcp-aws-licenses `
    --attribute-definitions AttributeName=tenant_id,AttributeType=S AttributeName=license_id,AttributeType=S AttributeName=product_id,AttributeType=S AttributeName=created_at,AttributeType=N `
    --key-schema AttributeName=tenant_id,KeyType=HASH AttributeName=license_id,KeyType=RANGE `
    --global-secondary-indexes ('file://' + $licensesGsiPath) `
    --billing-mode PAY_PER_REQUEST `
    --tags Key=Project,Value=marketplace `
    @AwsBaseArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'create tad-mcp-aws-licenses failed' }
  Wait-Active 'tad-mcp-aws-licenses'
  Write-Host '  CREATE tad-mcp-aws-licenses (with GSI product_idx)' -ForegroundColor Green
}

# 3. seats (with GSI token_hash_idx, projection ALL) -------------------------
if (Test-Table 'tad-mcp-aws-seats') {
  Write-Host '  SKIP   tad-mcp-aws-seats' -ForegroundColor Yellow
} else {
  $seatsGsiJson = @'
[
  {
    "IndexName": "token_hash_idx",
    "KeySchema": [
      {"AttributeName": "token_hash", "KeyType": "HASH"}
    ],
    "Projection": {"ProjectionType": "ALL"}
  }
]
'@
  $seatsGsiPath = Write-JsonFile -FileName 'seats-gsi.json' -Content $seatsGsiJson
  & aws dynamodb create-table `
    --table-name tad-mcp-aws-seats `
    --attribute-definitions AttributeName=seat_id,AttributeType=S AttributeName=token_hash,AttributeType=S `
    --key-schema AttributeName=seat_id,KeyType=HASH `
    --global-secondary-indexes ('file://' + $seatsGsiPath) `
    --billing-mode PAY_PER_REQUEST `
    --tags Key=Project,Value=marketplace `
    @AwsBaseArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'create tad-mcp-aws-seats failed' }
  Wait-Active 'tad-mcp-aws-seats'
  Write-Host '  CREATE tad-mcp-aws-seats (with GSI token_hash_idx)' -ForegroundColor Green
}

# 4. usage-events (TTL ttl_epoch) --------------------------------------------
if (Test-Table 'tad-mcp-aws-usage-events') {
  Write-Host '  SKIP   tad-mcp-aws-usage-events' -ForegroundColor Yellow
} else {
  & aws dynamodb create-table `
    --table-name tad-mcp-aws-usage-events `
    --attribute-definitions AttributeName=tenant_id_month,AttributeType=S AttributeName=ts_event_id,AttributeType=S `
    --key-schema AttributeName=tenant_id_month,KeyType=HASH AttributeName=ts_event_id,KeyType=RANGE `
    --billing-mode PAY_PER_REQUEST `
    --tags Key=Project,Value=marketplace `
    @AwsBaseArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'create tad-mcp-aws-usage-events failed' }
  Wait-Active 'tad-mcp-aws-usage-events'
  & aws dynamodb update-time-to-live `
    --table-name tad-mcp-aws-usage-events `
    --time-to-live-specification 'Enabled=true, AttributeName=ttl_epoch' `
    @AwsBaseArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'TTL config failed for tad-mcp-aws-usage-events' }
  Write-Host '  CREATE tad-mcp-aws-usage-events (TTL ttl_epoch enabled)' -ForegroundColor Green
}

# 5. products ----------------------------------------------------------------
if (Test-Table 'tad-mcp-aws-products') {
  Write-Host '  SKIP   tad-mcp-aws-products' -ForegroundColor Yellow
} else {
  & aws dynamodb create-table `
    --table-name tad-mcp-aws-products `
    --attribute-definitions AttributeName=product_id,AttributeType=S `
    --key-schema AttributeName=product_id,KeyType=HASH `
    --billing-mode PAY_PER_REQUEST `
    --tags Key=Project,Value=marketplace `
    @AwsBaseArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'create tad-mcp-aws-products failed' }
  Wait-Active 'tad-mcp-aws-products'
  Write-Host '  CREATE tad-mcp-aws-products' -ForegroundColor Green
}

# Cleanup temp JSON files
Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host 'Note: when TAD_MCP_AWS deploys, run `terraform import` to adopt these tables.' -ForegroundColor Cyan
