import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { ddb, TABLE_NAMES } from './ddb.js';
import type { AuthTokenProfile, User } from '../types/control-plane.js';

/**
 * Fetch a user by their primary email. Emails are stored lower-cased; callers
 * should pass the raw input — we normalize here.
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAMES.users,
      Key: { email: normalized },
    }),
  );
  return (res.Item as User | undefined) ?? null;
}

/**
 * Get-or-create a user keyed by email. Race-safe: `ConditionExpression` on the
 * Put rejects a duplicate insert; on conflict we fall through to a final
 * GetItem so the caller always receives the canonical row.
 *
 * `profile` is only applied on FIRST creation. If the user already exists, the
 * stored profile is left untouched even when a new signup submits different
 * fields — this defends against a bad actor entering someone else's email at
 * `/signup` and overwriting their profile data.
 */
export async function upsertUserByEmail(
  email: string,
  profile?: AuthTokenProfile,
): Promise<User> {
  const normalized = email.trim().toLowerCase();

  const existing = await getUserByEmail(normalized);
  if (existing) return existing;

  const now = Math.floor(Date.now() / 1000);
  const user: User = {
    email: normalized,
    user_id: `usr_${ulid()}`,
    created_at: now,
    updated_at: now,
    tenants_owned: [],
    tenants_member_of: [],
    ...(profile?.first_name ? { first_name: profile.first_name } : {}),
    ...(profile?.last_name ? { last_name: profile.last_name } : {}),
    ...(profile?.company_name ? { company_name: profile.company_name } : {}),
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAMES.users,
        Item: user,
        ConditionExpression: 'attribute_not_exists(email)',
      }),
    );
    return user;
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      // Another concurrent caller won the race; read theirs.
      const winner = await getUserByEmail(normalized);
      if (winner) return winner;
    }
    throw err;
  }
}

/**
 * Append a tenant_id to a user's `tenants_owned` if not already present.
 * Idempotent: safe to call after a refresh or webhook retry.
 */
export async function appendTenantOwned(email: string, tenantId: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const user = await getUserByEmail(normalized);
  if (!user) {
    throw new Error(`user not found for ${normalized}`);
  }
  if (user.tenants_owned.includes(tenantId)) return;

  const now = Math.floor(Date.now() / 1000);
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.users,
      Key: { email: normalized },
      UpdateExpression:
        'SET tenants_owned = list_append(if_not_exists(tenants_owned, :empty), :one), updated_at = :now',
      ExpressionAttributeValues: {
        ':one': [tenantId],
        ':empty': [],
        ':now': now,
      },
    }),
  );
}

/**
 * Append a tenant_id to a user's `tenants_member_of` if it is not already
 * there. Used when an invitee verifies a team-invite magic link.
 */
export async function appendTenantMemberOf(email: string, tenantId: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const user = await getUserByEmail(normalized);
  if (!user) {
    throw new Error(`user not found for ${normalized}`);
  }
  if (user.tenants_member_of.includes(tenantId)) return;

  const now = Math.floor(Date.now() / 1000);
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.users,
      Key: { email: normalized },
      UpdateExpression:
        'SET tenants_member_of = list_append(if_not_exists(tenants_member_of, :empty), :one), updated_at = :now',
      ExpressionAttributeValues: {
        ':one': [tenantId],
        ':empty': [],
        ':now': now,
      },
    }),
  );
}
