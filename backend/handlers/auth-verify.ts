import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { consumeAuthToken } from '../shared/auth-tokens.js';
import { issueSessionJwt, sessionCookie } from '../shared/auth.js';
import { isAllowedOrigin, json, parseJsonBody } from '../shared/http.js';
import { hashToken } from '../shared/tokens.js';
import { appendTenantMemberOf, upsertUserByEmail } from '../shared/users.js';

interface RequestBody {
  token?: string;
}

/**
 * POST /auth/verify
 *
 * Consumes a magic-link token (single-use, 15-min TTL), upserts the user
 * (applying any profile fields stored on the token row at signup time), and
 * issues a 7-day session JWT in an HttpOnly cookie. The response body carries
 * the public user identity for the FE to render immediately.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!isAllowedOrigin(event)) return json(403, { error: 'origin_not_allowed' });

  let body: RequestBody;
  try {
    body = parseJsonBody<RequestBody>(event);
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const plaintext = body.token?.trim() ?? '';
  if (plaintext.length === 0) {
    return json(400, { error: 'missing_token' });
  }

  const tokenHash = hashToken(plaintext);
  const consumed = await consumeAuthToken(tokenHash);
  if (!consumed) {
    return json(401, { error: 'invalid_or_expired_token' });
  }

  const user = await upsertUserByEmail(consumed.email, consumed.profile);

  // If this was a team-invite, link the user to the host tenant.
  if (consumed.invite_to_tenant_id) {
    await appendTenantMemberOf(user.email, consumed.invite_to_tenant_id);
  }

  const jwt = await issueSessionJwt({ user_id: user.user_id, email: user.email });

  return json(
    200,
    {
      user_id: user.user_id,
      email: user.email,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      company_name: user.company_name ?? null,
    },
    { cookies: [sessionCookie(jwt)] },
  );
};
