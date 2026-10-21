-- READ-ONLY. Run these to confirm what the database really has on the line-item
-- tables (RLS policies, triggers, constraints, columns). Used while diagnosing the
-- lost-line-items bug; nothing here changes anything.

-- 1. Columns
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('estimate_items', 'invoice_items')
ORDER BY table_name, ordinal_position;

-- 2. RLS policies (look for any that could block DELETE or INSERT separately)
SELECT tablename, policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('estimate_items', 'invoice_items', 'estimates', 'invoices');

-- 3. Triggers
SELECT event_object_table, trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table IN ('estimate_items', 'invoice_items', 'estimates', 'invoices');

-- 4. Constraints
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.estimate_items'::regclass, 'public.invoice_items'::regclass);
