'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import Hero from '@/components/Hero';
import { api, ApiError } from '@/lib/api';

interface FormState {
  first_name: string;
  last_name: string;
  email: string;
  company_name: string;
}

type Status = 'idle' | 'loading' | 'sent' | 'error';

const EMPTY: FormState = { first_name: '', last_name: '', email: '', company_name: '' };

export default function SignupPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const onChange = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      await api.postJson<void>('/auth/magic-link', {
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        company_name: form.company_name.trim(),
      });
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
        <span className="eyebrow">Sign up</span>
        <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-bold leading-tight md:text-5xl">
          Create your <span className="text-brand-600">TAD account</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-600">
          One account for all TAD products. We&apos;ll email you a link to verify
          your address — no password required.
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
                  We sent a confirmation link to{' '}
                  <span className="font-medium">{form.email}</span>. Open it on
                  this device to finish creating your account.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStatus('idle');
                    setForm(EMPTY);
                  }}
                  className="btn-secondary"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5" noValidate>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="first_name" className="field-label">
                      First name <span className="text-brand-600">*</span>
                    </label>
                    <input
                      id="first_name"
                      type="text"
                      required
                      autoComplete="given-name"
                      autoFocus
                      placeholder="Enrique"
                      value={form.first_name}
                      onChange={onChange('first_name')}
                      disabled={isLoading}
                      maxLength={100}
                      className="field-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="last_name" className="field-label">
                      Last name <span className="text-brand-600">*</span>
                    </label>
                    <input
                      id="last_name"
                      type="text"
                      required
                      autoComplete="family-name"
                      placeholder="Meneses"
                      value={form.last_name}
                      onChange={onChange('last_name')}
                      disabled={isLoading}
                      maxLength={100}
                      className="field-input"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="field-label">
                    Email <span className="text-brand-600">*</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={onChange('email')}
                    disabled={isLoading}
                    className="field-input"
                  />
                </div>

                <div>
                  <label htmlFor="company_name" className="field-label">
                    Company
                  </label>
                  <input
                    id="company_name"
                    type="text"
                    autoComplete="organization"
                    placeholder="TAD"
                    value={form.company_name}
                    onChange={onChange('company_name')}
                    disabled={isLoading}
                    maxLength={200}
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
                      Create account
                      <Mail size={16} aria-hidden="true" />
                    </>
                  )}
                </button>

                <p className="text-xs text-ink-500">
                  Already have an account?{' '}
                  <Link href="/login" className="text-brand-700 hover:underline">
                    Sign in
                  </Link>
                  .
                </p>

                <p className="text-xs text-ink-500">
                  By creating an account you accept our{' '}
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
