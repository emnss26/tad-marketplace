import type { Plan, ProductId } from '../types/control-plane.js';

/**
 * Server-side catalogue with PayPal plan IDs.
 *
 * Generated once from `out/paypal-ids.json` produced by
 * `scripts/seed-products-paypal.mjs`. If you re-seed PayPal in a different
 * environment (e.g. live), regenerate this file. Sprint 6 will replace this
 * with a DB-backed catalogue read from `tad-mcp-aws-products`.
 */

export interface TierConfig {
  /** PayPal Plan ID (`P-...`). */
  paypal_plan_id: string;
  /** Seats provisioned per unit purchased. Total = seatsIncluded × quantity. */
  seatsIncluded: number;
  /** Reference price for license bookkeeping; PayPal is the source of truth. */
  priceUsdCents: number;
}

export interface InstallerConfig {
  /** S3 object key inside `INSTALLER_BUCKET`. Admin uploads here. */
  key: string;
  /** Filename the browser saves as (via ResponseContentDisposition). */
  downloadFilename: string;
}

interface ProductConfig {
  name: string;
  description: string;
  status: 'live' | 'coming_soon';
  /** PayPal Product ID (`PROD-...`). */
  paypal_product_id: string;
  tiers: Record<Plan, TierConfig>;
  /** Set for downloadable products. `prd_platform` is a web app so no installer. */
  installer?: InstallerConfig;
}

export const CATALOG: Record<ProductId, ProductConfig> = {
  prd_revit_mcp: {
    name: 'TAD MCP for Revit',
    description: 'Remote MCP server exposing Autodesk Revit actions to Claude.',
    status: 'live',
    paypal_product_id: 'PROD-4714634580123631X',
    installer: {
      key: 'prd_revit_mcp/latest/installer',
      // Deliverable is a zip of `TAD_MCP_AWS/installer/` (PowerShell-based kit:
      // install.ps1 + payload/<rev_version>/*.dll). Customer extracts, then
      // runs `install.ps1 -Token <seat token> -Hostname <pc hostname>`.
      // When/if we wrap it with Inno Setup (`TAD-MCP-Revit-Setup.exe`), update
      // both the S3 upload and this filename in lockstep.
      downloadFilename: 'TAD-MCP-Revit-Installer.zip',
    },
    tiers: {
      personal: {
        paypal_plan_id: 'P-68259112D12099502NIUEXUQ',
        seatsIncluded: 1,
        priceUsdCents: 2000,
      },
      smb: {
        paypal_plan_id: 'P-4L619426Y2907835SNIUEXUY',
        seatsIncluded: 5,
        priceUsdCents: 3900,
      },
      enterprise: {
        paypal_plan_id: 'P-7KK47696H4296721WNIUEXUY',
        seatsIncluded: 25,
        priceUsdCents: 4900,
      },
    },
  },
  prd_acad_mcp: {
    name: 'TAD MCP for AutoCAD',
    description: 'Same Bearer-token + hostname model wrapping AutoCAD.',
    status: 'coming_soon',
    paypal_product_id: 'PROD-7RS163903D5418143',
    tiers: {
      personal: {
        paypal_plan_id: 'P-1S748213LN116301CNIUEXVA',
        seatsIncluded: 1,
        priceUsdCents: 2000,
      },
      smb: {
        paypal_plan_id: 'P-9V399236TW9331731NIUEXVI',
        seatsIncluded: 5,
        priceUsdCents: 3900,
      },
      enterprise: {
        paypal_plan_id: 'P-4CH35211T5698253JNIUEXVI',
        seatsIncluded: 25,
        priceUsdCents: 4900,
      },
    },
  },
  prd_platform: {
    name: 'TAD Platform',
    description: 'BIM coordination, project tracking, AEC data model, and AI features.',
    status: 'live',
    paypal_product_id: 'PROD-2BR37600N8531431G',
    tiers: {
      personal: {
        paypal_plan_id: 'P-90K31590N3464582MNIUEXVQ',
        seatsIncluded: 1,
        priceUsdCents: 2000,
      },
      smb: {
        paypal_plan_id: 'P-2EN48215UN973764PNIUEXVQ',
        seatsIncluded: 5,
        priceUsdCents: 3900,
      },
      enterprise: {
        paypal_plan_id: 'P-3LK682023X683984JNIUEXVY',
        seatsIncluded: 25,
        priceUsdCents: 4900,
      },
    },
  },
};

/** Throws on unknown (productId, plan). */
export function getTier(productId: ProductId, plan: Plan): TierConfig {
  const product = CATALOG[productId];
  if (!product) throw new Error(`unknown product_id: ${productId}`);
  const tier = product.tiers[plan];
  if (!tier) throw new Error(`unknown plan ${plan} for product ${productId}`);
  return tier;
}

/** Throws on unknown product_id. */
export function getProduct(productId: ProductId): ProductConfig {
  const product = CATALOG[productId];
  if (!product) throw new Error(`unknown product_id: ${productId}`);
  return product;
}

/** Reverse map used by the webhook to figure out which product/plan a PayPal plan_id corresponds to. */
export function findProductByPlanId(
  paypalPlanId: string,
): { productId: ProductId; plan: Plan } | null {
  for (const productId of Object.keys(CATALOG) as ProductId[]) {
    const product = CATALOG[productId];
    if (!product) continue;
    for (const plan of Object.keys(product.tiers) as Plan[]) {
      const tier = product.tiers[plan];
      if (tier?.paypal_plan_id === paypalPlanId) {
        return { productId, plan };
      }
    }
  }
  return null;
}
