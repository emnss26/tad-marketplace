/**
 * TAD wordmark. Mirror of `tad-landing/src/components/Logo.jsx`. Kept as a
 * plain text mark for now; when the brand evolves, swap to an SVG here and the
 * change propagates to header + footer automatically.
 */
export default function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <span className="text-lg font-bold tracking-tight text-ink-900">TAD</span>
    </span>
  );
}
