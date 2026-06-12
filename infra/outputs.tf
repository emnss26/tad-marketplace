output "frontend_url" {
  description = "Public URL of the marketplace frontend."
  value       = local.frontend_url
}

output "frontend_bucket" {
  description = "S3 bucket name for the static frontend (used by scripts/deploy-frontend.ps1)."
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution id (used for cache invalidations on deploy)."
  value       = aws_cloudfront_distribution.frontend.id
}

output "api_endpoint" {
  description = "Custom-domain base URL of the marketplace API."
  value       = local.api_url
}

output "api_gateway_default_endpoint" {
  description = "Raw API Gateway endpoint (handy while DNS propagates)."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "webhook_url" {
  description = "Register this URL as the PayPal LIVE webhook, then re-apply with -var paypal_webhook_id=..."
  value       = "${local.api_url}/webhooks/paypal"
}
