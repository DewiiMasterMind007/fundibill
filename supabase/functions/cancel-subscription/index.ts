import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import md5 from 'https://esm.sh/md5@2.3.0'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  try {
    // ── Auth: require a valid JWT — do not accept user_id from the body ──────
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // ── Fetch profile for PayFast token ──────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('payfast_token, subscription_plan, subscription_end_date')
      .eq('id', user.id)
      .maybeSingle()

    // ── Best-effort: cancel recurring billing at PayFast ─────────────────────
    // Only fires if the ITN webhook has stored a payfast_token on the profile.
    const merchantId = Deno.env.get('PAYFAST_MERCHANT_ID') ?? ''
    const passphrase = Deno.env.get('PAYFAST_PASSPHRASE') ?? ''

    if (profile?.payfast_token && merchantId) {
      try {
        const timestamp = new Date().toISOString().split('.')[0]

        // PayFast signature: MD5 of sorted, URL-encoded header key=value pairs
        const pfParams: Record<string, string> = {
          'merchant-id': merchantId,
          'timestamp':   timestamp,
          'version':     'v1',
        }
        if (passphrase) pfParams['passphrase'] = passphrase

        const sigString = Object.keys(pfParams)
          .sort()
          .map(k => `${k}=${encodeURIComponent(pfParams[k])}`)
          .join('&')

        const signature = md5(sigString) as string

        await fetch(
          `https://api.payfast.co.za/subscriptions/${profile.payfast_token}/cancel`,
          {
            method:  'PUT',
            headers: {
              'merchant-id': merchantId,
              'version':     'v1',
              'timestamp':   timestamp,
              'signature':   signature,
            },
          },
        )
      } catch (pfErr) {
        // Log but continue — DB update is the source of truth for app access
        console.error('PayFast cancel error:', pfErr)
      }
    }

    // ── Mark cancelled in DB ─────────────────────────────────────────────────
    // User retains access until subscription_end_date (handled by isSubscriptionActive).
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        subscription_status:       'cancelled',
        subscription_cancelled_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateErr) return json({ error: updateErr.message }, 500)

    return json({ success: true, message: 'Subscription cancelled' })

  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
