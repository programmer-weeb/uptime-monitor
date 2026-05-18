import { apiDel, apiGet, apiPatch, apiPost } from './client';

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

export type MonitorStats = {
  uptimePct24h: number | null;
  avgLatencyMs24h: number | null;
  lastDownAt: string | null;
  totalChecks24h: number;
};

export type MonitorCheck = {
  id: string;
  status: 'up' | 'down';
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
  checkedAt: string;
};

export type CreateMonitorInput = {
  name: string;
  url: string;
  intervalMinutes: number;
};

export type PatchMonitorInput = {
  name?: string;
  url?: string;
  intervalMinutes?: number;
  isPaused?: boolean;
};

export function listMonitors(signal?: AbortSignal): Promise<Monitor[]> {
  return apiGet<Monitor[]>('/api/monitors', { signal });
}

export function createMonitor(input: CreateMonitorInput): Promise<Monitor> {
  return apiPost<Monitor>('/api/monitors', input);
}

export function getMonitor(id: string, signal?: AbortSignal): Promise<Monitor> {
  return apiGet<Monitor>(`/api/monitors/${id}`, { signal });
}

export function getMonitorStats(id: string, signal?: AbortSignal): Promise<MonitorStats> {
  return apiGet<MonitorStats>(`/api/monitors/${id}/stats`, { signal });
}

export function listMonitorChecks(
  id: string,
  limit = 100,
  signal?: AbortSignal,
): Promise<MonitorCheck[]> {
  return apiGet<MonitorCheck[]>(`/api/monitors/${id}/checks?limit=${limit}`, { signal });
}

export function patchMonitor(id: string, input: PatchMonitorInput): Promise<Monitor> {
  return apiPatch<Monitor>(`/api/monitors/${id}`, input);
}

export function deleteMonitor(id: string): Promise<void> {
  return apiDel<void>(`/api/monitors/${id}`);
}
