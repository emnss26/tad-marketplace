import Link from 'next/link';
import { ArrowLeft, XCircle } from 'lucide-react';
import Hero from '@/components/Hero';

export default function CheckoutCancelPage() {
  return (
    <Hero align="center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <XCircle className="h-10 w-10 text-ink-400" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Checkout cancelled</h1>
        <p className="text-ink-600">
          No subscription was created and you weren&apos;t charged. Your cart is still
          waiting for you.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href="/cart" className="btn-primary">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to cart
          </Link>
          <Link href="/products" className="btn-secondary">
            Keep browsing
          </Link>
        </div>
      </div>
    </Hero>
  );
}
