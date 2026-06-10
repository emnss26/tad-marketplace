import { describe, it, expect } from 'vitest';
import { generatePlaintextToken, hashToken, timingSafeStringEqual } from './tokens.js';

describe('generatePlaintextToken', () => {
  it('produces a 43-char base64url string (32 bytes, no padding)', () => {
    const token = generatePlaintextToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces a different token on each call', () => {
    const a = generatePlaintextToken();
    const b = generatePlaintextToken();
    expect(a).not.toBe(b);
  });
});

describe('hashToken', () => {
  it('hashes deterministically to a 64-char lowercase hex string', () => {
    const h1 = hashToken('hello');
    const h2 = hashToken('hello');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).toMatch(/^[0-9a-f]+$/);
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  it('matches a known SHA-256 hex value', () => {
    // sha256("hello") -> 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(hashToken('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});

describe('timingSafeStringEqual', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeStringEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for different equal-length strings', () => {
    expect(timingSafeStringEqual('abc', 'abd')).toBe(false);
  });

  it('returns false for different-length strings without throwing', () => {
    expect(timingSafeStringEqual('abc', 'abcd')).toBe(false);
  });

  it('returns true for empty strings', () => {
    expect(timingSafeStringEqual('', '')).toBe(true);
  });
});
