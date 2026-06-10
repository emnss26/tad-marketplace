import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAMES } from './ddb.js';
import type { AuthToken, AuthTokenProfile } from '../types/control-plane.js';

/** Magic-link token validity window. */
export const AUTH_TOKEN_TTL_SECONDS = 15 * 60;

export interface InviteContext {
  /** Tenant the invitee should be added to as a member. */
  tenant_id: string;
  /** License this invitation targets. */
  license_id: string;
  /** user_id of the admin who issued the invite. */
  invited_by_user_id: string;
}

/**
 * Persist a hashed magic-link token. The plaintext is the caller's secret to
 * deliver (typically via email) and is NEVER stored here.
 *
 * `profile` rides on `/signup` submissions so `auth-verify` can apply the
 * profile on first user creation.
 * `invite` rides on `team-invite` submissions so `auth-verify` adds the
 * invitee to the right tenant.
 */
export async function createAuthToken(
  email: string,
  tokenHash: string,
  options: { profile?: AuthTokenProfile; invite?: InviteContext } = {},
): Promise<AuthToken> {
  const now = Math.floor(Date.now() / 1000);
  const token: AuthToken = {
    token_hash: tokenHash,
    email: email.trim().toLowerCase(),
    created_at: now,
    expires_at: now + AUTH_TOKEN_TTL_SECONDS,
    ttl_epoch: now + AUTH_TOKEN_TTL_SECONDS,
    ...(options.profile ? { profile: options.profile } : {}),
    ...(options.invite
      ? {
          invite_to_tenant_id: options.invite.tenant_id,
          invite_to_license_id: options.invite.license_id,
          invited_by_user_id: options.invite.invited_by_user_id,
        }
      : {}),
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAMES.authTokens,
      Item: token,
    }),
  );
  return token;
}

/**
 * Look up a token by its SHA-256 hash and atomically mark it consumed. Returns
 * the consumed row on success, or `null` if the token doesn't exist, is
 * expired, or was already consumed (single-use, replay-safe).
 *
 * Two-step (GetItem then UpdateItem with ConditionExpression) so we can:
 *   - distinguish "never existed" from "already used" in logs,
 *   - keep the conditional update small and indexed on the PK.
 */
export async function consumeAuthToken(tokenHash: string): Promise<AuthToken | null> {
  const now = Math.floor(Date.now() / 1000);

  const lookup = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAMES.authTokens,
      Key: { token_hash: tokenHash },
    }),
  );
  const token = lookup.Item as AuthToken | undefined;
  if (!token) return null;
  if (token.consumed_at !== undefined) return null;
  if (token.expires_at < now) return null;

  try {
    const updated = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.authTokens,
        Key: { token_hash: tokenHash },
        UpdateExpression: 'SET consumed_at = :now',
        ConditionExpression: 'attribute_not_exists(consumed_at) AND expires_at > :now',
        ExpressionAttributeValues: { ':now': now },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return (updated.Attributes as AuthToken | undefined) ?? null;
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      // Another concurrent verify won the race, or expiry crossed `now`.
      return null;
    }
    throw err;
  }
}
