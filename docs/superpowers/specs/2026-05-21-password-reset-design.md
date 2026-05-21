# Password Reset Flow — Design Spec

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Add a "forgot password" recovery path for users who signed up with email/password and cannot access their account. Google-only accounts are handled silently (no email sent, no enumeration leak).

---

## Token Strategy

- **Storage:** Redis, matching the existing Telegram connect token pattern (`account.ts:50-58`)
- **Generation:** `randomBytes(24).toString('hex')`
- **TTL:** 900 seconds (15 minutes)
- **Keys:**
  - `reset:token:<token>` → `userId` (EX 900) — used for lookup on reset
  - `reset:user:<userId>` → `token` (EX 900) — used to invalidate any previous token when a new one is requested
- **Single-use:** both keys are DEL'd immediately on a successful reset

---

## API

### `POST /api/auth/forgot-password`

**Request body:**
```json
{ "email": "user@example.com" }
```
Validated by a new `forgotPasswordSchema` (reuses the existing `emailSchema` from `schemas/auth.ts`).

**Behaviour:**
1. Look up user by email.
2. If not found, or user has no `passwordHash` (Google-only): do nothing.
3. Otherwise:
   - Delete any previous `reset:user:<userId>` + its associated token key.
   - Generate new token, store both Redis keys with EX 900.
   - Call `sendPasswordResetEmail(user.email, resetUrl)`.
   - `resetUrl = ${env.CORS_ORIGIN}/reset-password?token=<token>`
4. Always respond `200 { message: "If that email is registered, a reset link has been sent." }` — no account enumeration.

**Rate limit:** new `forgotPasswordLimiter` — 5 requests per hour per IP.

---

### `POST /api/auth/reset-password`

**Request body:**
```json
{ "token": "<hex string>", "password": "<new password>" }
```
Validated by a new `resetPasswordSchema`: token is `z.string().min(1)`, password reuses `passwordSchema` (8–72 chars).

**Behaviour:**
1. Look up `reset:token:<token>` in Redis.
2. If missing → `throw new ApiError('VALIDATION', 'INVALID_RESET_TOKEN')` (400).
3. Fetch user by id. If not found → same 400 (should not happen; defensive).
4. Hash new password with bcrypt (same `BCRYPT_COST` as signup).
5. Update `user.passwordHash` in DB.
6. DEL both `reset:token:<token>` and `reset:user:<userId>` keys.
7. Respond `200 { message: "Password updated." }`.

**Rate limit:** none — the token itself is the rate limiter (consumed on use, 15-min TTL).

---

## Email Service

**New file:** `apps/api/src/services/passwordResetEmail.ts`

```ts
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>
```

- Checks `RESEND_API_KEY` and `EMAIL_FROM`; logs a warning and returns silently if either is unset (matches `alertEmail.ts` graceful-degradation pattern).
- No new env vars required — reuses `RESEND_API_KEY`, `EMAIL_FROM`, `CORS_ORIGIN`.
- HTML email: heading, brief explanation, reset link/button, "expires in 15 minutes" note.
- No Redis rate-limit key — `forgotPasswordLimiter` + token TTL already cap abuse.

---

## Frontend

### New pages

**`apps/web/src/pages/ForgotPassword.tsx`** — route `/forgot-password` (public)
- Email input + submit button, styled to match `Login.tsx`.
- On submit: `POST /api/auth/forgot-password`.
- Always show success state ("Check your inbox — if that address is registered, a reset link is on its way.") regardless of API outcome.
- "Back to sign in" link to `/login`.

**`apps/web/src/pages/ResetPassword.tsx`** — route `/reset-password` (public)
- Reads `?token` from query string on mount.
- If no token → show "Invalid or expired link" message + link to `/forgot-password`.
- Form: new password + confirm password fields; client-side match validation before submit.
- On submit: `POST /api/auth/reset-password` with `{ token, password }`.
- On success: redirect to `/login?reset=1`.
- On `INVALID_RESET_TOKEN` error: show "This link has expired or already been used." + link to `/forgot-password`.

### Modified pages

**`apps/web/src/pages/Login.tsx`**
- Add "Forgot password?" link below the password field, pointing to `/forgot-password`.
- Read `?reset=1` query param; if present, render a success banner ("Password updated — please sign in.").

**`apps/web/src/App.tsx`**
- Add two new `<Route>` entries for `/forgot-password` and `/reset-password` (both public, no auth guard).

---

## Security Notes

- **No enumeration:** `POST /forgot-password` always returns the same 200 message.
- **Single-use tokens:** DEL on consumption prevents replay.
- **Old token invalidation:** requesting a new token removes the previous one (`reset:user:<userId>` pointer).
- **Google-only accounts:** silently excluded from reset flow; no email sent.
- **bcrypt cost:** matches signup (`BCRYPT_COST = NODE_ENV === 'test' ? 4 : 12`).

---

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/schemas/auth.ts` | Add `forgotPasswordSchema`, `resetPasswordSchema` |
| `apps/api/src/services/passwordResetEmail.ts` | New — Resend email helper |
| `apps/api/src/middleware/rateLimit.ts` | Add `forgotPasswordLimiter` |
| `apps/api/src/routes/auth.ts` | Add two new routes |
| `apps/web/src/pages/ForgotPassword.tsx` | New page |
| `apps/web/src/pages/ResetPassword.tsx` | New page |
| `apps/web/src/pages/Login.tsx` | Add "Forgot password?" link + `?reset=1` banner |
| `apps/web/src/App.tsx` | Register two new routes |
