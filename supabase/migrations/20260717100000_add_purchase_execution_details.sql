-- Preserve who executed a real purchase and whether it was performed by procurement or directly by the store manager.
ALTER TABLE public.inventory_purchase_requests
  ADD COLUMN purchaser_name text NOT NULL DEFAULT '',
  ADD COLUMN execution_source text NOT NULL DEFAULT 'procurement' CHECK (execution_source IN ('procurement', 'store_manager')),
  ADD COLUMN purchased_at timestamptz;

CREATE OR REPLACE FUNCTION public.inventory_complete_procurement_purchase(_request_id uuid, _supplier_name text, _purchaser_name text, _lines jsonb, _notes text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _request public.inventory_purchase_requests%ROWTYPE; _line jsonb;
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;
  IF NOT public.can_access_brand(_request.brand_id) OR NOT public.has_page_permission(auth.uid(), 'purchases') THEN RAISE EXCEPTION 'You do not have permission to execute purchases.'; END IF;
  IF _request.status <> 'pending_procurement' THEN RAISE EXCEPTION 'This purchase request is not awaiting procurement.'; END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'Add the purchased quantities and prices.'; END IF;
  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    IF COALESCE((_line->>'quantity')::numeric, 0) <= 0 OR COALESCE((_line->>'unit_cost')::numeric, -1) < 0 THEN RAISE EXCEPTION 'Actual quantity and unit price are required.'; END IF;
    UPDATE public.inventory_purchase_request_lines SET quantity = (_line->>'quantity')::numeric, unit_cost = (_line->>'unit_cost')::numeric, batch_no = COALESCE(_line->>'batch_no', batch_no), expiry_date = COALESCE(NULLIF(_line->>'expiry_date', '')::date, expiry_date) WHERE id = (_line->>'line_id')::uuid AND purchase_request_id = _request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase line was not found.'; END IF;
  END LOOP;
  UPDATE public.inventory_purchase_requests SET supplier_name = COALESCE(_supplier_name, ''), purchaser_name = COALESCE(_purchaser_name, ''), execution_source = 'procurement', purchased_at = now(), status = 'purchased_pending_receipt', notes = trim(notes || E'\n' || COALESCE(_notes, '')) WHERE id = _request_id;
  UPDATE public.inventory_notifications SET is_read = true WHERE reference_id = _request_id AND notification_type = 'purchase_pending_procurement';
  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page) VALUES (_request.brand_id, 'purchase_waiting_receipt', 'شراء تم تنفيذه بانتظار الاستلام', 'تم تنفيذ أمر الشراء ' || _request.request_no || '. راجع الاستلام لإضافة الكميات للمخزون.', _request_id, 'inventory');
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_record_store_purchase(_brand_id uuid, _supplier_name text, _purchaser_name text, _lines jsonb, _notes text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _request_id uuid; _request_no text; _line jsonb;
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'Add at least one purchase line.'; END IF;
  _request_no := 'DIR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);
  INSERT INTO public.inventory_purchase_requests (brand_id, request_no, supplier_name, status, requested_by, purchaser_name, execution_source, purchased_at, notes)
  VALUES (_brand_id, _request_no, COALESCE(_supplier_name, ''), 'purchased_pending_receipt', auth.uid(), COALESCE(_purchaser_name, ''), 'store_manager', now(), COALESCE(_notes, 'شراء مباشر سجله مدير المخزن')) RETURNING id INTO _request_id;
  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    INSERT INTO public.inventory_purchase_request_lines (purchase_request_id, item_id, quantity, unit_cost, location_name, notes, batch_no, expiry_date)
    VALUES (_request_id, (_line->>'item_id')::uuid, (_line->>'quantity')::numeric, COALESCE((_line->>'unit_cost')::numeric, 0), COALESCE(NULLIF(_line->>'location_name', ''), 'main'), COALESCE(_line->>'notes', ''), COALESCE(_line->>'batch_no', ''), NULLIF(_line->>'expiry_date', '')::date);
  END LOOP;
  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page) VALUES (_brand_id, 'store_purchase_waiting_receipt', 'شراء مباشر بانتظار الاستلام', 'سجل مدير المخزن شراءً مباشرًا باسم المشتري: ' || COALESCE(NULLIF(btrim(_purchaser_name), ''), 'غير محدد') || '.', _request_id, 'inventory');
  RETURN _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_complete_procurement_purchase(uuid, text, text, jsonb, text), public.inventory_record_store_purchase(uuid, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_complete_procurement_purchase(uuid, text, text, jsonb, text), public.inventory_record_store_purchase(uuid, text, text, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.inventory_record_procurement_direct_purchase(_brand_id uuid, _supplier_name text, _purchaser_name text, _lines jsonb, _notes text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _request_id uuid; _request_no text; _line jsonb;
BEGIN
  IF NOT public.can_access_brand(_brand_id) OR NOT public.has_page_permission(auth.uid(), 'purchases') THEN RAISE EXCEPTION 'You do not have permission to record direct purchases.'; END IF;
  IF btrim(COALESCE(_purchaser_name, '')) = '' OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'Purchaser name and at least one line are required.'; END IF;
  _request_no := 'DIR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);
  INSERT INTO public.inventory_purchase_requests (brand_id, request_no, supplier_name, status, requested_by, purchaser_name, execution_source, purchased_at, notes)
  VALUES (_brand_id, _request_no, COALESCE(_supplier_name, ''), 'purchased_pending_receipt', auth.uid(), btrim(_purchaser_name), 'procurement', now(), COALESCE(_notes, 'شراء مباشر')) RETURNING id INTO _request_id;
  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    IF COALESCE((_line->>'quantity')::numeric, 0) <= 0 OR COALESCE((_line->>'unit_cost')::numeric, -1) < 0 THEN RAISE EXCEPTION 'Actual quantity and cost must be valid.'; END IF;
    INSERT INTO public.inventory_purchase_request_lines (purchase_request_id, item_id, quantity, unit_cost, location_name, notes, batch_no, expiry_date)
    VALUES (_request_id, (_line->>'item_id')::uuid, (_line->>'quantity')::numeric, (_line->>'unit_cost')::numeric, COALESCE(NULLIF(_line->>'location_name', ''), 'main'), COALESCE(_line->>'notes', ''), COALESCE(_line->>'batch_no', ''), NULLIF(_line->>'expiry_date', '')::date);
  END LOOP;
  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
  VALUES (_brand_id, 'purchase_waiting_receipt', 'شراء مباشر بانتظار الاستلام', 'تم تسجيل شراء مباشر من قسم المشتريات بواسطة ' || btrim(_purchaser_name) || '. راجع الاستلام لإضافته للمخزون.', _request_id, 'inventory');
  RETURN _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_record_procurement_direct_purchase(uuid, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_record_procurement_direct_purchase(uuid, text, text, jsonb, text) TO authenticated;
