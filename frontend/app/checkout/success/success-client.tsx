'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import Hero from '@/components/Hero';
import { api, ApiError } from '@/lib/api';
import { useCart } from '@/lib/cart-context';
import type { CartItem } from '@/lib/cart-context';
import type { Plan, ProductId } from '@/lib/products';

interface ConfirmResponse {
  tenant_id: string;
  license_id: string;
  product_id: ProductId;
  plan: Plan;
  seats_quota: number;
}

interface PendingResponse {
  pending: true;
  status: string;
}

interface CheckoutSessionResponse {
  subscription_id: string;
  approval_url: string;
}

type Status = 'confirming' | 'pending' | 'continuing' | 'success' | 'error';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sameLine(
  a: { productId: ProductId; plan: Plan },
  b: { productId: ProductId; plan: Plan },
): boolean {
  return a.productId === b.productId && a.plan === b.plan;
}

export default function SuccessClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { items, setQuantity, remove } = useCart();
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const [status, setStatus] = useState<Status>('confirming');
  const [errorMsg, setErrorMsg] = useState('');
  const [nextProductName, setNextProductName] = useState('');
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const subscriptionId = params.get('subscription_id');
    if (!subscriptionId) {
      setStatus('error');
      setErrorMsg('Missing PayPal subscription id. Try again from your cart.');
      return;
    }

    void confirmWithRetry(subscriptionId, 0);

    async function confirmWithRetry(subId: string, attempt: number): Promise<void> {
      try {
        const res = await api.postJson<ConfirmResponse | PendingResponse>(
          '/checkout/confirm',
          { subscription_id: subId },
        );

        if ('pending' in res) {
          if (attempt < MAX_RETRIES) {
            setStatus('pending');
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            await confirmWithRetry(subId, attempt + 1);
            return;
          }
          setStatus('error');
          setErrorMsg(
            'PayPal is still finalizing your subscription. Check your dashboard in a minute.',
          );
          return;
        }

        // Confirmed. Decrement (or remove) the matched cart line.
        const snapshot = itemsRef.current;
        const matched = snapshot.find((i) =>
          sameLine(i, { productId: res.product_id, plan: res.plan }),
        );
        let remaining: CartItem[];
        if (matched) {
          if (matched.quantity > 1) {
            setQuantity(matched.productId, matched.plan, matched.quantity - 1);
            remaining = snapshot.map((i) =>
              sameLine(i, matched) ? { ...i, quantity: i.quantity - 1 } : i,
            );
          } else {
            remove(matched.productId, matched.plan);
            remaining = snapshot.filter((i) => !sameLine(i, matched));
          }
        } else {
          // Edge case: arrived at success page with an item not in cart (e.g.,
          // page refresh after cart was cleared). Treat as fully done.
          remaining = [];
        }

        // If cart has more units to buy, trigger the next PayPal flow.
        const next = remaining[0];
        if (next) {
          setNextProductName(next.productName);
          setStatus('continuing');
          try {
            const sessionRes = await api.postJson<CheckoutSessionResponse>(
              '/checkout/session',
              { product_id: next.productId, plan: next.plan },
            );
            window.location.href = sessionRes.approval_url;
            return;
          } catch (err: unknown) {
            setStatus('error');
            if (err instanceof ApiError && err.status === 401) {
              setErrorMsg('Your session expired. Sign in to continue checking out.');
            } else {
              setErrorMsg(
                'Could not start the next checkout. Open your cart to retry.',
              );
            }
            return;
          }
        }

        // Cart empty — done.
        setStatus('success');
        setTimeout(() => router.push('/dashboard'), 1000);
      } catch (err: unknown) {
        setStatus('error');
        if (err instanceof ApiError && err.status === 401) {
          setErrorMsg('Your session expired. Sign in to claim your subscription.');
        } else if (err instanceof ApiError && err.status === 403) {
          setErrorMsg('That PayPal subscription belongs to a different account.');
        } else {
          setErrorMsg(
            'Something went wrong while confirming your subscription. Contact support if it persists.',
          );
        }
      }
    }
  }, [params, remove, router, setQuantity]);

  return (
    <Hero align="center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        {(status === 'confirming' || status === 'pending') && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-brand-600" aria-hidden="true" />
            <h1 className="text-2xl font-semibold">
              {status === 'pending' ? 'Waiting on PayPal…' : 'Confirming your subscription…'}
            </h1>
            <p className="text-ink-600">
              {status === 'pending'
                ? 'PayPal is still processing. Hang on a few seconds.'
                : 'We&apos;re linking your purchase to your account.'}
            </p>
          </>
        )}

        {status === 'continuing' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-brand-600" aria-hidden="true" />
            <h1 className="text-2xl font-semibold">Next item: {nextProductName}</h1>
            <p className="text-ink-600">
              Redirecting you to PayPal for the next purchase in your cart&hellip;
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
            <h1 className="text-2xl font-semibold">All set</h1>
            <p className="text-ink-600">Cart is empty. Taking you to your dashboard&hellip;</p>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="h-10 w-10 text-red-500" aria-hidden="true" />
            <h1 className="text-2xl font-semibold">We couldn&apos;t finish checkout</h1>
            <p className="text-ink-600">{errorMsg}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Link href="/cart" className="btn-secondary">
                Back to cart
              </Link>
              <Link href="/dashboard" className="btn-primary">
                Open dashboard
              </Link>
            </div>
          </>
        )}
      </div>
    </Hero>
  );
}
