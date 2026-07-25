-- Welcome-email dedup guard for profiles table
-- FundiBill — send-welcome-email edge function

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN DEFAULT false;
