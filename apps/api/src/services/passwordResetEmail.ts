import { Resend } from 'resend';
import { env } from '../config/env.js';
import { log } from '../config/log.js';

let resend: Resend | null = null;

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    log.warn({ to }, 'password reset email skipped; email env missing');
    return;
  }

  resend ??= new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: 'Reset your Uptime Monitor password',
    html: buildHtml(resetUrl),
  });
}

function buildHtml(resetUrl: string): string {
  return `
    <h1>Reset your password</h1>
    <p>We received a request to reset your Uptime Monitor password.</p>
    <p><a href="${resetUrl}">Click here to set a new password</a></p>
    <p>This link expires in 15 minutes. If you did not request a password reset, you can safely ignore this email.</p>
  `;
}
