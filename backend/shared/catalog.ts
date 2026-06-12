import type { Plan, ProductId } from '../types/control-plane.js';

/**
 * Server-side catalogue with PayPal plan IDs.
 *
 * IDs come from `out/paypal-ids.json` (sandbox) / `out/paypal-ids.json` after a
 * live seed (live), both produced by `scripts/seed-products-paypal.mjs`. The
 * active set is selected by `PAYPAL_ENV` so local dev (sandbox) and production
 * (live) share this file. Prices must stay in sync with
 * `scripts/seed-products-paypal.mjs`, `scripts/update-plan-prices.mjs` and
 * `frontend/lib/products.ts`. Sprint 6 will replace this with a DB-backed
 * catalogue read from `tad-mcp-aws-products`.
 */

type PayPalCatalogEnv = 'sandbox' | 'live';

const PAYPAL_CATALOG_ENV: PayPalCatalogEnv =
  (process.env['PAYPAL_ENV'] ?? 'sandbox') === 'live' ? 'live' : 'sandbox';

interface ProductIds {
  product: string;
  plans: Record<Plan, string>;
}

const PAYPAL_IDS: Record<PayPalCatalogEnv, Record<ProductId, ProductIds>> = {
  sandbox: {
    prd_revit_mcp: {
      product: 'PROD-4714634580123631X',
      plans: {
        personal: 'P-68259112D12099502NIUEXUQ',
        smb: 'P-4L619426Y2907835SNIUEXUY',
        enterprise: 'P-7KK47696H4296721WNIUEXUY',
      },
    },
    prd_acad_mcp: {
      product: 'PROD-7RS163903D5418143',
      plans: {
        personal: 'P-1S748213LN116301CNIUEXVA',
        smb: 'P-9V399236TW9331731NIUEXVI',
        enterprise: 'P-4CH35211T5698253JNIUEXVI',
      },
    },
    prd_platform: {
      product: 'PROD-2BR37600N8531431G',
      plans: {
        personal: 'P-90K31590N3464582MNIUEXVQ',
        smb: 'P-2EN48215UN973764PNIUEXVQ',
        enterprise: 'P-3LK682023X683984JNIUEXVY',
      },
    },
  },
  live: {
    prd_revit_mcp: {
      product: 'PROD-4VN13034D6589645C',
      plans: {
        personal: 'P-62E781791K2480405NIUZYUQ',
        smb: 'P-5TW64190XC2190536NIUZYUQ',
        enterprise: 'P-5GG821592R687974PNIUZYUQ',
      },
    },
    prd_acad_mcp: {
      product: 'PROD-0SW92941BY031193Y',
      plans: {
        personal: 'P-5XV057390L4310915NIUZYUY',
        smb: 'P-3R252307WX518212PNIUZYUY',
        enterprise: 'P-21N46861RY6767427NIUZYUY',
      },
    },
    prd_platform: {
      product: 'PROD-5ST09981R57278100',
      plans: {
        personal: 'P-9YJ39111WP503573PNIUZYVY',
        smb: 'P-1TT71683HN566905ANIUZYVY',
        enterprise: 'P-4W7036348D4083406NIUZYVY',
      },
    },
  },
};

const IDS = PAYPAL_IDS[PAYPAL_CATALOG_ENV];

/** USD cents per month. personal=1 seat, smb=5 seats, enterprise=25 seats.
 * Enterprise is sold via "Contact sales"; the price here is the internal anchor. */
const PRICES: Record<Plan, number> = {
  personal: 8900,
  smb: 41900,
  enterprise: 99900,
};

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
  /**
   * 'self_serve' = buyable via cart/PayPal checkout.
   * 'quote' = sales-led only (e.g. TAD Platform needs the customer's APS app
   * credentials + ACC hub id — provisioning is manual). checkout-session
   * rejects quote products.
   */
  purchase: 'self_serve' | 'quote';
  /** PayPal Product ID (`PROD-...`). */
  paypal_product_id: string;
  tiers: Record<Plan, TierConfig>;
  /** Set for downloadable products. `prd_platform` is a web app so no installer. */
  installer?: InstallerConfig;
}

function tiersFor(productId: ProductId): Record<Plan, TierConfig> {
  const ids = IDS[productId];
  return {
    personal: {
      paypal_plan_id: ids.plans.personal,
      seatsIncluded: 1,
      priceUsdCents: PRICES.personal,
    },
    smb: {
      paypal_plan_id: ids.plans.smb,
      seatsIncluded: 5,
      priceUsdCents: PRICES.smb,
    },
    enterprise: {
      paypal_plan_id: ids.plans.enterprise,
      seatsIncluded: 25,
      priceUsdCents: PRICES.enterprise,
    },
  };
}

export const CATALOG: Record<ProductId, ProductConfig> = {
  prd_revit_mcp: {
    name: 'TAD MCP for Revit',
    description: 'Remote MCP server exposing Autodesk Revit actions to Claude.',
    status: 'live',
    purchase: 'self_serve',
    paypal_product_id: IDS.prd_revit_mcp.product,
    installer: {
      key: 'prd_revit_mcp/latest/installer',
      // Deliverable is a zip of `TAD_MCP_AWS/installer/` (PowerShell-based kit:
      // install.ps1 + payload/<rev_version>/*.dll). Customer extracts, then
      // runs `install.ps1 -Token <seat token> -Hostname <pc hostname>`.
      // When/if we wrap it with Inno Setup (`TAD-MCP-Revit-Setup.exe`), update
      // both the S3 upload and this filename in lockstep.
      downloadFilename: 'TAD-MCP-Revit-Installer.zip',
    },
    tiers: tiersFor('prd_revit_mcp'),
  },
  prd_acad_mcp: {
    name: 'TAD MCP for AutoCAD',
    description: 'Same Bearer-token + hostname model wrapping AutoCAD.',
    status: 'coming_soon',
    purchase: 'self_serve',
    paypal_product_id: IDS.prd_acad_mcp.product,
    tiers: tiersFor('prd_acad_mcp'),
  },
  prd_platform: {
    name: 'TAD Platform',
    description: 'BIM coordination, project tracking, AEC data model, and AI features.',
    status: 'live',
    purchase: 'quote',
    paypal_product_id: IDS.prd_platform.product,
    tiers: tiersFor('prd_platform'),
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
