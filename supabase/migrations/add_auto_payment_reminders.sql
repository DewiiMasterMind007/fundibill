-- Automatic payment reminders — global toggle + per-invoice schedule state
-- FundiBill v5

-- Global on/off switch, one per business — not per-invoice (unlike the
-- legacy reminder_opted_in/reminders_enabled/reminder_interval_days columns,
-- which belong to the older send-payment-reminders function and are left
-- untouched here; that function is a separate, still-deployed system).
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS auto_reminders_enabled BOOLEAN DEFAULT false;

-- Schedule state per invoice. auto_reminder_count drives which stage of the
-- fixed schedule an invoice is on (0 = none sent yet -> first reminder due
-- on due_date; 1 = first sent -> second due 7 days after due_date; 2+ =
-- every 3 days after auto_reminder_last_sent_at). See
-- supabase/functions/send-auto-payment-reminders/index.ts for the schedule
-- logic itself.
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS auto_reminder_count INTEGER DEFAULT 0;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS auto_reminder_last_sent_at TIMESTAMPTZ;
