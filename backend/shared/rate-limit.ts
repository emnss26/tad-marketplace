import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAMES } from './ddb.js';

/**
 * Lightweight DDB-backed rate limiter.
 *
 * Reuses the `tad-marketplace-auth-tokens` table (PK = token_hash, TTL on
 * ttl_epoch) with a `rl:` prefix so the rows can't collide with real magic
 * link tokens. Each row records the next-allowed time; once it expires,
 * DynamoDB's TTL janitor cleans it up.
 *
 * Per Lambda cold-start this is one GetItem + one PutItem (or two PutItems on
 * hit). At sub-1k TPS that's pennies. For higher volume swap to API Gateway
 * usage plans or a dedicated cache.
 */

const RATE_LIMIT_PREFIX = 'rl';

export interface RateLimitResult {
  allowed: boolean;
  /** Unix seconds until the next request is allowed. 0 if `allowed=true`. */
  retryAfter: number;
}

/**
 * Returns `{ allowed: false }` if the same (action, identifier) was used
 * within the past `windowSeconds`. Updates the marker on every allowed call
 * so the window extends.
 */
export async function checkRateLimit(
  action: string,
  identifier: string,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const key = `${RATE_LIMIT_PREFIX}:${action}:${identifier}`;
  const now = Math.floor(Date.now() / 1000);

  const existing = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAMES.authTokens,
      Key: { token_hash: key },
    }),
  );
  if (existing.Item) {
    const expiresAt = (existing.Item as { expires_at?: number }).expires_at ?? 0;
    if (expiresAt > now) {
      return { allowed: false, retryAfter: expiresAt - now };
    }
  }

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAMES.authTokens,
      Item: {
        token_hash: key,
        email: '',
        created_at: now,
        expires_at: now + windowSeconds,
        ttl_epoch: now + windowSeconds,
      },
    }),
  );

  return { allowed: true, retryAfter: 0 };
}
