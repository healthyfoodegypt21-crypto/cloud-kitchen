ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS branch_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'working',
  ADD COLUMN IF NOT EXISTS manager_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hourly_rate numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_work_hours numeric(8,2) NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS weekly_work_days integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS national_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS emergency_contact text NOT NULL DEFAULT '';

UPDATE public.employees
SET
  role_title = COALESCE(role_title, ''),
  department = COALESCE(department, ''),
  branch_name = COALESCE(branch_name, ''),
  employment_status = COALESCE(NULLIF(employment_status, ''), CASE WHEN is_active THEN 'working' ELSE 'resigned' END),
  manager_name = COALESCE(manager_name, ''),
  hourly_rate = COALESCE(hourly_rate, 0),
  overtime_hourly_rate = COALESCE(overtime_hourly_rate, 0),
  daily_work_hours = COALESCE(daily_work_hours, 8),
  weekly_work_days = COALESCE(weekly_work_days, 6),
  national_id = COALESCE(national_id, ''),
  address = COALESCE(address, ''),
  emergency_contact = COALESCE(emergency_contact, '');

ALTER TABLE public.employee_attendance
  ADD COLUMN IF NOT EXISTS work_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_minutes integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.hr_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  advance_date date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  repayment_method text NOT NULL DEFAULT 'installments',
  installments integer,
  repaid_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_advances_installments_check CHECK (installments IS NULL OR installments > 0),
  CONSTRAINT hr_advances_repayment_method_check CHECK (repayment_method IN ('one_time', 'installments', 'salary_deduction'))
);
ALTER TABLE public.hr_advances ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.hr_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  deduction_date date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_deductions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.hr_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  bonus_date date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_bonuses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.hr_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  grace_period_minutes integer NOT NULL DEFAULT 15,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id)
);
ALTER TABLE public.hr_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.hr_month_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  month_key text NOT NULL,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, month_key)
);
ALTER TABLE public.hr_month_locks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_hr_advances_employee_date ON public.hr_advances (employee_id, advance_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_deductions_employee_date ON public.hr_deductions (employee_id, deduction_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_bonuses_employee_date ON public.hr_bonuses (employee_id, bonus_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_settings_brand_id ON public.hr_settings (brand_id);
CREATE INDEX IF NOT EXISTS idx_hr_month_locks_brand_month ON public.hr_month_locks (brand_id, month_key);

DROP POLICY IF EXISTS "Users can view HR advances" ON public.hr_advances;
DROP POLICY IF EXISTS "Users can manage HR advances" ON public.hr_advances;
CREATE POLICY "Users can view HR advances" ON public.hr_advances FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
);
CREATE POLICY "Users can manage HR advances" ON public.hr_advances FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
);

DROP POLICY IF EXISTS "Users can view HR deductions" ON public.hr_deductions;
DROP POLICY IF EXISTS "Users can manage HR deductions" ON public.hr_deductions;
CREATE POLICY "Users can view HR deductions" ON public.hr_deductions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
);
CREATE POLICY "Users can manage HR deductions" ON public.hr_deductions FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
);

DROP POLICY IF EXISTS "Users can view HR bonuses" ON public.hr_bonuses;
DROP POLICY IF EXISTS "Users can manage HR bonuses" ON public.hr_bonuses;
CREATE POLICY "Users can view HR bonuses" ON public.hr_bonuses FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
);
CREATE POLICY "Users can manage HR bonuses" ON public.hr_bonuses FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.can_access_brand(e.brand_id))
);

DROP POLICY IF EXISTS "Users can view HR settings" ON public.hr_settings;
DROP POLICY IF EXISTS "Users can manage HR settings" ON public.hr_settings;
CREATE POLICY "Users can view HR settings" ON public.hr_settings FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage HR settings" ON public.hr_settings FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

DROP POLICY IF EXISTS "Users can view HR month locks" ON public.hr_month_locks;
DROP POLICY IF EXISTS "Users can manage HR month locks" ON public.hr_month_locks;
CREATE POLICY "Users can view HR month locks" ON public.hr_month_locks FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "Users can manage HR month locks" ON public.hr_month_locks FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE TRIGGER set_hr_advances_updated_at
BEFORE UPDATE ON public.hr_advances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_hr_deductions_updated_at
BEFORE UPDATE ON public.hr_deductions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_hr_bonuses_updated_at
BEFORE UPDATE ON public.hr_bonuses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_hr_settings_updated_at
BEFORE UPDATE ON public.hr_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER audit_hr_advances
AFTER INSERT OR UPDATE OR DELETE ON public.hr_advances
FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();

CREATE TRIGGER audit_hr_deductions
AFTER INSERT OR UPDATE OR DELETE ON public.hr_deductions
FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();

CREATE TRIGGER audit_hr_bonuses
AFTER INSERT OR UPDATE OR DELETE ON public.hr_bonuses
FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();

CREATE TRIGGER audit_hr_settings
AFTER INSERT OR UPDATE OR DELETE ON public.hr_settings
FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();

CREATE TRIGGER audit_hr_month_locks
AFTER INSERT OR UPDATE OR DELETE ON public.hr_month_locks
FOR EACH ROW EXECUTE FUNCTION public.erp_audit_log();

ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_advances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_deductions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_bonuses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_month_locks;