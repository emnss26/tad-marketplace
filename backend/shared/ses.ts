import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

/**
 * Outbound email via Amazon SES.
 *
 * Dev mode: when `MAGIC_LINK_DEV_MODE=true`, emails are logged to stdout
 * instead of sent. Lets us iterate on auth flows before SES is out of the
 * sandbox or before recipient addresses are verified.
 */

const REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const FROM = process.env['SES_FROM_ADDRESS'] ?? 'noreply@tad.com.mx';

const sesClient = new SESClient({ region: REGION });

export interface EmailParams {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export async function sendEmail(params: EmailParams): Promise<void> {
  if (process.env['MAGIC_LINK_DEV_MODE'] === 'true') {
    console.warn(
      '[ses:dev_mode] would-send',
      JSON.stringify({ to: params.to, subject: params.subject }),
    );
    console.warn('[ses:dev_mode] body_text:\n' + params.bodyText);
    return;
  }
  await sesClient.send(
    new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: params.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: params.bodyHtml, Charset: 'UTF-8' },
          Text: { Data: params.bodyText, Charset: 'UTF-8' },
        },
      },
    }),
  );
}

/** Build the magic-link email payload. Plain text + minimal HTML. */
export function magicLinkEmail(to: string, link: string): EmailParams {
  return {
    to,
    subject: 'Your TAD Marketplace sign-in link',
    bodyText: [
      'Sign in to TAD Marketplace.',
      '',
      'Click this link to sign in:',
      link,
      '',
      'This link expires in 15 minutes and can only be used once.',
      '',
      "If you didn't request this, you can ignore this email.",
      '',
      '— TAD',
      '',
    ].join('\n'),
    bodyHtml: magicLinkHtml(link),
  };
}

function magicLinkHtml(link: string): string {
  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#18181b;line-height:1.5;">
  <h2 style="margin:0 0 12px;font-size:20px;">Sign in to TAD Marketplace</h2>
  <p style="margin:0 0 24px;color:#52525b;">Click the button below to sign in. This link expires in 15 minutes and can only be used once.</p>
  <p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:500;">Sign in</a></p>
  <p style="margin:0 0 8px;font-size:13px;color:#71717a;">Or paste this URL into your browser:</p>
  <p style="margin:0 0 32px;font-size:13px;color:#71717a;word-break:break-all;">${link}</p>
  <p style="margin:0 0 4px;font-size:13px;color:#a1a1aa;">If you didn't request this, you can ignore this email.</p>
  <p style="margin:0;font-size:13px;color:#a1a1aa;">— TAD</p>
</body></html>`;
}

/** Build the team-invite email payload. */
export function teamInviteEmail(
  to: string,
  inviterName: string,
  productName: string,
  link: string,
): EmailParams {
  const inviter = inviterName.trim().length > 0 ? inviterName : 'A teammate';
  return {
    to,
    subject: `${inviter} invited you to ${productName} on TAD Marketplace`,
    bodyText: [
      `${inviter} invited you to join their team on TAD Marketplace.`,
      '',
      `Product: ${productName}`,
      '',
      'Click this link to accept the invitation and create your account:',
      link,
      '',
      'This link expires in 15 minutes and can only be used once.',
      '',
      "If you weren't expecting this invitation, you can ignore this email.",
      '',
      '— TAD',
      '',
    ].join('\n'),
    bodyHtml: `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#18181b;line-height:1.5;">
  <h2 style="margin:0 0 12px;font-size:20px;">You've been invited</h2>
  <p style="margin:0 0 12px;color:#52525b;"><strong>${escapeHtml(inviter)}</strong> invited you to join their team on TAD Marketplace.</p>
  <p style="margin:0 0 24px;color:#52525b;">Product: <strong>${escapeHtml(productName)}</strong></p>
  <p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:500;">Accept invitation</a></p>
  <p style="margin:0 0 8px;font-size:13px;color:#71717a;">Or paste this URL into your browser:</p>
  <p style="margin:0 0 32px;font-size:13px;color:#71717a;word-break:break-all;">${link}</p>
  <p style="margin:0 0 4px;font-size:13px;color:#a1a1aa;">This link expires in 15 minutes. If you weren't expecting this, you can ignore it.</p>
  <p style="margin:0;font-size:13px;color:#a1a1aa;">— TAD</p>
</body></html>`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
