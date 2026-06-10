import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { ddb, TABLE_NAMES } from './ddb.js';
import type { ProductId, Seat, SeatStatus } from '../types/control-plane.js';

export interface CreateSeatInput {
  tenant_id: string;
  license_id: string;
  product_id: ProductId;
  /** SHA-256 hex of the plaintext Bearer token. Plaintext is NEVER stored. */
  token_hash: string;
  /** Will be lower-cased. */
  hostname: string;
  /** Email of the human using this PC, for support. */
  assigned_to_email: string;
}

export async function createSeat(input: CreateSeatInput): Promise<Seat> {
  const now = Math.floor(Date.now() / 1000);
  const seat: Seat = {
    seat_id: `seat_${ulid()}`,
    tenant_id: input.tenant_id,
    license_id: input.license_id,
    product_id: input.product_id,
    token_hash: input.token_hash,
    hostname: input.hostname.trim().toLowerCase(),
    status: 'active',
    assigned_to_email: input.assigned_to_email.trim().toLowerCase(),
    created_at: now,
    last_seen_at: 0,
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAMES.seats,
      Item: seat,
      ConditionExpression: 'attribute_not_exists(seat_id)',
    }),
  );
  return seat;
}

export async function getSeatById(seatId: string): Promise<Seat | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAMES.seats,
      Key: { seat_id: seatId },
    }),
  );
  return (res.Item as Seat | undefined) ?? null;
}

export async function setSeatStatus(seatId: string, status: SeatStatus): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.seats,
      Key: { seat_id: seatId },
      UpdateExpression: 'SET #st = :status',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':status': status },
    }),
  );
}

/**
 * List seats for a tenant. Uses a Scan with FilterExpression — fine for
 * Sprint 5 volumes (a few hundred seats). When the table grows, add a GSI
 * on `tenant_id` and switch this to Query.
 */
export async function getSeatsByTenant(tenantId: string): Promise<Seat[]> {
  const items: Seat[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAMES.seats,
        FilterExpression: 'tenant_id = :tid',
        ExpressionAttributeValues: { ':tid': tenantId },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    items.push(...((res.Items as Seat[] | undefined) ?? []));
    exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey !== undefined);
  return items;
}
