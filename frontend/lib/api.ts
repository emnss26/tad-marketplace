/**
 * Thin fetch wrapper for the marketplace API.
 *
 * - `credentials: 'include'` so the `tad_session` HttpOnly cookie set by
 *   `/auth/verify` rides along on subsequent requests.
 * - JSON in, JSON out (or void for 204).
 * - Errors are thrown as `ApiError` carrying status + best-effort payload.
 *
 * Base URL is `NEXT_PUBLIC_API_URL` (build-time inlined by Next.js) with a
 * localhost fallback for `npm run dev:frontend` against a local dev server.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(`API error ${status.toString()}`);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = (await res.json()) as unknown;
    } catch {
      payload = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, payload);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  postJson: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  getJson: <T>(path: string) => request<T>('GET', path),
} as const;
