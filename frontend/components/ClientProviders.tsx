'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { CartProvider } from '@/lib/cart-context';

/**
 * Wraps the app tree in client-side React providers. AuthProvider is the outer
 * shell so any downstream consumer (header, dashboard, future cart-to-checkout
 * link) can read the current user.
 */
export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>{children}</CartProvider>
    </AuthProvider>
  );
}
