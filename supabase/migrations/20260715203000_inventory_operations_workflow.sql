-- Operational inventory workflow: movement ledger, daily withdrawals, store-manager
-- approval for purchases, stock valuation, and physical-count adjustments.

CREATE TYPE public.inventory_purchase_request_status AS ENUM (
  'pending_store_approval', 'approved', 'rejected'
);

CREATE TABLE public.inventory_purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  request_no text NOT NULL UNIQUE,
  supplier_name text NOT NULL DEFAULT '',
  status public.inventory_purchase_request_status NOT NULL DEFAULT 'pending_store_approval',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_purchase_request_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL REFERENCES public.inventory_purchase_requests(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost >= 0),
  location_name text NOT NULL DEFAULT 'main',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  reference_id uuid,
  target_page text NOT NULL DEFAULT 'inventory',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_daily_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  withdrawal_no text NOT NULL UNIQUE,
  withdrawal_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_daily_withdrawal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL REFERENCES public.inventory_daily_withdrawals(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  line_value numeric(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  location_name text NOT NULL DEFAULT 'main',
  reason text NOT NULL DEFAULT 'تشغيل المطبخ',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_purchase_requests_brand_status ON public.inventory_purchase_requests (brand_id, status, created_at DESC);
CREATE INDEX idx_inventory_notifications_brand_unread ON public.inventory_notifications (brand_id, is_read, created_at DESC);
CREATE INDEX idx_inventory_daily_withdrawals_brand_date ON public.inventory_daily_withdrawals (brand_id, withdrawal_date DESC);

CREATE TRIGGER set_inventory_purchase_requests_updated_at BEFORE UPDATE ON public.inventory_purchase_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_inventory_daily_withdrawals_updated_at BEFORE UPDATE ON public.inventory_daily_withdrawals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.warehouses (brand_id, warehouse_code, name, warehouse_type, location)
SELECT id, 'MAIN', 'المخزن الرئيسي', 'general', 'الرئيسي'
FROM public.brands
ON CONFLICT (brand_id, warehouse_code) DO NOTHING;

ALTER TABLE public.inventory_purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_purchase_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_daily_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_daily_withdrawal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inventory users view purchase requests" ON public.inventory_purchase_requests FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Inventory users view purchase request lines" ON public.inventory_purchase_request_lines FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.inventory_purchase_requests r WHERE r.id = purchase_request_id AND public.can_access_brand(r.brand_id))
);
CREATE POLICY "Inventory users view notifications" ON public.inventory_notifications FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Inventory users update notifications" ON public.inventory_notifications FOR UPDATE TO authenticated USING (public.can_access_brand(brand_id) AND public.can_manage_inventory());
CREATE POLICY "Inventory users view daily withdrawals" ON public.inventory_daily_withdrawals FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Inventory users view daily withdrawal lines" ON public.inventory_daily_withdrawal_lines FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.inventory_daily_withdrawals d WHERE d.id = withdrawal_id AND public.can_access_brand(d.brand_id))
);

CREATE OR REPLACE FUNCTION public.inventory_require_manager(_brand_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_brand(_brand_id) OR NOT public.can_manage_inventory() THEN
    RAISE EXCEPTION 'You do not have permission to operate this inventory.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_apply_movement(
  _brand_id uuid,
  _item_id uuid,
  _movement_type public.inventory_movement_type,
  _quantity numeric,
  _unit_cost numeric DEFAULT NULL,
  _location_name text DEFAULT 'main',
  _notes text DEFAULT '',
  _reference_table text DEFAULT '',
  _reference_id text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance public.inventory_balances%ROWTYPE;
  _item public.items_master%ROWTYPE;
  _is_inbound boolean;
  _new_on_hand numeric(14,3);
  _effective_cost numeric(14,2);
  _new_avg_cost numeric(14,2);
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);

  IF _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  SELECT * INTO _item FROM public.items_master WHERE id = _item_id AND brand_id = _brand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item was not found for this brand.';
  END IF;

  INSERT INTO public.inventory_balances (brand_id, item_id, location_name, on_hand, created_by, updated_by)
  VALUES (_brand_id, _item_id, COALESCE(NULLIF(btrim(_location_name), ''), 'main'), 0, auth.uid(), auth.uid())
  ON CONFLICT (brand_id, item_id, location_name) DO NOTHING;

  SELECT * INTO _balance FROM public.inventory_balances
  WHERE brand_id = _brand_id AND item_id = _item_id AND location_name = COALESCE(NULLIF(btrim(_location_name), ''), 'main')
  FOR UPDATE;

  _is_inbound := _movement_type IN ('purchase_receipt', 'customer_return', 'production_output');
  _effective_cost := COALESCE(_unit_cost, _item.avg_cost, _item.last_purchase_price, 0);

  IF _is_inbound THEN
    _new_on_hand := _balance.on_hand + _quantity;
    IF _movement_type = 'purchase_receipt' AND _new_on_hand > 0 THEN
      _new_avg_cost := ROUND(((_balance.on_hand * _item.avg_cost) + (_quantity * _effective_cost)) / _new_on_hand, 2);
      UPDATE public.items_master
      SET last_purchase_price = _effective_cost,
          avg_cost = _new_avg_cost,
          updated_by = auth.uid()
      WHERE id = _item_id;
    END IF;
  ELSE
    IF _balance.on_hand < _quantity THEN
      RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %.', _balance.on_hand, _quantity;
    END IF;
    _new_on_hand := _balance.on_hand - _quantity;
    _effective_cost := COALESCE(_item.avg_cost, _item.last_purchase_price, _effective_cost, 0);
  END IF;

  UPDATE public.inventory_balances
  SET on_hand = _new_on_hand,
      updated_by = auth.uid()
  WHERE id = _balance.id;

  INSERT INTO public.inventory_movements (
    brand_id, item_id, movement_type, quantity, unit_cost, reference_table, reference_id, location_name, notes, created_by
  ) VALUES (
    _brand_id, _item_id, _movement_type, _quantity, _effective_cost, _reference_table, _reference_id,
    COALESCE(NULLIF(btrim(_location_name), ''), 'main'), COALESCE(_notes, ''), auth.uid()
  );

  RETURN jsonb_build_object(
    'on_hand', _new_on_hand,
    'unit_cost', _effective_cost,
    'movement_value', ROUND(_quantity * _effective_cost, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_create_item(
  _brand_id uuid,
  _item_code text,
  _name text,
  _category text,
  _unit text,
  _min_stock numeric DEFAULT 0,
  _location_name text DEFAULT 'main',
  _opening_quantity numeric DEFAULT 0,
  _opening_unit_cost numeric DEFAULT 0,
  _notes text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item_id uuid;
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF btrim(_item_code) = '' OR btrim(_name) = '' OR btrim(_category) = '' OR btrim(_unit) = '' THEN
    RAISE EXCEPTION 'Item code, name, category, and unit are required.';
  END IF;
  IF _opening_quantity < 0 OR _opening_unit_cost < 0 OR _min_stock < 0 THEN
    RAISE EXCEPTION 'Stock and cost values cannot be negative.';
  END IF;

  INSERT INTO public.items_master (
    brand_id, item_code, name, category, purchase_unit, usage_unit, min_stock, last_purchase_price, avg_cost, notes, created_by, updated_by
  ) VALUES (
    _brand_id, upper(btrim(_item_code)), btrim(_name), btrim(_category), btrim(_unit), btrim(_unit), _min_stock,
    _opening_unit_cost, _opening_unit_cost, COALESCE(_notes, ''), auth.uid(), auth.uid()
  ) RETURNING id INTO _item_id;

  INSERT INTO public.inventory_balances (brand_id, item_id, location_name, on_hand, created_by, updated_by)
  VALUES (_brand_id, _item_id, COALESCE(NULLIF(btrim(_location_name), ''), 'main'), 0, auth.uid(), auth.uid());

  IF _opening_quantity > 0 THEN
    UPDATE public.inventory_balances SET on_hand = _opening_quantity WHERE brand_id = _brand_id AND item_id = _item_id AND location_name = COALESCE(NULLIF(btrim(_location_name), ''), 'main');
    INSERT INTO public.inventory_movements (brand_id, item_id, movement_type, quantity, unit_cost, reference_table, reference_id, location_name, notes, created_by)
    VALUES (_brand_id, _item_id, 'adjustment', _opening_quantity, _opening_unit_cost, 'items_master', _item_id::text, COALESCE(NULLIF(btrim(_location_name), ''), 'main'), 'رصيد افتتاحي', auth.uid());
  END IF;

  RETURN _item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_submit_purchase_request(
  _brand_id uuid,
  _supplier_name text,
  _lines jsonb,
  _notes text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_id uuid;
  _line jsonb;
  _request_no text;
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Add at least one purchase line.';
  END IF;

  _request_no := 'PUR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);
  INSERT INTO public.inventory_purchase_requests (brand_id, request_no, supplier_name, requested_by, notes)
  VALUES (_brand_id, _request_no, COALESCE(_supplier_name, ''), auth.uid(), COALESCE(_notes, ''))
  RETURNING id INTO _request_id;

  FOR _line IN SELECT value FROM jsonb_array_elements(_lines)
  LOOP
    INSERT INTO public.inventory_purchase_request_lines (purchase_request_id, item_id, quantity, unit_cost, location_name, notes)
    VALUES (
      _request_id,
      (_line->>'item_id')::uuid,
      (_line->>'quantity')::numeric,
      COALESCE((_line->>'unit_cost')::numeric, 0),
      COALESCE(NULLIF(_line->>'location_name', ''), 'main'),
      COALESCE(_line->>'notes', '')
    );
  END LOOP;

  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id)
  VALUES (_brand_id, 'purchase_pending_approval', 'شراء بانتظار قبول مدير المخزن', 'تم تسجيل طلب شراء ' || _request_no || '. لن تضاف الكميات إلى المخزون قبل الاعتماد.', _request_id);

  RETURN _request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_review_purchase_request(_request_id uuid, _approve boolean, _review_notes text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request public.inventory_purchase_requests%ROWTYPE;
  _line public.inventory_purchase_request_lines%ROWTYPE;
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;
  PERFORM public.inventory_require_manager(_request.brand_id);
  IF _request.status <> 'pending_store_approval' THEN RAISE EXCEPTION 'This purchase request has already been reviewed.'; END IF;

  IF NOT _approve THEN
    UPDATE public.inventory_purchase_requests SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), notes = trim(notes || E'\n' || COALESCE(_review_notes, '')) WHERE id = _request_id;
    RETURN;
  END IF;

  FOR _line IN SELECT * FROM public.inventory_purchase_request_lines WHERE purchase_request_id = _request_id
  LOOP
    PERFORM public.inventory_apply_movement(
      _request.brand_id, _line.item_id, 'purchase_receipt', _line.quantity, _line.unit_cost, _line.location_name,
      COALESCE(_line.notes, 'استلام شراء معتمد'), 'inventory_purchase_requests', _request_id::text
    );
  END LOOP;

  UPDATE public.inventory_purchase_requests SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), notes = trim(notes || E'\n' || COALESCE(_review_notes, '')) WHERE id = _request_id;
  UPDATE public.inventory_notifications SET is_read = true WHERE reference_id = _request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_post_daily_withdrawal(
  _brand_id uuid,
  _lines jsonb,
  _notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _withdrawal_id uuid;
  _withdrawal_no text;
  _line jsonb;
  _result jsonb;
  _total numeric(14,2) := 0;
  _cost numeric(14,2);
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'Add at least one withdrawal line.'; END IF;

  _withdrawal_no := 'WD-' || to_char(current_date, 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 5);
  INSERT INTO public.inventory_daily_withdrawals (brand_id, withdrawal_no, status, notes, created_by, posted_by, posted_at)
  VALUES (_brand_id, _withdrawal_no, 'posted', COALESCE(_notes, ''), auth.uid(), auth.uid(), now())
  RETURNING id INTO _withdrawal_id;

  FOR _line IN SELECT value FROM jsonb_array_elements(_lines)
  LOOP
    SELECT avg_cost INTO _cost FROM public.items_master WHERE id = (_line->>'item_id')::uuid;
    _result := public.inventory_apply_movement(
      _brand_id, (_line->>'item_id')::uuid, 'production_consumption', (_line->>'quantity')::numeric,
      _cost, COALESCE(NULLIF(_line->>'location_name', ''), 'main'), COALESCE(_line->>'reason', 'تشغيل المطبخ'),
      'inventory_daily_withdrawals', _withdrawal_id::text
    );
    _cost := (_result->>'unit_cost')::numeric;
    INSERT INTO public.inventory_daily_withdrawal_lines (withdrawal_id, item_id, quantity, unit_cost, location_name, reason)
    VALUES (_withdrawal_id, (_line->>'item_id')::uuid, (_line->>'quantity')::numeric, _cost, COALESCE(NULLIF(_line->>'location_name', ''), 'main'), COALESCE(_line->>'reason', 'تشغيل المطبخ'));
    _total := _total + ((_line->>'quantity')::numeric * _cost);
  END LOOP;

  RETURN jsonb_build_object('id', _withdrawal_id, 'withdrawal_no', _withdrawal_no, 'total_value', ROUND(_total, 2));
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_post_waste(
  _brand_id uuid, _item_id uuid, _quantity numeric, _location_name text DEFAULT 'main', _reason text DEFAULT '', _notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _result jsonb; _cost numeric(14,2);
BEGIN
  SELECT avg_cost INTO _cost FROM public.items_master WHERE id = _item_id;
  _result := public.inventory_apply_movement(_brand_id, _item_id, 'waste', _quantity, _cost, _location_name, _notes, 'waste_entries', '');
  INSERT INTO public.waste_entries (brand_id, item_id, quantity, unit_cost, reason, notes, responsible_user_id, created_by)
  VALUES (_brand_id, _item_id, _quantity, (_result->>'unit_cost')::numeric, COALESCE(_reason, ''), COALESCE(_notes, ''), auth.uid(), auth.uid());
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_post_count(
  _brand_id uuid, _item_id uuid, _physical_quantity numeric, _location_name text DEFAULT 'main', _reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance public.inventory_balances%ROWTYPE;
  _count_id uuid;
  _delta numeric(14,3);
  _cost numeric(14,2);
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  SELECT * INTO _balance FROM public.inventory_balances WHERE brand_id = _brand_id AND item_id = _item_id AND location_name = COALESCE(NULLIF(_location_name, ''), 'main') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No balance exists for this item and location.'; END IF;
  IF _physical_quantity < 0 THEN RAISE EXCEPTION 'Physical quantity cannot be negative.'; END IF;
  _delta := _physical_quantity - _balance.on_hand;
  SELECT avg_cost INTO _cost FROM public.items_master WHERE id = _item_id;

  INSERT INTO public.inventory_counts (brand_id, warehouse_id, count_no, count_type, count_date, counted_by, approved_by, status, book_qty, physical_qty, variance_reason, created_by, updated_by)
  SELECT _brand_id, w.id, 'CNT-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4), 'spot', current_date, auth.uid(), auth.uid(), 'posted', _balance.on_hand, _physical_quantity, COALESCE(_reason, ''), auth.uid(), auth.uid()
  FROM public.warehouses w WHERE w.brand_id = _brand_id ORDER BY w.created_at LIMIT 1
  RETURNING id INTO _count_id;
  IF _count_id IS NULL THEN RAISE EXCEPTION 'Create a warehouse before posting a physical count.'; END IF;

  INSERT INTO public.inventory_count_lines (inventory_count_id, item_id, book_qty, physical_qty, reason)
  VALUES (_count_id, _item_id, _balance.on_hand, _physical_quantity, COALESCE(_reason, ''));
  UPDATE public.inventory_balances SET on_hand = _physical_quantity, last_count_qty = _physical_quantity, last_counted_at = now(), variance_qty = _delta, updated_by = auth.uid() WHERE id = _balance.id;
  INSERT INTO public.inventory_movements (brand_id, item_id, movement_type, quantity, unit_cost, reference_table, reference_id, location_name, notes, created_by)
  VALUES (_brand_id, _item_id, 'adjustment', abs(_delta), COALESCE(_cost, 0), 'inventory_counts', _count_id::text, _balance.location_name, COALESCE(_reason, 'تسوية جرد'), auth.uid());
  RETURN jsonb_build_object('count_id', _count_id, 'variance_qty', _delta, 'variance_value', ROUND(abs(_delta) * COALESCE(_cost, 0), 2));
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_apply_movement(uuid, uuid, public.inventory_movement_type, numeric, numeric, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_create_item(uuid, text, text, text, text, numeric, text, numeric, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_submit_purchase_request(uuid, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_review_purchase_request(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_post_daily_withdrawal(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_post_waste(uuid, uuid, numeric, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_post_count(uuid, uuid, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_apply_movement(uuid, uuid, public.inventory_movement_type, numeric, numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_create_item(uuid, text, text, text, text, numeric, text, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_submit_purchase_request(uuid, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_review_purchase_request(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_post_daily_withdrawal(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_post_waste(uuid, uuid, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_post_count(uuid, uuid, numeric, text, text) TO authenticated;
