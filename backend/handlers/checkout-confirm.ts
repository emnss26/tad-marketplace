import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { readSessionCookie, verifySessionJwt } from '../shared/auth.js';
import { findProductByPlanId, getTier } from '../shared/catalog.js';
import { isAllowedOrigin, json, parseJsonBody } from '../shared/http.js';
import { createLicense, findLicenseBySubscriptionId } from '../shared/licenses.js';
import { getPayPalSubscription } from '../shared/paypal.js';
import { createTenant } from '../shared/tenants.js';
import { appendTenantOwned, getUserByEmail } from '../shared/users.js';

const FALLBACK_PERIOD_SECONDS = 30 * 24 * 60 * 60;

interface RequestBody {
  subscription_id?: string;
}

/**
 * POST /checkout/confirm
 *
 * Called by the `/checkout/success` page after PayPal redirects the user back.
 * Idempotent enough for the happy path: it polls PayPal for the subscription
 * and materializes `tenant` + `license` only when status is APPROVED or
 * ACTIVE. The webhook (Sprint 3.1 — needs a public URL) handles edge cases
 * (renewals, cancellations, missed payments).
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!isAllowedOrigin(event)) return json(403, { error: 'origin_not_allowed' });

  const jwt = readSessionCookie(event.cookies);
  if (jwt === null) return json(401, { error: 'no_session' });

  let claims;
  try {
    claims = await verifySessionJwt(jwt);
  } catch {
    return json(401, { error: 'invalid_session' });
  }

  let body: RequestBody;
  try {
    body = parseJsonBody<RequestBody>(event);
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const subscriptionId = body.subscription_id?.trim() ?? '';
  if (subscriptionId.length === 0) return json(400, { error: 'missing_subscription_id' });

  // Fetch subscription from PayPal — source of truth.
  const subscription = await getPayPalSubscription(subscriptionId);

  // Defensive: the PayPal subscriber's custom_id must match our session user.
  const user = await getUserByEmail(claims.email);
  if (!user) return json(401, { error: 'user_not_found' });
  if (subscription.custom_id !== user.user_id) {
    return json(403, { error: 'subscription_user_mismatch' });
  }

  if (subscription.status !== 'APPROVED' && subscription.status !== 'ACTIVE') {
    return json(202, {
      pending: true,
      status: subscription.status,
      message: 'PayPal has not confirmed the subscription yet. Retry in a few seconds.',
    });
  }

  // Idempotency: if a license already exists for this subscription_id under
  // any of the user's tenants, return it instead of creating a duplicate.
  // This makes the endpoint safe to call from a refreshed /checkout/success
  // page, a webhook retry, or a flaky network retry.
  const existing = await findLicenseBySubscriptionId(user.tenants_owned, subscription.id);
  if (existing) {
    return json(200, {
      tenant_id: existing.tenant_id,
      license_id: existing.license_id,
      product_id: existing.product_id,
      plan: existing.plan,
      seats_quota: existing.seats_quota,
      already_existed: true,
    });
  }

  // Map plan_id → (product, plan)
  const matched = findProductByPlanId(subscription.plan_id);
  if (!matched) {
    return json(500, { error: 'unknown_plan_id', plan_id: subscription.plan_id });
  }
  const tier = getTier(matched.productId, matched.plan);

  // Reuse existing individual tenant or create a new one.
  let tenantId: string;
  const firstOwned = user.tenants_owned[0];
  if (firstOwned !== undefined) {
    tenantId = firstOwned;
  } else {
    const legalName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    const tenant = await createTenant({
      type: 'individual',
      legal_name: legalName.length > 0 ? legalName : user.email,
      contact_email: user.email,
      country: 'MX',
      channel: 'web',
      billing: {
        provider: 'paypal',
        subscription_id: subscription.id,
        status: 'active',
        current_period_end: parseTime(subscription.billing_info?.next_billing_time),
      },
    });
    tenantId = tenant.tenant_id;
    await appendTenantOwned(user.email, tenantId);
  }

  // Seats come from the tier (Personal=1, SMB=5, Enterprise=25). PayPal
  // subscription quantity is not used — see paypal.ts createPayPalSubscription.
  const seatsQuota = tier.seatsIncluded;

  const license = await createLicense({
    tenant_id: tenantId,
    product_id: matched.productId,
    plan: matched.plan,
    seats_quota: seatsQuota,
    status: 'active',
    subscription_id: subscription.id,
    subscription_provider: 'paypal',
    current_period_end: parseTime(subscription.billing_info?.next_billing_time),
  });

  return json(200, {
    tenant_id: tenantId,
    license_id: license.license_id,
    product_id: matched.productId,
    plan: matched.plan,
    seats_quota: seatsQuota,
  });
};

/** Convert a PayPal ISO-8601 timestamp to unix seconds; fall back to now+30d. */
function parseTime(iso: string | undefined): number {
  const now = Math.floor(Date.now() / 1000);
  if (!iso) return now + FALLBACK_PERIOD_SECONDS;
  const t = Math.floor(new Date(iso).getTime() / 1000);
  return Number.isFinite(t) && t > 0 ? t : now + FALLBACK_PERIOD_SECONDS;
}
