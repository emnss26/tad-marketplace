import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { readSessionCookie, verifySessionJwt } from '../shared/auth.js';
import { isAllowedOrigin, json } from '../shared/http.js';
import { decrementSeatsUsed } from '../shared/licenses.js';
import { getSeatById, setSeatStatus } from '../shared/seats.js';
import { getUserByEmail } from '../shared/users.js';

/**
 * POST /seats/{seat_id}/revoke
 *
 * Auth-gated. Caller must OWN the tenant on the seat (admins only). The seat
 * row stays for audit but its `status` flips to `revoked`. We decrement
 * `seats_used` so the slot becomes available for a new activation.
 *
 * The MCP rejects the seat within ~5 min as its auth cache TTLs out — no
 * explicit cache-invalidation endpoint in v1.
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

  const seatId = event.pathParameters?.['seat_id'] ?? '';
  if (seatId.length === 0) return json(400, { error: 'missing_seat_id' });

  const seat = await getSeatById(seatId);
  if (!seat) return json(404, { error: 'seat_not_found' });

  const user = await getUserByEmail(claims.email);
  if (!user) return json(401, { error: 'user_not_found' });
  if (!user.tenants_owned.includes(seat.tenant_id)) {
    return json(403, { error: 'not_an_owner_of_tenant' });
  }

  if (seat.status === 'revoked') {
    return json(200, { seat_id: seatId, status: 'revoked', already_revoked: true });
  }

  await setSeatStatus(seatId, 'revoked');
  await decrementSeatsUsed(seat.tenant_id, seat.license_id);

  return json(200, { seat_id: seatId, status: 'revoked' });
};
