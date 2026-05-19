import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { connectTelegram, getMe, updateMe, type Me } from '../api/account';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../lib/useAuth';

const TELEGRAM_CHAT_ID_RE = /^-?\d+$/;
const LINK_TIMEOUT_MS = 3 * 60 * 1000;
const LINK_POLL_MS = 3000;

type ConnectStep = 'idle' | 'linking' | 'expired';

export default function Settings() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [telegramChatId, setTelegramChatId] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [connectStep, setConnectStep] = useState<ConnectStep>('idle');
  const [deeplink, setDeeplink] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const linkStartedAt = useRef<number>(0);

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => getMe(signal),
  });

  useEffect(() => {
    if (meQuery.data) {
      setTelegramChatId(meQuery.data.telegramChatId ?? '');
    }
  }, [meQuery.data]);

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  // Poll for telegram connection while in linking step
  useEffect(() => {
    if (connectStep !== 'linking') return;

    linkStartedAt.current = Date.now();

    const intervalId = window.setInterval(async () => {
      if (Date.now() - linkStartedAt.current > LINK_TIMEOUT_MS) {
        window.clearInterval(intervalId);
        setConnectStep('expired');
        setDeeplink(null);
        return;
      }
      try {
        const me = await getMe();
        if (me.telegramChatId) {
          window.clearInterval(intervalId);
          queryClient.setQueryData<Me>(queryKeys.me, me);
          setConnectStep('idle');
          setDeeplink(null);
        }
      } catch {
        // ignore transient poll errors
      }
    }, LINK_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [connectStep, queryClient]);

  // Transition out of linking when socket event updates query cache
  useEffect(() => {
    if (connectStep === 'linking' && meQuery.data?.telegramChatId) {
      setConnectStep('idle');
      setDeeplink(null);
    }
  }, [connectStep, meQuery.data?.telegramChatId]);

  const manualMutation = useMutation({
    mutationFn: (nextChatId: string | null) => updateMe({ telegramChatId: nextChatId }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Me>(queryKeys.me, updated);
      setSaved(true);
      setManualError(null);
    },
    onError: (err: unknown) => {
      setManualError(messageFor(err, 'Could not save settings.'));
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => updateMe({ telegramChatId: null }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Me>(queryKeys.me, updated);
      setConnectStep('idle');
      setDeeplink(null);
    },
    onError: (err: unknown) => {
      setConnectError(messageFor(err, 'Could not disconnect Telegram.'));
    },
  });

  const connectMutation = useMutation({
    mutationFn: () => connectTelegram(),
    onSuccess: ({ token, botUsername }) => {
      setDeeplink(`https://t.me/${botUsername}?start=${token}`);
      setConnectStep('linking');
      setConnectError(null);
    },
    onError: (err: unknown) => {
      setConnectError(messageFor(err, 'Could not start Telegram connection.'));
    },
  });

  function handleManualSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = telegramChatId.trim();
    if (trimmed !== '' && !TELEGRAM_CHAT_ID_RE.test(trimmed)) {
      setManualError('Chat ID must be a number. Get it from @userinfobot on Telegram.');
      setSaved(false);
      return;
    }
    setManualError(null);
    manualMutation.mutate(trimmed === '' ? null : trimmed);
  }

  const isDemo = meQuery.data?.isDemo ?? false;
  const connectedChatId = meQuery.data?.telegramChatId ?? null;

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

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {meQuery.isLoading ? (
          <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-600">
            Loading settings…
          </div>
        ) : meQuery.isError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            Could not load settings.
          </div>
        ) : (
          <>
            {/* Email */}
            <section className="rounded-md border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-4 py-3">
                <h2 className="text-base font-semibold text-gray-900">Account</h2>
              </div>
              <div className="px-4 py-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={meQuery.data?.email ?? ''}
                  disabled
                  className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                />
              </div>
            </section>

            {/* Telegram alerts */}
            <section className="rounded-md border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-4 py-3">
                <h2 className="text-base font-semibold text-gray-900">Telegram alerts</h2>
              </div>

              <div className="px-4 py-4 space-y-4">
                {/* Connected state */}
                {connectedChatId && connectStep === 'idle' && (
                  <div className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2">
                    <span className="text-sm text-green-800">
                      Connected · chat ID <code className="font-mono">{connectedChatId}</code>
                    </span>
                    <button
                      type="button"
                      disabled={disconnectMutation.isPending || isDemo}
                      onClick={() => disconnectMutation.mutate()}
                      className="ml-4 text-sm text-red-600 hover:underline disabled:opacity-50"
                    >
                      {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  </div>
                )}

                {/* Not connected — connect button */}
                {!connectedChatId && connectStep === 'idle' && (
                  <div>
                    <button
                      type="button"
                      disabled={connectMutation.isPending || isDemo}
                      onClick={() => connectMutation.mutate()}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {connectMutation.isPending ? 'Generating link…' : 'Connect Telegram'}
                    </button>
                    {isDemo && (
                      <p className="mt-1 text-sm text-yellow-700">Demo accounts cannot change settings.</p>
                    )}
                  </div>
                )}

                {/* Linking in progress */}
                {connectStep === 'linking' && deeplink && (
                  <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
                    <p className="text-sm font-medium text-blue-900">
                      Tap the button below to open Telegram, then tap <strong>Start</strong>.
                    </p>
                    <a
                      href={deeplink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Open Telegram →
                    </a>
                    <p className="text-xs text-blue-700">
                      Waiting for confirmation… Link expires in 10 minutes.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setConnectStep('idle'); setDeeplink(null); }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Expired */}
                {connectStep === 'expired' && (
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2">
                    <p className="text-sm text-yellow-800">Link expired. Try again.</p>
                    <button
                      type="button"
                      onClick={() => setConnectStep('idle')}
                      className="mt-1 text-sm text-blue-600 hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {connectError && (
                  <p role="alert" className="text-sm text-red-600">{connectError}</p>
                )}

                {/* Manual fallback */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                    Enter chat ID manually
                  </summary>
                  <form onSubmit={handleManualSubmit} className="mt-3 space-y-3">
                    <div>
                      <input
                        id="settings-telegram-chat-id"
                        type="text"
                        inputMode="numeric"
                        value={telegramChatId}
                        onChange={(e) => setTelegramChatId(e.target.value)}
                        placeholder="123456789"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Leave blank to disable Telegram alerts. Message{' '}
                        <code className="font-mono">@userinfobot</code> on Telegram to get your chat ID.
                      </p>
                    </div>
                    {manualError && (
                      <p role="alert" className="text-sm text-red-600">{manualError}</p>
                    )}
                    {saved && <p role="status" className="text-sm text-green-700">Saved.</p>}
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={manualMutation.isPending || isDemo}
                        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {manualMutation.isPending ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </form>
                </details>
              </div>
            </section>
          </>
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
