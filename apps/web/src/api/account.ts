import { apiGet, apiPatch } from './client';

export type Me = {
  id: string;
  email: string;
  phone: string | null;
  isDemo: boolean;
  createdAt: string;
};

export function getMe(signal?: AbortSignal): Promise<Me> {
  return apiGet<Me>('/api/me', { signal });
}

export function updateMe(input: { phone: string | null }): Promise<Me> {
  return apiPatch<Me>('/api/me', input);
}
