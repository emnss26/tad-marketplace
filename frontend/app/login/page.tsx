'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import Hero from '@/components/Hero';
import { api, ApiError } from '@/lib/api';

type Status = 'idle' | 'loading' | 'sent' | 'error';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      await api.postJson<void>('/auth/magic-link', { email: email.trim() });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      if (err instanceof ApiError && err.status === 400) {
        setErrorMsg('That email address looks invalid.');
      } else {
        setErrorMsg('Something went wrong. Please try again in a moment.');
      }
    }
  }

  const isLoading = status === 'loading';

  return (
    <>
      <Hero align="center">
        <span className="eyebrow">Sign in</span>
        <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-bold leading-tight md:text-5xl">
          Sign in to <span className="text-brand-600">TAD Marketplace</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-600">
          We&apos;ll email you a one-time link. No passwords. The link expires in
          15 minutes.
        </p>
      </Hero>

      <section className="section">
        <div className="container-tad">
          <div className="mx-auto max-w-md rounded-2xl border border-ink-200 bg-white p-6 shadow-sm md:p-8">
            {status === 'sent' ? (
              <div className="flex flex-col items-center justify-center space-y-4 py-6 text-center">
                <CheckCircle2 className="h-14 w-14 text-emerald-500" aria-hidden="true" />
                <h2 className="text-xl font-semibold text-ink-900">Check your email</h2>
                <p className="max-w-xs text-ink-600">
                  If an account exists for <span className="font-medium">{email}</span>, a
                  sign-in link is on its way. Open it on this device to continue.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStatus('idle');
                    setEmail('');
                  }}
                  className="btn-secondary"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5" noValidate>
                <div>
                  <label htmlFor="email" className="field-label">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                    }}
                    disabled={isLoading}
                    className="field-input"
                  />
                </div>

                {status === 'error' && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
                    {errorMsg}
                  </div>
                )}

                <button type="submit" disabled={isLoading} className="btn-primary w-full">
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      Sending&hellip;
                    </>
                  ) : (
                    <>
                      Send me a sign-in link
                      <Mail size={16} aria-hidden="true" />
                    </>
                  )}
                </button>

                <p className="text-xs text-ink-500">
                  Don&apos;t have an account?{' '}
                  <Link href="/signup" className="text-brand-700 hover:underline">
                    Sign up
                  </Link>
                  .
                </p>

                <p className="text-xs text-ink-500">
                  By signing in you accept our{' '}
                  <a
                    href="https://tad.com.mx/legal/tad-mcp-eula"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-brand-700 hover:underline"
                  >
                    EULA
                  </a>{' '}
                  and{' '}
                  <a
                    href="https://tad.com.mx/legal/tad-mcp-privacy"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-brand-700 hover:underline"
                  >
                    Privacy Policy
                  </a>
                  .
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
