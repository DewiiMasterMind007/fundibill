-- Client archive system — clients with invoice/estimate history can't be
-- hard-deleted (FK constraint invoices_client_id_fkey/estimates_client_id_fkey
-- blocks it, by design, to protect document history). This column lets the
-- app archive such clients instead: hidden from the active client list and
-- the client picker, but their id/name/history stay intact for old
-- invoices/estimates that reference them.

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
