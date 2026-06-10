'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  Download,
  KeyRound,
  Loader2,
  Mail,
  ShoppingBag,
  Trash2,
  User as UserIcon,
  Users,
  XCircle,
} from 'lucide-react';
import ActivateSeatModal from '@/components/ActivateSeatModal';
import Hero from '@/components/Hero';
import InviteTeammateModal from '@/components/InviteTeammateModal';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { findProduct, PLAN_LABELS } from '@/lib/products';
import type { Plan, ProductId } from '@/lib/products';

interface LicenseView {
  license_id: string;
  tenant_id: string;
  product_id: ProductId;
  product_name: string;
  plan: Plan;
  status: 'active' | 'past_due' | 'canceled';
  seats_quota: number;
  seats_used: number;
  current_period_end: number;
  subscription_provider: 'paypal' | 'stripe' | 'manual' | null;
}

interface SeatView {
  seat_id: string;
  tenant_id: string;
  license_id: string;
  product_id: ProductId;
  hostname: string;
  status: 'active' | 'suspended' | 'revoked';
  assigned_to_email: string;
  created_at: number;
  last_seen_at: number;
}

interface InstallerResponse {
  url: string;
  filename: string;
  expires_in: number;
}

type LicensesState =
  | { status: 'loading' }
  | { status: 'ready'; licenses: LicenseView[] }
  | { status: 'error' };

export default function DashboardPage() {
  const router = useRouter();
  const { state } = useAuth();
  const [licenses, setLicenses] = useState<LicensesState>({ status: 'loading' });
  const [seats, setSeats] = useState<SeatView[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<{ licenseId: string; msg: string } | null>(
    null,
  );
  const [activatingLicense, setActivatingLicense] = useState<LicenseView | null>(null);
  const [invitingLicense, setInvitingLicense] = useState<LicenseView | null>(null);
  const [revokingSeatId, setRevokingSeatId] = useState<string | null>(null);
  const [cancelingLicenseId, setCancelingLicenseId] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === 'unauthenticated') {
      router.push('/login');
    }
  }, [state.status, router]);

  const refetchAll = useCallback(() => {
    if (state.status !== 'authenticated') return () => undefined;
    let cancelled = false;
    setLicenses({ status: 'loading' });
    Promise.all([
      api.getJson<{ licenses: LicenseView[] }>('/me/licenses'),
      api.getJson<{ seats: SeatView[] }>('/me/seats').catch(() => ({ seats: [] })),
    ])
      .then(([licRes, seatsRes]) => {
        if (cancelled) return;
        setLicenses({ status: 'ready', licenses: licRes.licenses });
        setSeats(seatsRes.seats);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setLicenses({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [state.status, router]);

  useEffect(() => refetchAll(), [refetchAll]);

  async function onDownload(license: LicenseView) {
    setDownloadingId(license.license_id);
    setDownloadError(null);
    try {
      const res = await api.getJson<InstallerResponse>(
        `/installers/${license.product_id}/download`,
      );
      triggerBrowserDownload(res.url, res.filename);
    } catch (err: unknown) {
      let msg = 'Could not start the download. Try again in a moment.';
      if (err instanceof ApiError) {
        if (err.status === 403) msg = "We couldn't verify an active license for this product.";
        else if (err.status === 404) {
          const payload = err.payload as { error?: string } | null;
          msg =
            payload?.error === 'installer_not_uploaded'
              ? "The installer hasn't been uploaded yet. Hold tight."
              : 'No installer is available for this product.';
        }
      }
      setDownloadError({ licenseId: license.license_id, msg });
    } finally {
      setDownloadingId(null);
    }
  }

  async function onCancelLicense(license: LicenseView) {
    if (
      !window.confirm(
        `Cancel your ${license.product_name} (${license.plan}) subscription? PayPal stops charging immediately, and any active seats will be revoked. This cannot be undone.`,
      )
    ) {
      return;
    }
    setCancelingLicenseId(license.license_id);
    try {
      await api.postJson(`/licenses/${license.license_id}/cancel`, {});
      refetchAll();
    } catch (err: unknown) {
      window.alert(
        err instanceof ApiError && err.status === 403
          ? "You don't have permission to cancel this license."
          : 'Could not cancel the subscription. Try again or cancel directly in PayPal.',
      );
    } finally {
      setCancelingLicenseId(null);
    }
  }

  async function onRevokeSeat(seat: SeatView) {
    const target = seat.assigned_to_email || seat.hostname;
    if (!window.confirm(`Revoke ${target}? The MCP will reject this seat within ~5 minutes.`)) {
      return;
    }
    setRevokingSeatId(seat.seat_id);
    try {
      await api.postJson(`/seats/${seat.seat_id}/revoke`, {});
      refetchAll();
    } catch (err: unknown) {
      window.alert(
        err instanceof ApiError && err.status === 403
          ? "You don't have permission to revoke this seat."
          : 'Could not revoke the seat. Try again.',
      );
    } finally {
      setRevokingSeatId(null);
    }
  }

  if (state.status === 'loading' || state.status === 'unauthenticated') {
    return (
      <Hero align="center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-ink-600">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-hidden="true" />
          <p>Loading your dashboard&hellip;</p>
        </div>
      </Hero>
    );
  }

  const { user } = state;
  const displayName = (user.first_name?.trim() ?? '') || user.email;
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');

  return (
    <>
      <Hero>
        <span className="eyebrow">Dashboard</span>
        <h1 className="mt-5 text-4xl font-bold leading-tight md:text-5xl">
          Hi, <span className="text-brand-600">{displayName}</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-600">
          Manage your TAD subscriptions, download installers, invite teammates, and keep an
          eye on renewal dates.
        </p>
      </Hero>

      <section className="section">
        <div className="container-tad grid gap-8 lg:grid-cols-3">
          <aside className="lg:col-span-1">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
                  <UserIcon size={18} aria-hidden="true" />
                </div>
                <h2 className="text-lg font-semibold text-ink-900">Profile</h2>
              </div>
              <dl className="mt-4 space-y-4 text-sm">
                <ProfileRow label="Name" value={fullName.length > 0 ? fullName : '—'} />
                <ProfileRow label="Email" value={user.email} />
                <ProfileRow label="Company" value={user.company_name ?? '—'} />
                <ProfileRow label="User ID" value={user.user_id} mono />
              </dl>
            </div>
          </aside>

          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
                  <ShoppingBag size={18} aria-hidden="true" />
                </div>
                <h2 className="text-lg font-semibold text-ink-900">Your products</h2>
              </div>

              {licenses.status === 'loading' && (
                <div className="mt-6 flex items-center gap-2 text-sm text-ink-600">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading subscriptions&hellip;
                </div>
              )}

              {licenses.status === 'error' && (
                <p className="mt-6 text-sm text-red-700">
                  Couldn&apos;t load your subscriptions. Refresh in a moment.
                </p>
              )}

              {licenses.status === 'ready' && licenses.licenses.length === 0 && (
                <div className="mt-6 rounded-xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center">
                  <p className="text-ink-700">
                    You haven&apos;t purchased any TAD products yet.
                  </p>
                  <Link href="/products" className="btn-primary mt-4">
                    Browse the catalogue
                  </Link>
                </div>
              )}

              {licenses.status === 'ready' && licenses.licenses.length > 0 && (
                <ul className="mt-6 space-y-4">
                  {licenses.licenses.map((l) => (
                    <LicenseCard
                      key={l.license_id}
                      license={l}
                      seats={seats.filter((s) => s.license_id === l.license_id)}
                      onDownload={onDownload}
                      onActivate={(lic) => {
                        setActivatingLicense(lic);
                      }}
                      onInvite={(lic) => {
                        setInvitingLicense(lic);
                      }}
                      onRevokeSeat={onRevokeSeat}
                      onCancel={onCancelLicense}
                      downloading={downloadingId === l.license_id}
                      revokingSeatId={revokingSeatId}
                      canceling={cancelingLicenseId === l.license_id}
                      error={
                        downloadError?.licenseId === l.license_id ? downloadError.msg : null
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {activatingLicense && (
        <ActivateSeatModal
          tenantId={activatingLicense.tenant_id}
          licenseId={activatingLicense.license_id}
          productName={activatingLicense.product_name}
          onClose={() => {
            setActivatingLicense(null);
          }}
          onSuccess={refetchAll}
        />
      )}

      {invitingLicense && (
        <InviteTeammateModal
          tenantId={invitingLicense.tenant_id}
          licenseId={invitingLicense.license_id}
          productName={invitingLicense.product_name}
          seatsRemaining={Math.max(0, invitingLicense.seats_quota - invitingLicense.seats_used)}
          onClose={() => {
            setInvitingLicense(null);
          }}
        />
      )}
    </>
  );
}

function LicenseCard({
  license,
  seats,
  onDownload,
  onActivate,
  onInvite,
  onRevokeSeat,
  onCancel,
  downloading,
  revokingSeatId,
  canceling,
  error,
}: {
  license: LicenseView;
  seats: SeatView[];
  onDownload: (license: LicenseView) => void;
  onActivate: (license: LicenseView) => void;
  onInvite: (license: LicenseView) => void;
  onRevokeSeat: (seat: SeatView) => void;
  onCancel: (license: LicenseView) => void;
  downloading: boolean;
  revokingSeatId: string | null;
  canceling: boolean;
  error: string | null;
}) {
  const statusColor =
    license.status === 'active'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : license.status === 'past_due'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-ink-100 text-ink-600 border-ink-200';

  const product = findProduct(license.product_id);
  const delivery = product?.delivery ?? 'installer';
  const isMultiSeat = license.seats_quota > 1;
  const seatsRemaining = Math.max(0, license.seats_quota - license.seats_used);

  return (
    <li className="rounded-xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
            {PLAN_LABELS[license.plan]}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink-900">{license.product_name}</h3>
          <p className="mt-1 text-sm text-ink-600">
            {license.seats_used.toString()} / {license.seats_quota.toString()} seats used
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${statusColor}`}
        >
          {license.status}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-semibold uppercase tracking-wider text-ink-500">
            Next billing
          </dt>
          <dd className="mt-1 text-ink-900">{formatPeriodEnd(license.current_period_end)}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wider text-ink-500">Provider</dt>
          <dd className="mt-1 capitalize text-ink-900">
            {license.subscription_provider ?? '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        {delivery === 'installer' ? (
          <>
            <button
              type="button"
              onClick={() => {
                onDownload(license);
              }}
              disabled={downloading || license.status !== 'active'}
              className="btn-primary"
            >
              {downloading ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  Preparing&hellip;
                </>
              ) : (
                <>
                  <Download size={16} aria-hidden="true" />
                  Download installer
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                onActivate(license);
              }}
              disabled={license.status !== 'active' || seatsRemaining <= 0}
              className="btn-secondary"
              title={
                seatsRemaining <= 0
                  ? 'All seats are used. Revoke one or buy more.'
                  : 'Generate a Bearer token for a new PC.'
              }
            >
              <KeyRound size={16} aria-hidden="true" />
              Activate this PC
            </button>
          </>
        ) : (
          <a
            href={product?.webUrl ?? '#'}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-primary"
          >
            Open Platform
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        )}
        <Link href="/cart" className="btn-secondary">
          Buy more seats
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {isMultiSeat && (
        <TeamPanel
          license={license}
          seats={seats}
          seatsRemaining={seatsRemaining}
          onInvite={onInvite}
          onRevokeSeat={onRevokeSeat}
          revokingSeatId={revokingSeatId}
        />
      )}

      {license.status === 'active' && (
        <div className="mt-5 flex justify-end border-t border-ink-100 pt-3">
          <button
            type="button"
            onClick={() => {
              onCancel(license);
            }}
            disabled={canceling}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 transition hover:text-red-700 disabled:opacity-50"
          >
            {canceling ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <XCircle size={12} aria-hidden="true" />
            )}
            Cancel subscription
          </button>
        </div>
      )}
    </li>
  );
}

function TeamPanel({
  license,
  seats,
  seatsRemaining,
  onInvite,
  onRevokeSeat,
  revokingSeatId,
}: {
  license: LicenseView;
  seats: SeatView[];
  seatsRemaining: number;
  onInvite: (license: LicenseView) => void;
  onRevokeSeat: (seat: SeatView) => void;
  revokingSeatId: string | null;
}) {
  const activeSeats = seats.filter((s) => s.status !== 'revoked');
  return (
    <div className="mt-6 border-t border-ink-200 pt-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-ink-500" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-ink-900">Team</h4>
          <span className="text-xs text-ink-500">
            {activeSeats.length.toString()} / {license.seats_quota.toString()} active
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            onInvite(license);
          }}
          disabled={seatsRemaining <= 0 || license.status !== 'active'}
          className="btn-ghost text-xs"
          title={seatsRemaining <= 0 ? 'No seats remaining.' : 'Send a teammate a signup link.'}
        >
          <Mail size={14} aria-hidden="true" />
          Invite teammate
        </button>
      </div>

      {activeSeats.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-ink-200 bg-ink-50 p-3 text-xs text-ink-600">
          No teammates activated yet. Invite someone or generate your own seat with{' '}
          <span className="font-medium">Activate this PC</span>.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200">
          {activeSeats.map((s) => (
            <li
              key={s.seat_id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-900">{s.assigned_to_email}</p>
                <p className="mt-0.5 text-ink-500">
                  PC <span className="font-mono">{s.hostname}</span> &middot;{' '}
                  {s.last_seen_at > 0
                    ? `last seen ${formatLastSeen(s.last_seen_at)}`
                    : 'not connected yet'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onRevokeSeat(s);
                }}
                disabled={revokingSeatId === s.seat_id}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                {revokingSeatId === s.seat_id ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 size={12} aria-hidden="true" />
                )}
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProfileRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className={`mt-1 text-ink-900 ${mono ? 'break-all font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function formatPeriodEnd(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return '—';
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatLastSeen(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return 'never';
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function triggerBrowserDownload(url: string, _filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.setAttribute('download', _filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
}
