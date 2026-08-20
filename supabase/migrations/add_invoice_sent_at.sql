-- Manual-send timestamp, parallel to auto_sent_at (added for auto-sent
-- recurring invoices) -- used to show "Sent [date]" on the invoice list.
-- FundiBill v5

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
