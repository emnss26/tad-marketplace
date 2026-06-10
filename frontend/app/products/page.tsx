import type { Metadata } from 'next';
import AddToCartButton from '@/components/AddToCartButton';
import Hero from '@/components/Hero';
import { PLAN_LABELS, PLANS, PRODUCTS } from '@/lib/products';

export const metadata: Metadata = {
  title: 'Products',
  description:
    'Browse TAD MCP for Revit, TAD MCP for AutoCAD, and the TAD Platform. Per-seat licensing, monthly subscription, cancel any time.',
};

function priceLabel(cents: number): string {
  // Compact: drop the ".00" for whole-dollar prices.
  return cents % 100 === 0 ? `$${(cents / 100).toString()}` : `$${(cents / 100).toFixed(2)}`;
}

export default function ProductsPage() {
  return (
    <>
      <Hero align="center">
        <span className="eyebrow">Catalogue</span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
          All <span className="text-brand-600">TAD products</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-600">
          Three products, three pricing tiers each. Per-seat licensing. Cancel
          any time.
        </p>
      </Hero>

      {PRODUCTS.map((product, idx) => (
        <section
          key={product.id}
          className={`section ${idx % 2 === 1 ? 'bg-ink-50' : 'bg-white'}`}
        >
          <div className="container-tad">
            <header className="mb-12 max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-semibold leading-tight md:text-4xl">
                  {product.name}
                </h2>
                {product.status === 'coming_soon' && (
                  <span className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="mt-3 text-lg font-medium text-ink-700">{product.tagline}</p>
              <p className="mt-4 text-ink-600">{product.description}</p>
            </header>

            <div className="grid gap-6 md:grid-cols-3">
              {PLANS.map((plan) => {
                const tier = product.tiers[plan];
                return (
                  <article key={plan} className="card flex flex-col text-left">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                      {PLAN_LABELS[plan]}
                    </p>
                    <p className="mt-3 text-3xl font-bold text-ink-900">
                      {priceLabel(tier.priceUsdCents)}
                      <span className="ml-1 text-sm font-medium text-ink-500">/mo</span>
                    </p>
                    <p className="mt-3 text-sm text-ink-600">{tier.description}</p>
                    <p className="mt-2 text-sm font-medium text-ink-800">
                      {tier.seatsIncluded.toString()} seat{tier.seatsIncluded === 1 ? '' : 's'}{' '}
                      included
                    </p>
                    <div className="mt-auto pt-6">
                      <AddToCartButton
                        productId={product.id}
                        productName={product.name}
                        plan={plan}
                        priceUsdCents={tier.priceUsdCents}
                        disabled={product.status === 'coming_soon'}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
