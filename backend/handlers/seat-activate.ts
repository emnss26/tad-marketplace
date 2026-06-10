import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { readSessionCookie, verifySessionJwt } from '../shared/auth.js';
import { isAllowedOrigin, json, parseJsonBody } from '../shared/http.js';
import {
  decrementSeatsUsed,
  getLicensesByTenant,
  incrementSeatsUsed,
  LicenseConditionError,
} from '../shared/licenses.js';
import { createSeat } from '../shared/seats.js';
import { generatePlaintextToken, hashToken } from '../shared/tokens.js';
import { getUserByEmail } from '../shared/users.js';

interface RequestBody {
  tenant_id?: string;
  license_id?: string;
  hostname?: string;
}

/**
 * POST /seats/activate
 *
 * Auth-gated. Provisions a seat on the given license/tenant for the named PC.
 * Returns the **plaintext Bearer token ONCE** — caller MUST capture it now;
 * we only persist its SHA-256 hash and cannot recover the original.
 *
 * Concurrency:
 *   1. `incrementSeatsUsed` atomic-checks `seats_used < seats_quota`. If
 *      another concurrent activation wins the race, this one fails fast with
 *      `no_seats_available`.
 *   2. Only after the increment succeeds do we PutItem the seat. If the Put
 *      then fails, we attempt to roll back the increment so the counter
 *      doesn't drift.
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

  const tenantId = body.tenant_id?.trim() ?? '';
  const licenseId = body.license_id?.trim() ?? '';
  const hostname = body.hostname?.trim() ?? '';
  if (tenantId.length === 0 || licenseId.length === 0) {
    return json(400, { error: 'missing_tenant_or_license' });
  }
  if (!isValidHostname(hostname)) {
    return json(400, { error: 'invalid_hostname' });
  }

  // Permission: caller must own or be a member of the tenant on the license.
  const user = await getUserByEmail(claims.email);
  if (!user) return json(401, { error: 'user_not_found' });
  const owned = new Set([...user.tenants_owned, ...user.tenants_member_of]);
  if (!owned.has(tenantId)) {
    return json(403, { error: 'not_a_member_of_tenant' });
  }

  // Look up the license to get product_id.
  const licenses = await getLicensesByTenant(tenantId);
  const license = licenses.find((l) => l.license_id === licenseId);
  if (!license) return json(404, { error: 'license_not_found' });

  // Atomic seat reservation.
  try {
    await incrementSeatsUsed(tenantId, licenseId);
  } catch (err) {
    if (err instanceof LicenseConditionError) {
      return json(409, { error: err.reason });
    }
    throw err;
  }

  // Generate the plaintext + hash AFTER reserving the seat slot, so we don't
  // leak tokens that could never be associated with a row.
  const plaintext = generatePlaintextToken();
  const tokenHash = hashToken(plaintext);

  let seat;
  try {
    seat = await createSeat({
      tenant_id: tenantId,
      license_id: licenseId,
      product_id: license.product_id,
      token_hash: tokenHash,
      hostname,
      assigned_to_email: user.email,
    });
  } catch (err) {
    // Roll back the increment so the counter doesn't drift.
    await decrementSeatsUsed(tenantId, licenseId).catch(() => {
      // Best effort; surface the original error to the caller.
    });
    throw err;
  }

  // Convenience install command for the FE to copy-paste.
  const installCommand = buildInstallCommand(plaintext, seat.hostname);

  return json(201, {
    seat_id: seat.seat_id,
    hostname: seat.hostname,
    product_id: seat.product_id,
    plaintext_token: plaintext,
    install_command: installCommand,
  });
};

function isValidHostname(s: string): boolean {
  // RFC 1123 short hostname: letters, digits, hyphen, dot. 1-253 chars.
  if (s.length === 0 || s.length > 253) return false;
  return /^[A-Za-z0-9._-]+$/.test(s);
}

function buildInstallCommand(token: string, hostname: string): string {
  // The PowerShell command the customer pastes to install the add-in. Token is
  // wrapped in straight double quotes so PowerShell preserves it verbatim.
  return `powershell -ExecutionPolicy Bypass -File .\\install.ps1 -Token "${token}" -Hostname "${hostname}"`;
}
