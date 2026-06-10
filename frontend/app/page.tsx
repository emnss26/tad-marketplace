import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Hero from '@/components/Hero';
import Section from '@/components/Section';

const PRODUCTS = [
  { id: 'prd_revit_mcp', name: 'TAD MCP for Revit', status: 'Live' },
  { id: 'prd_acad_mcp', name: 'TAD MCP for AutoCAD', status: 'Coming soon' },
  { id: 'prd_platform', name: 'TAD Platform', status: 'Live' },
] as const;

export default function HomePage() {
  return (
    <>
      <Hero align="center">
        <span className="eyebrow">Marketplace</span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
          Subscriptions to <span className="text-brand-600">TAD products</span>{' '}
          in one place
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-600">
          MCP servers for Revit and AutoCAD, plus the TAD Platform. Buy, activate
          one seat per PC, and manage your team. Per-seat licensing. Cancel any
          time.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/products" className="btn-primary">
            Browse products
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/signup" className="btn-secondary">
            Create an account
          </Link>
        </div>
      </Hero>

      <Section
        align="center"
        eyebrow="Catalogue"
        title="Three products, three pricing tiers each"
        subtitle="Per-seat licensing on a monthly subscription. Cancel any time."
      >
        <div className="grid gap-6 md:grid-cols-3">
          {PRODUCTS.map((p) => (
            <article key={p.id} className="card text-left">
              <p
                className={`text-xs font-semibold uppercase tracking-wider ${
                  p.status === 'Live' ? 'text-brand-700' : 'text-ink-500'
                }`}
              >
                {p.status}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-ink-900">
                {p.name}
              </h3>
              <p className="mt-3 text-sm text-ink-600">
                Personal{' '}
                <span className="font-medium text-ink-800">$20</span> · SMB{' '}
                <span className="font-medium text-ink-800">$39</span> ·
                Enterprise{' '}
                <span className="font-medium text-ink-800">$49</span> USD per
                month.
              </p>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
