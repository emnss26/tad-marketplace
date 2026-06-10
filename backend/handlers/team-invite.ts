import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { readSessionCookie, verifySessionJwt } from '../shared/auth.js';
import { createAuthToken } from '../shared/auth-tokens.js';
import { getProduct } from '../shared/catalog.js';
import { isAllowedOrigin, isValidEmail, json, parseJsonBody } from '../shared/http.js';
import { getLicensesByTenant } from '../shared/licenses.js';
import { sendEmail, teamInviteEmail } from '../shared/ses.js';
import { generatePlaintextToken, hashToken } from '../shared/tokens.js';
import { getUserByEmail } from '../shared/users.js';

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';

interface RequestBody {
  tenant_id?: string;
  license_id?: string;
  email?: string;
}

/**
 * POST /team/invite
 *
 * Auth-gated. The caller must OWN the tenant (be in `tenants_owned`) and the
 * tenant must hold the named license. We don't require the license to have
 * spare seats yet — the invite is only a magic-link; the seat is provisioned
 * when the invitee actually clicks `Activate this PC`.
 *
 * Response is always 204 even if the invite email looks fishy (to avoid
 * leaking which addresses already have accounts).
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

  const tenantId = body.tenant_id?.trim() ?? '';
  const licenseId = body.license_id?.trim() ?? '';
  const inviteeEmail = body.email?.trim().toLowerCase() ?? '';
  if (tenantId.length === 0 || licenseId.length === 0) {
    return json(400, { error: 'missing_tenant_or_license' });
  }
  if (!isValidEmail(inviteeEmail)) {
    return json(400, { error: 'invalid_email' });
  }

  // Permission: caller must OWN this tenant.
  const inviter = await getUserByEmail(claims.email);
  if (!inviter) return json(401, { error: 'user_not_found' });
  if (!inviter.tenants_owned.includes(tenantId)) {
    return json(403, { error: 'not_an_owner_of_tenant' });
  }

  // License must belong to that tenant and be a multi-seat one.
  const licenses = await getLicensesByTenant(tenantId);
  const license = licenses.find((l) => l.license_id === licenseId);
  if (!license) return json(404, { error: 'license_not_found' });
  if (license.seats_quota <= 1) {
    return json(400, { error: 'license_is_single_seat' });
  }

  // Issue an invite-flavored magic link.
  const plaintext = generatePlaintextToken();
  const tokenHash = hashToken(plaintext);
  await createAuthToken(inviteeEmail, tokenHash, {
    invite: {
      tenant_id: tenantId,
      license_id: licenseId,
      invited_by_user_id: inviter.user_id,
    },
  });

  const link = `${FRONTEND_URL}/verify?t=${encodeURIComponent(plaintext)}`;
  const inviterName = [inviter.first_name, inviter.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const productName = safeProductName(license.product_id);

  await sendEmail(teamInviteEmail(inviteeEmail, inviterName, productName, link));

  return json(200, {
    invited_email: inviteeEmail,
    license_id: licenseId,
    expires_in_seconds: 15 * 60,
  });
};

function safeProductName(productId: string): string {
  try {
    return getProduct(productId as Parameters<typeof getProduct>[0]).name;
  } catch {
    return 'a TAD product';
  }
}
