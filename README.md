# tad-marketplace

Transactional site at `marketplace.tad.com.mx` — sells subscriptions to
TAD's products via Stripe Checkout, provisions per-PC seats, and lets
enterprise admins manage teammates.

This repo is one of three that make up the TAD stack:

- **`tad-marketplace`** (this repo) — checkout, dashboard, seat management.
- **`TAD_MCP_AWS`** — Revit MCP server on `mcp.tad.com.mx` (ECS Fargate).
- **`tad-landing`** — marketing site at `tad.com.mx`.

The marketplace and the MCP communicate exclusively through a shared
DynamoDB control plane (5 tables in account `619943692501`). The contract
is documented in `TAD_MCP_AWS/docs/CONTROL_PLANE.md` and mirrored locally
in `backend/types/control-plane.ts`.

## Quickstart

```bash
nvm use              # uses .nvmrc -> node 20
npm install
npm run lint
npm run typecheck
npm test
```

### Local end-to-end auth

```bash
cp .env.example .env.local
# edit .env.local: set JWT_SECRET (32+ chars), optional AWS_PROFILE

# Terminal A — backend dev server (Express on :8080)
npm run dev:backend

# Terminal B — Next.js (:3000)
npm run dev:frontend
```

`MAGIC_LINK_DEV_MODE=true` in `.env.local` makes the backend print the magic
link in Terminal A instead of sending email via SES, so the flow works without
SES production access. See `CLAUDE.md` > "Local development" for the full
walk-through.

## Stack

Next.js 15 (App Router, static export) + Tailwind on S3 + CloudFront,
Lambda + API Gateway HTTP API in TypeScript, DynamoDB on-demand, SES for
magic-link auth, Stripe Checkout + Customer Portal, Terraform for IaC.

TypeScript everywhere. No Python, Ruby, Go, or Java.

## Where to read more

- **`CLAUDE.md`** — full project rules, sprint roadmap, conventions, and the
  reference any AI agent should load before working in this repo.
- **`infra/README.md`** — Terraform layout and constraints.
- **`backend/types/control-plane.ts`** — DynamoDB schemas (local mirror of
  `TAD_MCP_AWS/docs/CONTROL_PLANE.md`).
