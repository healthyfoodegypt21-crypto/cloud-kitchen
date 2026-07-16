-- New product requests are submitted by purchasing users and approved by the store manager.
ALTER TABLE public.items_master ADD COLUMN product_brand text NOT NULL DEFAULT '';

CREATE TYPE public.inventory_item_request_status AS ENUM ('pending_store_approval', 'approved', 'rejected');

CREATE TABLE public.inventory_item_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  product_brand text NOT NULL DEFAULT '',
  item_code text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  unit text NOT NULL DEFAULT 'piece',
  min_stock numeric(14,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  notes text NOT NULL DEFAULT '',
  status public.inventory_item_request_status NOT NULL DEFAULT 'pending_store_approval',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, item_code, product_brand)
);

ALTER TABLE public.inventory_item_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view accessible item requests" ON public.inventory_item_requests FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

CREATE OR REPLACE FUNCTION public.inventory_submit_item_request(
  _brand_id uuid, _item_name text, _product_brand text, _item_code text, _category text DEFAULT 'other', _unit text DEFAULT 'piece', _min_stock numeric DEFAULT 0, _notes text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _request_id uuid;
BEGIN
  IF NOT public.can_access_brand(_brand_id) OR NOT (public.has_page_permission(auth.uid(), 'purchases') OR public.can_manage_inventory()) THEN
    RAISE EXCEPTION 'You do not have permission to submit an item request.';
  END IF;
  IF btrim(_item_name) = '' OR btrim(_item_code) = '' OR btrim(_unit) = '' THEN
    RAISE EXCEPTION 'Item name, code, and unit are required.';
  END IF;
  INSERT INTO public.inventory_item_requests (brand_id, item_name, product_brand, item_code, category, unit, min_stock, notes, requested_by)
  VALUES (_brand_id, btrim(_item_name), btrim(_product_brand), upper(btrim(_item_code)), COALESCE(NULLIF(btrim(_category), ''), 'other'), btrim(_unit), GREATEST(_min_stock, 0), COALESCE(_notes, ''), auth.uid())
  RETURNING id INTO _request_id;
  INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id)
  VALUES (_brand_id, 'item_addition_pending_approval', 'صنف جديد بانتظار قبول مدير المخزن', 'طلب إضافة صنف: ' || btrim(_item_name) || CASE WHEN btrim(_product_brand) <> '' THEN ' — ماركة ' || btrim(_product_brand) ELSE '' END, _request_id);
  RETURN _request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_review_item_request(_request_id uuid, _approve boolean, _review_notes text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _request public.inventory_item_requests%ROWTYPE;
BEGIN
  SELECT * INTO _request FROM public.inventory_item_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item request not found.'; END IF;
  PERFORM public.inventory_require_manager(_request.brand_id);
  IF _request.status <> 'pending_store_approval' THEN RAISE EXCEPTION 'This item request has already been reviewed.'; END IF;
  IF _approve THEN
    INSERT INTO public.items_master (brand_id, item_code, name, product_brand, category, purchase_unit, usage_unit, min_stock, notes, created_by, updated_by)
    VALUES (_request.brand_id, _request.item_code, _request.item_name, _request.product_brand, _request.category, _request.unit, _request.unit, _request.min_stock, trim(_request.notes || E'\n' || COALESCE(_review_notes, '')), auth.uid(), auth.uid());
    UPDATE public.inventory_item_requests SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = _request_id;
  ELSE
    UPDATE public.inventory_item_requests SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), notes = trim(notes || E'\n' || COALESCE(_review_notes, '')) WHERE id = _request_id;
  END IF;
  UPDATE public.inventory_notifications SET is_read = true WHERE reference_id = _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_submit_item_request(uuid, text, text, text, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_review_item_request(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_submit_item_request(uuid, text, text, text, text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_review_item_request(uuid, boolean, text) TO authenticated;
