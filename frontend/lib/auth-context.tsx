'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from './api';

export interface AuthUser {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  tenants_owned: string[];
  tenants_member_of: string[];
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'unauthenticated' };

interface AuthContextValue {
  state: AuthState;
  /** Force a fresh /me round-trip. */
  refresh: () => Promise<void>;
  /** Seed the cache with a user we already received from /auth/verify. */
  setUser: (user: AuthUser) => void;
  /** POST /auth/logout (drops the cookie) + flip state to unauthenticated. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const user = await api.getJson<AuthUser>('/me');
      setState({ status: 'authenticated', user });
    } catch (err) {
      if (err instanceof ApiError) {
        setState({ status: 'unauthenticated' });
        return;
      }
      // Network error / dev-server down. Fail safe to unauthenticated; the UI
      // shows "Sign in" rather than an indefinite spinner.
      setState({ status: 'unauthenticated' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setUser = useCallback((user: AuthUser) => {
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.postJson<void>('/auth/logout', {});
    } catch {
      // Always clear local state, even if the network call failed.
    }
    setState({ status: 'unauthenticated' });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, refresh, setUser, logout }),
    [state, refresh, setUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

/** Compute display initials from the user's name (falls back to email). */
export function userInitials(user: AuthUser): string {
  const f = user.first_name?.trim() ?? '';
  const l = user.last_name?.trim() ?? '';
  if (f.length > 0 && l.length > 0) return `${f[0] ?? ''}${l[0] ?? ''}`.toUpperCase();
  if (f.length > 0) return f.slice(0, 2).toUpperCase();
  return user.email.slice(0, 2).toUpperCase();
}
