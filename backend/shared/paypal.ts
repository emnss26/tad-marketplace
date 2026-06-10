/**
 * PayPal REST API wrapper for the marketplace backend.
 *
 * - OAuth2 client_credentials with an in-memory access-token cache (PayPal's
 *   tokens live ~8 hours; we refresh 5 min before expiry).
 * - Thin typed helpers around the endpoints we actually call:
 *     - Catalog: products + billing plans (seed-only)
 *     - Subscriptions: create, get, cancel
 *     - Notifications: verify webhook signature
 *
 * Env:
 *   PAYPAL_ENV          'sandbox' (default) | 'live'
 *   PAYPAL_CLIENT_ID    REQUIRED
 *   PAYPAL_CLIENT_SECRET REQUIRED
 *   PAYPAL_WEBHOOK_ID   set after `/webhooks/paypal` is deployed and registered
 *                       in PayPal Dashboard → Webhooks
 */

interface PayPalEnv {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

interface CachedToken {
  token: string;
  /** Unix seconds. We refresh when `now + 300 >= expiresAt`. */
  expiresAt: number;
}

let cached: CachedToken | null = null;

function getEnv(): PayPalEnv {
  const env = process.env['PAYPAL_ENV'] ?? 'sandbox';
  const baseUrl =
    env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const clientId = process.env['PAYPAL_CLIENT_ID'] ?? '';
  const clientSecret = process.env['PAYPAL_CLIENT_SECRET'] ?? '';
  if (clientId.length === 0 || clientSecret.length === 0) {
    throw new Error(
      'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in the environment',
    );
  }
  return { baseUrl, clientId, clientSecret };
}

/** Returns a cached or freshly-issued PayPal access token. */
export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 300) return cached.token;

  const { baseUrl, clientId, clientSecret } = getEnv();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal OAuth failed: ${res.status.toString()} ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

/** Authenticated PayPal API call. Throws on non-2xx with the response body. */
export async function paypalFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const token = await getAccessToken();
  const { baseUrl } = getEnv();

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PayPal ${path} failed: ${res.status.toString()} ${text}`);
  }
  return (text.length > 0 ? JSON.parse(text) : {}) as T;
}

// ─────────── Catalog (seed-only) ───────────

export interface PayPalProduct {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  create_time: string;
}

export function createPayPalProduct(input: {
  name: string;
  description: string;
}): Promise<PayPalProduct> {
  return paypalFetch<PayPalProduct>('/v1/catalogs/products', {
    method: 'POST',
    body: {
      name: input.name,
      description: input.description,
      type: 'SERVICE',
      category: 'SOFTWARE',
    },
  });
}

export interface PayPalPlan {
  id: string;
  product_id: string;
  name: string;
  status: 'CREATED' | 'INACTIVE' | 'ACTIVE';
}

export function createPayPalPlan(input: {
  productId: string;
  name: string;
  description: string;
  priceUsdCents: number;
}): Promise<PayPalPlan> {
  return paypalFetch<PayPalPlan>('/v1/billing/plans', {
    method: 'POST',
    body: {
      product_id: input.productId,
      name: input.name,
      description: input.description,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: (input.priceUsdCents / 100).toFixed(2),
              currency_code: 'USD',
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    },
  });
}

// ─────────── Subscriptions ───────────

export interface PayPalSubscription {
  id: string;
  status: 'APPROVAL_PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
  plan_id: string;
  /** Number of units subscribed. Multiplies plan price and (for us) seats_quota. */
  quantity?: string;
  start_time?: string;
  custom_id?: string;
  subscriber?: { email_address?: string; name?: { given_name?: string; surname?: string } };
  billing_info?: { next_billing_time?: string };
  links: { href: string; rel: string; method: string }[];
}

export function createPayPalSubscription(input: {
  planId: string;
  brandName: string;
  returnUrl: string;
  cancelUrl: string;
  customerEmail: string;
  /** Our internal correlation id (e.g. `user_id`) — echoed back on webhook events. */
  customId: string;
}): Promise<PayPalSubscription> {
  // Note: we intentionally don't pass `quantity`. Our Plans were created with
  // `quantity_supported: false` (PayPal's default), so any quantity field
  // triggers `SUBSCRIPTION_CANNOT_HAVE_QUANTITY`. Seat counts come from the
  // tier itself (Personal=1, SMB=5, Enterprise=25) — one subscription = one
  // license with the tier's `seatsIncluded`.
  return paypalFetch<PayPalSubscription>('/v1/billing/subscriptions', {
    method: 'POST',
    body: {
      plan_id: input.planId,
      custom_id: input.customId,
      application_context: {
        brand_name: input.brandName,
        locale: 'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
      subscriber: { email_address: input.customerEmail },
    },
  });
}

export function getPayPalSubscription(subscriptionId: string): Promise<PayPalSubscription> {
  return paypalFetch<PayPalSubscription>(`/v1/billing/subscriptions/${subscriptionId}`);
}

export function cancelPayPalSubscription(
  subscriptionId: string,
  reason: string,
): Promise<void> {
  return paypalFetch<void>(`/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    body: { reason },
  });
}

// ─────────── Webhook verification ───────────

export interface PayPalWebhookHeaders {
  'paypal-auth-algo': string;
  'paypal-cert-url': string;
  'paypal-transmission-id': string;
  'paypal-transmission-sig': string;
  'paypal-transmission-time': string;
}

export async function verifyPayPalWebhookSignature(input: {
  webhookId: string;
  headers: PayPalWebhookHeaders;
  /** The RAW JSON body sent by PayPal — DO NOT re-stringify. */
  body: unknown;
}): Promise<boolean> {
  const res = await paypalFetch<{ verification_status: 'SUCCESS' | 'FAILURE' }>(
    '/v1/notifications/verify-webhook-signature',
    {
      method: 'POST',
      body: {
        auth_algo: input.headers['paypal-auth-algo'],
        cert_url: input.headers['paypal-cert-url'],
        transmission_id: input.headers['paypal-transmission-id'],
        transmission_sig: input.headers['paypal-transmission-sig'],
        transmission_time: input.headers['paypal-transmission-time'],
        webhook_id: input.webhookId,
        webhook_event: input.body,
      },
    },
  );
  return res.verification_status === 'SUCCESS';
}
