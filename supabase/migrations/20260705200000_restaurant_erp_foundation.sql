-- Restaurant ERP foundation
-- Core normalized tables for items, suppliers, purchases, inventory, recipes, production,
-- sales, waste, returns, employees, expenses, and audit logging.

CREATE TYPE public.erp_item_status AS ENUM ('active', 'inactive');
CREATE TYPE public.purchase_order_status AS ENUM ('draft', 'approved', 'ordered', 'received', 'cancelled');
CREATE TYPE public.receipt_status AS ENUM ('pending', 'received', 'reversed');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'cancelled');
CREATE TYPE public.inventory_movement_type AS ENUM (
  'purchase_receipt',
  'purchase_return',
  'sale_issue',
  'production_consumption',
  'production_output',
  'waste',
  'adjustment',
  'customer_return',
  'supplier_return'
);
CREATE TYPE public.recipe_status AS ENUM ('active', 'inactive');
CREATE TYPE public.production_order_status AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.expense_category AS ENUM ('rent', 'electricity', 'gas', 'internet', 'marketing', 'maintenance', 'salaries', 'other');
CREATE TYPE public.return_party_type AS ENUM ('customer', 'supplier');

CREATE OR REPLACE FUNCTION public.has_page_permission(_user_id UUID, _page TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_page_permissions
    WHERE user_id = _user_id AND page = _page
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_page_permission(_user_id UUID, _pages TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_page_permissions
    WHERE user_id = _user_id AND page = ANY(_pages)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_brand(_brand_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'owner')
    OR _brand_id IS NULL
    OR _brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.erp_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  record_id_text text;
BEGIN
  record_id_text := COALESCE((to_jsonb(NEW)->>'id'), (to_jsonb(OLD)->>'id'));

  INSERT INTO public.audit_logs (
    actor_user_id,
    table_name,
    record_id,
    action_type,
    old_data,
    new_data
  ) VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    record_id_text,
    TG_OP,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name text NOT NULL,
  record_id text,
  action_type text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.items_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  item_code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  purchase_unit text NOT NULL,
  usage_unit text NOT NULL,
  conversion_factor numeric(14,4) NOT NULL DEFAULT 1,
  min_stock numeric(14,3) NOT NULL DEFAULT 0,
  last_purchase_price numeric(14,2) NOT NULL DEFAULT 0,
  avg_cost numeric(14,2) NOT NULL DEFAULT 0,
  status erp_item_status NOT NULL DEFAULT 'active',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.items_master ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  supplier_code text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  phone_secondary text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  payment_terms text NOT NULL DEFAULT '',
  lead_time_days integer NOT NULL DEFAULT 0,
  last_purchase_at timestamptz,
  status erp_item_status NOT NULL DEFAULT 'active',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.supplier_item_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE CASCADE,
  last_price numeric(14,2) NOT NULL DEFAULT 0,
  preferred boolean NOT NULL DEFAULT false,
  lead_time_days integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, item_id, brand_id)
);
ALTER TABLE public.supplier_item_prices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inventory_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE CASCADE,
  location_name text NOT NULL DEFAULT 'main',
  on_hand numeric(14,3) NOT NULL DEFAULT 0,
  reserved_qty numeric(14,3) NOT NULL DEFAULT 0,
  expected_qty numeric(14,3) NOT NULL DEFAULT 0,
  last_count_qty numeric(14,3) NOT NULL DEFAULT 0,
  last_counted_at timestamptz,
  variance_qty numeric(14,3) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, item_id, location_name)
);
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE CASCADE,
  movement_type inventory_movement_type NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  reference_table text NOT NULL DEFAULT '',
  reference_id text NOT NULL DEFAULT '',
  location_name text NOT NULL DEFAULT 'main',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  po_number text NOT NULL UNIQUE,
  status purchase_order_status NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ordered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE RESTRICT,
  quantity_ordered numeric(14,3) NOT NULL DEFAULT 0,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_discount numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL UNIQUE,
  status receipt_status NOT NULL DEFAULT 'pending',
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.purchase_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE RESTRICT,
  received_qty numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_receipt_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  purchase_receipt_id uuid REFERENCES public.purchase_receipts(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  status invoice_status NOT NULL DEFAULT 'draft',
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  supplier_invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  reference_no text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  finished_item_id uuid REFERENCES public.items_master(id) ON DELETE SET NULL,
  recipe_code text NOT NULL UNIQUE,
  name text NOT NULL,
  product_type text NOT NULL DEFAULT 'meal',
  status recipe_status NOT NULL DEFAULT 'active',
  current_version_no integer NOT NULL DEFAULT 1,
  target_yield_qty numeric(14,3) NOT NULL DEFAULT 1,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.recipe_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  yield_qty numeric(14,3) NOT NULL DEFAULT 1,
  cooked_weight numeric(14,3) NOT NULL DEFAULT 0,
  raw_weight numeric(14,3) NOT NULL DEFAULT 0,
  waste_percent numeric(6,3) NOT NULL DEFAULT 0,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  food_cost_percent numeric(6,3) NOT NULL DEFAULT 0,
  margin_percent numeric(6,3) NOT NULL DEFAULT 0,
  suggested_sale_price numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, version_no)
);
ALTER TABLE public.recipe_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.recipe_version_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_version_id uuid NOT NULL REFERENCES public.recipe_versions(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  waste_percent numeric(6,3) NOT NULL DEFAULT 0,
  cost_per_unit numeric(14,2) NOT NULL DEFAULT 0,
  line_cost numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recipe_version_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  recipe_version_id uuid REFERENCES public.recipe_versions(id) ON DELETE SET NULL,
  finished_item_id uuid REFERENCES public.items_master(id) ON DELETE SET NULL,
  order_number text NOT NULL UNIQUE,
  planned_qty numeric(14,3) NOT NULL DEFAULT 0,
  produced_qty numeric(14,3) NOT NULL DEFAULT 0,
  status production_order_status NOT NULL DEFAULT 'planned',
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  ended_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.production_order_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE RESTRICT,
  planned_qty numeric(14,3) NOT NULL DEFAULT 0,
  actual_qty numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  line_cost numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.production_order_materials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'cash',
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  coupon_code text NOT NULL DEFAULT '',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  item_id uuid REFERENCES public.items_master(id) ON DELETE SET NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  sales_invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  reference_no text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'amount',
  discount_value numeric(14,2) NOT NULL DEFAULT 0,
  min_order_value numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.waste_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  loss_value numeric(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  reason text NOT NULL,
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  related_production_order_id uuid REFERENCES public.production_orders(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.waste_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.return_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  party_type public.return_party_type NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  related_sales_invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE SET NULL,
  related_purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  item_id uuid NOT NULL REFERENCES public.items_master(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  employee_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  role_title text NOT NULL DEFAULT '',
  hire_date date,
  salary numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employee_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  check_in timestamptz,
  check_out timestamptz,
  overtime_minutes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'present',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, attendance_date)
);
ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employee_payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  payroll_month text NOT NULL,
  basic_salary numeric(14,2) NOT NULL DEFAULT 0,
  overtime_amount numeric(14,2) NOT NULL DEFAULT 0,
  advances_amount numeric(14,2) NOT NULL DEFAULT 0,
  deductions_amount numeric(14,2) NOT NULL DEFAULT 0,
  net_salary numeric(14,2) GENERATED ALWAYS AS ((basic_salary + overtime_amount) - (advances_amount + deductions_amount)) STORED,
  status text NOT NULL DEFAULT 'draft',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, payroll_month)
);
ALTER TABLE public.employee_payroll ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category expense_category NOT NULL DEFAULT 'other',
  description text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  vendor_name text NOT NULL DEFAULT '',
  payment_method text NOT NULL DEFAULT 'cash',
  receipt_no text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_items_master_brand_id ON public.items_master (brand_id);
CREATE INDEX idx_suppliers_brand_id ON public.suppliers (brand_id);
CREATE INDEX idx_supplier_item_prices_brand_id ON public.supplier_item_prices (brand_id);
CREATE INDEX idx_inventory_balances_brand_id ON public.inventory_balances (brand_id);
CREATE INDEX idx_inventory_movements_brand_id ON public.inventory_movements (brand_id, created_at DESC);
CREATE INDEX idx_purchase_orders_brand_id ON public.purchase_orders (brand_id, created_at DESC);
CREATE INDEX idx_purchase_receipts_brand_id ON public.purchase_receipts (brand_id, created_at DESC);
CREATE INDEX idx_supplier_invoices_brand_id ON public.supplier_invoices (brand_id, created_at DESC);
CREATE INDEX idx_recipes_brand_id ON public.recipes (brand_id);
CREATE INDEX idx_production_orders_brand_id ON public.production_orders (brand_id, created_at DESC);
CREATE INDEX idx_sales_invoices_brand_id ON public.sales_invoices (brand_id, created_at DESC);
CREATE INDEX idx_waste_entries_brand_id ON public.waste_entries (brand_id, created_at DESC);
CREATE INDEX idx_return_entries_brand_id ON public.return_entries (brand_id, created_at DESC);
CREATE INDEX idx_employees_brand_id ON public.employees (brand_id);
CREATE INDEX idx_expenses_brand_id ON public.expenses (brand_id, expense_date DESC);

-- updated_at triggers
CREATE TRIGGER set_items_master_updated_at BEFORE UPDATE ON public.items_master FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_supplier_item_prices_updated_at BEFORE UPDATE ON public.supplier_item_prices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_inventory_balances_updated_at BEFORE UPDATE ON public.inventory_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_purchase_order_items_updated_at BEFORE UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_purchase_receipts_updated_at BEFORE UPDATE ON public.purchase_receipts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_purchase_receipt_items_updated_at BEFORE UPDATE ON public.purchase_receipt_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_supplier_invoices_updated_at BEFORE UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_supplier_invoice_items_updated_at BEFORE UPDATE ON public.supplier_invoice_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_recipe_versions_updated_at BEFORE UPDATE ON public.recipe_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_recipe_version_items_updated_at BEFORE UPDATE ON public.recipe_version_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_production_orders_updated_at BEFORE UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_production_order_materials_updated_at BEFORE UPDATE ON public.production_order_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_sales_invoices_updated_at BEFORE UPDATE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_sales_invoice_items_updated_at BEFORE UPDATE ON public.sales_invoice_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_employee_attendance_updated_at BEFORE UPDATE ON public.employee_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_employee_payroll_updated_at BEFORE UPDATE ON public.employee_payroll FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit triggers
CREATE TRIGGER audit_items_master AFTER INSERT OR UPDATE OR DELETE ON public.items_master FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_suppliers AFTER INSERT OR UPDATE OR DELETE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_supplier_item_prices AFTER INSERT OR UPDATE OR DELETE ON public.supplier_item_prices FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_inventory_balances AFTER INSERT OR UPDATE OR DELETE ON public.inventory_balances FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_inventory_movements AFTER INSERT OR UPDATE OR DELETE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_purchase_orders AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_purchase_order_items AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_purchase_receipts AFTER INSERT OR UPDATE OR DELETE ON public.purchase_receipts FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_purchase_receipt_items AFTER INSERT OR UPDATE OR DELETE ON public.purchase_receipt_items FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_supplier_invoices AFTER INSERT OR UPDATE OR DELETE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_supplier_invoice_items AFTER INSERT OR UPDATE OR DELETE ON public.supplier_invoice_items FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_supplier_payments AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_recipes AFTER INSERT OR UPDATE OR DELETE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_recipe_versions AFTER INSERT OR UPDATE OR DELETE ON public.recipe_versions FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_recipe_version_items AFTER INSERT OR UPDATE OR DELETE ON public.recipe_version_items FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_production_orders AFTER INSERT OR UPDATE OR DELETE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_production_order_materials AFTER INSERT OR UPDATE OR DELETE ON public.production_order_materials FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_sales_invoices AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_sales_invoice_items AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoice_items FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_sales_payments AFTER INSERT OR UPDATE OR DELETE ON public.sales_payments FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_coupons AFTER INSERT OR UPDATE OR DELETE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_waste_entries AFTER INSERT OR UPDATE OR DELETE ON public.waste_entries FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_return_entries AFTER INSERT OR UPDATE OR DELETE ON public.return_entries FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_employee_attendance AFTER INSERT OR UPDATE OR DELETE ON public.employee_attendance FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_employee_payroll AFTER INSERT OR UPDATE OR DELETE ON public.employee_payroll FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();
CREATE TRIGGER audit_expenses AFTER INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();

-- RLS policies
CREATE POLICY "Owners can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view items for accessible brands" ON public.items_master FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage items for accessible brands" ON public.items_master FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view suppliers for accessible brands" ON public.suppliers FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage suppliers for accessible brands" ON public.suppliers FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view supplier item prices" ON public.supplier_item_prices FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage supplier item prices" ON public.supplier_item_prices FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view inventory balances" ON public.inventory_balances FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage inventory balances" ON public.inventory_balances FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view inventory movements" ON public.inventory_movements FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can insert inventory movements" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view purchase orders" ON public.purchase_orders FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage purchase orders" ON public.purchase_orders FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view purchase order items" ON public.purchase_order_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = purchase_order_id AND public.can_access_brand(brand_id))
);
CREATE POLICY "Users can manage purchase order items" ON public.purchase_order_items FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = purchase_order_id AND public.can_access_brand(brand_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = purchase_order_id AND public.can_access_brand(brand_id))
);

CREATE POLICY "Users can view receipts" ON public.purchase_receipts FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage receipts" ON public.purchase_receipts FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view receipt items" ON public.purchase_receipt_items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.purchase_receipts r
    WHERE r.id = purchase_receipt_id AND public.can_access_brand(r.brand_id)
  )
);
CREATE POLICY "Users can manage receipt items" ON public.purchase_receipt_items FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.purchase_receipts r
    WHERE r.id = purchase_receipt_id AND public.can_access_brand(r.brand_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.purchase_receipts r
    WHERE r.id = purchase_receipt_id AND public.can_access_brand(r.brand_id)
  )
);

CREATE POLICY "Users can view supplier invoices" ON public.supplier_invoices FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage supplier invoices" ON public.supplier_invoices FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view supplier invoice items" ON public.supplier_invoice_items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.supplier_invoices i
    WHERE i.id = supplier_invoice_id AND public.can_access_brand(i.brand_id)
  )
);
CREATE POLICY "Users can manage supplier invoice items" ON public.supplier_invoice_items FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.supplier_invoices i
    WHERE i.id = supplier_invoice_id AND public.can_access_brand(i.brand_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.supplier_invoices i
    WHERE i.id = supplier_invoice_id AND public.can_access_brand(i.brand_id)
  )
);

CREATE POLICY "Users can view supplier payments" ON public.supplier_payments FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage supplier payments" ON public.supplier_payments FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view recipes" ON public.recipes FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage recipes" ON public.recipes FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view recipe versions" ON public.recipe_versions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND public.can_access_brand(r.brand_id))
);
CREATE POLICY "Users can manage recipe versions" ON public.recipe_versions FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND public.can_access_brand(r.brand_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND public.can_access_brand(r.brand_id))
);

CREATE POLICY "Users can view recipe version items" ON public.recipe_version_items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.recipe_versions v
    JOIN public.recipes r ON r.id = v.recipe_id
    WHERE v.id = recipe_version_id AND public.can_access_brand(r.brand_id)
  )
);
CREATE POLICY "Users can manage recipe version items" ON public.recipe_version_items FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.recipe_versions v
    JOIN public.recipes r ON r.id = v.recipe_id
    WHERE v.id = recipe_version_id AND public.can_access_brand(r.brand_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.recipe_versions v
    JOIN public.recipes r ON r.id = v.recipe_id
    WHERE v.id = recipe_version_id AND public.can_access_brand(r.brand_id)
  )
);

CREATE POLICY "Users can view production orders" ON public.production_orders FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage production orders" ON public.production_orders FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view production materials" ON public.production_order_materials FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.production_orders p WHERE p.id = production_order_id AND public.can_access_brand(p.brand_id))
);
CREATE POLICY "Users can manage production materials" ON public.production_order_materials FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.production_orders p WHERE p.id = production_order_id AND public.can_access_brand(p.brand_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.production_orders p WHERE p.id = production_order_id AND public.can_access_brand(p.brand_id))
);

CREATE POLICY "Users can view sales invoices" ON public.sales_invoices FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage sales invoices" ON public.sales_invoices FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view sales invoice items" ON public.sales_invoice_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.sales_invoices s WHERE s.id = sales_invoice_id AND public.can_access_brand(s.brand_id))
);
CREATE POLICY "Users can manage sales invoice items" ON public.sales_invoice_items FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.sales_invoices s WHERE s.id = sales_invoice_id AND public.can_access_brand(s.brand_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.sales_invoices s WHERE s.id = sales_invoice_id AND public.can_access_brand(s.brand_id))
);

CREATE POLICY "Users can view sales payments" ON public.sales_payments FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage sales payments" ON public.sales_payments FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view coupons" ON public.coupons FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage coupons" ON public.coupons FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view waste entries" ON public.waste_entries FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage waste entries" ON public.waste_entries FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view return entries" ON public.return_entries FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage return entries" ON public.return_entries FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view employees" ON public.employees FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage employees" ON public.employees FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "Users can view attendance" ON public.employee_attendance FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
);
CREATE POLICY "Users can manage attendance" ON public.employee_attendance FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
);

CREATE POLICY "Users can view payroll" ON public.employee_payroll FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
);
CREATE POLICY "Users can manage payroll" ON public.employee_payroll FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
);

CREATE POLICY "Users can view expenses" ON public.expenses FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage expenses" ON public.expenses FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));
