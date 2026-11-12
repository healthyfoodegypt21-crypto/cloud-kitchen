-- Unified Companies, Menu & Packages Hub Migration
-- Links menu_companies <-> brands, adds availability/costing/fiber/ingredients enrichment,
-- and aligns RLS so either 'menu-packages' or 'companies-menus' permission grants access.

-- 1. Link menu_companies to operational brands (optional 1:1 / N:1 link)
ALTER TABLE public.menu_companies
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#10b981';

CREATE INDEX IF NOT EXISTS menu_companies_brand_id_idx ON public.menu_companies (brand_id);

-- Backfill brand_id on existing menu_companies by matching normalized name
UPDATE public.menu_companies mc
SET
  brand_id = b.id,
  color = COALESCE(NULLIF(b.color, ''), '#10b981')
FROM public.brands b
WHERE mc.brand_id IS NULL
  AND lower(trim(mc.name)) = lower(trim(b.name));

-- 2. Enrich menu_company_meals with availability flag
ALTER TABLE public.menu_company_meals
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;

-- 3. Enrich menu_ingredients with optional unit_cost_per_kg and linked inventory item_id
ALTER TABLE public.menu_ingredients
  ADD COLUMN IF NOT EXISTS inventory_item_id uuid,
  ADD COLUMN IF NOT EXISTS unit_cost_per_kg numeric(10,2);

-- 4. Enrich operational menu_items with description, fiber, custom_category, availability, display_order, and ingredients JSONB snapshot
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fiber numeric(10,2),
  ADD COLUMN IF NOT EXISTS custom_category text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS display_order int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ingredients_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 5. Broaden RLS on menu_companies / categories / meals / ingredients so owner OR menu-packages OR companies-menus can access
DROP POLICY IF EXISTS "Companies menus page access can view companies" ON public.menu_companies;
DROP POLICY IF EXISTS "Companies menus page access can manage companies" ON public.menu_companies;
CREATE POLICY "Unified menu hub can view companies" ON public.menu_companies
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  );
CREATE POLICY "Unified menu hub can manage companies" ON public.menu_companies
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  );

DROP POLICY IF EXISTS "Companies menus page access can view categories" ON public.menu_company_categories;
DROP POLICY IF EXISTS "Companies menus page access can manage categories" ON public.menu_company_categories;
CREATE POLICY "Unified menu hub can view categories" ON public.menu_company_categories
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  );
CREATE POLICY "Unified menu hub can manage categories" ON public.menu_company_categories
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  );

DROP POLICY IF EXISTS "Companies menus page access can view meals" ON public.menu_company_meals;
DROP POLICY IF EXISTS "Companies menus page access can manage meals" ON public.menu_company_meals;
CREATE POLICY "Unified menu hub can view meals" ON public.menu_company_meals
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  );
CREATE POLICY "Unified menu hub can manage meals" ON public.menu_company_meals
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  );

DROP POLICY IF EXISTS "Companies menus page access can view ingredients" ON public.menu_ingredients;
DROP POLICY IF EXISTS "Companies menus page access can manage ingredients" ON public.menu_ingredients;
CREATE POLICY "Unified menu hub can view ingredients" ON public.menu_ingredients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  );
CREATE POLICY "Unified menu hub can manage ingredients" ON public.menu_ingredients
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  );

DROP POLICY IF EXISTS "Companies menus page access can view meal ingredients" ON public.menu_meal_ingredients;
DROP POLICY IF EXISTS "Companies menus page access can manage meal ingredients" ON public.menu_meal_ingredients;
CREATE POLICY "Unified menu hub can view meal ingredients" ON public.menu_meal_ingredients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  );
CREATE POLICY "Unified menu hub can manage meal ingredients" ON public.menu_meal_ingredients
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'menu-packages')
    OR public.has_page_permission(auth.uid(), 'companies-menus')
  );
