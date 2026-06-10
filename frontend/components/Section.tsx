import type { ReactNode } from 'react';

/**
 * Re-usable section wrapper with optional eyebrow / title / subtitle.
 * Mirror of `tad-landing/src/components/Section.jsx`.
 */
export default function Section({
  id,
  eyebrow,
  title,
  subtitle,
  align = 'left',
  children,
  className = '',
  bg = 'white',
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  align?: 'left' | 'center';
  children?: ReactNode;
  className?: string;
  bg?: 'white' | 'ink' | 'brand';
}) {
  const bgClass = bg === 'ink' ? 'bg-ink-50' : bg === 'brand' ? 'bg-brand-50' : 'bg-white';
  const headerAlign = align === 'center' ? 'mx-auto text-center' : 'text-left';

  return (
    <section id={id} className={`section ${bgClass} ${className}`}>
      <div className="container-tad">
        {(eyebrow ?? title ?? subtitle) && (
          <header className={`mb-12 max-w-3xl ${headerAlign}`}>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && (
              <h2 className="mt-4 text-3xl font-semibold leading-tight md:text-4xl">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-4 text-lg text-ink-600">{subtitle}</p>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}
