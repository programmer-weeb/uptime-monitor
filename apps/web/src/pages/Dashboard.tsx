import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  createMonitor,
  listMonitors,
  type CreateMonitorInput,
  type Monitor,
} from '../api/monitors';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../lib/useAuth';

const INTERVAL_OPTIONS = [1, 5, 15, 30, 60] as const;

export default function Dashboard() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const monitorsQuery = useQuery({
    queryKey: queryKeys.monitors(),
    queryFn: ({ signal }) => listMonitors(signal),
  });

  const createMutation = useMutation({
    mutationFn: createMonitor,
    onMutate: async (input) => {
      setFormError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.monitors() });
      const previous = queryClient.getQueryData<Monitor[]>(queryKeys.monitors());
      const optimistic: Monitor = {
        id: `optimistic-${Date.now()}`,
        name: input.name,
        url: input.url,
        intervalMinutes: input.intervalMinutes,
        currentStatus: 'unknown',
        lastCheckedAt: null,
      };
      queryClient.setQueryData<Monitor[]>(queryKeys.monitors(), (old) => [
        optimistic,
        ...(old ?? []),
      ]);
      return { previous };
    },
    onError: (err, _input, context) => {
      queryClient.setQueryData(queryKeys.monitors(), context?.previous);
      const message = err instanceof ApiError ? err.message : 'Could not add monitor.';
      setFormError(message);
    },
    onSuccess: () => {
      setIsAddOpen(false);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.monitors() });
    },
  });

  const monitors = useMemo(() => monitorsQuery.data ?? [], [monitorsQuery.data]);
  const sortedMonitors = useMemo(
    () =>
      [...monitors].sort((a, b) => {
        const aCreated = Date.parse(a.createdAt ?? '');
        const bCreated = Date.parse(b.createdAt ?? '');
        if (Number.isNaN(aCreated) || Number.isNaN(bCreated)) return 0;
        return bCreated - aCreated;
      }),
    [monitors],
  );

  function openAddModal() {
    setFormError(null);
    setIsAddOpen(true);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Uptime Monitor</h1>
          <div className="flex items-center gap-3 text-sm">
            {user && <span className="text-gray-600">{user.email}</span>}
            <button
              type="button"
              onClick={logout}
              className="text-blue-600 hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {user?.isDemo && (
          <div
            role="status"
            className="rounded-md border border-yellow-300 bg-yellow-50 text-yellow-900 text-sm px-4 py-2"
          >
            Demo account — read only.
          </div>
        )}

        <section className="bg-white border border-gray-200 rounded-md">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Monitors</h2>
              <p className="text-sm text-gray-500">{monitorsSummary(monitorsQuery.isLoading, monitors.length)}</p>
            </div>
            <button
              type="button"
              onClick={openAddModal}
              disabled={user?.isDemo}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add monitor
            </button>
          </div>

          {monitorsQuery.isLoading ? (
            <div className="p-6 text-sm text-gray-600">Loading monitors…</div>
          ) : monitorsQuery.isError ? (
            <div role="alert" className="p-6 text-sm text-red-600">
              Could not load monitors.
            </div>
          ) : sortedMonitors.length === 0 ? (
            <div className="p-6 text-sm text-gray-600">
              No monitors yet. Add your first HTTPS URL to start tracking uptime.
            </div>
          ) : (
            <MonitorTable monitors={sortedMonitors} />
          )}
        </section>

        {isAddOpen && (
          <AddMonitorModal
            error={formError}
            isSubmitting={createMutation.isPending}
            onClose={() => {
              if (!createMutation.isPending) setIsAddOpen(false);
            }}
            onSubmit={(input) => createMutation.mutate(input)}
          />
        )}
      </main>
    </div>
  );
}

function MonitorTable({ monitors }: { monitors: Monitor[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th scope="col" className="px-4 py-3">
              Name
            </th>
            <th scope="col" className="px-4 py-3">
              URL
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
            <th scope="col" className="px-4 py-3">
              Last checked
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Latency
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {monitors.map((monitor) => (
            <tr key={monitor.id} className="align-top">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">{monitor.name}</div>
                <div className="text-xs text-gray-500">{monitor.intervalMinutes} min interval</div>
              </td>
              <td className="px-4 py-3">
                <a
                  href={monitor.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block max-w-xs truncate text-blue-600 hover:underline"
                >
                  {monitor.url}
                </a>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={monitor.currentStatus} />
              </td>
              <td className="px-4 py-3 text-gray-600">
                {formatDateTime(monitor.lastCheckedAt ?? monitor.lastCheck?.checkedAt)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                {formatLatency(getLatency(monitor))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddMonitorModal({
  error,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: CreateMonitorInput) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [intervalMinutes, setIntervalMinutes] =
    useState<(typeof INTERVAL_OPTIONS)[number]>(5);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      url: url.trim(),
      intervalMinutes,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-monitor-title"
        className="w-full max-w-md rounded-md border border-gray-200 bg-white p-5 shadow-lg"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="add-monitor-title" className="text-lg font-semibold text-gray-900">
            Add monitor
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-60"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="monitor-name" className="mb-1 block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              id="monitor-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="monitor-url" className="mb-1 block text-sm font-medium text-gray-700">
              URL
            </label>
            <input
              id="monitor-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://example.com"
              pattern="https://.*"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="monitor-interval" className="mb-1 block text-sm font-medium text-gray-700">
              Check interval
            </label>
            <select
              id="monitor-interval"
              value={intervalMinutes}
              onChange={(e) =>
                setIntervalMinutes(Number(e.target.value) as (typeof INTERVAL_OPTIONS)[number])
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {INTERVAL_OPTIONS.map((interval) => (
                <option key={interval} value={interval}>
                  Every {interval} minute{interval === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Adding…' : 'Add monitor'}
            </button>
          </div>
        </form>
      </div>
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

function monitorsSummary(isLoading: boolean, count: number): string {
  if (isLoading) return 'Loading status data';
  if (count === 0) return 'No monitors configured';
  return `${count} monitor${count === 1 ? '' : 's'} configured`;
}

function getLatency(monitor: Monitor): number | null | undefined {
  return monitor.lastLatencyMs ?? monitor.latencyMs ?? monitor.lastCheck?.latencyMs;
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
