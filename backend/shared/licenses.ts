import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { ddb, TABLE_NAMES } from './ddb.js';
import type {
  License,
  LicenseStatus,
  Plan,
  ProductId,
  SubscriptionProvider,
} from '../types/control-plane.js';

export interface CreateLicenseInput {
  tenant_id: string;
  product_id: ProductId;
  plan: Plan;
  seats_quota: number;
  status: LicenseStatus;
  subscription_id: string;
  subscription_provider: SubscriptionProvider;
  current_period_end: number;
}

export async function createLicense(input: CreateLicenseInput): Promise<License> {
  const now = Math.floor(Date.now() / 1000);
  const license: License = {
    tenant_id: input.tenant_id,
    license_id: `lic_${ulid()}`,
    product_id: input.product_id,
    plan: input.plan,
    seats_quota: input.seats_quota,
    seats_used: 0,
    status: input.status,
    // Legacy field kept for back-compat with CONTROL_PLANE.md older readers.
    stripe_subscription_id: '',
    subscription_id: input.subscription_id,
    subscription_provider: input.subscription_provider,
    current_period_end: input.current_period_end,
    created_at: now,
    updated_at: now,
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAMES.licenses,
      Item: license,
    }),
  );
  return license;
}

export async function getLicensesByTenant(tenantId: string): Promise<License[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAMES.licenses,
      KeyConditionExpression: 'tenant_id = :tid',
      ExpressionAttributeValues: { ':tid': tenantId },
    }),
  );
  return (res.Items as License[] | undefined) ?? [];
}

/**
 * Idempotency lookup: find a license issued for a given PayPal/Stripe
 * `subscription_id` under any of the caller's owned tenants. Returns the
 * first match (subscription_ids are globally unique per provider) or null.
 */
export async function findLicenseBySubscriptionId(
  tenantIds: readonly string[],
  subscriptionId: string,
): Promise<License | null> {
  for (const tid of tenantIds) {
    const licenses = await getLicensesByTenant(tid);
    const found = licenses.find((l) => l.subscription_id === subscriptionId);
    if (found) return found;
  }
  return null;
}

export async function updateLicenseStatus(
  tenantId: string,
  licenseId: string,
  status: LicenseStatus,
  currentPeriodEnd?: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const parts = ['SET #st = :status', 'updated_at = :now'];
  const values: Record<string, unknown> = { ':status': status, ':now': now };
  if (currentPeriodEnd !== undefined) {
    parts.push('current_period_end = :cpe');
    values[':cpe'] = currentPeriodEnd;
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.licenses,
      Key: { tenant_id: tenantId, license_id: licenseId },
      UpdateExpression: parts.join(', '),
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: values,
    }),
  );
}

export class LicenseConditionError extends Error {
  constructor(
    public readonly reason: 'no_seats_available' | 'license_inactive',
    message: string,
  ) {
    super(message);
    this.name = 'LicenseConditionError';
  }
}

/**
 * Atomically increment `seats_used` for a license, gated by:
 *   - license must be `active`
 *   - `seats_used + 1 <= seats_quota`
 * Throws `LicenseConditionError` if either condition fails. Used by
 * `seat-activate` to prevent over-provisioning under concurrency.
 */
export async function incrementSeatsUsed(
  tenantId: string,
  licenseId: string,
): Promise<License> {
  const now = Math.floor(Date.now() / 1000);
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.licenses,
        Key: { tenant_id: tenantId, license_id: licenseId },
        UpdateExpression: 'SET seats_used = seats_used + :one, updated_at = :now',
        ConditionExpression: '#st = :active AND seats_used < seats_quota',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':one': 1, ':now': now, ':active': 'active' },
        ReturnValues: 'ALL_NEW',
      }),
    );
    const updated = res.Attributes as License | undefined;
    if (!updated) throw new Error('UpdateCommand returned no attributes');
    return updated;
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      // We don't know which condition failed from the error alone; re-read to
      // tell the caller the precise reason.
      const lookup = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAMES.licenses,
          KeyConditionExpression: 'tenant_id = :tid AND license_id = :lid',
          ExpressionAttributeValues: { ':tid': tenantId, ':lid': licenseId },
          Limit: 1,
        }),
      );
      const current = (lookup.Items?.[0] as License | undefined) ?? null;
      if (current && current.status !== 'active') {
        throw new LicenseConditionError(
          'license_inactive',
          `License ${licenseId} is ${current.status}`,
        );
      }
      throw new LicenseConditionError(
        'no_seats_available',
        `License ${licenseId} has no seats available`,
      );
    }
    throw err;
  }
}

/** Decrement `seats_used` on seat revoke. Floors at 0 via ConditionExpression. */
export async function decrementSeatsUsed(
  tenantId: string,
  licenseId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.licenses,
        Key: { tenant_id: tenantId, license_id: licenseId },
        UpdateExpression: 'SET seats_used = seats_used - :one, updated_at = :now',
        ConditionExpression: 'seats_used > :zero',
        ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':now': now },
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      // Already at 0 — nothing to do.
      return;
    }
    throw err;
  }
}
