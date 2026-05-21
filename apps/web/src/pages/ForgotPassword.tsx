import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiPost } from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost('/api/auth/forgot-password', { email });
    } finally {
      setSubmitting(false);
      setSubmitted(true);
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
          <h1 className="text-xl font-semibold text-ink mb-2">Reset your password</h1>

          {submitted ? (
            <div className="space-y-4">
              <p className="text-sm text-charcoal">
                Check your inbox — if that address is registered, a reset link is on its way. It
                expires in 15 minutes.
              </p>
              <Link to="/login" className="text-sm text-link hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-mute mb-5">
                Enter your email and we&apos;ll send you a reset link.
              </p>

              <form onSubmit={onSubmit} noValidate className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-charcoal mb-1.5"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-md border border-hairline-strong bg-surface-card px-3 py-2.5 text-sm text-ink placeholder:text-stone focus:outline-none focus:border-ink transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-md bg-primary text-primary-on text-sm font-medium py-2.5 hover:bg-surface-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <p className="text-sm text-mute mt-5">
                Remembered it?{' '}
                <Link to="/login" className="text-link hover:underline">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
