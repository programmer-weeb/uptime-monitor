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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-monitor-title"
        className="w-full max-w-md rounded-md border border-gray-200 bg-white p-5 shadow-lg"
      >
        <h2 id="delete-monitor-title" className="text-lg font-semibold text-gray-900">
          Delete monitor?
        </h2>
        <p className="mt-2 text-sm text-gray-700">
          This permanently removes <span className="font-medium">{monitorName}</span> and its check
          history. This cannot be undone.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {isSubmitting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
