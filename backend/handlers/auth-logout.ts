import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { clearSessionCookie } from '../shared/auth.js';
import { isAllowedOrigin, json, noContent } from '../shared/http.js';

/**
 * POST /auth/logout
 *
 * Returns 204 and instructs the browser to drop the `tad_session` cookie by
 * setting it to empty with `Max-Age=0`. We do NOT touch any DDB state — the
 * session JWT is stateless, so revocation is achieved purely on the client.
 *
 * Idempotent. Works whether or not the caller currently has a session.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!isAllowedOrigin(event)) return json(403, { error: 'origin_not_allowed' });
  return noContent({ cookies: [clearSessionCookie()] });
};
