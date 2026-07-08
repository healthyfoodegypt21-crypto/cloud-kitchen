-- Enterprise inventory extension
-- Adds categories, warehouses, batches, stock counts, and transfer workflows on top of the ERP foundation.

CREATE TYPE public.inventory_count_type AS ENUM ('daily', 'weekly', 'monthly', 'spot');
CREATE TYPE public.inventory_transfer_status AS ENUM ('draft', 'requested', 'approved', 'in_transit', 'received', 'cancelled');
CREATE TYPE public.inventory_batch_status AS ENUM ('available', 'reserved', 'consumed', 'expired', 'damaged');

CREATE OR REPLACE FUNCTION public.can_manage_inventory()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'owner')
    OR public.has_any_page_permission(auth.uid(), ARRAY['inventory', 'purchases'])
$$;

CREATE TABLE public.inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  parent_code text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  warehouse_code text NOT NULL,
  name text NOT NULL,
  warehouse_type text NOT NULL DEFAULT 'general',
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  location text NOT NULL DEFAULT '',
  capacity_qty numeric(14,3),
  status text NOT NULL DEFAULT 'active',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, warehouse_code)
);
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE CASCADE,
  batch_no text NOT NULL,
  production_date date,
  expiry_date date,
  received_at timestamptz NOT NULL DEFAULT now(),
  quantity_on_hand numeric(14,3) NOT NULL DEFAULT 0,
  reserved_qty numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  status inventory_batch_status NOT NULL DEFAULT 'available',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, item_id, batch_no)
);
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  count_no text NOT NULL UNIQUE,
  count_type inventory_count_type NOT NULL DEFAULT 'spot',
  count_date date NOT NULL DEFAULT CURRENT_DATE,
  counted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  book_qty numeric(14,3) NOT NULL DEFAULT 0,
  physical_qty numeric(14,3) NOT NULL DEFAULT 0,
  variance_qty numeric(14,3) GENERATED ALWAYS AS (physical_qty - book_qty) STORED,
  variance_ratio numeric(14,4) GENERATED ALWAYS AS (
    CASE WHEN book_qty = 0 THEN 0 ELSE ((physical_qty - book_qty) / book_qty) END
  ) STORED,
  variance_reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
  book_qty numeric(14,3) NOT NULL DEFAULT 0,
  physical_qty numeric(14,3) NOT NULL DEFAULT 0,
  variance_qty numeric(14,3) GENERATED ALWAYS AS (physical_qty - book_qty) STORED,
  reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inventory_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  transfer_no text NOT NULL UNIQUE,
  from_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status inventory_transfer_status NOT NULL DEFAULT 'draft',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  received_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_transfer_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inventory_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_request_id uuid NOT NULL REFERENCES public.inventory_transfer_requests(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
  requested_qty numeric(14,3) NOT NULL DEFAULT 0,
  approved_qty numeric(14,3) NOT NULL DEFAULT 0,
  received_qty numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_inventory_categories_active ON public.inventory_categories (is_active, sort_order);
CREATE INDEX idx_warehouses_brand_id ON public.warehouses (brand_id, status);
CREATE INDEX idx_inventory_batches_brand_id ON public.inventory_batches (brand_id, expiry_date, status);
CREATE INDEX idx_inventory_counts_brand_id ON public.inventory_counts (brand_id, count_date DESC);
CREATE INDEX idx_inventory_transfer_requests_brand_id ON public.inventory_transfer_requests (brand_id, requested_at DESC);

CREATE TRIGGER set_inventory_categories_updated_at BEFORE UPDATE ON public.inventory_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_warehouses_updated_at BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_inventory_batches_updated_at BEFORE UPDATE ON public.inventory_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_inventory_counts_updated_at BEFORE UPDATE ON public.inventory_counts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_inventory_count_lines_updated_at BEFORE UPDATE ON public.inventory_count_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_inventory_transfer_requests_updated_at BEFORE UPDATE ON public.inventory_transfer_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_inventory_transfer_items_updated_at BEFORE UPDATE ON public.inventory_transfer_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER audit_inventory_categories AFTER INSERT OR UPDATE OR DELETE ON public.inventory_categories FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_warehouses AFTER INSERT OR UPDATE OR DELETE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_inventory_batches AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_inventory_counts AFTER INSERT OR UPDATE OR DELETE ON public.inventory_counts FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_inventory_count_lines AFTER INSERT OR UPDATE OR DELETE ON public.inventory_count_lines FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_inventory_transfer_requests AFTER INSERT OR UPDATE OR DELETE ON public.inventory_transfer_requests FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_inventory_transfer_items AFTER INSERT OR UPDATE OR DELETE ON public.inventory_transfer_items FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();

CREATE POLICY "Authenticated can view inventory categories" ON public.inventory_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Inventory managers can manage categories" ON public.inventory_categories FOR ALL TO authenticated USING (public.can_manage_inventory()) WITH CHECK (public.can_manage_inventory());

CREATE POLICY "Users can view warehouses for accessible brands" ON public.warehouses FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage warehouses for accessible brands" ON public.warehouses FOR ALL TO authenticated USING (public.can_access_brand(brand_id) AND public.can_manage_inventory()) WITH CHECK (public.can_access_brand(brand_id) AND public.can_manage_inventory());

CREATE POLICY "Users can view inventory batches" ON public.inventory_batches FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage inventory batches" ON public.inventory_batches FOR ALL TO authenticated USING (public.can_access_brand(brand_id) AND public.can_manage_inventory()) WITH CHECK (public.can_access_brand(brand_id) AND public.can_manage_inventory());

CREATE POLICY "Users can view inventory counts" ON public.inventory_counts FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage inventory counts" ON public.inventory_counts FOR ALL TO authenticated USING (public.can_access_brand(brand_id) AND public.can_manage_inventory()) WITH CHECK (public.can_access_brand(brand_id) AND public.can_manage_inventory());

CREATE POLICY "Users can view inventory count lines" ON public.inventory_count_lines FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.inventory_counts c
    WHERE c.id = inventory_count_id AND public.can_access_brand(c.brand_id)
  )
);
CREATE POLICY "Users can manage inventory count lines" ON public.inventory_count_lines FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.inventory_counts c
    WHERE c.id = inventory_count_id AND public.can_access_brand(c.brand_id) AND public.can_manage_inventory()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inventory_counts c
    WHERE c.id = inventory_count_id AND public.can_access_brand(c.brand_id) AND public.can_manage_inventory()
  )
);

CREATE POLICY "Users can view inventory transfer requests" ON public.inventory_transfer_requests FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage inventory transfer requests" ON public.inventory_transfer_requests FOR ALL TO authenticated USING (public.can_access_brand(brand_id) AND public.can_manage_inventory()) WITH CHECK (public.can_access_brand(brand_id) AND public.can_manage_inventory());

CREATE POLICY "Users can view inventory transfer items" ON public.inventory_transfer_items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.inventory_transfer_requests r
    WHERE r.id = transfer_request_id AND public.can_access_brand(r.brand_id)
  )
);
CREATE POLICY "Users can manage inventory transfer items" ON public.inventory_transfer_items FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.inventory_transfer_requests r
    WHERE r.id = transfer_request_id AND public.can_access_brand(r.brand_id) AND public.can_manage_inventory()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inventory_transfer_requests r
    WHERE r.id = transfer_request_id AND public.can_access_brand(r.brand_id) AND public.can_manage_inventory()
  )
);

INSERT INTO public.inventory_categories (code, name_ar, name_en, sort_order, is_active) VALUES
  ('proteins', 'البروتينات', 'Proteins', 10, true),
  ('vegetables', 'الخضروات', 'Vegetables', 20, true),
  ('carbohydrates', 'الكربوهيدرات', 'Carbohydrates', 30, true),
  ('dairy', 'منتجات الألبان', 'Dairy', 40, true),
  ('sauces', 'الصوصات', 'Sauces', 50, true),
  ('spices', 'البهارات والتوابل', 'Spices', 60, true),
  ('oils', 'الزيوت والدهون', 'Oils & Fats', 70, true),
  ('dry_goods', 'المواد الجافة', 'Dry Goods', 80, true),
  ('packaging', 'مواد التعبئة والتغليف', 'Packaging', 90, true),
  ('cleaning', 'المنظفات', 'Cleaning', 100, true),
  ('beverages', 'المشروبات', 'Beverages', 110, true),
  ('finished_products', 'المنتجات الجاهزة', 'Finished Products', 120, true);
