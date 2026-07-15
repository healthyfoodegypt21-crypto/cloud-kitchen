-- Allow managers to remove only empty categories and items with no operational history.
CREATE OR REPLACE FUNCTION public.inventory_delete_category(_category_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_inventory() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory categories.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.items_master WHERE category = btrim(_category_code)) THEN
    RAISE EXCEPTION 'A category containing items cannot be deleted. Remove or move its items first.';
  END IF;

  DELETE FROM public.inventory_categories WHERE code = btrim(_category_code);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory category was not found.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_delete_item(_brand_id uuid, _item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);

  IF NOT EXISTS (SELECT 1 FROM public.items_master WHERE id = _item_id AND brand_id = _brand_id) THEN
    RAISE EXCEPTION 'Inventory item was not found for this brand.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_purchase_request_lines WHERE item_id = _item_id)
    OR EXISTS (SELECT 1 FROM public.inventory_daily_withdrawal_lines WHERE item_id = _item_id)
    OR EXISTS (SELECT 1 FROM public.waste_entries WHERE item_id = _item_id)
    OR EXISTS (SELECT 1 FROM public.inventory_count_lines WHERE item_id = _item_id) THEN
    RAISE EXCEPTION 'This item has operational history and cannot be deleted. Keep it for audit records.';
  END IF;

  DELETE FROM public.items_master WHERE id = _item_id AND brand_id = _brand_id;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_delete_category(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_delete_item(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_delete_category(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_delete_item(uuid, uuid) TO authenticated;
