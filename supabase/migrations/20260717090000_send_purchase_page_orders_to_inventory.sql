-- Purchase-page users may create requests; only inventory managers can approve and receive them.
CREATE OR REPLACE FUNCTION public.inventory_require_purchase_requester(_brand_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_brand(_brand_id)
     OR NOT (public.can_manage_inventory() OR public.has_page_permission(auth.uid(), 'purchases')) THEN
    RAISE EXCEPTION 'You do not have permission to submit a purchase request.';
  END IF;
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
  PERFORM public.inventory_require_purchase_requester(_brand_id);
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Add at least one purchase line.';
  END IF;

  _request_no := 'PUR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);
  INSERT INTO public.inventory_purchase_requests (brand_id, request_no, supplier_name, requested_by, notes)
  VALUES (_brand_id, _request_no, COALESCE(_supplier_name, ''), auth.uid(), COALESCE(_notes, ''))
  RETURNING id INTO _request_id;

  FOR _line IN SELECT value FROM jsonb_array_elements(_lines)
  LOOP
    IF COALESCE((_line->>'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Purchase quantities must be greater than zero.';
    END IF;
    INSERT INTO public.inventory_purchase_request_lines (purchase_request_id, item_id, quantity, unit_cost, location_name, notes, batch_no, expiry_date)
    VALUES (
      _request_id,
      (_line->>'item_id')::uuid,
      (_line->>'quantity')::numeric,
      COALESCE((_line->>'unit_cost')::numeric, 0),
      COALESCE(NULLIF(_line->>'location_name', ''), 'main'),
      COALESCE(_line->>'notes', ''),
      COALESCE(_line->>'batch_no', ''),
      NULLIF(_line->>'expiry_date', '')::date
    );
  END LOOP;

  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
  VALUES (_brand_id, 'purchase_pending_approval', 'طلب شراء جديد بانتظار الاعتماد', 'تم تسجيل طلب الشراء ' || _request_no || '. راجع الكميات ثم اعتمد الاستلام لإضافتها للمخزون.', _request_id, 'inventory');

  RETURN _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_require_purchase_requester(uuid), public.inventory_submit_purchase_request(uuid, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_require_purchase_requester(uuid), public.inventory_submit_purchase_request(uuid, text, jsonb, text) TO authenticated;
