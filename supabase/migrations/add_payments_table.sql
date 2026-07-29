-- Partial payments feature — payments table + invoices.status support
-- FundiBill v3

-- ─── 1. payments table ─────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount         NUMERIC NOT NULL,
  payment_date   DATE NOT NULL,
  payment_method TEXT,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_invoice_id_idx
ON payments(invoice_id);

CREATE INDEX IF NOT EXISTS payments_user_id_idx
ON payments(user_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own payments"
ON payments FOR ALL
USING (auth.uid() = user_id);

-- ─── 2. invoices.status — add 'partial' as an allowed value ────────────────
-- This only does something if a CHECK constraint already exists on
-- invoices.status. Run the SELECT below FIRST to see what's actually there —
-- if it returns no rows, this app's `status` column is plain TEXT with no
-- DB-level constraint (application code is the only thing enforcing the
-- draft/sent/paid/overdue domain), and the DO block below is a safe no-op.

-- Inspect first:
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'invoices'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%status%';

-- Then run this — it only touches a constraint if one was found above,
-- preserving its original name and adding 'partial' to the allowed set.
-- The value list (draft/sent/paid/overdue/partial) matches the full set of
-- status values documented in CLAUDE.md Section 4 for the invoices table.
DO $$
DECLARE
  r RECORD;
  found BOOLEAN := false;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'invoices'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    found := true;
    EXECUTE format('ALTER TABLE invoices DROP CONSTRAINT %I', r.conname);
    EXECUTE format(
      'ALTER TABLE invoices ADD CONSTRAINT %I CHECK (status IN (''draft'',''sent'',''paid'',''overdue'',''partial''))',
      r.conname
    );
    RAISE NOTICE 'Updated constraint % on invoices.status to include ''partial''', r.conname;
  END LOOP;

  IF NOT found THEN
    RAISE NOTICE 'No CHECK constraint found on invoices.status — column accepts any text value already, nothing to change.';
  END IF;
END $$;

-- ─── 3. amount_paid ─────────────────────────────────────────────────────────
-- No migration needed — the existing invoices.amount_paid column is reused
-- as-is. src/utils/payments.js keeps it in sync with SUM(payments.amount)
-- for that invoice every time a payment is recorded or deleted.
