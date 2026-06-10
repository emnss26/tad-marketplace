import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { ddb, TABLE_NAMES } from './ddb.js';
import type {
  BillingProvider,
  BillingStatus,
  Channel,
  Tenant,
  TenantType,
} from '../types/control-plane.js';

export interface CreateTenantInput {
  type: TenantType;
  legal_name: string;
  contact_email: string;
  country: string;
  channel: Channel;
  billing: {
    provider: BillingProvider;
    subscription_id: string;
    status: BillingStatus;
    current_period_end: number;
  };
}

export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const now = Math.floor(Date.now() / 1000);
  const tenant: Tenant = {
    tenant_id: `tnt_${ulid()}`,
    type: input.type,
    legal_name: input.legal_name,
    contact_email: input.contact_email.trim().toLowerCase(),
    country: input.country,
    channel: input.channel,
    billing: { ...input.billing },
    created_at: now,
    updated_at: now,
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAMES.tenants,
      Item: tenant,
      ConditionExpression: 'attribute_not_exists(tenant_id)',
    }),
  );
  return tenant;
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAMES.tenants,
      Key: { tenant_id: tenantId },
    }),
  );
  return (res.Item as Tenant | undefined) ?? null;
}

/** Patch the billing block. Used by the webhook on SUSPENDED / CANCELLED / past-due transitions. */
export async function updateTenantBillingStatus(
  tenantId: string,
  status: BillingStatus,
  currentPeriodEnd?: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expressionParts = ['SET billing.#st = :status', 'updated_at = :now'];
  const values: Record<string, unknown> = { ':status': status, ':now': now };
  if (currentPeriodEnd !== undefined) {
    expressionParts.push('billing.current_period_end = :cpe');
    values[':cpe'] = currentPeriodEnd;
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.tenants,
      Key: { tenant_id: tenantId },
      UpdateExpression: expressionParts.join(', '),
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: values,
    }),
  );
}
