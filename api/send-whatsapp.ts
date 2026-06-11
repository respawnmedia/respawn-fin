import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Sends WhatsApp messages via Twilio.
 *
 * Setup:
 * 1. Sign up at twilio.com — free trial gives you a sandbox WhatsApp number
 * 2. Add these env vars to Vercel:
 *    TWILIO_ACCOUNT_SID = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *    TWILIO_AUTH_TOKEN  = your_auth_token
 *    TWILIO_WHATSAPP_FROM = whatsapp:+14155238886 (sandbox) or your approved number
 *
 * Sandbox setup (first time, one-time per number):
 *    Each person texts "join <sandbox-code>" to +14155238886 from their WhatsApp
 *    After approval, messages go through automatically
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, message } = req.body as { to: string; message: string };
  if (!to || !message) return res.status(400).json({ error: 'to and message required' });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  if (!accountSid || !authToken) {
    return res.status(503).json({
      error: 'WhatsApp not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to Vercel env vars.',
      setup_url: 'https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn',
    });
  }

  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  try {
    const body = new URLSearchParams({ From: from, To: toFormatted, Body: message });
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Unknown error' }));
      return res.status(response.status).json({ error: (err as { message: string }).message });
    }

    const data = await response.json();
    return res.json({ success: true, sid: (data as { sid: string }).sid });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send' });
  }
}
