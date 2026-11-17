-- =============================================================================
-- Multi-Unit Pack Weight/Volume Metadata & Smart Unit Rescaling
-- Supports multi-tier kitchen units:
--   * Mushroom: Carton = 10 Plates, 1 Plate = 200 g (buy/withdraw by Carton, Plate, kg, or g)
--   * Sauces: Jerrycan / Bucket with net L/ml/kg/g (e.g. Ketchup Jerrycan = 4.24 kg)
--   * Universal kg <-> g and L <-> ml switching across Purchases & Withdrawals
-- =============================================================================

ALTER TABLE public.items_master
  ADD COLUMN IF NOT EXISTS pack_size_value numeric(14,3) CHECK (pack_size_value IS NULL OR pack_size_value > 0),
  ADD COLUMN IF NOT EXISTS pack_size_unit text CHECK (pack_size_unit IS NULL OR pack_size_unit IN ('g', 'kg', 'ml', 'l'));

-- Upgrade inventory_create_item_v2 to store optional pack_size_value & pack_size_unit
DROP FUNCTION IF EXISTS public.inventory_create_item_v2(
  uuid, text, text, text, text, text, numeric, numeric, text, numeric, numeric, text
);

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
  _notes text DEFAULT '',
  _pack_size_value numeric DEFAULT NULL,
  _pack_size_unit text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item_id uuid;
  _existing public.items_master%ROWTYPE;
  _warehouse_id uuid;
  _clean_name text := public.clean_inventory_item_display_name(_name);
  _norm_key text := public.normalize_inventory_item_name(_clean_name);
  _effective_category text;
  _valid_pack_val numeric(14,3);
  _valid_pack_unit text;
  _location text := COALESCE(NULLIF(lower(btrim(_location_name)), ''), 'main');
  _can_manage boolean := public.can_manage_inventory();
BEGIN
  IF NOT public.can_operate_procurement_or_inventory(_brand_id) THEN
    RAISE EXCEPTION 'You do not have permission to create inventory items.';
  END IF;

  _effective_category := CASE
    WHEN btrim(COALESCE(_category, '')) = '' OR lower(btrim(_category)) = 'other'
      THEN public.infer_inventory_item_category(_clean_name)
    ELSE btrim(_category)
  END;

  IF _pack_size_value IS NOT NULL AND _pack_size_value > 0 AND lower(btrim(COALESCE(_pack_size_unit, ''))) IN ('g', 'kg', 'ml', 'l') THEN
    _valid_pack_val := ROUND(_pack_size_value, 3);
    _valid_pack_unit := lower(btrim(_pack_size_unit));
  ELSE
    _valid_pack_val := NULL;
    _valid_pack_unit := NULL;
  END IF;

  IF btrim(COALESCE(_item_code, '')) = '' OR _clean_name = ''
    OR _effective_category = '' OR btrim(COALESCE(_purchase_unit, '')) = ''
    OR btrim(COALESCE(_usage_unit, '')) = '' THEN
    RAISE EXCEPTION 'Item code, name, category, purchase unit, and usage unit are required.';
  END IF;
  IF _conversion_factor IS NULL OR _conversion_factor <= 0
    OR (_purchase_unit = _usage_unit AND _conversion_factor <> 1)
    OR COALESCE(_opening_quantity, 0) < 0 OR COALESCE(_opening_unit_cost, 0) < 0
    OR COALESCE(_min_stock, 0) < 0 THEN
    RAISE EXCEPTION 'Conversion, stock, and cost values are invalid.';
  END IF;

  IF _norm_key <> '' THEN
    SELECT * INTO _existing
    FROM public.items_master
    WHERE brand_id = _brand_id
      AND status = 'active'
      AND public.normalize_inventory_item_name(name) = _norm_key
    ORDER BY created_at ASC
    LIMIT 1;

    IF FOUND THEN
      IF COALESCE(_opening_quantity, 0) <= 0 THEN
        RETURN _existing.id;
      ELSE
        RAISE EXCEPTION 'هذا الصنف مسجل بالفعل في المخزن باسم "%" — أضف الرصيد عبر «حركة مخزون» بدلاً من تكرار الصنف.', _existing.name;
      END IF;
    END IF;
  END IF;

  IF NOT _can_manage AND COALESCE(_opening_quantity, 0) > 0 THEN
    RAISE EXCEPTION 'Only an inventory manager may create an opening stock balance.';
  END IF;
  SELECT id INTO _warehouse_id FROM public.warehouses
  WHERE brand_id = _brand_id AND lower(warehouse_code) = _location AND status = 'active'
  ORDER BY created_at LIMIT 1;
  IF _warehouse_id IS NULL THEN RAISE EXCEPTION 'An active warehouse for item location % was not found.', _location; END IF;

  INSERT INTO public.items_master (
    brand_id, item_code, name, category, purchase_unit, usage_unit, conversion_factor,
    pack_size_value, pack_size_unit,
    min_stock, last_purchase_price, avg_cost, notes, created_by, updated_by
  ) VALUES (
    _brand_id, upper(btrim(_item_code)), _clean_name, _effective_category, btrim(_purchase_unit), btrim(_usage_unit),
    _conversion_factor,
    _valid_pack_val, _valid_pack_unit,
    COALESCE(_min_stock, 0),
    ROUND(COALESCE(_opening_unit_cost, 0) * _conversion_factor, 2), COALESCE(_opening_unit_cost, 0),
    COALESCE(_notes, ''), auth.uid(), auth.uid()
  ) RETURNING id INTO _item_id;

  INSERT INTO public.inventory_balances (brand_id, item_id, location_name, on_hand, created_by, updated_by)
  VALUES (_brand_id, _item_id, _location, COALESCE(_opening_quantity, 0), auth.uid(), auth.uid());

  IF _opening_quantity > 0 THEN
    INSERT INTO public.inventory_movements (
      brand_id, item_id, movement_type, quantity, unit_cost, reference_table, reference_id,
      location_name, notes, created_by
    ) VALUES (
      _brand_id, _item_id, 'adjustment', _opening_quantity, _opening_unit_cost,
      'items_master', _item_id::text, _location, 'رصيد افتتاحي', auth.uid()
    );
    INSERT INTO public.inventory_batches (
      brand_id, warehouse_id, item_id, batch_no, quantity_on_hand, unit_cost, status, notes, created_by, updated_by
    ) VALUES (
      _brand_id, _warehouse_id, _item_id, 'OPEN-' || substr(_item_id::text, 1, 8),
      _opening_quantity, _opening_unit_cost, 'available', 'رصيد افتتاحي', auth.uid(), auth.uid()
    );
  END IF;

  RETURN _item_id;
END;
$$;

-- Upgrade inventory_update_item to allow configuring purchase_unit, conversion_factor,
-- pack_size_value, pack_size_unit, and safely rescaling balances when switching metric usage units (kg<->g, l<->ml)
DROP FUNCTION IF EXISTS public.inventory_update_item(
  uuid, uuid, text, text, text, text, text, numeric, numeric, text
);

CREATE OR REPLACE FUNCTION public.inventory_update_item(
  _brand_id uuid,
  _item_id uuid,
  _item_code text,
  _name text,
  _category text,
  _purchase_unit text,
  _usage_unit text,
  _conversion_factor numeric,
  _min_stock numeric,
  _notes text,
  _pack_size_value numeric DEFAULT NULL,
  _pack_size_unit text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item public.items_master%ROWTYPE;
  _conflict_name text;
  _clean_name text := public.clean_inventory_item_display_name(_name);
  _norm_key text := public.normalize_inventory_item_name(_clean_name);
  _old_usage text;
  _new_usage text := btrim(_usage_unit);
  _usage_ratio numeric(14,6) := 1;
  _new_avg_cost numeric(14,2);
  _valid_pack_val numeric(14,3);
  _valid_pack_unit text;
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF btrim(COALESCE(_item_code, '')) = '' OR _clean_name = ''
    OR btrim(COALESCE(_category, '')) = '' OR btrim(COALESCE(_purchase_unit, '')) = ''
    OR _new_usage = '' OR _conversion_factor IS NULL OR _conversion_factor <= 0
    OR (btrim(_purchase_unit) = _new_usage AND _conversion_factor <> 1) OR COALESCE(_min_stock, -1) < 0 THEN
    RAISE EXCEPTION 'Item details or conversion values are invalid.';
  END IF;

  SELECT * INTO _item FROM public.items_master WHERE id = _item_id AND brand_id = _brand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item was not found for this brand.'; END IF;

  IF _norm_key <> '' THEN
    SELECT name INTO _conflict_name
    FROM public.items_master
    WHERE brand_id = _brand_id
      AND status = 'active'
      AND id <> _item_id
      AND public.normalize_inventory_item_name(name) = _norm_key
    LIMIT 1;
    IF _conflict_name IS NOT NULL THEN
      RAISE EXCEPTION 'يوجد صنف آخر مسجل بالفعل باسم "%"؛ استخدم زر الدمج لتوحيدهما بدلاً من تكرار الاسم.', _conflict_name;
    END IF;
  END IF;

  IF _pack_size_value IS NOT NULL AND _pack_size_value > 0 AND lower(btrim(COALESCE(_pack_size_unit, ''))) IN ('g', 'kg', 'ml', 'l') THEN
    _valid_pack_val := ROUND(_pack_size_value, 3);
    _valid_pack_unit := lower(btrim(_pack_size_unit));
  ELSE
    _valid_pack_val := NULL;
    _valid_pack_unit := NULL;
  END IF;

  _old_usage := lower(btrim(_item.usage_unit));

  IF _old_usage <> lower(_new_usage) THEN
    IF _old_usage = 'kg' AND lower(_new_usage) = 'g' THEN
      _usage_ratio := 1000;
    ELSIF _old_usage = 'g' AND lower(_new_usage) = 'kg' THEN
      _usage_ratio := 0.001;
    ELSIF _old_usage = 'l' AND lower(_new_usage) = 'ml' THEN
      _usage_ratio := 1000;
    ELSIF _old_usage = 'ml' AND lower(_new_usage) = 'l' THEN
      _usage_ratio := 0.001;
    ELSIF _old_usage = 'dozen' AND lower(_new_usage) = 'piece' THEN
      _usage_ratio := 12;
    ELSIF _old_usage = 'piece' AND lower(_new_usage) = 'dozen' THEN
      _usage_ratio := 1.0 / 12.0;
    ELSE
      -- Container/count rename (e.g. piece -> plate, piece -> bundle) keeps 1:1 count balance
      _usage_ratio := 1;
    END IF;

    IF _usage_ratio <> 1 THEN
      UPDATE public.inventory_balances
      SET on_hand = ROUND(on_hand * _usage_ratio, 3),
          reserved_qty = ROUND(reserved_qty * _usage_ratio, 3),
          updated_by = auth.uid()
      WHERE brand_id = _brand_id AND item_id = _item_id;

      UPDATE public.inventory_batches
      SET quantity_on_hand = ROUND(quantity_on_hand * _usage_ratio, 3),
          reserved_qty = ROUND(reserved_qty * _usage_ratio, 3),
          unit_cost = ROUND(unit_cost / _usage_ratio, 2),
          updated_by = auth.uid()
      WHERE brand_id = _brand_id AND item_id = _item_id;
    END IF;
  END IF;

  _new_avg_cost := CASE
    WHEN _usage_ratio <> 1 AND COALESCE(_item.avg_cost, 0) > 0
      THEN ROUND(_item.avg_cost / _usage_ratio, 2)
    ELSE COALESCE(_item.avg_cost, 0)
  END;

  UPDATE public.items_master
  SET item_code = upper(btrim(_item_code)),
      name = _clean_name,
      category = btrim(_category),
      purchase_unit = btrim(_purchase_unit),
      usage_unit = _new_usage,
      conversion_factor = _conversion_factor,
      pack_size_value = _valid_pack_val,
      pack_size_unit = _valid_pack_unit,
      min_stock = _min_stock,
      avg_cost = _new_avg_cost,
      last_purchase_price = CASE
        WHEN btrim(_purchase_unit) <> _item.purchase_unit OR _conversion_factor <> _item.conversionFactor_safe
          THEN ROUND(_new_avg_cost * _conversion_factor, 2)
        ELSE last_purchase_price
      END,
      notes = COALESCE(_notes, ''),
      updated_by = auth.uid()
  FROM (SELECT COALESCE(_item.conversion_factor, 1) AS conversionFactor_safe) AS helper
  WHERE id = _item_id AND brand_id = _brand_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION
  public.inventory_create_item_v2(uuid, text, text, text, text, text, numeric, numeric, text, numeric, numeric, text, numeric, text),
  public.inventory_update_item(uuid, uuid, text, text, text, text, text, numeric, numeric, text, numeric, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.inventory_create_item_v2(uuid, text, text, text, text, text, numeric, numeric, text, numeric, numeric, text, numeric, text),
  public.inventory_update_item(uuid, uuid, text, text, text, text, text, numeric, numeric, text, numeric, text)
TO authenticated;

-- Configure real operational multi-unit specs on existing catalog items:
-- 1) مشروم: 1 Carton = 10 Plates, 1 Plate = 200 g (existing stock 10 = 10 Plates @ 25 EGP/plate = 250 EGP/carton)
UPDATE public.items_master
SET purchase_unit = 'carton',
    usage_unit = 'plate',
    conversion_factor = 10,
    pack_size_value = 200,
    pack_size_unit = 'g',
    last_purchase_price = CASE WHEN COALESCE(avg_cost, 0) > 0 THEN ROUND(avg_cost * 10, 2) ELSE last_purchase_price END
WHERE public.normalize_inventory_item_name(name) IN ('مشروم', 'كرتون مشروم', 'كرتونه مشروم')
  AND usage_unit IN ('piece', 'plate', 'tray');

-- 2) كاتشب: normalize compound unit string "جيركن ٤.٢٤ كيلو" -> unit = 'jerrycan', pack_size = 4.24 kg
UPDATE public.items_master
SET purchase_unit = 'jerrycan',
    usage_unit = 'jerrycan',
    conversion_factor = 1,
    pack_size_value = 4.24,
    pack_size_unit = 'kg'
WHERE purchase_unit LIKE '%جيركن%' OR usage_unit LIKE '%جيركن%';

-- 3) حزم خضره: use 'bundle' (حزمة / ربطة)
UPDATE public.items_master
SET purchase_unit = 'bundle',
    usage_unit = 'bundle'
WHERE name LIKE '%حزم خضر%' AND purchase_unit = 'piece' AND usage_unit = 'piece';

NOTIFY pgrst, 'reload schema';
