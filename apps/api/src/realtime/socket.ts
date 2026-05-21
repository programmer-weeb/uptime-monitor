import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { corsOrigins } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { log } from '../config/log.js';
import { verifyToken } from '../lib/jwt.js';

export type RealtimeMonitor = {
  id: string;
  name: string;
  url: string;
  intervalMinutes: number;
  isPaused: boolean;
  currentStatus: 'up' | 'down' | 'unknown';
  lastCheckedAt: string | null;
  createdAt: string;
  lastLatencyMs?: number | null;
};

export type RealtimeCheck = {
  id: string;
  monitorId: string;
  status: 'up' | 'down';
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
  checkedAt: string;
};

export type CheckCompletedPayload = {
  monitor: RealtimeMonitor;
  check: RealtimeCheck;
};

export type MonitorStatusChangedPayload = {
  monitorId: string;
  previousStatus: RealtimeMonitor['currentStatus'];
  currentStatus: RealtimeMonitor['currentStatus'];
  monitor: RealtimeMonitor;
};

export type TelegramConnectedPayload = { telegramChatId: string };

type ServerToClientEvents = {
  'check:completed': (payload: CheckCompletedPayload) => void;
  'monitor:status_changed': (payload: MonitorStatusChangedPayload) => void;
  'telegram:connected': (payload: TelegramConnectedPayload) => void;
};

type ClientToServerEvents = Record<string, never>;
type InterServerEvents = Record<string, never>;
type SocketData = { userId: string };

let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null =
  null;

export function createRealtimeServer(httpServer: HttpServer) {
  io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: { origin: corsOrigins, credentials: true },
    },
  );

  io.use(async (socket, next) => {
    try {
      const token = readHandshakeToken(socket.handshake.auth.token);
      if (!token) {
        next(new Error('Authentication required'));
        return;
      }

      const claims = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: claims.sub },
        select: { id: true },
      });
      if (!user) {
        next(new Error('Authentication required'));
        return;
      }

      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('Authentication required'));
    }
  });

  io.on('connection', (socket) => {
    const room = userRoom(socket.data.userId);
    void socket.join(room);
    log.debug({ socketId: socket.id, userId: socket.data.userId }, 'socket connected');

    socket.on('disconnect', (reason) => {
      log.debug({ socketId: socket.id, reason }, 'socket disconnected');
    });
  });

  return io;
}

export function emitCheckCompleted(userId: string, payload: CheckCompletedPayload): void {
  io?.to(userRoom(userId)).emit('check:completed', payload);
}

export function emitMonitorStatusChanged(
  userId: string,
  payload: MonitorStatusChangedPayload,
): void {
  io?.to(userRoom(userId)).emit('monitor:status_changed', payload);
}

export function emitTelegramConnected(userId: string, telegramChatId: string): void {
  io?.to(userRoom(userId)).emit('telegram:connected', { telegramChatId });
}

export function toRealtimeMonitor(monitor: {
  id: string;
  name: string;
  url: string;
  intervalMinutes: number;
  isPaused: boolean;
  currentStatus: RealtimeMonitor['currentStatus'];
  lastCheckedAt: Date | string | null;
  createdAt: Date | string;
  lastLatencyMs?: number | null;
}): RealtimeMonitor {
  return {
    ...monitor,
    lastCheckedAt: toIsoOrNull(monitor.lastCheckedAt),
    createdAt: toIso(monitor.createdAt),
  };
}

export function toRealtimeCheck(check: {
  id: string;
  monitorId: string;
  status: RealtimeCheck['status'];
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
  checkedAt: Date | string;
}): RealtimeCheck {
  return {
    ...check,
    checkedAt: toIso(check.checkedAt),
  };
}

function readHandshakeToken(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value ? toIso(value) : null;
}
