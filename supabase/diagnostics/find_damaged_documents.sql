-- READ-ONLY. Lists every quote (estimate) and invoice, across ALL users, whose
-- stored line items don't agree with the stored header:
--   * zero item rows but total > 0, or
--   * stored subtotal/total differs from what the stored lines add up to by > R0.01
-- "items_total" applies the document's own discount and VAT setting, exactly as
-- the app and save_*_with_items do:
--   gross = SUM(quantity * unit_price)
--   expected total    = GREATEST(0, gross - discount)
--   expected subtotal = expected total / 1.15 when vat_enabled, else expected total
-- Nothing here writes, updates or deletes. Run in the Supabase SQL Editor.

WITH est AS (
  SELECT
    'quote'::text                    AS doc_type,
    e.user_id,
    e.id,
    e.estimate_number                AS document_number,
    e.status,
    e.total                          AS stored_total,
    e.subtotal                       AS stored_subtotal,
    e.vat_enabled,
    e.discount_value,
    e.discount_type,
    COALESCE(i.gross, 0)             AS gross,
    COALESCE(i.cnt, 0)               AS item_count,
    e.created_at
  FROM public.estimates e
  LEFT JOIN (
    SELECT estimate_id, SUM(COALESCE(quantity,0) * COALESCE(unit_price,0)) AS gross, COUNT(*) AS cnt
    FROM public.estimate_items GROUP BY estimate_id
  ) i ON i.estimate_id = e.id
),
inv AS (
  SELECT
    'invoice'::text                  AS doc_type,
    v.user_id,
    v.id,
    v.invoice_number                 AS document_number,
    v.status,
    v.total                          AS stored_total,
    v.subtotal                       AS stored_subtotal,
    v.vat_enabled,
    v.discount_value,
    v.discount_type,
    COALESCE(i.gross, 0)             AS gross,
    COALESCE(i.cnt, 0)               AS item_count,
    v.created_at
  FROM public.invoices v
  LEFT JOIN (
    SELECT invoice_id, SUM(COALESCE(quantity,0) * COALESCE(unit_price,0)) AS gross, COUNT(*) AS cnt
    FROM public.invoice_items GROUP BY invoice_id
  ) i ON i.invoice_id = v.id
),
docs AS (
  SELECT * FROM est UNION ALL SELECT * FROM inv
),
calc AS (
  SELECT
    d.*,
    GREATEST(0, d.gross - CASE
      WHEN COALESCE(d.discount_value, 0) > 0 THEN
        CASE WHEN d.discount_type = 'percent' THEN d.gross * d.discount_value / 100 ELSE d.discount_value END
      ELSE 0 END) AS items_total
  FROM docs d
)
SELECT
  doc_type,
  user_id,
  document_number,
  status,
  ROUND(stored_total::numeric, 2)                                      AS stored_total,
  ROUND(stored_subtotal::numeric, 2)                                   AS stored_subtotal,
  ROUND(items_total::numeric, 2)                                       AS items_total,
  ROUND((CASE WHEN vat_enabled THEN items_total / 1.15 ELSE items_total END)::numeric, 2) AS items_subtotal,
  ROUND((COALESCE(stored_total,0) - items_total)::numeric, 2)          AS total_difference,
  item_count,
  CASE
    WHEN item_count = 0 AND COALESCE(stored_total,0) > 0 THEN 'NO ITEM ROWS, TOTAL > 0'
    ELSE 'LINES DO NOT MATCH HEADER'
  END                                                                  AS problem,
  id,
  created_at
FROM calc
WHERE
  (item_count = 0 AND COALESCE(stored_total,0) > 0)
  OR (item_count > 0 AND (
        ABS(COALESCE(stored_total,0)    - items_total) > 0.01
     OR ABS(COALESCE(stored_subtotal,0) - CASE WHEN vat_enabled THEN items_total / 1.15 ELSE items_total END) > 0.01
  ))
ORDER BY created_at DESC;
