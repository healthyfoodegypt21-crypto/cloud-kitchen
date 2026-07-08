CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('meat', 'chicken', 'fish', 'mix')),
  price numeric(10,2),
  protein int NOT NULL DEFAULT 0,
  carbs int NOT NULL DEFAULT 0,
  fat int NOT NULL DEFAULT 0,
  calories int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);

CREATE TABLE public.package_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  days_count int NOT NULL CHECK (days_count > 0),
  price numeric(10,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);

CREATE TABLE public.package_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_plan_id uuid NOT NULL REFERENCES public.package_plans(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  custom_meal_name text,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (menu_item_id IS NOT NULL AND custom_meal_name IS NULL) OR
    (menu_item_id IS NULL AND custom_meal_name IS NOT NULL AND length(trim(custom_meal_name)) > 0)
  )
);

ALTER TABLE public.orders
  ADD COLUMN order_mode text NOT NULL DEFAULT 'package' CHECK (order_mode IN ('package', 'meals')),
  ADD COLUMN package_plan_id uuid REFERENCES public.package_plans(id) ON DELETE SET NULL,
  ADD COLUMN selected_meal_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view menu items for their brands"
  ON public.menu_items FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'owner') OR
    brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
  );

CREATE POLICY "Owners can create menu items"
  ON public.menu_items FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Owners can update menu items"
  ON public.menu_items FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'owner')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Owners can delete menu items"
  ON public.menu_items FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Users can view package plans for their brands"
  ON public.package_plans FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'owner') OR
    brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
  );

CREATE POLICY "Owners can create package plans"
  ON public.package_plans FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Owners can update package plans"
  ON public.package_plans FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'owner')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Owners can delete package plans"
  ON public.package_plans FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Users can view package plan items for their brands"
  ON public.package_plan_items FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.package_plans package_plan
      WHERE package_plan.id = package_plan_id
      AND (
        public.has_role(auth.uid(), 'owner') OR
        package_plan.brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Owners can create package plan items"
  ON public.package_plan_items FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Owners can update package plan items"
  ON public.package_plan_items FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'owner')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Owners can delete package plan items"
  ON public.package_plan_items FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'owner')
  );

CREATE INDEX menu_items_brand_id_idx ON public.menu_items (brand_id, category, created_at DESC);
CREATE INDEX package_plans_brand_id_idx ON public.package_plans (brand_id, created_at DESC);
CREATE INDEX package_plan_items_package_plan_id_idx ON public.package_plan_items (package_plan_id, display_order ASC);

CREATE TRIGGER set_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_package_plans_updated_at
  BEFORE UPDATE ON public.package_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();