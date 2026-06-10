#!/usr/bin/env node
// scripts/seed-products.mjs
//
// Seeds the three TAD products into Stripe AND into the DynamoDB `tad-mcp-aws-products`
// table. Idempotent: looks up Stripe products by `metadata.product_id` before
// creating. Re-running is safe and will pick up new tiers or price changes.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... \
//   AWS_PROFILE=tad \
//   AWS_REGION=us-east-1 \
//   node scripts/seed-products.mjs
//
// Sprint 3 deliverable. See CLAUDE.md.

const products = [
  {
    product_id: 'prd_revit_mcp',
    name: 'TAD MCP for Revit',
    description:
      'Remote MCP server exposing Autodesk Revit actions to Claude and other MCP clients.',
    status: 'live',
    documentation_url: 'https://docs.tad.com.mx/mcp/revit',
    tier_prices_usd_cents: { personal: 2000, smb: 3900, enterprise: 4900 },
  },
  {
    product_id: 'prd_acad_mcp',
    name: 'TAD MCP for AutoCAD',
    description: 'Same model for AutoCAD. Coming soon.',
    status: 'coming_soon',
    documentation_url: 'https://docs.tad.com.mx/mcp/autocad',
    tier_prices_usd_cents: { personal: 2000, smb: 3900, enterprise: 4900 },
  },
  {
    product_id: 'prd_platform',
    name: 'TAD Platform',
    description: 'Project management and BIM coordination platform.',
    status: 'live',
    documentation_url: 'https://docs.tad.com.mx/platform',
    tier_prices_usd_cents: { personal: 2000, smb: 3900, enterprise: 4900 },
  },
];

async function main() {
  console.warn('seed-products is a stub — Sprint 3 deliverable.');
  console.warn(`Planned: seed ${products.length} products into Stripe + DynamoDB.`);
  for (const p of products) {
    console.warn(`  - ${p.product_id} (${p.status})`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
