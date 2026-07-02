-- Gmail OAuth support columns for profiles table
-- FundiBill v2 — Gmail OAuth email sending feature

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail_access_token    TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail_refresh_token   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail_token_expiry    TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail_connected_email TEXT;
