import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, apiGet, setAuthTokenGetter } from '../api/client';
import {
  AuthContext,
  TOKEN_STORAGE_KEY,
  type AuthState,
  type AuthUser,
} from './auth-context';

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable (private mode, quota). Tolerate it —
    // the user just loses persistence across reloads.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(readStoredToken()));

  // Expose a token *getter* (not the value) to the api client so requests
  // always pick up the freshest token without re-running module init.
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;
  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    writeStoredToken(null);
    queryClient.clear();
  }, [queryClient]);

  const login = useCallback((nextToken: string, nextUser: AuthUser) => {
    writeStoredToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setIsLoading(false);
  }, []);

  // Boot-time validation: if we have a stored token, hit /auth/me to make
  // sure it's still valid. Clear on 401, keep on success.
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    apiGet<AuthUser>('/api/me')
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          logout();
        }
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // We only want this to fire on token transitions (login/logout, boot).
  }, [token, logout]);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      isLoading,
      isAuthed: Boolean(token && user),
      login,
      logout,
    }),
    [token, user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
