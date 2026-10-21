-- Atomic save for quotes (estimates) and invoices, plus a stable line order.
--
-- WHY: the app used to save a document as three separate, non-transactional
-- calls -- write the header, DELETE the old items, INSERT the new items.
-- A failure on the 2nd or 3rd call left the NEW header (with the full total)
-- sitting on top of the OLD items. Each function below does all of it in ONE
-- transaction: header upsert, item replace, and a post-write verification
-- that RAISES (rolling everything back) if the stored items don't add up to
-- the stored total.
--
-- Both functions are SECURITY INVOKER, so RLS still applies exactly as it
-- does for a direct insert/update from the app.
--
-- RUN ORDER: run this whole file once in the Supabase SQL Editor BEFORE the
-- new app build is used and BEFORE redeploying process-recurring-invoices.

-- ── 1. Stable line ordering ──────────────────────────────────────────────────
-- Items had no position column, so after a delete+insert the read order was
-- whatever the heap returned. Existing rows keep NULL (read last, as before).

ALTER TABLE public.estimate_items ADD COLUMN IF NOT EXISTS sort_order integer;
ALTER TABLE public.invoice_items  ADD COLUMN IF NOT EXISTS sort_order integer;

-- ── 2. save_estimate_with_items ──────────────────────────────────────────────
-- p_estimate_id NULL  -> create a new estimate
-- p_estimate_id set   -> update that estimate (must belong to the caller)
-- p_header            -> jsonb of header columns (only allow-listed keys are used)
-- p_items             -> jsonb array of { item_name, description, quantity, unit_price, line_total }
-- p_user_id           -> ONLY used when auth.uid() is NULL (service-role callers such
--                        as Edge Functions). A signed-in user's own uid always wins,
--                        so it cannot be used to write as someone else.
-- Returns the estimate id.

CREATE OR REPLACE FUNCTION public.save_estimate_with_items(
  p_estimate_id uuid,
  p_header      jsonb,
  p_items       jsonb,
  p_user_id     uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := COALESCE(auth.uid(), p_user_id);
  v_id       uuid := p_estimate_id;
  v_cols     text;
  v_allowed  text[] := ARRAY[
    'estimate_number','client_id','issue_date','expiry_date','notes',
    'vat_enabled','vat_rate','subtotal','vat_amount','total',
    'status','previous_status','discount_value','discount_type',
    'banking_details_snapshot','show_banking_details'
  ];
  v_rows     integer;
  v_expected integer;
  v_stored   integer;
  v_gross    numeric;
  v_disc     numeric;
  v_exp_tot  numeric;
  v_exp_sub  numeric;
  r          public.estimates%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: no signed-in user';
  END IF;
  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_HEADER: header must be a json object';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'NO_ITEMS: a quote needs at least one line item';
  END IF;
  v_expected := jsonb_array_length(p_items);

  SELECT string_agg(quote_ident(k), ', ') INTO v_cols
  FROM jsonb_object_keys(p_header) AS k
  WHERE k = ANY (v_allowed);
  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'INVALID_HEADER: no recognised header fields supplied';
  END IF;

  -- Header
  IF v_id IS NULL THEN
    EXECUTE format(
      'INSERT INTO public.estimates (user_id, %1$s)
         SELECT $2, %1$s FROM jsonb_populate_record(NULL::public.estimates, $1)
       RETURNING id', v_cols)
      INTO v_id USING p_header, v_uid;
  ELSE
    EXECUTE format(
      'UPDATE public.estimates
          SET (%1$s) = (SELECT %1$s FROM jsonb_populate_record(NULL::public.estimates, $1))
        WHERE id = $2 AND user_id = $3', v_cols)
      USING p_header, v_id, v_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'NOT_FOUND: quote % was not found for this user', v_id;
    END IF;
  END IF;

  -- A json null for a jsonb column can arrive as the jsonb value 'null';
  -- normalise it to a real SQL NULL.
  UPDATE public.estimates SET banking_details_snapshot = NULL
   WHERE id = v_id AND jsonb_typeof(banking_details_snapshot) = 'null';

  -- Items: replace wholesale, in submitted order
  DELETE FROM public.estimate_items WHERE estimate_id = v_id;

  INSERT INTO public.estimate_items
    (estimate_id, item_name, description, quantity, unit_price, line_total, sort_order)
  SELECT
    v_id,
    x.elem->>'item_name',
    NULLIF(x.elem->>'description', ''),
    COALESCE((x.elem->>'quantity')::numeric, 1),
    COALESCE((x.elem->>'unit_price')::numeric, 0),
    COALESCE((x.elem->>'line_total')::numeric,
             COALESCE((x.elem->>'quantity')::numeric, 1) * COALESCE((x.elem->>'unit_price')::numeric, 0)),
    (x.ord - 1)::integer
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(elem, ord);

  -- Verify: item count
  SELECT count(*) INTO v_stored FROM public.estimate_items WHERE estimate_id = v_id;
  IF v_stored <> v_expected THEN
    RAISE EXCEPTION 'ITEM_COUNT_MISMATCH: submitted % line(s) but % were stored', v_expected, v_stored;
  END IF;

  -- Verify: stored header total/subtotal agree with the stored items
  SELECT * INTO r FROM public.estimates WHERE id = v_id;
  SELECT COALESCE(sum(COALESCE(quantity,0) * COALESCE(unit_price,0)), 0)
    INTO v_gross FROM public.estimate_items WHERE estimate_id = v_id;
  v_disc := CASE
    WHEN COALESCE(r.discount_value, 0) > 0 THEN
      CASE WHEN r.discount_type = 'percent' THEN v_gross * r.discount_value / 100 ELSE r.discount_value END
    ELSE 0 END;
  v_exp_tot := GREATEST(0, v_gross - v_disc);
  v_exp_sub := CASE WHEN COALESCE(r.vat_enabled, false) THEN v_exp_tot / 1.15 ELSE v_exp_tot END;
  IF abs(COALESCE(r.total, 0) - v_exp_tot) > 0.01
     OR abs(COALESCE(r.subtotal, 0) - v_exp_sub) > 0.01 THEN
    RAISE EXCEPTION 'TOTAL_MISMATCH: stored total % / subtotal % but the stored lines add up to total % / subtotal %',
      r.total, r.subtotal, round(v_exp_tot, 2), round(v_exp_sub, 2);
  END IF;

  RETURN v_id;
END;
$$;

-- ── 3. save_invoice_with_items ───────────────────────────────────────────────
-- Same contract as above for invoices. Header allow-list also covers the
-- recurring-invoice columns (from_recurring / notification_dismissed) so the
-- recurring flows can create an invoice + items atomically too.

CREATE OR REPLACE FUNCTION public.save_invoice_with_items(
  p_invoice_id uuid,
  p_header     jsonb,
  p_items      jsonb,
  p_user_id    uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := COALESCE(auth.uid(), p_user_id);
  v_id       uuid := p_invoice_id;
  v_cols     text;
  v_allowed  text[] := ARRAY[
    'invoice_number','client_id','issue_date','due_date','notes',
    'vat_enabled','vat_rate','subtotal','vat_amount','total','amount_paid',
    'status','previous_status','discount_value','discount_type',
    'banking_details_snapshot','show_banking_details',
    'from_recurring','notification_dismissed'
  ];
  v_rows     integer;
  v_expected integer;
  v_stored   integer;
  v_gross    numeric;
  v_disc     numeric;
  v_exp_tot  numeric;
  v_exp_sub  numeric;
  r          public.invoices%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: no signed-in user';
  END IF;
  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_HEADER: header must be a json object';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'NO_ITEMS: an invoice needs at least one line item';
  END IF;
  v_expected := jsonb_array_length(p_items);

  SELECT string_agg(quote_ident(k), ', ') INTO v_cols
  FROM jsonb_object_keys(p_header) AS k
  WHERE k = ANY (v_allowed);
  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'INVALID_HEADER: no recognised header fields supplied';
  END IF;

  IF v_id IS NULL THEN
    EXECUTE format(
      'INSERT INTO public.invoices (user_id, %1$s)
         SELECT $2, %1$s FROM jsonb_populate_record(NULL::public.invoices, $1)
       RETURNING id', v_cols)
      INTO v_id USING p_header, v_uid;
  ELSE
    EXECUTE format(
      'UPDATE public.invoices
          SET (%1$s) = (SELECT %1$s FROM jsonb_populate_record(NULL::public.invoices, $1))
        WHERE id = $2 AND user_id = $3', v_cols)
      USING p_header, v_id, v_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'NOT_FOUND: invoice % was not found for this user', v_id;
    END IF;
  END IF;

  UPDATE public.invoices SET banking_details_snapshot = NULL
   WHERE id = v_id AND jsonb_typeof(banking_details_snapshot) = 'null';

  DELETE FROM public.invoice_items WHERE invoice_id = v_id;

  INSERT INTO public.invoice_items
    (invoice_id, item_name, description, quantity, unit_price, line_total, sort_order)
  SELECT
    v_id,
    x.elem->>'item_name',
    NULLIF(x.elem->>'description', ''),
    COALESCE((x.elem->>'quantity')::numeric, 1),
    COALESCE((x.elem->>'unit_price')::numeric, 0),
    COALESCE((x.elem->>'line_total')::numeric,
             COALESCE((x.elem->>'quantity')::numeric, 1) * COALESCE((x.elem->>'unit_price')::numeric, 0)),
    (x.ord - 1)::integer
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(elem, ord);

  SELECT count(*) INTO v_stored FROM public.invoice_items WHERE invoice_id = v_id;
  IF v_stored <> v_expected THEN
    RAISE EXCEPTION 'ITEM_COUNT_MISMATCH: submitted % line(s) but % were stored', v_expected, v_stored;
  END IF;

  SELECT * INTO r FROM public.invoices WHERE id = v_id;
  SELECT COALESCE(sum(COALESCE(quantity,0) * COALESCE(unit_price,0)), 0)
    INTO v_gross FROM public.invoice_items WHERE invoice_id = v_id;
  v_disc := CASE
    WHEN COALESCE(r.discount_value, 0) > 0 THEN
      CASE WHEN r.discount_type = 'percent' THEN v_gross * r.discount_value / 100 ELSE r.discount_value END
    ELSE 0 END;
  v_exp_tot := GREATEST(0, v_gross - v_disc);
  v_exp_sub := CASE WHEN COALESCE(r.vat_enabled, false) THEN v_exp_tot / 1.15 ELSE v_exp_tot END;
  IF abs(COALESCE(r.total, 0) - v_exp_tot) > 0.01
     OR abs(COALESCE(r.subtotal, 0) - v_exp_sub) > 0.01 THEN
    RAISE EXCEPTION 'TOTAL_MISMATCH: stored total % / subtotal % but the stored lines add up to total % / subtotal %',
      r.total, r.subtotal, round(v_exp_tot, 2), round(v_exp_sub, 2);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_estimate_with_items(uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_invoice_with_items(uuid, jsonb, jsonb, uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_estimate_with_items(uuid, jsonb, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_invoice_with_items(uuid, jsonb, jsonb, uuid)  TO authenticated, service_role;

-- Make PostgREST pick up the new functions immediately.
NOTIFY pgrst, 'reload schema';
