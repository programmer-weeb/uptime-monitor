import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
    <div className="min-h-screen bg-canvas">
      <header className="bg-canvas border-b border-hairline">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="font-display text-xl text-ink tracking-tight">Uptime Monitor</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/settings" className="text-charcoal hover:text-ink transition-colors">
              Settings
            </Link>
            {user && <span className="text-stone hidden sm:inline">{user.email}</span>}
            <button
              type="button"
              onClick={logout}
              className="text-charcoal hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        {user?.isDemo && (
          <div
            role="status"
            className="rounded-md border border-accent-yellow/20 bg-accent-yellow/5 px-4 py-2.5 text-sm text-accent-yellow"
          >
            Demo account — read only.
          </div>
        )}

        <section className="rounded-lg border border-hairline-strong bg-surface-card">
          <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Monitors</h2>
              <p className="text-sm text-mute mt-0.5">
                {monitorsSummary(monitorsQuery.isLoading, monitors.length)}
              </p>
            </div>
            <button
              type="button"
              onClick={openAddModal}
              disabled={user?.isDemo}
              className="rounded-md bg-primary text-primary-on px-3 py-2 text-sm font-medium hover:bg-surface-light transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add monitor
            </button>
          </div>

          {monitorsQuery.isLoading ? (
            <div className="p-6 text-sm text-mute">Loading monitors…</div>
          ) : monitorsQuery.isError ? (
            <div role="alert" className="p-6 text-sm text-accent-red">
              Could not load monitors.
            </div>
          ) : sortedMonitors.length === 0 ? (
            <div className="p-8 text-sm text-mute text-center">
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
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-ash">
              Name
            </th>
            <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-ash">
              URL
            </th>
            <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-ash">
              Status
            </th>
            <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-ash">
              Last checked
            </th>
            <th scope="col" className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-ash">
              Latency
            </th>
          </tr>
        </thead>
        <tbody>
          {monitors.map((monitor) => (
            <tr key={monitor.id} className="border-b border-hairline last:border-0 hover:bg-surface-elevated/40 transition-colors">
              <td className="px-5 py-3.5">
                <Link
                  to={`/monitors/${monitor.id}`}
                  className="font-medium text-ink hover:text-accent-blue transition-colors"
                >
                  {monitor.name}
                </Link>
                <div className="text-xs text-stone mt-0.5">{monitor.intervalMinutes} min</div>
              </td>
              <td className="px-5 py-3.5">
                <a
                  href={monitor.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block max-w-xs truncate text-link hover:underline text-xs font-mono"
                >
                  {monitor.url}
                </a>
              </td>
              <td className="px-5 py-3.5">
                <StatusBadge status={monitor.currentStatus} />
              </td>
              <td className="px-5 py-3.5 text-charcoal text-xs">
                {formatDateTime(monitor.lastCheckedAt ?? monitor.lastCheck?.checkedAt)}
              </td>
              <td className="px-5 py-3.5 text-right tabular-nums text-charcoal text-xs font-mono">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-monitor-title"
        className="w-full max-w-md rounded-lg border border-hairline-strong bg-surface-card p-6"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="add-monitor-title" className="text-lg font-semibold text-ink">
            Add monitor
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md px-2 py-1 text-sm text-mute hover:text-ink hover:bg-surface-elevated transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="monitor-name" className="mb-1.5 block text-sm font-medium text-charcoal">
              Name
            </label>
            <input
              id="monitor-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="w-full rounded-md border border-hairline-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder:text-stone focus:outline-none focus:border-ink transition-colors"
            />
          </div>

          <div>
            <label htmlFor="monitor-url" className="mb-1.5 block text-sm font-medium text-charcoal">
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
              className="w-full rounded-md border border-hairline-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder:text-stone focus:outline-none focus:border-ink transition-colors font-mono"
            />
          </div>

          <div>
            <label htmlFor="monitor-interval" className="mb-1.5 block text-sm font-medium text-charcoal">
              Check interval
            </label>
            <select
              id="monitor-interval"
              value={intervalMinutes}
              onChange={(e) =>
                setIntervalMinutes(Number(e.target.value) as (typeof INTERVAL_OPTIONS)[number])
              }
              className="w-full rounded-md border border-hairline-strong bg-surface-deep px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-ink transition-colors"
            >
              {INTERVAL_OPTIONS.map((interval) => (
                <option key={interval} value={interval} className="bg-surface-deep">
                  Every {interval} minute{interval === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-accent-red">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md border border-hairline-strong bg-surface-elevated px-3 py-2 text-sm font-medium text-ink hover:bg-surface-elevated/80 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-primary text-primary-on px-3 py-2 text-sm font-medium hover:bg-surface-light transition-colors disabled:opacity-50"
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
  if (status === 'up') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-green">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
        up
      </span>
    );
  }
  if (status === 'down') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-red">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-red" />
        down
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-mute">
      <span className="w-1.5 h-1.5 rounded-full bg-mute" />
      unknown
    </span>
  );
}

function monitorsSummary(isLoading: boolean, count: number): string {
  if (isLoading) return 'Loading…';
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
