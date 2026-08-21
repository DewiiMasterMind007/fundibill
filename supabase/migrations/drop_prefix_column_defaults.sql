-- profiles.invoice_prefix / estimate_prefix had stale Postgres-level column
-- defaults ('INV' and 'EST') left over from before the app's own default
-- ('INV-'/'QT-', applied client-side only when the field is empty) existed.
-- New signups were getting these DB defaults silently written onto their row,
-- so Settings showed an already-filled-in "EST" quote prefix instead of an
-- empty field with just a placeholder hint. Existing profiles' stored values
-- (including any 'EST'/'INV' inherited from this default) are left as-is —
-- only future inserts that don't explicitly set these columns are affected.

ALTER TABLE profiles
ALTER COLUMN invoice_prefix DROP DEFAULT;

ALTER TABLE profiles
ALTER COLUMN estimate_prefix DROP DEFAULT;
