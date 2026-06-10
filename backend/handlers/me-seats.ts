import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { readSessionCookie, verifySessionJwt } from '../shared/auth.js';
import { json } from '../shared/http.js';
import { getSeatsByTenant } from '../shared/seats.js';
import { getUserByEmail } from '../shared/users.js';

/**
 * GET /me/seats
 *
 * Auth-gated. Returns every seat under tenants the caller owns. The dashboard
 * "Team" panel uses this to list teammates per license so the admin can see
 * who's activated and revoke when needed.
 *
 * We intentionally do NOT include seats from `tenants_member_of` — members
 * see only their own seat via `Activate this PC`, not other members'.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const jwt = readSessionCookie(event.cookies);
  if (jwt === null) return json(401, { error: 'no_session' });

  let claims;
  try {
    claims = await verifySessionJwt(jwt);
  } catch {
    return json(401, { error: 'invalid_session' });
  }

  const user = await getUserByEmail(claims.email);
  if (!user) return json(401, { error: 'user_not_found' });

  const perTenant = await Promise.all(
    user.tenants_owned.map((t) => getSeatsByTenant(t)),
  );
  const seats = perTenant.flat();

  const view = seats.map((s) => ({
    seat_id: s.seat_id,
    tenant_id: s.tenant_id,
    license_id: s.license_id,
    product_id: s.product_id,
    hostname: s.hostname,
    status: s.status,
    assigned_to_email: s.assigned_to_email,
    created_at: s.created_at,
    last_seen_at: s.last_seen_at,
  }));

  return json(200, { seats: view });
};
