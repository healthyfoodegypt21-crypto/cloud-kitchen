-- Seeds the "Healthy Food" company menu from the provided Excel workbook
-- (categories, meals, nutrition, price, and per-meal ingredients).
-- Existing categories/ingredients for this company are cleared first for a
-- clean rebuild; the company record itself and other companies are untouched.

DO $$
DECLARE
  v_company_id uuid;
  v_category_id uuid;
  v_meal_id uuid;
  v_ingredient_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.menu_companies WHERE lower(trim(name)) = lower(trim('Healthy Food')) LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Healthy Food company not found; create it first from the Companies & Menus page.';
  END IF;

  DELETE FROM public.menu_company_categories WHERE company_id = v_company_id;
  DELETE FROM public.menu_ingredients WHERE company_id = v_company_id;

  -- Category: Beef
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Beef', 0) RETURNING id INTO v_category_id;

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Marbella Meatballs', 'كرات لحم مشوي بالصوص واللوز مع أرز بسمتي', 727, 45, 58, 35, 290, 0)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ميتبول') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ميتبول';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Steak Wedges', 'شرائح لحم مشوي مع بطاطس ويدجز وأرز بسمتي', 836, 41, 70, 30, 320, 1)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'بطاطس ويدجيز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'بطاطس ويدجيز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Steak Noodles', 'شرائح لحم مشوي مع مكرونة فيتوتشيني وايت صوص', 714, 47, 82, 31, 300, 2)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكرونة فيتوتشيني') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكرونة فيتوتشيني';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Steak Au Poivre', 'شريحة لحم مشوي فرنسي مع صوص فلفل أسود وأرز', 743, 41, 66, 35, 340, 3)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Beef Steak', 'ستيك بقري بصوص المشروم لايت وأرز بسمتي', 755, 42, 68, 35, 350, 4)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Beef Siracha', 'لحم بصوص السيراجا الحار وفلفل رومي وأرز', 653, 43, 73, 21, 320, 5)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'شرائح لحم') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'شرائح لحم';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Pasta Red Sauce', 'باستا صوص أحمر وبهارات إيطالية ولحم مفروم وجبن', 644, 46, 61, 24, 290, 6)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكرونة اسباجتي') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكرونة اسباجتي';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكعبات لحم') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكعبات لحم';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Steak Kababs', 'كباب مشوي متبل مع فلفل رومي وبصل وأرز', 633, 43, 68, 21, 330, 7)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Healthy Beef Stir-Fry', 'نودلز بالووِك مع لحم وصويا صوص وخضار', 585, 46, 62, 17, 310, 8)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكرونة فيتوتشيني') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكرونة فيتوتشيني';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'شرائح لحم') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'شرائح لحم';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chilli-Lime Steak', 'ستيك بصوص الليمون مع أرز بسمتي', 609, 42, 63, 21, 340, 9)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  -- Category: Chicken
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Chicken', 1) RETURNING id INTO v_category_id;

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chicken and Zucchini', 'دجاج مع كوسة مشوية وخضار سوتيه/بطاطس وأرز', 566, 37, 55, 22, 245, 0)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج كامله') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج كامله';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chicken Stir Fry', 'شرائح دجاج نودلز ووك مع خضار وبطاطس صحية', 611, 40, 61, 23, 250, 1)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكرونة فيتوتشيني') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكرونة فيتوتشيني';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'شرائح دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'شرائح دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chicken and Vegetables', 'دجاج مشوي مع فلفل ألوان وخضار مشوي وأرز', 611, 38, 63, 23, 238, 2)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج كامله') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج كامله';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chicken Noodles', 'دجاج مع نودلز وخضار بالصويا صوص', 647, 41, 69, 23, 242, 3)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكرونة فيتوتشيني') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكرونة فيتوتشيني';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكعبات دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكعبات دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chicken Kung Pao', 'دجاج كونج باو ووك صيني مع خضار', 606, 37, 65, 22, 255, 4)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكعبات دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكعبات دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chicken Balsamic', 'دجاج مشوي بصوص البلسمك وخضار وأرز/بطاطس', 554, 36, 53, 22, 250, 5)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج كامله') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج كامله';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chicken Lemon Sauce', 'دجاج بصوص الليمون وخضار وأرز/بطاطس', 545, 36, 53, 21, 245, 6)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج كامله') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج كامله';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chicken Teriyaki', 'دجاج بصوص الترياكي مع أرز وبطاطس وخضار', 558, 37, 62, 18, 260, 7)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج كامله') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج كامله';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Honey Garlic Bits', 'مكعبات دجاج ثوم وعسل مع أرز وخضار مشوي وبطاطس', 590, 36, 62, 22, 230, 8)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكعبات دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكعبات دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Harvest Chicken', 'دجاج باللوز المحمص وخضار وأرز وبطاطس', 737, 42, 68, 33, 275, 9)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكعبات دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكعبات دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chicken Alfredo', '', NULL, NULL, NULL, NULL, NULL, 10)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكرونة فيتوتشيني') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكرونة فيتوتشيني';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'شرائح دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'شرائح دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Classic Grilled Chicken', '', NULL, NULL, NULL, NULL, NULL, 11)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج كامله') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج كامله';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chicken Shawarma', '', NULL, NULL, NULL, NULL, NULL, 12)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'شرائح دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'شرائح دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  -- Category: Seafood
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Seafood', 2) RETURNING id INTO v_category_id;

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Shrimp Fried Rice', 'جمبري مشوي مع أرز بالبسلة والجزر والذرة', 513, 39, 69, 9, 350, 0)
    RETURNING id INTO v_meal_id;

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Air Fryer Fish', 'سمك قشر بياض إيرفراير مع أرز وصوص مميز', 587, 37, 67, 19, 380, 1)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فيليه سمك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فيليه سمك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Curry Shrimp', 'جمبري كاري هندي مع فلفل ألوان وأرز', 456, 32, 55, 12, 410, 2)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'جمبري') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'جمبري';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Cilantro Lime Shrimp', 'جمبري ليمون وكزبرة وأعشاب مع أرز', 464, 35, 63, 8, 400, 3)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'جمبري') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'جمبري';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Rosemary Fillet', 'سمك قشر بياض بالروزماري والليمون مع أرز', 428, 36, 53, 8, 390, 4)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فيليه سمك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فيليه سمك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Paella Seafood', 'بايا إسباني سي فود وخضار مع أرز بسمتي', 516, 37, 74, 8, 380, 5)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فيليه سمك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فيليه سمك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'جمبري') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'جمبري';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 3);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'كالماري') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'كالماري';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 4);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Tuna Pasta', 'تونة بالباستا والصوص الخاص', 439, 37, 57, 7, 350, 6)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكرونة فيتوتشيني') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكرونة فيتوتشيني';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Ranch Shrimps', 'جمبري مشوي بصوص الرانش مع أرز', 465, 36, 60, 9, 410, 7)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'جمبري') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'جمبري';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  -- Category: Salad
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Salad', 3) RETURNING id INTO v_category_id;

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Chicken Caesar Salad', 'كابوتشي، خبز محمص، دجاج مشوي، صوص سيزر', 392, 32, 18, 21, 200, 0)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'كابوتشي') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'كابوتشي';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خبز محمص') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خبز محمص';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'دجاج مشوي') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'دجاج مشوي';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صوص سيزر') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صوص سيزر';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 3);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Tuna Salad', 'تونة لايت، فاصوليا حمراء، فلفل ألوان، ذرة، زيتون', 340, 26, 25, 15, 180, 1)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'تونة لايت') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'تونة لايت';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فاصوليا حمراء') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فاصوليا حمراء';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فلفل ألوان') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فلفل ألوان';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ذرة') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ذرة';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 3);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'زيتون') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'زيتون';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 4);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Fresh Garden Salad', 'خيار، فلفل ألوان، جزر، كابوتشي، مشروم', 209, 3, 14, 17, 120, 2)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خيار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خيار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فلفل ألوان') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فلفل ألوان';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'جزر') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'جزر';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'كابوتشي') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'كابوتشي';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 3);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مشروم') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مشروم';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 4);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Quinoa Crunch Salad', 'حبوب كينوا، فلفل ألوان، كابوتشي، فول سوداني، سمسم', 391, 9, 54, 16, 150, 3)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'حبوب كينوا') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'حبوب كينوا';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فلفل ألوان') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فلفل ألوان';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'كابوتشي') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'كابوتشي';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فول سوداني') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فول سوداني';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 3);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'سمسم') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'سمسم';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 4);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Greek Chicken Salad', 'دجاج مشوي، زيتون، خيار، فلفل، جبن فيتا لايت', 447, 40, 13, 26, 180, 4)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'دجاج مشوي') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'دجاج مشوي';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'زيتون') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'زيتون';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خيار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خيار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فلفل') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فلفل';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 3);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'جبن فيتا لايت') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'جبن فيتا لايت';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 4);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Mexican Beans Salad', 'ذرة، فلفل ألوان، فاصوليا حمراء/بيضاء، حمص، خيار', 402, 14, 44, 21, 120, 5)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ذرة') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ذرة';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فلفل ألوان') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فلفل ألوان';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فاصوليا حمراء/بيضاء') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فاصوليا حمراء/بيضاء';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'حمص') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'حمص';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 3);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خيار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خيار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 4);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Ranch Chicken Salad', 'دجاج مشوي، جزر، ذرة حلوة، فلفل، كابوتشي', 366, 30, 15, 21, 170, 6)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'دجاج مشوي') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'دجاج مشوي';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'جزر') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'جزر';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ذرة حلوة') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ذرة حلوة';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فلفل') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فلفل';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 3);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'كابوتشي') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'كابوتشي';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 4);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Greek Salad', 'جبن فيتا لايت، زيتون، خيار، فلفل ألوان', 330, 20, 14, 21, 140, 7)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'جبن فيتا لايت') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'جبن فيتا لايت';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'زيتون') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'زيتون';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خيار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خيار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فلفل ألوان') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فلفل ألوان';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 3);

  -- Category: Breakfast
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Breakfast', 4) RETURNING id INTO v_category_id;

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Breakfast Meal 1', 'Boiled eggs - Cheese - Greek chicken salad', NULL, NULL, NULL, NULL, 165, 0)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Boiled eggs') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Boiled eggs';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Cheese') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Cheese';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Greek chicken salad') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Greek chicken salad';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Breakfast Meal 2', 'Sandwich cheese and chicken - Beetroot salad', NULL, NULL, NULL, NULL, 170, 1)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Sandwich cheese and chicken') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Sandwich cheese and chicken';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Beetroot salad') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Beetroot salad';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Breakfast Meal 3', 'Club sandwich (chicken and turkey) - Fresh salad', NULL, NULL, NULL, NULL, 190, 2)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Club sandwich (chicken and turkey)') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Club sandwich (chicken and turkey)';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Fresh salad') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Fresh salad';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Breakfast Meal 4', 'Sandwich cheese and turkey - Roca salad', NULL, NULL, NULL, NULL, 185, 3)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Sandwich cheese and turkey') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Sandwich cheese and turkey';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Roca salad') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Roca salad';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Breakfast Meal 5', 'Toast + omelette + greek salad', NULL, NULL, NULL, NULL, 180, 4)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Toast + omelette + greek salad') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Toast + omelette + greek salad';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Breakfast Meal 6', 'Oats - nuts - yogurt - honey', NULL, NULL, NULL, NULL, 160, 5)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Oats') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Oats';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'nuts') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'nuts';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'yogurt') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'yogurt';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'honey') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'honey';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 3);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Breakfast Meal 7 (Meal 1 مكرر)', 'Eggs - Ranch chicken salad', NULL, NULL, NULL, NULL, 175, 6)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Eggs') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Eggs';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Ranch chicken salad') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Ranch chicken salad';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);

  -- Category: Dinner
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Dinner', 5) RETURNING id INTO v_category_id;

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Dinner Meal 1', 'Tuna pasta', NULL, NULL, NULL, NULL, 185, 0)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Tuna pasta') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Tuna pasta';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Dinner Meal 2', 'Yogurt + fruit salad + honey + nuts', NULL, NULL, NULL, NULL, 165, 1)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Yogurt + fruit salad + honey + nuts') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Yogurt + fruit salad + honey + nuts';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Dinner Meal 3', 'Steak salad', NULL, NULL, NULL, NULL, 195, 2)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Steak salad') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Steak salad';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Dinner Meal 4', 'Chicken salad', NULL, NULL, NULL, NULL, 180, 3)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Chicken salad') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Chicken salad';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Dinner Meal 5', 'Chicken soup', NULL, NULL, NULL, NULL, 155, 4)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Chicken soup') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Chicken soup';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);

  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order)
    VALUES (v_company_id, v_category_id, 'Dinner Meal 6', 'Orzo soup with meat', NULL, NULL, NULL, NULL, 190, 5)
    RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'Orzo soup with meat') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'Orzo soup with meat';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);

END $$;