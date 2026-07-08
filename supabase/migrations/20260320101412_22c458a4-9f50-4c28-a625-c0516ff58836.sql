
-- Brands table
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#22c55e',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- Seed brands
INSERT INTO public.brands (name, color) VALUES
  ('Healthy Food', '#22c55e'),
  ('Healthy Station', '#3b82f6'),
  ('Protein Box', '#f59e0b');

-- Brand access per user
CREATE TABLE public.user_brand_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  UNIQUE(user_id, brand_id)
);
ALTER TABLE public.user_brand_access ENABLE ROW LEVEL SECURITY;

-- Page permissions per user
CREATE TABLE public.user_page_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page text NOT NULL,
  UNIQUE(user_id, page)
);
ALTER TABLE public.user_page_permissions ENABLE ROW LEVEL SECURITY;

-- Order source enum
CREATE TYPE public.order_source AS ENUM ('facebook', 'instagram', 'website', 'referral', 'other');

-- Orders table (replacing localStorage)
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  package text NOT NULL,
  meal_type text NOT NULL DEFAULT 'lunch',
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  price numeric(10,2) NOT NULL DEFAULT 0,
  source order_source NOT NULL DEFAULT 'other',
  brand_id uuid REFERENCES public.brands(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Targets table
CREATE TABLE public.targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- 'daily_orders', 'daily_sales', 'monthly_orders', 'monthly_sales'
  value numeric(10,2) NOT NULL,
  brand_id uuid REFERENCES public.brands(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;

-- Seed default targets
INSERT INTO public.targets (type, value) VALUES
  ('daily_orders', 20),
  ('daily_sales', 1000),
  ('monthly_orders', 500),
  ('monthly_sales', 25000);

-- Achievements table
CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge text NOT NULL, -- 'bronze', 'silver', 'gold'
  achieved_at timestamptz NOT NULL DEFAULT now(),
  period text NOT NULL, -- '2026-03' for monthly
  order_count int NOT NULL DEFAULT 0
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- RLS policies for brands
CREATE POLICY "Authenticated users can view brands" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners can manage brands" ON public.brands FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- RLS for user_brand_access
CREATE POLICY "Users can view own brand access" ON public.user_brand_access FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can manage brand access" ON public.user_brand_access FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- RLS for user_page_permissions
CREATE POLICY "Users can view own permissions" ON public.user_page_permissions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners can manage permissions" ON public.user_page_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- RLS for orders (users see orders for their brands)
CREATE POLICY "Users can view orders for their brands" ON public.orders FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR
  brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'owner') OR
  brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update orders" ON public.orders FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR
  brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
);

-- RLS for targets
CREATE POLICY "Authenticated can view targets" ON public.targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners can manage targets" ON public.targets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- RLS for achievements
CREATE POLICY "Users can view achievements" ON public.achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert achievements" ON public.achievements FOR INSERT TO authenticated WITH CHECK (true);

-- Enable realtime for orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- Updated_at trigger for orders
CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_targets_updated_at BEFORE UPDATE ON public.targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
