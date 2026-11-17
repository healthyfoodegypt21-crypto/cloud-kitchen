-- =============================================================================
-- Detailed Warehouse Purchase Notifications (Items, Units, Prices & Totals)
-- Enriches every purchase notification (and backfills existing ones) with exact
-- item names, quantities, Arabic unit labels, unit prices, total value & actor.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.arabic_inventory_unit_label(_unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(COALESCE(_unit, '')))
    WHEN 'kg' THEN 'كجم'
    WHEN 'g' THEN 'جرام'
    WHEN 'l' THEN 'لتر'
    WHEN 'ml' THEN 'مل'
    WHEN 'plate' THEN 'طبق'
    WHEN 'carton' THEN 'كرتونة'
    WHEN 'jerrycan' THEN 'جيركن'
    WHEN 'bucket' THEN 'جردل'
    WHEN 'jar' THEN 'برطمان'
    WHEN 'bottle' THEN 'زجاجة'
    WHEN 'can' THEN 'علبة'
    WHEN 'box' THEN 'صندوق'
    WHEN 'bag' THEN 'كيس'
    WHEN 'packet' THEN 'باكيت'
    WHEN 'bundle' THEN 'حزمة'
    WHEN 'tray' THEN 'صينية'
    WHEN 'piece' THEN 'قطعة'
    WHEN 'dozen' THEN 'دستة'
    WHEN 'set' THEN 'طقم'
    ELSE COALESCE(NULLIF(btrim(_unit), ''), 'وحدة')
  END;
$$;

CREATE OR REPLACE FUNCTION public.build_purchase_notification_payload(
  _request_id uuid,
  _notification_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.inventory_purchase_requests%ROWTYPE;
  _short_items text;
  _lines_summary text;
  _computed_total numeric(14,2);
  _effective_total numeric(14,2);
  _prefix text;
  _title text;
  _message text;
BEGIN
  IF _request_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO _req FROM public.inventory_purchase_requests WHERE id = _request_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    string_agg(DISTINCT im.name, '، ' ORDER BY im.name),
    string_agg(
      COALESCE(im.name, 'صنف') || ' (' ||
      trim(trailing '.' from trim(trailing '0' from l.quantity::text)) || ' ' ||
      public.arabic_inventory_unit_label(im.purchase_unit) ||
      CASE WHEN COALESCE(l.unit_cost, 0) > 0
        THEN ' × ' || trim(trailing '.' from trim(trailing '0' from ROUND(l.unit_cost, 2)::text)) || ' ج.م'
        ELSE ''
      END || ')',
      '، '
      ORDER BY l.created_at ASC, l.id ASC
    ),
    ROUND(COALESCE(sum(l.quantity * l.unit_cost), 0), 2)
  INTO _short_items, _lines_summary, _computed_total
  FROM public.inventory_purchase_request_lines l
  LEFT JOIN public.items_master im ON im.id = l.item_id
  WHERE l.purchase_request_id = _request_id;

  _effective_total := CASE WHEN COALESCE(_req.total_amount, 0) > 0 THEN _req.total_amount ELSE COALESCE(_computed_total, 0) END;

  _prefix := CASE _notification_type
    WHEN 'purchase_receipt_updated' THEN 'تم إيداع مشتريات بالمخزون'
    WHEN 'purchase_waiting_receipt' THEN 'مشتريات بانتظار استلام المخزن'
    WHEN 'purchase_pending_procurement' THEN 'أمر شراء بانتظار التنفيذ'
    WHEN 'purchase_pending_approval' THEN 'طلب شراء بانتظار الاعتماد'
    ELSE 'إشعار مشتريات المخزن'
  END;

  IF length(COALESCE(_short_items, '')) > 55 THEN
    _short_items := left(_short_items, 52) || '...';
  END IF;

  _title := _prefix
    || CASE WHEN COALESCE(_short_items, '') <> '' THEN ': ' || _short_items ELSE '' END
    || CASE WHEN _effective_total > 0
         THEN ' — ' || trim(trailing '.' from trim(trailing '0' from _effective_total::text)) || ' ج.م'
         ELSE ''
       END;

  _message := COALESCE('الأصناف: ' || NULLIF(_lines_summary, ''), 'طلب رقم ' || _req.request_no)
    || CASE WHEN _effective_total > 0
         THEN ' · الإجمالي: ' || trim(trailing '.' from trim(trailing '0' from _effective_total::text)) || ' ج.م'
         ELSE ''
       END
    || CASE WHEN btrim(COALESCE(_req.supplier_name, '')) <> ''
         THEN ' · المورد: ' || btrim(_req.supplier_name)
         ELSE ''
       END
    || CASE WHEN btrim(COALESCE(_req.purchaser_name, '')) <> ''
         THEN ' · المشتري: ' || btrim(_req.purchaser_name)
         ELSE ''
       END
    || ' · رقم العملية: ' || _req.request_no;

  RETURN jsonb_build_object('title', _title, 'message', _message);
END;
$$;

CREATE OR REPLACE FUNCTION public.enrich_purchase_notification_trg_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payload jsonb;
BEGIN
  IF NEW.reference_id IS NOT NULL AND NEW.notification_type IN (
    'purchase_receipt_updated',
    'purchase_waiting_receipt',
    'purchase_pending_procurement',
    'purchase_pending_approval'
  ) THEN
    _payload := public.build_purchase_notification_payload(NEW.reference_id, NEW.notification_type);
    IF _payload IS NOT NULL THEN
      NEW.title := COALESCE(_payload->>'title', NEW.title);
      NEW.message := COALESCE(_payload->>'message', NEW.message);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrich_purchase_notification ON public.inventory_notifications;
CREATE TRIGGER trg_enrich_purchase_notification
  BEFORE INSERT ON public.inventory_notifications
  FOR EACH ROW EXECUTE FUNCTION public.enrich_purchase_notification_trg_fn();

-- Backfill all existing purchase notifications so current unread alerts show full items & prices!
UPDATE public.inventory_notifications AS n
SET title = COALESCE(p.payload->>'title', n.title),
    message = COALESCE(p.payload->>'message', n.message)
FROM (
  SELECT id, public.build_purchase_notification_payload(reference_id, notification_type) AS payload
  FROM public.inventory_notifications
  WHERE reference_id IS NOT NULL
    AND notification_type IN (
      'purchase_receipt_updated',
      'purchase_waiting_receipt',
      'purchase_pending_procurement',
      'purchase_pending_approval'
    )
) AS p
WHERE n.id = p.id
  AND p.payload IS NOT NULL;

GRANT EXECUTE ON FUNCTION
  public.arabic_inventory_unit_label(text),
  public.build_purchase_notification_payload(uuid, text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
