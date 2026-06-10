import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

/**
 * POST /webhooks/stripe
 *
 * Sprint 3: verify Stripe signature with STRIPE_WEBHOOK_SECRET, then handle:
 *   - checkout.session.completed         -> create `tenant` + `license` (seats_quota=qty)
 *   - customer.subscription.updated      -> patch license.status + current_period_end
 *   - customer.subscription.deleted      -> mark license + tenant billing canceled;
 *                                           seats stay but MCP rejects within ~5 min (cache TTL)
 *   - invoice.payment_failed             -> mark license.status=past_due
 *
 * Idempotent on stripe event id.
 */
export const handler: APIGatewayProxyHandlerV2 = async (_event) => {
  return {
    statusCode: 501,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'not_implemented', sprint: 3 }),
  };
};
