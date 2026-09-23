-- Per-document toggle to show/hide banking details on an invoice/quote.
-- Default true so existing documents keep showing banking details exactly
-- as they always have; only newly toggled-off documents omit them.

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS show_banking_details BOOLEAN DEFAULT true;

ALTER TABLE estimates
ADD COLUMN IF NOT EXISTS show_banking_details BOOLEAN DEFAULT true;
