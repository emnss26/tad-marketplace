import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearSessionCookie,
  issueSessionJwt,
  readSessionCookie,
  SESSION_TTL_SECONDS,
  sessionCookie,
  verifySessionJwt,
} from './auth.js';

const TEST_SECRET = 'test-secret-must-be-32-chars-long-xxx';

describe('session JWT', () => {
  let originalSecret: string | undefined;
  let originalCookieDomain: string | undefined;

  beforeEach(() => {
    originalSecret = process.env['JWT_SECRET'];
    originalCookieDomain = process.env['SESSION_COOKIE_DOMAIN'];
    process.env['JWT_SECRET'] = TEST_SECRET;
    delete process.env['SESSION_COOKIE_DOMAIN'];
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env['JWT_SECRET'];
    else process.env['JWT_SECRET'] = originalSecret;
    if (originalCookieDomain === undefined) delete process.env['SESSION_COOKIE_DOMAIN'];
    else process.env['SESSION_COOKIE_DOMAIN'] = originalCookieDomain;
  });

  it('round-trips claims through issue + verify', async () => {
    const claims = { user_id: 'usr_test', email: 'test@example.com' };
    const jwt = await issueSessionJwt(claims);
    const decoded = await verifySessionJwt(jwt);
    expect(decoded).toEqual(claims);
  });

  it('rejects a JWT signed with a different secret', async () => {
    const claims = { user_id: 'usr_test', email: 'test@example.com' };
    const jwt = await issueSessionJwt(claims);
    process.env['JWT_SECRET'] = 'a-completely-different-secret-32chars';
    await expect(verifySessionJwt(jwt)).rejects.toThrow();
  });

  it('throws if JWT_SECRET is shorter than 32 chars', async () => {
    process.env['JWT_SECRET'] = 'short';
    await expect(
      issueSessionJwt({ user_id: 'x', email: 'x@x.x' }),
    ).rejects.toThrow(/JWT_SECRET/);
  });
});

describe('sessionCookie', () => {
  beforeEach(() => {
    delete process.env['SESSION_COOKIE_DOMAIN'];
    delete process.env['SESSION_COOKIE_INSECURE'];
  });

  it('emits HttpOnly + Secure + SameSite=Lax + Path=/ + Max-Age by default', () => {
    const c = sessionCookie('abc.def.ghi');
    expect(c).toMatch(/^tad_session=abc\.def\.ghi/);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain(`Max-Age=${SESSION_TTL_SECONDS.toString()}`);
  });

  it('omits Domain by default and includes it when SESSION_COOKIE_DOMAIN is set', () => {
    expect(sessionCookie('abc')).not.toMatch(/Domain=/);
    process.env['SESSION_COOKIE_DOMAIN'] = '.tad.com.mx';
    expect(sessionCookie('abc')).toContain('Domain=.tad.com.mx');
  });

  it('drops Secure when SESSION_COOKIE_INSECURE=true (local dev over HTTP)', () => {
    process.env['SESSION_COOKIE_INSECURE'] = 'true';
    const c = sessionCookie('abc');
    expect(c).not.toContain('Secure');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
  });

  it('clearSessionCookie emits Max-Age=0 with empty value', () => {
    const c = clearSessionCookie();
    expect(c).toContain('tad_session=;');
    expect(c).toContain('Max-Age=0');
  });
});

describe('readSessionCookie', () => {
  it('returns the cookie value when present', () => {
    expect(readSessionCookie(['other=1', 'tad_session=jwtvalue'])).toBe('jwtvalue');
  });

  it('returns null when missing', () => {
    expect(readSessionCookie(['other=1'])).toBeNull();
    expect(readSessionCookie([])).toBeNull();
    expect(readSessionCookie(undefined)).toBeNull();
  });
});
