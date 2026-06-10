import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { readSessionCookie, verifySessionJwt } from '../shared/auth.js';
import { isAllowedOrigin, json } from '../shared/http.js';
import { getLicensesByTenant, updateLicenseStatus } from '../shared/licenses.js';
import { cancelPayPalSubscription } from '../shared/paypal.js';
import { getSeatsByTenant, setSeatStatus } from '../shared/seats.js';
import { getUserByEmail } from '../shared/users.js';

/**
 * POST /licenses/{license_id}/cancel
 *
 * Auth-gated. Caller must own the tenant on the license. Steps:
 *   1. Call PayPal `cancel-subscription` so no more invoices are issued.
 *   2. Mark the license `canceled` locally.
 *   3. Cascade: revoke all active seats under that license so the MCP rejects
 *      them within ~5 minutes (its auth-cache TTL).
 *
 * Tenant billing status stays untouched — a user may own multiple licenses
 * under one tenant; cancelling one shouldn't kill the others.
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

  const licenseId = event.pathParameters?.['license_id'] ?? '';
  if (licenseId.length === 0) return json(400, { error: 'missing_license_id' });

  const user = await getUserByEmail(claims.email);
  if (!user) return json(401, { error: 'user_not_found' });

  // Locate the license under one of the user's owned tenants.
  let foundTenantId: string | undefined;
  let foundLicense;
  for (const tid of user.tenants_owned) {
    const licenses = await getLicensesByTenant(tid);
    const match = licenses.find((l) => l.license_id === licenseId);
    if (match) {
      foundTenantId = tid;
      foundLicense = match;
      break;
    }
  }
  if (!foundLicense || !foundTenantId) {
    return json(404, { error: 'license_not_found' });
  }

  if (foundLicense.status === 'canceled') {
    return json(200, {
      license_id: licenseId,
      status: 'canceled',
      already_canceled: true,
    });
  }

  // Cancel in PayPal first. If PayPal fails we still proceed locally to make
  // sure the user isn't billed AND can see the state. Operations will
  // reconcile via the webhook once it exists.
  if (foundLicense.subscription_id && foundLicense.subscription_provider === 'paypal') {
    try {
      await cancelPayPalSubscription(foundLicense.subscription_id, 'Cancelled by customer');
    } catch (err) {
      console.error('[license-cancel] PayPal cancel failed:', err);
    }
  }

  await updateLicenseStatus(foundTenantId, licenseId, 'canceled');

  // Cascade revoke seats so the MCP rejects them within its 5-min cache TTL.
  const tenantSeats = await getSeatsByTenant(foundTenantId);
  const toRevoke = tenantSeats.filter(
    (s) => s.license_id === licenseId && s.status !== 'revoked',
  );
  await Promise.all(toRevoke.map((s) => setSeatStatus(s.seat_id, 'revoked')));

  return json(200, {
    license_id: licenseId,
    status: 'canceled',
    seats_revoked: toRevoke.length,
  });
};
