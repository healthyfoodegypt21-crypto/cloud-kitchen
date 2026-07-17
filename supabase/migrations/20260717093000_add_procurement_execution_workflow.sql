-- Purchase requests are first executed by procurement, then received by the warehouse.

UPDATE public.inventory_purchase_requests
SET status = 'pending_procurement'
WHERE status = 'pending_store_approval';

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
DECLARE _request_id uuid; _line jsonb; _request_no text;
BEGIN
  PERFORM public.inventory_require_purchase_requester(_brand_id);
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'Add at least one purchase line.'; END IF;
  _request_no := 'PUR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);
  INSERT INTO public.inventory_purchase_requests (brand_id, request_no, supplier_name, status, requested_by, notes)
  VALUES (_brand_id, _request_no, COALESCE(_supplier_name, ''), 'pending_procurement', auth.uid(), COALESCE(_notes, '')) RETURNING id INTO _request_id;
  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    IF COALESCE((_line->>'quantity')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Purchase quantities must be greater than zero.'; END IF;
    INSERT INTO public.inventory_purchase_request_lines (purchase_request_id, item_id, quantity, unit_cost, location_name, notes, batch_no, expiry_date)
    VALUES (_request_id, (_line->>'item_id')::uuid, (_line->>'quantity')::numeric, COALESCE((_line->>'unit_cost')::numeric, 0), COALESCE(NULLIF(_line->>'location_name', ''), 'main'), COALESCE(_line->>'notes', ''), COALESCE(_line->>'batch_no', ''), NULLIF(_line->>'expiry_date', '')::date);
  END LOOP;
  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
  VALUES (_brand_id, 'purchase_pending_procurement', 'أمر شراء جديد لمسؤول المشتريات', 'أمر الشراء ' || _request_no || ' بانتظار تنفيذ الشراء وتسجيل الكميات والأسعار الفعلية.', _request_id, 'purchases');
  RETURN _request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_complete_procurement_purchase(_request_id uuid, _supplier_name text, _lines jsonb, _notes text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _request public.inventory_purchase_requests%ROWTYPE; _line jsonb;
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;
  IF NOT public.can_access_brand(_request.brand_id) OR NOT public.has_page_permission(auth.uid(), 'purchases') THEN RAISE EXCEPTION 'You do not have permission to execute purchases.'; END IF;
  IF _request.status <> 'pending_procurement' THEN RAISE EXCEPTION 'This purchase request is not awaiting procurement.'; END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'Add the purchased quantities and prices.'; END IF;
  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    IF COALESCE((_line->>'quantity')::numeric, 0) <= 0 OR COALESCE((_line->>'unit_cost')::numeric, -1) < 0 THEN RAISE EXCEPTION 'Actual quantity and unit price are required.'; END IF;
    UPDATE public.inventory_purchase_request_lines
    SET quantity = (_line->>'quantity')::numeric, unit_cost = (_line->>'unit_cost')::numeric,
        batch_no = COALESCE(_line->>'batch_no', batch_no), expiry_date = COALESCE(NULLIF(_line->>'expiry_date', '')::date, expiry_date)
    WHERE id = (_line->>'line_id')::uuid AND purchase_request_id = _request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase line was not found.'; END IF;
  END LOOP;
  UPDATE public.inventory_purchase_requests SET supplier_name = COALESCE(_supplier_name, ''), status = 'purchased_pending_receipt', notes = trim(notes || E'\n' || COALESCE(_notes, '')) WHERE id = _request_id;
  UPDATE public.inventory_notifications SET is_read = true WHERE reference_id = _request_id AND notification_type = 'purchase_pending_procurement';
  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
  VALUES (_request.brand_id, 'purchase_waiting_receipt', 'شراء تم تنفيذه بانتظار الاستلام', 'تم تنفيذ أمر الشراء ' || _request.request_no || '. راجع الاستلام لإضافة الكميات للمخزون.', _request_id, 'inventory');
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_review_purchase_request(_request_id uuid, _approve boolean, _review_notes text DEFAULT '')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _request public.inventory_purchase_requests%ROWTYPE; _line public.inventory_purchase_request_lines%ROWTYPE; _warehouse_id uuid; _batch_no text;
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;
  PERFORM public.inventory_require_manager(_request.brand_id);
  IF _request.status <> 'purchased_pending_receipt' THEN RAISE EXCEPTION 'This purchase request is not awaiting warehouse receipt.'; END IF;
  IF NOT _approve THEN UPDATE public.inventory_purchase_requests SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), notes = trim(notes || E'\n' || COALESCE(_review_notes, '')) WHERE id = _request_id; RETURN; END IF;
  SELECT id INTO _warehouse_id FROM public.warehouses WHERE brand_id = _request.brand_id AND warehouse_code = 'MAIN' LIMIT 1;
  IF _warehouse_id IS NULL THEN RAISE EXCEPTION 'Main warehouse was not found for this brand.'; END IF;
  FOR _line IN SELECT * FROM public.inventory_purchase_request_lines WHERE purchase_request_id = _request_id LOOP
    PERFORM public.inventory_apply_movement(_request.brand_id, _line.item_id, 'purchase_receipt', _line.quantity, _line.unit_cost, _line.location_name, COALESCE(_line.notes, 'استلام شراء معتمد'), 'inventory_purchase_requests', _request_id::text);
    _batch_no := COALESCE(NULLIF(btrim(_line.batch_no), ''), 'PUR-' || substr(_request_id::text, 1, 8) || '-' || substr(_line.id::text, 1, 5));
    INSERT INTO public.inventory_batches (brand_id, warehouse_id, item_id, batch_no, expiry_date, quantity_on_hand, unit_cost, notes, created_by, updated_by)
    VALUES (_request.brand_id, _warehouse_id, _line.item_id, _batch_no, _line.expiry_date, _line.quantity, _line.unit_cost, COALESCE(_line.notes, ''), auth.uid(), auth.uid())
    ON CONFLICT (warehouse_id, item_id, batch_no) DO UPDATE SET quantity_on_hand = public.inventory_batches.quantity_on_hand + EXCLUDED.quantity_on_hand, expiry_date = COALESCE(EXCLUDED.expiry_date, public.inventory_batches.expiry_date), unit_cost = EXCLUDED.unit_cost, updated_by = auth.uid();
  END LOOP;
  UPDATE public.inventory_purchase_requests SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), notes = trim(notes || E'\n' || COALESCE(_review_notes, '')) WHERE id = _request_id;
  UPDATE public.inventory_notifications SET is_read = true WHERE reference_id = _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_complete_procurement_purchase(uuid, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_complete_procurement_purchase(uuid, text, jsonb, text) TO authenticated;
