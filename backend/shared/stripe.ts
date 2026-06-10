/**
 * Stripe client wrapper.
 *
 * Sprint 3 will instantiate the Stripe SDK with STRIPE_SECRET_KEY pulled from
 * Secrets Manager at Lambda cold-start, then expose:
 *   - createCheckoutSession(args)
 *   - verifyWebhookSignature(rawBody, signatureHeader)
 *   - createCustomerPortalSession(customer_id)
 *   - listSubscriptions(customer_id)
 *
 * Note: STRIPE_WEBHOOK_SECRET is a separate secret per endpoint.
 */

export function getStripeClient(): never {
  throw new Error('not implemented (Sprint 3)');
}
