import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readSessionCookie, verifySessionJwt } from '../shared/auth.js';
import { getProduct } from '../shared/catalog.js';
import { json } from '../shared/http.js';
import { getLicensesByTenant } from '../shared/licenses.js';
import { getUserByEmail } from '../shared/users.js';
import { PRODUCT_IDS } from '../types/control-plane.js';
import type { ProductId } from '../types/control-plane.js';

const REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const BUCKET = process.env['INSTALLER_BUCKET'] ?? 'tad-installers';
const TTL_SECONDS = 15 * 60;

const s3 = new S3Client({ region: REGION });

/**
 * GET /installers/{product_id}/download
 *
 * Auth-gated. Returns a 15-min S3 presigned URL for the product's installer.
 * Pre-conditions:
 *   - Caller has a session.
 *   - Caller holds at least one ACTIVE license for `product_id`.
 *   - The product has an installer configured in `catalog.ts`.
 *   - The installer object actually exists in S3 (HeadObject check).
 *
 * The signed URL carries `ResponseContentDisposition: attachment;
 * filename="..."` so the browser saves the file with a friendly name regardless
 * of the opaque S3 key.
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

  const productId = event.pathParameters?.['product_id'] ?? '';
  if (!isProductId(productId)) {
    return json(400, { error: 'invalid_product_id' });
  }

  const product = getProduct(productId);
  if (!product.installer) {
    return json(404, { error: 'no_installer_for_product' });
  }

  // Active license check
  const user = await getUserByEmail(claims.email);
  if (!user) return json(401, { error: 'user_not_found' });

  const tenantIds = [...new Set([...user.tenants_owned, ...user.tenants_member_of])];
  const perTenant = await Promise.all(tenantIds.map((t) => getLicensesByTenant(t)));
  const hasActive = perTenant
    .flat()
    .some((l) => l.product_id === productId && l.status === 'active');
  if (!hasActive) {
    return json(403, { error: 'no_active_license' });
  }

  // Verify the installer actually exists in S3 — better 404 message than a
  // mysterious browser failure on a stale presigned URL.
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: product.installer.key }));
  } catch (err) {
    if (err instanceof Error && (err.name === 'NotFound' || err.name === 'NoSuchKey')) {
      return json(404, {
        error: 'installer_not_uploaded',
        message: 'The installer file has not been uploaded to S3 yet.',
      });
    }
    throw err;
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: product.installer.key,
      ResponseContentDisposition: `attachment; filename="${product.installer.downloadFilename}"`,
    }),
    { expiresIn: TTL_SECONDS },
  );

  return json(200, {
    url,
    filename: product.installer.downloadFilename,
    expires_in: TTL_SECONDS,
  });
};

function isProductId(v: string): v is ProductId {
  return (PRODUCT_IDS as readonly string[]).includes(v);
}
