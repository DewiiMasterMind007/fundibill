import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import md5 from 'https://esm.sh/md5@2.3.0'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const SANDBOX = Deno.env.get('PAYFAST_SANDBOX') === 'true'

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
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // ── Fetch profile ─────────────────────────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('payfast_token, subscription_plan, subscription_end_date')
      .eq('id', user.id)
      .maybeSingle()

    console.log('Profile fetch:', { profileErr, payfast_token: profile?.payfast_token ?? null })

    // ── Cancel at PayFast ─────────────────────────────────────────────────────
    const merchantId = Deno.env.get('PAYFAST_MERCHANT_ID') ?? ''
    const passphrase = Deno.env.get('PAYFAST_PASSPHRASE') ?? ''
    let pfResult: { status: number; body: string } | null = null

    if (profile?.payfast_token && merchantId) {
      try {
        const timestamp = new Date().toISOString().split('.')[0]

        // Signature = MD5 of sorted URL-encoded header key=value pairs
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

        const pfHeaders: Record<string, string> = {
          'merchant-id': merchantId,
          'version':     'v1',
          'timestamp':   timestamp,
          'signature':   signature,
        }
        // Sandbox requires testing header
        if (SANDBOX) pfHeaders['testing'] = 'true'

        const pfUrl = `https://api.payfast.co.za/subscriptions/${profile.payfast_token}/cancel`
        console.log('PayFast cancel request:', { pfUrl, sandbox: SANDBOX, sigString })

        const pfRes  = await fetch(pfUrl, { method: 'PUT', headers: pfHeaders })
        const pfBody = await pfRes.text()
        pfResult = { status: pfRes.status, body: pfBody }
        console.log('PayFast cancel response:', pfResult)

      } catch (pfErr) {
        console.error('PayFast cancel fetch error:', pfErr)
      }
    } else {
      console.log('Skipping PayFast cancel — no payfast_token or merchantId', {
        hasToken: !!profile?.payfast_token,
        hasMerchantId: !!merchantId,
      })
    }

    // ── Mark cancelled in DB ─────────────────────────────────────────────────
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        subscription_status:       'cancelled',
        subscription_cancelled_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateErr) return json({ error: updateErr.message }, 500)

    return json({
      success:  true,
      message:  'Subscription cancelled',
      payfast:  pfResult,           // null if skipped, { status, body } if called
    })

  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
