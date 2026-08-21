-- Auto-send for recurring invoices — columns on recurring_invoices and invoices
-- FundiBill v5

-- ─── 1. recurring_invoices — auto-send template settings ───────────────────

ALTER TABLE recurring_invoices
ADD COLUMN IF NOT EXISTS auto_send BOOLEAN DEFAULT false;

ALTER TABLE recurring_invoices
ADD COLUMN IF NOT EXISTS auto_send_cc_user BOOLEAN DEFAULT true;

-- ─── 2. invoices — auto-send tracking ───────────────────────────────────────
-- Three separate ALTER TABLE statements (not one with a comma list) so each
-- is independently safe to re-run if only some columns were already added.

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS auto_sent BOOLEAN DEFAULT false;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS auto_sent_at TIMESTAMPTZ;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS auto_send_error TEXT;
