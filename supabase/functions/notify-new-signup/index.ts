import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record

    const userEmail = record.email || 'Unknown'
    const userId = record.id
    const createdAt = record.created_at || new Date().toISOString()
    const businessName = record.business_name || 'Not set yet'

    // Send notification email via your PHP relay
    const emailPayload = {
      smtp_host: Deno.env.get('NOTIFY_SMTP_HOST'),
      smtp_port: 587,
      smtp_user: Deno.env.get('NOTIFY_SMTP_USER'),
      smtp_password: Deno.env.get('NOTIFY_SMTP_PASSWORD'),
      from_name: 'FundiBill Signups',
      to_email: Deno.env.get('NOTIFY_TO_EMAIL'),
      subject: '🎉 New FundiBill Signup - ' + userEmail,
      html_body: [
        '<!DOCTYPE html>',
        '<html>',
        '<body style="font-family:Arial,sans-serif;padding:20px;">',
        '<h2 style="color:#008080;">New FundiBill Signup</h2>',
        '<table style="border-collapse:collapse;width:100%;">',
        '<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Email</td>',
        '<td style="padding:8px;border:1px solid #ddd;">' + userEmail + '</td></tr>',
        '<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">User ID</td>',
        '<td style="padding:8px;border:1px solid #ddd;">' + userId + '</td></tr>',
        '<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Business Name</td>',
        '<td style="padding:8px;border:1px solid #ddd;">' + businessName + '</td></tr>',
        '<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Signed Up</td>',
        '<td style="padding:8px;border:1px solid #ddd;">' + createdAt + '</td></tr>',
        '<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Trial Ends</td>',
        '<td style="padding:8px;border:1px solid #ddd;">' + 
          new Date(new Date(createdAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 
        '</td></tr>',
        '</table>',
        '<br>',
        '<p style="color:#666;font-size:12px;">',
        'View in Supabase: ',
        '<a href="https://supabase.com/dashboard/project/hczeuxhvnprhffsnktpf/auth/users">',
        'Authentication → Users</a>',
        '</p>',
        '<p style="color:#999;font-size:11px;">FundiBill - SA Built Invoicing Software</p>',
        '</body>',
        '</html>'
      ].join('\n'),
      text_body: [
        'New FundiBill Signup',
        '-------------------',
        'Email: ' + userEmail,
        'User ID: ' + userId,
        'Business Name: ' + businessName,
        'Signed Up: ' + createdAt,
        'Trial Ends: ' + new Date(new Date(createdAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        '',
        'FundiBill - SA Built Invoicing Software'
      ].join('\n')
    }

    const response = await fetch('https://api.fundiai.co.za/send-reminder.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload)
    })

    const result = await response.json()
    console.log('Notification sent:', JSON.stringify(result))

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', String(error))
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})