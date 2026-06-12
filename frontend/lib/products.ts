/**
 * Marketplace catalogue data.
 *
 * Hardcoded for Sprint 2/3. When Stripe Checkout lands, the canonical source
 * becomes the `tad-mcp-aws-products` DynamoDB table seeded by
 * `scripts/seed-products.mjs`; this file will then be derived at build time.
 */

export const PRODUCT_IDS = ['prd_revit_mcp', 'prd_acad_mcp', 'prd_platform'] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

export const PLANS = ['personal', 'smb', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_LABELS: Record<Plan, string> = {
  personal: 'Personal',
  smb: 'Team',
  enterprise: 'Enterprise',
};

/** Email used by "Contact sales" CTAs (enterprise tier is not self-serve). */
export const SALES_EMAIL = 'taller.arq.dgtl@gmail.com';

export interface ProductTier {
  priceUsdCents: number;
  seatsIncluded: number;
  description: string;
}

export interface Product {
  id: ProductId;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  status: 'live' | 'coming_soon';
  /** 'self_serve' = cart + PayPal checkout. 'quote' = Contact-sales only. */
  purchase: 'self_serve' | 'quote';
  /** How the customer accesses the product after subscribing. */
  delivery: 'installer' | 'web';
  /** For `web` products, the URL to open after purchase (e.g. platform.tad.com.mx). */
  webUrl?: string;
  tiers: Record<Plan, ProductTier>;
}

export const PRODUCTS: readonly Product[] = [
  {
    id: 'prd_revit_mcp',
    slug: 'revit-mcp',
    name: 'TAD MCP for Revit',
    tagline: 'Drive Autodesk Revit from Claude and other MCP clients.',
    description:
      'A remote MCP server that exposes Revit actions — query elements, create walls and rooms, run QA, push parameters — to any MCP-aware LLM client. One Bearer token per PC.',
    status: 'live',
    purchase: 'self_serve',
    delivery: 'installer',
    tiers: {
      personal: { priceUsdCents: 8900, seatsIncluded: 1, description: '1 PC, individual use' },
      smb: { priceUsdCents: 41900, seatsIncluded: 5, description: 'Up to 5 PCs, team admin' },
      enterprise: {
        priceUsdCents: 99900,
        seatsIncluded: 25,
        description: 'Up to 25 PCs, SSO-ready',
      },
    },
  },
  {
    id: 'prd_acad_mcp',
    slug: 'autocad-mcp',
    name: 'TAD MCP for AutoCAD',
    tagline: 'Same model for AutoCAD.',
    description:
      'Same Bearer-token + hostname model, this time wrapping AutoCAD. Launching alongside the Revit MCP — pricing parity.',
    status: 'coming_soon',
    purchase: 'self_serve',
    delivery: 'installer',
    tiers: {
      personal: { priceUsdCents: 8900, seatsIncluded: 1, description: '1 PC, individual use' },
      smb: { priceUsdCents: 41900, seatsIncluded: 5, description: 'Up to 5 PCs, team admin' },
      enterprise: {
        priceUsdCents: 99900,
        seatsIncluded: 25,
        description: 'Up to 25 PCs, SSO-ready',
      },
    },
  },
  {
    id: 'prd_platform',
    slug: 'platform',
    name: 'TAD Platform',
    tagline: 'BIM coordination + project tracking + AI.',
    description:
      'Full TAD Platform subscription: drawing control, 4D-5D site tracking, model audit, AEC data model integration, and AI features powered by Google Gemini. Deployment requires your ACC hub id and APS app credentials — provisioning is sales-led.',
    status: 'live',
    purchase: 'quote',
    delivery: 'web',
    webUrl: 'https://platform.tad.com.mx',
    tiers: {
      personal: {
        priceUsdCents: 8900,
        seatsIncluded: 1,
        description: '1 named user, individual workspace',
      },
      smb: {
        priceUsdCents: 41900,
        seatsIncluded: 5,
        description: 'Up to 5 users, shared projects',
      },
      enterprise: {
        priceUsdCents: 99900,
        seatsIncluded: 25,
        description: 'Up to 25 users, org-wide projects',
      },
    },
  },
];

export function findProduct(id: ProductId): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
