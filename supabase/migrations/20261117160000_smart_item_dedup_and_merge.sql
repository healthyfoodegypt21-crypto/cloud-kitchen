-- =============================================================================
-- Smart Item Recognition, Canonical Anti-Duplicate Guard & Duplicate Item Merge
-- Prevents registering two names for the same item and merges existing duplicates
-- (e.g. "كابوتشا ال" -> "كابوتشا") while preserving full stock, batches & history.
-- =============================================================================

-- 1. Clean display name helper: removes dangling grammatical particles ("كابوتشا ال" -> "كابوتشا")
--    and collapses accidental adjacent repeated words ("كرتونة مشروم مشروم" -> "كرتونة مشروم").
CREATE OR REPLACE FUNCTION public.clean_inventory_item_display_name(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _words text[];
  _deduped text[] := '{}';
  _w text;
  _prev text := NULL;
BEGIN
  IF _raw IS NULL THEN
    RETURN '';
  END IF;

  _words := regexp_split_to_array(
    btrim(regexp_replace(_raw, '^[:：\-–—•*\s]+|[:：\-–—•*\s]+$', '', 'g')),
    '\s+'
  );

  FOREACH _w IN ARRAY _words LOOP
    IF _w = '' THEN
      CONTINUE;
    END IF;
    IF _prev IS NOT NULL AND lower(_prev) = lower(_w) THEN
      CONTINUE;
    END IF;
    _deduped := array_append(_deduped, _w);
    _prev := _w;
  END LOOP;

  WHILE coalesce(array_length(_deduped, 1), 0) > 1
    AND _deduped[1] ~* '^(ال|الـ|ب|بـ|و|ف|ل|من|في|على|علي|عن|اليوم|انهارده|انهاردة|النهارده|النهاردة|امبارح)$'
  LOOP
    _deduped := _deduped[2:array_length(_deduped, 1)];
  END LOOP;

  WHILE coalesce(array_length(_deduped, 1), 0) > 1
    AND _deduped[array_length(_deduped, 1)] ~* '^(ال|الـ|ب|بـ|و|ف|ل|من|في|على|علي|عن|اليوم|انهارده|انهاردة|النهارده|النهاردة|امبارح)$'
  LOOP
    _deduped := _deduped[1:array_length(_deduped, 1) - 1];
  END LOOP;

  RETURN coalesce(array_to_string(_deduped, ' '), '');
END;
$$;

-- 2. Canonical normalized item key in PostgreSQL (Arabic orthography + synonyms + word-order independent)
CREATE OR REPLACE FUNCTION public.normalize_inventory_item_name(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _cleaned text;
  _tok text;
  _norm_tok text;
  _tokens text[] := '{}';
  _result text;
BEGIN
  IF _raw IS NULL OR btrim(_raw) = '' THEN
    RETURN '';
  END IF;

  -- Lowercase, strip tatweel & Arabic diacritics, replace punctuation with spaces
  _cleaned := lower(btrim(_raw));
  _cleaned := regexp_replace(_cleaned, E'[\u0640\u064B-\u065F\u0670]', '', 'g');
  _cleaned := regexp_replace(_cleaned, '[^[:alnum:]\u0600-\u06FF]+', ' ', 'g');

  FOR _tok IN SELECT unnest(regexp_split_to_array(btrim(_cleaned), '\s+')) LOOP
    IF _tok = '' THEN
      CONTINUE;
    END IF;

    -- Strip definite article "ال" unless root starts with "ال" (ألبان / ألوان / ألماس / ألياف)
    IF _tok ~ '^ال[\u0600-\u06FF]{2,}$' AND _tok !~ '^ال(بان|وان|ماس|ياف)$' THEN
      _norm_tok := substr(_tok, 3);
    ELSE
      _norm_tok := _tok;
    END IF;

    -- Normalize Arabic hamzas, taa marbuta, alef maqsura
    _norm_tok := translate(_norm_tok, 'أإآٱؤئىة', 'ااااوييه');

    -- Strip definite article if token started with "ال" before hamza normalization edge cases
    IF _norm_tok ~ '^ال[\u0600-\u06FF]{2,}$' AND _norm_tok !~ '^ال(بان|وان|ماس|ياف)$' THEN
      _norm_tok := substr(_norm_tok, 3);
    END IF;

    -- Culinary synonyms unification
    _norm_tok := CASE _norm_tok
      WHEN 'فراخ' THEN 'دجاج'
      WHEN 'فرخه' THEN 'دجاج'
      WHEN 'دجاجه' THEN 'دجاج'
      WHEN 'تشيكن' THEN 'دجاج'
      WHEN 'chicken' THEN 'دجاج'
      WHEN 'رز' THEN 'ارز'
      WHEN 'بطاطا' THEN 'بطاطس'
      WHEN 'potato' THEN 'بطاطس'
      WHEN 'potatoes' THEN 'بطاطس'
      WHEN 'قوطه' THEN 'طماطم'
      WHEN 'بندوره' THEN 'طماطم'
      WHEN 'tomato' THEN 'طماطم'
      WHEN 'tomatoes' THEN 'طماطم'
      WHEN 'لحمه' THEN 'لحم'
      WHEN 'لحوم' THEN 'لحم'
      WHEN 'بيف' THEN 'لحم'
      WHEN 'beef' THEN 'لحم'
      WHEN 'ستيك' THEN 'استيك'
      WHEN 'سلمون' THEN 'سالمون'
      WHEN 'salmon' THEN 'سالمون'
      WHEN 'كليماري' THEN 'كالماري'
      WHEN 'معكرونه' THEN 'مكرونه'
      WHEN 'باستا' THEN 'مكرونه'
      WHEN 'pasta' THEN 'مكرونه'
      WHEN 'لبن' THEN 'حليب'
      WHEN 'جبنه' THEN 'جبن'
      WHEN 'اجبان' THEN 'جبن'
      WHEN 'كابوتشي' THEN 'كابوتشا'
      WHEN 'كابوتشه' THEN 'كابوتشا'
      WHEN 'ماشروم' THEN 'مشروم'
      WHEN 'mushroom' THEN 'مشروم'
      WHEN 'mushrooms' THEN 'مشروم'
      WHEN 'توم' THEN 'ثوم'
      WHEN 'جنزبيل' THEN 'زنجبيل'
      WHEN 'كسبره' THEN 'كزبره'
      WHEN 'مقدونس' THEN 'بقدونس'
      WHEN 'عيش' THEN 'خبز'
      WHEN 'موعين' THEN 'مواعين'
      WHEN 'اوراك' THEN 'وراك'
      WHEN 'ورك' THEN 'وراك'
      WHEN 'صدر' THEN 'صدور'
      WHEN 'فيتاه' THEN 'فيتا'
      ELSE _norm_tok
    END;

    -- Skip pure stopwords / dangling articles
    IF _norm_tok IN ('ال', 'و', 'او', 'ب', 'ل', 'من', 'في', 'علي', 'عن', 'مع', 'اليوم', 'انهارده', 'النهارده', 'امبارح', 'واحد', 'واحده') THEN
      CONTINUE;
    END IF;

    _tokens := array_append(_tokens, _norm_tok);
  END LOOP;

  SELECT COALESCE(string_agg(t, ' ' ORDER BY t), '')
  INTO _result
  FROM (SELECT DISTINCT unnest(_tokens) AS t) AS distinct_tokens;

  RETURN _result;
END;
$$;

-- 3. Private internal merge engine: safely merges _source_item_id into _target_item_id
--    across all balances, batches, movements, invoices, and ERP references.
CREATE OR REPLACE FUNCTION public.inventory_merge_duplicate_item_internal(
  _brand_id uuid,
  _source_item_id uuid,
  _target_item_id uuid,
  _actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _source public.items_master%ROWTYPE;
  _target public.items_master%ROWTYPE;
  _source_stock numeric(14,3);
  _target_stock numeric(14,3);
  _merged_stock numeric(14,3);
  _merged_avg_cost numeric(14,2);
  _bal record;
  _batch record;
  _new_batch_no text;
  _effective_actor uuid := COALESCE(_actor_id, auth.uid());
BEGIN
  IF _source_item_id IS NULL OR _target_item_id IS NULL OR _source_item_id = _target_item_id THEN
    RAISE EXCEPTION 'Choose two distinct items to merge.';
  END IF;

  SELECT * INTO _source FROM public.items_master
  WHERE id = _source_item_id AND brand_id = _brand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source item not found in this inventory.';
  END IF;

  SELECT * INTO _target FROM public.items_master
  WHERE id = _target_item_id AND brand_id = _brand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target item not found in this inventory.';
  END IF;

  IF lower(btrim(_source.usage_unit)) <> lower(btrim(_target.usage_unit)) THEN
    RAISE EXCEPTION 'لا يمكن دمج صنفين بوحدات استخدام مختلفة (% مقابل %)؛ وحّد وحدة الاستخدام أولاً.', _source.usage_unit, _target.usage_unit;
  END IF;

  SELECT COALESCE(sum(on_hand), 0) INTO _source_stock
  FROM public.inventory_balances WHERE brand_id = _brand_id AND item_id = _source_item_id;

  SELECT COALESCE(sum(on_hand), 0) INTO _target_stock
  FROM public.inventory_balances WHERE brand_id = _brand_id AND item_id = _target_item_id;

  _merged_stock := _target_stock + _source_stock;
  _merged_avg_cost := CASE
    WHEN _merged_stock > 0 THEN
      ROUND(((_target_stock * COALESCE(_target.avg_cost, 0)) + (_source_stock * COALESCE(_source.avg_cost, 0))) / _merged_stock, 2)
    ELSE COALESCE(NULLIF(_target.avg_cost, 0), _source.avg_cost, 0)
  END;

  -- Merge inventory_balances per location_name
  FOR _bal IN
    SELECT * FROM public.inventory_balances
    WHERE brand_id = _brand_id AND item_id = _source_item_id
    FOR UPDATE
  LOOP
    INSERT INTO public.inventory_balances (
      brand_id, item_id, location_name, on_hand, reserved_qty, created_by, updated_by
    ) VALUES (
      _brand_id, _target_item_id, _bal.location_name, _bal.on_hand, _bal.reserved_qty,
      COALESCE(_effective_actor, _bal.created_by), COALESCE(_effective_actor, _bal.updated_by)
    )
    ON CONFLICT (brand_id, item_id, location_name)
    DO UPDATE SET
      on_hand = public.inventory_balances.on_hand + EXCLUDED.on_hand,
      reserved_qty = public.inventory_balances.reserved_qty + EXCLUDED.reserved_qty,
      updated_by = COALESCE(_effective_actor, public.inventory_balances.updated_by);
  END LOOP;

  DELETE FROM public.inventory_balances
  WHERE brand_id = _brand_id AND item_id = _source_item_id;

  -- Merge inventory_batches safely (avoiding unique (warehouse_id, item_id, batch_no) collisions)
  FOR _batch IN
    SELECT * FROM public.inventory_batches
    WHERE item_id = _source_item_id
    FOR UPDATE
  LOOP
    _new_batch_no := _batch.batch_no;
    IF EXISTS (
      SELECT 1 FROM public.inventory_batches
      WHERE warehouse_id = _batch.warehouse_id
        AND item_id = _target_item_id
        AND batch_no = _new_batch_no
    ) THEN
      _new_batch_no := _batch.batch_no || '-M-' || substr(_batch.id::text, 1, 4);
    END IF;

    UPDATE public.inventory_batches
    SET item_id = _target_item_id,
        batch_no = _new_batch_no,
        updated_by = COALESCE(_effective_actor, updated_by)
    WHERE id = _batch.id;
  END LOOP;

  -- Merge supplier_item_prices (unique on (supplier_id, item_id, brand_id))
  UPDATE public.supplier_item_prices AS target_sip
  SET last_price = CASE
        WHEN source_sip.updated_at > target_sip.updated_at THEN source_sip.last_price
        ELSE target_sip.last_price
      END,
      updated_by = COALESCE(_effective_actor, target_sip.updated_by)
  FROM public.supplier_item_prices AS source_sip
  WHERE source_sip.item_id = _source_item_id
    AND target_sip.item_id = _target_item_id
    AND target_sip.supplier_id = source_sip.supplier_id
    AND target_sip.brand_id = source_sip.brand_id;

  DELETE FROM public.supplier_item_prices AS source_sip
  USING public.supplier_item_prices AS target_sip
  WHERE source_sip.item_id = _source_item_id
    AND target_sip.item_id = _target_item_id
    AND target_sip.supplier_id = source_sip.supplier_id
    AND target_sip.brand_id = source_sip.brand_id;

  UPDATE public.supplier_item_prices SET item_id = _target_item_id WHERE item_id = _source_item_id;

  -- Re-point all historical & operational references
  UPDATE public.inventory_movements SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.inventory_purchase_request_lines SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.inventory_daily_withdrawal_lines SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.inventory_count_lines SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.inventory_transfer_items SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.supplier_invoice_items SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.purchase_order_items SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.purchase_receipt_items SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.waste_entries SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.return_entries SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.sales_invoice_items SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.production_order_materials SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.production_orders SET finished_item_id = _target_item_id WHERE finished_item_id = _source_item_id;
  UPDATE public.recipe_version_items SET item_id = _target_item_id WHERE item_id = _source_item_id;
  UPDATE public.recipes SET finished_item_id = _target_item_id WHERE finished_item_id = _source_item_id;

  IF to_regclass('public.inventory_audit_log') IS NOT NULL THEN
    UPDATE public.inventory_audit_log SET item_id = _target_item_id WHERE item_id = _source_item_id;
  END IF;
  IF to_regclass('public.inventory_price_history') IS NOT NULL THEN
    UPDATE public.inventory_price_history SET item_id = _target_item_id WHERE item_id = _source_item_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'menu_ingredients' AND column_name = 'inventory_item_id'
  ) THEN
    EXECUTE 'UPDATE public.menu_ingredients SET inventory_item_id = $1 WHERE inventory_item_id = $2'
      USING _target_item_id, _source_item_id;
  END IF;

  UPDATE public.inventory_notifications
  SET reference_id = _target_item_id
  WHERE reference_id = _source_item_id;

  -- Update target item cost & reorder threshold, then delete duplicate source item
  UPDATE public.items_master
  SET avg_cost = _merged_avg_cost,
      last_purchase_price = CASE
        WHEN _source.updated_at > _target.updated_at AND COALESCE(_source.last_purchase_price, 0) > 0
          THEN _source.last_purchase_price
        ELSE COALESCE(NULLIF(_target.last_purchase_price, 0), _source.last_purchase_price, 0)
      END,
      min_stock = GREATEST(COALESCE(_target.min_stock, 0), COALESCE(_source.min_stock, 0)),
      category = CASE WHEN _target.category = 'other' AND _source.category <> 'other' THEN _source.category ELSE _target.category END,
      updated_by = COALESCE(_effective_actor, _target.updated_by)
  WHERE id = _target_item_id;

  DELETE FROM public.items_master WHERE id = _source_item_id AND brand_id = _brand_id;

  RETURN jsonb_build_object(
    'merged_into_id', _target_item_id,
    'target_name', _target.name,
    'removed_name', _source.name,
    'merged_on_hand', _merged_stock,
    'merged_avg_cost', _merged_avg_cost
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_merge_duplicate_item_internal(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 4. Public RPC for managers/owners to merge any two items safely from Inventory page
CREATE OR REPLACE FUNCTION public.inventory_merge_duplicate_item(
  _brand_id uuid,
  _source_item_id uuid,
  _target_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  RETURN public.inventory_merge_duplicate_item_internal(_brand_id, _source_item_id, _target_item_id, auth.uid());
END;
$$;

-- 5. Upgrade inventory_create_item_v2 with automatic smart deduplication:
--    - Cleans dangling articles / repeated words from _name
--    - Checks normalize_inventory_item_name against existing active items in the hub:
--      * For purchase/order auto-creation (_opening_quantity = 0), returns the existing item ID seamlessly!
--      * For manual creation with opening stock (_opening_quantity > 0), blocks duplicate with clear Arabic guidance!
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
  _notes text DEFAULT ''
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
  _location text := COALESCE(NULLIF(lower(btrim(_location_name)), ''), 'main');
  _can_manage boolean := public.can_manage_inventory();
BEGIN
  IF NOT public.can_operate_procurement_or_inventory(_brand_id) THEN
    RAISE EXCEPTION 'You do not have permission to create inventory items.';
  END IF;
  IF btrim(COALESCE(_item_code, '')) = '' OR _clean_name = ''
    OR btrim(COALESCE(_category, '')) = '' OR btrim(COALESCE(_purchase_unit, '')) = ''
    OR btrim(COALESCE(_usage_unit, '')) = '' THEN
    RAISE EXCEPTION 'Item code, name, category, purchase unit, and usage unit are required.';
  END IF;
  IF _conversion_factor IS NULL OR _conversion_factor <= 0
    OR (_purchase_unit = _usage_unit AND _conversion_factor <> 1)
    OR COALESCE(_opening_quantity, 0) < 0 OR COALESCE(_opening_unit_cost, 0) < 0
    OR COALESCE(_min_stock, 0) < 0 THEN
    RAISE EXCEPTION 'Conversion, stock, and cost values are invalid.';
  END IF;

  -- Smart canonical anti-duplicate check
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
    min_stock, last_purchase_price, avg_cost, notes, created_by, updated_by
  ) VALUES (
    _brand_id, upper(btrim(_item_code)), _clean_name, btrim(_category), btrim(_purchase_unit), btrim(_usage_unit),
    _conversion_factor, COALESCE(_min_stock, 0),
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

-- 6. Prevent renaming an item to collide with another active item's canonical name
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
  _notes text
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
BEGIN
  PERFORM public.inventory_require_manager(_brand_id);
  IF btrim(COALESCE(_item_code, '')) = '' OR _clean_name = ''
    OR btrim(COALESCE(_category, '')) = '' OR btrim(COALESCE(_purchase_unit, '')) = ''
    OR btrim(COALESCE(_usage_unit, '')) = '' OR _conversion_factor IS NULL OR _conversion_factor <= 0
    OR (_purchase_unit = _usage_unit AND _conversion_factor <> 1) OR COALESCE(_min_stock, -1) < 0 THEN
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

  IF (_item.purchase_unit <> _purchase_unit OR _item.usage_unit <> _usage_unit OR _item.conversion_factor <> _conversion_factor)
    AND EXISTS (SELECT 1 FROM public.inventory_movements WHERE item_id = _item_id AND brand_id = _brand_id) THEN
    RAISE EXCEPTION 'Purchase and usage units cannot change after inventory movements have been recorded.';
  END IF;
  UPDATE public.items_master
  SET item_code = upper(btrim(_item_code)), name = _clean_name, category = btrim(_category),
      purchase_unit = btrim(_purchase_unit), usage_unit = btrim(_usage_unit),
      conversion_factor = _conversion_factor, min_stock = _min_stock,
      notes = COALESCE(_notes, ''), updated_by = auth.uid()
  WHERE id = _item_id AND brand_id = _brand_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION
  public.clean_inventory_item_display_name(text),
  public.normalize_inventory_item_name(text),
  public.inventory_merge_duplicate_item(uuid, uuid, uuid),
  public.inventory_create_item_v2(uuid, text, text, text, text, text, numeric, numeric, text, numeric, numeric, text),
  public.inventory_update_item(uuid, uuid, text, text, text, text, text, numeric, numeric, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.clean_inventory_item_display_name(text),
  public.normalize_inventory_item_name(text),
  public.inventory_merge_duplicate_item(uuid, uuid, uuid),
  public.inventory_create_item_v2(uuid, text, text, text, text, text, numeric, numeric, text, numeric, numeric, text),
  public.inventory_update_item(uuid, uuid, text, text, text, text, text, numeric, numeric, text)
TO authenticated;

-- 7. Clean existing stuttering display names & automatically merge canonical active duplicates
--    (e.g. merges "كابوتشا ال" into original "كابوتشا" -> 24 piece @ 8.67 EGP!)
UPDATE public.items_master AS im
SET name = public.clean_inventory_item_display_name(im.name)
WHERE im.name <> public.clean_inventory_item_display_name(im.name)
  AND NOT EXISTS (
    SELECT 1 FROM public.items_master AS other
    WHERE other.brand_id = im.brand_id
      AND other.id <> im.id
      AND lower(btrim(other.name)) = lower(btrim(public.clean_inventory_item_display_name(im.name)))
  );

DO $$
DECLARE
  _dup record;
BEGIN
  FOR _dup IN
    WITH ranked AS (
      SELECT
        id,
        brand_id,
        name,
        usage_unit,
        public.normalize_inventory_item_name(name) AS norm_key,
        first_value(id) OVER (
          PARTITION BY brand_id, lower(btrim(usage_unit)), public.normalize_inventory_item_name(name)
          ORDER BY created_at ASC, length(name) ASC, id ASC
        ) AS canonical_id
      FROM public.items_master
      WHERE status = 'active'
        AND public.normalize_inventory_item_name(name) <> ''
    )
    SELECT brand_id, id AS source_id, canonical_id AS target_id
    FROM ranked
    WHERE id <> canonical_id
  LOOP
    PERFORM public.inventory_merge_duplicate_item_internal(
      _dup.brand_id,
      _dup.source_id,
      _dup.target_id,
      NULL
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
