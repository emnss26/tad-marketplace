import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { json } from '../shared/http.js';
import {
  findLicenseBySubscriptionIdGlobal,
  updateLicenseStatus,
} from '../shared/licenses.js';
import {
  getPayPalSubscription,
  verifyPayPalWebhookSignature,
  type PayPalWebhookHeaders,
} from '../shared/paypal.js';
import { getSeatsByTenant, setSeatStatus } from '../shared/seats.js';
import { getTenantById, updateTenantBillingStatus } from '../shared/tenants.js';
import type {
  BillingStatus,
  LicenseStatus,
  SeatStatus,
} from '../types/control-plane.js';

/**
 * POST /webhooks/paypal
 *
 * Receives PayPal webhook events and propagates subscription lifecycle
 * changes into the control plane so the MCP stops (or resumes) honoring
 * seats within its ~5-minute auth-cache TTL.
 *
 * Auth model: NO session, NO origin check — PayPal calls this server-to-
 * server. The only trust anchor is the webhook signature, verified against
 * `PAYPAL_WEBHOOK_ID` via `/v1/notifications/verify-webhook-signature`.
 *
 * Event mapping (license + its seats + tenant.billing when the tenant's
 * billing block references this same subscription):
 *
 *   BILLING.SUBSCRIPTION.CANCELLED   license=canceled  seats→revoked   billing=canceled
 *   BILLING.SUBSCRIPTION.EXPIRED     license=canceled  seats→revoked   billing=canceled
 *   BILLING.SUBSCRIPTION.SUSPENDED   license=past_due  seats→suspended billing=paused
 *   BILLING.SUBSCRIPTION.PAYMENT.FAILED
 *                                    license=past_due  seats untouched billing=past_due
 *   BILLING.SUBSCRIPTION.ACTIVATED / RE-ACTIVATED
 *                                    license=active    suspended seats→active  billing=active
 *   PAYMENT.SALE.COMPLETED (renewal) license=active + refresh current_period_end
 *
 * License CREATION stays in `checkout-confirm` (idempotent, user-context).
 * If ACTIVATED arrives for an unknown subscription we log and return 200 —
 * the confirm endpoint will create it when the buyer lands back on the site.
 *
 * Idempotency: every handler below is a status SET, so PayPal's at-least-once
 * delivery and retries are naturally safe to replay.
 */

const SIGNATURE_HEADERS = [
  'paypal-auth-algo',
  'paypal-cert-url',
  'paypal-transmission-id',
  'paypal-transmission-sig',
  'paypal-transmission-time',
] as const;

interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource?: {
    /** Subscription id (`I-...`) on BILLING.SUBSCRIPTION.* events. */
    id?: string;
    /** Subscription id on PAYMENT.SALE.* events. */
    billing_agreement_id?: string;
    status?: string;
  };
}

interface StateChange {
  license: LicenseStatus;
  billing: BillingStatus;
  /** Move seats currently in `from` to `to`. Omit to leave seats untouched. */
  seats?: { from: readonly SeatStatus[]; to: SeatStatus };
  /** Also refresh `current_period_end` from PayPal. */
  refreshPeriodEnd?: boolean;
}

const EVENT_STATE: Record<string, StateChange> = {
  'BILLING.SUBSCRIPTION.CANCELLED': {
    license: 'canceled',
    billing: 'canceled',
    seats: { from: ['active', 'suspended'], to: 'revoked' },
  },
  'BILLING.SUBSCRIPTION.EXPIRED': {
    license: 'canceled',
    billing: 'canceled',
    seats: { from: ['active', 'suspended'], to: 'revoked' },
  },
  'BILLING.SUBSCRIPTION.SUSPENDED': {
    license: 'past_due',
    billing: 'paused',
    seats: { from: ['active'], to: 'suspended' },
  },
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
    license: 'past_due',
    billing: 'past_due',
  },
  'BILLING.SUBSCRIPTION.ACTIVATED': {
    license: 'active',
    billing: 'active',
    seats: { from: ['suspended'], to: 'active' },
    refreshPeriodEnd: true,
  },
  'BILLING.SUBSCRIPTION.RE-ACTIVATED': {
    license: 'active',
    billing: 'active',
    seats: { from: ['suspended'], to: 'active' },
    refreshPeriodEnd: true,
  },
  'PAYMENT.SALE.COMPLETED': {
    license: 'active',
    billing: 'active',
    refreshPeriodEnd: true,
  },
};

function subscriptionIdFrom(event: PayPalWebhookEvent): string | null {
  if (event.event_type.startsWith('BILLING.SUBSCRIPTION.')) {
    return event.resource?.id ?? null;
  }
  if (event.event_type.startsWith('PAYMENT.SALE.')) {
    return event.resource?.billing_agreement_id ?? null;
  }
  return null;
}

async function fetchPeriodEnd(subscriptionId: string): Promise<number | undefined> {
  try {
    const sub = await getPayPalSubscription(subscriptionId);
    const next = sub.billing_info?.next_billing_time;
    if (!next) return undefined;
    const epoch = Math.floor(new Date(next).getTime() / 1000);
    return Number.isFinite(epoch) ? epoch : undefined;
  } catch (err) {
    console.error('[webhook-paypal] subscription fetch failed (period end skipped):', err);
    return undefined;
  }
}

async function applyStateChange(
  subscriptionId: string,
  change: StateChange,
): Promise<{ applied: boolean; seatsTouched: number }> {
  const license = await findLicenseBySubscriptionIdGlobal(subscriptionId);
  if (!license) {
    console.warn(
      `[webhook-paypal] no license for subscription ${subscriptionId} — skipping (creation belongs to checkout-confirm)`,
    );
    return { applied: false, seatsTouched: 0 };
  }

  const periodEnd = change.refreshPeriodEnd ? await fetchPeriodEnd(subscriptionId) : undefined;

  await updateLicenseStatus(license.tenant_id, license.license_id, change.license, periodEnd);

  let seatsTouched = 0;
  if (change.seats) {
    const { from, to } = change.seats;
    const tenantSeats = await getSeatsByTenant(license.tenant_id);
    const targets = tenantSeats.filter(
      (s) => s.license_id === license.license_id && from.includes(s.status),
    );
    await Promise.all(targets.map((s) => setSeatStatus(s.seat_id, to)));
    seatsTouched = targets.length;
  }

  // Only touch the tenant's billing block when it points at THIS subscription.
  // A tenant can hold several licenses; another license's lifecycle must not
  // flip the whole tenant (the MCP gates on tenant.billing.status).
  const tenant = await getTenantById(license.tenant_id);
  if (
    tenant &&
    tenant.billing.subscription_id === subscriptionId &&
    tenant.billing.status !== change.billing
  ) {
    await updateTenantBillingStatus(license.tenant_id, change.billing, periodEnd);
  }

  return { applied: true, seatsTouched };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const webhookId = process.env['PAYPAL_WEBHOOK_ID'] ?? '';
  if (webhookId.length === 0) {
    console.error('[webhook-paypal] PAYPAL_WEBHOOK_ID is not set — rejecting');
    return json(500, { error: 'webhook_not_configured' });
  }

  const headers: Record<string, string> = {};
  for (const name of SIGNATURE_HEADERS) {
    const value = event.headers[name];
    if (!value) return json(400, { error: 'missing_signature_headers' });
    headers[name] = value;
  }

  if (!event.body) return json(400, { error: 'empty_body' });
  let webhookEvent: PayPalWebhookEvent;
  try {
    webhookEvent = JSON.parse(event.body) as PayPalWebhookEvent;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  let verified: boolean;
  try {
    verified = await verifyPayPalWebhookSignature({
      webhookId,
      headers: headers as unknown as PayPalWebhookHeaders,
      body: webhookEvent,
    });
  } catch (err) {
    console.error('[webhook-paypal] signature verification call failed:', err);
    // 5xx so PayPal retries later instead of dropping the event.
    return json(502, { error: 'verification_unavailable' });
  }
  if (!verified) return json(400, { error: 'invalid_signature' });

  console.warn(`[webhook-paypal] ${webhookEvent.event_type} (${webhookEvent.id})`);

  const change = EVENT_STATE[webhookEvent.event_type];
  if (!change) {
    // Acknowledge everything else (CREATED, UPDATED, CHECKOUT.*, ...) so
    // PayPal doesn't retry events we deliberately ignore.
    return json(200, { received: true, handled: false });
  }

  const subscriptionId = subscriptionIdFrom(webhookEvent);
  if (!subscriptionId) {
    console.warn('[webhook-paypal] event has no subscription id — acknowledging');
    return json(200, { received: true, handled: false });
  }

  const result = await applyStateChange(subscriptionId, change);
  return json(200, {
    received: true,
    handled: result.applied,
    seats_touched: result.seatsTouched,
  });
};
