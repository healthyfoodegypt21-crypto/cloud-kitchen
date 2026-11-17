-- =============================================================================
-- Permanent Fix: Auto-Receive Direct & Executed Purchases into Inventory Stock,
-- Fix Purchase Request Initial Status, Normalize Categories, and Backfill
-- Pending Direct Purchases that Left Available Stock at 0.
-- =============================================================================

-- 1. Seed 'other' category in inventory_categories and normalize singular category codes
INSERT INTO public.inventory_categories (code, name_ar, name_en, sort_order, is_active)
VALUES ('other', 'أخرى', 'Other', 999, true)
ON CONFLICT (code) DO UPDATE
SET name_ar = EXCLUDED.name_ar,
    is_active = true;

UPDATE public.items_master
SET category = CASE category
  WHEN 'protein' THEN 'proteins'
  WHEN 'vegetable' THEN 'vegetables'
  WHEN 'carbohydrate' THEN 'carbohydrates'
  WHEN 'sauce' THEN 'sauces'
  WHEN 'beverage' THEN 'beverages'
  WHEN 'finished_product' THEN 'finished_products'
  ELSE category
END
WHERE category IN ('protein', 'vegetable', 'carbohydrate', 'sauce', 'beverage', 'finished_product');

-- 2. Ensure shared inventory hub is accessible to both 'inventory' and 'purchases' page permissions
CREATE OR REPLACE FUNCTION public.can_access_shared_inventory_hub(_hub_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'owner')
    OR (
      (
        public.has_page_permission(auth.uid(), 'inventory')
        OR public.has_page_permission(auth.uid(), 'purchases')
      )
      AND EXISTS (
        SELECT 1
        FROM public.inventory_hub_brands AS membership
        WHERE membership.hub_id = _hub_id
          AND public.can_access_brand(membership.brand_id)
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_operate_procurement_or_inventory(_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'owner')
    OR (
      (
        public.can_manage_inventory()
        OR public.has_page_permission(auth.uid(), 'purchases')
      )
      AND (
        public.can_access_brand(_brand_id)
        OR EXISTS (
          SELECT 1
          FROM public.inventory_hubs AS hub
          JOIN public.inventory_hub_brands AS membership ON membership.hub_id = hub.id
          WHERE hub.is_default
            AND (hub.stock_brand_id = _brand_id OR membership.brand_id = _brand_id)
            AND public.can_access_shared_inventory_hub(hub.id)
        )
      )
    )
$$;

-- 3. Ensure new purchase requests default to 'pending_procurement' (not legacy 'pending_store_approval')
ALTER TABLE public.inventory_purchase_requests
  ALTER COLUMN status SET DEFAULT 'pending_procurement'::public.inventory_purchase_request_status;

UPDATE public.inventory_purchase_requests
SET status = 'pending_procurement'::public.inventory_purchase_request_status
WHERE status = 'pending_store_approval'::public.inventory_purchase_request_status;

-- 4. Private internal receipt helper: atomically updates inventory_balances, avg_cost,
--    last_purchase_price, inventory_movements (and audit trigger), inventory_batches,
--    inventory_price_history, and purchase request / line statuses.
CREATE OR REPLACE FUNCTION public.inventory_receive_purchase_lines_internal(
  _request_id uuid,
  _lines jsonb,
  _received_by text,
  _receipt_date date DEFAULT CURRENT_DATE,
  _notes text DEFAULT '',
  _actor_id uuid DEFAULT NULL
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
  _balance public.inventory_balances%ROWTYPE;
  _input jsonb;
  _received numeric(14,3);
  _rejected numeric(14,3);
  _factor numeric(14,4);
  _qty_in_usage numeric(14,3);
  _usage_unit_cost numeric(14,2);
  _total_on_hand numeric(14,3);
  _new_avg_cost numeric(14,2);
  _batch_no text;
  _location text;
  _effective_actor uuid;
  _all_processed boolean;
  _any_received boolean;
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;
  IF _request.status <> 'purchased_pending_receipt' THEN
    RAISE EXCEPTION 'This purchase is not awaiting warehouse receipt.';
  END IF;
  IF btrim(COALESCE(_received_by, '')) = '' OR _lines IS NULL
    OR jsonb_typeof(_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Receiver name and at least one receipt line are required.';
  END IF;
  IF jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Add at least one receipt line.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_lines) AS entry
    GROUP BY entry->>'line_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Each receipt line may appear only once.';
  END IF;

  _effective_actor := COALESCE(_actor_id, auth.uid(), _request.requested_by);

  FOR _input IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO _line FROM public.inventory_purchase_request_lines
    WHERE id = (_input->>'line_id')::uuid AND purchase_request_id = _request_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Receipt line does not belong to this request.';
    END IF;

    _received := COALESCE((_input->>'received_quantity')::numeric, 0);
    _rejected := COALESCE((_input->>'rejected_quantity')::numeric, 0);
    IF _received < 0 OR _rejected < 0 OR _received + _rejected <= 0
      OR _line.received_quantity + _line.rejected_quantity + _received + _rejected > _line.quantity + 0.0001 THEN
      RAISE EXCEPTION 'Received and rejected quantities must be positive and cannot exceed the purchased quantity.';
    END IF;
    IF _rejected > 0 AND btrim(COALESCE(_input->>'rejection_reason', '')) = '' THEN
      RAISE EXCEPTION 'Add a reason for rejected quantity.';
    END IF;

    IF _received > 0 THEN
      SELECT * INTO _item FROM public.items_master
      WHERE id = _line.item_id AND brand_id = _request.brand_id AND status = 'active'
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Receipt item does not belong to this brand or is inactive.';
      END IF;

      _factor := COALESCE(_item.conversion_factor, 1);
      IF _factor <= 0 THEN
        RAISE EXCEPTION 'Item purchase conversion factor must be greater than zero.';
      END IF;

      _location := COALESCE(NULLIF(lower(btrim(_input->>'location_name')), ''), NULLIF(lower(btrim(_line.location_name)), ''), 'main');
      SELECT * INTO _warehouse FROM public.warehouses
      WHERE brand_id = _request.brand_id AND lower(warehouse_code) = _location AND status = 'active'
      ORDER BY created_at LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'An active warehouse for receipt location % was not found.', _location;
      END IF;

      _qty_in_usage := ROUND(_received * _factor, 3);
      _usage_unit_cost := ROUND(_line.unit_cost / _factor, 2);

      INSERT INTO public.inventory_balances (brand_id, item_id, location_name, on_hand, created_by, updated_by)
      VALUES (_request.brand_id, _line.item_id, _location, 0, _effective_actor, _effective_actor)
      ON CONFLICT (brand_id, item_id, location_name) DO NOTHING;

      SELECT * INTO _balance FROM public.inventory_balances
      WHERE brand_id = _request.brand_id AND item_id = _line.item_id AND location_name = _location
      FOR UPDATE;

      SELECT COALESCE(sum(on_hand), 0) INTO _total_on_hand
      FROM public.inventory_balances
      WHERE brand_id = _request.brand_id AND item_id = _line.item_id;

      _new_avg_cost := CASE
        WHEN _total_on_hand + _qty_in_usage > 0 THEN
          ROUND(((_total_on_hand * COALESCE(_item.avg_cost, 0)) + (_qty_in_usage * _usage_unit_cost)) / (_total_on_hand + _qty_in_usage), 2)
        ELSE _usage_unit_cost
      END;

      UPDATE public.items_master
      SET last_purchase_price = _line.unit_cost,
          avg_cost = CASE WHEN _new_avg_cost > 0 THEN _new_avg_cost ELSE avg_cost END,
          updated_by = _effective_actor
      WHERE id = _line.item_id AND brand_id = _request.brand_id;

      UPDATE public.inventory_balances
      SET on_hand = _balance.on_hand + _qty_in_usage,
          updated_by = _effective_actor
      WHERE id = _balance.id;

      INSERT INTO public.inventory_movements (
        brand_id, item_id, movement_type, quantity, unit_cost,
        reference_table, reference_id, location_name, notes, created_by
      ) VALUES (
        _request.brand_id, _line.item_id, 'purchase_receipt', _qty_in_usage, _usage_unit_cost,
        'inventory_purchase_requests', _request_id::text, _location,
        COALESCE(NULLIF(btrim(_input->>'notes'), ''), NULLIF(btrim(_notes), ''), 'استلام فاتورة شراء ' || _request.request_no),
        _effective_actor
      );

      _batch_no := COALESCE(
        NULLIF(btrim(_input->>'batch_no'), ''),
        'RCV-' || substr(_request_id::text, 1, 8) || '-' || substr(_line.id::text, 1, 8) || '-' || substr(gen_random_uuid()::text, 1, 8)
      );

      INSERT INTO public.inventory_batches (
        brand_id, warehouse_id, item_id, batch_no, expiry_date,
        quantity_on_hand, unit_cost, status, notes, created_by, updated_by
      ) VALUES (
        _request.brand_id, _warehouse.id, _line.item_id, _batch_no,
        NULLIF(_input->>'expiry_date', '')::date, _qty_in_usage, _usage_unit_cost,
        'available', COALESCE(_input->>'notes', ''), _effective_actor, _effective_actor
      )
      ON CONFLICT (warehouse_id, item_id, batch_no)
      DO UPDATE SET
        quantity_on_hand = public.inventory_batches.quantity_on_hand + EXCLUDED.quantity_on_hand,
        expiry_date = COALESCE(EXCLUDED.expiry_date, public.inventory_batches.expiry_date),
        unit_cost = EXCLUDED.unit_cost,
        status = 'available',
        updated_by = _effective_actor
      WHERE (EXCLUDED.expiry_date IS NULL OR public.inventory_batches.expiry_date IS NOT DISTINCT FROM EXCLUDED.expiry_date)
        AND public.inventory_batches.unit_cost = EXCLUDED.unit_cost;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch number already exists with a different expiry date or cost.';
      END IF;

      IF to_regclass('public.inventory_price_history') IS NOT NULL AND _line.unit_cost > 0 THEN
        INSERT INTO public.inventory_price_history (
          brand_id, item_id, supplier_id, supplier_name, purchase_request_id,
          unit_price, quantity, purchased_at
        ) VALUES (
          _request.brand_id, _line.item_id, _request.supplier_id, COALESCE(_request.supplier_name, ''),
          _request.id, _line.unit_cost, _received, COALESCE(_request.purchased_at, now())
        );
      END IF;
    END IF;

    UPDATE public.inventory_purchase_request_lines
    SET received_quantity = least(_line.quantity, _line.received_quantity + _received),
        rejected_quantity = _line.rejected_quantity + _rejected,
        rejection_reason = CASE WHEN _rejected > 0 THEN btrim(_input->>'rejection_reason') ELSE rejection_reason END,
        last_receipt_date = COALESCE(_receipt_date, CURRENT_DATE)
    WHERE id = _line.id;
  END LOOP;

  SELECT bool_and(received_quantity + rejected_quantity >= quantity - 0.0001),
         bool_or(received_quantity > 0)
  INTO _all_processed, _any_received
  FROM public.inventory_purchase_request_lines
  WHERE purchase_request_id = _request_id;

  UPDATE public.inventory_purchase_requests
  SET status = (
        CASE
          WHEN _all_processed THEN
            CASE WHEN _any_received THEN 'approved' ELSE 'rejected' END
          ELSE 'purchased_pending_receipt'
        END
      )::public.inventory_purchase_request_status,
      reviewed_by = CASE WHEN _all_processed THEN _effective_actor ELSE reviewed_by END,
      reviewed_at = CASE WHEN _all_processed THEN now() ELSE reviewed_at END,
      partial_receipt_notes = trim(both E'\n' FROM (COALESCE(partial_receipt_notes, '') || CASE WHEN COALESCE(_notes, '') <> '' THEN E'\n' || _notes ELSE '' END)),
      notes = trim(both E'\n' FROM (COALESCE(notes, '') || E'\n' || 'تم استلام الأصناف بالمخزن بواسطة ' || btrim(_received_by) || ' في ' || COALESCE(_receipt_date, CURRENT_DATE)::text))
  WHERE id = _request_id;

  IF _all_processed THEN
    UPDATE public.inventory_notifications
    SET is_read = true
    WHERE reference_id = _request_id;
  END IF;

  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
  VALUES (
    _request.brand_id,
    'purchase_receipt_updated',
    'تم إيداع المشتريات في المخزون',
    'تم استلام الأصناف وإضافتها للرصيد المتاح لأمر الشراء ' || _request.request_no || '.',
    _request_id,
    'inventory'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_receive_purchase_lines_internal(uuid, jsonb, text, date, text, uuid) FROM PUBLIC, anon, authenticated;

-- 5. Public Warehouse Receipt RPC (accessible to owner, inventory managers, and authorized purchasing staff)
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
  _brand_id uuid;
BEGIN
  SELECT brand_id INTO _brand_id FROM public.inventory_purchase_requests WHERE id = _request_id;
  IF _brand_id IS NULL THEN
    RAISE EXCEPTION 'Purchase request not found.';
  END IF;
  IF NOT public.can_operate_procurement_or_inventory(_brand_id) THEN
    RAISE EXCEPTION 'You do not have permission to receive purchases for this hub.';
  END IF;

  PERFORM public.inventory_receive_purchase_lines_internal(
    _request_id, _lines, _received_by, COALESCE(_receipt_date, CURRENT_DATE), COALESCE(_notes, ''), auth.uid()
  );
END;
$$;

-- 6. Fix Purchase Request Submission so status is explicitly 'pending_procurement'
CREATE OR REPLACE FUNCTION public.inventory_submit_purchase_request_v2(
  _brand_id uuid,
  _supplier_id uuid,
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
  _item public.items_master%ROWTYPE;
  _request_no text;
BEGIN
  IF NOT public.can_operate_procurement_or_inventory(_brand_id) THEN
    RAISE EXCEPTION 'You do not have permission to submit a purchase request.';
  END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Add at least one purchase line.';
  END IF;
  IF _supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = _supplier_id AND brand_id = _brand_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Supplier is unavailable for this brand.';
  END IF;

  _request_no := 'PUR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);
  INSERT INTO public.inventory_purchase_requests (
    brand_id, supplier_id, request_no, supplier_name, status, requested_by, notes
  ) VALUES (
    _brand_id, _supplier_id, _request_no, COALESCE(_supplier_name, ''),
    'pending_procurement'::public.inventory_purchase_request_status,
    auth.uid(), COALESCE(_notes, '')
  )
  RETURNING id INTO _request_id;

  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO _item
    FROM public.items_master
    WHERE id = (_line->>'item_id')::uuid AND brand_id = _brand_id AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'A requested item is not active in this brand.'; END IF;
    IF COALESCE((_line->>'quantity')::numeric, 0) <= 0
      OR COALESCE((_line->>'unit_cost')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Purchase quantity and unit price must be valid.';
    END IF;
    INSERT INTO public.inventory_purchase_request_lines (
      purchase_request_id, item_id, quantity, unit_cost, location_name, notes, batch_no, expiry_date
    ) VALUES (
      _request_id, _item.id, (_line->>'quantity')::numeric, (_line->>'unit_cost')::numeric,
      COALESCE(NULLIF(_line->>'location_name', ''), 'main'), COALESCE(_line->>'notes', ''),
      COALESCE(_line->>'batch_no', ''), NULLIF(_line->>'expiry_date', '')::date
    );
  END LOOP;

  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
  VALUES (
    _brand_id, 'purchase_pending_procurement', 'أمر شراء جديد لمسؤول المشتريات',
    'أمر الشراء ' || _request_no || ' بانتظار تنفيذ الشراء وتسجيل الكميات والأسعار الفعلية.',
    _request_id, 'purchases'
  );
  RETURN _request_id;
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
  _supplier_id uuid;
BEGIN
  SELECT id INTO _supplier_id
  FROM public.suppliers
  WHERE brand_id = _brand_id AND lower(btrim(name)) = lower(btrim(COALESCE(_supplier_name, '')))
    AND status = 'active'
  ORDER BY created_at
  LIMIT 1;
  RETURN public.inventory_submit_purchase_request_v2(
    _brand_id, _supplier_id, _supplier_name, _lines, _notes
  );
END;
$$;

-- 7. Upgrade Direct Purchase RPC so recorded invoices immediately enter Inventory Stock by default (_auto_receive = true)
DROP FUNCTION IF EXISTS public.inventory_record_procurement_direct_purchase_v2(
  uuid, uuid, text, text, jsonb, text, text, date, date, numeric, numeric, numeric, text, text
);

CREATE OR REPLACE FUNCTION public.inventory_record_procurement_direct_purchase_v2(
  _brand_id uuid,
  _supplier_id uuid,
  _supplier_name text,
  _purchaser_name text,
  _lines jsonb,
  _notes text DEFAULT '',
  _invoice_number text DEFAULT '',
  _invoice_date date DEFAULT NULL,
  _due_date date DEFAULT NULL,
  _tax_amount numeric DEFAULT 0,
  _discount_amount numeric DEFAULT 0,
  _paid_amount numeric DEFAULT 0,
  _payment_method text DEFAULT 'cash',
  _invoice_storage_path text DEFAULT '',
  _auto_receive boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_id uuid;
  _request_no text;
  _line jsonb;
  _item public.items_master%ROWTYPE;
  _subtotal numeric(14,2);
  _total numeric(14,2);
  _receive_lines jsonb;
BEGIN
  IF NOT public.can_operate_procurement_or_inventory(_brand_id) THEN
    RAISE EXCEPTION 'You do not have permission to record direct purchases.';
  END IF;
  IF btrim(COALESCE(_purchaser_name, '')) = '' OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Purchaser name and at least one line are required.';
  END IF;
  IF _supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers WHERE id = _supplier_id AND brand_id = _brand_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Supplier is unavailable for this brand.';
  END IF;
  IF COALESCE(_tax_amount, 0) < 0 OR COALESCE(_discount_amount, 0) < 0
    OR COALESCE(_paid_amount, 0) < 0 OR COALESCE(_payment_method, '') NOT IN ('cash', 'bank_transfer', 'credit') THEN
    RAISE EXCEPTION 'Invoice and payment values are invalid.';
  END IF;
  IF COALESCE(_invoice_storage_path, '') <> '' AND _invoice_storage_path NOT LIKE _brand_id::text || '/%' THEN
    RAISE EXCEPTION 'Invoice file must belong to this brand.';
  END IF;

  _request_no := 'DIR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);
  INSERT INTO public.inventory_purchase_requests (
    brand_id, supplier_id, request_no, supplier_name, status, requested_by, purchaser_name,
    execution_source, purchased_at, invoice_number, invoice_date, due_date, tax_amount,
    discount_amount, payment_method, invoice_storage_path, notes
  ) VALUES (
    _brand_id, _supplier_id, _request_no, COALESCE(_supplier_name, ''), 'purchased_pending_receipt',
    auth.uid(), btrim(_purchaser_name), 'procurement', now(), COALESCE(btrim(_invoice_number), ''),
    _invoice_date, _due_date, COALESCE(_tax_amount, 0), COALESCE(_discount_amount, 0),
    _payment_method, COALESCE(_invoice_storage_path, ''), COALESCE(_notes, 'شراء مباشر')
  ) RETURNING id INTO _request_id;

  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO _item FROM public.items_master
    WHERE id = (_line->>'item_id')::uuid AND brand_id = _brand_id AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'A purchased item is not active in this brand.'; END IF;
    IF COALESCE((_line->>'quantity')::numeric, 0) <= 0
      OR COALESCE((_line->>'unit_cost')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Purchased quantity and unit cost must be valid.';
    END IF;
    INSERT INTO public.inventory_purchase_request_lines (
      purchase_request_id, item_id, quantity, unit_cost, location_name, notes, batch_no, expiry_date
    ) VALUES (
      _request_id, _item.id, (_line->>'quantity')::numeric, (_line->>'unit_cost')::numeric,
      COALESCE(NULLIF(_line->>'location_name', ''), 'main'), COALESCE(_line->>'notes', ''),
      COALESCE(_line->>'batch_no', ''), NULLIF(_line->>'expiry_date', '')::date
    );
  END LOOP;

  SELECT ROUND(COALESCE(sum(quantity * unit_cost), 0), 2)
    INTO _subtotal FROM public.inventory_purchase_request_lines WHERE purchase_request_id = _request_id;
  _total := GREATEST(0, _subtotal + COALESCE(_tax_amount, 0) - COALESCE(_discount_amount, 0));
  IF COALESCE(_paid_amount, 0) > _total + 0.01 THEN RAISE EXCEPTION 'Paid amount cannot exceed the invoice total.'; END IF;
  UPDATE public.inventory_purchase_requests
  SET subtotal = _subtotal, total_amount = _total,
      paid_amount = LEAST(COALESCE(_paid_amount, 0), _total),
      payment_status = CASE WHEN COALESCE(_paid_amount, 0) >= _total - 0.01 THEN 'paid'
                            WHEN COALESCE(_paid_amount, 0) > 0 THEN 'partial' ELSE 'unpaid' END
  WHERE id = _request_id;

  IF _supplier_id IS NOT NULL THEN
    INSERT INTO public.supplier_item_prices (brand_id, supplier_id, item_id, last_price, lead_time_days, created_by, updated_by)
    SELECT _brand_id, _supplier_id, line.item_id,
      ROUND(SUM(line.quantity * line.unit_cost) / NULLIF(SUM(line.quantity), 0), 2),
      supplier.lead_time_days, auth.uid(), auth.uid()
    FROM public.inventory_purchase_request_lines AS line
    JOIN public.suppliers AS supplier ON supplier.id = _supplier_id
    WHERE line.purchase_request_id = _request_id
    GROUP BY line.item_id, supplier.lead_time_days
    ON CONFLICT (supplier_id, item_id, brand_id)
    DO UPDATE SET last_price = EXCLUDED.last_price, updated_by = auth.uid();
    UPDATE public.suppliers SET last_purchase_at = now(), updated_by = auth.uid() WHERE id = _supplier_id;
  END IF;

  PERFORM public.inventory_save_procurement_invoice(_request_id);

  IF COALESCE(_auto_receive, true) THEN
    SELECT jsonb_agg(jsonb_build_object(
      'line_id', id,
      'received_quantity', quantity,
      'rejected_quantity', 0,
      'location_name', location_name,
      'batch_no', batch_no,
      'expiry_date', expiry_date,
      'notes', COALESCE(NULLIF(_notes, ''), 'استلام فوري لفاتورة شراء مباشر')
    ))
    INTO _receive_lines
    FROM public.inventory_purchase_request_lines
    WHERE purchase_request_id = _request_id;

    PERFORM public.inventory_receive_purchase_lines_internal(
      _request_id,
      _receive_lines,
      btrim(_purchaser_name),
      COALESCE(_invoice_date, CURRENT_DATE),
      'إيداع تلقائي في المخزون عند تسجيل الشراء المباشر',
      auth.uid()
    );
  ELSE
    INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
    VALUES (_brand_id, 'purchase_waiting_receipt', 'شراء مباشر بانتظار الاستلام',
      'تم تسجيل شراء مباشر من قسم المشتريات بواسطة ' || btrim(_purchaser_name) || '.', _request_id, 'inventory');
  END IF;

  RETURN _request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_record_procurement_direct_purchase(
  _brand_id uuid,
  _supplier_name text,
  _purchaser_name text,
  _lines jsonb,
  _notes text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _supplier_id uuid;
BEGIN
  SELECT id INTO _supplier_id
  FROM public.suppliers
  WHERE brand_id = _brand_id AND lower(btrim(name)) = lower(btrim(COALESCE(_supplier_name, '')))
    AND status = 'active'
  ORDER BY created_at
  LIMIT 1;
  RETURN public.inventory_record_procurement_direct_purchase_v2(
    _brand_id, _supplier_id, _supplier_name, _purchaser_name, _lines, _notes,
    '', NULL, NULL, 0, 0, 0, 'cash', '', true
  );
END;
$$;

-- 8. Upgrade Purchase Order Execution RPC to also accept legacy 'pending_store_approval' and auto-receive by default
DROP FUNCTION IF EXISTS public.inventory_complete_procurement_purchase_v2(
  uuid, uuid, text, text, jsonb, text, text, date, date, numeric, numeric, numeric, text, text
);

CREATE OR REPLACE FUNCTION public.inventory_complete_procurement_purchase_v2(
  _request_id uuid,
  _supplier_id uuid,
  _supplier_name text,
  _purchaser_name text,
  _lines jsonb,
  _notes text DEFAULT '',
  _invoice_number text DEFAULT '',
  _invoice_date date DEFAULT NULL,
  _due_date date DEFAULT NULL,
  _tax_amount numeric DEFAULT 0,
  _discount_amount numeric DEFAULT 0,
  _paid_amount numeric DEFAULT 0,
  _payment_method text DEFAULT 'cash',
  _invoice_storage_path text DEFAULT '',
  _auto_receive boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request public.inventory_purchase_requests%ROWTYPE;
  _line jsonb;
  _line_count integer;
  _subtotal numeric(14,2);
  _total numeric(14,2);
  _receive_lines jsonb;
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;
  IF NOT public.can_operate_procurement_or_inventory(_request.brand_id) THEN
    RAISE EXCEPTION 'You do not have permission to execute purchases.';
  END IF;
  IF _request.status NOT IN ('pending_procurement', 'pending_store_approval') THEN
    RAISE EXCEPTION 'This purchase request is not awaiting procurement.';
  END IF;
  IF btrim(COALESCE(_purchaser_name, '')) = '' OR jsonb_typeof(_lines) <> 'array' THEN
    RAISE EXCEPTION 'Purchaser name and all purchase lines are required.';
  END IF;
  SELECT count(*) INTO _line_count FROM public.inventory_purchase_request_lines WHERE purchase_request_id = _request_id;
  IF jsonb_array_length(_lines) <> _line_count OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(_lines) AS entry
    GROUP BY entry->>'line_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Submit each purchase line exactly once.';
  END IF;
  IF _supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers WHERE id = _supplier_id AND brand_id = _request.brand_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Supplier is unavailable for this brand.';
  END IF;
  IF COALESCE(_tax_amount, 0) < 0 OR COALESCE(_discount_amount, 0) < 0
    OR COALESCE(_paid_amount, 0) < 0 OR COALESCE(_payment_method, '') NOT IN ('cash', 'bank_transfer', 'credit') THEN
    RAISE EXCEPTION 'Invoice and payment values are invalid.';
  END IF;
  IF COALESCE(_invoice_storage_path, '') <> '' AND _invoice_storage_path NOT LIKE _request.brand_id::text || '/%' THEN
    RAISE EXCEPTION 'Invoice file must belong to this brand.';
  END IF;

  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    IF COALESCE((_line->>'quantity')::numeric, 0) <= 0
      OR COALESCE((_line->>'unit_cost')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Actual quantity and unit price must be valid.';
    END IF;
    UPDATE public.inventory_purchase_request_lines AS line
    SET quantity = (_line->>'quantity')::numeric,
        unit_cost = (_line->>'unit_cost')::numeric,
        batch_no = COALESCE(_line->>'batch_no', line.batch_no),
        expiry_date = COALESCE(NULLIF(_line->>'expiry_date', '')::date, line.expiry_date)
    FROM public.items_master AS item
    WHERE line.id = (_line->>'line_id')::uuid
      AND line.purchase_request_id = _request_id
      AND item.id = line.item_id
      AND item.brand_id = _request.brand_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase line or item does not belong to this request and brand.'; END IF;
  END LOOP;

  SELECT ROUND(COALESCE(sum(quantity * unit_cost), 0), 2)
    INTO _subtotal FROM public.inventory_purchase_request_lines WHERE purchase_request_id = _request_id;
  _total := GREATEST(0, _subtotal + COALESCE(_tax_amount, 0) - COALESCE(_discount_amount, 0));
  IF COALESCE(_paid_amount, 0) > _total + 0.01 THEN RAISE EXCEPTION 'Paid amount cannot exceed the invoice total.'; END IF;

  UPDATE public.inventory_purchase_requests
  SET supplier_id = _supplier_id,
      supplier_name = COALESCE(NULLIF(btrim(_supplier_name), ''), ''),
      purchaser_name = btrim(_purchaser_name),
      execution_source = 'procurement',
      purchased_at = now(),
      status = 'purchased_pending_receipt',
      invoice_number = COALESCE(btrim(_invoice_number), ''),
      invoice_date = _invoice_date,
      due_date = _due_date,
      subtotal = _subtotal,
      tax_amount = COALESCE(_tax_amount, 0),
      discount_amount = COALESCE(_discount_amount, 0),
      total_amount = _total,
      paid_amount = LEAST(COALESCE(_paid_amount, 0), _total),
      payment_method = _payment_method,
      payment_status = CASE WHEN COALESCE(_paid_amount, 0) >= _total - 0.01 THEN 'paid'
                            WHEN COALESCE(_paid_amount, 0) > 0 THEN 'partial' ELSE 'unpaid' END,
      invoice_storage_path = COALESCE(_invoice_storage_path, ''),
      notes = trim(both E'\n' FROM (COALESCE(notes, '') || CASE WHEN COALESCE(_notes, '') <> '' THEN E'\n' || _notes ELSE '' END))
  WHERE id = _request_id;

  IF _supplier_id IS NOT NULL THEN
    INSERT INTO public.supplier_item_prices (brand_id, supplier_id, item_id, last_price, lead_time_days, created_by, updated_by)
    SELECT _request.brand_id, _supplier_id, line.item_id,
      ROUND(SUM(line.quantity * line.unit_cost) / NULLIF(SUM(line.quantity), 0), 2),
      supplier.lead_time_days, auth.uid(), auth.uid()
    FROM public.inventory_purchase_request_lines AS line
    JOIN public.suppliers AS supplier ON supplier.id = _supplier_id
    WHERE line.purchase_request_id = _request_id
    GROUP BY line.item_id, supplier.lead_time_days
    ON CONFLICT (supplier_id, item_id, brand_id)
    DO UPDATE SET last_price = EXCLUDED.last_price, updated_by = auth.uid();
    UPDATE public.suppliers SET last_purchase_at = now(), updated_by = auth.uid() WHERE id = _supplier_id;
  END IF;

  UPDATE public.inventory_notifications SET is_read = true
  WHERE reference_id = _request_id AND notification_type IN ('purchase_pending_procurement', 'purchase_pending_approval');

  PERFORM public.inventory_save_procurement_invoice(_request_id);

  IF COALESCE(_auto_receive, true) THEN
    SELECT jsonb_agg(jsonb_build_object(
      'line_id', id,
      'received_quantity', quantity - received_quantity - rejected_quantity,
      'rejected_quantity', 0,
      'location_name', location_name,
      'batch_no', batch_no,
      'expiry_date', expiry_date,
      'notes', COALESCE(NULLIF(_notes, ''), 'استلام فوري بعد تنفيذ أمر الشراء')
    ))
    INTO _receive_lines
    FROM public.inventory_purchase_request_lines
    WHERE purchase_request_id = _request_id
      AND received_quantity + rejected_quantity < quantity;

    IF COALESCE(jsonb_array_length(_receive_lines), 0) > 0 THEN
      PERFORM public.inventory_receive_purchase_lines_internal(
        _request_id,
        _receive_lines,
        btrim(_purchaser_name),
        COALESCE(_invoice_date, CURRENT_DATE),
        'إيداع تلقائي في المخزون بعد تنفيذ أمر الشراء',
        auth.uid()
      );
    END IF;
  ELSE
    INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
    VALUES (_request.brand_id, 'purchase_waiting_receipt', 'شراء تم تنفيذه بانتظار الاستلام',
      'تم تنفيذ أمر الشراء ' || _request.request_no || '. راجع الاستلام لإضافة الكميات للمخزون.', _request_id, 'inventory');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_complete_procurement_purchase(
  _request_id uuid,
  _supplier_name text,
  _purchaser_name text,
  _lines jsonb,
  _notes text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request public.inventory_purchase_requests%ROWTYPE;
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;
  PERFORM public.inventory_complete_procurement_purchase_v2(
    _request_id, _request.supplier_id, _supplier_name,
    COALESCE(NULLIF(btrim(_purchaser_name), ''), 'مسؤول المشتريات'),
    _lines, _notes, _request.invoice_number, _request.invoice_date, _request.due_date,
    _request.tax_amount, _request.discount_amount, _request.paid_amount,
    COALESCE(_request.payment_method, 'cash'), _request.invoice_storage_path, true
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.can_access_shared_inventory_hub(uuid),
  public.can_operate_procurement_or_inventory(uuid),
  public.inventory_receive_purchase_request_v2(uuid, jsonb, text, date, text),
  public.inventory_submit_purchase_request_v2(uuid, uuid, text, jsonb, text),
  public.inventory_submit_purchase_request(uuid, text, jsonb, text),
  public.inventory_record_procurement_direct_purchase_v2(uuid, uuid, text, text, jsonb, text, text, date, date, numeric, numeric, numeric, text, text, boolean),
  public.inventory_record_procurement_direct_purchase(uuid, text, text, jsonb, text),
  public.inventory_complete_procurement_purchase_v2(uuid, uuid, text, text, jsonb, text, text, date, date, numeric, numeric, numeric, text, text, boolean),
  public.inventory_complete_procurement_purchase(uuid, text, text, jsonb, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.can_access_shared_inventory_hub(uuid),
  public.can_operate_procurement_or_inventory(uuid),
  public.inventory_receive_purchase_request_v2(uuid, jsonb, text, date, text),
  public.inventory_submit_purchase_request_v2(uuid, uuid, text, jsonb, text),
  public.inventory_submit_purchase_request(uuid, text, jsonb, text),
  public.inventory_record_procurement_direct_purchase_v2(uuid, uuid, text, text, jsonb, text, text, date, date, numeric, numeric, numeric, text, text, boolean),
  public.inventory_record_procurement_direct_purchase(uuid, text, text, jsonb, text),
  public.inventory_complete_procurement_purchase_v2(uuid, uuid, text, text, jsonb, text, text, date, date, numeric, numeric, numeric, text, text, boolean),
  public.inventory_complete_procurement_purchase(uuid, text, text, jsonb, text)
TO authenticated;

-- 9. Backfill all existing unreceived direct purchases in chronological order
--    so today's and yesterday's recorded purchases immediately reflect in Inventory stock!
DO $$
DECLARE
  _req record;
  _receive_lines jsonb;
  _receipt_date date;
BEGIN
  FOR _req IN
    SELECT id, request_no, purchaser_name, requested_by, invoice_date, purchased_at, created_at
    FROM public.inventory_purchase_requests
    WHERE status = 'purchased_pending_receipt'
    ORDER BY COALESCE(purchased_at, created_at) ASC, created_at ASC
  LOOP
    SELECT jsonb_agg(jsonb_build_object(
      'line_id', id,
      'received_quantity', quantity - received_quantity - rejected_quantity,
      'rejected_quantity', 0,
      'location_name', location_name,
      'batch_no', batch_no,
      'expiry_date', expiry_date,
      'notes', 'استلام تلقائي للمشتريات المسجلة (' || _req.request_no || ')'
    ) ORDER BY created_at ASC, id ASC)
    INTO _receive_lines
    FROM public.inventory_purchase_request_lines
    WHERE purchase_request_id = _req.id
      AND received_quantity + rejected_quantity < quantity - 0.0001;

    IF COALESCE(jsonb_array_length(_receive_lines), 0) > 0 THEN
      _receipt_date := COALESCE(
        _req.invoice_date,
        (COALESCE(_req.purchased_at, _req.created_at) AT TIME ZONE 'Africa/Cairo')::date,
        CURRENT_DATE
      );
      PERFORM public.inventory_receive_purchase_lines_internal(
        _req.id,
        _receive_lines,
        COALESCE(NULLIF(btrim(_req.purchaser_name), ''), 'مسؤول المشتريات'),
        _receipt_date,
        'تسوية واستلام تلقائي للمشتريات المسجلة في المخزن المركزي',
        _req.requested_by
      );
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
