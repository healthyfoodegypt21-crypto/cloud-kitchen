-- public.profiles has no email column, so the audit trigger failed with
-- 'column "email" does not exist' on every inventory movement insert
-- (purchase receipts, withdrawals, adjustments), blocking stock updates.
CREATE OR REPLACE FUNCTION public.inventory_log_movement_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_name text := '';
BEGIN
  SELECT COALESCE(NULLIF(btrim(profile.display_name), ''), account.email::text, '')
  INTO _actor_name
  FROM auth.users AS account
  LEFT JOIN public.profiles AS profile ON profile.id = account.id
  WHERE account.id = NEW.created_by;

  INSERT INTO public.inventory_audit_log (
    brand_id, item_id, movement_id, action, actor_id, actor_name, location_name,
    quantity, unit_cost, movement_value, reason, reference_table, reference_id
  ) VALUES (
    NEW.brand_id, NEW.item_id, NEW.id, NEW.movement_type::text, NEW.created_by, COALESCE(_actor_name, ''),
    NEW.location_name, NEW.quantity, NEW.unit_cost, ROUND(NEW.quantity * NEW.unit_cost, 2),
    NEW.notes, NEW.reference_table, NEW.reference_id
  );
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
