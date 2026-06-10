'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Loader2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Hero from '@/components/Hero';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { PLAN_LABELS } from '@/lib/products';
import { formatPriceUsdCents } from '@/lib/format';

interface CheckoutResponse {
  subscription_id: string;
  approval_url: string;
}

export default function CartPage() {
  const { items, setQuantity, remove, totalUsdCents, hydrated, itemCount } = useCart();
  const { state: authState } = useAuth();
  const [checkoutStatus, setCheckoutStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [checkoutError, setCheckoutError] = useState('');

  async function onCheckout() {
    const first = items[0];
    if (!first) return;

    if (authState.status !== 'authenticated') {
      setCheckoutError('Please sign in to proceed to checkout.');
      setCheckoutStatus('error');
      return;
    }

    setCheckoutStatus('loading');
    setCheckoutError('');

    try {
      const res = await api.postJson<CheckoutResponse>('/checkout/session', {
        product_id: first.productId,
        plan: first.plan,
      });
      // Hand off to PayPal. The user comes back to /checkout/success after approval.
      window.location.href = res.approval_url;
    } catch (err) {
      setCheckoutStatus('error');
      if (err instanceof ApiError && err.status === 401) {
        setCheckoutError('Your session expired. Sign in and try again.');
      } else {
        setCheckoutError('Could not start checkout. Please try again in a moment.');
      }
    }
  }

  // Pre-hydration we render the empty layout to avoid flicker / hydration mismatch.
  if (!hydrated) {
    return (
      <>
        <Hero align="center">
          <span className="eyebrow">Cart</span>
          <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-bold leading-tight md:text-5xl">
            Your cart
          </h1>
        </Hero>
        <section className="section" />
      </>
    );
  }

  return (
    <>
      <Hero align="center">
        <span className="eyebrow">Cart</span>
        <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-bold leading-tight md:text-5xl">
          Your cart
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-600">
          {itemCount === 0
            ? 'Nothing here yet. Browse the catalogue to get started.'
            : `${itemCount.toString()} item${itemCount === 1 ? '' : 's'} ready to check out.`}
        </p>
      </Hero>

      <section className="section">
        <div className="container-tad">
          {items.length === 0 ? (
            <EmptyCart />
          ) : (
            <div className="grid gap-12 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ul className="space-y-4">
                  {items.map((item) => (
                    <li
                      key={`${item.productId}:${item.plan}`}
                      className="rounded-2xl border border-ink-200 bg-white p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                            {PLAN_LABELS[item.plan]}
                          </p>
                          <h3 className="mt-1 text-lg font-semibold text-ink-900">
                            {item.productName}
                          </h3>
                          <p className="mt-1 text-sm text-ink-600">
                            {formatPriceUsdCents(item.priceUsdCents)} per seat / month
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-ink-900">
                            {formatPriceUsdCents(item.priceUsdCents * item.quantity)}
                          </p>
                          <p className="text-xs text-ink-500">per month</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="inline-flex items-center rounded-lg border border-ink-200">
                          <button
                            type="button"
                            onClick={() => {
                              setQuantity(item.productId, item.plan, item.quantity - 1);
                            }}
                            aria-label="Decrease quantity"
                            className="inline-flex h-9 w-9 items-center justify-center text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                            disabled={item.quantity <= 1}
                          >
                            <Minus size={14} aria-hidden="true" />
                          </button>
                          <span className="w-10 text-center text-sm font-medium text-ink-900">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setQuantity(item.productId, item.plan, item.quantity + 1);
                            }}
                            aria-label="Increase quantity"
                            className="inline-flex h-9 w-9 items-center justify-center text-ink-700 hover:bg-ink-50"
                          >
                            <Plus size={14} aria-hidden="true" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            remove(item.productId, item.plan);
                          }}
                          className="inline-flex items-center gap-2 text-sm font-medium text-ink-600 transition hover:text-red-600"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <aside className="lg:col-span-1">
                <div className="sticky top-24 rounded-2xl border border-ink-200 bg-white p-6">
                  <h2 className="text-lg font-semibold text-ink-900">Order summary</h2>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-ink-600">Subtotal</dt>
                      <dd className="font-medium text-ink-900">
                        {formatPriceUsdCents(totalUsdCents)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-600">Billed</dt>
                      <dd className="font-medium text-ink-900">monthly</dd>
                    </div>
                  </dl>
                  <div className="mt-4 border-t border-ink-200 pt-4">
                    <div className="flex justify-between text-base font-semibold text-ink-900">
                      <span>Total / month</span>
                      <span>{formatPriceUsdCents(totalUsdCents)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void onCheckout();
                    }}
                    disabled={checkoutStatus === 'loading' || items.length === 0}
                    className="btn-primary mt-6 w-full"
                  >
                    {checkoutStatus === 'loading' ? (
                      <>
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                        Redirecting to PayPal&hellip;
                      </>
                    ) : (
                      <>
                        Proceed to checkout
                        <ArrowRight size={16} aria-hidden="true" />
                      </>
                    )}
                  </button>

                  {items.length > 1 && (
                    <p className="mt-3 text-center text-xs text-ink-500">
                      We&apos;ll check out{' '}
                      <span className="font-medium">{items[0]?.productName}</span> first.
                      Return for the next item after PayPal confirms.
                    </p>
                  )}

                  {checkoutStatus === 'error' && (
                    <div
                      role="alert"
                      className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                      <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
                      {checkoutError}
                    </div>
                  )}

                  {authState.status !== 'authenticated' && checkoutStatus !== 'error' && (
                    <p className="mt-3 text-center text-xs text-ink-500">
                      <Link href="/login" className="text-brand-700 hover:underline">
                        Sign in
                      </Link>{' '}
                      to check out.
                    </p>
                  )}

                  <Link
                    href="/products"
                    className="mt-4 inline-flex w-full justify-center text-sm font-medium text-brand-700 hover:underline"
                  >
                    Continue shopping
                  </Link>
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function EmptyCart() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
      <div className="rounded-full bg-brand-50 p-4 text-brand-600">
        <ShoppingBag size={28} aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold text-ink-900">Your cart is empty</h2>
      <p className="text-ink-600">
        Browse the catalogue and pick a tier for any TAD product to get started.
      </p>
      <Link href="/products" className="btn-primary mt-2">
        Browse products
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
