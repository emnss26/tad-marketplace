#!/usr/bin/env node
// scripts/update-plan-prices.mjs
//
// Updates the pricing scheme of every PayPal billing Plan listed in
// `out/paypal-ids.json` to the prices in PRICES below. Plan IDs are preserved,
// so `backend/shared/catalog.ts` does not need to change after a price update.
//
// PayPal rule: update-pricing-schemes only affects NEW subscriptions; existing
// subscribers keep their old price unless migrated. With 0 active
// subscriptions this is a no-op concern.
//
// Usage:
//   # .env.local must point at the SAME env the ids file was generated for
//   # (PAYPAL_ENV + PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET).
//   node scripts/update-plan-prices.mjs

import { config as dotenvConfig } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

dotenvConfig({ path: resolve(process.cwd(), '.env.local') });

const ENV = process.env.PAYPAL_ENV ?? 'sandbox';
const BASE_URL =
  ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

/** USD per month, per tier. Keep in sync with scripts/seed-products-paypal.mjs,
 * backend/shared/catalog.ts and frontend/lib/products.ts. */
const PRICES = {
  personal: '89.00',
  smb: '419.00',
  enterprise: '999.00', // internal anchor; sold via "Contact sales", not self-serve
};

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env.local.');
  process.exit(1);
}

const IDS_PATH = resolve(process.cwd(), 'out', 'paypal-ids.json');
if (!existsSync(IDS_PATH)) {
  console.error(`${IDS_PATH} not found. Run seed-products-paypal.mjs first.`);
  process.exit(1);
}
const state = JSON.parse(readFileSync(IDS_PATH, 'utf8'));
if (state.env !== ENV) {
  console.error(
    `out/paypal-ids.json was generated for env="${state.env}" but PAYPAL_ENV="${ENV}". Aborting.`,
  );
  process.exit(1);
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
  if (!res.ok) throw new Error(`OAuth failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function main() {
  console.log(`Updating plan prices on PayPal (${ENV}) at ${BASE_URL}`);
  const token = await getAccessToken();

  for (const [planKey, planId] of Object.entries(state.plans)) {
    const tier = planKey.split(':')[1];
    const price = PRICES[tier];
    if (!price) {
      console.warn(`SKIP ${planKey} → no price configured for tier "${tier}"`);
      continue;
    }
    const res = await fetch(
      `${BASE_URL}/v1/billing/plans/${planId}/update-pricing-schemes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pricing_schemes: [
            {
              billing_cycle_sequence: 1,
              pricing_scheme: {
                fixed_price: { value: price, currency_code: 'USD' },
              },
            },
          ],
        }),
      },
    );
    if (res.status === 204) {
      console.log(`OK   ${planKey} (${planId}) → $${price}/mo`);
    } else {
      console.error(`FAIL ${planKey} (${planId}): ${res.status} ${await res.text()}`);
      process.exitCode = 1;
    }
  }
  console.log('\nDone. Verify in PayPal Dashboard → Subscriptions → Subscription plans.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
