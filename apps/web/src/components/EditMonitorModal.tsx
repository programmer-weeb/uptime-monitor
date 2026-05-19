import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Monitor, PatchMonitorInput } from '../api/monitors';

const INTERVAL_OPTIONS = [1, 5, 15, 30, 60] as const;
type Interval = (typeof INTERVAL_OPTIONS)[number];

function isInterval(value: number): value is Interval {
  return (INTERVAL_OPTIONS as readonly number[]).includes(value);
}

export function EditMonitorModal({
  monitor,
  error,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  monitor: Monitor;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (patch: PatchMonitorInput) => void;
}) {
  const initialInterval: Interval = isInterval(monitor.intervalMinutes) ? monitor.intervalMinutes : 5;

  const [name, setName] = useState(monitor.name);
  const [url, setUrl] = useState(monitor.url);
  const [intervalMinutes, setIntervalMinutes] = useState<Interval>(initialInterval);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const patch: PatchMonitorInput = {};
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (trimmedName !== monitor.name) patch.name = trimmedName;
    if (trimmedUrl !== monitor.url) patch.url = trimmedUrl;
    if (intervalMinutes !== monitor.intervalMinutes) patch.intervalMinutes = intervalMinutes;
    onSubmit(patch);
  }

  const hasChanges =
    name.trim() !== monitor.name ||
    url.trim() !== monitor.url ||
    intervalMinutes !== monitor.intervalMinutes;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-monitor-title"
        className="w-full max-w-md rounded-lg border border-hairline-strong bg-surface-card p-6"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="edit-monitor-title" className="text-lg font-semibold text-ink">
            Edit monitor
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
            <label htmlFor="edit-monitor-name" className="mb-1.5 block text-sm font-medium text-charcoal">
              Name
            </label>
            <input
              id="edit-monitor-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="w-full rounded-md border border-hairline-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder:text-stone focus:outline-none focus:border-ink transition-colors"
            />
          </div>

          <div>
            <label htmlFor="edit-monitor-url" className="mb-1.5 block text-sm font-medium text-charcoal">
              URL
            </label>
            <input
              id="edit-monitor-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://example.com"
              pattern="https://.*"
              className="w-full rounded-md border border-hairline-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder:text-stone focus:outline-none focus:border-ink transition-colors font-mono"
            />
            <p className="mt-1.5 text-xs text-mute">
              Changing the URL resets the current status.
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-monitor-interval"
              className="mb-1.5 block text-sm font-medium text-charcoal"
            >
              Check interval
            </label>
            <select
              id="edit-monitor-interval"
              value={intervalMinutes}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (isInterval(next)) setIntervalMinutes(next);
              }}
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
              disabled={isSubmitting || !hasChanges}
              className="rounded-md bg-primary text-primary-on px-3 py-2 text-sm font-medium hover:bg-surface-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
