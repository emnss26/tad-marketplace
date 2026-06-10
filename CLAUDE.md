# CLAUDE.md — tad-marketplace

Reference for any AI agent (or human) working in this repo. Keep this file
up to date; it is the source of truth for project rules.

## Mission

`marketplace.tad.com.mx` — the transactional site that sells subscriptions
to TAD's three products via Stripe Checkout, provisions per-PC seats, and
lets enterprise admins manage teammates.

TAD (Taller de Arquitectura y Diseño) is operated by Enrique Meneses as a
persona física under Mexico's RESICO tax regime. Three products:

1. **TAD MCP for Revit** (`prd_revit_mcp`) — production. Lives in
   `TAD_MCP_AWS` (separate repo), deployed at `mcp.tad.com.mx` on ECS Fargate.
2. **TAD MCP for AutoCAD** (`prd_acad_mcp`) — coming soon.
3. **TAD Platform** (`prd_platform`) — web app at `platform.tad.com.mx` (EC2).

This repo writes to a DynamoDB control plane that the MCP reads on every
request. The contract between the two systems is the DynamoDB schema, not
a service-to-service API. See `TAD_MCP_AWS/docs/CONTROL_PLANE.md`.

## Rules of gold (non-negotiable)

1. **Do not touch `TAD_MCP_AWS` or `tad-landing` from this repo.** Cross-repo
   changes go through their own PRs. Coupling is via DynamoDB ARNs and
   schemas, not direct code references.
2. **DynamoDB item types live in `@tad/shared-types`** once that package
   exists. Until then, the local mirror at `backend/types/control-plane.ts`
   is authoritative for this repo. Forward-additive only; rename/remove
   requires a migration Lambda and bumps across all consumers.
3. **Stripe products live as code** (`scripts/seed-products.mjs`), not in
   the Stripe Dashboard. Re-running the seed must be idempotent.
4. **Everything in English** — code, comments, UI, emails.
5. **Do not create another AWS Budget.** The account-wide one lives in
   `TAD_MCP_AWS/infra/budgets.tf` at $35/$50, alerts go to
   `taller.arq.dgtl@gmail.com`. This repo tags every resource
   `Project=marketplace` instead.
6. **Do not serve `/.well-known/mcp.json`** — that endpoint belongs to
   `TAD_MCP_AWS`.
7. **Never persist Bearer tokens in plaintext.** Only the SHA-256 hash goes
   to `seats.token_hash` (or `auth_tokens.token_hash`). Plaintext is shown
   to the user once at activation/email-send time and never again.

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router) + Tailwind 3, React 19 | Static export → S3 + CloudFront |
| Auth | Magic-link via AWS SES | No passwords, no OAuth |
| Backend | Lambda + API Gateway HTTP API, TypeScript | `tsx` for dev, esbuild for deploy bundles |
| DB | DynamoDB on-demand | 5 shared tables + 2 marketplace-only |
| Installer storage | S3 private + 15-min signed URLs | Bucket `tad-installers` |
| Payments | PayPal Subscriptions API (sandbox/live) | Stripe optional, deferred. PayPal Business account holds the TAD merchant identity. |
| IaC | Terraform >=1.6 | `infra/` |
| Lang | TypeScript everywhere | **Banned: Python, Ruby, Go, Java** |

AWS account `619943692501`, region `us-east-1`. Costs target <$5 USD/month
idle. Combined hard cap for marketplace+landing+platform is ~$25/mo.

## Repo layout

```
tad-marketplace/
├── frontend/                  Next.js 15 App Router
│   ├── app/                   Routes
│   ├── components/            Reusable UI (Sprint 3+)
│   └── lib/                   Pure utils, hooks
├── backend/                   Lambda handlers in TypeScript
│   ├── handlers/              One file per API route
│   ├── shared/                ddb, stripe, ses, tokens, auth
│   └── types/                 control-plane.ts (mirror of CONTROL_PLANE.md)
├── infra/                     Terraform (Sprint 1)
├── scripts/                   seed-products.mjs, smoke-e2e.mjs
├── test/                      Cross-repo e2e tests (Sprint 4+)
├── package.json               npm workspaces
├── tsconfig.base.json         Strict TS baseline
├── eslint.config.mjs          Flat config (ESLint 9 + typescript-eslint v8)
├── .prettierrc
└── .github/workflows/ci.yml   lint + typecheck + test on PR
```

## Sprint roadmap

- **Sprint 0** — scaffolding: workspaces, lint, typecheck, test, CI. ⚠️ NOW.
- **Sprint 1** — Terraform: subdomain, S3 buckets, CloudFront, ACM, Route53,
  SES domain verification, base API Gateway + Lambda execution role.
- **Sprint 2** — magic-link auth: `auth-magic-link` + `auth-verify` Lambdas
  (backend implemented), `tad-marketplace-users` + `tad-marketplace-auth-tokens`
  tables (created out-of-band via `scripts/setup-tables.ps1` until Sprint 1
  Terraform manages them), `/login` and `/verify` pages (pending — should mirror
  `tad-landing` design tokens).
- **Sprint 3** — catalogue + PayPal Subscriptions: `seed-products-paypal.mjs`
  creates 3 Products + 9 monthly Plans in PayPal. `backend/shared/paypal.ts` is
  the typed wrapper (OAuth + Catalog + Subscriptions + verify-webhook).
  `checkout-session` creates a Subscription and returns the PayPal approval
  URL. `webhook-paypal` verifies the signature via
  `/v1/notifications/verify-webhook-signature` and, on
  `BILLING.SUBSCRIPTION.ACTIVATED`, creates `tenant` + `license` with
  `subscription_provider='paypal'`. Frontend `/checkout` page hosts the PayPal
  JS SDK Buttons.
- **Sprint 4** — dashboard + installer + seat activation: `/dashboard`
  fetches `/me/licenses` (done) and shows per-license cards with status, next
  billing, "Download installer". `installer-download` handler signs a 15-min
  S3 URL on `tad-installers` (bucket created via
  `scripts/setup-installer-bucket.ps1`) gated by active license + HeadObject
  existence check, with `ResponseContentDisposition` so the browser saves the
  file with `TAD-MCP-Revit-Setup.msi`. `seat-activate` and seat-token shown
  once still pending (next half of Sprint 4).
- **Sprint 5** — multi-seat for companies: `/dashboard/seats`, `team-invite`,
  `seat-revoke`.
- **Sprint 6** — polish: Customer Portal redirect, admin metrics, frontend
  error reporting, full e2e tests.

Cross-repo integration test at the end of Sprint 4 (see "Test de integración
cross-repo" in the kickoff brief): signup → buy → activate → call MCP → revoke
→ wait 5 min → expect 401.

## DynamoDB tables

**Shared with `TAD_MCP_AWS`** (already created by
`TAD_MCP_AWS/infra/dynamodb.tf`, never recreated here):

| Table | PK / SK | GSI | Owner of writes |
|---|---|---|---|
| `tad-mcp-aws-tenants` | `tenant_id` | — | marketplace |
| `tad-mcp-aws-licenses` | `tenant_id` / `license_id` | `product_idx` | marketplace |
| `tad-mcp-aws-seats` | `seat_id` | `token_hash_idx` (projection ALL) | marketplace creates; MCP updates `last_seen_at` + `revit_versions_seen` |
| `tad-mcp-aws-usage-events` | `tenant_id_month` / `ts_event_id` | — (TTL on `ttl_epoch`, 90 days) | MCP writes; marketplace reads |
| `tad-mcp-aws-products` | `product_id` | — | marketplace |

**Marketplace-only** (this repo creates them in `infra/`):

| Table | PK | Notes |
|---|---|---|
| `tad-marketplace-users` | `email` | attrs: user_id, tenants_owned[], tenants_member_of[] |
| `tad-marketplace-auth-tokens` | `token_hash` | 15-min TTL on `ttl_epoch`, single-use |

Full schema reference: `backend/types/control-plane.ts` (mirror) and
`TAD_MCP_AWS/docs/CONTROL_PLANE.md` (canonical).

## Env vars

Set in Lambda environment via Terraform. Secrets pulled from AWS Secrets
Manager at cold start.

| Var | Source | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Secrets Manager | `sk_live_...` in prod, `sk_test_...` in staging |
| `STRIPE_WEBHOOK_SECRET` | Secrets Manager | per-endpoint signing secret |
| `JWT_SECRET` | Secrets Manager | rotated every 90 days |
| `SES_FROM_ADDRESS` | env | `noreply@tad.com.mx` |
| `DDB_TABLE_TENANTS` | env | `tad-mcp-aws-tenants` |
| `DDB_TABLE_LICENSES` | env | `tad-mcp-aws-licenses` |
| `DDB_TABLE_SEATS` | env | `tad-mcp-aws-seats` |
| `DDB_TABLE_USAGE` | env | `tad-mcp-aws-usage-events` |
| `DDB_TABLE_PRODUCTS` | env | `tad-mcp-aws-products` |
| `DDB_TABLE_USERS` | env | `tad-marketplace-users` |
| `DDB_TABLE_AUTH_TOKENS` | env | `tad-marketplace-auth-tokens` |
| `INSTALLER_BUCKET` | env | `tad-installers` |
| `FRONTEND_URL` | env | `https://marketplace.tad.com.mx` (`http://localhost:3000` in dev) |
| `SESSION_COOKIE_DOMAIN` | env (optional) | `.tad.com.mx` when FE and API live on different subdomains; omit for host-only |
| `MAGIC_LINK_DEV_MODE` | env (optional) | `true` logs the magic-link to stdout instead of calling SES — useful while SES is in sandbox |

## IAM (Lambda execution role)

Full CRUD on every table in the control plane plus marketplace-only tables:

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

Plus the usual SES send, S3 GetObject on the installer bucket, Secrets
Manager GetSecretValue on the three secrets above. Specifics land in
`infra/iam.tf` during Sprint 1.

## Auth flow

Magic-link sign-in, then session JWT (7-day TTL). Seat tokens are separate:
a 32-byte random plaintext, base64url-encoded, hashed SHA-256 and stored in
`seats.token_hash`. The plaintext is shown to the user exactly once.

When Claude Desktop calls the MCP it sends:

```
Authorization: Bearer <plaintext>
X-Client-Hostname: <hostname>
```

The MCP hashes, queries `seats` by GSI, validates case-insensitive hostname
match and the owning tenant's `billing.status=active`. Result cached in
process memory for 5 minutes. Subscription cancellation in Stripe propagates
to MCP within ~5 min as the cache TTLs out (no explicit invalidation endpoint
in v1).

## Conventions

- TypeScript strict everywhere. `noUncheckedIndexedAccess: true`.
- Import paths from local types: `import type { Seat } from '../types/control-plane.js'`.
- Handler signature: `APIGatewayProxyHandlerV2` from `aws-lambda`. Return JSON
  with explicit `Content-Type` header.
- All times in DynamoDB are unix seconds (numbers).
- All IDs use ulid + prefix: `tnt_`, `lic_`, `seat_`, `prd_`.
- Tag every AWS resource `Project=marketplace`. Cost Explorer uses this.
- Stripe events are processed idempotently keyed by `event.id`.

## Local development

```bash
nvm use            # node 20
npm install        # installs all workspaces
npm run lint
npm run typecheck
npm test
npm run build      # builds frontend static export to frontend/out
```

### End-to-end auth in two terminals

1. Copy `.env.example` → `.env.local` at the repo root and set at minimum
   `JWT_SECRET` (32+ chars) and your AWS profile.
2. Make sure the two marketplace tables exist (`pwsh ./scripts/setup-tables.ps1`
   or the inline AWS CLI commands in chat history).

Terminal A — backend dev server (Express on `:8080` impersonating API Gateway):

```bash
npm run dev:backend
```

Terminal B — Next.js dev server (`:3000`):

```bash
npm run dev:frontend
```

Visit `http://localhost:3000/login`, submit your email. With
`MAGIC_LINK_DEV_MODE=true` the backend logs the magic link in Terminal A
instead of calling SES. Open the link → `/verify` consumes the token, the
dev-server returns a Set-Cookie with the session JWT (the `Secure` flag is
dropped because `SESSION_COOKIE_INSECURE=true` is set in `.env.local`), and
the FE redirects to `/dashboard`.

To inspect the persisted state:
- `aws dynamodb scan --table-name tad-marketplace-users --region us-east-1`
- `aws dynamodb scan --table-name tad-marketplace-auth-tokens --region us-east-1`

## What lives elsewhere

- `TAD_MCP_AWS` — Revit MCP server, ECS Fargate, DynamoDB tables, account-wide
  AWS Budget. Read `docs/CONTROL_PLANE.md` there for the schema.
- `tad-landing` — public marketing site at `tad.com.mx`. Static.
- `@tad/shared-types` — TS-only NPM package on GitHub Packages (private).
  **Does not exist yet** as of 2026-06-08; create when types stabilize.

## Open questions / TODOs

- Publish `@tad/shared-types` (separate repo) and migrate
  `backend/types/control-plane.ts` to consume it. Until then both repos
  mirror the schema locally.
- Decide whether to add `tad-marketplace-users` and
  `tad-marketplace-auth-tokens` to `TAD_MCP_AWS/docs/CONTROL_PLANE.md` with
  a note "MCP has no access" for full-account visibility.
- Sprint 6: pick Sentry vs. CloudWatch RUM for frontend error reporting.
