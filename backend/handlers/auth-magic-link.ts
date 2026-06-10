import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createAuthToken } from '../shared/auth-tokens.js';
import {
  getSourceIp,
  isAllowedOrigin,
  isValidEmail,
  json,
  noContent,
  parseJsonBody,
} from '../shared/http.js';
import { checkRateLimit } from '../shared/rate-limit.js';
import { magicLinkEmail, sendEmail } from '../shared/ses.js';
import { generatePlaintextToken, hashToken } from '../shared/tokens.js';
import type { AuthTokenProfile } from '../types/control-plane.js';

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';

// Throttle: one magic link per email per minute, plus one per IP per 10 s.
const EMAIL_THROTTLE_SECONDS = 60;
const IP_THROTTLE_SECONDS = 10;

interface RequestBody {
  email?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
}

/**
 * POST /auth/magic-link
 *
 * Accepts an email plus optional signup profile fields (`first_name`,
 * `last_name`, `company_name`). The profile rides on the persisted auth-token
 * row and is applied to the user on first creation in `/auth/verify`.
 *
 * Anti-enumeration: always returns 204 for well-formed inputs, regardless of
 * whether the email already exists.
 *
 * Rate-limited per email (60 s) and per source IP (10 s) to defend against SES
 * cost abuse and inbox spam.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!isAllowedOrigin(event)) return json(403, { error: 'origin_not_allowed' });

  let body: RequestBody;
  try {
    body = parseJsonBody<RequestBody>(event);
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const email = body.email?.trim().toLowerCase() ?? '';
  if (!isValidEmail(email)) {
    return json(400, { error: 'invalid_email' });
  }

  const ip = getSourceIp(event);
  const ipLimit = await checkRateLimit('magic-link-ip', ip, IP_THROTTLE_SECONDS);
  if (!ipLimit.allowed) {
    return json(429, { error: 'rate_limited', retry_after: ipLimit.retryAfter });
  }
  const emailLimit = await checkRateLimit('magic-link-email', email, EMAIL_THROTTLE_SECONDS);
  if (!emailLimit.allowed) {
    // Same 204 path so we don't leak whether the email exists, but log the throttle
    // for visibility.
    console.warn(
      `[auth-magic-link] email throttled for ${email}, retry_after=${emailLimit.retryAfter.toString()}s`,
    );
    return noContent();
  }

  const profile = sanitizeProfile(body);

  // Generate plaintext token, hash it, persist hash only.
  const plaintext = generatePlaintextToken();
  const tokenHash = hashToken(plaintext);
  await createAuthToken(email, tokenHash, { profile });

  // Email contains the plaintext token via the `t` query parameter on /verify.
  const link = `${FRONTEND_URL}/verify?t=${encodeURIComponent(plaintext)}`;
  await sendEmail(magicLinkEmail(email, link));

  return noContent();
};

function sanitizeProfile(body: RequestBody): AuthTokenProfile | undefined {
  const first_name = body.first_name?.trim();
  const last_name = body.last_name?.trim();
  const company_name = body.company_name?.trim();
  if (!first_name && !last_name && !company_name) return undefined;
  const out: AuthTokenProfile = {};
  if (first_name) out.first_name = first_name.slice(0, 100);
  if (last_name) out.last_name = last_name.slice(0, 100);
  if (company_name) out.company_name = company_name.slice(0, 200);
  return out;
}
