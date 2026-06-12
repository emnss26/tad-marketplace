import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { readSessionCookie, verifySessionJwt } from '../shared/auth.js';
import { getProduct, getTier } from '../shared/catalog.js';
import { isAllowedOrigin, json, parseJsonBody } from '../shared/http.js';
import { createPayPalSubscription } from '../shared/paypal.js';
import { getUserByEmail } from '../shared/users.js';
import { PLANS, PRODUCT_IDS } from '../types/control-plane.js';
import type { Plan, ProductId } from '../types/control-plane.js';

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
const BRAND_NAME = 'TAD Marketplace';

interface RequestBody {
  product_id?: string;
  plan?: string;
}

/**
 * POST /checkout/session
 *
 * Auth-gated. Creates a PayPal Subscription for the requested (product, plan)
 * combo with the user's email as subscriber and `user_id` as custom_id (echoed
 * back on every webhook event for correlation).
 *
 * Returns the PayPal **approval URL** — the frontend redirects the browser
 * there so the user can authenticate on PayPal and approve the subscription.
 * After approval, PayPal sends them back to `/checkout/success` with
 * `?subscription_id=I-XXX` which our `/checkout/confirm` then materializes
 * into `tenant` + `license` rows.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!isAllowedOrigin(event)) return json(403, { error: 'origin_not_allowed' });

  // Auth
  const jwt = readSessionCookie(event.cookies);
  if (jwt === null) return json(401, { error: 'no_session' });

  let claims;
  try {
    claims = await verifySessionJwt(jwt);
  } catch {
    return json(401, { error: 'invalid_session' });
  }

  // Body
  let body: RequestBody;
  try {
    body = parseJsonBody<RequestBody>(event);
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  if (!isProductId(body.product_id) || !isPlan(body.plan)) {
    return json(400, { error: 'invalid_product_or_plan' });
  }

  // Sales-led products and the enterprise tier are not self-serve: the FE
  // shows "Contact sales" for them, but guard here too in case of direct
  // API calls.
  if (getProduct(body.product_id).purchase === 'quote') {
    return json(400, { error: 'quote_only_product' });
  }
  if (body.plan === 'enterprise') {
    return json(400, { error: 'quote_only_plan' });
  }

  // Look up PayPal plan id
  let tier;
  try {
    tier = getTier(body.product_id, body.plan);
  } catch {
    return json(400, { error: 'invalid_product_or_plan' });
  }

  const user = await getUserByEmail(claims.email);
  if (!user) return json(401, { error: 'user_not_found' });

  const subscription = await createPayPalSubscription({
    planId: tier.paypal_plan_id,
    brandName: BRAND_NAME,
    returnUrl: `${FRONTEND_URL}/checkout/success`,
    cancelUrl: `${FRONTEND_URL}/checkout/cancel`,
    customerEmail: user.email,
    customId: user.user_id,
  });

  const approvalLink = subscription.links.find((l) => l.rel === 'approve');
  if (!approvalLink) {
    return json(502, { error: 'paypal_missing_approval_link' });
  }

  return json(200, {
    subscription_id: subscription.id,
    approval_url: approvalLink.href,
  });
};

function isProductId(v: unknown): v is ProductId {
  return typeof v === 'string' && (PRODUCT_IDS as readonly string[]).includes(v);
}

function isPlan(v: unknown): v is Plan {
  return typeof v === 'string' && (PLANS as readonly string[]).includes(v);
}
