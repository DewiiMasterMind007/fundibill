-- CC-myself-on-send setting (profiles.cc_self_on_send)
-- When true, every invoice/quote sent from SendEmailModal also CCs the
-- user's own profiles.email address. Default off.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS cc_self_on_send BOOLEAN DEFAULT false;
