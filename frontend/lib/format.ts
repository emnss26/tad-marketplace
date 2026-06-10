/**
 * Format US-cent integer amounts as human-readable USD.
 * Used in the catalogue and dashboard.
 */
export function formatPriceUsdCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
