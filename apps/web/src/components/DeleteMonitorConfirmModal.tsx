export function DeleteMonitorConfirmModal({
  monitorName,
  error,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  monitorName: string;
  error: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-monitor-title"
        className="w-full max-w-md rounded-lg border border-hairline-strong bg-surface-card p-6"
      >
        <h2 id="delete-monitor-title" className="text-lg font-semibold text-ink">
          Delete monitor?
        </h2>
        <p className="mt-2 text-sm text-charcoal">
          This permanently removes <span className="font-medium text-ink">{monitorName}</span> and
          its check history. This cannot be undone.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-accent-red">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-md border border-hairline-strong bg-surface-elevated px-3 py-2 text-sm font-medium text-ink hover:bg-surface-elevated/80 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="rounded-md border border-accent-red/20 bg-accent-red/10 px-3 py-2 text-sm font-medium text-accent-red hover:bg-accent-red/20 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
