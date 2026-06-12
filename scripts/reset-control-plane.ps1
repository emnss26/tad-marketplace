# scripts/reset-control-plane.ps1
#
# Wipes test data from the control plane so the end-to-end flow can be
# exercised from scratch (signup -> buy -> activate -> cancel).
#
# Default: deletes ALL items from seats + licenses + tenants + users.
#   - seats/licenses: the purchased state.
#   - tenants: included because tenant.billing.subscription_id would otherwise
#     point at an old PayPal subscription and confuse the MCP billing gate.
#   - users: included so signup runs fresh (users.tenants_owned would otherwise
#     hold dangling tenant ids).
# Auth tokens expire on their own (15-min TTL) but -IncludeAuthTokens wipes
# them too.
#
# DOES NOT touch: usage-events, products, or any PayPal subscription. Cancel
# leftover sandbox/live subscriptions in PayPal manually if you care.
#
# Usage:
#   pwsh ./scripts/reset-control-plane.ps1            # asks for confirmation
#   pwsh ./scripts/reset-control-plane.ps1 -Force     # no prompt
#   pwsh ./scripts/reset-control-plane.ps1 -IncludeAuthTokens -Force

param(
  [switch]$Force,
  [switch]$IncludeAuthTokens,
  [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"

function Clear-Table {
  param(
    [string]$Table,
    [string[]]$KeyAttributes
  )
  Write-Host "Scanning $Table..." -ForegroundColor Cyan
  $proj = ($KeyAttributes -join ",")
  $raw = aws dynamodb scan --table-name $Table --region $Region `
    --projection-expression $proj --output json | ConvertFrom-Json
  $items = $raw.Items
  if (-not $items -or $items.Count -eq 0) {
    Write-Host "  $Table is already empty." -ForegroundColor DarkGray
    return
  }
  Write-Host "  Deleting $($items.Count) item(s) from $Table..."
  foreach ($item in $items) {
    $key = @{}
    foreach ($attr in $KeyAttributes) {
      $key[$attr] = @{ S = $item.$attr.S }
    }
    $keyJson = $key | ConvertTo-Json -Compress
    aws dynamodb delete-item --table-name $Table --region $Region --key $keyJson | Out-Null
  }
  Write-Host "  $Table cleared." -ForegroundColor Green
}

Write-Host ""
Write-Host "This will DELETE all items from:" -ForegroundColor Yellow
Write-Host "  - tad-mcp-aws-seats"
Write-Host "  - tad-mcp-aws-licenses"
Write-Host "  - tad-mcp-aws-tenants"
Write-Host "  - tad-marketplace-users"
if ($IncludeAuthTokens) { Write-Host "  - tad-marketplace-auth-tokens" }
Write-Host ""

if (-not $Force) {
  $answer = Read-Host "Type RESET to continue"
  if ($answer -ne "RESET") { Write-Host "Aborted."; exit 1 }
}

Clear-Table -Table "tad-mcp-aws-seats"        -KeyAttributes @("seat_id")
Clear-Table -Table "tad-mcp-aws-licenses"     -KeyAttributes @("tenant_id", "license_id")
Clear-Table -Table "tad-mcp-aws-tenants"      -KeyAttributes @("tenant_id")
Clear-Table -Table "tad-marketplace-users"    -KeyAttributes @("email")
if ($IncludeAuthTokens) {
  Clear-Table -Table "tad-marketplace-auth-tokens" -KeyAttributes @("token_hash")
}

Write-Host ""
Write-Host "Control plane reset. Remember:" -ForegroundColor Yellow
Write-Host "  1. Old PayPal subscriptions still exist - cancel them in the PayPal dashboard."
Write-Host "  2. Sign up again from /signup to recreate your user."
Write-Host "  3. The MCP auth cache holds positives up to 5 min - old seat tokens die out alone."
