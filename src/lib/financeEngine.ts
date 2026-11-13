import type { Brand } from '@/hooks/useBrands';
import { computeMealCostBreakdown, InventoryCostItem } from '@/lib/menuHub';
import { getOrderMealCount, resolveOrderMeals } from '@/lib/orderMeals';
import { compactWhitespace, formatEGPCurrency } from '@/lib/utils';
import { MenuIngredient } from '@/types/companyMenu';
import {
  AllocationType,
  BrandProfitabilityRow,
  CostSavingInsight,
  ExpenseAllocation,
  ExpenseCategory,
  ExpenseRecord,
  RecurringFrequency,
} from '@/types/finance';
import { Meal, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

export interface SystemCategorySeed {
  slug: string;
  name: string;
  expense_type: 'opex' | 'capex';
  default_allocation_rule: AllocationType;
  children: Array<{
    slug: string;
    name: string;
    expense_type: 'opex' | 'capex';
    default_allocation_rule: AllocationType;
  }>;
}

export const SYSTEM_EXPENSE_CATEGORY_TREE: SystemCategorySeed[] = [
  {
    slug: 'cogs',
    name: 'تكلفة البضاعة والمواد الخام (COGS)',
    expense_type: 'opex',
    default_allocation_rule: 'shared_revenue',
    children: [
      { slug: 'cogs-protein', name: 'بروتين (لحوم / دواجن / أسماك)', expense_type: 'opex', default_allocation_rule: 'shared_revenue' },
      { slug: 'cogs-produce-dry', name: 'خضروات ونشويات وتوابل', expense_type: 'opex', default_allocation_rule: 'shared_revenue' },
      { slug: 'cogs-packaging', name: 'مواد تغليف وعلب', expense_type: 'opex', default_allocation_rule: 'shared_orders' },
      { slug: 'cogs-waste', name: 'هالك وتالف المخزون', expense_type: 'opex', default_allocation_rule: 'shared_revenue' },
    ],
  },
  {
    slug: 'payroll',
    name: 'الأجور والموارد البشرية (Payroll)',
    expense_type: 'opex',
    default_allocation_rule: 'shared_orders',
    children: [
      { slug: 'payroll-salaries', name: 'رواتب ثابتة', expense_type: 'opex', default_allocation_rule: 'shared_orders' },
      { slug: 'payroll-daily-labor', name: 'يوميات وعمالة مؤقتة', expense_type: 'opex', default_allocation_rule: 'shared_orders' },
      { slug: 'payroll-bonuses', name: 'حوافز وإضافي ومكافآت', expense_type: 'opex', default_allocation_rule: 'shared_orders' },
    ],
  },
  {
    slug: 'marketing',
    name: 'التسويق والإعلانات (Marketing & Ads)',
    expense_type: 'opex',
    default_allocation_rule: 'direct',
    children: [
      { slug: 'marketing-sponsored-ads', name: 'إسبونسر سوشيال ميديا (Meta / TikTok / Google)', expense_type: 'opex', default_allocation_rule: 'direct' },
      { slug: 'marketing-content', name: 'تصوير وصناعة محتوى', expense_type: 'opex', default_allocation_rule: 'shared_revenue' },
      { slug: 'marketing-samples', name: 'عروض وعينات ترويجية', expense_type: 'opex', default_allocation_rule: 'direct' },
    ],
  },
  {
    slug: 'facility',
    name: 'التشغيل والمرافق الثابتة (Facility & Utilities)',
    expense_type: 'opex',
    default_allocation_rule: 'shared_revenue',
    children: [
      { slug: 'facility-rent', name: 'إيجار المقر والمخزن', expense_type: 'opex', default_allocation_rule: 'shared_revenue' },
      { slug: 'facility-electricity', name: 'فواتير الكهرباء', expense_type: 'opex', default_allocation_rule: 'shared_orders' },
      { slug: 'facility-gas', name: 'فواتير الغاز', expense_type: 'opex', default_allocation_rule: 'shared_orders' },
      { slug: 'facility-water-internet', name: 'فواتير المياه والإنترنت', expense_type: 'opex', default_allocation_rule: 'shared_revenue' },
      { slug: 'facility-cleaning', name: 'نظافة وتعقيم ومكافحة', expense_type: 'opex', default_allocation_rule: 'shared_revenue' },
    ],
  },
  {
    slug: 'delivery',
    name: 'التوصيل واللوجستيات (Delivery & Fulfillment)',
    expense_type: 'opex',
    default_allocation_rule: 'shared_orders',
    children: [
      { slug: 'delivery-couriers', name: 'شحن ومناديب توصيل', expense_type: 'opex', default_allocation_rule: 'shared_orders' },
      { slug: 'delivery-fuel', name: 'بنزين وصيانة وسائل التوصيل', expense_type: 'opex', default_allocation_rule: 'shared_orders' },
      { slug: 'delivery-payment-fees', name: 'عمولات بوابات الدفع والتحصيل', expense_type: 'opex', default_allocation_rule: 'shared_revenue' },
    ],
  },
  {
    slug: 'admin-capex',
    name: 'المصاريف الإدارية والصيانة والأصول (Admin & CapEx)',
    expense_type: 'opex',
    default_allocation_rule: 'shared_revenue',
    children: [
      { slug: 'admin-equipment-maintenance', name: 'صيانة معدات المطبخ', expense_type: 'opex', default_allocation_rule: 'shared_orders' },
      { slug: 'admin-software', name: 'اشتراكات أنظمة وبرامج', expense_type: 'opex', default_allocation_rule: 'shared_revenue' },
      { slug: 'admin-misc', name: 'نثريات وطوارئ', expense_type: 'opex', default_allocation_rule: 'shared_revenue' },
      { slug: 'capex-equipment', name: 'شراء أصول ومعدات رأسمالية (CapEx)', expense_type: 'capex', default_allocation_rule: 'shared_revenue' },
    ],
  },
];

export function buildDefaultLocalCategories(): ExpenseCategory[] {
  const now = new Date().toISOString();
  const list: ExpenseCategory[] = [];
  for (const parent of SYSTEM_EXPENSE_CATEGORY_TREE) {
    const parentId = `cat-${parent.slug}`;
    list.push({
      id: parentId,
      name: parent.name,
      slug: parent.slug,
      expense_type: parent.expense_type,
      parent_id: null,
      default_allocation_rule: parent.default_allocation_rule,
      is_system: true,
      created_at: now,
    });
    for (const child of parent.children) {
      list.push({
        id: `cat-${child.slug}`,
        name: child.name,
        slug: child.slug,
        expense_type: child.expense_type,
        parent_id: parentId,
        default_allocation_rule: child.default_allocation_rule,
        is_system: true,
        created_at: now,
      });
    }
  }
  return list;
}

/**
 * Multi-Brand Allocation Engine:
 * Distributes any expense (amount + tax) across brands according to:
 *  - direct: 100% on directCompanyId
 *  - shared_revenue: proportional to month's non-cancelled sales per brand
 *  - shared_orders: proportional to month's non-cancelled order count per brand
 *  - fixed_percent: user-defined percentage map
 */
export function calculateBrandAllocations(params: {
  expenseId: string;
  totalAmount: number;
  expenseDate: string;
  allocationType: AllocationType;
  brands: Brand[];
  orders: Order[];
  directCompanyId?: string | null;
  fixedPercentages?: Record<string, number>;
}): Omit<ExpenseAllocation, 'id'>[] {
  const {
    expenseId,
    totalAmount,
    expenseDate,
    allocationType,
    brands,
    orders,
    directCompanyId,
    fixedPercentages = {},
  } = params;

  if (totalAmount <= 0 || brands.length === 0) {
    return [];
  }

  if (allocationType === 'direct' && directCompanyId) {
    return [
      {
        expense_id: expenseId,
        company_id: directCompanyId,
        allocation_type: 'direct',
        allocated_amount: Math.round(totalAmount * 100) / 100,
        percentage: 100,
      },
    ];
  }

  if (allocationType === 'fixed_percent') {
    const entries = brands
      .map((b) => ({ brandId: b.id, pct: Math.max(0, Number(fixedPercentages[b.id] ?? 0)) }))
      .filter((e) => e.pct > 0);

    const sumPct = entries.reduce((s, e) => s + e.pct, 0);
    if (sumPct > 0) {
      return entries.map((e) => {
        const normalizedPct = (e.pct / sumPct) * 100;
        return {
          expense_id: expenseId,
          company_id: e.brandId,
          allocation_type: 'fixed_percent',
          allocated_amount: Math.round(totalAmount * (normalizedPct / 100) * 100) / 100,
          percentage: Math.round(normalizedPct * 100) / 100,
        };
      });
    }
  }

  const monthPrefix = (expenseDate || new Date().toISOString()).slice(0, 7);
  const monthOrders = orders.filter(
    (o) =>
      o.status !== 'cancelled' &&
      Boolean(o.brand_id) &&
      (o.execution_date || o.created_at).slice(0, 7) === monthPrefix,
  );

  if (allocationType === 'shared_orders') {
    const totalCount = monthOrders.length;
    if (totalCount > 0) {
      return brands
        .map((brand) => {
          const bCount = monthOrders.filter((o) => o.brand_id === brand.id).length;
          if (bCount === 0) return null;
          const pct = (bCount / totalCount) * 100;
          return {
            expense_id: expenseId,
            company_id: brand.id,
            allocation_type: 'shared_orders' as const,
            allocated_amount: Math.round(totalAmount * (bCount / totalCount) * 100) / 100,
            percentage: Math.round(pct * 100) / 100,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
    }
  }

  // Default / shared_revenue
  const totalRevenue = monthOrders.reduce((s, o) => s + o.price, 0);
  if (totalRevenue > 0) {
    return brands
      .map((brand) => {
        const bRev = monthOrders
          .filter((o) => o.brand_id === brand.id)
          .reduce((s, o) => s + o.price, 0);
        if (bRev <= 0) return null;
        const pct = (bRev / totalRevenue) * 100;
        return {
          expense_id: expenseId,
          company_id: brand.id,
          allocation_type: 'shared_revenue' as const,
          allocated_amount: Math.round(totalAmount * (bRev / totalRevenue) * 100) / 100,
          percentage: Math.round(pct * 100) / 100,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }

  // Equal split fallback when month has no sales yet
  const equalShare = Math.round((totalAmount / brands.length) * 100) / 100;
  const equalPct = Math.round((100 / brands.length) * 100) / 100;
  return brands.map((brand) => ({
    expense_id: expenseId,
    company_id: brand.id,
    allocation_type: allocationType,
    allocated_amount: equalShare,
    percentage: equalPct,
  }));
}

export function advanceNextDueDate(currentDueDate: string, frequency: RecurringFrequency, dueDay: number): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(currentDueDate)
    ? new Date(`${currentDueDate}T00:00:00`)
    : new Date();

  if (frequency === 'weekly') {
    base.setDate(base.getDate() + 7);
  } else if (frequency === 'yearly') {
    base.setFullYear(base.getFullYear() + 1);
  } else {
    const nextMonth = base.getMonth() + 1;
    const targetYear = base.getFullYear() + Math.floor(nextMonth / 12);
    const targetMonth = nextMonth % 12;
    const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const clampedDay = Math.min(Math.max(1, dueDay || base.getDate()), daysInTargetMonth);
    const next = new Date(targetYear, targetMonth, clampedDay);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, '0');
    const dd = String(next.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface PnLSummary {
  totalRevenue: number;
  totalOrdersCount: number;
  totalOpex: number;
  totalCapex: number;
  totalCogs: number;
  netOperatingProfit: number;
  operatingMarginPct: number;
  foodCostPct: number;
  netCashFlow: number;
  brandProfitability: BrandProfitabilityRow[];
  categoryBreakdown: Array<{ categoryId: string; name: string; amount: number; sharePct: number }>;
  monthlyTrend6m: Array<{ monthKey: string; label: string; revenue: number; opex: number; profit: number }>;
}

export function computeFinancialPnL(params: {
  expenses: ExpenseRecord[];
  categories: ExpenseCategory[];
  orders: Order[];
  brands: Brand[];
  startDate: string;
  endDate: string;
}): PnLSummary {
  const { expenses, categories, orders, brands, startDate, endDate } = params;
  const catById = new Map(categories.map((c) => [c.id, c]));

  const isCogsCategory = (catId: string | null) => {
    if (!catId) return false;
    const cat = catById.get(catId);
    if (!cat) return false;
    if (cat.slug.startsWith('cogs')) return true;
    const parent = cat.parent_id ? catById.get(cat.parent_id) : null;
    return Boolean(parent?.slug.startsWith('cogs'));
  };

  const isMarketingAdCategory = (catId: string | null) => {
    if (!catId) return false;
    const cat = catById.get(catId);
    if (!cat) return false;
    if (cat.slug.startsWith('marketing')) return true;
    const parent = cat.parent_id ? catById.get(cat.parent_id) : null;
    return Boolean(parent?.slug.startsWith('marketing'));
  };

  const isCapexExpense = (exp: ExpenseRecord) => {
    const cat = exp.category_id ? catById.get(exp.category_id) : null;
    return cat?.expense_type === 'capex';
  };

  const getParentCategoryLabel = (catId: string | null) => {
    if (!catId) return 'مصروفات غير مصنفة';
    const cat = catById.get(catId);
    if (!cat) return 'مصروفات أخرى';
    if (cat.parent_id) {
      return catById.get(cat.parent_id)?.name ?? cat.name;
    }
    return cat.name;
  };

  const inRange = (dateStr: string) => {
    const d = dateStr.slice(0, 10);
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  };

  const scopedOrders = orders.filter(
    (o) => o.status !== 'cancelled' && inRange(o.execution_date || o.created_at),
  );
  const scopedExpenses = expenses.filter((e) => inRange(e.expense_date));

  const totalRevenue = scopedOrders.reduce((s, o) => s + o.price, 0);
  const totalOrdersCount = scopedOrders.length;

  let totalOpex = 0;
  let totalCapex = 0;
  let totalCogs = 0;
  const parentCatTotals = new Map<string, { categoryId: string; name: string; amount: number }>();

  for (const exp of scopedExpenses) {
    const fullAmount = exp.amount + (exp.tax_amount || 0);
    if (isCapexExpense(exp)) {
      totalCapex += fullAmount;
    } else {
      totalOpex += fullAmount;
      if (isCogsCategory(exp.category_id) || exp.source_type === 'purchase' || exp.source_type === 'waste') {
        totalCogs += fullAmount;
      }

      const parentName = getParentCategoryLabel(exp.category_id);
      const existing = parentCatTotals.get(parentName);
      parentCatTotals.set(parentName, {
        categoryId: exp.category_id ?? parentName,
        name: parentName,
        amount: (existing?.amount ?? 0) + fullAmount,
      });
    }
  }

  const netOperatingProfit = totalRevenue - totalOpex;
  const operatingMarginPct = totalRevenue > 0 ? (netOperatingProfit / totalRevenue) * 100 : 0;
  const foodCostPct = totalRevenue > 0 ? (totalCogs / totalRevenue) * 100 : 0;
  const netCashFlow = totalRevenue - totalOpex - totalCapex;

  // Per-brand profitability
  const brandProfitability: BrandProfitabilityRow[] = brands.map((brand) => {
    const bOrders = scopedOrders.filter((o) => o.brand_id === brand.id);
    const revenue = bOrders.reduce((s, o) => s + o.price, 0);
    let directExpenses = 0;
    let sharedExpenses = 0;
    let capexAllocated = 0;
    let adSpend = 0;

    for (const exp of scopedExpenses) {
      const fullAmount = exp.amount + (exp.tax_amount || 0);
      const capex = isCapexExpense(exp);
      const isAd = isMarketingAdCategory(exp.category_id);

      let alloc = exp.allocations.find((a) => a.company_id === brand.id);

      // Fallback live computation if allocations array wasn't persisted yet
      if (!alloc && exp.allocations.length === 0) {
        const computed = calculateBrandAllocations({
          expenseId: exp.id,
          totalAmount: fullAmount,
          expenseDate: exp.expense_date,
          allocationType: exp.brand_id ? 'direct' : 'shared_revenue',
          brands,
          orders,
          directCompanyId: exp.brand_id,
        });
        const match = computed.find((c) => c.company_id === brand.id);
        if (match) {
          alloc = { id: 'virtual', ...match };
        }
      }

      if (!alloc) continue;

      if (capex) {
        capexAllocated += alloc.allocated_amount;
      } else {
        if (alloc.allocation_type === 'direct') {
          directExpenses += alloc.allocated_amount;
        } else {
          sharedExpenses += alloc.allocated_amount;
        }
        if (isAd) {
          adSpend += alloc.allocated_amount;
        }
      }
    }

    const totalBrandOpex = directExpenses + sharedExpenses;
    const netProfit = revenue - totalBrandOpex;
    const profitMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const cac = bOrders.length > 0 ? adSpend / bOrders.length : 0;
    const roas = adSpend > 0 ? revenue / adSpend : 0;

    return {
      brandId: brand.id,
      brandName: brand.name,
      color: brand.color,
      orderCount: bOrders.length,
      revenue: Math.round(revenue * 100) / 100,
      directExpenses: Math.round(directExpenses * 100) / 100,
      sharedExpenses: Math.round(sharedExpenses * 100) / 100,
      totalOpex: Math.round(totalBrandOpex * 100) / 100,
      capexAllocated: Math.round(capexAllocated * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMarginPct: Math.round(profitMarginPct * 10) / 10,
      adSpend: Math.round(adSpend * 100) / 100,
      cac: Math.round(cac * 100) / 100,
      roas: Math.round(roas * 100) / 100,
    };
  });

  const categoryBreakdown = Array.from(parentCatTotals.values())
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({
      ...item,
      amount: Math.round(item.amount * 100) / 100,
      sharePct: totalOpex > 0 ? Math.round((item.amount / totalOpex) * 1000) / 10 : 0,
    }));

  // 6-Month Historical Revenue vs OpEx Trend
  const monthlyTrend6m: Array<{ monthKey: string; label: string; revenue: number; opex: number; profit: number }> = [];
  const monthNamesAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - offset);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${monthNamesAr[d.getMonth()]} ${d.getFullYear()}`;

    const mRev = orders
      .filter((o) => o.status !== 'cancelled' && (o.execution_date || o.created_at).slice(0, 7) === mKey)
      .reduce((s, o) => s + o.price, 0);

    const mOpex = expenses
      .filter((e) => !isCapexExpense(e) && e.expense_date.slice(0, 7) === mKey)
      .reduce((s, e) => s + e.amount + (e.tax_amount || 0), 0);

    monthlyTrend6m.push({
      monthKey: mKey,
      label,
      revenue: Math.round(mRev),
      opex: Math.round(mOpex),
      profit: Math.round(mRev - mOpex),
    });
  }

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrdersCount,
    totalOpex: Math.round(totalOpex * 100) / 100,
    totalCapex: Math.round(totalCapex * 100) / 100,
    totalCogs: Math.round(totalCogs * 100) / 100,
    netOperatingProfit: Math.round(netOperatingProfit * 100) / 100,
    operatingMarginPct: Math.round(operatingMarginPct * 10) / 10,
    foodCostPct: Math.round(foodCostPct * 10) / 10,
    netCashFlow: Math.round(netCashFlow * 100) / 100,
    brandProfitability,
    categoryBreakdown,
    monthlyTrend6m,
  };
}

export interface PurchasePricePoint {
  itemId: string;
  itemName: string;
  supplierName: string;
  unitCost: number;
  purchasedAt: string;
}

/**
 * Phase 3: 5-Rule Cost-Saving & Intelligence Engine
 */
export function generateCostSavingInsights(params: {
  expenses: ExpenseRecord[];
  categories: ExpenseCategory[];
  orders: Order[];
  brands: Brand[];
  meals: Meal[];
  packages: PackagePlan[];
  companyIngredients?: MenuIngredient[];
  inventoryItems?: InventoryCostItem[];
  purchaseHistory?: PurchasePricePoint[];
  actualWithdrawalsPlusWasteCost?: number;
  startDate: string;
  endDate: string;
}): CostSavingInsight[] {
  const {
    expenses,
    categories,
    orders,
    brands,
    meals,
    packages,
    companyIngredients = [],
    inventoryItems = [],
    purchaseHistory = [],
    actualWithdrawalsPlusWasteCost = 0,
    startDate,
    endDate,
  } = params;

  const insights: CostSavingInsight[] = [];
  const catById = new Map(categories.map((c) => [c.id, c]));

  const inRange = (dateStr: string) => {
    const d = dateStr.slice(0, 10);
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  };

  // --- RULE 1: Supplier Price Creep (>5% vs average of previous 3 purchases) ---
  const byItem = new Map<string, PurchasePricePoint[]>();
  for (const row of purchaseHistory) {
    if (row.unitCost <= 0) continue;
    const list = byItem.get(row.itemId) ?? [];
    list.push(row);
    byItem.set(row.itemId, list);
  }

  for (const [itemId, rows] of byItem.entries()) {
    const sorted = [...rows].sort(
      (a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime(),
    );
    if (sorted.length < 2) continue;

    const latest = sorted[0];
    const previousThree = sorted.slice(1, 4);
    const avgPrev =
      previousThree.reduce((s, r) => s + r.unitCost, 0) / previousThree.length;

    if (avgPrev > 0) {
      const creepPct = ((latest.unitCost - avgPrev) / avgPrev) * 100;
      if (creepPct > 5) {
        const cheapest = [...sorted].sort((a, b) => a.unitCost - b.unitCost)[0];
        const altSupplierHint =
          cheapest && cheapest.supplierName && cheapest.supplierName !== latest.supplierName
            ? `أرخص مورد بديل مسجل: "${cheapest.supplierName}" بسعر ${formatEGPCurrency(cheapest.unitCost)}.`
            : 'فاوض المورد الحالي أو اطلب عرض سعر بديل لتثبيت التكلفة.';

        const estMonthlySaving = Math.max(150, Math.round((latest.unitCost - avgPrev) * 30));
        insights.push({
          id: `price-creep-${itemId}`,
          rule: 'supplier_price_creep',
          severity: creepPct >= 15 ? 'high' : 'medium',
          title: `تضخم سعر شراء "${latest.itemName}" بنسبة +${creepPct.toFixed(1)}%`,
          description: `آخر فاتورة من "${latest.supplierName || 'مورد غير محدد'}" بسعر ${formatEGPCurrency(latest.unitCost)} مقارنة بمتوسط ${formatEGPCurrency(avgPrev)} في آخر ${previousThree.length} فواتير. ${altSupplierHint}`,
          estimatedMonthlySaving: estMonthlySaving,
          metricBadge: `+${creepPct.toFixed(1)}% تضخم مورد`,
          actionLabel: 'مراجعة أسعار الموردين',
          actionHref: '/purchases',
        });
      }
    }
  }

  // --- RULE 2: Theoretical vs Actual Food Cost Gap (>3% variance) ---
  const periodValidOrders = orders.filter(
    (o) => o.status !== 'cancelled' && inRange(o.execution_date || o.created_at),
  );
  const periodRevenue = periodValidOrders.reduce((s, o) => s + o.price, 0);

  let theoreticalRecipeCost = 0;
  const mealByNormalizedName = new Map(
    meals.map((m) => [`${m.brand_id}::${compactWhitespace(m.name).toLowerCase()}`, m]),
  );

  for (const order of periodValidOrders) {
    const resolved = resolveOrderMeals(order, meals, packages);
    for (const rMeal of resolved) {
      const matched =
        mealByNormalizedName.get(
          `${order.brand_id ?? ''}::${compactWhitespace(rMeal.label).toLowerCase()}`,
        ) ??
        meals.find(
          (m) => compactWhitespace(m.name).toLowerCase() === compactWhitespace(rMeal.label).toLowerCase(),
        );
      if (matched) {
        const bd = computeMealCostBreakdown(matched, companyIngredients, inventoryItems);
        if (bd.estimatedCost !== null) {
          theoreticalRecipeCost += bd.estimatedCost;
        }
      }
    }
  }

  const periodCogsLedger = expenses
    .filter(
      (e) =>
        inRange(e.expense_date) &&
        (e.source_type === 'purchase' ||
          e.source_type === 'waste' ||
          Boolean(e.category_id && catById.get(e.category_id)?.slug.startsWith('cogs'))),
    )
    .reduce((s, e) => s + e.amount + (e.tax_amount || 0), 0);

  const actualFoodUsage =
    actualWithdrawalsPlusWasteCost > 0 ? actualWithdrawalsPlusWasteCost : periodCogsLedger;

  if (theoreticalRecipeCost > 0 && actualFoodUsage > 0 && periodRevenue > 0) {
    const theoPct = (theoreticalRecipeCost / periodRevenue) * 100;
    const actualPct = (actualFoodUsage / periodRevenue) * 100;
    const variancePct = actualPct - theoPct;

    if (variancePct > 3) {
      const leakAmount = Math.round(actualFoodUsage - theoreticalRecipeCost);
      insights.push({
        id: 'food-cost-gap',
        rule: 'food_cost_gap',
        severity: variancePct >= 8 ? 'high' : 'medium',
        title: `فجوة تكلفة الطعام الفعلية عن المعيارية (+${variancePct.toFixed(1)}%)`,
        description: `التكلفة المعيارية لوصفات الوجبات المباعة ${formatEGPCurrency(theoreticalRecipeCost)} (${theoPct.toFixed(1)}%) بينما الاستهلاك والهالك الفعلي ${formatEGPCurrency(actualFoodUsage)} (${actualPct.toFixed(1)}%). راجع أوزان الغرف والهالك بالمطبخ.`,
        estimatedMonthlySaving: Math.max(0, leakAmount),
        metricBadge: `انحراف +${variancePct.toFixed(1)}%`,
        actionLabel: 'فحص سحوبات وهالك المخزن',
        actionHref: '/inventory',
      });
    }
  }

  // --- RULE 3: Sponsored Social Ads Efficiency (CAC & ROAS per Brand) ---
  const pnl = computeFinancialPnL({
    expenses,
    categories,
    orders,
    brands,
    startDate,
    endDate,
  });

  for (const row of pnl.brandProfitability) {
    if (row.adSpend <= 0) continue;
    const avgOrderVal = row.orderCount > 0 ? row.revenue / row.orderCount : 0;
    const highCac = avgOrderVal > 0 && row.cac > avgOrderVal * 0.25;
    const lowRoas = row.roas < 3;

    if (highCac || lowRoas) {
      const targetSaving = Math.round(row.adSpend * 0.25);
      insights.push({
        id: `ad-efficiency-${row.brandId}`,
        rule: 'ad_efficiency',
        severity: row.roas < 2 ? 'high' : 'medium',
        title: `تنبيه كفاءة إعلانات "${row.brandName}" (العائد ${row.roas.toFixed(1)}x)`,
        description: `إنفاق الإسبونسر ${formatEGPCurrency(row.adSpend)} جلب ${row.orderCount.toLocaleString('en-US')} طلب بتكلفة استحواذ (CAC) ${formatEGPCurrency(row.cac)} للطلب. ركّز الميزانية على شرائح VIP واسترجاع العملاء عبر واتساب مجاناً.`,
        estimatedMonthlySaving: targetSaving,
        metricBadge: `CAC: ${formatEGPCurrency(row.cac)} · ROAS ${row.roas.toFixed(1)}x`,
        actionLabel: 'استهداف عملاء الاسترجاع مجاناً',
        actionHref: '/customers?segment=at_risk',
      });
    }
  }

  // --- RULE 4: Cancelled Orders Direct Bleed Calculator ---
  const cancelledOrders = orders.filter(
    (o) => o.status === 'cancelled' && inRange(o.execution_date || o.created_at),
  );
  if (cancelledOrders.length > 0) {
    let directBleed = 0;
    for (const cOrder of cancelledOrders) {
      const mealCount = Math.max(1, getOrderMealCount(cOrder, meals, packages));
      // Conservative direct raw + packaging + courier bleed estimate (38% of order price or 65 EGP/meal floor)
      const estRawAndPkg = Math.max(mealCount * 45, Math.round(cOrder.price * 0.35));
      const deliveryWaste = cOrder.delivery_fee && cOrder.delivery_fee > 0 ? cOrder.delivery_fee : 0;
      directBleed += estRawAndPkg + deliveryWaste;
    }

    if (directBleed > 0) {
      insights.push({
        id: 'cancelled-orders-bleed',
        rule: 'cancelled_orders_bleed',
        severity: cancelledOrders.length >= 5 ? 'high' : 'medium',
        title: `نزيف مباشر من ${cancelledOrders.length.toLocaleString('en-US')} طلب ملغي`,
        description: `التكلفة المباشرة المهدرة للخامات والعلب والتوصيل في الطلبات الملغاة تُقدر بـ ${formatEGPCurrency(directBleed)}. فعّل تأكيد الطلبات قبل التحضير ومراجعة الطلبات المتأخرة (+6 ساعات).`,
        estimatedMonthlySaving: Math.round(directBleed),
        metricBadge: `${cancelledOrders.length.toLocaleString('en-US')} طلب ملغي`,
        actionLabel: 'مراجعة الطلبات المتأخرة والملغاة',
        actionHref: '/orders?delayed=1',
      });
    }
  }

  // --- RULE 5: Labor & Utilities Spike per Order (>15% jump vs previous period) ---
  const isLaborOrUtility = (exp: ExpenseRecord) => {
    if (exp.source_type === 'payroll') return true;
    if (!exp.category_id) return false;
    const cat = catById.get(exp.category_id);
    if (!cat) return false;
    const slug = cat.slug;
    const parentSlug = cat.parent_id ? catById.get(cat.parent_id)?.slug ?? '' : '';
    return (
      slug.startsWith('payroll') ||
      parentSlug === 'payroll' ||
      slug === 'facility-electricity' ||
      slug === 'facility-gas' ||
      slug === 'facility-water-internet'
    );
  };

  const currentMonthKey = (endDate || new Date().toISOString()).slice(0, 7);
  const currDateObj = new Date(`${currentMonthKey}-01T00:00:00`);
  currDateObj.setMonth(currDateObj.getMonth() - 1);
  const prevMonthKey = `${currDateObj.getFullYear()}-${String(currDateObj.getMonth() + 1).padStart(2, '0')}`;

  const currLaborUtil = expenses
    .filter((e) => e.expense_date.slice(0, 7) === currentMonthKey && isLaborOrUtility(e))
    .reduce((s, e) => s + e.amount + (e.tax_amount || 0), 0);
  const prevLaborUtil = expenses
    .filter((e) => e.expense_date.slice(0, 7) === prevMonthKey && isLaborOrUtility(e))
    .reduce((s, e) => s + e.amount + (e.tax_amount || 0), 0);

  const currOrdersCnt = Math.max(
    1,
    orders.filter((o) => o.status !== 'cancelled' && (o.execution_date || o.created_at).slice(0, 7) === currentMonthKey).length,
  );
  const prevOrdersCnt = Math.max(
    1,
    orders.filter((o) => o.status !== 'cancelled' && (o.execution_date || o.created_at).slice(0, 7) === prevMonthKey).length,
  );

  if (currLaborUtil > 0 && prevLaborUtil > 0) {
    const currPerOrder = currLaborUtil / currOrdersCnt;
    const prevPerOrder = prevLaborUtil / prevOrdersCnt;
    const jumpPct = ((currPerOrder - prevPerOrder) / prevPerOrder) * 100;

    if (jumpPct > 15) {
      const excessCost = Math.round((currPerOrder - prevPerOrder) * currOrdersCnt);
      insights.push({
        id: 'labor-utility-spike',
        rule: 'labor_utility_spike',
        severity: jumpPct >= 30 ? 'high' : 'medium',
        title: `ارتفاع تكلفة العمالة والمرافق للطلب بنسبة +${jumpPct.toFixed(0)}%`,
        description: `متوسط نصيب الطلب من الأجور والكهرباء والغاز ارتفع إلى ${formatEGPCurrency(currPerOrder)} مقارنة بـ ${formatEGPCurrency(prevPerOrder)} الشهر السابق. راجع ساعات الإضافي وجدول تشغيل أفران ومبردات المطبخ.`,
        estimatedMonthlySaving: Math.max(200, excessCost),
        metricBadge: `+${jumpPct.toFixed(0)}% لكل طلب`,
        actionLabel: 'مراجعة الإضافي والحضور',
        actionHref: '/hr',
      });
    }
  }

  return insights.sort((a, b) => b.estimatedMonthlySaving - a.estimatedMonthlySaving);
}
