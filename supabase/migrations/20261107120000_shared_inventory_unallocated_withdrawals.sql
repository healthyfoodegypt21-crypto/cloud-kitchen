ALTER TABLE public.inventory_daily_withdrawals
  ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.inventory_post_shared_daily_withdrawal(
  _hub_id uuid,
  _consumer_brand_id uuid,
  _lines jsonb,
  _notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stock_brand_id uuid;
  _withdrawal_id uuid;
  _withdrawal_no text;
  _line jsonb;
  _result jsonb;
  _total numeric(14,2) := 0;
  _cost numeric(14,2);
BEGIN
  IF NOT public.can_access_shared_inventory_hub(_hub_id) THEN
    RAISE EXCEPTION 'You do not have access to this shared inventory.';
  END IF;

  SELECT hub.stock_brand_id INTO _stock_brand_id
  FROM public.inventory_hubs AS hub
  WHERE hub.id = _hub_id AND hub.is_default;
  IF _stock_brand_id IS NULL THEN
    RAISE EXCEPTION 'The shared inventory hub is not configured.';
  END IF;
  IF _consumer_brand_id IS NULL THEN
    RAISE EXCEPTION 'A withdrawal scope is required.';
  END IF;
  IF _consumer_brand_id <> _stock_brand_id
    AND NOT public.has_role(auth.uid(), 'owner')
    AND NOT public.can_access_brand(_consumer_brand_id) THEN
    RAISE EXCEPTION 'You do not have access to record consumption for this brand.';
  END IF;
  IF _consumer_brand_id <> _stock_brand_id AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_hub_brands AS membership
    WHERE membership.hub_id = _hub_id
      AND membership.brand_id = _consumer_brand_id
  ) THEN
    RAISE EXCEPTION 'The selected brand is not linked to this shared inventory.';
  END IF;

  PERFORM public.inventory_require_manager(_stock_brand_id);
  IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Add at least one withdrawal line.';
  END IF;

  _withdrawal_no := 'WD-' || to_char(current_date, 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 5);
  INSERT INTO public.inventory_daily_withdrawals (brand_id, is_shared, withdrawal_no, status, notes, created_by, posted_by, posted_at)
  VALUES (_consumer_brand_id, _consumer_brand_id = _stock_brand_id, _withdrawal_no, 'posted', COALESCE(_notes, ''), auth.uid(), auth.uid(), now())
  RETURNING id INTO _withdrawal_id;

  FOR _line IN SELECT value FROM jsonb_array_elements(_lines)
  LOOP
    IF COALESCE((_line->>'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Withdrawal quantities must be greater than zero.';
    END IF;
    SELECT avg_cost INTO _cost FROM public.items_master
    WHERE id = (_line->>'item_id')::uuid AND brand_id = _stock_brand_id AND status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A withdrawal item is not in the shared stock catalog.';
    END IF;

    _result := public.inventory_apply_movement(
      _stock_brand_id, (_line->>'item_id')::uuid, 'production_consumption', (_line->>'quantity')::numeric,
      _cost, COALESCE(NULLIF(_line->>'location_name', ''), 'main'),
      COALESCE(_line->>'reason', 'تشغيل المطبخ'),
      'inventory_daily_withdrawals', _withdrawal_id::text
    );
    _cost := (_result->>'unit_cost')::numeric;
    INSERT INTO public.inventory_daily_withdrawal_lines (withdrawal_id, item_id, quantity, unit_cost, location_name, reason)
    VALUES (
      _withdrawal_id, (_line->>'item_id')::uuid, (_line->>'quantity')::numeric, _cost,
      COALESCE(NULLIF(_line->>'location_name', ''), 'main'),
      COALESCE(_line->>'reason', 'تشغيل المطبخ')
    );
    _total := _total + ((_line->>'quantity')::numeric * _cost);
  END LOOP;

  RETURN jsonb_build_object(
    'id', _withdrawal_id,
    'withdrawal_no', _withdrawal_no,
    'consumer_brand_id', _consumer_brand_id,
    'total_value', ROUND(_total, 2)
  );
END;
$$;

DROP POLICY IF EXISTS "Inventory users view shared withdrawals" ON public.inventory_daily_withdrawals;
CREATE POLICY "Inventory users view shared withdrawals"
  ON public.inventory_daily_withdrawals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.inventory_hubs AS hub
      JOIN public.inventory_hub_brands AS membership
        ON membership.hub_id = hub.id AND membership.brand_id = inventory_daily_withdrawals.brand_id
      WHERE hub.is_default
        AND public.can_access_shared_inventory_hub(hub.id)
        AND (
          inventory_daily_withdrawals.is_shared
          OR public.has_role(auth.uid(), 'owner')
          OR public.can_access_brand(inventory_daily_withdrawals.brand_id)
        )
    )
  );

DROP POLICY IF EXISTS "Inventory users view shared withdrawal lines" ON public.inventory_daily_withdrawal_lines;
CREATE POLICY "Inventory users view shared withdrawal lines"
  ON public.inventory_daily_withdrawal_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.inventory_daily_withdrawals AS withdrawal
      JOIN public.inventory_hubs AS hub ON hub.is_default
      JOIN public.inventory_hub_brands AS membership
        ON membership.hub_id = hub.id AND membership.brand_id = withdrawal.brand_id
      WHERE withdrawal.id = withdrawal_id
        AND public.can_access_shared_inventory_hub(hub.id)
        AND (
          withdrawal.is_shared
          OR public.has_role(auth.uid(), 'owner')
          OR public.can_access_brand(withdrawal.brand_id)
        )
    )
  );
