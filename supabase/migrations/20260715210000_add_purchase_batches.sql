-- Attach lot and expiry information to approved purchase receipts.
ALTER TABLE public.inventory_purchase_request_lines
  ADD COLUMN batch_no text NOT NULL DEFAULT '',
  ADD COLUMN expiry_date date;

CREATE OR REPLACE FUNCTION public.inventory_review_purchase_request(_request_id uuid, _approve boolean, _review_notes text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request public.inventory_purchase_requests%ROWTYPE;
  _line public.inventory_purchase_request_lines%ROWTYPE;
  _warehouse_id uuid;
  _batch_no text;
BEGIN
  SELECT * INTO _request FROM public.inventory_purchase_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found.'; END IF;

  PERFORM public.inventory_require_manager(_request.brand_id);
  IF _request.status <> 'pending_store_approval' THEN
    RAISE EXCEPTION 'This purchase request has already been reviewed.';
  END IF;

  IF NOT _approve THEN
    UPDATE public.inventory_purchase_requests
    SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
        notes = trim(notes || E'\n' || COALESCE(_review_notes, ''))
    WHERE id = _request_id;
    RETURN;
  END IF;

  SELECT id INTO _warehouse_id
  FROM public.warehouses
  WHERE brand_id = _request.brand_id AND warehouse_code = 'MAIN'
  LIMIT 1;

  IF _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Main warehouse was not found for this brand.';
  END IF;

  FOR _line IN SELECT * FROM public.inventory_purchase_request_lines WHERE purchase_request_id = _request_id
  LOOP
    PERFORM public.inventory_apply_movement(
      _request.brand_id, _line.item_id, 'purchase_receipt', _line.quantity, _line.unit_cost, _line.location_name,
      COALESCE(_line.notes, 'استلام شراء معتمد'), 'inventory_purchase_requests', _request_id::text
    );

    _batch_no := COALESCE(NULLIF(btrim(_line.batch_no), ''), 'PUR-' || substr(_request_id::text, 1, 8) || '-' || substr(_line.id::text, 1, 5));
    INSERT INTO public.inventory_batches (
      brand_id, warehouse_id, item_id, batch_no, expiry_date, quantity_on_hand, unit_cost, notes, created_by, updated_by
    ) VALUES (
      _request.brand_id, _warehouse_id, _line.item_id, _batch_no, _line.expiry_date, _line.quantity, _line.unit_cost,
      COALESCE(_line.notes, ''), auth.uid(), auth.uid()
    )
    ON CONFLICT (warehouse_id, item_id, batch_no) DO UPDATE
    SET quantity_on_hand = public.inventory_batches.quantity_on_hand + EXCLUDED.quantity_on_hand,
        expiry_date = COALESCE(EXCLUDED.expiry_date, public.inventory_batches.expiry_date),
        unit_cost = EXCLUDED.unit_cost,
        updated_by = auth.uid();
  END LOOP;

  UPDATE public.inventory_purchase_requests
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
      notes = trim(notes || E'\n' || COALESCE(_review_notes, ''))
  WHERE id = _request_id;

  UPDATE public.inventory_notifications SET is_read = true WHERE reference_id = _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_review_purchase_request(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_review_purchase_request(uuid, boolean, text) TO authenticated;
