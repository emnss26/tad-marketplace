import { SignJWT, jwtVerify } from 'jose';

/**
 * Session JWT issuance and verification.
 *
 * - Algorithm: HS256 (symmetric, fast in Lambda cold-start).
 * - Issuer: `tad-marketplace`, audience: `tad-marketplace-frontend`.
 * - TTL: 7 days. Cookie-based; we also expose a Bearer-style verify so
 *   future API Gateway authorizers can reuse the same secret.
 *
 * The secret comes from `JWT_SECRET` (env, sourced from Secrets Manager in
 * prod). It must be at least 32 characters; we throw at first use otherwise
 * rather than at module load so tests can opt in.
 */

const ISSUER = 'tad-marketplace';
const AUDIENCE = 'tad-marketplace-frontend';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const COOKIE_NAME = 'tad_session';

export interface SessionClaims {
  user_id: string;
  email: string;
}

function getSecret(): Uint8Array {
  const s = process.env['JWT_SECRET'];
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long');
  }
  return new TextEncoder().encode(s);
}

export async function issueSessionJwt(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS.toString()}s`)
    .sign(getSecret());
}

export async function verifySessionJwt(jwt: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(jwt, getSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const user_id = payload['user_id'];
  const email = payload['email'];
  if (typeof user_id !== 'string' || typeof email !== 'string') {
    throw new Error('session JWT missing user_id/email claims');
  }
  return { user_id, email };
}

/**
 * Serialize a Set-Cookie value for the session JWT. The Lambda v2 response
 * shape exposes a `cookies: string[]` array that API Gateway HTTP API will
 * translate into multiple `Set-Cookie` headers.
 *
 * Domain is left unset by default (host-only cookie) and can be overridden
 * with `SESSION_COOKIE_DOMAIN=.tad.com.mx` when the FE and the API live on
 * separate subdomains.
 */
export function sessionCookie(jwt: string): string {
  return buildCookie(jwt, SESSION_TTL_SECONDS);
}

export function clearSessionCookie(): string {
  return buildCookie('', 0);
}

function buildCookie(value: string, maxAge: number): string {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge.toString()}`,
  ];
  // `Secure` is the default. Chrome rejects Secure cookies over plain HTTP
  // (including localhost), so the local dev server sets
  // SESSION_COOKIE_INSECURE=true to drop it. Production must NEVER set this.
  if (process.env['SESSION_COOKIE_INSECURE'] !== 'true') {
    parts.push('Secure');
  }
  const domain = process.env['SESSION_COOKIE_DOMAIN'];
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
}

/** Parse the `tad_session` cookie out of an `event.cookies` array, if present. */
export function readSessionCookie(cookies: readonly string[] | undefined): string | null {
  if (!cookies) return null;
  const prefix = `${COOKIE_NAME}=`;
  for (const c of cookies) {
    if (c.startsWith(prefix)) {
      return c.slice(prefix.length);
    }
  }
  return null;
}
