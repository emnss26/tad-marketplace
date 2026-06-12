# Provider + shared data sources.
#
# Every resource in this module is tagged Project=marketplace via
# default_tags (rule of gold #5 — Cost Explorer breaks costs down by this
# tag instead of a separate AWS Budget).

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project = "marketplace"
    }
  }
}

data "aws_caller_identity" "current" {}

# Hosted zone for tad.com.mx already exists in Route 53 (created out-of-band).
# We only add RECORDS to it — never create or destroy the zone itself.
data "aws_route53_zone" "root" {
  zone_id = "Z00020122KOXU97RPLOL6"
}

locals {
  account_id = data.aws_caller_identity.current.account_id

  frontend_domain = "marketplace.tad.com.mx"
  api_domain      = "api.marketplace.tad.com.mx"

  frontend_url = "https://${local.frontend_domain}"
  api_url      = "https://${local.api_domain}"
}
