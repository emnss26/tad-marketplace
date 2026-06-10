import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generate a cryptographically random Bearer-style token.
 *
 * 32 random bytes -> base64url (no padding) -> 43-char string.
 * Used for both seat activation tokens (see `seats.token_hash`) and magic-link
 * tokens (see `auth_tokens.token_hash`).
 *
 * The PLAINTEXT is shown to the end user exactly once and is NEVER persisted.
 * Only the SHA-256 hash goes to DynamoDB.
 */
export function generatePlaintextToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 hex digest of a plaintext token.
 *
 * This is what we store in `seats.token_hash` and `auth_tokens.token_hash`,
 * and what the MCP queries by on every request via the `token_hash_idx` GSI.
 */
export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Constant-time string equality. Use when comparing token hashes to defend
 * against timing attacks.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
