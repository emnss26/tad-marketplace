#!/usr/bin/env node
// scripts/seed-products-paypal.mjs
//
// Seeds the 3 TAD products and 9 monthly Plans into PayPal (sandbox or live).
// Idempotent: tracks already-created PayPal IDs in `out/paypal-ids.json` and
// skips them on re-runs. Safe to re-run after adding a new tier or product.
//
// Usage:
//   # Make sure .env.local has PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET set.
//   node scripts/seed-products-paypal.mjs
//
// Sprint 3 deliverable. See CLAUDE.md.

import { config as dotenvConfig } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

dotenvConfig({ path: resolve(process.cwd(), '.env.local') });

const ENV = process.env.PAYPAL_ENV ?? 'sandbox';
const BASE_URL =
  ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env.local.',
  );
  console.error(
    'Get them at https://developer.paypal.com → Apps & Credentials → Sandbox → Create App.',
  );
  process.exit(1);
}

const PRODUCTS = [
  {
    product_id: 'prd_revit_mcp',
    name: 'TAD MCP for Revit',
    description:
      'Remote MCP server exposing Autodesk Revit actions to Claude and other MCP clients.',
    tiers: { personal: 8900, smb: 41900, enterprise: 99900 },
  },
  {
    product_id: 'prd_acad_mcp',
    name: 'TAD MCP for AutoCAD',
    description: 'Same Bearer-token + hostname model wrapping AutoCAD.',
    tiers: { personal: 8900, smb: 41900, enterprise: 99900 },
  },
  {
    product_id: 'prd_platform',
    name: 'TAD Platform',
    description: 'BIM coordination, project tracking, AEC data model, and AI features.',
    tiers: { personal: 8900, smb: 41900, enterprise: 99900 },
  },
];

const PLAN_LABELS = { personal: 'Personal', smb: 'SMB', enterprise: 'Enterprise' };

const OUT_DIR = resolve(process.cwd(), 'out');
const OUT_PATH = resolve(OUT_DIR, 'paypal-ids.json');

function loadExisting() {
  if (!existsSync(OUT_PATH)) return { env: ENV, products: {}, plans: {} };
  try {
    const data = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
    if (data.env !== ENV) {
      console.warn(
        `Warning: ${OUT_PATH} was generated for env="${data.env}" but PAYPAL_ENV="${ENV}". Starting fresh.`,
      );
      return { env: ENV, products: {}, plans: {} };
    }
    return data;
  } catch {
    return { env: ENV, products: {}, plans: {} };
  }
}

function saveOut(data) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(data, null, 2));
}

async function getAccessToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`OAuth failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function paypalFetch(token, path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PayPal ${path} failed: ${res.status} ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  console.log(`Seeding PayPal (${ENV}) at ${BASE_URL}`);
  const token = await getAccessToken();
  const state = loadExisting();

  for (const product of PRODUCTS) {
    let paypalProductId = state.products[product.product_id];
    if (paypalProductId) {
      console.log(`SKIP product ${product.product_id} → ${paypalProductId}`);
    } else {
      const created = await paypalFetch(token, '/v1/catalogs/products', {
        method: 'POST',
        body: JSON.stringify({
          name: product.name,
          description: product.description,
          type: 'SERVICE',
          category: 'SOFTWARE',
        }),
      });
      paypalProductId = created.id;
      state.products[product.product_id] = paypalProductId;
      saveOut(state);
      console.log(`CREATE product ${product.product_id} → ${paypalProductId}`);
    }

    for (const [tier, cents] of Object.entries(product.tiers)) {
      const planKey = `${product.product_id}:${tier}`;
      if (state.plans[planKey]) {
        console.log(`  SKIP plan ${planKey} → ${state.plans[planKey]}`);
        continue;
      }
      const created = await paypalFetch(token, '/v1/billing/plans', {
        method: 'POST',
        body: JSON.stringify({
          product_id: paypalProductId,
          name: `${product.name} – ${PLAN_LABELS[tier]}`,
          description: `Monthly subscription, ${PLAN_LABELS[tier]} tier ($${(
            cents / 100
          ).toFixed(2)} USD/mo).`,
          status: 'ACTIVE',
          billing_cycles: [
            {
              frequency: { interval_unit: 'MONTH', interval_count: 1 },
              tenure_type: 'REGULAR',
              sequence: 1,
              total_cycles: 0,
              pricing_scheme: {
                fixed_price: {
                  value: (cents / 100).toFixed(2),
                  currency_code: 'USD',
                },
              },
            },
          ],
          payment_preferences: {
            auto_bill_outstanding: true,
            setup_fee_failure_action: 'CONTINUE',
            payment_failure_threshold: 3,
          },
        }),
      });
      state.plans[planKey] = created.id;
      saveOut(state);
      console.log(`  CREATE plan ${planKey} → ${created.id}`);
    }
  }

  console.log(`\nDone. IDs at ${OUT_PATH}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
