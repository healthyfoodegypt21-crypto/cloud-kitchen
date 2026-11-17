-- =============================================================================
-- Smart Automatic Item Category Inference (DB Engine + Existing 'other' Backfill)
-- Recognizes vegetables (e.g. كابوتشا, خضره, مشروم), proteins, carbohydrates,
-- dairy, sauces, spices, oils, cleaning, packaging, nuts, beverages & dry goods
-- automatically on first-time item creation and reclassifies 'other' items.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.infer_inventory_item_category(_raw_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text;
  _padded text;
  _bucket text := 'other';
  _resolved text;
BEGIN
  IF _raw_name IS NULL OR btrim(_raw_name) = '' THEN
    RETURN 'other';
  END IF;

  _norm := lower(btrim(_raw_name));
  _norm := regexp_replace(_norm, E'[\u0640\u064B-\u065F\u0670]', '', 'g');
  _norm := translate(_norm, 'أإآٱؤئىة', 'ااااوييه');
  _norm := regexp_replace(_norm, '[^[:alnum:]\u0600-\u06FF]+', ' ', 'g');
  _padded := ' ' || btrim(regexp_replace(_norm, '\s+', ' ', 'g')) || ' ';

  -- 1. Cleaning & sanitation
  IF _padded ~ ' (فلاش|كلور|كلوركس|ديتول|بريل|فيري|داوني|اريال|برسيل|صابون|منظف|منظفات|مطهر|معقم|مذيب دهون|باور|سلك مواعين|سلك موعين|ليفه مواعين|ليفه موعين|اسبونج|سفنجه|شرشوبه|ممسحه|مقشه|جردل|مساحه|اكياس قمامه|اكياس زباله|فنيك|جلانس|ملمع|معطر|مبيد|bleach|chlorine|detergent|dishwash|sponge|scrubber|degreaser|sanitizer|disinfectant) ' THEN
    _bucket := 'cleaning';

  -- 2. Unmistakable packaging & disposables
  ELSIF _padded ~ ' (فويل|ورق فويل|الومنيوم فويل|استرتش|سترتش|بلاستيك راب|ورق زبده|علب وجبات|علب ميكروويف|علب بلاستيك|علب سلطه|علب صوص|اطباق فوم|اطباق فويل|شوك بلاستيك|معالق بلاستيك|ملاعق بلاستيك|سكاكين بلاستيك|شاليموه|اكواب ورق|كوبايات بلاستيك|اكياس تغليف|اكياس ثلاجه|شنط مطبوعه|استيكر|ستيكر|بكر كاشير|بكر استيكر|جوانتي|قفازات|كاب شعر|كمامه|foil|cling film|stretch wrap|meal box|cutlery|napkin|gloves) ' THEN
    _bucket := 'packaging';

  -- 3. Spices & dry seasonings (checked before vegetables so فلفل اسود / ثوم بودر -> spices)
  ELSIF _padded ~ ' (ملح|فلفل اسود|فلفل ابيض|فلفل احمر مطحون|ثوم بودر|ثوم مطحون|توم بودر|بصل بودر|بصل مطحون|جنزبيل بودر|زنجبيل بودر|زنجبيل مطحون|كزبره ناشفه|كسبره ناشفه|كمون|كركم|كاري|بابريكا|شطه|قرفه|بهار|بهارات|سبع بهارات|توابل|حبهان|هيل|ورق لورا|ورق غار|قرنفل|جوزه الطيب|زعتر|اوريجانو|روزماري|اكليل الجبل|سماق|سمسم|حبه البركه|مرقه|ماجي|بيكنج بودر|بيكربونات|خميره|فانيليا|زعفران|salt|black pepper|white pepper|cumin|turmeric|curry|paprika|chili powder|cinnamon|garlic powder|onion powder|spice|spices|seasoning|cardamom|bay leaf|cloves|nutmeg|thyme|oregano|rosemary|sumac|sesame|yeast|vanilla) ' THEN
    _bucket := 'spices';

  -- 4. Sauces, dressings & condiments
  ELSIF _padded ~ ' (صوص|صوصات|صلصه|معجون طماطم|كاتشب|مايونيز|مسطرده|مسترده|خردل|باربكيو|صويا|ترياكي|سويت تشيلي|سيراتشا|هوت صوص|رانش|سيزر|ثاوزند ايلاند|الف جزيره|ديمي جلاس|ورشستر|تباسكو|خل|بلسميك|بلسمك|دبس رمان|دبس|طحينه|بيستو|دريسنج|مخلل|طرشي|زيتون شرائح|زيتون مخلي|sauce|sauces|ketchup|mayo|mayonnaise|mustard|bbq|soy|teriyaki|sriracha|ranch|dressing|vinegar|balsamic|tahini|pesto|paste|pickles) ' THEN
    _bucket := 'sauces';

  -- 5. Nuts & dried fruits
  ELSIF _padded ~ ' (مكسرات|كاجو|لوز|بندق|فستق|عين جمل|جوز هند|صنوبر|فول سوداني|سوداني|زبيب|قراصيا|مشمشيه|تين مجفف|تمر|بلح|بذور شيا|شيا|بذور كتان|cashew|almond|hazelnut|pistachio|walnut|pecan|peanut|nuts|raisins|dates|chia) ' THEN
    _bucket := 'nuts';

  -- 6. Proteins
  ELSIF _padded ~ ' (صدور|وراك|اوراك|دبابيس|بانيه|شيش|طاووق|فراخ|فرخه|دجاج|دجاجه|بط|رومي|سمان|حمام|لحم|لحمه|لحوم|بيف|عجالي|كندوز|ضاني|بتلو|مفروم|كفته|برجر|ستيك|استيك|ريش|فلتو|عرق فلتو|تربيانكو|موزه|كبده|كلاوي|سجق|بسطرمه|لانشون|روزبيف|سلامي|تركي مدخن|سوسيس|هوت دوج|سمك|فيليه|سالمون|سلمون|تونه|جمبري|روبيان|كاليماري|كالماري|سبيط|بلطي|بوري|قاروص|دنيس|كابوريا|سي فود|بيض|chicken|beef|meat|veal|lamb|turkey|duck|steak|minced|kofta|burger|sausage|liver|fish|salmon|tuna|shrimp|prawn|calamari|seafood|egg|eggs) ' THEN
    _bucket := 'proteins';

  -- 7. Dairy & cheeses
  ELSIF _padded ~ ' (لبن|حليب|جبن|جبنه|اجبان|قريش|فيتا|فيتاه|موتزاريلا|موزاريلا|شيدر|بارميزان|حلوم|ريكوتا|جبنه رومي|جبنه كريمي|كيري|زبادي|يوناني|لبنه|قشطه|كريمه|رايب|milk|cheese|cottage|feta|mozzarella|cheddar|parmesan|halloumi|ricotta|yogurt|labneh|cream|dairy) ' THEN
    _bucket := 'dairy';

  -- 8. Oils & cooking fats
  ELSIF _padded ~ ' (زيت|سمن|سمنه|زبده|مارجرين|oil|ghee|butter|margarine) ' THEN
    _bucket := 'oils';

  -- 9. Fresh vegetables, leafy greens & herbs (including كابوتشا, خضره, مشروم, etc.)
  ELSIF _padded ~ ' (كابوتشا|كابوتشي|كابوتشه|خس|جرجير|بقدونس|مقدونس|كزبره|كسبره|شبت|نعناع|ريحان|خضره|خضار|خضروات|خضراوات|طماطم|قوطه|بندوره|خيار|جزر|فلفل|بصل|ثوم|توم|مشروم|ماشروم|عيش غراب|بروكلي|قرنبيط|كوسه|باذنجان|بتنجان|سبانخ|ملوخيه|باميه|بسله|فاصوليا خضراء|كرنب|ملفوف|بنجر|شمندر|فجل|كرفس|كرات|ليمون|زنجبيل|جنزبيل|افوكادو|ذره حلوه|خرشوف|قلقاس|ورق عنب|vegetable|vegetables|lettuce|iceberg|arugula|rocca|parsley|coriander|cilantro|dill|mint|basil|tomato|tomatoes|cucumber|carrot|pepper|capsicum|onion|garlic|mushroom|mushrooms|broccoli|cauliflower|zucchini|eggplant|spinach|cabbage|beetroot|celery|leek|lemon|avocado|sweet corn) ' THEN
    _bucket := 'vegetables';

  -- 10. Fresh fruits
  ELSIF _padded ~ ' (تفاح|موز|برتقال|يوسفي|فراوله|مانجو|مانجه|جوافه|عنب|رمان|كيوي|اناناس|بطيخ|كانتلوب|شمام|خوخ|مشمش|برقوق|كمثري|توت|بلوبيري|جريب فروت|فواكه|فاكهه|apple|banana|orange|strawberry|mango|guava|grape|pomegranate|kiwi|pineapple|watermelon|peach|berry|berries|fruit|fruits) ' THEN
    _bucket := 'fruits';

  -- 11. Carbohydrates, grains, starches & bakery
  ELSIF _padded ~ ' (ارز|رز|بسمتي|مكرونه|معكرونه|باستا|اسباجتي|بينا|فيتوتشيني|لازانيا|شعريه|لسان عصفور|نودلز|بطاطس|بطاطا|توست|عيش|خبز|رده|تورتيلا|تورتيا|كايزر|فينو|بيتي بان|بقسماط|شوفان|كينوا|برغل|فريك|كسكسي|دقيق|نشا|كورن فليكس|رايس كيك|كرواسون|باتيه|مخبوزات|rice|basmati|pasta|spaghetti|penne|noodles|potato|potatoes|sweet potato|bread|toast|tortilla|wrap|bun|oats|oatmeal|quinoa|bulgur|flour|cornstarch) ' THEN
    _bucket := 'carbohydrates';

  -- 12. Beverages
  ELSIF _padded ~ ' (ماء|مياه|ميه معدنيه|عصير|شاي|قهوه|نسكافيه|اسبريسو|كابتشينو|كركديه|ينسون|حلبه|بيبسي|كوكاكولا|سبرايت|صودا|مشروب|water|juice|tea|coffee|nescafe|espresso|soda|beverage|drink) ' THEN
    _bucket := 'beverages';

  -- 13. Dry goods
  ELSIF _padded ~ ' (عدس|حمص|فول|لوبيا|فاصوليا بيضاء|فاصوليا حمراء|ترمس|ذره فشار|عسل|سكر|ستيفيا|كاكاو|شوكولاته|شيكولاته|مربي|حلاوه|جيلاتين|lentils|chickpeas|beans|honey|sugar|stevia|cocoa|chocolate|jam) ' THEN
    _bucket := 'dry_goods';

  -- 14. Generic packaging fallback
  ELSIF _padded ~ ' (علب|علبه|اكياس|كيس|كرتون|كرتونه|كراتين|شنط|شنطه|تغليف|تعبئه|عبوات|عبوه|اكواب|اغطيه|غطاء|مناديل|رول|packaging|container|containers|boxes|bags) ' THEN
    _bucket := 'packaging';
  END IF;

  -- Resolve dynamically against active inventory_categories (including custom categories like "مكسرات" -> '01')
  IF _bucket = 'nuts' THEN
    SELECT code INTO _resolved FROM public.inventory_categories
    WHERE is_active AND (lower(code) = 'nuts' OR name_ar LIKE '%مكسرات%' OR lower(name_en) LIKE '%nut%')
    ORDER BY sort_order ASC LIMIT 1;
    RETURN COALESCE(_resolved, 'dry_goods');
  ELSIF _bucket = 'fruits' THEN
    SELECT code INTO _resolved FROM public.inventory_categories
    WHERE is_active AND (lower(code) = 'fruits' OR name_ar LIKE '%فواكه%' OR name_ar LIKE '%فاكه%' OR lower(name_en) LIKE '%fruit%')
    ORDER BY sort_order ASC LIMIT 1;
    RETURN COALESCE(_resolved, 'vegetables');
  ELSE
    SELECT code INTO _resolved FROM public.inventory_categories
    WHERE is_active AND lower(code) = _bucket
    LIMIT 1;
    RETURN COALESCE(_resolved, _bucket);
  END IF;
END;
$$;

-- Upgrade inventory_create_item_v2 so empty or 'other' category automatically infers the smart category
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
  _effective_category text;
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
    min_stock, last_purchase_price, avg_cost, notes, created_by, updated_by
  ) VALUES (
    _brand_id, upper(btrim(_item_code)), _clean_name, _effective_category, btrim(_purchase_unit), btrim(_usage_unit),
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

GRANT EXECUTE ON FUNCTION
  public.clean_inventory_item_display_name(text),
  public.normalize_inventory_item_name(text),
  public.infer_inventory_item_category(text)
TO PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION
  public.inventory_create_item_v2(uuid, text, text, text, text, text, numeric, numeric, text, numeric, numeric, text)
TO authenticated;

-- Backfill existing 'other' items in items_master with their automatically inferred categories!
UPDATE public.items_master
SET category = public.infer_inventory_item_category(name)
WHERE category = 'other'
  AND public.infer_inventory_item_category(name) <> 'other';

NOTIFY pgrst, 'reload schema';
