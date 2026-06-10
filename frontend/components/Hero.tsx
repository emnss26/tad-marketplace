import type { ReactNode } from 'react';

/**
 * Shared hero wrapper. Same subtle white-to-brand gradient + vertical padding
 * as `tad-landing/src/components/Hero.jsx` so adjacent properties feel like
 * one product family.
 */
export default function Hero({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <section
      className={`relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white ${className}`}
    >
      <div
        className={`container-tad relative py-20 md:py-28 ${
          align === 'center' ? 'text-center' : ''
        }`}
      >
        {children}
      </div>
    </section>
  );
}
