-- Cast status expression to public.inventory_purchase_request_status in inventory_receive_purchase_request_v2
-- to fix: "column "status" is of type inventory_purchase_request_status but expression is of type text"
-- which blocked receiving purchases and kept stock balances at 0.

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
  SET status = (CASE WHEN _all_processed THEN CASE WHEN _any_received THEN 'approved' ELSE 'rejected' END ELSE 'purchased_pending_receipt' END)::public.inventory_purchase_request_status,
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

NOTIFY pgrst, 'reload schema';
