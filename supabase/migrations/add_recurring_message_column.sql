-- Recurring Invoice Default Message setting (profiles.email_recurring_message)
-- Global default message pre-filled when setting up a new recurring invoice
-- template, mirroring email_invoice_message / email_quote_message.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email_recurring_message TEXT;
