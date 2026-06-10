'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Plan, ProductId } from './products';

const STORAGE_KEY = 'tad_marketplace_cart_v1';

export interface CartItem {
  productId: ProductId;
  productName: string;
  plan: Plan;
  priceUsdCents: number;
  quantity: number;
}

interface CartContextValue {
  items: readonly CartItem[];
  add: (item: Omit<CartItem, 'quantity'>) => void;
  remove: (productId: ProductId, plan: Plan) => void;
  setQuantity: (productId: ProductId, plan: Plan, qty: number) => void;
  clear: () => void;
  totalUsdCents: number;
  itemCount: number;
  hydrated: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

function sameLine(a: { productId: ProductId; plan: Plan }, b: { productId: ProductId; plan: Plan }): boolean {
  return a.productId === b.productId && a.plan === b.plan;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  // `hydrated` keeps SSR/static-export render identical to the empty cart;
  // we only consider the localStorage cart after first mount on the client.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { items?: CartItem[] };
        if (Array.isArray(parsed.items)) setItems(parsed.items);
      }
    } catch {
      // Corrupt storage — start empty.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items }));
    } catch {
      // Quota errors, private mode, etc. — fail silently.
    }
  }, [items, hydrated]);

  const add = useCallback((item: Omit<CartItem, 'quantity'>) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => sameLine(p, item));
      if (idx >= 0) {
        const next = [...prev];
        const current = next[idx];
        if (current) {
          next[idx] = { ...current, quantity: current.quantity + 1 };
        }
        return next;
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const remove = useCallback((productId: ProductId, plan: Plan) => {
    setItems((prev) => prev.filter((p) => !sameLine(p, { productId, plan })));
  }, []);

  const setQuantity = useCallback((productId: ProductId, plan: Plan, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) {
        return prev.filter((p) => !sameLine(p, { productId, plan }));
      }
      return prev.map((p) => (sameLine(p, { productId, plan }) ? { ...p, quantity: qty } : p));
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const totalUsdCents = items.reduce((sum, item) => sum + item.priceUsdCents * item.quantity, 0);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    return { items, add, remove, setQuantity, clear, totalUsdCents, itemCount, hydrated };
  }, [items, add, remove, setQuantity, clear, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used inside <CartProvider>');
  }
  return ctx;
}
