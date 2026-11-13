export type ExpenseType = 'opex' | 'capex';

export type ExpenseSourceType =
  | 'purchase'
  | 'payroll'
  | 'waste'
  | 'order_fee'
  | 'manual'
  | 'recurring';

export type ExpensePaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'instapay'
  | 'card'
  | 'credit';

export type ExpensePaymentStatus = 'paid' | 'pending' | 'partial';

export type AllocationType =
  | 'direct'
  | 'shared_revenue'
  | 'shared_orders'
  | 'fixed_percent';

export type RecurringFrequency = 'monthly' | 'weekly' | 'yearly';

export interface ExpenseCategory {
  id: string;
  name: string;
  slug: string;
  expense_type: ExpenseType;
  parent_id: string | null;
  default_allocation_rule: AllocationType;
  is_system: boolean;
  created_at: string;
}

export interface ExpenseAllocation {
  id: string;
  expense_id: string;
  company_id: string;
  allocation_type: AllocationType;
  allocated_amount: number;
  percentage: number;
}

export interface ExpenseRecord {
  id: string;
  brand_id: string | null;
  title: string;
  amount: number;
  tax_amount: number;
  expense_date: string;
  category_id: string | null;
  source_type: ExpenseSourceType;
  source_ref_id: string | null;
  payment_method: ExpensePaymentMethod;
  payment_status: ExpensePaymentStatus;
  receipt_url: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  allocations: ExpenseAllocation[];
}

export interface ExpenseInput {
  id?: string;
  title: string;
  amount: number;
  tax_amount: number;
  expense_date: string;
  category_id: string;
  source_type?: ExpenseSourceType;
  source_ref_id?: string | null;
  payment_method: ExpensePaymentMethod;
  payment_status: ExpensePaymentStatus;
  receipt_url?: string | null;
  notes?: string;
  allocation_type: AllocationType;
  direct_company_id?: string | null;
  fixed_percentages?: Record<string, number>;
}

export interface RecurringExpense {
  id: string;
  title: string;
  estimated_amount: number;
  category_id: string | null;
  company_id: string | null;
  allocation_rule: AllocationType;
  frequency: RecurringFrequency;
  due_day: number;
  next_due_date: string;
  remind_days_before: number;
  is_active: boolean;
  notes: string;
  created_at: string;
}

export interface RecurringExpenseInput {
  id?: string;
  title: string;
  estimated_amount: number;
  category_id: string;
  company_id: string | null;
  allocation_rule: AllocationType;
  frequency: RecurringFrequency;
  due_day: number;
  next_due_date: string;
  remind_days_before: number;
  is_active: boolean;
  notes?: string;
}

export interface BrandProfitabilityRow {
  brandId: string;
  brandName: string;
  color: string;
  orderCount: number;
  revenue: number;
  directExpenses: number;
  sharedExpenses: number;
  totalOpex: number;
  capexAllocated: number;
  netProfit: number;
  profitMarginPct: number;
  adSpend: number;
  cac: number;
  roas: number;
}

export type SavingRuleId =
  | 'supplier_price_creep'
  | 'food_cost_gap'
  | 'ad_efficiency'
  | 'cancelled_orders_bleed'
  | 'labor_utility_spike';

export interface CostSavingInsight {
  id: string;
  rule: SavingRuleId;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  estimatedMonthlySaving: number;
  metricBadge: string;
  actionLabel: string;
  actionHref: string;
}

export const SOURCE_TYPE_LABELS: Record<ExpenseSourceType, string> = {
  purchase: 'تلقائي · مشتريات',
  payroll: 'تلقائي · رواتب وحوافز',
  waste: 'تلقائي · هالك مخزون',
  order_fee: 'تلقائي · عمولات طلبات',
  recurring: 'التزامات متكررة',
  manual: 'إدخال يدوي',
};

export const PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: 'نقدي (كاش)',
  bank_transfer: 'تحويل بنكي',
  instapay: 'إنستاباي (InstaPay)',
  card: 'بطاقة بنكية',
  credit: 'آجل للمورد',
};

export const PAYMENT_STATUS_LABELS: Record<ExpensePaymentStatus, string> = {
  paid: 'مدفوع بالكامل',
  partial: 'مدفوع جزئياً',
  pending: 'مستحق / آجل',
};

export const ALLOCATION_TYPE_LABELS: Record<AllocationType, string> = {
  direct: 'مباشر لشركة محددة (100%)',
  shared_revenue: 'مشترك حسب نسبة المبيعات',
  shared_orders: 'مشترك حسب عدد الطلبات',
  fixed_percent: 'مشترك بنسب مئوية ثابتة',
};

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  monthly: 'شهري',
  weekly: 'أسبوعي',
  yearly: 'سنوي',
};
