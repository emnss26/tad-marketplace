'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, LogOut, ShoppingBag } from 'lucide-react';
import { useAuth, userInitials } from '@/lib/auth-context';
import type { AuthUser } from '@/lib/auth-context';

/**
 * Signed-in avatar bubble with a dropdown menu (Dashboard / Cart / Sign out).
 * Renders only when `useAuth()` reports `authenticated`; the header chooses
 * between this and the "Sign in" CTA.
 */
export default function UserMenu({ user }: { user: AuthUser }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = userInitials(user);
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email;

  async function onSignOut() {
    setOpen(false);
    await logout();
    router.push('/');
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-label={`Account menu for ${displayName}`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg"
        >
          <div className="border-b border-ink-200 p-4">
            <p className="truncate text-sm font-semibold text-ink-900">{displayName}</p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
            {user.company_name && (
              <p className="mt-1 truncate text-xs text-ink-600">{user.company_name}</p>
            )}
          </div>

          <div className="py-1">
            <Link
              href="/dashboard"
              role="menuitem"
              onClick={() => {
                setOpen(false);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm text-ink-800 transition hover:bg-ink-50"
            >
              <LayoutDashboard size={16} aria-hidden="true" />
              Dashboard
            </Link>
            <Link
              href="/cart"
              role="menuitem"
              onClick={() => {
                setOpen(false);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm text-ink-800 transition hover:bg-ink-50"
            >
              <ShoppingBag size={16} aria-hidden="true" />
              Cart
            </Link>
          </div>

          <div className="border-t border-ink-200 py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void onSignOut();
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink-800 transition hover:bg-ink-50"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
