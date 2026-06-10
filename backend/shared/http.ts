import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/** Shape of an API Gateway HTTP API v2 incoming event body, normalized. */
export interface ParsedBody {
  body?: string;
  isBase64Encoded?: boolean;
}

/** Build a JSON response. */
export function json(
  statusCode: number,
  body: unknown,
  extras?: { cookies?: string[] },
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(extras?.cookies ? { cookies: extras.cookies } : {}),
  };
}

/** Build a 204 No Content response. */
export function noContent(extras?: { cookies?: string[] }): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 204,
    body: '',
    ...(extras?.cookies ? { cookies: extras.cookies } : {}),
  };
}

/**
 * Decode and JSON-parse an event body. Returns an empty object for missing
 * bodies and throws `SyntaxError` for malformed JSON — callers can catch and
 * return 400.
 */
export function parseJsonBody<T>(event: ParsedBody): T {
  if (!event.body) return {} as T;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return JSON.parse(raw) as T;
}

/** Lower-cased, trimmed email validator. Rejects obvious garbage but defers to SES for the rest. */
export function isValidEmail(s: string): boolean {
  if (s.length === 0 || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * CSRF defense: verify that the request came from our own frontend by checking
 * `Origin` (preferred) or `Referer` against `FRONTEND_URL`. SameSite=Lax on the
 * session cookie already mitigates most cross-site POSTs, but this catches
 * leftover edge cases (CORS-relaxed XHR, sibling-subdomain XSS pivots).
 *
 * Returns true for same-origin requests, false otherwise. Mutating handlers
 * should reject with 403 when this returns false.
 */
export function isAllowedOrigin(event: {
  headers?: Record<string, string | undefined>;
}): boolean {
  const allowedOrigin = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
  // Normalize: strip trailing slash.
  const allowed = allowedOrigin.replace(/\/+$/, '');

  const headers = event.headers ?? {};
  const origin = headers['origin'] ?? headers['Origin'];
  if (origin && origin.replace(/\/+$/, '') === allowed) return true;

  const referer = headers['referer'] ?? headers['Referer'];
  if (referer && (referer === allowed || referer.startsWith(allowed + '/'))) return true;

  return false;
}

/** Extract the caller's source IP from the API Gateway / Express event. */
export function getSourceIp(event: {
  requestContext?: { http?: { sourceIp?: string } };
  headers?: Record<string, string | undefined>;
}): string {
  const ip = event.requestContext?.http?.sourceIp;
  if (ip) return ip;
  const forwarded =
    event.headers?.['x-forwarded-for'] ?? event.headers?.['X-Forwarded-For'];
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return 'unknown';
}
