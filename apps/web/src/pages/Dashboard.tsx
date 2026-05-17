import { useAuth } from '../lib/useAuth';

export default function Dashboard() {
  const { user, logout } = useAuth();

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
        <div className="bg-white border border-gray-200 rounded-md p-6 text-sm text-gray-700">
          Dashboard (Day 9 — monitor list lands here).
        </div>
      </main>
    </div>
  );
}
