# API Gateway HTTP API (payload v2) + custom domain api.marketplace.tad.com.mx.
#
# CORS is handled at the API level so OPTIONS preflights never hit a Lambda.
# allow_credentials=true because the session JWT travels in an HttpOnly
# cookie scoped to .tad.com.mx (see SESSION_COOKIE_DOMAIN).

resource "aws_apigatewayv2_api" "api" {
  name          = "tad-marketplace-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins     = [local.frontend_url]
    allow_methods     = ["GET", "POST", "OPTIONS"]
    allow_headers     = ["content-type"]
    allow_credentials = true
    max_age           = 600
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  # Modest throttling: this is a low-volume transactional API; the cap
  # protects the AWS bill from abuse, not legitimate load.
  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 25
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  for_each = local.handlers

  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.handler[each.key].invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "route" {
  for_each = local.handlers

  api_id    = aws_apigatewayv2_api.api.id
  route_key = "${each.value.method} ${each.value.path}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda[each.key].id}"
}

# ----- ACM certificate (regional endpoint; us-east-1 is our region anyway) --
# Same single-pass validation pattern as frontend.tf: single-domain cert,
# direct [0] index into domain_validation_options, no for_each.

resource "aws_acm_certificate" "api" {
  domain_name       = local.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "api_cert_validation" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = tolist(aws_acm_certificate.api.domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.api.domain_validation_options)[0].resource_record_type
  ttl     = 300
  records = [tolist(aws_acm_certificate.api.domain_validation_options)[0].resource_record_value]
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [aws_route53_record.api_cert_validation.fqdn]
}

# ----- Custom domain ---------------------------------------------------------

resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = local.api_domain

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = aws_apigatewayv2_stage.default.id
}

resource "aws_route53_record" "api_a" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_aaaa" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.api_domain
  type    = "AAAA"

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
