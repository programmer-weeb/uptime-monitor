import { apiGet, apiPost } from './client';

export type MonitorStatus = 'up' | 'down' | 'unknown';

export type Monitor = {
  id: string;
  name: string;
  url: string;
  intervalMinutes: number;
  isPaused?: boolean;
  currentStatus: MonitorStatus;
  lastCheckedAt?: string | null;
  lastLatencyMs?: number | null;
  latencyMs?: number | null;
  lastCheck?: {
    latencyMs?: number | null;
    checkedAt?: string | null;
  } | null;
  createdAt?: string;
};

export type CreateMonitorInput = {
  name: string;
  url: string;
  intervalMinutes: number;
};

export function listMonitors(signal?: AbortSignal): Promise<Monitor[]> {
  return apiGet<Monitor[]>('/api/monitors', { signal });
}

export function createMonitor(input: CreateMonitorInput): Promise<Monitor> {
  return apiPost<Monitor>('/api/monitors', input);
}
