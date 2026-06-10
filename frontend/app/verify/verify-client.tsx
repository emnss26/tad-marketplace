'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import Hero from '@/components/Hero';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type Status = 'verifying' | 'success' | 'error';

interface VerifyResponse {
  user_id: string;
  email: string;
}

export default function VerifyClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [status, setStatus] = useState<Status>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  // Guard against React 18 dev double-invoke firing two POST /auth/verify.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const token = params.get('t');
    if (token === null || token.length === 0) {
      setStatus('error');
      setErrorMsg('Missing token. Open the link from your email on this device.');
      return;
    }

    (async () => {
      try {
        await api.postJson<VerifyResponse>('/auth/verify', { token });
        // Cookie is set; fetch /me so the header avatar appears before we navigate.
        await refresh();
        setStatus('success');
        router.push('/dashboard');
      } catch (err: unknown) {
        setStatus('error');
        if (err instanceof ApiError && err.status === 401) {
          setErrorMsg(
            'This link has expired or was already used. Request a new one to continue.',
          );
        } else if (err instanceof ApiError && err.status === 400) {
          setErrorMsg('That link looks malformed. Try requesting a new one.');
        } else {
          setErrorMsg('Something went wrong. Please try again in a moment.');
        }
      }
    })();
  }, [params, refresh, router]);

  return (
    <Hero align="center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        {status === 'verifying' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-brand-600" aria-hidden="true" />
            <h1 className="text-2xl font-semibold">Signing you in&hellip;</h1>
            <p className="text-ink-600">Hold on while we verify your link.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
            <h1 className="text-2xl font-semibold">Signed in</h1>
            <p className="text-ink-600">Taking you to your dashboard&hellip;</p>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="h-10 w-10 text-red-500" aria-hidden="true" />
            <h1 className="text-2xl font-semibold">We couldn&apos;t sign you in</h1>
            <p className="text-ink-600">{errorMsg}</p>
            <Link href="/login" className="btn-primary mt-2">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </Hero>
  );
}
