'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, LayoutDashboard, LogOut, Menu, ShoppingCart, X } from 'lucide-react';
import Logo from './Logo';
import UserMenu from './UserMenu';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { NAV, SITE } from '@/lib/site';

/**
 * Sticky top header. Auth-aware:
 *   - signed in  → UserMenu avatar bubble (Dashboard / Cart / Sign out)
 *   - otherwise  → "Sign in" CTA
 * Cart icon is always shown; the badge appears once the cart is hydrated and
 * has at least one item.
 */
export default function Header() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { itemCount, hydrated } = useCart();
  const { state, logout } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const showCartBadge = hydrated && itemCount > 0;
  const authed = state.status === 'authenticated';

  async function onMobileSignOut() {
    setOpen(false);
    await logout();
    router.push('/');
  }

  return (
    <header
      className={`sticky top-0 z-40 w-full bg-white/85 backdrop-blur transition ${
        scrolled ? 'border-b border-ink-200' : 'border-b border-transparent'
      }`}
    >
      <div className="container-tad flex h-16 items-center justify-between">
        <Link href="/" className="text-brand-600" aria-label="TAD Marketplace home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-2 text-sm font-medium text-ink-600 transition hover:text-ink-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={SITE.landingUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm font-medium text-ink-600 transition hover:text-ink-900"
          >
            tad.com.mx
            <ArrowUpRight size={14} aria-hidden="true" className="ml-1 inline" />
          </a>
          <CartLink itemCount={itemCount} showBadge={showCartBadge} />
          {state.status === 'authenticated' ? (
            <UserMenu user={state.user} />
          ) : (
            <Link href="/login" className="btn-primary">
              Sign in
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <CartLink itemCount={itemCount} showBadge={showCartBadge} />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => {
              setOpen((v) => !v);
            }}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink-200 bg-white lg:hidden">
          <nav className="container-tad flex flex-col py-4" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  setOpen(false);
                }}
                className="rounded-lg px-3 py-3 text-base font-medium text-ink-800 hover:bg-ink-50"
              >
                {item.label}
              </Link>
            ))}
            <a
              href={SITE.landingUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-lg px-3 py-3 text-base font-medium text-ink-800 hover:bg-ink-50"
            >
              tad.com.mx
              <ArrowUpRight size={14} aria-hidden="true" className="ml-1 inline" />
            </a>

            {authed ? (
              <>
                <div className="my-2 border-t border-ink-200" />
                <Link
                  href="/dashboard"
                  onClick={() => {
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-3 text-base font-medium text-ink-800 hover:bg-ink-50"
                >
                  <LayoutDashboard size={16} aria-hidden="true" />
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void onMobileSignOut();
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-3 text-left text-base font-medium text-ink-800 hover:bg-ink-50"
                >
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => {
                  setOpen(false);
                }}
                className="btn-primary mt-2 w-full"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function CartLink({ itemCount, showBadge }: { itemCount: number; showBadge: boolean }) {
  return (
    <Link
      href="/cart"
      aria-label={`Cart, ${itemCount.toString()} item${itemCount === 1 ? '' : 's'}`}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-700 transition hover:bg-ink-100"
    >
      <ShoppingCart size={20} aria-hidden="true" />
      {showBadge && (
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold leading-none text-white">
          {itemCount}
        </span>
      )}
    </Link>
  );
}
