-- =============================================================================
-- Unified Financial Ledger, Multi-Brand Cost Allocation & Recurring Obligations
-- Connects Purchases, HR/Payroll, Inventory Waste, and Orders into a single P&L
-- =============================================================================

-- 1. Expense Categories Tree (Expandable from Settings without code changes)
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  expense_type text NOT NULL DEFAULT 'opex' CHECK (expense_type IN ('opex', 'capex')),
  parent_id uuid REFERENCES public.expense_categories(id) ON DELETE CASCADE,
  default_allocation_rule text NOT NULL DEFAULT 'shared_revenue'
    CHECK (default_allocation_rule IN ('direct', 'shared_revenue', 'shared_orders', 'fixed_percent')),
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

-- 2. Upgrade / Create Unified Expenses Ledger Table
ALTER TABLE public.expenses
  ALTER COLUMN brand_id DROP NOT NULL,
  ALTER COLUMN description SET DEFAULT '';

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('purchase', 'payroll', 'waste', 'order_fee', 'manual', 'recurring')),
  ADD COLUMN IF NOT EXISTS source_ref_id uuid,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid', 'pending', 'partial')),
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Ensure payment_method supports all 5 operational rails
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_payment_method_check;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_payment_method_check
  CHECK (payment_method IN ('cash', 'bank_transfer', 'instapay', 'card', 'credit'));

-- Backfill title from legacy description if any rows exist
UPDATE public.expenses
SET title = COALESCE(NULLIF(title, ''), description, 'مصروف تشغيلي')
WHERE title = '';

-- Unique Index to guarantee zero duplicate auto-synced ledger entries
CREATE UNIQUE INDEX IF NOT EXISTS expenses_source_type_ref_uidx
  ON public.expenses (source_type, source_ref_id)
  WHERE source_ref_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_date_category
  ON public.expenses (expense_date DESC, category_id);

-- 3. Multi-Brand Expense Allocations Table
-- Note: company_id references public.brands(id) (the unified operational Company/Brand entity)
CREATE TABLE IF NOT EXISTS public.expense_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  allocation_type text NOT NULL DEFAULT 'shared_revenue'
    CHECK (allocation_type IN ('direct', 'shared_revenue', 'shared_orders', 'fixed_percent')),
  allocated_amount numeric(14,2) NOT NULL DEFAULT 0,
  percentage numeric(7,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expense_id, company_id)
);

ALTER TABLE public.expense_allocations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_expense_allocations_company
  ON public.expense_allocations (company_id, expense_id);

-- 4. Recurring Expenses & Bills Table
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  estimated_amount numeric(14,2) NOT NULL DEFAULT 0,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  allocation_rule text NOT NULL DEFAULT 'shared_revenue'
    CHECK (allocation_rule IN ('direct', 'shared_revenue', 'shared_orders', 'fixed_percent')),
  frequency text NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('monthly', 'weekly', 'yearly')),
  due_day int NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 31),
  next_due_date date NOT NULL DEFAULT CURRENT_DATE,
  remind_days_before int NOT NULL DEFAULT 3,
  is_active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_recurring_expenses_updated_at ON public.recurring_expenses;
CREATE TRIGGER set_recurring_expenses_updated_at
  BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Seed the 6 System Parent Categories + Default Subcategories
DO $$
DECLARE
  v_cogs uuid;
  v_payroll uuid;
  v_marketing uuid;
  v_facility uuid;
  v_delivery uuid;
  v_admin uuid;
BEGIN
  -- 1) COGS
  INSERT INTO public.expense_categories (name, slug, expense_type, default_allocation_rule, is_system)
  VALUES ('تكلفة البضاعة والمواد الخام (COGS)', 'cogs', 'opex', 'shared_revenue', true)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_cogs;

  INSERT INTO public.expense_categories (name, slug, expense_type, parent_id, default_allocation_rule, is_system) VALUES
    ('بروتين (لحوم / دواجن / أسماك)', 'cogs-protein', 'opex', v_cogs, 'shared_revenue', true),
    ('خضروات ونشويات وتوابل', 'cogs-produce-dry', 'opex', v_cogs, 'shared_revenue', true),
    ('مواد تغليف وعلب', 'cogs-packaging', 'opex', v_cogs, 'shared_orders', true),
    ('هالك وتالف المخزون', 'cogs-waste', 'opex', v_cogs, 'shared_revenue', true)
  ON CONFLICT (slug) DO NOTHING;

  -- 2) Payroll
  INSERT INTO public.expense_categories (name, slug, expense_type, default_allocation_rule, is_system)
  VALUES ('الأجور والموارد البشرية (Payroll)', 'payroll', 'opex', 'shared_orders', true)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_payroll;

  INSERT INTO public.expense_categories (name, slug, expense_type, parent_id, default_allocation_rule, is_system) VALUES
    ('رواتب ثابتة', 'payroll-salaries', 'opex', v_payroll, 'shared_orders', true),
    ('يوميات وعمالة مؤقتة', 'payroll-daily-labor', 'opex', v_payroll, 'shared_orders', true),
    ('حوافز وإضافي ومكافآت', 'payroll-bonuses', 'opex', v_payroll, 'shared_orders', true)
  ON CONFLICT (slug) DO NOTHING;

  -- 3) Marketing & Ads
  INSERT INTO public.expense_categories (name, slug, expense_type, default_allocation_rule, is_system)
  VALUES ('التسويق والإعلانات (Marketing & Ads)', 'marketing', 'opex', 'direct', true)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_marketing;

  INSERT INTO public.expense_categories (name, slug, expense_type, parent_id, default_allocation_rule, is_system) VALUES
    ('إسبونسر سوشيال ميديا (Meta / TikTok / Google)', 'marketing-sponsored-ads', 'opex', v_marketing, 'direct', true),
    ('تصوير وصناعة محتوى', 'marketing-content', 'opex', v_marketing, 'shared_revenue', true),
    ('عروض وعينات ترويجية', 'marketing-samples', 'opex', v_marketing, 'direct', true)
  ON CONFLICT (slug) DO NOTHING;

  -- 4) Facility & Utilities
  INSERT INTO public.expense_categories (name, slug, expense_type, default_allocation_rule, is_system)
  VALUES ('التشغيل والمرافق الثابتة (Facility & Utilities)', 'facility', 'opex', 'shared_revenue', true)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_facility;

  INSERT INTO public.expense_categories (name, slug, expense_type, parent_id, default_allocation_rule, is_system) VALUES
    ('إيجار المقر والمخزن', 'facility-rent', 'opex', v_facility, 'shared_revenue', true),
    ('فواتير الكهرباء', 'facility-electricity', 'opex', v_facility, 'shared_orders', true),
    ('فواتير الغاز', 'facility-gas', 'opex', v_facility, 'shared_orders', true),
    ('فواتير المياه والإنترنت', 'facility-water-internet', 'opex', v_facility, 'shared_revenue', true),
    ('نظافة وتعقيم ومكافحة', 'facility-cleaning', 'opex', v_facility, 'shared_revenue', true)
  ON CONFLICT (slug) DO NOTHING;

  -- 5) Delivery & Fulfillment
  INSERT INTO public.expense_categories (name, slug, expense_type, default_allocation_rule, is_system)
  VALUES ('التوصيل واللوجستيات (Delivery & Fulfillment)', 'delivery', 'opex', 'shared_orders', true)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_delivery;

  INSERT INTO public.expense_categories (name, slug, expense_type, parent_id, default_allocation_rule, is_system) VALUES
    ('شحن ومناديب توصيل', 'delivery-couriers', 'opex', v_delivery, 'shared_orders', true),
    ('بنزين وصيانة وسائل التوصيل', 'delivery-fuel', 'opex', v_delivery, 'shared_orders', true),
    ('عمولات بوابات الدفع والتحصيل', 'delivery-payment-fees', 'opex', v_delivery, 'shared_revenue', true)
  ON CONFLICT (slug) DO NOTHING;

  -- 6) Admin & CapEx
  INSERT INTO public.expense_categories (name, slug, expense_type, default_allocation_rule, is_system)
  VALUES ('المصاريف الإدارية والصيانة والأصول (Admin & CapEx)', 'admin-capex', 'opex', 'shared_revenue', true)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_admin;

  INSERT INTO public.expense_categories (name, slug, expense_type, parent_id, default_allocation_rule, is_system) VALUES
    ('صيانة معدات المطبخ', 'admin-equipment-maintenance', 'opex', v_admin, 'shared_orders', true),
    ('اشتراكات أنظمة وبرامج', 'admin-software', 'opex', v_admin, 'shared_revenue', true),
    ('نثريات وطوارئ', 'admin-misc', 'opex', v_admin, 'shared_revenue', true),
    ('شراء أصول ومعدات رأسمالية (CapEx)', 'capex-equipment', 'capex', v_admin, 'shared_revenue', true)
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 6. Multi-Brand Allocation SQL Helper Function
CREATE OR REPLACE FUNCTION public.reallocate_expense_to_brands(
  _expense_id uuid,
  _amount numeric,
  _expense_date date,
  _allocation_type text DEFAULT 'shared_revenue',
  _direct_company_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_prefix text := to_char(COALESCE(_expense_date, CURRENT_DATE), 'YYYY-MM');
  v_total_metric numeric := 0;
  v_brand_count int := 0;
BEGIN
  DELETE FROM public.expense_allocations WHERE expense_id = _expense_id;

  IF COALESCE(_amount, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_brand_count FROM public.brands;
  IF v_brand_count = 0 THEN
    RETURN;
  END IF;

  IF _allocation_type = 'direct' AND _direct_company_id IS NOT NULL THEN
    INSERT INTO public.expense_allocations (expense_id, company_id, allocation_type, allocated_amount, percentage)
    VALUES (_expense_id, _direct_company_id, 'direct', round(_amount, 2), 100);
    RETURN;
  END IF;

  IF _allocation_type = 'shared_orders' THEN
    SELECT COALESCE(count(*), 0) INTO v_total_metric
    FROM public.orders
    WHERE status <> 'cancelled'
      AND brand_id IS NOT NULL
      AND to_char(created_at, 'YYYY-MM') = v_month_prefix;

    IF v_total_metric > 0 THEN
      INSERT INTO public.expense_allocations (expense_id, company_id, allocation_type, allocated_amount, percentage)
      SELECT
        _expense_id,
        b.id,
        'shared_orders',
        round(_amount * (COALESCE(cnt.c, 0)::numeric / v_total_metric), 2),
        round((COALESCE(cnt.c, 0)::numeric / v_total_metric) * 100, 3)
      FROM public.brands b
      LEFT JOIN (
        SELECT brand_id, count(*) AS c
        FROM public.orders
        WHERE status <> 'cancelled' AND to_char(created_at, 'YYYY-MM') = v_month_prefix
        GROUP BY brand_id
      ) cnt ON cnt.brand_id = b.id
      WHERE COALESCE(cnt.c, 0) > 0;
      RETURN;
    END IF;
  END IF;

  -- Default / shared_revenue
  SELECT COALESCE(sum(price), 0) INTO v_total_metric
  FROM public.orders
  WHERE status <> 'cancelled'
    AND brand_id IS NOT NULL
    AND to_char(created_at, 'YYYY-MM') = v_month_prefix;

  IF v_total_metric > 0 THEN
    INSERT INTO public.expense_allocations (expense_id, company_id, allocation_type, allocated_amount, percentage)
    SELECT
      _expense_id,
      b.id,
      'shared_revenue',
      round(_amount * (COALESCE(rev.s, 0) / v_total_metric), 2),
      round((COALESCE(rev.s, 0) / v_total_metric) * 100, 3)
    FROM public.brands b
    LEFT JOIN (
      SELECT brand_id, sum(price) AS s
      FROM public.orders
      WHERE status <> 'cancelled' AND to_char(created_at, 'YYYY-MM') = v_month_prefix
      GROUP BY brand_id
    ) rev ON rev.brand_id = b.id
    WHERE COALESCE(rev.s, 0) > 0;
  ELSE
    -- Equal fallback if month has zero orders yet
    INSERT INTO public.expense_allocations (expense_id, company_id, allocation_type, allocated_amount, percentage)
    SELECT
      _expense_id,
      b.id,
      _allocation_type,
      round(_amount / v_brand_count, 2),
      round(100.0 / v_brand_count, 3)
    FROM public.brands b;
  END IF;
END;
$$;

-- 7. Automatic Database Triggers (Purchases, HR Payroll/Bonuses, Inventory Waste)

-- 7.A) Purchases Trigger (inventory_purchase_requests)
CREATE OR REPLACE FUNCTION public.sync_purchase_request_to_expenses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_id uuid;
  v_expense_id uuid;
  v_pay_status text;
  v_pay_method text;
  v_amount numeric;
  v_exp_date date;
  has_packaging boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.expenses WHERE source_type = 'purchase' AND source_ref_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Only sync executed / approved purchases
  IF NEW.status::text NOT IN ('purchased_pending_receipt', 'approved') THEN
    DELETE FROM public.expenses WHERE source_type = 'purchase' AND source_ref_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT COALESCE(NEW.total_amount, 0) INTO v_amount;
  IF v_amount <= 0 THEN
    SELECT COALESCE(sum(quantity * unit_cost), 0) INTO v_amount
    FROM public.inventory_purchase_request_lines
    WHERE purchase_request_id = NEW.id;
  END IF;

  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.inventory_purchase_request_lines l
    JOIN public.items_master im ON im.id = l.item_id
    WHERE l.purchase_request_id = NEW.id
      AND lower(im.category) IN ('packaging', 'تغليف', 'علب')
  ) INTO has_packaging;

  SELECT id INTO v_cat_id
  FROM public.expense_categories
  WHERE slug = CASE WHEN has_packaging THEN 'cogs-packaging' ELSE 'cogs-produce-dry' END
  LIMIT 1;

  v_pay_status := CASE
    WHEN NEW.payment_status = 'paid' THEN 'paid'
    WHEN NEW.payment_status = 'partial' THEN 'partial'
    WHEN COALESCE(NEW.paid_amount, 0) >= v_amount THEN 'paid'
    WHEN COALESCE(NEW.paid_amount, 0) > 0 THEN 'partial'
    ELSE 'pending'
  END;

  v_pay_method := COALESCE(NEW.payment_method, 'cash');
  v_exp_date := COALESCE(NEW.invoice_date, (NEW.created_at AT TIME ZONE 'UTC')::date);

  INSERT INTO public.expenses (
    brand_id, title, description, amount, tax_amount, expense_date,
    category_id, source_type, source_ref_id, payment_method, payment_status,
    vendor_name, receipt_url, notes, created_by
  ) VALUES (
    NEW.brand_id,
    'فاتورة مشتريات ' || NEW.request_no || CASE WHEN NEW.supplier_name <> '' THEN ' · ' || NEW.supplier_name ELSE '' END,
    COALESCE(NEW.notes, ''),
    v_amount,
    COALESCE(NEW.tax_amount, 0),
    v_exp_date,
    v_cat_id,
    'purchase',
    NEW.id,
    v_pay_method,
    v_pay_status,
    COALESCE(NEW.supplier_name, ''),
    NULLIF(NEW.invoice_storage_path, ''),
    NEW.notes,
    NEW.requested_by
  )
  ON CONFLICT (source_type, source_ref_id) WHERE source_ref_id IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    tax_amount = EXCLUDED.tax_amount,
    expense_date = EXCLUDED.expense_date,
    category_id = EXCLUDED.category_id,
    payment_method = EXCLUDED.payment_method,
    payment_status = EXCLUDED.payment_status,
    vendor_name = EXCLUDED.vendor_name,
    receipt_url = EXCLUDED.receipt_url,
    notes = EXCLUDED.notes
  RETURNING id INTO v_expense_id;

  PERFORM public.reallocate_expense_to_brands(
    v_expense_id,
    v_amount,
    v_exp_date,
    CASE WHEN has_packaging THEN 'shared_orders' ELSE 'shared_revenue' END,
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_purchase_to_expenses ON public.inventory_purchase_requests;
CREATE TRIGGER trg_sync_purchase_to_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_request_to_expenses();

-- 7.B) Inventory Waste Trigger (inventory_movements where movement_type = 'waste')
CREATE OR REPLACE FUNCTION public.sync_inventory_waste_to_expenses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_id uuid;
  v_item_name text;
  v_item_cost numeric := 0;
  v_waste_cost numeric := 0;
  v_expense_id uuid;
  v_exp_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.movement_type::text = 'waste' THEN
      DELETE FROM public.expenses WHERE source_type = 'waste' AND source_ref_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.movement_type::text <> 'waste' THEN
    RETURN NEW;
  END IF;

  SELECT name, COALESCE(NULLIF(NEW.unit_cost, 0), NULLIF(avg_cost, 0), last_purchase_price, 0)
  INTO v_item_name, v_item_cost
  FROM public.items_master
  WHERE id = NEW.item_id;

  v_waste_cost := round(abs(COALESCE(NEW.quantity, 0)) * COALESCE(v_item_cost, 0), 2);
  IF v_waste_cost <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cat_id FROM public.expense_categories WHERE slug = 'cogs-waste' LIMIT 1;
  v_exp_date := (NEW.created_at AT TIME ZONE 'UTC')::date;

  INSERT INTO public.expenses (
    brand_id, title, description, amount, tax_amount, expense_date,
    category_id, source_type, source_ref_id, payment_method, payment_status,
    notes, created_by
  ) VALUES (
    NEW.brand_id,
    'هالك مخزون: ' || COALESCE(v_item_name, 'صنف'),
    COALESCE(NEW.notes, ''),
    v_waste_cost,
    0,
    v_exp_date,
    v_cat_id,
    'waste',
    NEW.id,
    'cash',
    'paid',
    NEW.notes,
    NEW.created_by
  )
  ON CONFLICT (source_type, source_ref_id) WHERE source_ref_id IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    expense_date = EXCLUDED.expense_date,
    notes = EXCLUDED.notes
  RETURNING id INTO v_expense_id;

  PERFORM public.reallocate_expense_to_brands(v_expense_id, v_waste_cost, v_exp_date, 'shared_revenue', NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_waste_to_expenses ON public.inventory_movements;
CREATE TRIGGER trg_sync_waste_to_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_waste_to_expenses();

-- 7.C) HR Bonuses & Approved Month Payroll Triggers
CREATE OR REPLACE FUNCTION public.sync_hr_bonus_to_expenses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_id uuid;
  v_emp_name text;
  v_brand_id uuid;
  v_expense_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.expenses WHERE source_type = 'payroll' AND source_ref_id = OLD.id;
    RETURN OLD;
  END IF;

  IF COALESCE(NEW.amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT full_name, brand_id INTO v_emp_name, v_brand_id FROM public.employees WHERE id = NEW.employee_id;
  SELECT id INTO v_cat_id FROM public.expense_categories WHERE slug = 'payroll-bonuses' LIMIT 1;

  INSERT INTO public.expenses (
    brand_id, title, description, amount, tax_amount, expense_date,
    category_id, source_type, source_ref_id, payment_method, payment_status,
    notes, created_by
  ) VALUES (
    v_brand_id,
    'مكافأة / حافز: ' || COALESCE(v_emp_name, 'موظف'),
    COALESCE(NEW.reason, ''),
    NEW.amount,
    0,
    NEW.bonus_date,
    v_cat_id,
    'payroll',
    NEW.id,
    'cash',
    'paid',
    NEW.notes,
    NEW.created_by
  )
  ON CONFLICT (source_type, source_ref_id) WHERE source_ref_id IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    expense_date = EXCLUDED.expense_date,
    notes = EXCLUDED.notes
  RETURNING id INTO v_expense_id;

  PERFORM public.reallocate_expense_to_brands(v_expense_id, NEW.amount, NEW.bonus_date, 'shared_orders', NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_hr_bonus_to_expenses ON public.hr_bonuses;
CREATE TRIGGER trg_sync_hr_bonus_to_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.hr_bonuses
  FOR EACH ROW EXECUTE FUNCTION public.sync_hr_bonus_to_expenses();

CREATE OR REPLACE FUNCTION public.sync_hr_month_lock_to_expenses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_id uuid;
  v_base_total numeric := 0;
  v_deductions_total numeric := 0;
  v_net_payroll numeric := 0;
  v_exp_date date;
  v_expense_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.expenses WHERE source_type = 'payroll' AND source_ref_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT COALESCE(sum(salary), 0) INTO v_base_total
  FROM public.employees
  WHERE brand_id = NEW.brand_id AND COALESCE(employment_status, 'working') = 'working';

  SELECT COALESCE(sum(d.amount), 0) INTO v_deductions_total
  FROM public.hr_deductions d
  JOIN public.employees e ON e.id = d.employee_id
  WHERE e.brand_id = NEW.brand_id
    AND to_char(d.deduction_date, 'YYYY-MM') = NEW.month_key;

  v_net_payroll := GREATEST(0, v_base_total - v_deductions_total);
  IF v_net_payroll <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cat_id FROM public.expense_categories WHERE slug = 'payroll-salaries' LIMIT 1;
  v_exp_date := to_date(NEW.month_key || '-28', 'YYYY-MM-DD');

  INSERT INTO public.expenses (
    brand_id, title, description, amount, tax_amount, expense_date,
    category_id, source_type, source_ref_id, payment_method, payment_status,
    notes, created_by
  ) VALUES (
    NEW.brand_id,
    'مسير الرواتب المعتمد لشهر ' || NEW.month_key,
    'ترحيل تلقائي عند اعتماد وإقفال شهر الرواتب',
    v_net_payroll,
    0,
    v_exp_date,
    v_cat_id,
    'payroll',
    NEW.id,
    'bank_transfer',
    'paid',
    'ترحيل آلي من الموارد البشرية',
    NEW.locked_by
  )
  ON CONFLICT (source_type, source_ref_id) WHERE source_ref_id IS NOT NULL
  DO UPDATE SET
    amount = EXCLUDED.amount,
    expense_date = EXCLUDED.expense_date
  RETURNING id INTO v_expense_id;

  PERFORM public.reallocate_expense_to_brands(v_expense_id, v_net_payroll, v_exp_date, 'shared_orders', NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_hr_month_lock_to_expenses ON public.hr_month_locks;
CREATE TRIGGER trg_sync_hr_month_lock_to_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.hr_month_locks
  FOR EACH ROW EXECUTE FUNCTION public.sync_hr_month_lock_to_expenses();

-- 8. RLS Policies for Finance & Expenses
DROP POLICY IF EXISTS "Finance users view expense categories" ON public.expense_categories;
CREATE POLICY "Finance users view expense categories"
  ON public.expense_categories FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Finance users manage expense categories" ON public.expense_categories;
CREATE POLICY "Finance users manage expense categories"
  ON public.expense_categories FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'expenses')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'expenses')
  );

DROP POLICY IF EXISTS "Users can view expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can manage expenses" ON public.expenses;
CREATE POLICY "Finance users view expenses"
  ON public.expenses FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'expenses')
    OR (brand_id IS NOT NULL AND public.can_access_brand(brand_id))
  );
CREATE POLICY "Finance users manage expenses"
  ON public.expenses FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'expenses')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'expenses')
  );

DROP POLICY IF EXISTS "Finance users view allocations" ON public.expense_allocations;
DROP POLICY IF EXISTS "Finance users manage allocations" ON public.expense_allocations;
CREATE POLICY "Finance users view allocations"
  ON public.expense_allocations FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'expenses')
    OR public.can_access_brand(company_id)
  );
CREATE POLICY "Finance users manage allocations"
  ON public.expense_allocations FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'expenses')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'expenses')
  );

DROP POLICY IF EXISTS "Finance users view recurring expenses" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Finance users manage recurring expenses" ON public.recurring_expenses;
CREATE POLICY "Finance users view recurring expenses"
  ON public.recurring_expenses FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'expenses')
  );
CREATE POLICY "Finance users manage recurring expenses"
  ON public.recurring_expenses FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'expenses')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_page_permission(auth.uid(), 'expenses')
  );

-- 9. Supabase Storage Bucket: expense-receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  false,
  12582912,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Finance users read expense receipts" ON storage.objects;
CREATE POLICY "Finance users read expense receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (public.has_role(auth.uid(), 'owner') OR public.has_page_permission(auth.uid(), 'expenses'))
  );

DROP POLICY IF EXISTS "Finance users upload expense receipts" ON storage.objects;
CREATE POLICY "Finance users upload expense receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (public.has_role(auth.uid(), 'owner') OR public.has_page_permission(auth.uid(), 'expenses'))
  );
