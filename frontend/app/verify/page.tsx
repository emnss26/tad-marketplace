import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import VerifyClient from './verify-client';
import Hero from '@/components/Hero';

/**
 * Server-component shell. `useSearchParams` inside `VerifyClient` would block
 * static prerendering without this Suspense boundary in Next.js 15.
 */
export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyClient />
    </Suspense>
  );
}

function VerifyFallback() {
  return (
    <Hero align="center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-ink-600">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
        <p>Loading sign-in&hellip;</p>
      </div>
    </Hero>
  );
}
