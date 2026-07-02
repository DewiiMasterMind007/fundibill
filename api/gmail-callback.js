// Vercel Serverless Function — Gmail OAuth callback.
// GET /api/gmail-callback?code=<auth_code>&state=<user_id>
// Exchanges the auth code for tokens, stores them on the user's profile,
// then redirects back into the app.

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Server-side Supabase client using the service role key — bypasses RLS
  // so we can write tokens onto a profile row that isn't the caller's session.
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const appUrl = process.env.VITE_APP_URL;

  try {
    const { code, state } = req.query;
    const userId = state; // we passed user_id as "state" in gmail-auth.js

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }

    // Step 1: Exchange the authorization code for access/refresh tokens.
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GMAIL_CLIENT_ID,
        client_secret: process.env.GMAIL_CLIENT_SECRET,
        redirect_uri: process.env.GMAIL_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    // Step 2: Calculate the absolute expiry timestamp from expires_in (seconds).
    const tokenExpiry = new Date(Date.now() + expires_in * 1000).toISOString();

    // Step 3: Fetch the connected Gmail address so we can show it in Settings.
    const profileResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const profileData = await profileResponse.json();

    if (!profileResponse.ok || !profileData.email) {
      throw new Error(`Failed to fetch Gmail profile: ${JSON.stringify(profileData)}`);
    }

    // Step 4: Persist tokens + connected email on the user's profile row.
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        gmail_access_token: access_token,
        gmail_refresh_token: refresh_token,
        gmail_token_expiry: tokenExpiry,
        gmail_connected_email: profileData.email,
        email_provider: 'gmail',
      })
      .eq('id', userId);

    if (updateError) {
      throw new Error(`Supabase update failed: ${updateError.message}`);
    }

    // Success — send the user back to Settings with a success flag.
    res.writeHead(302, { Location: `${appUrl}/settings?gmail=connected` });
    res.end();
  } catch (error) {
    console.error('gmail-callback error:', error);
    // Failure — send the user back to Settings with an error flag.
    res.writeHead(302, { Location: `${appUrl}/settings?gmail=error` });
    res.end();
  }
}
