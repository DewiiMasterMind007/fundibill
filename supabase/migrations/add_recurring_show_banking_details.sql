-- Extends the show/hide banking details toggle (see add_show_banking_details.sql)
-- to recurring invoice templates. Governs both the first invoice created
-- client-side by RecurringForm and every subsequent invoice created by the
-- process-recurring-invoices cron job.

ALTER TABLE recurring_invoices
ADD COLUMN IF NOT EXISTS show_banking_details BOOLEAN DEFAULT true;
