import { apiGet, apiPatch, apiPost } from './client';

export type Me = {
  id: string;
  email: string;
  telegramChatId: string | null;
  isDemo: boolean;
  createdAt: string;
};

export type TelegramConnectResponse = {
  token: string;
  botUsername: string;
};

export function getMe(signal?: AbortSignal): Promise<Me> {
  return apiGet<Me>('/api/me', { signal });
}

export function updateMe(input: { telegramChatId: string | null }): Promise<Me> {
  return apiPatch<Me>('/api/me', input);
}

export function connectTelegram(): Promise<TelegramConnectResponse> {
  return apiPost<TelegramConnectResponse>('/api/me/telegram-connect');
}
