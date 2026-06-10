import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { readSessionCookie, verifySessionJwt } from '../shared/auth.js';
import { json } from '../shared/http.js';
import { getUserByEmail } from '../shared/users.js';

/**
 * GET /me
 *
 * Authenticated identity probe. Reads the `tad_session` HttpOnly cookie,
 * verifies the JWT, and returns the user's public profile. Used by the
 * dashboard to gate access and render the greeting / company info.
 *
 * Returns 401 for any failure mode (no cookie, invalid signature, expired,
 * user deleted) — the FE treats all 401s the same: redirect to `/login`.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const jwt = readSessionCookie(event.cookies);
  if (jwt === null) {
    return json(401, { error: 'no_session' });
  }

  let claims;
  try {
    claims = await verifySessionJwt(jwt);
  } catch {
    return json(401, { error: 'invalid_session' });
  }

  const user = await getUserByEmail(claims.email);
  if (!user) {
    return json(401, { error: 'user_not_found' });
  }

  return json(200, {
    user_id: user.user_id,
    email: user.email,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    company_name: user.company_name ?? null,
    tenants_owned: user.tenants_owned,
    tenants_member_of: user.tenants_member_of,
  });
};
