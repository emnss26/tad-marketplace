# infra/

Terraform module for the marketplace AWS footprint. Lands in **Sprint 1**.

Planned files:

- `main.tf` — provider, backend (S3+DynamoDB lock or Terraform Cloud, TBD), shared locals
- `variables.tf` — `aws_region`, `account_id`, `domain_root`, `marketplace_subdomain`
- `outputs.tf` — Lambda function ARNs, API Gateway endpoint, CloudFront distribution id, S3 bucket names
- `route53.tf` — `marketplace.tad.com.mx` zone record
- `acm.tf` — ACM cert for the subdomain (us-east-1 because CloudFront)
- `s3-frontend.tf` — static-site bucket for `frontend/out/`
- `s3-installers.tf` — private installer bucket `tad-installers`
- `cloudfront.tf` — distribution in front of the frontend bucket + cache rules
- `api-gateway.tf` — HTTP API + routes per handler
- `lambda.tf` — function definitions referencing `backend/dist/handlers/*`
- `ses.tf` — domain identity for `tad.com.mx`, MAIL FROM, DKIM
- `iam.tf` — Lambda execution role with the DynamoDB CRUD policy below

## Constraints

- AWS account `619943692501`, region `us-east-1`.
- Every resource MUST carry tag `Project=marketplace` (Cost Explorer breakdown).
- DO NOT create another AWS Budget — the account-wide one lives in
  `TAD_MCP_AWS/infra/budgets.tf` and alerts go to `taller.arq.dgtl@gmail.com`.
- DO NOT serve `/.well-known/mcp.json` from this distribution — that endpoint
  belongs to `TAD_MCP_AWS`.

## Reading existing infra

The five DynamoDB tables (`tad-mcp-aws-*`) already exist, owned by
`TAD_MCP_AWS/infra/dynamodb.tf`. Reference them with `data` blocks, never
`resource`:

```hcl
data "aws_dynamodb_table" "seats" {
  name = "tad-mcp-aws-seats"
}
```

## Lambda DynamoDB policy

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:Query",
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:DeleteItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:us-east-1:619943692501:table/tad-mcp-aws-*",
    "arn:aws:dynamodb:us-east-1:619943692501:table/tad-mcp-aws-*/index/*",
    "arn:aws:dynamodb:us-east-1:619943692501:table/tad-marketplace-*",
    "arn:aws:dynamodb:us-east-1:619943692501:table/tad-marketplace-*/index/*"
  ]
}
```
