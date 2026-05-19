import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { ApiError } from '../api/client';
import {
  deleteMonitor,
  getMonitor,
  getMonitorStats,
  listMonitorChecks,
  patchMonitor,
  type Monitor,
  type MonitorCheck,
  type PatchMonitorInput,
} from '../api/monitors';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../lib/useAuth';
import { EditMonitorModal } from '../components/EditMonitorModal';
import { DeleteMonitorConfirmModal } from '../components/DeleteMonitorConfirmModal';

const CHECK_LIMIT = 100;

export default function MonitorDetail() {
  const { id: routeId } = useParams<{ id: string }>();
  const id = routeId ?? '';
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const monitorQuery = useQuery({
    queryKey: queryKeys.monitor(id),
    queryFn: ({ signal }) => getMonitor(id, signal),
    enabled: id.length > 0,
  });
  const statsQuery = useQuery({
    queryKey: queryKeys.monitorStats(id),
    queryFn: ({ signal }) => getMonitorStats(id, signal),
    enabled: id.length > 0,
  });
  const checksQuery = useQuery({
    queryKey: queryKeys.monitorChecks(id, CHECK_LIMIT),
    queryFn: ({ signal }) => listMonitorChecks(id, CHECK_LIMIT, signal),
    enabled: id.length > 0,
  });

  const togglePauseMutation = useMutation({
    mutationFn: (isPaused: boolean) => patchMonitor(id, { isPaused }),
    onSuccess: (monitor) => {
      queryClient.setQueryData(queryKeys.monitor(id), monitor);
      void queryClient.invalidateQueries({ queryKey: queryKeys.monitors() });
    },
  });

  const editMutation = useMutation({
    mutationFn: (patch: PatchMonitorInput) => patchMonitor(id, patch),
    onSuccess: (monitor) => {
      queryClient.setQueryData(queryKeys.monitor(id), monitor);
      void queryClient.invalidateQueries({ queryKey: queryKeys.monitors() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.monitorStats(id) });
      setIsEditOpen(false);
      setEditError(null);
    },
    onError: (err: unknown) => {
      setEditError(messageFor(err, 'Could not update monitor.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteMonitor(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.monitors() });
      queryClient.removeQueries({ queryKey: queryKeys.monitor(id) });
      navigate('/', { replace: true });
    },
    onError: (err: unknown) => {
      setDeleteError(messageFor(err, 'Could not delete monitor.'));
    },
  });

  function openEdit() {
    setEditError(null);
    setIsEditOpen(true);
  }

  function handleEditSubmit(patch: PatchMonitorInput) {
    if (Object.keys(patch).length === 0) {
      setIsEditOpen(false);
      return;
    }
    setEditError(null);
    editMutation.mutate(patch);
  }

  function openDelete() {
    setDeleteError(null);
    setIsDeleteOpen(true);
  }

  const monitor = monitorQuery.data;
  const stats = statsQuery.data;
  const checks = useMemo(() => checksQuery.data ?? [], [checksQuery.data]);
  const chartData = useMemo(
    () =>
      checks
        .slice()
        .reverse()
        .map((check) => ({
          checkedAt: check.checkedAt,
          latencyMs: check.status === 'up' ? check.latencyMs : null,
          status: check.status,
        })),
    [checks],
  );

  const isNotFound =
    monitorQuery.error instanceof ApiError &&
    monitorQuery.error.status === 404;

  if (isNotFound) return <Navigate to="/" replace />;
  if (!id) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-canvas border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="min-w-0 flex items-center gap-3">
            <Link to="/" className="text-sm text-charcoal hover:text-ink transition-colors">
              ← Monitors
            </Link>
            <span className="text-stone">/</span>
            <h1 className="truncate text-sm font-medium text-ink">
              {monitor?.name ?? 'Monitor'}
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {user && <span className="hidden text-stone sm:inline text-xs">{user.email}</span>}
            <button type="button" onClick={logout} className="text-charcoal hover:text-ink transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        {user?.isDemo && (
          <div
            role="status"
            className="rounded-md border border-accent-yellow/20 bg-accent-yellow/5 px-4 py-2.5 text-sm text-accent-yellow"
          >
            Demo account is read only.
          </div>
        )}

        {monitorQuery.isLoading ? (
          <div className="rounded-lg border border-hairline-strong bg-surface-card p-6 text-sm text-mute">
            Loading monitor…
          </div>
        ) : monitorQuery.isError ? (
          <div role="alert" className="rounded-lg border border-accent-red/20 bg-accent-red/5 p-6 text-sm text-accent-red">
            Could not load monitor.
          </div>
        ) : monitor ? (
          <>
            {/* Monitor overview card */}
            <section className="rounded-lg border border-hairline-strong bg-surface-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={monitor.currentStatus} />
                    {monitor.isPaused && (
                      <span className="rounded-full border border-accent-yellow/20 bg-accent-yellow/5 px-2 py-0.5 text-xs font-medium text-accent-yellow">
                        paused
                      </span>
                    )}
                  </div>
                  <a
                    href={monitor.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm text-link hover:underline font-mono"
                  >
                    {monitor.url}
                  </a>
                  <p className="text-xs text-mute">
                    Every {monitor.intervalMinutes} minute
                    {monitor.intervalMinutes === 1 ? '' : 's'} · last checked{' '}
                    {formatDateTime(monitor.lastCheckedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={user?.isDemo || togglePauseMutation.isPending}
                    onClick={() => togglePauseMutation.mutate(!monitor.isPaused)}
                    className="rounded-md border border-hairline-strong bg-surface-elevated px-3 py-2 text-sm font-medium text-ink hover:bg-surface-elevated/80 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {monitor.isPaused ? 'Resume checks' : 'Pause checks'}
                  </button>
                  <button
                    type="button"
                    disabled={user?.isDemo}
                    onClick={openEdit}
                    className="rounded-md border border-hairline-strong bg-surface-elevated px-3 py-2 text-sm font-medium text-ink hover:bg-surface-elevated/80 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={user?.isDemo}
                    onClick={openDelete}
                    className="rounded-md border border-accent-red/20 px-3 py-2 text-sm font-medium text-accent-red hover:bg-accent-red/5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {togglePauseMutation.isError && (
                <p role="alert" className="mt-3 text-sm text-accent-red">
                  Could not update monitor.
                </p>
              )}
            </section>

            {/* Metrics */}
            <section className="grid gap-3 md:grid-cols-4">
              <Metric label="24h uptime" value={formatPct(stats?.uptimePct24h)} prominent />
              <Metric label="Avg latency" value={formatLatency(stats?.avgLatencyMs24h)} />
              <Metric label="Checks" value={stats?.totalChecks24h.toString() ?? '—'} />
              <Metric label="Last down" value={formatDateTime(stats?.lastDownAt)} />
            </section>

            {/* Latency chart */}
            <section className="rounded-lg border border-hairline-strong bg-surface-card">
              <div className="border-b border-hairline px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink">Latency</h2>
              </div>
              <div className="h-64 p-4">
                {checksQuery.isLoading ? (
                  <div className="flex h-full items-center text-sm text-mute">Loading checks…</div>
                ) : checksQuery.isError ? (
                  <div role="alert" className="flex h-full items-center text-sm text-accent-red">
                    Could not load checks.
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="flex h-full items-center text-sm text-mute">
                    No checks recorded yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <XAxis
                        dataKey="checkedAt"
                        tickFormatter={formatTime}
                        minTickGap={28}
                        tick={{ fontSize: 11, fill: '#888e90' }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                        tickLine={false}
                      />
                      <YAxis
                        width={52}
                        tickFormatter={(value) => `${value}ms`}
                        tick={{ fontSize: 11, fill: '#888e90' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="latencyMs"
                        stroke="#3b9eff"
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            {/* Recent checks */}
            <section className="rounded-lg border border-hairline-strong bg-surface-card">
              <div className="border-b border-hairline px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink">Recent checks</h2>
              </div>
              <ChecksTable checks={checks} />
            </section>

            {isEditOpen && (
              <EditMonitorModal
                monitor={monitor}
                error={editError}
                isSubmitting={editMutation.isPending}
                onClose={() => setIsEditOpen(false)}
                onSubmit={handleEditSubmit}
              />
            )}
            {isDeleteOpen && (
              <DeleteMonitorConfirmModal
                monitorName={monitor.name}
                error={deleteError}
                isSubmitting={deleteMutation.isPending}
                onCancel={() => setIsDeleteOpen(false)}
                onConfirm={() => {
                  setDeleteError(null);
                  deleteMutation.mutate();
                }}
              />
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function Metric({
  label,
  value,
  prominent = false,
}: {
  label: string;
  value: string;
  prominent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-hairline-strong bg-surface-card p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-ash">{label}</div>
      <div className={`${prominent ? 'text-2xl' : 'text-xl'} mt-2 font-semibold text-ink tabular-nums`}>
        {value}
      </div>
    </div>
  );
}

function ChecksTable({ checks }: { checks: MonitorCheck[] }) {
  if (checks.length === 0) {
    return <div className="p-6 text-sm text-mute">No checks recorded yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-ash">
              Time
            </th>
            <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-ash">
              Status
            </th>
            <th scope="col" className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-ash">
              Latency
            </th>
            <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-ash">
              Response
            </th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check) => (
            <tr key={check.id} className="border-b border-hairline last:border-0">
              <td className="px-5 py-3 text-charcoal text-xs font-mono">{formatDateTime(check.checkedAt)}</td>
              <td className="px-5 py-3">
                <CheckBadge status={check.status} />
              </td>
              <td className="px-5 py-3 text-right tabular-nums text-charcoal text-xs font-mono">
                {formatLatency(check.latencyMs)}
              </td>
              <td className="px-5 py-3 text-mute text-xs font-mono">
                {check.statusCode ?? check.error ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: Monitor['currentStatus'] }) {
  if (status === 'up') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-green">
        <span className="w-2 h-2 rounded-full bg-accent-green" />
        up
      </span>
    );
  }
  if (status === 'down') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-red">
        <span className="w-2 h-2 rounded-full bg-accent-red" />
        down
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-mute">
      <span className="w-2 h-2 rounded-full bg-mute" />
      unknown
    </span>
  );
}

function CheckBadge({ status }: { status: MonitorCheck['status'] }) {
  if (status === 'up') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-green">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
        up
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-red">
      <span className="w-1.5 h-1.5 rounded-full bg-accent-red" />
      down
    </span>
  );
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const latency = payload[0]?.value;
  return (
    <div className="rounded-md border border-hairline-strong bg-surface-elevated px-3 py-2 text-sm">
      <div className="font-medium text-ink text-xs">{formatDateTime(label)}</div>
      <div className="text-charcoal text-xs">{formatLatency(latency)}</div>
    </div>
  );
}

function formatPct(value: number | null | undefined): string {
  return typeof value === 'number' ? `${value.toFixed(2)}%` : '—';
}

function formatLatency(value: number | null | undefined): string {
  return typeof value === 'number' ? `${value} ms` : '—';
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
