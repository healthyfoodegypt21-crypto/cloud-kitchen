-- Companies & Menus module: standalone from existing brands table.
-- Adds new tables only; does not modify or drop any existing table/data.

CREATE TABLE public.menu_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  phone_numbers text[] NOT NULL DEFAULT '{}',
  contact_person text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.menu_company_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.menu_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.menu_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.menu_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE public.menu_company_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.menu_companies(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.menu_company_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  calories numeric(10,2),
  protein numeric(10,2),
  carbs numeric(10,2),
  fat numeric(10,2),
  fiber numeric(10,2),
  display_order int NOT NULL DEFAULT 0,
  -- Reserved for future optional fields (price, image, sku, availability, prep time,
  -- allergens, tags, portion size, cooking method, etc.) without further migrations.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.menu_meal_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES public.menu_company_meals(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.menu_ingredients(id) ON DELETE RESTRICT,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meal_id, ingredient_id)
);

CREATE INDEX menu_company_categories_company_id_idx ON public.menu_company_categories (company_id);
CREATE INDEX menu_company_meals_company_id_idx ON public.menu_company_meals (company_id);
CREATE INDEX menu_company_meals_category_id_idx ON public.menu_company_meals (category_id);
CREATE INDEX menu_ingredients_company_id_idx ON public.menu_ingredients (company_id);
CREATE INDEX menu_meal_ingredients_meal_id_idx ON public.menu_meal_ingredients (meal_id);
CREATE INDEX menu_meal_ingredients_ingredient_id_idx ON public.menu_meal_ingredients (ingredient_id);

CREATE TRIGGER set_menu_companies_updated_at BEFORE UPDATE ON public.menu_companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_menu_company_categories_updated_at BEFORE UPDATE ON public.menu_company_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_menu_company_meals_updated_at BEFORE UPDATE ON public.menu_company_meals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_menu_ingredients_updated_at BEFORE UPDATE ON public.menu_ingredients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.menu_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_company_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_company_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_meal_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies menus page access can view companies" ON public.menu_companies
  FOR SELECT TO authenticated USING (public.has_page_permission(auth.uid(), 'companies-menus'));
CREATE POLICY "Companies menus page access can manage companies" ON public.menu_companies
  FOR ALL TO authenticated USING (public.has_page_permission(auth.uid(), 'companies-menus')) WITH CHECK (public.has_page_permission(auth.uid(), 'companies-menus'));

CREATE POLICY "Companies menus page access can view categories" ON public.menu_company_categories
  FOR SELECT TO authenticated USING (public.has_page_permission(auth.uid(), 'companies-menus'));
CREATE POLICY "Companies menus page access can manage categories" ON public.menu_company_categories
  FOR ALL TO authenticated USING (public.has_page_permission(auth.uid(), 'companies-menus')) WITH CHECK (public.has_page_permission(auth.uid(), 'companies-menus'));

CREATE POLICY "Companies menus page access can view meals" ON public.menu_company_meals
  FOR SELECT TO authenticated USING (public.has_page_permission(auth.uid(), 'companies-menus'));
CREATE POLICY "Companies menus page access can manage meals" ON public.menu_company_meals
  FOR ALL TO authenticated USING (public.has_page_permission(auth.uid(), 'companies-menus')) WITH CHECK (public.has_page_permission(auth.uid(), 'companies-menus'));

CREATE POLICY "Companies menus page access can view ingredients" ON public.menu_ingredients
  FOR SELECT TO authenticated USING (public.has_page_permission(auth.uid(), 'companies-menus'));
CREATE POLICY "Companies menus page access can manage ingredients" ON public.menu_ingredients
  FOR ALL TO authenticated USING (public.has_page_permission(auth.uid(), 'companies-menus')) WITH CHECK (public.has_page_permission(auth.uid(), 'companies-menus'));

CREATE POLICY "Companies menus page access can view meal ingredients" ON public.menu_meal_ingredients
  FOR SELECT TO authenticated USING (public.has_page_permission(auth.uid(), 'companies-menus'));
CREATE POLICY "Companies menus page access can manage meal ingredients" ON public.menu_meal_ingredients
  FOR ALL TO authenticated USING (public.has_page_permission(auth.uid(), 'companies-menus')) WITH CHECK (public.has_page_permission(auth.uid(), 'companies-menus'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_companies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_company_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_company_meals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_ingredients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_meal_ingredients;

-- Backfill: grant the new page permission to existing owners so they retain full access immediately.
INSERT INTO public.user_page_permissions (user_id, page)
SELECT ur.user_id, 'companies-menus'
FROM public.user_roles ur
WHERE ur.role = 'owner'
ON CONFLICT (user_id, page) DO NOTHING;
