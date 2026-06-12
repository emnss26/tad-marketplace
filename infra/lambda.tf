# One Lambda per backend handler, driven by a single locals map.
#
# Build step (run BEFORE terraform plan/apply):
#   npm run build:lambdas
# which esbuild-bundles backend/handlers/<name>.ts into
# build/lambdas/<name>/index.mjs (ESM, node20, @aws-sdk/* external — the
# nodejs20.x runtime ships SDK v3). Terraform zips each directory and tracks
# changes via source_code_hash.

locals {
  # handler name -> route. Mirror of backend/scripts/dev-server.ts mounts.
  # Express ":param" syntax becomes API Gateway "{param}".
  handlers = {
    "auth-magic-link"    = { method = "POST", path = "/auth/magic-link", timeout = 15 }
    "auth-verify"        = { method = "POST", path = "/auth/verify", timeout = 15 }
    "auth-logout"        = { method = "POST", path = "/auth/logout", timeout = 15 }
    "me"                 = { method = "GET", path = "/me", timeout = 15 }
    "me-licenses"        = { method = "GET", path = "/me/licenses", timeout = 15 }
    "me-seats"           = { method = "GET", path = "/me/seats", timeout = 15 }
    "checkout-session"   = { method = "POST", path = "/checkout/session", timeout = 30 }
    "checkout-confirm"   = { method = "POST", path = "/checkout/confirm", timeout = 30 }
    "installer-download" = { method = "GET", path = "/installers/{product_id}/download", timeout = 15 }
    "seat-activate"      = { method = "POST", path = "/seats/activate", timeout = 15 }
    "seat-revoke"        = { method = "POST", path = "/seats/{seat_id}/revoke", timeout = 15 }
    "team-invite"        = { method = "POST", path = "/team/invite", timeout = 15 }
    "license-cancel"     = { method = "POST", path = "/licenses/{license_id}/cancel", timeout = 15 }
    "webhook-paypal"     = { method = "POST", path = "/webhooks/paypal", timeout = 30 }
  }

  # Shared environment for every function. The code reads process.env at
  # module init (backend/shared/*.ts) — values are injected here, and the
  # same secrets also live in Secrets Manager (secrets.tf) as the durable
  # source of truth for rotation.
  lambda_environment = {
    JWT_SECRET            = var.jwt_secret
    PAYPAL_ENV            = var.paypal_env
    PAYPAL_CLIENT_ID      = var.paypal_client_id
    PAYPAL_CLIENT_SECRET  = var.paypal_client_secret
    PAYPAL_WEBHOOK_ID     = var.paypal_webhook_id
    SES_FROM_ADDRESS      = var.ses_from_address
    FRONTEND_URL          = local.frontend_url
    SESSION_COOKIE_DOMAIN = var.session_cookie_domain
    INSTALLER_BUCKET      = var.installer_bucket
    DDB_TABLE_TENANTS     = var.ddb_table_tenants
    DDB_TABLE_LICENSES    = var.ddb_table_licenses
    DDB_TABLE_SEATS       = var.ddb_table_seats
    DDB_TABLE_USAGE       = var.ddb_table_usage
    DDB_TABLE_PRODUCTS    = var.ddb_table_products
    DDB_TABLE_USERS       = var.ddb_table_users
    DDB_TABLE_AUTH_TOKENS = var.ddb_table_auth_tokens
  }
}

data "archive_file" "lambda" {
  for_each = local.handlers

  type        = "zip"
  source_dir  = "${path.module}/../build/lambdas/${each.key}"
  output_path = "${path.module}/../build/lambda-zips/${each.key}.zip"
}

# Explicit log groups: 30-day retention instead of never-expire defaults.
resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.handlers

  name              = "/aws/lambda/tad-marketplace-${each.key}"
  retention_in_days = 30
}

resource "aws_lambda_function" "handler" {
  for_each = local.handlers

  function_name = "tad-marketplace-${each.key}"
  description   = "${each.value.method} ${each.value.path}"

  filename         = data.archive_file.lambda[each.key].output_path
  source_code_hash = data.archive_file.lambda[each.key].output_base64sha256

  runtime       = "nodejs20.x"
  architectures = ["arm64"]
  handler       = "index.handler"
  memory_size   = 256
  timeout       = each.value.timeout

  role = aws_iam_role.lambda_exec.arn

  environment {
    variables = local.lambda_environment
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}

resource "aws_lambda_permission" "apigw" {
  for_each = local.handlers

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.handler[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
