import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import Hero from '@/components/Hero';
import SuccessClient from './success-client';

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <SuccessClient />
    </Suspense>
  );
}

function Fallback() {
  return (
    <Hero align="center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-ink-600">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
        <p>Loading&hellip;</p>
      </div>
    </Hero>
  );
}
