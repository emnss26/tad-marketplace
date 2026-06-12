# Frontend: private S3 bucket + CloudFront (OAC) + ACM + Route 53 alias.
#
# The frontend is a Next.js 15 STATIC EXPORT (frontend/out): multi-page HTML
# (/login/index.html, /dashboard/index.html, ...). A CloudFront Function
# rewrites extensionless URIs ("/login", "/login/") to the matching
# index.html. Deploys are done by scripts/deploy-frontend.ps1 which uploads
# HTML with no-cache headers and invalidates, so the default cache policy
# stays CachingOptimized (same pattern as tad-landing).

# ----- bucket -------------------------------------------------------------

resource "random_id" "frontend_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "frontend" {
  bucket = "tad-marketplace-fe-${random_id.frontend_suffix.hex}"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Only the CloudFront distribution may read objects (OAC + SourceArn condition).
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontOAC"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

# ----- ACM certificate (single-domain, single-pass validation) -------------
# Pattern note: NO for_each over domain_validation_options — that fails with
# unknown keys on the first apply. Single-domain cert => index [0] directly.

resource "aws_acm_certificate" "frontend" {
  domain_name       = local.frontend_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "frontend_cert_validation" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = tolist(aws_acm_certificate.frontend.domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.frontend.domain_validation_options)[0].resource_record_type
  ttl     = 300
  records = [tolist(aws_acm_certificate.frontend.domain_validation_options)[0].resource_record_value]
}

resource "aws_acm_certificate_validation" "frontend" {
  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [aws_route53_record.frontend_cert_validation.fqdn]
}

# ----- CloudFront ----------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "tad-marketplace-frontend-oac"
  description                       = "OAC for the marketplace frontend bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Rewrites extensionless URIs to the static-export layout:
#   "/login"  -> "/login/index.html"
#   "/login/" -> "/login/index.html"
#   "/"       -> "/index.html"
# URIs whose last segment contains a dot (real files) pass through untouched.
resource "aws_cloudfront_function" "rewrite_index" {
  name    = "tad-marketplace-rewrite-index"
  runtime = "cloudfront-js-2.0"
  comment = "Append index.html to extensionless URIs (Next.js static export)"
  publish = true

  code = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri.endsWith('/')) {
        request.uri = uri + 'index.html';
      } else {
        var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
        if (lastSegment.indexOf('.') === -1) {
          request.uri = uri + '/index.html';
        }
      }
      return request;
    }
  EOT
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "tad-marketplace frontend (${local.frontend_domain})"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [local.frontend_domain]

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrite_index.arn
    }
  }

  # With OAC and no s3:ListBucket, S3 answers 403 for missing keys; map both
  # 403 and 404 to the static-export 404 page.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.frontend.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ----- DNS -----------------------------------------------------------------

resource "aws_route53_record" "frontend_a" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.frontend_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "frontend_aaaa" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.frontend_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
