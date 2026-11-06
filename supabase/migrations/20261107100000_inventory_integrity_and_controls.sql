-- Keep inventory mutations on audited RPC paths and align stock, batches, and counts.

CREATE OR REPLACE FUNCTION public.can_manage_inventory()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'inventory')
$$;

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

DROP POLICY IF EXISTS "Users can manage items for accessible brands" ON public.items_master;

DROP POLICY IF EXISTS "Users can manage inventory balances" ON public.inventory_balances;

DROP POLICY IF EXISTS "Users can insert inventory movements" ON public.inventory_movements;

DROP POLICY IF EXISTS "Users can manage inventory batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Users can manage inventory counts" ON public.inventory_counts;
DROP POLICY IF EXISTS "Users can manage inventory count lines" ON public.inventory_count_lines;

ALTER TABLE public.inventory_count_lines
  ADD COLUMN IF NOT EXISTS location_name text NOT NULL DEFAULT 'main';
CREATE INDEX IF NOT EXISTS idx_inventory_count_lines_count_location
  ON public.inventory_count_lines (inventory_count_id, location_name, item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_pending_review
  ON public.inventory_counts (brand_id, created_at)
  WHERE status = 'submitted';
CREATE INDEX IF NOT EXISTS idx_inventory_batches_fifo
  ON public.inventory_batches (brand_id, warehouse_id, item_id, status, expiry_date, received_at);
CREATE INDEX IF NOT EXISTS idx_inventory_purchase_lines_item
  ON public.inventory_purchase_request_lines (item_id, purchase_request_id);

INSERT INTO public.inventory_batches (
  brand_id, warehouse_id, item_id, batch_no, quantity_on_hand, unit_cost, status, notes
)
SELECT balance.brand_id, warehouse.id, balance.item_id,
  'MIG-' || substr(balance.id::text, 1, 8),
  balance.on_hand - COALESCE(tracked.quantity, 0), COALESCE(item.avg_cost, 0),
  'available', 'رصيد سابق غير مرتبط بدفعة'
FROM public.inventory_balances AS balance
JOIN public.items_master AS item ON item.id = balance.item_id AND item.brand_id = balance.brand_id
JOIN public.warehouses AS warehouse
  ON warehouse.brand_id = balance.brand_id
 AND lower(warehouse.warehouse_code) = lower(balance.location_name)
 AND warehouse.status = 'active'
LEFT JOIN LATERAL (
  SELECT sum(batch.quantity_on_hand) AS quantity
  FROM public.inventory_batches AS batch
  WHERE batch.brand_id = balance.brand_id
    AND batch.item_id = balance.item_id
    AND batch.warehouse_id = warehouse.id
    AND batch.status IN ('available', 'reserved', 'expired', 'damaged')
) AS tracked ON true
WHERE balance.on_hand > COALESCE(tracked.quantity, 0)
ON CONFLICT (warehouse_id, item_id, batch_no) DO NOTHING;

CREATE OR REPLACE FUNCTION public.inventory_create_item_v2(
  _brand_id uuid,
  _item_code text,
  _name text,
  _category text,
  _purchase_unit text,
  _usage_unit text,
  _conversion_factor numeric,
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
  _warehouse_id uuid;
  _location text := COALESCE(NULLIF(lower(btrim(_location_name)), ''), 'main');
  _can_manage boolean := public.can_manage_inventory();
BEGIN
  IF NOT public.can_access_brand(_brand_id)
    OR NOT (_can_manage OR public.has_page_permission(auth.uid(), 'purchases')) THEN
    RAISE EXCEPTION 'You do not have permission to create inventory items.';
  END IF;
  IF btrim(COALESCE(_item_code, '')) = '' OR btrim(COALESCE(_name, '')) = ''
    OR btrim(COALESCE(_category, '')) = '' OR btrim(COALESCE(_purchase_unit, '')) = ''
    OR btrim(COALESCE(_usage_unit, '')) = '' THEN
    RAISE EXCEPTION 'Item code, name, category, purchase unit, and usage unit are required.';
  END IF;
  IF _conversion_factor IS NULL OR _conversion_factor <= 0
    OR (_purchase_unit = _usage_unit AND _conversion_factor <> 1)
    OR COALESCE(_opening_quantity, 0) < 0 OR COALESCE(_opening_unit_cost, 0) < 0
    OR COALESCE(_min_stock, 0) < 0 THEN
    RAISE EXCEPTION 'Conversion, stock, and cost values are invalid.';
  END IF;
  IF NOT _can_manage AND COALESCE(_opening_quantity, 0) > 0 THEN
    RAISE EXCEPTION 'Only an inventory manager may create an opening stock balance.';
  END IF;
  SELECT id INTO _warehouse_id FROM public.warehouses
  WHERE brand_id = _brand_id AND lower(warehouse_code) = _location AND status = 'active'
  ORDER BY created_at LIMIT 1;
  IF _warehouse_id IS NULL THEN RAISE EXCEPTION 'An active warehouse for item location % was not found.', _location; END IF;

  INSERT INTO public.items_master (
    brand_id, item_code, name, category, purchase_unit, usage_unit, conversion_factor,
    min_stock, last_purchase_price, avg_cost, notes, created_by, updated_by
  ) VALUES (
    _brand_id, upper(btrim(_item_code)), btrim(_name), btrim(_category), btrim(_purchase_unit), btrim(_usage_unit),
    _conversion_factor, COALESCE(_min_stock, 0),
    ROUND(COALESCE(_opening_unit_cost, 0) * _conversion_factor, 2), COALESCE(_opening_unit_cost, 0),
    COALESCE(_notes, ''), auth.uid(), auth.uid()
  ) RETURNING id INTO _item_id;

  INSERT INTO public.inventory_balances (brand_id, item_id, location_name, on_hand, created_by, updated_by)
  VALUES (_brand_id, _item_id, _location, COALESCE(_opening_quantity, 0), auth.uid(), auth.uid());

  IF _opening_quantity > 0 THEN
    INSERT INTO public.inventory_movements (
      brand_id, item_id, movement_type, quantity, unit_cost, reference_table, reference_id,
      location_name, notes, created_by
    ) VALUES (
      _brand_id, _item_id, 'adjustment', _opening_quantity, _opening_unit_cost,
      'items_master', _item_id::text, _location, 'رصيد افتتاحي', auth.uid()
    );
    INSERT INTO public.inventory_batches (
      brand_id, warehouse_id, item_id, batch_no, quantity_on_hand, unit_cost, status, notes, created_by, updated_by
    ) VALUES (
      _brand_id, _warehouse_id, _item_id, 'OPEN-' || substr(_item_id::text, 1, 8),
      _opening_quantity, _opening_unit_cost, 'available', 'رصيد افتتاحي', auth.uid(), auth.uid()
    );
  END IF;

  RETURN _item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_update_item(
  _brand_id uuid,
  _item_id uuid,
  _item_code text,
  _name text,
  _category text,
  _purchase_unit text,
  _usage_unit text,
  _conversion_factor numeric,
  _min_stock numeric,
  _notes text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item public.items_master%ROWTYPE;
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF btrim(COALESCE(_item_code, '')) = '' OR btrim(COALESCE(_name, '')) = ''
    OR btrim(COALESCE(_category, '')) = '' OR btrim(COALESCE(_purchase_unit, '')) = ''
    OR btrim(COALESCE(_usage_unit, '')) = '' OR _conversion_factor IS NULL OR _conversion_factor <= 0
    OR (_purchase_unit = _usage_unit AND _conversion_factor <> 1) OR COALESCE(_min_stock, -1) < 0 THEN
    RAISE EXCEPTION 'Item details or conversion values are invalid.';
  END IF;
  SELECT * INTO _item FROM public.items_master WHERE id = _item_id AND brand_id = _brand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item was not found for this brand.'; END IF;
  IF (_item.purchase_unit <> _purchase_unit OR _item.usage_unit <> _usage_unit OR _item.conversion_factor <> _conversion_factor)
    AND EXISTS (SELECT 1 FROM public.inventory_movements WHERE item_id = _item_id AND brand_id = _brand_id) THEN
    RAISE EXCEPTION 'Purchase and usage units cannot change after inventory movements have been recorded.';
  END IF;
  UPDATE public.items_master
  SET item_code = upper(btrim(_item_code)), name = btrim(_name), category = btrim(_category),
      purchase_unit = btrim(_purchase_unit), usage_unit = btrim(_usage_unit),
      conversion_factor = _conversion_factor, min_stock = _min_stock,
      notes = COALESCE(_notes, ''), updated_by = auth.uid()
  WHERE id = _item_id AND brand_id = _brand_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_set_item_status(
  _brand_id uuid,
  _item_id uuid,
  _status public.erp_item_status
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF _status = 'inactive' AND EXISTS (
    SELECT 1 FROM public.inventory_balances
    WHERE brand_id = _brand_id AND item_id = _item_id AND on_hand > 0
  ) THEN
    RAISE EXCEPTION 'Reduce the item stock to zero before archiving it.';
  END IF;
  IF _status = 'inactive' AND EXISTS (
    SELECT 1 FROM public.inventory_purchase_request_lines line
    JOIN public.inventory_purchase_requests request ON request.id = line.purchase_request_id
    WHERE line.item_id = _item_id AND request.brand_id = _brand_id
      AND request.status IN ('pending_store_approval', 'purchased_pending_receipt')
  ) THEN
    RAISE EXCEPTION 'Resolve pending purchase requests before archiving this item.';
  END IF;
  UPDATE public.items_master
  SET status = _status, updated_by = auth.uid()
  WHERE id = _item_id AND brand_id = _brand_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item was not found for this brand.'; END IF;
  RETURN true;
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
  _batch public.inventory_batches%ROWTYPE;
  _warehouse_id uuid;
  _location text := COALESCE(NULLIF(lower(btrim(_location_name)), ''), 'main');
  _is_inbound boolean;
  _factor numeric(14,4);
  _new_on_hand numeric(14,3);
  _effective_cost numeric(14,2);
  _new_avg_cost numeric(14,2);
  _total_on_hand numeric(14,3);
  _batch_stock numeric(14,3);
  _has_batches boolean;
  _remaining numeric(14,3);
  _take numeric(14,3);
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero.'; END IF;
  SELECT * INTO _item FROM public.items_master
  WHERE id = _item_id AND brand_id = _brand_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active inventory item was not found for this brand.'; END IF;
  _factor := COALESCE(_item.conversion_factor, 1);
  IF _factor <= 0 THEN RAISE EXCEPTION 'Item purchase conversion factor must be greater than zero.'; END IF;
  SELECT id INTO _warehouse_id FROM public.warehouses
  WHERE brand_id = _brand_id AND lower(warehouse_code) = _location AND status = 'active'
  ORDER BY created_at LIMIT 1;
  IF _warehouse_id IS NULL THEN RAISE EXCEPTION 'An active warehouse for location % was not found.', _location; END IF;

  INSERT INTO public.inventory_balances (brand_id, item_id, location_name, on_hand, created_by, updated_by)
  VALUES (_brand_id, _item_id, _location, 0, auth.uid(), auth.uid())
  ON CONFLICT (brand_id, item_id, location_name) DO NOTHING;
  SELECT * INTO _balance FROM public.inventory_balances
  WHERE brand_id = _brand_id AND item_id = _item_id AND location_name = _location FOR UPDATE;

  _is_inbound := _movement_type IN ('purchase_receipt', 'customer_return', 'production_output');
  _effective_cost := COALESCE(_unit_cost, _item.avg_cost, _item.last_purchase_price / _factor, 0);

  IF _is_inbound THEN
    _new_on_hand := _balance.on_hand + _quantity;
    IF _movement_type = 'purchase_receipt' THEN
      SELECT COALESCE(sum(on_hand), 0) INTO _total_on_hand
      FROM public.inventory_balances WHERE brand_id = _brand_id AND item_id = _item_id;
      _new_avg_cost := CASE WHEN _total_on_hand + _quantity > 0
        THEN ROUND(((_total_on_hand * _item.avg_cost) + (_quantity * _effective_cost)) / (_total_on_hand + _quantity), 2)
        ELSE _effective_cost END;
      UPDATE public.items_master
      SET last_purchase_price = ROUND(_effective_cost * _factor, 2), avg_cost = _new_avg_cost, updated_by = auth.uid()
      WHERE id = _item_id;
    END IF;
  ELSE
    IF greatest(_balance.on_hand - _balance.reserved_qty, 0) < _quantity THEN
      RAISE EXCEPTION 'Insufficient unreserved stock at location %. Available: %, reserved: %, requested: %.',
        _location, greatest(_balance.on_hand - _balance.reserved_qty, 0), _balance.reserved_qty, _quantity;
    END IF;
    _new_on_hand := _balance.on_hand - _quantity;
    _effective_cost := COALESCE(_item.avg_cost, _item.last_purchase_price / _factor, _effective_cost, 0);

    IF _warehouse_id IS NOT NULL THEN
      SELECT count(*) > 0,
        COALESCE(sum(CASE WHEN _movement_type IN ('waste', 'adjustment') OR expiry_date IS NULL OR expiry_date >= current_date
          THEN greatest(quantity_on_hand - reserved_qty, 0) ELSE 0 END), 0)
      INTO _has_batches, _batch_stock
      FROM public.inventory_batches
      WHERE brand_id = _brand_id AND item_id = _item_id AND warehouse_id = _warehouse_id
        AND (status = 'available' OR (_movement_type IN ('waste', 'adjustment') AND status IN ('expired', 'damaged')));
      IF _has_batches AND _batch_stock < _quantity THEN
        RAISE EXCEPTION 'Batch quantities do not match location stock for %. Reconcile batches before issuing stock.', _item.name;
      END IF;
      IF _has_batches THEN
        _remaining := _quantity;
        FOR _batch IN
          SELECT * FROM public.inventory_batches
          WHERE brand_id = _brand_id AND item_id = _item_id AND warehouse_id = _warehouse_id
            AND (status = 'available' OR (_movement_type IN ('waste', 'adjustment') AND status IN ('expired', 'damaged')))
            AND quantity_on_hand > reserved_qty
            AND (_movement_type IN ('waste', 'adjustment') OR expiry_date IS NULL OR expiry_date >= current_date)
          ORDER BY CASE WHEN expiry_date < current_date THEN 0 ELSE 1 END,
            expiry_date ASC NULLS LAST, received_at ASC, id
          FOR UPDATE
        LOOP
          EXIT WHEN _remaining <= 0;
          _take := least(_remaining, _batch.quantity_on_hand - _batch.reserved_qty);
          UPDATE public.inventory_batches
          SET quantity_on_hand = quantity_on_hand - _take,
              status = CASE WHEN quantity_on_hand - _take <= 0 THEN 'consumed'::public.inventory_batch_status
                            WHEN quantity_on_hand - _take <= reserved_qty THEN 'reserved'::public.inventory_batch_status ELSE status END,
              updated_by = auth.uid()
          WHERE id = _batch.id;
          _remaining := _remaining - _take;
        END LOOP;
      END IF;
    END IF;
  END IF;

  UPDATE public.inventory_balances SET on_hand = _new_on_hand, updated_by = auth.uid() WHERE id = _balance.id;
  INSERT INTO public.inventory_movements (
    brand_id, item_id, movement_type, quantity, unit_cost, reference_table, reference_id, location_name, notes, created_by
  ) VALUES (
    _brand_id, _item_id, _movement_type, _quantity, _effective_cost, _reference_table, _reference_id,
    _location, COALESCE(_notes, ''), auth.uid()
  );
  RETURN jsonb_build_object('on_hand', _new_on_hand, 'unit_cost', _effective_cost, 'movement_value', ROUND(_quantity * _effective_cost, 2));
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_post_count(
  _brand_id uuid,
  _item_id uuid,
  _physical_quantity numeric,
  _location_name text DEFAULT 'main',
  _reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item public.items_master%ROWTYPE;
  _balance public.inventory_balances%ROWTYPE;
  _warehouse_id uuid;
  _count_id uuid;
  _location text := COALESCE(NULLIF(lower(btrim(_location_name)), ''), 'main');
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF _physical_quantity IS NULL OR _physical_quantity < 0 THEN RAISE EXCEPTION 'Physical quantity cannot be negative.'; END IF;
  SELECT * INTO _item FROM public.items_master WHERE id = _item_id AND brand_id = _brand_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active inventory item was not found for this brand.'; END IF;
  SELECT id INTO _warehouse_id FROM public.warehouses
  WHERE brand_id = _brand_id AND lower(warehouse_code) = _location AND status = 'active'
  ORDER BY created_at LIMIT 1;
  IF _warehouse_id IS NULL THEN RAISE EXCEPTION 'Create an active warehouse for location % before counting.', _location; END IF;

  INSERT INTO public.inventory_balances (brand_id, item_id, location_name, on_hand, created_by, updated_by)
  VALUES (_brand_id, _item_id, _location, 0, auth.uid(), auth.uid())
  ON CONFLICT (brand_id, item_id, location_name) DO NOTHING;
  SELECT * INTO _balance FROM public.inventory_balances
  WHERE brand_id = _brand_id AND item_id = _item_id AND location_name = _location FOR UPDATE;

  INSERT INTO public.inventory_counts (
    brand_id, warehouse_id, count_no, count_type, count_date, counted_by, status,
    book_qty, physical_qty, variance_reason, notes, created_by, updated_by
  ) VALUES (
    _brand_id, _warehouse_id, 'CNT-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4),
    'spot', current_date, auth.uid(), 'submitted', _balance.on_hand, _physical_quantity,
    COALESCE(_reason, ''), COALESCE(_reason, ''), auth.uid(), auth.uid()
  ) RETURNING id INTO _count_id;
  INSERT INTO public.inventory_count_lines (inventory_count_id, item_id, location_name, book_qty, physical_qty, reason)
  VALUES (_count_id, _item_id, _location, _balance.on_hand, _physical_quantity, COALESCE(_reason, ''));
  RETURN jsonb_build_object('count_id', _count_id, 'variance_qty', _physical_quantity - _balance.on_hand, 'status', 'submitted');
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_record_manual_movement(
  _brand_id uuid,
  _item_id uuid,
  _movement_type public.inventory_movement_type,
  _quantity numeric,
  _unit_cost numeric,
  _location_name text DEFAULT 'main',
  _notes text DEFAULT '',
  _batch_no text DEFAULT '',
  _expiry_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _location text := COALESCE(NULLIF(lower(btrim(_location_name)), ''), 'main');
  _warehouse_id uuid;
  _batch_code text := NULLIF(btrim(_batch_no), '');
  _result jsonb;
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF _movement_type IS NULL OR _movement_type NOT IN ('purchase_receipt', 'production_consumption', 'waste') THEN
    RAISE EXCEPTION 'This manual movement type is not allowed.';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero.'; END IF;
  IF _movement_type = 'purchase_receipt' AND (COALESCE(_unit_cost, -1) < 0 OR _expiry_date < current_date) THEN
    RAISE EXCEPTION 'Receipt cost must be nonnegative and expiry date cannot be in the past.';
  END IF;
  SELECT id INTO _warehouse_id FROM public.warehouses
  WHERE brand_id = _brand_id AND lower(warehouse_code) = _location AND status = 'active'
  ORDER BY created_at LIMIT 1;
  IF _warehouse_id IS NULL THEN RAISE EXCEPTION 'An active warehouse for location % was not found.', _location; END IF;

  IF _movement_type = 'purchase_receipt' THEN
    _batch_code := COALESCE(_batch_code, 'MAN-' || substr(gen_random_uuid()::text, 1, 12));
    _result := public.inventory_apply_movement(
      _brand_id, _item_id, _movement_type, _quantity, _unit_cost, _location,
      _notes, 'manual_inventory_operation', _batch_code
    );
    INSERT INTO public.inventory_batches (
      brand_id, warehouse_id, item_id, batch_no, expiry_date, quantity_on_hand, unit_cost, status, notes, created_by, updated_by
    ) VALUES (
      _brand_id, _warehouse_id, _item_id, _batch_code, _expiry_date, _quantity, _unit_cost,
      'available', COALESCE(_notes, ''), auth.uid(), auth.uid()
    )
    ON CONFLICT (warehouse_id, item_id, batch_no) DO UPDATE
    SET quantity_on_hand = public.inventory_batches.quantity_on_hand + EXCLUDED.quantity_on_hand,
        updated_by = auth.uid()
    WHERE (EXCLUDED.expiry_date IS NULL OR public.inventory_batches.expiry_date IS NOT DISTINCT FROM EXCLUDED.expiry_date)
      AND public.inventory_batches.unit_cost = EXCLUDED.unit_cost;
    IF NOT FOUND THEN RAISE EXCEPTION 'Batch number already exists with a different expiry date or cost.'; END IF;
  ELSE
    _result := public.inventory_apply_movement(
      _brand_id, _item_id, _movement_type, _quantity, _unit_cost, _location,
      _notes, 'manual_inventory_operation', ''
    );
  END IF;
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_review_count(
  _count_id uuid,
  _approve boolean,
  _review_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count public.inventory_counts%ROWTYPE;
  _line public.inventory_count_lines%ROWTYPE;
  _balance public.inventory_balances%ROWTYPE;
  _item public.items_master%ROWTYPE;
  _warehouse_id uuid;
  _delta numeric(14,3);
  _cost numeric(14,2);
  _line_count integer := 0;
BEGIN
  SELECT * INTO _count FROM public.inventory_counts WHERE id = _count_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory count was not found.'; END IF;
  PERFORM public.inventory_require_manager(_count.brand_id);
  IF _count.status <> 'submitted' THEN RAISE EXCEPTION 'Only submitted counts can be reviewed.'; END IF;
  IF _approve IS NULL THEN RAISE EXCEPTION 'Choose whether to approve or reject the count.'; END IF;
  IF _count.counted_by IS NULL OR _count.counted_by = auth.uid() THEN
    RAISE EXCEPTION 'A count must be approved by a different user.';
  END IF;
  IF NOT _approve AND btrim(COALESCE(_review_notes, '')) = '' THEN RAISE EXCEPTION 'Add a reason when rejecting a count.'; END IF;

  IF NOT _approve THEN
    UPDATE public.inventory_counts SET status = 'rejected', approved_by = auth.uid(),
      variance_reason = COALESCE(_review_notes, ''), notes = trim(notes || E'\n' || COALESCE(_review_notes, '')),
      updated_by = auth.uid() WHERE id = _count_id;
    RETURN jsonb_build_object('count_id', _count_id, 'status', 'rejected');
  END IF;

  FOR _line IN SELECT * FROM public.inventory_count_lines WHERE inventory_count_id = _count_id ORDER BY item_id FOR UPDATE
  LOOP
    _line_count := _line_count + 1;
    SELECT * INTO _item FROM public.items_master WHERE id = _line.item_id AND brand_id = _count.brand_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Counted item no longer belongs to this brand.'; END IF;
    SELECT * INTO _balance FROM public.inventory_balances
    WHERE brand_id = _count.brand_id AND item_id = _line.item_id AND location_name = _line.location_name FOR UPDATE;
    IF NOT FOUND OR _balance.on_hand <> _line.book_qty THEN
      RAISE EXCEPTION 'Stock changed after count %. Recount location % for item % before approval.', _count.count_no, _line.location_name, _line.item_id;
    END IF;
    _delta := _line.physical_qty - _line.book_qty;
    _cost := COALESCE(_item.avg_cost, 0);
    SELECT id INTO _warehouse_id FROM public.warehouses
    WHERE brand_id = _count.brand_id AND lower(warehouse_code) = _line.location_name AND status = 'active'
    ORDER BY created_at LIMIT 1;
    IF _warehouse_id IS NULL THEN RAISE EXCEPTION 'Active warehouse for count location % was not found.', _line.location_name; END IF;

    IF _delta < 0 THEN
      PERFORM public.inventory_apply_movement(
        _count.brand_id, _line.item_id, 'adjustment', abs(_delta), _cost,
        _line.location_name, COALESCE(_line.reason, 'تسوية جرد'), 'inventory_counts', _count_id::text
      );
      UPDATE public.inventory_balances
      SET last_count_qty = _line.physical_qty, last_counted_at = now(), variance_qty = _delta, updated_by = auth.uid()
      WHERE id = _balance.id;
    ELSIF _delta > 0 THEN
      UPDATE public.inventory_balances SET on_hand = on_hand + _delta, last_count_qty = _line.physical_qty,
        last_counted_at = now(), variance_qty = _delta, updated_by = auth.uid() WHERE id = _balance.id;
      INSERT INTO public.inventory_movements (
        brand_id, item_id, movement_type, quantity, unit_cost, reference_table, reference_id, location_name, notes, created_by
      ) VALUES (
        _count.brand_id, _line.item_id, 'adjustment', _delta, _cost, 'inventory_counts', _count_id::text,
        _line.location_name, COALESCE(_line.reason, 'تسوية جرد'), auth.uid()
      );
      INSERT INTO public.inventory_batches (
        brand_id, warehouse_id, item_id, batch_no, quantity_on_hand, unit_cost, status, notes, created_by, updated_by
      ) VALUES (
        _count.brand_id, _warehouse_id, _line.item_id,
        'COUNT-' || substr(_count_id::text, 1, 8) || '-' || substr(_line.item_id::text, 1, 8),
        _delta, _cost, 'available', COALESCE(_line.reason, 'تسوية جرد'), auth.uid(), auth.uid()
      )
      ON CONFLICT (warehouse_id, item_id, batch_no) DO UPDATE
      SET quantity_on_hand = public.inventory_batches.quantity_on_hand + EXCLUDED.quantity_on_hand, updated_by = auth.uid();
    ELSE
      UPDATE public.inventory_balances SET last_count_qty = _line.physical_qty, last_counted_at = now(),
        variance_qty = 0, updated_by = auth.uid() WHERE id = _balance.id;
    END IF;
  END LOOP;
  IF _line_count = 0 THEN RAISE EXCEPTION 'The count has no count lines.'; END IF;
  UPDATE public.inventory_counts SET status = 'posted', approved_by = auth.uid(),
    variance_reason = COALESCE(NULLIF(_review_notes, ''), variance_reason), updated_by = auth.uid()
  WHERE id = _count_id;
  RETURN jsonb_build_object('count_id', _count_id, 'status', 'posted', 'line_count', _line_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_receive_purchase_request_v2(
  _request_id uuid,
  _lines jsonb,
  _received_by text,
  _receipt_date date DEFAULT CURRENT_DATE,
  _notes text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request public.inventory_purchase_requests%ROWTYPE;
  _line public.inventory_purchase_request_lines%ROWTYPE;
  _item public.items_master%ROWTYPE;
  _warehouse public.warehouses%ROWTYPE;
  _input jsonb;
  _received numeric(14,3);
  _rejected numeric(14,3);
  _factor numeric(14,4);
  _batch_no text;
  _location text;
  _all_processed boolean;
  _any_received boolean;
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;
  PERFORM public.inventory_require_manager(_request.brand_id);
  IF _request.status <> 'purchased_pending_receipt' THEN RAISE EXCEPTION 'This purchase is not awaiting warehouse receipt.'; END IF;
  IF btrim(COALESCE(_received_by, '')) = '' OR _lines IS NULL
    OR jsonb_typeof(_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Receiver name and at least one receipt line are required.';
  END IF;
  IF jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'Add at least one receipt line.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_lines) AS entry GROUP BY entry->>'line_id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Each receipt line may appear only once.';
  END IF;

  FOR _input IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO _line FROM public.inventory_purchase_request_lines
    WHERE id = (_input->>'line_id')::uuid AND purchase_request_id = _request_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt line does not belong to this request.'; END IF;
    _received := COALESCE((_input->>'received_quantity')::numeric, 0);
    _rejected := COALESCE((_input->>'rejected_quantity')::numeric, 0);
    IF _received < 0 OR _rejected < 0 OR _received + _rejected <= 0
      OR _line.received_quantity + _line.rejected_quantity + _received + _rejected > _line.quantity THEN
      RAISE EXCEPTION 'Received and rejected quantities must be positive and cannot exceed the purchased quantity.';
    END IF;
    IF _rejected > 0 AND btrim(COALESCE(_input->>'rejection_reason', '')) = '' THEN
      RAISE EXCEPTION 'Add a reason for rejected quantity.';
    END IF;

    IF _received > 0 THEN
      SELECT * INTO _item FROM public.items_master
      WHERE id = _line.item_id AND brand_id = _request.brand_id AND status = 'active' FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Receipt item does not belong to this brand.'; END IF;
      _factor := COALESCE(_item.conversion_factor, 1);
      IF _factor <= 0 THEN RAISE EXCEPTION 'Item purchase conversion factor must be greater than zero.'; END IF;
      _location := COALESCE(NULLIF(lower(btrim(_input->>'location_name')), ''), lower(btrim(_line.location_name)), 'main');
      SELECT * INTO _warehouse FROM public.warehouses
      WHERE brand_id = _request.brand_id AND lower(warehouse_code) = _location AND status = 'active'
      ORDER BY created_at LIMIT 1;
      IF NOT FOUND THEN RAISE EXCEPTION 'An active warehouse for receipt location % was not found.', _location; END IF;
      _batch_no := COALESCE(NULLIF(btrim(_input->>'batch_no'), ''),
        'RCV-' || substr(_request_id::text, 1, 8) || '-' || substr(_line.id::text, 1, 8) || '-' || substr(gen_random_uuid()::text, 1, 8));

      PERFORM public.inventory_apply_movement(
        _request.brand_id, _line.item_id, 'purchase_receipt', _received * _factor,
        ROUND(_line.unit_cost / _factor, 2), _location,
        COALESCE(NULLIF(_input->>'notes', ''), 'استلام فاتورة شراء'), 'inventory_purchase_requests', _request_id::text
      );
      UPDATE public.items_master SET last_purchase_price = _line.unit_cost, updated_by = auth.uid()
      WHERE id = _line.item_id AND brand_id = _request.brand_id;
      INSERT INTO public.inventory_batches (
        brand_id, warehouse_id, item_id, batch_no, expiry_date, quantity_on_hand, unit_cost, notes, created_by, updated_by
      ) VALUES (
        _request.brand_id, _warehouse.id, _line.item_id, _batch_no,
        NULLIF(_input->>'expiry_date', '')::date, _received * _factor,
        ROUND(_line.unit_cost / _factor, 2), COALESCE(_input->>'notes', ''), auth.uid(), auth.uid()
      )
      ON CONFLICT (warehouse_id, item_id, batch_no)
      DO UPDATE SET
        quantity_on_hand = public.inventory_batches.quantity_on_hand + EXCLUDED.quantity_on_hand,
        expiry_date = COALESCE(EXCLUDED.expiry_date, public.inventory_batches.expiry_date),
        unit_cost = EXCLUDED.unit_cost, updated_by = auth.uid()
      WHERE (EXCLUDED.expiry_date IS NULL OR public.inventory_batches.expiry_date IS NOT DISTINCT FROM EXCLUDED.expiry_date)
        AND public.inventory_batches.unit_cost = EXCLUDED.unit_cost;
      IF NOT FOUND THEN RAISE EXCEPTION 'Batch number already exists with a different expiry date or cost.'; END IF;
    END IF;
    UPDATE public.inventory_purchase_request_lines
    SET received_quantity = received_quantity + _received,
        rejected_quantity = rejected_quantity + _rejected,
        rejection_reason = CASE WHEN _rejected > 0 THEN btrim(_input->>'rejection_reason') ELSE rejection_reason END,
        last_receipt_date = _receipt_date
    WHERE id = _line.id;
  END LOOP;

  SELECT bool_and(received_quantity + rejected_quantity >= quantity), bool_or(received_quantity > 0)
  INTO _all_processed, _any_received FROM public.inventory_purchase_request_lines WHERE purchase_request_id = _request_id;
  UPDATE public.inventory_purchase_requests
  SET status = CASE WHEN _all_processed THEN CASE WHEN _any_received THEN 'approved' ELSE 'rejected' END ELSE 'purchased_pending_receipt' END,
      reviewed_by = CASE WHEN _all_processed THEN auth.uid() ELSE reviewed_by END,
      reviewed_at = CASE WHEN _all_processed THEN now() ELSE reviewed_at END,
      partial_receipt_notes = trim(partial_receipt_notes || E'\n' || COALESCE(_notes, '')),
      notes = trim(notes || E'\n' || 'استلام جزئي بواسطة ' || btrim(_received_by) || ' في ' || _receipt_date::text)
  WHERE id = _request_id;
  IF _all_processed THEN UPDATE public.inventory_notifications SET is_read = true WHERE reference_id = _request_id; END IF;
  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
  VALUES (_request.brand_id, 'purchase_receipt_updated', 'تم تحديث استلام مشتريات',
    'تم تسجيل الكميات المقبولة والمرفوضة لأمر الشراء ' || _request.request_no || '.', _request_id, 'inventory');
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_update_item(uuid, uuid, text, text, text, text, text, numeric, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_set_item_status(uuid, uuid, public.erp_item_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_review_count(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_record_manual_movement(uuid, uuid, public.inventory_movement_type, numeric, numeric, text, text, text, date) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.inventory_apply_movement(uuid, uuid, public.inventory_movement_type, numeric, numeric, text, text, text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_update_item(uuid, uuid, text, text, text, text, text, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_set_item_status(uuid, uuid, public.erp_item_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_review_count(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_record_manual_movement(uuid, uuid, public.inventory_movement_type, numeric, numeric, text, text, text, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
