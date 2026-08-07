-- Settings setup wizard — tracks completion + resume point
-- FundiBill

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS settings_wizard_completed boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS settings_wizard_step      integer;
