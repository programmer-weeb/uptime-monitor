import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { ApiError, apiPost } from '../api/client';
import { loginWithGoogle } from '../api/account';
import { useAuth } from '../lib/useAuth';
import type { AuthUser } from '../lib/auth-context';

type SignupResponse = { token: string; user: AuthUser };

export default function Signup() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { token, user } = await apiPost<SignupResponse>('/api/auth/signup', {
        email,
        password,
      });
      auth.login(token, user);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError ? err.message : 'Something went wrong. Try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 relative overflow-hidden">
      {/* Atmospheric glow */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] opacity-30"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(34,255,153,0.18) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-display text-2xl text-ink tracking-tight">Uptime Monitor</span>
        </div>

        <div className="rounded-lg border border-hairline-strong bg-surface-card p-6">
          <h1 className="text-xl font-semibold text-ink mb-5">Create account</h1>

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-charcoal mb-1.5">
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

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-charcoal mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-md border border-hairline-strong bg-surface-card px-3 py-2.5 text-sm text-ink placeholder:text-stone focus:outline-none focus:border-ink transition-colors"
              />
              <p className="text-xs text-mute mt-1.5">At least 8 characters.</p>
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
              {submitting ? 'Creating…' : 'Create account'}
            </button>
          </form>

          <div className="mt-4 flex items-center gap-3">
            <hr className="flex-1 border-hairline" />
            <span className="text-xs text-mute">or</span>
            <hr className="flex-1 border-hairline" />
          </div>

          <div className="mt-4">
            <GoogleLogin
              onSuccess={async ({ credential }) => {
                if (!credential) return;
                setSubmitting(true);
                try {
                  const { token, user } = await loginWithGoogle(credential);
                  auth.login(token, user);
                  navigate('/', { replace: true });
                } catch (err: unknown) {
                  setError(err instanceof ApiError ? err.message : 'Google sign-in failed.');
                } finally {
                  setSubmitting(false);
                }
              }}
              onError={() => setError('Google sign-in failed.')}
              theme="filled_black"
              shape="rectangular"
            />
          </div>

          <p className="text-sm text-mute mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-link hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
