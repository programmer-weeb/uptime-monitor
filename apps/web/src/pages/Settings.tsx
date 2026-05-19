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
    <div className="min-h-screen bg-canvas">
      <header className="bg-canvas border-b border-hairline">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-charcoal hover:text-ink transition-colors">
              ← Monitors
            </Link>
            <span className="text-stone">/</span>
            <h1 className="text-sm font-medium text-ink">Settings</h1>
          </div>
          <button type="button" onClick={logout} className="text-sm text-charcoal hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        {meQuery.isLoading ? (
          <div className="rounded-lg border border-hairline-strong bg-surface-card p-6 text-sm text-mute">
            Loading settings…
          </div>
        ) : meQuery.isError ? (
          <div role="alert" className="rounded-lg border border-accent-red/20 bg-accent-red/5 p-6 text-sm text-accent-red">
            Could not load settings.
          </div>
        ) : (
          <>
            {/* Account section */}
            <section className="rounded-lg border border-hairline-strong bg-surface-card">
              <div className="border-b border-hairline px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink">Account</h2>
              </div>
              <div className="px-5 py-4">
                <label className="mb-1.5 block text-sm font-medium text-charcoal">Email</label>
                <input
                  type="email"
                  value={meQuery.data?.email ?? ''}
                  disabled
                  className="w-full rounded-md border border-hairline-strong bg-surface-deep px-3 py-2.5 text-sm text-stone cursor-not-allowed"
                />
              </div>
            </section>

            {/* Telegram section */}
            <section className="rounded-lg border border-hairline-strong bg-surface-card">
              <div className="border-b border-hairline px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink">Telegram alerts</h2>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Connected state */}
                {connectedChatId && connectStep === 'idle' && (
                  <div className="flex items-center justify-between rounded-md border border-accent-green/20 bg-accent-green/5 px-3 py-2.5">
                    <span className="text-sm text-accent-green flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                      Connected · chat ID{' '}
                      <code className="font-mono text-xs">{connectedChatId}</code>
                    </span>
                    <button
                      type="button"
                      disabled={disconnectMutation.isPending || isDemo}
                      onClick={() => disconnectMutation.mutate()}
                      className="ml-4 text-sm text-accent-red hover:underline disabled:opacity-50"
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
                      className="rounded-md bg-primary text-primary-on px-3 py-2 text-sm font-medium hover:bg-surface-light transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {connectMutation.isPending ? 'Generating link…' : 'Connect Telegram'}
                    </button>
                    {isDemo && (
                      <p className="mt-1.5 text-xs text-accent-yellow">Demo accounts cannot change settings.</p>
                    )}
                  </div>
                )}

                {/* Linking in progress */}
                {connectStep === 'linking' && deeplink && (
                  <div className="space-y-3 rounded-md border border-accent-blue/20 bg-accent-blue/5 px-4 py-3">
                    <p className="text-sm font-medium text-ink">
                      Tap the button below to open Telegram, then tap <strong>Start</strong>.
                    </p>
                    <a
                      href={deeplink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-md bg-primary text-primary-on px-4 py-2 text-sm font-medium hover:bg-surface-light transition-colors"
                    >
                      Open Telegram →
                    </a>
                    <p className="text-xs text-mute">
                      Waiting for confirmation… Link expires in 3 minutes.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setConnectStep('idle'); setDeeplink(null); }}
                      className="text-xs text-charcoal hover:text-ink hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Expired */}
                {connectStep === 'expired' && (
                  <div className="rounded-md border border-accent-yellow/20 bg-accent-yellow/5 px-3 py-2.5">
                    <p className="text-sm text-accent-yellow">Link expired. Try again.</p>
                    <button
                      type="button"
                      onClick={() => setConnectStep('idle')}
                      className="mt-1 text-sm text-link hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {connectError && (
                  <p role="alert" className="text-sm text-accent-red">{connectError}</p>
                )}

                {/* Manual fallback */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-mute hover:text-charcoal transition-colors select-none">
                    Enter chat ID manually
                  </summary>
                  <form onSubmit={handleManualSubmit} className="mt-4 space-y-3">
                    <div>
                      <input
                        id="settings-telegram-chat-id"
                        type="text"
                        inputMode="numeric"
                        value={telegramChatId}
                        onChange={(e) => setTelegramChatId(e.target.value)}
                        placeholder="123456789"
                        className="w-full rounded-md border border-hairline-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder:text-stone focus:outline-none focus:border-ink transition-colors font-mono"
                      />
                      <p className="mt-1.5 text-xs text-mute">
                        Leave blank to disable Telegram alerts. Message{' '}
                        <code className="font-mono text-accent-blue">@userinfobot</code> on Telegram to get your chat ID.
                      </p>
                    </div>
                    {manualError && (
                      <p role="alert" className="text-sm text-accent-red">{manualError}</p>
                    )}
                    {saved && <p role="status" className="text-sm text-accent-green">Saved.</p>}
                    <button
                      type="submit"
                      disabled={manualMutation.isPending || isDemo}
                      className="rounded-md bg-primary text-primary-on px-3 py-2 text-sm font-medium hover:bg-surface-light transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {manualMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
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
