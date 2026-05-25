import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiPost } from '../api/client';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-lg border border-hairline-strong bg-surface-card p-6 text-center">
          <h1 className="text-xl font-semibold text-ink mb-3">Invalid link</h1>
          <p className="text-sm text-mute mb-5">
            This reset link is invalid or has already expired.
          </p>
          <Link to="/forgot-password" className="text-sm text-link hover:underline">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/auth/reset-password', { token, password });
      navigate('/login?reset=1', { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.message === 'INVALID_RESET_TOKEN') {
        setError('This link has expired or already been used.');
      } else {
        setError('Something went wrong. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 relative overflow-hidden">
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] opacity-30"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(0,117,255,0.34) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-display text-2xl text-ink tracking-tight">Uptime Monitor</span>
        </div>

        <div className="rounded-lg border border-hairline-strong bg-surface-card p-6">
          <h1 className="text-xl font-semibold text-ink mb-5">Set new password</h1>

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-charcoal mb-1.5"
              >
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-hairline-strong bg-surface-card px-3 py-2.5 text-sm text-ink placeholder:text-stone focus:outline-none focus:border-ink transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="confirm"
                className="block text-sm font-medium text-charcoal mb-1.5"
              >
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full rounded-md border border-hairline-strong bg-surface-card px-3 py-2.5 text-sm text-ink placeholder:text-stone focus:outline-none focus:border-ink transition-colors"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-accent-red">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary text-primary-on text-sm font-medium py-2.5 hover:bg-surface-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Updating…' : 'Set new password'}
            </button>
          </form>

          {error?.includes('expired') && (
            <p className="text-sm text-mute mt-4">
              <Link to="/forgot-password" className="text-link hover:underline">
                Request a new link
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
