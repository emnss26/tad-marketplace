'use client';

import { useState } from 'react';
import { Check, ShoppingCart } from 'lucide-react';
import { useCart } from '@/lib/cart-context';
import type { Plan, ProductId } from '@/lib/products';

/**
 * Per-tier add-to-cart button. Pulls the cart actions from context and shows
 * a brief "Added!" confirmation so the user knows the click registered (the
 * cart-icon badge in the header also updates immediately).
 */
export default function AddToCartButton({
  productId,
  productName,
  plan,
  priceUsdCents,
  disabled = false,
}: {
  productId: ProductId;
  productName: string;
  plan: Plan;
  priceUsdCents: number;
  disabled?: boolean;
}) {
  const { add } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  if (disabled) {
    return (
      <button type="button" disabled className="btn-secondary w-full">
        Coming soon
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        add({ productId, productName, plan, priceUsdCents });
        setJustAdded(true);
        window.setTimeout(() => {
          setJustAdded(false);
        }, 1500);
      }}
      className="btn-primary w-full"
    >
      {justAdded ? (
        <>
          <Check size={16} aria-hidden="true" />
          Added!
        </>
      ) : (
        <>
          <ShoppingCart size={16} aria-hidden="true" />
          Add to cart
        </>
      )}
    </button>
  );
}
