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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-monitor-title"
        className="w-full max-w-md rounded-md border border-gray-200 bg-white p-5 shadow-lg"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="edit-monitor-title" className="text-lg font-semibold text-gray-900">
            Edit monitor
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
            <label htmlFor="edit-monitor-name" className="mb-1 block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              id="edit-monitor-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="edit-monitor-url" className="mb-1 block text-sm font-medium text-gray-700">
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Changing the URL resets the current status — the next check will populate it.
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-monitor-interval"
              className="mb-1 block text-sm font-medium text-gray-700"
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
              disabled={isSubmitting || !hasChanges}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
