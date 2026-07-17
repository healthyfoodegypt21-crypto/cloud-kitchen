-- A warehouse manager's own completed purchase is immediately received and remains visible in real purchase history.
CREATE OR REPLACE FUNCTION public.inventory_record_store_purchase(_brand_id uuid, _supplier_name text, _purchaser_name text, _lines jsonb, _notes text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _request_id uuid; _request_no text; _line jsonb;
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF btrim(COALESCE(_purchaser_name, '')) = '' OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'Purchaser name and at least one purchase line are required.'; END IF;
  _request_no := 'WH-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);
  INSERT INTO public.inventory_purchase_requests (brand_id, request_no, supplier_name, status, requested_by, purchaser_name, execution_source, purchased_at, notes)
  VALUES (_brand_id, _request_no, COALESCE(_supplier_name, ''), 'purchased_pending_receipt', auth.uid(), btrim(_purchaser_name), 'store_manager', now(), COALESCE(_notes, 'شراء مباشر سجله مدير المخزن')) RETURNING id INTO _request_id;
  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    IF COALESCE((_line->>'quantity')::numeric, 0) <= 0 OR COALESCE((_line->>'unit_cost')::numeric, -1) < 0 THEN RAISE EXCEPTION 'Actual quantity and cost must be valid.'; END IF;
    INSERT INTO public.inventory_purchase_request_lines (purchase_request_id, item_id, quantity, unit_cost, location_name, notes, batch_no, expiry_date)
    VALUES (_request_id, (_line->>'item_id')::uuid, (_line->>'quantity')::numeric, (_line->>'unit_cost')::numeric, COALESCE(NULLIF(_line->>'location_name', ''), 'main'), COALESCE(_line->>'notes', ''), COALESCE(_line->>'batch_no', ''), NULLIF(_line->>'expiry_date', '')::date);
  END LOOP;
  PERFORM public.inventory_review_purchase_request(_request_id, true, 'استلام فوري: شراء مباشر سجله مدير المخزن');
  RETURN _request_id;
END;
$$;
