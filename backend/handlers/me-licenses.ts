import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { readSessionCookie, verifySessionJwt } from '../shared/auth.js';
import { getProduct } from '../shared/catalog.js';
import { json } from '../shared/http.js';
import { getLicensesByTenant } from '../shared/licenses.js';
import { getUserByEmail } from '../shared/users.js';
import type { ProductId } from '../types/control-plane.js';

/**
 * GET /me/licenses
 *
 * Auth-gated. Returns every license the caller can see — both owned
 * (`tenants_owned`) and member-of (`tenants_member_of`). Includes the human
 * product name for FE rendering so the dashboard doesn't have to keep its own
 * mapping.
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

  const tenantIds = [
    ...new Set([...user.tenants_owned, ...user.tenants_member_of]),
  ];

  const perTenant = await Promise.all(tenantIds.map((tid) => getLicensesByTenant(tid)));
  const licenses = perTenant.flat();

  const view = licenses.map((l) => ({
    license_id: l.license_id,
    tenant_id: l.tenant_id,
    product_id: l.product_id,
    product_name: safeProductName(l.product_id),
    plan: l.plan,
    status: l.status,
    seats_quota: l.seats_quota,
    seats_used: l.seats_used,
    current_period_end: l.current_period_end,
    subscription_provider: l.subscription_provider ?? null,
  }));

  return json(200, { licenses: view });
};

function safeProductName(productId: ProductId): string {
  try {
    return getProduct(productId).name;
  } catch {
    return productId;
  }
}
