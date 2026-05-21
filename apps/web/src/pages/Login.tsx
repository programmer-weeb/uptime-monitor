import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { ApiError, apiPost } from '../api/client';
import { loginWithGoogle } from '../api/account';
import { useAuth } from '../lib/useAuth';
import type { AuthUser } from '../lib/auth-context';

type LoginResponse = { token: string; user: AuthUser };

export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [searchParams] = useSearchParams();
  const passwordReset = searchParams.get('reset') === '1';

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token, user } = await apiPost<LoginResponse>('/api/auth/login', {
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
          background: 'radial-gradient(ellipse at top, rgba(0,117,255,0.34) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-display text-2xl text-ink tracking-tight">Uptime Monitor</span>
        </div>

        <div className="rounded-lg border border-hairline-strong bg-surface-card p-6">
          <h1 className="text-xl font-semibold text-ink mb-5">Sign in</h1>

          {passwordReset && (
            <p role="status" className="text-sm text-green-400 mb-4">
              Password updated — please sign in with your new password.
            </p>
          )}

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
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-charcoal">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs text-link hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <>
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
            </>
          )}

          <p className="text-sm text-mute mt-5">
            New here?{' '}
            <Link to="/signup" className="text-link hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
