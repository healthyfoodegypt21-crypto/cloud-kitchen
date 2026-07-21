DO $$
DECLARE
  table_name text;
  table_names text[] := ARRAY[
    'brands',
    'targets',
    'customers',
    'menu_items',
    'package_plans',
    'package_plan_items',
    'profiles',
    'user_roles',
    'user_brand_access',
    'user_page_permissions',
    'cleaning_targets',
    'cleaning_tasks',
    'items_master',
    'inventory_balances',
    'inventory_categories',
    'inventory_movements',
    'inventory_purchase_requests',
    'inventory_purchase_request_lines',
    'inventory_daily_withdrawals',
    'inventory_daily_withdrawal_lines',
    'inventory_batches',
    'inventory_item_requests',
    'inventory_notifications'
  ];
BEGIN
  FOREACH table_name IN ARRAY table_names
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_publication p ON p.oid = pr.prpubid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE p.pubname = 'supabase_realtime'
        AND n.nspname = 'public'
        AND c.relname = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;