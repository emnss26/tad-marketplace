'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Mail, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Props {
  tenantId: string;
  licenseId: string;
  productName: string;
  seatsRemaining: number;
  onClose: () => void;
  onSuccess?: () => void;
}

type Status = 'form' | 'loading' | 'sent' | 'error';

export default function InviteTeammateModal({
  tenantId,
  licenseId,
  productName,
  seatsRemaining,
  onClose,
  onSuccess,
}: Props) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'loading') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [status, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      await api.postJson<void>('/team/invite', {
        tenant_id: tenantId,
        license_id: licenseId,
        email: email.trim(),
      });
      setStatus('sent');
      onSuccess?.();
    } catch (err: unknown) {
      setStatus('error');
      if (err instanceof ApiError) {
        if (err.status === 400) {
          setErrorMsg('That email address looks invalid.');
        } else if (err.status === 403) {
          setErrorMsg("You don't have permission to invite teammates to this license.");
        } else {
          setErrorMsg('Could not send the invite. Try again in a moment.');
        }
      } else {
        setErrorMsg('Network error. Try again.');
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 cursor-default bg-ink-900/40 backdrop-blur-sm"
        onClick={() => {
          if (status !== 'loading') onClose();
        }}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-ink-200 p-5">
          <div>
            <h2 id="invite-modal-title" className="text-lg font-semibold text-ink-900">
              Invite a teammate
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              {productName} &middot; {seatsRemaining.toString()} seat
              {seatsRemaining === 1 ? '' : 's'} remaining
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={status === 'loading'}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 disabled:opacity-50"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {status === 'sent' ? (
          <div className="space-y-3 p-5 text-center">
            <CheckCircle2
              className="mx-auto h-12 w-12 text-emerald-500"
              aria-hidden="true"
            />
            <h3 className="text-lg font-semibold text-ink-900">Invitation sent</h3>
            <p className="text-sm text-ink-600">
              We sent a sign-in link to <span className="font-medium">{email}</span>. When
              they accept, they&apos;ll show up in your team list.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEmail('');
                  setStatus('form');
                  inputRef.current?.focus();
                }}
                className="btn-secondary"
              >
                Invite another
              </button>
              <button type="button" onClick={onClose} className="btn-primary">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 p-5" noValidate>
            <div>
              <label htmlFor="invite-email" className="field-label">
                Teammate&apos;s email <span className="text-brand-600">*</span>
              </label>
              <input
                ref={inputRef}
                id="invite-email"
                type="email"
                required
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                disabled={status === 'loading'}
                className="field-input"
              />
              <p className="mt-1.5 text-xs text-ink-500">
                They&apos;ll get a sign-in link to claim their seat. They activate their own
                PC after signing in.
              </p>
            </div>

            {status === 'error' && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
                {errorMsg}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={status === 'loading'}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={status === 'loading' || email.trim().length === 0}
                className="btn-primary"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    Sending&hellip;
                  </>
                ) : (
                  <>
                    <Mail size={16} aria-hidden="true" />
                    Send invitation
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
