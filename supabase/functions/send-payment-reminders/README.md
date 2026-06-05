# send-payment-reminders

Supabase Edge Function that sends payment reminder emails for overdue invoices.

## What it does

Runs daily. For each invoice where:
- `sent_from_app = true` (was sent via FundiBill)
- `reminder_opted_in = true` (user opted in at send time)
- `status` is not `paid` or `draft`
- `due_date` is today or in the past (overdue)

It checks the user's profile for:
- SMTP settings (must be configured or the invoice is skipped)
- `reminders_enabled` flag (skip if false)
- `reminder_interval_days` (how many days between reminders)

Then it sends a branded reminder email and updates `reminder_sent_at` on the invoice.

## Deploy

```bash
supabase functions deploy send-payment-reminders --no-verify-jwt
```

## Schedule (9am SA time / 7am UTC, daily)

Run this SQL in the Supabase SQL Editor after enabling pg_cron and pg_net:

```sql
SELECT cron.schedule(
  'send-payment-reminders',
  '0 7 * * *',
  $$ select net.http_post(
    url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-payment-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'),
    body    := '{}'::jsonb
  ) $$
);
```

Replace `<YOUR_PROJECT_REF>` and `<YOUR_SERVICE_ROLE_KEY>` with your actual values
from the Supabase dashboard → Project Settings → API.

## Environment variables

These are automatically available inside all Supabase Edge Functions:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

No additional secrets need to be set.

## Response format

```json
{
  "ok": true,
  "processed": 5,
  "sent": 3,
  "skipped": 2,
  "errors": []
}
```
