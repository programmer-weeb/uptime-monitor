import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { Monitor, MonitorCheck } from '../api/monitors';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from './useAuth';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const CHECK_LIMIT = 100;

type CheckCompletedPayload = {
  monitor: Monitor;
  check: MonitorCheck & { monitorId: string };
};

type MonitorStatusChangedPayload = {
  monitorId: string;
  previousStatus: Monitor['currentStatus'];
  currentStatus: Monitor['currentStatus'];
  monitor: Monitor;
};

type ServerEvents = {
  'check:completed': (payload: CheckCompletedPayload) => void;
  'monitor:status_changed': (payload: MonitorStatusChangedPayload) => void;
};

type ClientEvents = Record<string, never>;

export function LiveMonitorUpdates() {
  const { token, isAuthed } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token || !isAuthed) return;

    const socket: Socket<ServerEvents, ClientEvents> = io(API_URL || undefined, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('check:completed', ({ monitor, check }) => {
      mergeMonitor(queryClient, monitor);
      queryClient.setQueryData<MonitorCheck[]>(
        queryKeys.monitorChecks(monitor.id, CHECK_LIMIT),
        (current) => {
          const next = [check, ...(current ?? []).filter((item) => item.id !== check.id)];
          return next.slice(0, CHECK_LIMIT);
        },
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.monitorStats(monitor.id) });
    });

    socket.on('monitor:status_changed', ({ monitor }) => {
      mergeMonitor(queryClient, monitor);
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthed, queryClient, token]);

  return null;
}

function mergeMonitor(queryClient: ReturnType<typeof useQueryClient>, monitor: Monitor): void {
  queryClient.setQueryData<Monitor[]>(queryKeys.monitors(), (current) =>
    current?.map((item) => (item.id === monitor.id ? { ...item, ...monitor } : item)),
  );
  queryClient.setQueryData<Monitor>(queryKeys.monitor(monitor.id), (current) => ({
    ...current,
    ...monitor,
  }));
}
