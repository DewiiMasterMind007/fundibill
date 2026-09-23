-- Multiple contacts per client (Zoho-style). A client's own name/email/phone
-- columns remain the primary contact — this table holds ADDITIONAL contacts
-- that automatically get CC'd whenever an invoice/quote is emailed to that
-- client. Independent table (own user_id + RLS), same pattern as
-- banking_details/payments — not scoped through the parent clients row.

CREATE TABLE IF NOT EXISTS client_contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       text,
  email      text NOT NULL,
  phone      text,
  role       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own client contacts"
  ON client_contacts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_client_contacts_user_id   ON client_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id ON client_contacts(client_id);
