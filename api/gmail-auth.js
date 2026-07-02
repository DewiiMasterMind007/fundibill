// Vercel Serverless Function — starts the Gmail OAuth flow.
// GET /api/gmail-auth?user_id=<uuid>
// Redirects the browser to Google's OAuth consent screen.

export default async function handler(req, res) {
  try {
    // The user_id is passed through as OAuth "state" so the callback
    // knows which FundiBill account to attach the tokens to.
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Build the Google OAuth consent URL manually (no OAuth library).
    const params = new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      redirect_uri: process.env.GMAIL_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.send',
      access_type: 'offline', // required to receive a refresh_token
      prompt: 'consent', // forces refresh_token on every connect, not just the first
      state: user_id,
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    // Send the browser straight to Google's consent screen.
    res.writeHead(302, { Location: googleAuthUrl });
    res.end();
  } catch (error) {
    console.error('gmail-auth error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
}
