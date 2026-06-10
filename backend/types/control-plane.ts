/**
 * Control plane DynamoDB item types — local mirror of CONTROL_PLANE.md.
 *
 * SOURCE OF TRUTH: TAD_MCP_AWS/docs/CONTROL_PLANE.md
 *
 * TODO(shared-types): migrate to @tad/shared-types once the shared package is
 * published to GitHub Packages. Until then, this file is the local mirror of
 * the canonical schema. Any change here MUST be reflected in:
 *   1. TAD_MCP_AWS/docs/CONTROL_PLANE.md
 *   2. TAD_MCP_AWS source (Revit MCP)
 *   3. A bump of @tad/shared-types when it exists
 * Forward-additive only: never remove or rename attributes without a migration.
 */

export const PRODUCT_IDS = ['prd_revit_mcp', 'prd_acad_mcp', 'prd_platform'] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

export const PLANS = ['personal', 'smb', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export const TENANT_TYPES = ['individual', 'company'] as const;
export type TenantType = (typeof TENANT_TYPES)[number];

export const CHANNELS = ['web', 'marketplace', 'direct'] as const;
export type Channel = (typeof CHANNELS)[number];

export const BILLING_PROVIDERS = ['stripe', 'paypal', 'manual'] as const;
export type BillingProvider = (typeof BILLING_PROVIDERS)[number];

export const BILLING_STATUSES = ['active', 'past_due', 'canceled', 'paused'] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const LICENSE_STATUSES = ['active', 'past_due', 'canceled'] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const SEAT_STATUSES = ['active', 'suspended', 'revoked'] as const;
export type SeatStatus = (typeof SEAT_STATUSES)[number];

export const PRODUCT_STATUSES = ['live', 'coming_soon', 'deprecated'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const USAGE_EVENT_STATUSES = ['succeeded', 'failed', 'timed_out'] as const;
export type UsageEventStatus = (typeof USAGE_EVENT_STATUSES)[number];

/** Table: tad-mcp-aws-tenants. PK: tenant_id (prefix `tnt_`, ulid). */
export interface Tenant {
  tenant_id: string;
  type: TenantType;
  legal_name: string;
  contact_email: string;
  country: string; // ISO-3166 alpha-2
  channel: Channel;
  billing: {
    provider: BillingProvider;
    subscription_id: string;
    status: BillingStatus;
    current_period_end: number; // unix seconds
  };
  created_at: number;
  updated_at: number;
}

export const SUBSCRIPTION_PROVIDERS = ['paypal', 'stripe', 'manual'] as const;
export type SubscriptionProvider = (typeof SUBSCRIPTION_PROVIDERS)[number];

/** Table: tad-mcp-aws-licenses. PK: tenant_id, SK: license_id (prefix `lic_`). GSI: product_idx. */
export interface License {
  tenant_id: string;
  license_id: string;
  product_id: ProductId;
  plan: Plan;
  seats_quota: number;
  seats_used: number;
  status: LicenseStatus;
  /** Legacy Stripe-only field. Kept for back-compat. New writes prefer `subscription_id`. */
  stripe_subscription_id: string;
  /** Generic subscription id across providers (PayPal `I-XXX`, Stripe `sub_XXX`, etc). */
  subscription_id?: string;
  /** Payment provider that issued this subscription. */
  subscription_provider?: SubscriptionProvider;
  current_period_end: number;
  created_at: number;
  updated_at: number;
}

/** Table: tad-mcp-aws-seats. PK: seat_id (prefix `seat_`). GSI: token_hash_idx (projection ALL). */
export interface Seat {
  seat_id: string;
  tenant_id: string;
  license_id: string;
  product_id: ProductId;
  /** SHA-256 hex of plaintext token. Plaintext is NEVER stored. */
  token_hash: string;
  /** Lower-case. */
  hostname: string;
  status: SeatStatus;
  assigned_to_email: string;
  created_at: number;
  last_seen_at: number;
  revit_versions_seen?: string[];
}

/** Table: tad-mcp-aws-usage-events. PK: tenant_id_month, SK: ts_event_id. TTL: ttl_epoch (90 days). */
export interface UsageEvent {
  /** Format `tnt_xxx#YYYY-MM`. */
  tenant_id_month: string;
  /** Format `<unix_ts>#<event_ulid>`. */
  ts_event_id: string;
  tenant_id: string;
  seat_id: string;
  hostname: string;
  product_id: ProductId;
  tool_name: string;
  status: UsageEventStatus;
  latency_ms: number;
  revit_version: string;
  ttl_epoch: number;
}

/** Table: tad-mcp-aws-products. PK: product_id (prefix `prd_`). */
export interface Product {
  product_id: ProductId;
  name: string;
  description: string;
  status: ProductStatus;
  tier_prices_usd_cents: Record<Plan, number>;
  stripe_product_ids: Record<Plan, string>;
  stripe_price_ids: Record<Plan, string>;
  documentation_url: string;
  created_at: number;
  updated_at: number;
}

/** Marketplace-only. Table: tad-marketplace-users. PK: email. */
export interface User {
  email: string;
  user_id: string;
  created_at: number;
  updated_at?: number;
  /** Captured at signup. Optional because legacy single-email logins skip it. */
  first_name?: string;
  last_name?: string;
  company_name?: string;
  tenants_owned: string[];
  tenants_member_of: string[];
}

/** Profile fields captured at signup, forwarded through the magic-link round-trip. */
export interface AuthTokenProfile {
  first_name?: string;
  last_name?: string;
  company_name?: string;
}

/** Marketplace-only. Table: tad-marketplace-auth-tokens. PK: token_hash. TTL ~15 min. */
export interface AuthToken {
  /** SHA-256 hex of the plaintext magic-link token. */
  token_hash: string;
  email: string;
  created_at: number;
  /** Unix seconds, 15 min after created_at. */
  expires_at: number;
  /** DynamoDB TTL attribute. */
  ttl_epoch: number;
  /** Set when verify-link is used; prevents replay. */
  consumed_at?: number;
  /**
   * Profile data submitted at signup (`/signup` form). Applied on first user
   * creation only — does NOT overwrite an existing user's profile, even if a
   * later signup form is submitted for the same email.
   */
  profile?: AuthTokenProfile;
  /**
   * When this token comes from `team-invite`, these fields tell `auth-verify`
   * to add the invitee to the target tenant's `tenants_member_of` instead of
   * (or in addition to) the usual signup flow.
   */
  invite_to_tenant_id?: string;
  invite_to_license_id?: string;
  invited_by_user_id?: string;
}
