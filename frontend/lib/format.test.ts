import { describe, it, expect } from 'vitest';
import { formatPriceUsdCents } from './format';

describe('formatPriceUsdCents', () => {
  it('formats 2000 cents as $20.00 (Personal tier)', () => {
    expect(formatPriceUsdCents(2000)).toBe('$20.00');
  });

  it('formats 3900 cents as $39.00 (SMB tier)', () => {
    expect(formatPriceUsdCents(3900)).toBe('$39.00');
  });

  it('formats 4900 cents as $49.00 (Enterprise tier)', () => {
    expect(formatPriceUsdCents(4900)).toBe('$49.00');
  });

  it('formats 0 as $0.00', () => {
    expect(formatPriceUsdCents(0)).toBe('$0.00');
  });
});
