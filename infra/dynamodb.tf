# Marketplace-only DynamoDB tables.
#
# Both tables ALREADY EXIST in the account (created out-of-band via
# scripts/setup-tables.ps1 during Sprint 2). The resource blocks below match
# the live schema exactly so they can be adopted with `terraform import`
# (commands in README.md) instead of being recreated.
#
# The five shared tables (tad-mcp-aws-*) are owned by TAD_MCP_AWS's Terraform
# and are referenced by NAME only (see variables.tf) — never defined here.

# Users: one item per email. Attributes beyond the key (user_id,
# tenants_owned[], tenants_member_of[]) are schemaless.
resource "aws_dynamodb_table" "users" {
  name         = var.ddb_table_users
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  # Account ownership state: cheap insurance at this size.
  point_in_time_recovery {
    enabled = false
  }

  tags = {
    Component = "auth"
  }
}

# Magic-link tokens: single-use, 15-minute TTL. DynamoDB expires items via
# the ttl_epoch attribute (unix seconds).
resource "aws_dynamodb_table" "auth_tokens" {
  name         = var.ddb_table_auth_tokens
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "token_hash"

  attribute {
    name = "token_hash"
    type = "S"
  }

  ttl {
    attribute_name = "ttl_epoch"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = {
    Component = "auth"
  }
}
