import { createContext } from 'react';

export type AuthUser = {
  id: string;
  email: string;
  isDemo: boolean;
};

export type AuthState = {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  isAuthed: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
};

export const AuthContext = createContext<AuthState | null>(null);

export const TOKEN_STORAGE_KEY = 'uptime.token';
