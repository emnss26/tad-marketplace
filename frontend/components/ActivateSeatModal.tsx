'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Copy, Loader2, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface ActivateSeatResponse {
  seat_id: string;
  hostname: string;
  product_id: string;
  plaintext_token: string;
  install_command: string;
}

interface ErrorPayload {
  error?: string;
}

interface Props {
  tenantId: string;
  licenseId: string;
  productName: string;
  onClose: () => void;
  /** Called after a seat is successfully provisioned so the parent can refetch /me/licenses. */
  onSuccess?: () => void;
}

export default function ActivateSeatModal({
  tenantId,
  licenseId,
  productName,
  onClose,
  onSuccess,
}: Props) {
  const [hostname, setHostname] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ActivateSeatResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the hostname input on mount.
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      window.clearTimeout(t);
    };
  }, []);

  // ESC closes — but not while a request is in flight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [loading, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.postJson<ActivateSeatResponse>('/seats/activate', {
        tenant_id: tenantId,
        license_id: licenseId,
        hostname: hostname.trim(),
      });
      setResult(res);
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          setErrorMsg('Hostname is invalid. Use letters, numbers, dots, dashes.');
        } else if (err.status === 403) {
          setErrorMsg("You don't have permission to activate this license.");
        } else if (err.status === 409) {
          const payload = (err.payload as ErrorPayload | null) ?? {};
          if (payload.error === 'no_seats_available') {
            setErrorMsg(
              'No seats available on this license. Buy more or revoke an existing seat first.',
            );
          } else if (payload.error === 'license_inactive') {
            setErrorMsg('This license is no longer active.');
          } else {
            setErrorMsg('Could not activate this seat.');
          }
        } else {
          setErrorMsg('Could not activate this seat. Try again in a moment.');
        }
      } else {
        setErrorMsg('Network error. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="activate-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 cursor-default bg-ink-900/40 backdrop-blur-sm"
        onClick={() => {
          if (!loading) onClose();
        }}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-200 bg-white shadow-xl">
        {result === null ? (
          <FormView
            productName={productName}
            hostname={hostname}
            setHostname={setHostname}
            loading={loading}
            errorMsg={errorMsg}
            onSubmit={onSubmit}
            onClose={onClose}
            inputRef={inputRef}
          />
        ) : (
          <SuccessView result={result} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function FormView({
  productName,
  hostname,
  setHostname,
  loading,
  errorMsg,
  onSubmit,
  onClose,
  inputRef,
}: {
  productName: string;
  hostname: string;
  setHostname: (v: string) => void;
  loading: boolean;
  errorMsg: string;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <>
      <header className="flex items-start justify-between border-b border-ink-200 p-5">
        <div>
          <h2 id="activate-modal-title" className="text-lg font-semibold text-ink-900">
            Activate this PC
          </h2>
          <p className="mt-1 text-sm text-ink-600">Provisioning a seat for {productName}.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label="Close"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 disabled:opacity-50"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div>
          <label htmlFor="hostname" className="field-label">
            PC hostname <span className="text-brand-600">*</span>
          </label>
          <input
            ref={inputRef}
            id="hostname"
            type="text"
            required
            placeholder="GIA-WS01"
            value={hostname}
            onChange={(e) => {
              setHostname(e.target.value);
            }}
            disabled={loading}
            pattern="[A-Za-z0-9._-]+"
            maxLength={253}
            className="field-input"
          />
          <p className="mt-1.5 text-xs text-ink-500">
            The Windows hostname of the PC where Revit + Claude Desktop run. Run{' '}
            <code className="rounded bg-ink-100 px-1 py-0.5">hostname</code> in PowerShell on
            that PC to find it.
          </p>
        </div>

        {errorMsg.length > 0 && (
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
            disabled={loading}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || hostname.trim().length === 0}
            className="btn-primary"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Generating&hellip;
              </>
            ) : (
              'Generate seat token'
            )}
          </button>
        </div>
      </form>
    </>
  );
}

function SuccessView({
  result,
  onClose,
}: {
  result: ActivateSeatResponse;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-500" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Seat ready</h2>
          <p className="mt-1 text-sm text-ink-600">
            Provisioned for hostname{' '}
            <span className="font-mono text-ink-900">{result.hostname}</span>.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            <strong>Copy these now.</strong> The token is shown only once &mdash; we don&apos;t
            store the plaintext. If you close without copying, you&apos;ll need to revoke and
            re-activate.
          </p>
        </div>
      </div>

      <CopyableField label="Bearer token" value={result.plaintext_token} mono />
      <CopyableField
        label="Install command (paste in PowerShell on that PC, inside the unzipped installer folder)"
        value={result.install_command}
        multiline
      />

      <div className="rounded-lg border border-ink-200 bg-ink-50 p-3 text-xs text-ink-600">
        <p className="font-semibold text-ink-800">Next steps on the customer PC:</p>
        <ol className="mt-1 list-inside list-decimal space-y-1">
          <li>Download the installer .zip from the dashboard.</li>
          <li>Extract it (right click &rarr; Extract All).</li>
          <li>Open PowerShell in the unzipped folder.</li>
          <li>Paste the install command above.</li>
          <li>Restart Claude Desktop.</li>
        </ol>
      </div>

      <div className="flex justify-end pt-2">
        <button type="button" onClick={onClose} className="btn-primary">
          Done
        </button>
      </div>
    </div>
  );
}

function CopyableField({
  label,
  value,
  mono = false,
  multiline = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      // Best-effort. User can select manually.
    }
  }
  const inputCls = `flex-1 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs ${
    mono ? 'font-mono' : ''
  } text-ink-900`;
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="mt-1.5 flex items-stretch gap-1">
        {multiline ? (
          <textarea
            readOnly
            value={value}
            rows={2}
            className={inputCls}
            onFocus={(e) => {
              e.currentTarget.select();
            }}
          />
        ) : (
          <input
            readOnly
            value={value}
            className={inputCls}
            onFocus={(e) => {
              e.currentTarget.select();
            }}
          />
        )}
        <button
          type="button"
          onClick={() => {
            void onCopy();
          }}
          aria-label={`Copy ${label}`}
          className="inline-flex w-12 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
        >
          {copied ? (
            <CheckCircle2 size={16} className="text-emerald-500" aria-hidden="true" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
