ALTER TABLE public.inventory_purchase_requests
  ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN invoice_number text NOT NULL DEFAULT '',
  ADD COLUMN invoice_date date,
  ADD COLUMN due_date date,
  ADD COLUMN subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  ADD COLUMN tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  ADD COLUMN discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN total_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  ADD COLUMN paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  ADD COLUMN payment_method text CHECK (payment_method IN ('cash', 'bank_transfer', 'credit')),
  ADD COLUMN payment_status text CHECK (payment_status IN ('paid', 'partial', 'unpaid')),
  ADD COLUMN invoice_storage_path text NOT NULL DEFAULT '',
  ADD COLUMN partial_receipt_notes text NOT NULL DEFAULT '';

ALTER TABLE public.inventory_purchase_request_lines
  ADD COLUMN received_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  ADD COLUMN rejected_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  ADD COLUMN rejection_reason text NOT NULL DEFAULT '',
  ADD COLUMN last_receipt_date date;

ALTER TABLE public.supplier_invoices
  ADD COLUMN purchase_request_id uuid REFERENCES public.inventory_purchase_requests(id) ON DELETE SET NULL,
  ADD COLUMN invoice_storage_path text NOT NULL DEFAULT '';

ALTER TABLE public.supplier_invoices
  DROP CONSTRAINT IF EXISTS supplier_invoices_invoice_number_key;

CREATE UNIQUE INDEX supplier_invoices_brand_supplier_invoice_uidx
  ON public.supplier_invoices (brand_id, supplier_id, invoice_number)
  WHERE invoice_number <> '';

CREATE UNIQUE INDEX supplier_invoices_purchase_request_uidx
  ON public.supplier_invoices (purchase_request_id)
  WHERE purchase_request_id IS NOT NULL;

CREATE UNIQUE INDEX inventory_purchase_request_invoice_uidx
  ON public.inventory_purchase_requests (brand_id, supplier_id, invoice_number)
  WHERE supplier_id IS NOT NULL AND invoice_number <> '';

CREATE INDEX inventory_purchase_request_lines_request_idx
  ON public.inventory_purchase_request_lines (purchase_request_id, created_at);

DROP POLICY IF EXISTS "Users can manage suppliers for accessible brands" ON public.suppliers;
CREATE POLICY "Users can manage suppliers for accessible brands"
  ON public.suppliers FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND (public.can_manage_inventory() OR public.has_page_permission(auth.uid(), 'purchases')))
  WITH CHECK (public.can_access_brand(brand_id) AND (public.can_manage_inventory() OR public.has_page_permission(auth.uid(), 'purchases')));

DROP POLICY IF EXISTS "Users can manage supplier item prices" ON public.supplier_item_prices;
CREATE POLICY "Users can manage supplier item prices"
  ON public.supplier_item_prices FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND (public.can_manage_inventory() OR public.has_page_permission(auth.uid(), 'purchases')))
  WITH CHECK (public.can_access_brand(brand_id) AND (public.can_manage_inventory() OR public.has_page_permission(auth.uid(), 'purchases')));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('supplier-invoices', 'supplier-invoices', false, 12582912, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Accessible brands can read supplier invoices" ON storage.objects;
CREATE POLICY "Accessible brands can read supplier invoices"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'supplier-invoices'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_access_brand(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS "Procurement users upload supplier invoices" ON storage.objects;
CREATE POLICY "Procurement users upload supplier invoices"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'supplier-invoices'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_access_brand(((storage.foldername(name))[1])::uuid)
        AND (public.can_manage_inventory() OR public.has_page_permission(auth.uid(), 'purchases'))
      ELSE false
    END
  );

DROP POLICY IF EXISTS "Procurement users delete supplier invoices" ON storage.objects;
CREATE POLICY "Procurement users delete supplier invoices"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'supplier-invoices'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_access_brand(((storage.foldername(name))[1])::uuid)
        AND (public.can_manage_inventory() OR public.has_page_permission(auth.uid(), 'purchases'))
      ELSE false
    END
  );

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
  _factor numeric(14,4);
  _new_on_hand numeric(14,3);
  _effective_cost numeric(14,2);
  _new_avg_cost numeric(14,2);
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  SELECT * INTO _item FROM public.items_master WHERE id = _item_id AND brand_id = _brand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item was not found for this brand.';
  END IF;
  _factor := COALESCE(_item.conversion_factor, 1);
  IF _factor <= 0 THEN
    RAISE EXCEPTION 'Item purchase conversion factor must be greater than zero.';
  END IF;

  INSERT INTO public.inventory_balances (brand_id, item_id, location_name, on_hand, created_by, updated_by)
  VALUES (_brand_id, _item_id, COALESCE(NULLIF(btrim(_location_name), ''), 'main'), 0, auth.uid(), auth.uid())
  ON CONFLICT (brand_id, item_id, location_name) DO NOTHING;

  SELECT * INTO _balance FROM public.inventory_balances
  WHERE brand_id = _brand_id AND item_id = _item_id AND location_name = COALESCE(NULLIF(btrim(_location_name), ''), 'main')
  FOR UPDATE;

  _is_inbound := _movement_type IN ('purchase_receipt', 'customer_return', 'production_output');
  _effective_cost := COALESCE(_unit_cost, _item.avg_cost, _item.last_purchase_price / _factor, 0);

  IF _is_inbound THEN
    _new_on_hand := _balance.on_hand + _quantity;
    IF _movement_type = 'purchase_receipt' AND _new_on_hand > 0 THEN
      _new_avg_cost := ROUND(((_balance.on_hand * _item.avg_cost) + (_quantity * _effective_cost)) / _new_on_hand, 2);
      UPDATE public.items_master
      SET last_purchase_price = ROUND(_effective_cost * _factor, 2),
          avg_cost = _new_avg_cost,
          updated_by = auth.uid()
      WHERE id = _item_id;
    END IF;
  ELSE
    IF _balance.on_hand < _quantity THEN
      RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %.', _balance.on_hand, _quantity;
    END IF;
    _new_on_hand := _balance.on_hand - _quantity;
    _effective_cost := COALESCE(_item.avg_cost, _item.last_purchase_price / _factor, _effective_cost, 0);
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
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
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
  VALUES (_brand_id, _item_id, COALESCE(NULLIF(btrim(_location_name), ''), 'main'),
    COALESCE(_opening_quantity, 0), auth.uid(), auth.uid());

  IF _opening_quantity > 0 THEN
    INSERT INTO public.inventory_movements (
      brand_id, item_id, movement_type, quantity, unit_cost, reference_table, reference_id,
      location_name, notes, created_by
    ) VALUES (
      _brand_id, _item_id, 'adjustment', _opening_quantity, _opening_unit_cost, 'items_master', _item_id::text,
      COALESCE(NULLIF(btrim(_location_name), ''), 'main'), 'رصيد افتتاحي', auth.uid()
    );
  END IF;

  RETURN _item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_save_procurement_invoice(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request public.inventory_purchase_requests%ROWTYPE;
  _invoice_id uuid;
BEGIN
  SELECT * INTO _request
  FROM public.inventory_purchase_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND OR _request.supplier_id IS NULL OR btrim(_request.invoice_number) = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.supplier_invoices (
    brand_id, supplier_id, purchase_request_id, invoice_number, status, invoice_date, due_date,
    subtotal, tax_amount, discount_amount, total_amount, paid_amount, invoice_storage_path, notes,
    created_by, updated_by
  ) VALUES (
    _request.brand_id, _request.supplier_id, _request.id, btrim(_request.invoice_number),
    CASE WHEN _request.paid_amount >= _request.total_amount THEN 'paid'::public.invoice_status
         WHEN _request.paid_amount > 0 THEN 'partially_paid'::public.invoice_status
         ELSE 'issued'::public.invoice_status END,
    COALESCE(_request.invoice_date, CURRENT_DATE), _request.due_date, _request.subtotal,
    _request.tax_amount, _request.discount_amount, _request.total_amount, _request.paid_amount,
    _request.invoice_storage_path, _request.notes, auth.uid(), auth.uid()
  )
  ON CONFLICT (purchase_request_id) WHERE purchase_request_id IS NOT NULL
  DO UPDATE SET
    supplier_id = EXCLUDED.supplier_id,
    invoice_number = EXCLUDED.invoice_number,
    status = EXCLUDED.status,
    invoice_date = EXCLUDED.invoice_date,
    due_date = EXCLUDED.due_date,
    subtotal = EXCLUDED.subtotal,
    tax_amount = EXCLUDED.tax_amount,
    discount_amount = EXCLUDED.discount_amount,
    total_amount = EXCLUDED.total_amount,
    paid_amount = EXCLUDED.paid_amount,
    invoice_storage_path = EXCLUDED.invoice_storage_path,
    notes = EXCLUDED.notes,
    updated_by = auth.uid()
  RETURNING id INTO _invoice_id;

  DELETE FROM public.supplier_invoice_items WHERE supplier_invoice_id = _invoice_id;
  INSERT INTO public.supplier_invoice_items (supplier_invoice_id, item_id, quantity, unit_cost, line_total, notes)
  SELECT _invoice_id, item_id, quantity, unit_cost, ROUND(quantity * unit_cost, 2), COALESCE(notes, '')
  FROM public.inventory_purchase_request_lines
  WHERE purchase_request_id = _request.id;

  IF _request.paid_amount > 0 AND NOT EXISTS (
    SELECT 1 FROM public.supplier_payments
    WHERE supplier_invoice_id = _invoice_id AND notes = 'procurement-payment:' || _request.id::text
  ) THEN
    INSERT INTO public.supplier_payments (
      brand_id, supplier_invoice_id, payment_date, amount, payment_method, reference_no, notes, created_by
    ) VALUES (
      _request.brand_id, _invoice_id, CURRENT_DATE, _request.paid_amount,
      COALESCE(_request.payment_method, 'cash'), 'PUR-' || _request.id::text,
      'procurement-payment:' || _request.id::text, auth.uid()
    );
  END IF;
END;
$$;

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
  PERFORM public.inventory_require_purchase_requester(_brand_id);
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
  INSERT INTO public.inventory_purchase_requests (brand_id, supplier_id, request_no, supplier_name, requested_by, notes)
  VALUES (_brand_id, _supplier_id, _request_no, COALESCE(_supplier_name, ''), auth.uid(), COALESCE(_notes, ''))
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
  VALUES (_brand_id, 'purchase_pending_procurement', 'أمر شراء جديد لمسؤول المشتريات',
    'أمر الشراء ' || _request_no || ' بانتظار تنفيذ الشراء وتسجيل الكميات والأسعار الفعلية.', _request_id, 'purchases');
  RETURN _request_id;
END;
$$;

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
  _invoice_storage_path text DEFAULT ''
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
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;
  IF NOT public.can_access_brand(_request.brand_id)
    OR NOT (public.has_role(auth.uid(), 'owner') OR public.has_page_permission(auth.uid(), 'purchases')) THEN
    RAISE EXCEPTION 'You do not have permission to execute purchases.';
  END IF;
  IF _request.status <> 'pending_procurement' THEN
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
  IF COALESCE(_paid_amount, 0) > _total THEN RAISE EXCEPTION 'Paid amount cannot exceed the invoice total.'; END IF;

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
      paid_amount = COALESCE(_paid_amount, 0),
      payment_method = _payment_method,
      payment_status = CASE WHEN _paid_amount >= _total THEN 'paid'
                            WHEN _paid_amount > 0 THEN 'partial' ELSE 'unpaid' END,
      invoice_storage_path = COALESCE(_invoice_storage_path, ''),
      notes = trim(notes || E'\n' || COALESCE(_notes, ''))
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
  WHERE reference_id = _request_id AND notification_type = 'purchase_pending_procurement';
  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
  VALUES (_request.brand_id, 'purchase_waiting_receipt', 'شراء تم تنفيذه بانتظار الاستلام',
    'تم تنفيذ أمر الشراء ' || _request.request_no || '. راجع الاستلام لإضافة الكميات للمخزون.', _request_id, 'inventory');
  PERFORM public.inventory_save_procurement_invoice(_request_id);
END;
$$;

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
  _invoice_storage_path text DEFAULT ''
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
BEGIN
  IF NOT public.can_access_brand(_brand_id)
    OR NOT (public.has_role(auth.uid(), 'owner') OR public.has_page_permission(auth.uid(), 'purchases')) THEN
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
  IF COALESCE(_paid_amount, 0) > _total THEN RAISE EXCEPTION 'Paid amount cannot exceed the invoice total.'; END IF;
  UPDATE public.inventory_purchase_requests
  SET subtotal = _subtotal, total_amount = _total,
      paid_amount = COALESCE(_paid_amount, 0),
      payment_status = CASE WHEN _paid_amount >= _total THEN 'paid'
                            WHEN _paid_amount > 0 THEN 'partial' ELSE 'unpaid' END
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

  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
  VALUES (_brand_id, 'purchase_waiting_receipt', 'شراء مباشر بانتظار الاستلام',
    'تم تسجيل شراء مباشر من قسم المشتريات بواسطة ' || btrim(_purchaser_name) || '.', _request_id, 'inventory');
  PERFORM public.inventory_save_procurement_invoice(_request_id);
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
    COALESCE(_request.payment_method, 'cash'), _request.invoice_storage_path
  );
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
    _brand_id, _supplier_id, _supplier_name, _purchaser_name, _lines, _notes
  );
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
  _input jsonb;
  _received numeric(14,3);
  _rejected numeric(14,3);
  _factor numeric(14,4);
  _batch_no text;
  _all_processed boolean;
  _any_received boolean;
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;
  PERFORM public.inventory_require_manager(_request.brand_id);
  IF _request.status <> 'purchased_pending_receipt' THEN
    RAISE EXCEPTION 'This purchase is not awaiting warehouse receipt.';
  END IF;
  IF btrim(COALESCE(_received_by, '')) = '' OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Receiver name and at least one receipt line are required.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_lines) AS entry
    GROUP BY entry->>'line_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Each receipt line may appear only once.';
  END IF;

  FOR _input IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO _line
    FROM public.inventory_purchase_request_lines
    WHERE id = (_input->>'line_id')::uuid AND purchase_request_id = _request_id
    FOR UPDATE;
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
      WHERE id = _line.item_id AND brand_id = _request.brand_id AND status = 'active'
      FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Receipt item does not belong to this brand.'; END IF;
      _factor := COALESCE(_item.conversion_factor, 1);
      IF _factor <= 0 THEN RAISE EXCEPTION 'Item purchase conversion factor must be greater than zero.'; END IF;
      _batch_no := COALESCE(NULLIF(btrim(_input->>'batch_no'), ''),
        'RCV-' || substr(_request_id::text, 1, 8) || '-' || substr(_line.id::text, 1, 8) || '-' || substr(gen_random_uuid()::text, 1, 8));
      PERFORM public.inventory_apply_movement(
        _request.brand_id, _line.item_id, 'purchase_receipt', _received * _factor,
        ROUND(_line.unit_cost / _factor, 2),
        COALESCE(NULLIF(_input->>'location_name', ''), _line.location_name),
        COALESCE(NULLIF(_input->>'notes', ''), 'استلام فاتورة شراء'), 'inventory_purchase_requests', _request_id::text
      );
      UPDATE public.items_master
      SET last_purchase_price = _line.unit_cost, updated_by = auth.uid()
      WHERE id = _line.item_id AND brand_id = _request.brand_id;
      INSERT INTO public.inventory_batches (
        brand_id, warehouse_id, item_id, batch_no, expiry_date, quantity_on_hand, unit_cost, notes, created_by, updated_by
      )
      SELECT _request.brand_id, warehouse.id, _line.item_id, _batch_no,
        NULLIF(_input->>'expiry_date', '')::date, _received * _factor,
        ROUND(_line.unit_cost / _factor, 2), COALESCE(_input->>'notes', ''), auth.uid(), auth.uid()
      FROM public.warehouses AS warehouse
      WHERE warehouse.brand_id = _request.brand_id AND warehouse.warehouse_code = 'MAIN'
      LIMIT 1
      ON CONFLICT (warehouse_id, item_id, batch_no)
      DO UPDATE SET
        quantity_on_hand = public.inventory_batches.quantity_on_hand + EXCLUDED.quantity_on_hand,
        expiry_date = COALESCE(EXCLUDED.expiry_date, public.inventory_batches.expiry_date),
        unit_cost = EXCLUDED.unit_cost,
        updated_by = auth.uid();
      IF NOT FOUND THEN RAISE EXCEPTION 'Main warehouse was not found for this brand.'; END IF;
    END IF;

    UPDATE public.inventory_purchase_request_lines
    SET received_quantity = received_quantity + _received,
        rejected_quantity = rejected_quantity + _rejected,
        rejection_reason = CASE WHEN _rejected > 0 THEN btrim(_input->>'rejection_reason') ELSE rejection_reason END,
        last_receipt_date = _receipt_date
    WHERE id = _line.id;
  END LOOP;

  SELECT bool_and(received_quantity + rejected_quantity >= quantity),
         bool_or(received_quantity > 0)
  INTO _all_processed, _any_received
  FROM public.inventory_purchase_request_lines WHERE purchase_request_id = _request_id;

  UPDATE public.inventory_purchase_requests
  SET status = CASE WHEN _all_processed THEN CASE WHEN _any_received THEN 'approved' ELSE 'rejected' END
                    ELSE 'purchased_pending_receipt' END,
      reviewed_by = CASE WHEN _all_processed THEN auth.uid() ELSE reviewed_by END,
      reviewed_at = CASE WHEN _all_processed THEN now() ELSE reviewed_at END,
      partial_receipt_notes = trim(partial_receipt_notes || E'\n' || COALESCE(_notes, '')),
      notes = trim(notes || E'\n' || 'استلام جزئي بواسطة ' || btrim(_received_by) || ' في ' || _receipt_date::text)
  WHERE id = _request_id;
  IF _all_processed THEN
    UPDATE public.inventory_notifications SET is_read = true WHERE reference_id = _request_id;
  END IF;

  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
  VALUES (_request.brand_id, 'purchase_receipt_updated', 'تم تحديث استلام مشتريات',
    'تم تسجيل الكميات المقبولة والمرفوضة لأمر الشراء ' || _request.request_no || '.', _request_id, 'inventory');
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
  _lines jsonb;
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;
  PERFORM public.inventory_require_manager(_request.brand_id);
  IF _request.status <> 'purchased_pending_receipt' THEN
    RAISE EXCEPTION 'This purchase is not awaiting warehouse receipt.';
  END IF;
  IF NOT _approve THEN
    UPDATE public.inventory_purchase_requests
    SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
        notes = trim(notes || E'\n' || COALESCE(_review_notes, ''))
    WHERE id = _request_id;
    RETURN;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'line_id', id,
    'received_quantity', quantity - received_quantity - rejected_quantity,
    'rejected_quantity', 0,
    'location_name', location_name,
    'notes', _review_notes
  ))
  INTO _lines
  FROM public.inventory_purchase_request_lines
  WHERE purchase_request_id = _request_id
    AND received_quantity + rejected_quantity < quantity;

  IF COALESCE(jsonb_array_length(_lines), 0) = 0 THEN
    RAISE EXCEPTION 'No remaining purchase quantity to receive.';
  END IF;
  PERFORM public.inventory_receive_purchase_request_v2(
    _request_id, _lines, COALESCE(NULLIF(btrim(_review_notes), ''), 'مدير المخزن'), CURRENT_DATE, _review_notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_record_supplier_payment(
  _invoice_id uuid,
  _amount numeric,
  _payment_method text,
  _payment_date date DEFAULT CURRENT_DATE,
  _reference_no text DEFAULT '',
  _notes text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invoice public.supplier_invoices%ROWTYPE;
BEGIN
  SELECT * INTO _invoice FROM public.supplier_invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier invoice not found.'; END IF;
  IF NOT public.can_access_brand(_invoice.brand_id)
    OR NOT (public.can_manage_inventory() OR public.has_page_permission(auth.uid(), 'purchases')) THEN
    RAISE EXCEPTION 'You do not have permission to record supplier payments.';
  END IF;
  IF _amount <= 0 OR _amount > _invoice.total_amount - _invoice.paid_amount
    OR _payment_method NOT IN ('cash', 'bank_transfer', 'credit') THEN
    RAISE EXCEPTION 'Payment amount or method is invalid.';
  END IF;

  INSERT INTO public.supplier_payments (
    brand_id, supplier_invoice_id, payment_date, amount, payment_method, reference_no, notes, created_by
  ) VALUES (_invoice.brand_id, _invoice_id, _payment_date, _amount, _payment_method, COALESCE(_reference_no, ''), COALESCE(_notes, ''), auth.uid());
  UPDATE public.supplier_invoices
  SET paid_amount = paid_amount + _amount,
      status = CASE WHEN paid_amount + _amount >= total_amount THEN 'paid'::public.invoice_status
                    ELSE 'partially_paid'::public.invoice_status END,
      updated_by = auth.uid()
  WHERE id = _invoice_id;
  IF _invoice.purchase_request_id IS NOT NULL THEN
    UPDATE public.inventory_purchase_requests
    SET paid_amount = paid_amount + _amount,
        payment_status = CASE WHEN paid_amount + _amount >= total_amount THEN 'paid' ELSE 'partial' END
    WHERE id = _invoice.purchase_request_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_save_procurement_invoice(uuid),
  public.inventory_create_item_v2(uuid, text, text, text, text, text, numeric, numeric, text, numeric, numeric, text),
  public.inventory_complete_procurement_purchase(uuid, text, jsonb, text),
  public.inventory_submit_purchase_request_v2(uuid, uuid, text, jsonb, text),
  public.inventory_complete_procurement_purchase_v2(uuid, uuid, text, text, jsonb, text, text, date, date, numeric, numeric, numeric, text, text),
  public.inventory_record_procurement_direct_purchase_v2(uuid, uuid, text, text, jsonb, text, text, date, date, numeric, numeric, numeric, text, text),
  public.inventory_receive_purchase_request_v2(uuid, jsonb, text, date, text),
  public.inventory_review_purchase_request(uuid, boolean, text),
  public.inventory_record_supplier_payment(uuid, numeric, text, date, text, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.inventory_submit_purchase_request_v2(uuid, uuid, text, jsonb, text),
  public.inventory_create_item_v2(uuid, text, text, text, text, text, numeric, numeric, text, numeric, numeric, text),
  public.inventory_submit_purchase_request(uuid, text, jsonb, text),
  public.inventory_complete_procurement_purchase(uuid, text, text, jsonb, text),
  public.inventory_record_procurement_direct_purchase(uuid, text, text, jsonb, text),
  public.inventory_complete_procurement_purchase_v2(uuid, uuid, text, text, jsonb, text, text, date, date, numeric, numeric, numeric, text, text),
  public.inventory_record_procurement_direct_purchase_v2(uuid, uuid, text, text, jsonb, text, text, date, date, numeric, numeric, numeric, text, text),
  public.inventory_receive_purchase_request_v2(uuid, jsonb, text, date, text),
  public.inventory_review_purchase_request(uuid, boolean, text),
  public.inventory_record_supplier_payment(uuid, numeric, text, date, text, text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
