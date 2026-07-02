// Vercel Serverless Function — sends an email via the Gmail API using a
// user's stored OAuth tokens, refreshing the access token first if needed.
// POST /api/send-gmail

import { createClient } from '@supabase/supabase-js';

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// RFC 2047 encoded-word encoding for non-ASCII Subject headers (em dashes,
// smart quotes, accented characters) — raw UTF-8 bytes in a header break
// most mail clients, so non-ASCII subjects must be base64-encoded words.
function encodeEmailSubject(subject) {
  const hasNonAscii = /[^\x00-\x7F]/.test(subject);
  if (!hasNonAscii) return subject; // ASCII only — no encoding needed

  const encoded = Buffer.from(subject, 'utf8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

// Refresh an expired/near-expiry Gmail access token and persist the new
// token + expiry onto the user's profile row.
async function refreshGmailToken(supabase, userId, refreshToken) {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error('refresh_failed');
  }

  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      gmail_access_token: tokenData.access_token,
      gmail_token_expiry: newExpiry,
    })
    .eq('id', userId);

  if (updateError) {
    throw new Error('refresh_failed');
  }

  return tokenData.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const {
      user_id,
      to,
      subject,
      html,
      pdf_base64,
      pdf_filename,
      from_name,
    } = req.body || {};

    if (!user_id || !to || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Step 1: Fetch the user's stored Gmail tokens.
    const { data: rows, error: fetchError } = await supabase
      .from('profiles')
      .select('gmail_access_token, gmail_refresh_token, gmail_token_expiry, gmail_connected_email')
      .eq('id', user_id)
      .limit(1);

    const profile = fetchError ? null : rows?.[0] ?? null;

    if (!profile || !profile.gmail_access_token || !profile.gmail_refresh_token) {
      return res.status(401).json({ error: 'Gmail not connected' });
    }

    // Step 2: Refresh the access token if it's expired or about to expire.
    let accessToken = profile.gmail_access_token;
    const expiry = profile.gmail_token_expiry ? new Date(profile.gmail_token_expiry) : null;
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    const needsRefresh = !expiry || isNaN(expiry.getTime()) || expiry <= fiveMinutesFromNow;

    if (needsRefresh) {
      try {
        accessToken = await refreshGmailToken(supabase, user_id, profile.gmail_refresh_token);
      } catch (_) {
        return res.status(401).json({ error: 'Gmail token expired. Please reconnect Gmail in Settings.' });
      }
    }

    // Step 3: Build the RFC 2822 email message.
    const boundary = 'fundibill_boundary_' + Date.now();
    const fromHeader = `${from_name || 'FundiBill'} <${profile.gmail_connected_email}>`;
    const encodedSubject = encodeEmailSubject(subject);
    const htmlBase64 = base64UrlEncodeBody(html);

    let rawEmail;
    if (pdf_base64) {
      rawEmail =
        `From: ${fromHeader}\r\n` +
        `To: ${to}\r\n` +
        `Subject: ${encodedSubject}\r\n` +
        `MIME-Version: 1.0\r\n` +
        `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: text/html; charset="UTF-8"\r\n` +
        `Content-Transfer-Encoding: base64\r\n\r\n` +
        `${htmlBase64}\r\n\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/pdf; name="${pdf_filename || 'document.pdf'}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n` +
        `Content-Disposition: attachment; filename="${pdf_filename || 'document.pdf'}"\r\n\r\n` +
        `${pdf_base64}\r\n\r\n` +
        `--${boundary}--`;
    } else {
      rawEmail =
        `From: ${fromHeader}\r\n` +
        `To: ${to}\r\n` +
        `Subject: ${encodedSubject}\r\n` +
        `MIME-Version: 1.0\r\n` +
        `Content-Type: text/html; charset="UTF-8"\r\n` +
        `Content-Transfer-Encoding: base64\r\n\r\n` +
        `${htmlBase64}`;
    }

    const encodedMessage = base64UrlEncode(rawEmail);

    // Step 4: Send via the Gmail API.
    const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });

    const sendData = await sendResponse.json().catch(() => ({}));

    if (!sendResponse.ok) {
      console.error('send-gmail: Gmail API send failed', sendResponse.status, sendData);
      return res.status(500).json({ error: 'Failed to send email', details: sendData });
    }

    return res.status(200).json({ success: true, messageId: sendData.id });
  } catch (error) {
    console.error('send-gmail error:', error.message);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}

// Base64-encode a UTF-8 string for the HTML MIME part (not the outer
// base64url message-level encoding — that happens once, in base64UrlEncode).
function base64UrlEncodeBody(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}
