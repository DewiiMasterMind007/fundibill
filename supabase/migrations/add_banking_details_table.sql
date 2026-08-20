-- Multiple banking accounts feature — banking_details table, snapshot
-- columns on invoices/estimates, and one-time migration of existing
-- profiles.banking_details into the new table.
-- FundiBill v4

-- ─── 1a. banking_details table ─────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS banking_details (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name   TEXT NOT NULL,
  bank_name      TEXT NOT NULL,
  account_number TEXT NOT NULL,
  branch_code    TEXT,
  account_type   TEXT,
  is_default     BOOLEAN DEFAULT false,
  sort_order     INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS banking_details_user_id_idx
ON banking_details(user_id);

ALTER TABLE banking_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own banking details" ON banking_details;
CREATE POLICY "Users can manage their own banking details"
ON banking_details FOR ALL
USING (auth.uid() = user_id);

-- ─── 1b. banking_details_snapshot — invoices and estimates ─────────────────
-- JSONB copy of the banking account selected at save time, so a later edit
-- or deletion of that banking_details row never changes what an already-
-- issued document shows. NULL on rows created before this feature — the app
-- falls back to the user's current profile banking details for those.

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS banking_details_snapshot JSONB;

ALTER TABLE estimates
ADD COLUMN IF NOT EXISTS banking_details_snapshot JSONB;

-- ─── 2. Migrate existing banking details from profiles ─────────────────────
-- profiles.banking_details is a TEXT column storing a JSON object
-- { bank_name, account_number, branch_code } (see CLAUDE.md Section 4) —
-- NOT separate bank_name/account_number/branch_code columns on profiles.
-- Older accounts may instead have a free-text string saved there (pre-dates
-- the JSON format); those rows are safely skipped below since bank_name/
-- account_number can't be reliably pulled out of free text.
--
-- Wrapped in a DO block with per-row exception handling (mirrors the
-- self-inspecting style of add_payments_table.sql) so one malformed
-- banking_details value can't abort the whole migration. Idempotent: skips
-- any user who already has a banking_details row (safe to re-run).

DO $$
DECLARE
  r RECORD;
  parsed JSONB;
BEGIN
  FOR r IN SELECT id, business_name, banking_details FROM profiles WHERE banking_details IS NOT NULL LOOP
    BEGIN
      parsed := r.banking_details::jsonb;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE; -- not valid JSON — legacy free-text banking details, skip
    END;

    IF parsed IS NULL OR jsonb_typeof(parsed) != 'object' THEN
      CONTINUE;
    END IF;

    IF COALESCE(parsed->>'bank_name', '') = '' OR COALESCE(parsed->>'account_number', '') = '' THEN
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM banking_details WHERE user_id = r.id) THEN
      CONTINUE; -- already has banking accounts (already migrated, or added one manually)
    END IF;

    INSERT INTO banking_details (
      user_id, account_name, bank_name, account_number, branch_code, is_default, sort_order, created_at
    ) VALUES (
      r.id,
      COALESCE(r.business_name, 'Primary Account'),
      parsed->>'bank_name',
      parsed->>'account_number',
      NULLIF(parsed->>'branch_code', ''),
      true,
      0,
      NOW()
    );
  END LOOP;
END $$;
