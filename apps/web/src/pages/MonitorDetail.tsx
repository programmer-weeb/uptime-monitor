import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
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
  getMonitor,
  getMonitorStats,
  listMonitorChecks,
  patchMonitor,
  type Monitor,
  type MonitorCheck,
} from '../api/monitors';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../lib/useAuth';

const CHECK_LIMIT = 100;

export default function MonitorDetail() {
  const { id: routeId } = useParams<{ id: string }>();
  const id = routeId ?? '';
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

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

  if (isNotFound) {
    return <Navigate to="/" replace />;
  }

  if (!id) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <Link to="/" className="text-sm font-medium text-blue-600 hover:underline">
              Monitors
            </Link>
            <h1 className="truncate text-lg font-semibold text-gray-900">
              {monitor?.name ?? 'Monitor'}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {user && <span className="hidden text-gray-600 sm:inline">{user.email}</span>}
            <button type="button" onClick={logout} className="text-blue-600 hover:underline">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {user?.isDemo && (
          <div
            role="status"
            className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-900"
          >
            Demo account is read only.
          </div>
        )}

        {monitorQuery.isLoading ? (
          <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-600">
            Loading monitor…
          </div>
        ) : monitorQuery.isError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            Could not load monitor.
          </div>
        ) : monitor ? (
          <>
            <section className="rounded-md border border-gray-200 bg-white p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={monitor.currentStatus} />
                    {monitor.isPaused && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        paused
                      </span>
                    )}
                  </div>
                  <a
                    href={monitor.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm text-blue-600 hover:underline"
                  >
                    {monitor.url}
                  </a>
                  <p className="text-sm text-gray-600">
                    Every {monitor.intervalMinutes} minute
                    {monitor.intervalMinutes === 1 ? '' : 's'} · last checked{' '}
                    {formatDateTime(monitor.lastCheckedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={user?.isDemo || togglePauseMutation.isPending}
                  onClick={() => togglePauseMutation.mutate(!monitor.isPaused)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {monitor.isPaused ? 'Resume checks' : 'Pause checks'}
                </button>
              </div>
              {togglePauseMutation.isError && (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  Could not update monitor.
                </p>
              )}
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <Metric label="24h uptime" value={formatPct(stats?.uptimePct24h)} prominent />
              <Metric label="Avg latency" value={formatLatency(stats?.avgLatencyMs24h)} />
              <Metric label="Checks" value={stats?.totalChecks24h.toString() ?? '—'} />
              <Metric label="Last down" value={formatDateTime(stats?.lastDownAt)} />
            </section>

            <section className="rounded-md border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-4 py-3">
                <h2 className="text-base font-semibold text-gray-900">Latency</h2>
              </div>
              <div className="h-72 p-4">
                {checksQuery.isLoading ? (
                  <div className="flex h-full items-center text-sm text-gray-600">
                    Loading checks…
                  </div>
                ) : checksQuery.isError ? (
                  <div role="alert" className="flex h-full items-center text-sm text-red-600">
                    Could not load checks.
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="flex h-full items-center text-sm text-gray-600">
                    No checks recorded yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <XAxis
                        dataKey="checkedAt"
                        tickFormatter={formatTime}
                        minTickGap={28}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        width={48}
                        tickFormatter={(value) => `${value}ms`}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="latencyMs"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="rounded-md border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-4 py-3">
                <h2 className="text-base font-semibold text-gray-900">Recent checks</h2>
              </div>
              <ChecksTable checks={checks} />
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
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
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`${prominent ? 'text-3xl' : 'text-2xl'} mt-2 font-semibold text-gray-900`}>
        {value}
      </div>
    </div>
  );
}

function ChecksTable({ checks }: { checks: MonitorCheck[] }) {
  if (checks.length === 0) {
    return <div className="p-6 text-sm text-gray-600">No checks recorded yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th scope="col" className="px-4 py-3">
              Time
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Latency
            </th>
            <th scope="col" className="px-4 py-3">
              Response
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {checks.map((check) => (
            <tr key={check.id}>
              <td className="px-4 py-3 text-gray-700">{formatDateTime(check.checkedAt)}</td>
              <td className="px-4 py-3">
                <CheckBadge status={check.status} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                {formatLatency(check.latencyMs)}
              </td>
              <td className="px-4 py-3 text-gray-600">
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
  const classes =
    status === 'up'
      ? 'border-green-200 bg-green-50 text-green-700'
      : status === 'down'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-gray-200 bg-gray-50 text-gray-600';

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${classes}`}>
      {status}
    </span>
  );
}

function CheckBadge({ status }: { status: MonitorCheck['status'] }) {
  const classes =
    status === 'up' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${classes}`}>
      {status}
    </span>
  );
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const latency = payload[0]?.value;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
      <div className="font-medium text-gray-900">{formatDateTime(label)}</div>
      <div className="text-gray-600">{formatLatency(latency)}</div>
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
