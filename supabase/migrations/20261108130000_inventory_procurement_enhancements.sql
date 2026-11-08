-- Inventory & procurement enhancements: price history, audit log, auto reorder
-- suggestions, proactive alerts, approval chain, unified totals, supplier profile
-- extensions, and orphan invoice cleanup helpers.

-- ---------------------------------------------------------------------------
-- Supplier profile extensions (central supplier directory)
-- ---------------------------------------------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tax_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rating numeric(3,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- Price history per item/supplier, recorded automatically on receipt
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL DEFAULT '',
  purchase_request_id uuid REFERENCES public.inventory_purchase_requests(id) ON DELETE SET NULL,
  unit_price numeric(14,2) NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_price_history_item_idx ON public.inventory_price_history (brand_id, item_id, purchased_at DESC);
ALTER TABLE public.inventory_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inventory users view price history" ON public.inventory_price_history;
CREATE POLICY "Inventory users view price history"
  ON public.inventory_price_history FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

DROP POLICY IF EXISTS "Inventory users insert price history" ON public.inventory_price_history;
CREATE POLICY "Inventory users insert price history"
  ON public.inventory_price_history FOR INSERT TO authenticated
  WITH CHECK (public.can_access_brand(brand_id));

-- ---------------------------------------------------------------------------
-- Audit log: immutable record of every inventory movement with actor & reason
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items_master(id) ON DELETE SET NULL,
  movement_id uuid REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text NOT NULL DEFAULT '',
  location_name text NOT NULL DEFAULT 'main',
  quantity numeric(14,3),
  unit_cost numeric(14,2),
  movement_value numeric(14,2),
  reason text NOT NULL DEFAULT '',
  reference_table text NOT NULL DEFAULT '',
  reference_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_audit_log_brand_time_idx ON public.inventory_audit_log (brand_id, created_at DESC);
ALTER TABLE public.inventory_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inventory users view audit log" ON public.inventory_audit_log;
CREATE POLICY "Inventory users view audit log"
  ON public.inventory_audit_log FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

CREATE OR REPLACE FUNCTION public.inventory_log_movement_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_name text := '';
BEGIN
  SELECT COALESCE(display_name, email, '') INTO _actor_name
  FROM public.profiles WHERE id = NEW.created_by;

  INSERT INTO public.inventory_audit_log (
    brand_id, item_id, movement_id, action, actor_id, actor_name, location_name,
    quantity, unit_cost, movement_value, reason, reference_table, reference_id
  ) VALUES (
    NEW.brand_id, NEW.item_id, NEW.id, NEW.movement_type::text, NEW.created_by, COALESCE(_actor_name, ''),
    NEW.location_name, NEW.quantity, NEW.unit_cost, ROUND(NEW.quantity * NEW.unit_cost, 2),
    NEW.notes, NEW.reference_table, NEW.reference_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_movements_audit_trg ON public.inventory_movements;
CREATE TRIGGER inventory_movements_audit_trg
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.inventory_log_movement_audit();

-- ---------------------------------------------------------------------------
-- Unified invoice totals (single source of truth for subtotal/tax/discount)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_invoice_totals(_lines jsonb, _tax numeric DEFAULT 0, _discount numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _subtotal numeric(14,2);
  _total numeric(14,2);
BEGIN
  SELECT COALESCE(sum((line->>'quantity')::numeric * (line->>'unit_cost')::numeric), 0)
  INTO _subtotal
  FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) AS line;

  _subtotal := ROUND(_subtotal, 2);
  _total := GREATEST(ROUND(_subtotal + COALESCE(_tax, 0) - COALESCE(_discount, 0), 2), 0);
  RETURN jsonb_build_object('subtotal', _subtotal, 'tax', COALESCE(_tax, 0), 'discount', COALESCE(_discount, 0), 'total', _total);
END;
$$;

-- ---------------------------------------------------------------------------
-- Auto reorder suggestions: min stock + lead time + safety stock - open orders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_suggest_reorder(_brand_id uuid)
RETURNS TABLE (
  item_id uuid,
  item_name text,
  item_code text,
  purchase_unit text,
  usage_unit text,
  conversion_factor numeric,
  on_hand numeric,
  reserved_qty numeric,
  open_order_qty numeric,
  min_stock numeric,
  lead_time_days integer,
  suggested_quantity numeric,
  estimated_unit_cost numeric,
  preferred_supplier_id uuid,
  preferred_supplier_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_brand(_brand_id) THEN
    RAISE EXCEPTION 'You do not have access to this brand inventory.';
  END IF;

  RETURN QUERY
  WITH stock AS (
    SELECT b.item_id, COALESCE(sum(b.on_hand), 0) AS on_hand, COALESCE(sum(b.reserved_qty), 0) AS reserved_qty
    FROM public.inventory_balances b
    WHERE b.brand_id = _brand_id
    GROUP BY b.item_id
  ),
  open_orders AS (
    SELECT l.item_id, COALESCE(sum(l.quantity - l.received_quantity - l.rejected_quantity), 0) AS open_qty
    FROM public.inventory_purchase_request_lines l
    JOIN public.inventory_purchase_requests r ON r.id = l.purchase_request_id
    WHERE r.brand_id = _brand_id
      AND r.status IN ('pending_procurement', 'purchased_pending_receipt')
    GROUP BY l.item_id
  ),
  daily_usage AS (
    SELECT m.item_id, COALESCE(sum(m.quantity), 0) / 30.0 AS avg_daily
    FROM public.inventory_movements m
    WHERE m.brand_id = _brand_id
      AND m.movement_type IN ('production_consumption', 'waste')
      AND m.created_at >= now() - interval '30 days'
    GROUP BY m.item_id
  ),
  preferred_supplier AS (
    SELECT DISTINCT ON (sip.item_id) sip.item_id, sip.supplier_id, s.name AS supplier_name, s.lead_time_days AS supplier_lead_time
    FROM public.supplier_item_prices sip
    JOIN public.suppliers s ON s.id = sip.supplier_id
    WHERE sip.brand_id = _brand_id AND s.status = 'active'
    ORDER BY sip.item_id, sip.preferred DESC, sip.last_price ASC
  )
  SELECT
    i.id,
    i.name,
    i.item_code,
    i.purchase_unit,
    i.usage_unit,
    i.conversion_factor,
    COALESCE(stock.on_hand, 0),
    COALESCE(stock.reserved_qty, 0),
    COALESCE(open_orders.open_qty, 0),
    i.min_stock,
    COALESCE(ps.supplier_lead_time, 0)::integer,
    GREATEST(
      CEIL((
        (i.min_stock * 2 + COALESCE(daily_usage.avg_daily, 0) * COALESCE(ps.supplier_lead_time, 0))
        - GREATEST(COALESCE(stock.on_hand, 0) - COALESCE(stock.reserved_qty, 0), 0)
        - COALESCE(open_orders.open_qty, 0)
      ) / NULLIF(i.conversion_factor, 0)),
      0
    ) AS suggested_quantity,
    COALESCE(i.last_purchase_price, ROUND(i.avg_cost * i.conversion_factor, 2), 0) AS estimated_unit_cost,
    ps.supplier_id,
    ps.supplier_name
  FROM public.items_master i
  LEFT JOIN stock ON stock.item_id = i.id
  LEFT JOIN open_orders ON open_orders.item_id = i.id
  LEFT JOIN daily_usage ON daily_usage.item_id = i.id
  LEFT JOIN preferred_supplier ps ON ps.item_id = i.id
  WHERE i.brand_id = _brand_id
    AND i.status = 'active'
    AND i.min_stock > 0
    AND GREATEST(COALESCE(stock.on_hand, 0) - COALESCE(stock.reserved_qty, 0), 0) + COALESCE(open_orders.open_qty, 0) <= i.min_stock
  ORDER BY i.name;
END;
$$;

-- ---------------------------------------------------------------------------
-- Proactive alerts: low stock, expiring batches, due invoices, late receipts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_generate_alerts(_brand_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _created integer := 0;
  _row record;
BEGIN
  IF NOT public.can_access_brand(_brand_id) THEN
    RAISE EXCEPTION 'You do not have access to this brand inventory.';
  END IF;

  -- Low stock (one open notification per item per day)
  FOR _row IN
    SELECT i.id, i.name, i.min_stock,
      COALESCE((SELECT sum(b.on_hand - b.reserved_qty) FROM public.inventory_balances b WHERE b.brand_id = _brand_id AND b.item_id = i.id), 0) AS available
    FROM public.items_master i
    WHERE i.brand_id = _brand_id AND i.status = 'active' AND i.min_stock > 0
  LOOP
    IF _row.available <= _row.min_stock AND NOT EXISTS (
      SELECT 1 FROM public.inventory_notifications n
      WHERE n.brand_id = _brand_id AND n.notification_type = 'low_stock'
        AND n.reference_id = _row.id AND n.created_at::date = current_date
    ) THEN
      INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
      VALUES (_brand_id, 'low_stock', 'مخزون منخفض: ' || _row.name,
        'المتاح ' || _row.available || ' مقابل حد ' || _row.min_stock || '.', _row.id, 'inventory');
      _created := _created + 1;
    END IF;
  END LOOP;

  -- Expiring batches within 7 days
  FOR _row IN
    SELECT b.id, b.batch_no, b.expiry_date, i.name AS item_name
    FROM public.inventory_batches b
    JOIN public.items_master i ON i.id = b.item_id
    WHERE b.brand_id = _brand_id AND b.status = 'available'
      AND b.quantity_on_hand > b.reserved_qty
      AND b.expiry_date IS NOT NULL
      AND b.expiry_date <= current_date + 7
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory_notifications n
      WHERE n.brand_id = _brand_id AND n.notification_type = 'expiry'
        AND n.reference_id = _row.id AND n.created_at::date = current_date
    ) THEN
      INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
      VALUES (_brand_id, 'expiry',
        CASE WHEN _row.expiry_date < current_date THEN 'دفعة منتهية: ' ELSE 'صلاحية قريبة: ' END || _row.item_name,
        'دفعة ' || _row.batch_no || ' تنتهي في ' || _row.expiry_date || '.', _row.id, 'inventory');
      _created := _created + 1;
    END IF;
  END LOOP;

  -- Due invoices (unpaid/partial past due date)
  FOR _row IN
    SELECT inv.id, inv.invoice_number, inv.total_amount, inv.paid_amount, s.name AS supplier_name
    FROM public.supplier_invoices inv
    LEFT JOIN public.suppliers s ON s.id = inv.supplier_id
    WHERE inv.brand_id = _brand_id
      AND inv.due_date IS NOT NULL AND inv.due_date <= current_date + 3
      AND inv.paid_amount < inv.total_amount
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory_notifications n
      WHERE n.brand_id = _brand_id AND n.notification_type = 'invoice_due'
        AND n.reference_id = _row.id AND n.created_at::date = current_date
    ) THEN
      INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
      VALUES (_brand_id, 'invoice_due', 'فاتورة مستحقة: ' || COALESCE(_row.supplier_name, 'مورد'),
        'فاتورة ' || _row.invoice_number || ' — المتبقي ' || (_row.total_amount - _row.paid_amount) || '.', _row.id, 'purchases');
      _created := _created + 1;
    END IF;
  END LOOP;

  -- Late receipts (purchased but not received for over 2 days)
  FOR _row IN
    SELECT r.id, r.request_no, r.supplier_name
    FROM public.inventory_purchase_requests r
    WHERE r.brand_id = _brand_id
      AND r.status = 'purchased_pending_receipt'
      AND r.purchased_at < now() - interval '2 days'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory_notifications n
      WHERE n.brand_id = _brand_id AND n.notification_type = 'late_receipt'
        AND n.reference_id = _row.id AND n.created_at::date = current_date
    ) THEN
      INSERT INTO public.inventory_notifications (brand_id, notification_type, title, message, reference_id, target_page)
      VALUES (_brand_id, 'late_receipt', 'استلام متأخر: ' || _row.request_no,
        'الشراء من ' || COALESCE(_row.supplier_name, 'مورد') || ' بانتظار الاستلام منذ يومين.', _row.id, 'inventory');
      _created := _created + 1;
    END IF;
  END LOOP;

  RETURN _created;
END;
$$;

-- ---------------------------------------------------------------------------
-- Approval chain: purchase requests above a limit need a second approver
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_purchase_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL REFERENCES public.inventory_purchase_requests(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  approval_limit numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_purchase_approvals_request_idx ON public.inventory_purchase_approvals (purchase_request_id);
ALTER TABLE public.inventory_purchase_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inventory users view purchase approvals" ON public.inventory_purchase_approvals;
CREATE POLICY "Inventory users view purchase approvals"
  ON public.inventory_purchase_approvals FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

DROP POLICY IF EXISTS "Inventory managers review purchase approvals" ON public.inventory_purchase_approvals;
CREATE POLICY "Inventory managers review purchase approvals"
  ON public.inventory_purchase_approvals FOR UPDATE TO authenticated
  USING (public.can_access_brand(brand_id) AND public.can_manage_inventory());

DROP POLICY IF EXISTS "Inventory users create purchase approvals" ON public.inventory_purchase_approvals;
CREATE POLICY "Inventory users create purchase approvals"
  ON public.inventory_purchase_approvals FOR INSERT TO authenticated
  WITH CHECK (public.can_access_brand(brand_id));

CREATE OR REPLACE FUNCTION public.inventory_review_purchase_approval(_approval_id uuid, _approve boolean, _notes text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _approval public.inventory_purchase_approvals%ROWTYPE;
BEGIN
  SELECT * INTO _approval FROM public.inventory_purchase_approvals WHERE id = _approval_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval request not found.'; END IF;
  PERFORM public.inventory_require_manager(_approval.brand_id);
  IF _approval.status <> 'pending' THEN RAISE EXCEPTION 'This approval was already reviewed.'; END IF;
  IF _approval.requested_by = auth.uid() THEN RAISE EXCEPTION 'The requester cannot approve their own purchase.'; END IF;

  UPDATE public.inventory_purchase_approvals
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      approved_by = auth.uid(), approved_at = now(), notes = trim(notes || E'\n' || COALESCE(_notes, ''))
  WHERE id = _approval_id;
END;
$$;

-- Auto-create an approval entry whenever a purchase request exceeds the limit.
CREATE OR REPLACE FUNCTION public.inventory_maybe_require_purchase_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total numeric(14,2);
  _limit numeric(14,2) := 10000;
BEGIN
  SELECT COALESCE(sum(quantity * unit_cost), 0) INTO _total
  FROM public.inventory_purchase_request_lines
  WHERE purchase_request_id = NEW.id;

  IF _total >= _limit THEN
    INSERT INTO public.inventory_purchase_approvals (purchase_request_id, brand_id, total_amount, approval_limit, requested_by, notes)
    VALUES (NEW.id, NEW.brand_id, _total, _limit, NEW.requested_by, 'يتجاوز إجمالي الطلب حد الاعتماد التلقائي')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_purchase_requests_approval_trg ON public.inventory_purchase_requests;
CREATE TRIGGER inventory_purchase_requests_approval_trg
  AFTER INSERT ON public.inventory_purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.inventory_maybe_require_purchase_approval();

-- ---------------------------------------------------------------------------
-- Orphan invoice cleanup: list storage files not referenced by any invoice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_find_orphan_invoice_files(_brand_id uuid)
RETURNS TABLE (storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_brand(_brand_id) THEN
    RAISE EXCEPTION 'You do not have access to this brand inventory.';
  END IF;

  RETURN QUERY
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'supplier-invoices'
    AND o.name LIKE _brand_id || '/%'
    AND NOT EXISTS (
      SELECT 1 FROM public.inventory_purchase_requests r
      WHERE r.invoice_storage_path = o.name
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.supplier_invoices i
      WHERE i.invoice_storage_path = o.name
    )
    AND o.created_at < now() - interval '1 day';
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_invoice_totals(jsonb, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_suggest_reorder(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_generate_alerts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_review_purchase_approval(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_find_orphan_invoice_files(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_invoice_totals(jsonb, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_suggest_reorder(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_generate_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_review_purchase_approval(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_find_orphan_invoice_files(uuid) TO authenticated;
