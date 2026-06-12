# infra/ — production runbook

Terraform (>= 1.6, AWS provider ~> 5.60) for the full marketplace footprint:

| File | What it creates |
|---|---|
| `versions.tf` | provider pins (aws, archive, random) |
| `main.tf` | provider with `default_tags Project=marketplace`, Route 53 zone data source |
| `variables.tf` | secrets (TF_VAR_*) + table-name/config defaults |
| `dynamodb.tf` | the 2 marketplace-only tables (imported, see below) |
| `frontend.tf` | private S3 + CloudFront (OAC) + ACM + `marketplace.tad.com.mx` alias |
| `api.tf` | API Gateway HTTP API + CORS + ACM + `api.marketplace.tad.com.mx` |
| `lambda.tf` | 14 Lambdas (one per handler) driven by a single `local.handlers` map |
| `iam.tf` | one execution role: DynamoDB CRUD (CLAUDE.md block), SES, S3, secrets |
| `secrets.tf` | `marketplace/jwt-secret` + `marketplace/paypal` in Secrets Manager |
| `outputs.tf` | bucket, distribution id, API URL, webhook URL |

Constraints honored (CLAUDE.md rules of gold):

- Everything tagged `Project=marketplace` via provider `default_tags`. No AWS
  Budget here — the account-wide one lives in `TAD_MCP_AWS/infra/budgets.tf`.
- The 5 `tad-mcp-aws-*` DynamoDB tables are owned by TAD_MCP_AWS's Terraform
  and are referenced by name/ARN pattern only — never as resources.
- The hosted zone `tad.com.mx` (Z00020122KOXU97RPLOL6) is a data source; this
  module only adds records to it.
- Nothing serves `/.well-known/mcp.json`.

## Route table (mirror of `backend/scripts/dev-server.ts`)

| Route | Lambda | Timeout |
|---|---|---|
| `POST /auth/magic-link` | tad-marketplace-auth-magic-link | 15s |
| `POST /auth/verify` | tad-marketplace-auth-verify | 15s |
| `POST /auth/logout` | tad-marketplace-auth-logout | 15s |
| `GET /me` | tad-marketplace-me | 15s |
| `GET /me/licenses` | tad-marketplace-me-licenses | 15s |
| `GET /me/seats` | tad-marketplace-me-seats | 15s |
| `POST /checkout/session` | tad-marketplace-checkout-session | 30s |
| `POST /checkout/confirm` | tad-marketplace-checkout-confirm | 30s |
| `GET /installers/{product_id}/download` | tad-marketplace-installer-download | 15s |
| `POST /seats/activate` | tad-marketplace-seat-activate | 15s |
| `POST /seats/{seat_id}/revoke` | tad-marketplace-seat-revoke | 15s |
| `POST /team/invite` | tad-marketplace-team-invite | 15s |
| `POST /licenses/{license_id}/cancel` | tad-marketplace-license-cancel | 15s |
| `POST /webhooks/paypal` | tad-marketplace-webhook-paypal | 30s |

`backend/handlers/webhook-stripe.ts` exists but is intentionally NOT deployed
(Stripe is deferred; PayPal is the live provider).

## 0. Prerequisites

- AWS CLI authenticated against account `619943692501`, region `us-east-1`.
- Terraform >= 1.6 on PATH.
- Node 20 (`nvm use`) with workspaces installed (`npm install`).
- **esbuild**: currently resolvable from the root `node_modules` as a
  transitive dependency (tsx/vitest pull esbuild 0.28). To make the build
  script's dependency explicit and survive future dependency churn, pin it:

  ```powershell
  npm i -D esbuild
  ```

- Export the secret variables (PowerShell). These go into Secrets Manager AND
  the Lambda environment. They also end up in `terraform.tfstate` — state is
  **local and gitignored**; never commit it, never move it to a shared bucket
  without encryption.

  ```powershell
  $env:TF_VAR_jwt_secret          = "<32+ char random string>"   # node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
  $env:TF_VAR_paypal_client_id    = "<live client id>"
  $env:TF_VAR_paypal_client_secret = "<live client secret>"
  # TF_VAR_paypal_webhook_id stays UNSET on the first apply (defaults to "").
  ```

- Frontend export mode: `frontend/next.config.mjs` already has
  `output: 'export'` → `npm run build` produces `frontend/out/`. No action
  needed; if that line is ever removed, the deploy script will fail at the
  `Test-Path out` check.

## 1. Build the Lambda bundles

```powershell
npm run build:lambdas
```

Bundles each `backend/handlers/<name>.ts` to `build/lambdas/<name>/index.mjs`
(esbuild, ESM, node20, `@aws-sdk/*` external). Terraform zips these dirs —
**re-run this before every apply that should pick up code changes**.

## 2. Init + import the existing tables

The two marketplace tables were created out-of-band by
`scripts/setup-tables.ps1`, so adopt them instead of recreating:

```powershell
cd infra
terraform init
terraform import aws_dynamodb_table.users tad-marketplace-users
terraform import aws_dynamodb_table.auth_tokens tad-marketplace-auth-tokens
```

After import, `terraform plan` should show no destructive change on either
table (TTL on `ttl_epoch` is already enabled live and declared in the
resource; tags may show an in-place addition — that is fine).

## 3. Plan + apply (single pass)

```powershell
terraform plan
terraform apply
```

Both ACM certs validate inside the same apply: each cert is single-domain, so
the validation record references
`tolist(...domain_validation_options)[0]` directly — no `for_each` over
unknown keys (that pattern fails on first apply; lesson learned on the
TAD_MCP_AWS deploy). Expect ~5–15 min for CloudFront + cert issuance.

## 4. Deploy the frontend

```powershell
pwsh ./scripts/deploy-frontend.ps1
```

What it does: builds the static export with
`NEXT_PUBLIC_API_URL=https://api.marketplace.tad.com.mx` (build-time inlined
by `frontend/lib/api.ts` — a runtime env var has no effect on a static
export), syncs assets with `max-age=31536000,immutable`, HTML/txt with
`no-cache`, then invalidates `/*`.

## 5. Post-apply: register the PayPal LIVE webhook

1. Grab the URL: `terraform output webhook_url` →
   `https://api.marketplace.tad.com.mx/webhooks/paypal`.
2. PayPal Dashboard (LIVE) → Apps & Credentials → your live app → Webhooks →
   Add webhook with that URL, subscribed to these **7 event types** (the set
   `backend/handlers/webhook-paypal.ts` handles):
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.RE-ACTIVATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
   - `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
   - `PAYMENT.SALE.COMPLETED`
3. Copy the Webhook ID PayPal assigns and re-apply so signature verification
   activates:

   ```powershell
   $env:TF_VAR_paypal_webhook_id = "<webhook id>"
   terraform apply
   ```

## 6. Smoke checklist (production)

1. `https://marketplace.tad.com.mx` loads; `/login` and `/login/` both render
   (CloudFront Function rewrite).
2. Sign up with a real address → magic-link email arrives via SES (SES must be
   out of sandbox, or the recipient verified).
3. Open the link → `/verify` → lands on `/dashboard` with the session cookie
   set (`Domain=.tad.com.mx; Secure; HttpOnly`).
4. Buy the Personal plan LIVE with your own card → PayPal approval →
   `/checkout/confirm` → license appears on the dashboard →
   `BILLING.SUBSCRIPTION.ACTIVATED` lands on the webhook (CloudWatch logs of
   `tad-marketplace-webhook-paypal`).
5. Download the installer (15-min signed URL) and activate a seat.
6. Refund/cancel the test purchase in PayPal; webhook flips the license, and
   the MCP rejects the seat within ~5 min (auth cache TTL).

## Cookie note (FE ↔ API across subdomains)

The session JWT lives in an HttpOnly cookie issued by `/auth/verify` with
`Domain=.tad.com.mx` (`SESSION_COOKIE_DOMAIN` Lambda env var) and the
`Secure` flag on. That domain scope is what lets the cookie set by
`api.marketplace.tad.com.mx` ride along on `fetch(..., credentials:
'include')` calls from `marketplace.tad.com.mx`. CORS on the HTTP API
mirrors this: `allow_origins=["https://marketplace.tad.com.mx"]`,
`allow_credentials=true`.

## Gotchas

- `npm run build:lambdas` must run before `terraform plan` — `archive_file`
  errors out if `build/lambdas/` is missing.
- Secrets Manager keeps deleted secrets in a 30-day recovery window. If
  `marketplace/jwt-secret` or `marketplace/paypal` were ever created and
  deleted before, the apply fails with "scheduled for deletion" — restore or
  force-delete (`aws secretsmanager delete-secret --force-delete-without-recovery`)
  first.
- The installer bucket `tad-installers` is NOT managed here (created by
  `scripts/setup-installer-bucket.ps1`); iam.tf only grants `s3:GetObject` on
  its objects.
- SES domain identity for `tad.com.mx` is assumed verified already (it sends
  from `noreply@tad.com.mx`). If not, verify the domain + DKIM in SES before
  the smoke test.
- Lambda env contains the secrets (the code reads `process.env` directly
  today). When the handlers migrate to fetching from Secrets Manager at cold
  start, drop them from `local.lambda_environment` in `lambda.tf`.
