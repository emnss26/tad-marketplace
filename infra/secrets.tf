# Secrets Manager: durable store for the app secrets.
#
# Today the Lambda code reads process.env directly (no cold-start fetch), so
# the same values are ALSO injected into the Lambda environment (lambda.tf).
# These secrets exist as the rotation-friendly source of truth: when the code
# migrates to fetching at cold start, only iam.tf already grants access.
#
# Values arrive via TF_VAR_* (sensitive variables) and therefore live in the
# Terraform state — state is local and gitignored; never commit it.

resource "aws_secretsmanager_secret" "jwt" {
  name        = "marketplace/jwt-secret"
  description = "HS256 secret for marketplace session JWTs. Rotate every 90 days."
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = var.jwt_secret
}

resource "aws_secretsmanager_secret" "paypal" {
  name        = "marketplace/paypal"
  description = "PayPal REST credentials (live) for checkout + webhook verification."
}

resource "aws_secretsmanager_secret_version" "paypal" {
  secret_id = aws_secretsmanager_secret.paypal.id
  secret_string = jsonencode({
    client_id     = var.paypal_client_id
    client_secret = var.paypal_client_secret
    webhook_id    = var.paypal_webhook_id
  })
}
