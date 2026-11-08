-- Rebuilds the Healthy Station company menu from D:/Healthy Station data base.xlsx.
-- Only ingredient links explicitly present in the workbook matrix are seeded.

DO $$
DECLARE
  v_company_id uuid;
  v_category_id uuid;
  v_meal_id uuid;
  v_ingredient_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.menu_companies WHERE lower(trim(name)) = lower(trim('Healthy Station')) LIMIT 1;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Healthy Station company not found; create it first from the Companies & Menus page.'; END IF;

  DELETE FROM public.menu_company_categories WHERE company_id = v_company_id;
  DELETE FROM public.menu_ingredients WHERE company_id = v_company_id;

  -- Category: Beef
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Beef', 0) RETURNING id INTO v_category_id;
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Shark sriracha', 'قطع من اللحم مع صوص السريرتشا التيلاندي الحار مع الأرز البسمتي والخضراوات', 655, 43, 75, 21, 298, 0) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكعبات لحم') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكعبات لحم';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Shish kebabs', 'قطع الكباب المشوي بالتتبيلة السورية مع أرز بسمتي والخضراوات الطازجة', 623, 43, 68, 21, 322, 1) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكعبات لحم') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكعبات لحم';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Steak noodles', 'شرائح اللحم بالتتبيلة الآسيوية مع المكرونة الفتوتشيني ومجموعة من الخضراوات', 714, 47, 82, 31, 321, 2) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكرونة فيتوتشيني') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكرونة فيتوتشيني';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Mushroom sauce steak', 'ستيك مقطع شرائح بصوص المشروم المميز بكريمة لايت مع أرز بسمتي والخضراوات', 755, 42, 68, 35, 327, 3) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Steak tejano', 'شرائح الستيك مع الزبادي اللايت والفلفل الألوان يقدم مع أرز بسمتي وخضراوات مشوية', 544, 39, 80, 19, 288, 4) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Russian beef', 'شرائح الستيك مع صوص الاستروجانوف المميز والمشروم ومكرونة الفيتوتشيني تقدم مع خضراوات مشوية', 618, 44, 82, 25, 285, 5) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكرونة فيوزلي') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكرونة فيوزلي';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Beef shawarma', 'شرائح الستيك ممزوج مع الزبادي اللايت وشرائح الفلفل الألوان يقدم مع أرز بسمتي وبطاطس ويدجز', 679, 42, 75, 22, 285, 6) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'بطاطس ويدجيز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'بطاطس ويدجيز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Beef and vigge', 'شرائح الستيك المشوية مع مجموعة من الخضراوات الطازجة يقدم مع الأرز البسمتي', 608, 41, 38, 19, 295, 7) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Steak pepper', 'استيك اللحم بصوص الفلفل المميز يقدم مع أرز بسمتي وخضراوات سوتيه', 745, 41, 66, 35, 306, 8) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'استيك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'استيك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  -- Category: Chicken
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Chicken', 1) RETURNING id INTO v_category_id;
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Chicken veggie', 'صدور دجاج مشوية مع فلفل ألوان وخضار موسمي مشوي مع أرز بسمتي وخضار طازج', 466, 42, 48, 10, 222, 0) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج كامله') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج كامله';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Chicken fettuccine', 'دجاج مطهو مع نودلز وخضار في مقلاة الووك الصينية بصويا صوص وخضار طازج', 647, 41, 69, 23, 231, 1) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكرونة فيتوتشيني') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكرونة فيتوتشيني';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكعبات دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكعبات دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Cordon blue', 'صدور دجاج محشوة بمزيج تركي مدخن وبيف مشوية ع الجريل مع أرز وخضراوات', 642, 55, 60, 16, 238, 2) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج محشية') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج محشية';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Hawaiian chicken', 'صدور دجاج مشوي مع أرز بسمتي وقطع أناناس تقدم مع خضراوات طازجة', 591, 47, 66, 11, 248, 3) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج كامله') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج كامله';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'BBQ', 'صدور دجاج مشوية مع صوص باربيكيو مع مكرونة فيوزلي وخضراوات طازجة', 579, 48, 62, 12, 238, 4) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكرونة فيوزلي') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكرونة فيوزلي';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج كامله') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج كامله';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Chicken tejano', 'فاهيتا دجاج بطريقة التيجانو مع فلفل ألوان وأرز بسمتي تقدم مع خضراوات طازجة', 466, 42, 48, 10, 248, 5) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'شرائح دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'شرائح دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Sweet and sour', 'شرائح دجاج بتتبيلة شرق الصين مع قطع أناناس وصوص سويت أند سور مع أرز بسمتي', 700, 41, 105, 10, 239, 6) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'شرائح دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'شرائح دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Chicken Piccata', '', NULL, NULL, NULL, NULL, NULL, 7) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج كامله') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج كامله';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Chicken Shish Taouk', '', NULL, NULL, NULL, NULL, NULL, 8) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكعبات دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكعبات دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Grilled Chicken', '', NULL, NULL, NULL, NULL, NULL, 9) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'صدور دجاج كامله') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'صدور دجاج كامله';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Chicken Shawarma', '', NULL, NULL, NULL, NULL, NULL, 10) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'شرائح دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'شرائح دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Curry Chicken', '', NULL, NULL, NULL, NULL, NULL, 11) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'مكعبات دجاج') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'مكعبات دجاج';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  -- Category: Seafood
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Seafood', 2) RETURNING id INTO v_category_id;
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Grilled fish fillet', 'فيليه سمك بالروزماري والليمون بالفرن يقدم مع أرز بسمتي وخضراوات مشوية', 428, 36, 53, 8, 268, 0) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'فيليه سمك') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'فيليه سمك';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Paella seafood', 'جمبري بالطريقة الإسبانية بمزيج مأكولات بحرية وخضراوات مع أرز بسمتي وخضراوات', 516, 37, 74, 8, 339, 1) RETURNING id INTO v_meal_id;
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
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Grilled seafood', 'مجموعة مأكولات بحرية مشوية تقدم مع أرز بسمتي وخضار مشوي', 374, 36, 44, 4, 349, 2) RETURNING id INTO v_meal_id;
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
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Ranch shrimp', 'جمبري مشوي مع صوص الرانش المميز يقدم مع أرز بسمتي وخضراوات مشوية', 465, 36, 60, 9, 368, 3) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'جمبري') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'جمبري';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Grilled calamari', 'كلاماري مشوي مع فلفل ألوان يقدم مع باستا بصوص المشروم اللايت', 374, 24, 50, 2, 319, 4) RETURNING id INTO v_meal_id;
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'ارز') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'ارز';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 0);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'خضار') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'خضار';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 1);
  INSERT INTO public.menu_ingredients (company_id, name) VALUES (v_company_id, 'كالماري') ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ingredient_id FROM public.menu_ingredients WHERE company_id = v_company_id AND name = 'كالماري';
  INSERT INTO public.menu_meal_ingredients (meal_id, ingredient_id, display_order) VALUES (v_meal_id, v_ingredient_id, 2);

  -- Category: Salad
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Salad', 3) RETURNING id INTO v_category_id;
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Tuna salad', 'قطع تونة متبلة، مكرونة فيوزلي، ذرة صفراء، فلفل ألوان، كابوتشي، شرائح زيتون', 406, 40.36, 28.68, 14.95, 156, 0) RETURNING id INTO v_meal_id;
  -- Tuna salad: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Fungi salad', 'أوراق الجرجير مع مشروم فريش وجبن مع فلفل ألوان', 320, 21.6, 14.6, 21.2, 90, 1) RETURNING id INTO v_meal_id;
  -- Fungi salad: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Seafood salad', 'جمبري، كابوريا، توست بني محمص، كابوتشا، فلفل ألوان، مكرونة قواقع', 406, 23, 53, 11.86, 216, 2) RETURNING id INTO v_meal_id;
  -- Seafood salad: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Chicken Caesar salad', 'قطع صدور دجاج مشوية، خبز محمص، كابوتشا، جبنة، صوص سيزر', 385, 33.5, 26.7, 15.4, 156, 3) RETURNING id INTO v_meal_id;
  -- Chicken Caesar salad: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Greek salad', 'فلفل ألوان، كابوتشا، جبن فيتا قليل الدسم، قطع خيار، زيتون', 213, 14.9, 12.2, 11.8, 180, 4) RETURNING id INTO v_meal_id;
  -- Greek salad: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Green salad', 'مشروم فريش، بروكلي، كابوتشا، فلفل ألوان، خيار', 64, 4.2, 13.3, 0.6, 84, 5) RETURNING id INTO v_meal_id;
  -- Green salad: no ingredient row exists in the workbook matrix.

  -- Category: Breakfast (غير مدون ماكروز بالمنيو)
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Breakfast (غير مدون ماكروز بالمنيو)', 4) RETURNING id INTO v_category_id;
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Breakfast Meal 1', 'boiled eggs - Cheese - Greek chicken salad', NULL, NULL, NULL, NULL, 108, 0) RETURNING id INTO v_meal_id;
  -- Breakfast Meal 1: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Breakfast Meal 2', 'sandwich cheese and chicken - Beetroot salad', NULL, NULL, NULL, NULL, 110, 1) RETURNING id INTO v_meal_id;
  -- Breakfast Meal 2: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Breakfast Meal 3', 'Club sandwich (chicken and turkey) - Fresh garden salad', NULL, NULL, NULL, NULL, 115, 2) RETURNING id INTO v_meal_id;
  -- Breakfast Meal 3: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Breakfast Meal 4', 'sandwich cheese and turkey - Roca salad', NULL, NULL, NULL, NULL, 113, 3) RETURNING id INTO v_meal_id;
  -- Breakfast Meal 4: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Breakfast Meal 5', 'toast - omelette - Greek salad', NULL, NULL, NULL, NULL, 108, 4) RETURNING id INTO v_meal_id;
  -- Breakfast Meal 5: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Breakfast Meal 6', 'oats - nuts - yogurt - honey', NULL, NULL, NULL, NULL, 105, 5) RETURNING id INTO v_meal_id;
  -- Breakfast Meal 6: no ingredient row exists in the workbook matrix.

  -- Category: Dinner (غير مدون ماكروز بالمنيو)
  INSERT INTO public.menu_company_categories (company_id, name, display_order) VALUES (v_company_id, 'Dinner (غير مدون ماكروز بالمنيو)', 5) RETURNING id INTO v_category_id;
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Dinner Meal 1', 'tuna pasta', NULL, NULL, NULL, NULL, 113, 0) RETURNING id INTO v_meal_id;
  -- Dinner Meal 1: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Dinner Meal 2', 'yogurt + fruit salad, honey + nuts', NULL, NULL, NULL, NULL, 108, 1) RETURNING id INTO v_meal_id;
  -- Dinner Meal 2: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Dinner Meal 3', 'steak salad', NULL, NULL, NULL, NULL, 110, 2) RETURNING id INTO v_meal_id;
  -- Dinner Meal 3: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Dinner Meal 4', 'chicken salad', NULL, NULL, NULL, NULL, 113, 3) RETURNING id INTO v_meal_id;
  -- Dinner Meal 4: no ingredient row exists in the workbook matrix.
  INSERT INTO public.menu_company_meals (company_id, category_id, name, description, calories, protein, carbs, fat, price, display_order) VALUES (v_company_id, v_category_id, 'Dinner Meal 6', 'Orzo soup with meat', NULL, NULL, NULL, NULL, 115, 4) RETURNING id INTO v_meal_id;
  -- Dinner Meal 6: no ingredient row exists in the workbook matrix.

END $$;
