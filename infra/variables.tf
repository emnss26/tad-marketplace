variable "aws_region" {
  description = "AWS region for everything (CloudFront certs must be us-east-1)."
  type        = string
  default     = "us-east-1"
}

# ---------------------------------------------------------------------------
# Secrets — fed via TF_VAR_* environment variables, never .tfvars files.
# PowerShell:  $env:TF_VAR_jwt_secret = "..."
# These land in Secrets Manager AND in the Lambda environment (the handlers
# read process.env directly today). Terraform state therefore contains them:
# state is local and gitignored — keep it that way.
# ---------------------------------------------------------------------------

variable "jwt_secret" {
  description = "HS256 secret for session JWTs. 32+ chars. Rotate every 90 days."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "jwt_secret must be at least 32 characters."
  }
}

variable "paypal_client_id" {
  description = "PayPal REST app client id (live)."
  type        = string
  sensitive   = true
}

variable "paypal_client_secret" {
  description = "PayPal REST app client secret (live)."
  type        = string
  sensitive   = true
}

variable "paypal_webhook_id" {
  description = "PayPal webhook id for signature verification. Empty on first apply; set after registering the webhook with the webhook_url output, then re-apply."
  type        = string
  sensitive   = true
  default     = ""
}

variable "paypal_env" {
  description = "PayPal environment: live or sandbox."
  type        = string
  default     = "live"

  validation {
    condition     = contains(["live", "sandbox"], var.paypal_env)
    error_message = "paypal_env must be 'live' or 'sandbox'."
  }
}

# ---------------------------------------------------------------------------
# Plain configuration (defaults match CLAUDE.md env-var table).
# ---------------------------------------------------------------------------

variable "ses_from_address" {
  description = "From address for magic-link and invite emails."
  type        = string
  default     = "noreply@tad.com.mx"
}

variable "session_cookie_domain" {
  description = "Cookie Domain attribute so the HttpOnly session JWT flows between marketplace.tad.com.mx (FE) and api.marketplace.tad.com.mx (API)."
  type        = string
  default     = ".tad.com.mx"
}

variable "installer_bucket" {
  description = "Existing private S3 bucket holding product installers (created by scripts/setup-installer-bucket.ps1 — NOT managed here)."
  type        = string
  default     = "tad-installers"
}

# DynamoDB table names. The five tad-mcp-aws-* tables are OWNED by
# TAD_MCP_AWS/infra/dynamodb.tf — referenced by name only, never as resources.
variable "ddb_table_tenants" {
  type    = string
  default = "tad-mcp-aws-tenants"
}

variable "ddb_table_licenses" {
  type    = string
  default = "tad-mcp-aws-licenses"
}

variable "ddb_table_seats" {
  type    = string
  default = "tad-mcp-aws-seats"
}

variable "ddb_table_usage" {
  type    = string
  default = "tad-mcp-aws-usage-events"
}

variable "ddb_table_products" {
  type    = string
  default = "tad-mcp-aws-products"
}

variable "ddb_table_users" {
  type    = string
  default = "tad-marketplace-users"
}

variable "ddb_table_auth_tokens" {
  type    = string
  default = "tad-marketplace-auth-tokens"
}
