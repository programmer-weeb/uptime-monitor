import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getMe, updateMe, type Me } from '../api/account';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../lib/useAuth';

const E164 = /^\+[1-9]\d{6,14}$/;

export default function Settings() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => getMe(signal),
  });

  useEffect(() => {
    if (meQuery.data) {
      setPhone(meQuery.data.phone ?? '');
    }
  }, [meQuery.data]);

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  const mutation = useMutation({
    mutationFn: (nextPhone: string | null) => updateMe({ phone: nextPhone }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Me>(queryKeys.me, updated);
      setSaved(true);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(messageFor(err, 'Could not save settings.'));
    },
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = phone.trim();
    if (trimmed !== '' && !E164.test(trimmed)) {
      setError('Phone must be E.164 format, e.g. +14155551212');
      setSaved(false);
      return;
    }
    setError(null);
    mutation.mutate(trimmed === '' ? null : trimmed);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <Link to="/" className="text-sm font-medium text-blue-600 hover:underline">
              Monitors
            </Link>
            <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
          </div>
          <button type="button" onClick={logout} className="text-sm text-blue-600 hover:underline">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {meQuery.isLoading ? (
          <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-600">
            Loading settings…
          </div>
        ) : meQuery.isError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            Could not load settings.
          </div>
        ) : (
          <section className="rounded-md border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-base font-semibold text-gray-900">WhatsApp alerts</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
              <div>
                <label htmlFor="settings-email" className="mb-1 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="settings-email"
                  type="email"
                  value={meQuery.data?.email ?? ''}
                  disabled
                  className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                />
              </div>

              <div>
                <label htmlFor="settings-phone" className="mb-1 block text-sm font-medium text-gray-700">
                  WhatsApp phone
                </label>
                <input
                  id="settings-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+14155551212"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave blank to disable WhatsApp alerts. Use E.164 format, e.g. +14155551212.
                  During development you must first send{' '}
                  <code className="font-mono">join &lt;code&gt;</code> to the Twilio sandbox
                  WhatsApp number from this phone before alerts will arrive.
                </p>
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              {saved && <p role="status" className="text-sm text-green-700">Saved.</p>}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={mutation.isPending || meQuery.data?.isDemo}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mutation.isPending ? 'Saving…' : 'Save'}
                </button>
                {meQuery.data?.isDemo && (
                  <p className="text-sm text-yellow-700">Demo accounts cannot change settings.</p>
                )}
              </div>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
