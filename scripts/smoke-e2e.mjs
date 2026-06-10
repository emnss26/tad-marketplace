#!/usr/bin/env node
// scripts/smoke-e2e.mjs
//
// End-to-end smoke test exercising the cross-repo contract between
// tad-marketplace and TAD_MCP_AWS. Runs against staging (Stripe test mode).
//
// Steps:
//   1. POST /auth/magic-link (marketplace) — captures the token via a test-mode
//      hook on the marketplace (bypasses SES in test env).
//   2. POST /auth/verify             -> session JWT.
//   3. POST /checkout/session        -> Stripe Checkout with test card 4242...
//   4. Poll until webhook creates tenant + license.
//   5. POST /seats/activate          -> plaintext token (stored ONCE in memory).
//   6. POST mcp.tad.com.mx/mcp with Authorization: Bearer + X-Client-Hostname
//      -> expect 200 with `levels_list` payload.
//   7. POST /seats/{id}/revoke.
//   8. Wait 5 min for MCP cache TTL to lapse.
//   9. Re-call MCP -> expect 401.
//
// Sprint 4 implements steps 1–6. Sprint 5 implements 7–9.
// See CLAUDE.md > "Test de integración cross-repo".

console.warn('smoke-e2e is a stub — see CLAUDE.md "Test de integración cross-repo".');
process.exit(0);
