#requires -Version 5.1
<#
.SYNOPSIS
  Verifies the 5 shared DynamoDB tables exist (owned by TAD_MCP_AWS) and
  creates the 2 marketplace-only tables (this repo's responsibility).

.DESCRIPTION
  Tables created here:
    - tad-marketplace-users        PK email
    - tad-marketplace-auth-tokens  PK token_hash, TTL on ttl_epoch (15 min)

  Tables only verified (not created):
    - tad-mcp-aws-tenants
    - tad-mcp-aws-licenses
    - tad-mcp-aws-seats
    - tad-mcp-aws-usage-events
    - tad-mcp-aws-products

  Idempotent. Re-running skips tables that already exist.

.EXAMPLE
  pwsh ./scripts/setup-tables.ps1
  pwsh ./scripts/setup-tables.ps1 -Profile tad -Region us-east-1
#>
param(
  [string]$Region  = 'us-east-1',
  [string]$Profile = ''
)

# Native CLI stderr (e.g. ResourceNotFoundException) is informational here, not
# a script-stopping error. We rely on $LASTEXITCODE to detect real failures.
$ErrorActionPreference = 'Continue'

$AwsBaseArgs = @('--region', $Region)
if ($Profile -ne '') { $AwsBaseArgs += @('--profile', $Profile) }

function Test-Table {
  param([Parameter(Mandatory)][string]$Name)
  $null = & aws dynamodb describe-table --table-name $Name @AwsBaseArgs 2>&1 | Out-Null
  return $LASTEXITCODE -eq 0
}

Write-Host ''
Write-Host '=== Checking shared tables (tad-mcp-aws-*) ===' -ForegroundColor Cyan
$Shared = @(
  'tad-mcp-aws-tenants',
  'tad-mcp-aws-licenses',
  'tad-mcp-aws-seats',
  'tad-mcp-aws-usage-events',
  'tad-mcp-aws-products'
)
$MissingShared = @()
foreach ($t in $Shared) {
  if (Test-Table -Name $t) {
    Write-Host ('  OK   {0}' -f $t) -ForegroundColor Green
  } else {
    Write-Host ('  MISS {0}' -f $t) -ForegroundColor Red
    $MissingShared += $t
  }
}

if ($MissingShared.Count -gt 0) {
  Write-Host ''
  Write-Host 'Warning: some shared tables are missing. They must be created' -ForegroundColor Yellow
  Write-Host 'from the TAD_MCP_AWS repo (infra/dynamodb.tf), not from here.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== Creating marketplace tables (tad-marketplace-*) ===' -ForegroundColor Cyan

# 1. tad-marketplace-users
if (Test-Table -Name 'tad-marketplace-users') {
  Write-Host '  SKIP tad-marketplace-users (already exists)' -ForegroundColor Yellow
} else {
  & aws dynamodb create-table `
    --table-name tad-marketplace-users `
    --attribute-definitions AttributeName=email,AttributeType=S `
    --key-schema AttributeName=email,KeyType=HASH `
    --billing-mode PAY_PER_REQUEST `
    --tags Key=Project,Value=marketplace `
    @AwsBaseArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'create-table failed for tad-marketplace-users' }
  Write-Host '  CREATE tad-marketplace-users' -ForegroundColor Green
}

# 2. tad-marketplace-auth-tokens
if (Test-Table -Name 'tad-marketplace-auth-tokens') {
  Write-Host '  SKIP tad-marketplace-auth-tokens (already exists)' -ForegroundColor Yellow
} else {
  & aws dynamodb create-table `
    --table-name tad-marketplace-auth-tokens `
    --attribute-definitions AttributeName=token_hash,AttributeType=S `
    --key-schema AttributeName=token_hash,KeyType=HASH `
    --billing-mode PAY_PER_REQUEST `
    --tags Key=Project,Value=marketplace `
    @AwsBaseArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'create-table failed for tad-marketplace-auth-tokens' }
  Write-Host '  CREATE tad-marketplace-auth-tokens' -ForegroundColor Green

  Write-Host '  WAIT  tad-marketplace-auth-tokens to become ACTIVE...'
  & aws dynamodb wait table-exists --table-name tad-marketplace-auth-tokens @AwsBaseArgs
  if ($LASTEXITCODE -ne 0) { throw 'wait table-exists failed' }

  & aws dynamodb update-time-to-live `
    --table-name tad-marketplace-auth-tokens `
    --time-to-live-specification 'Enabled=true, AttributeName=ttl_epoch' `
    @AwsBaseArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'update-time-to-live failed' }
  Write-Host '  TTL   tad-marketplace-auth-tokens (ttl_epoch enabled)' -ForegroundColor Green
}

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
