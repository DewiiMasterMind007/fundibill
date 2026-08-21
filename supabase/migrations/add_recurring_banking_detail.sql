-- Preferred banking account for a recurring invoice template
-- FundiBill v5

ALTER TABLE recurring_invoices
ADD COLUMN IF NOT EXISTS banking_detail_id UUID REFERENCES banking_details(id) ON DELETE SET NULL;

-- NULL means "use whichever banking_details row is currently the user's
-- default" — both the client-side first-invoice creation (RecurringForm)
-- and the process-recurring-invoices cron job fall back to
-- is_default = true when banking_detail_id is unset or the referenced row
-- was since deleted (ON DELETE SET NULL above handles the latter case).
