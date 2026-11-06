-- Use one physical stock ledger for all brands while retaining brand-attributed withdrawals.

CREATE TABLE public.inventory_hubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  stock_brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX inventory_hubs_one_default
  ON public.inventory_hubs (is_default) WHERE is_default;

CREATE TABLE public.inventory_hub_brands (
  hub_id uuid NOT NULL REFERENCES public.inventory_hubs(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hub_id, brand_id)
);

CREATE INDEX inventory_hub_brands_brand_idx
  ON public.inventory_hub_brands (brand_id, hub_id);

ALTER TABLE public.inventory_hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_hub_brands ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  _stock_brand_id uuid;
  _populated_brand_count integer;
  _hub_id uuid;
BEGIN
  SELECT count(*) INTO _populated_brand_count
  FROM (
    SELECT brand_id
    FROM public.inventory_balances
    GROUP BY brand_id
    HAVING sum(on_hand) > 0
  ) AS populated;

  IF _populated_brand_count > 1 THEN
    RAISE EXCEPTION 'Shared inventory setup stopped: stock exists in more than one brand. Reconcile balances before migrating.';
  END IF;

  SELECT brand_id INTO _stock_brand_id
  FROM public.inventory_balances
  GROUP BY brand_id
  ORDER BY sum(on_hand) DESC
  LIMIT 1;

  IF _stock_brand_id IS NULL THEN
    SELECT brand_id INTO _stock_brand_id
    FROM public.items_master
    GROUP BY brand_id
    ORDER BY count(*) DESC
    LIMIT 1;
  END IF;

  IF _stock_brand_id IS NULL THEN
    RAISE EXCEPTION 'Shared inventory setup stopped: no existing brand can own the central stock ledger.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.items_master
    WHERE brand_id <> _stock_brand_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Shared inventory setup stopped: active items exist outside the central stock brand. Reconcile the catalog before migrating.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE brand_id <> _stock_brand_id
  ) OR EXISTS (
    SELECT 1 FROM public.inventory_batches
    WHERE brand_id <> _stock_brand_id
      AND quantity_on_hand > 0
      AND status IN ('available', 'reserved', 'expired', 'damaged')
  ) THEN
    RAISE EXCEPTION 'Shared inventory setup stopped: stock history or active batches exist outside the central stock brand. Reconcile them before migrating.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_purchase_requests
    WHERE brand_id <> _stock_brand_id
      AND status NOT IN ('approved', 'rejected')
  ) THEN
    RAISE EXCEPTION 'Shared inventory setup stopped: open purchase requests exist outside the central stock brand. Complete or reconcile them before migrating.';
  END IF;

  INSERT INTO public.inventory_hubs (code, name, stock_brand_id, is_default)
  VALUES ('CENTRAL', 'المخزن المركزي', _stock_brand_id, true)
  ON CONFLICT (code) DO UPDATE
    SET stock_brand_id = EXCLUDED.stock_brand_id,
        is_default = true
  RETURNING id INTO _hub_id;

  INSERT INTO public.inventory_hub_brands (hub_id, brand_id)
  SELECT _hub_id, id FROM public.brands
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_shared_inventory_hub(_hub_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'owner')
    OR (
      public.has_page_permission(auth.uid(), 'inventory')
      AND EXISTS (
        SELECT 1
        FROM public.inventory_hub_brands AS membership
        WHERE membership.hub_id = _hub_id
          AND public.can_access_brand(membership.brand_id)
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.inventory_get_shared_hub()
RETURNS TABLE (hub_id uuid, hub_name text, stock_brand_id uuid, brand_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hub.id, hub.name, hub.stock_brand_id, membership.brand_id
  FROM public.inventory_hubs AS hub
  JOIN public.inventory_hub_brands AS membership ON membership.hub_id = hub.id
  WHERE hub.is_default
    AND public.can_access_shared_inventory_hub(hub.id)
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.can_access_brand(membership.brand_id)
    )
$$;

CREATE OR REPLACE FUNCTION public.inventory_attach_new_brand_to_hub()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.inventory_hub_brands (hub_id, brand_id)
  SELECT id, NEW.id FROM public.inventory_hubs WHERE is_default
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_attach_new_brand_to_hub
AFTER INSERT ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.inventory_attach_new_brand_to_hub();

CREATE POLICY "Inventory users view shared hub"
  ON public.inventory_hubs FOR SELECT TO authenticated
  USING (public.can_access_shared_inventory_hub(id));
CREATE POLICY "Inventory users view shared hub brands"
  ON public.inventory_hub_brands FOR SELECT TO authenticated
  USING (public.can_access_shared_inventory_hub(hub_id));

CREATE POLICY "Inventory users view shared stock items"
  ON public.items_master FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      WHERE hub.is_default AND hub.stock_brand_id = brand_id
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users view shared stock balances"
  ON public.inventory_balances FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      WHERE hub.is_default AND hub.stock_brand_id = brand_id
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users view shared stock movements"
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      WHERE hub.is_default AND hub.stock_brand_id = brand_id
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users view shared stock warehouses"
  ON public.warehouses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      WHERE hub.is_default AND hub.stock_brand_id = brand_id
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users view shared stock batches"
  ON public.inventory_batches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      WHERE hub.is_default AND hub.stock_brand_id = brand_id
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users view shared stock counts"
  ON public.inventory_counts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      WHERE hub.is_default AND hub.stock_brand_id = brand_id
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users view shared stock count lines"
  ON public.inventory_count_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.inventory_counts AS count_record
      JOIN public.inventory_hubs AS hub ON hub.stock_brand_id = count_record.brand_id AND hub.is_default
      WHERE count_record.id = inventory_count_id
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users view shared withdrawals"
  ON public.inventory_daily_withdrawals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      JOIN public.inventory_hub_brands AS membership ON membership.hub_id = hub.id
      WHERE hub.is_default AND membership.brand_id = inventory_daily_withdrawals.brand_id
        AND (public.has_role(auth.uid(), 'owner') OR public.can_access_brand(inventory_daily_withdrawals.brand_id))
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
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
        AND (public.has_role(auth.uid(), 'owner') OR public.can_access_brand(withdrawal.brand_id))
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users view shared purchase requests"
  ON public.inventory_purchase_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      WHERE hub.is_default AND hub.stock_brand_id = inventory_purchase_requests.brand_id
        AND (public.has_role(auth.uid(), 'owner') OR public.can_access_brand(inventory_purchase_requests.brand_id))
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users view shared purchase request lines"
  ON public.inventory_purchase_request_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.inventory_purchase_requests AS request
      JOIN public.inventory_hubs AS hub
        ON hub.is_default AND hub.stock_brand_id = request.brand_id
      WHERE request.id = inventory_purchase_request_lines.purchase_request_id
        AND (public.has_role(auth.uid(), 'owner') OR public.can_access_brand(request.brand_id))
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users view shared stock notifications"
  ON public.inventory_notifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      WHERE hub.is_default AND hub.stock_brand_id = inventory_notifications.brand_id
        AND (public.has_role(auth.uid(), 'owner') OR public.can_access_brand(inventory_notifications.brand_id))
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users update shared stock notifications"
  ON public.inventory_notifications FOR UPDATE TO authenticated
  USING (
    public.can_manage_inventory()
    AND EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      WHERE hub.is_default AND hub.stock_brand_id = inventory_notifications.brand_id
        AND (public.has_role(auth.uid(), 'owner') OR public.can_access_brand(inventory_notifications.brand_id))
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  )
  WITH CHECK (
    public.can_manage_inventory()
    AND EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      WHERE hub.is_default AND hub.stock_brand_id = inventory_notifications.brand_id
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );
CREATE POLICY "Inventory users view shared item requests"
  ON public.inventory_item_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_hubs AS hub
      WHERE hub.is_default AND hub.stock_brand_id = inventory_item_requests.brand_id
        AND (public.has_role(auth.uid(), 'owner') OR public.can_access_brand(inventory_item_requests.brand_id))
        AND public.can_access_shared_inventory_hub(hub.id)
    )
  );

CREATE OR REPLACE FUNCTION public.inventory_require_manager(_brand_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_inventory()
    OR NOT (
      public.can_access_brand(_brand_id)
      OR EXISTS (
        SELECT 1
        FROM public.inventory_hubs AS hub
        JOIN public.inventory_hub_brands AS membership ON membership.hub_id = hub.id
        WHERE hub.is_default
          AND (hub.stock_brand_id = _brand_id OR membership.brand_id = _brand_id)
          AND public.can_access_shared_inventory_hub(hub.id)
      )
    ) THEN
    RAISE EXCEPTION 'You do not have permission to operate this inventory.';
  END IF;
END;
$$;

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
  IF NOT public.has_role(auth.uid(), 'owner')
    AND NOT public.can_access_brand(_consumer_brand_id) THEN
    RAISE EXCEPTION 'You do not have access to record consumption for this brand.';
  END IF;

  SELECT hub.stock_brand_id INTO _stock_brand_id
  FROM public.inventory_hubs AS hub
  JOIN public.inventory_hub_brands AS membership
    ON membership.hub_id = hub.id AND membership.brand_id = _consumer_brand_id
  WHERE hub.id = _hub_id AND hub.is_default;
  IF _stock_brand_id IS NULL THEN
    RAISE EXCEPTION 'The selected brand is not linked to this shared inventory.';
  END IF;
  PERFORM public.inventory_require_manager(_stock_brand_id);
  IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Add at least one withdrawal line.';
  END IF;

  _withdrawal_no := 'WD-' || to_char(current_date, 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 5);
  INSERT INTO public.inventory_daily_withdrawals (brand_id, withdrawal_no, status, notes, created_by, posted_by, posted_at)
  VALUES (_consumer_brand_id, _withdrawal_no, 'posted', COALESCE(_notes, ''), auth.uid(), auth.uid(), now())
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

GRANT EXECUTE ON FUNCTION public.inventory_get_shared_hub() TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_post_shared_daily_withdrawal(uuid, uuid, jsonb, text) TO authenticated;
GRANT SELECT ON public.inventory_hubs, public.inventory_hub_brands TO authenticated;
REVOKE ALL ON FUNCTION public.inventory_get_shared_hub() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_post_shared_daily_withdrawal(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_shared_inventory_hub(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_attach_new_brand_to_hub() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_shared_inventory_hub(uuid) TO authenticated;
