-- ============================================================================
-- FREEZE LINE ORDER: invoice_items
-- Freezes the current displayed order. Does NOT restore the original order for
-- documents that were already scrambled (e.g. EST-0048).
--
-- What it does: for every invoice that has MORE THAN ONE line and whose lines all
-- share one sort_order (or are all NULL), it writes sort_order = 0,1,2,... in
-- physical row order (ctid) -- the order users see today before any ordering existed.
-- It never touches a invoice whose lines already have distinct sort_order values, so it
-- is safe to re-run (a second run changes nothing).
--
-- Safety: the old values are copied to invoice_items_sort_order_backup first, and
-- everything runs in one transaction.
--
-- To reverse (only for rows this script changed):
--   UPDATE public.invoice_items t SET sort_order = b.old_sort_order
--   FROM public.invoice_items_sort_order_backup b WHERE b.item_id = t.id;
-- ============================================================================

-- STEP 1 (read-only): how many documents would be affected?
SELECT COUNT(*) AS documents_that_would_be_frozen,
       COALESCE(SUM(n), 0) AS line_rows_that_would_change
FROM (
  SELECT invoice_id, COUNT(*) AS n
  FROM public.invoice_items
  GROUP BY invoice_id
  HAVING COUNT(*) > 1 AND COUNT(DISTINCT COALESCE(sort_order, -1)) = 1
) tied;

-- STEP 2: backup + freeze, one transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_items_sort_order_backup (
  item_id        uuid PRIMARY KEY,
  old_sort_order integer,
  backed_up_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TEMP TABLE _freeze_invoices ON COMMIT DROP AS
SELECT i.id AS item_id,
       i.sort_order AS old_sort_order,
       (ROW_NUMBER() OVER (PARTITION BY i.invoice_id ORDER BY i.ctid) - 1)::integer AS new_sort_order
FROM public.invoice_items i
WHERE i.invoice_id IN (
  SELECT invoice_id FROM public.invoice_items
  GROUP BY invoice_id
  HAVING COUNT(*) > 1 AND COUNT(DISTINCT COALESCE(sort_order, -1)) = 1
);

INSERT INTO public.invoice_items_sort_order_backup (item_id, old_sort_order)
SELECT item_id, old_sort_order FROM _freeze_invoices
ON CONFLICT (item_id) DO NOTHING;

UPDATE public.invoice_items t
SET sort_order = f.new_sort_order
FROM _freeze_invoices f
WHERE t.id = f.item_id;

-- STEP 3 (read-only check inside the transaction): should now be 0 documents still tied.
SELECT COUNT(*) AS documents_still_tied
FROM (
  SELECT invoice_id FROM public.invoice_items
  GROUP BY invoice_id
  HAVING COUNT(*) > 1 AND COUNT(DISTINCT COALESCE(sort_order, -1)) = 1
) x;

COMMIT;
