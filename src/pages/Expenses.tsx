import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  FolderTree,
  Lightbulb,
  Pencil,
  PieChart as PieChartIcon,
  Plus,
  Receipt,
  RefreshCcw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import NewExpenseDialog from '@/components/finance/NewExpenseDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useBrands } from '@/hooks/useBrands';
import { useFinance } from '@/hooks/useFinance';
import { useMenuCatalog } from '@/hooks/useMenuCatalog';
import { useOrders } from '@/hooks/useOrders';
import { computeFinancialPnL, generateCostSavingInsights } from '@/lib/financeEngine';
import { cn, formatEGPCurrency, getTodayDateValue } from '@/lib/utils';
import {
  ALLOCATION_TYPE_LABELS,
  AllocationType,
  ExpenseCategory,
  ExpenseRecord,
  ExpenseType,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
} from '@/types/finance';

const DONUT_COLORS = ['#059669', '#0284c7', '#f59e0b', '#7c3aed', '#e11d48', '#64748b'];

function getMonthDateBounds() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
  return {
    start: `${yyyy}-${mm}-01`,
    end: `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export default function Expenses() {
  const navigate = useNavigate();
  const { isDemoMode } = useAuth();
  const { brands, loading: brandsLoading } = useBrands();
  const { orders, loading: ordersLoading } = useOrders();
  const { meals, packages } = useMenuCatalog();

  const {
    categories,
    expenses,
    purchaseHistory,
    inventoryItems,
    actualFoodUsageCost,
    storageMode,
    loading: financeLoading,
    refresh,
    uploadReceipt,
    openReceipt,
    saveExpense,
    deleteExpense,
    saveSubcategory,
    deleteSubcategory,
  } = useFinance(brands, orders);

  const initialBounds = useMemo(() => getMonthDateBounds(), []);
  const [startDate, setStartDate] = useState(initialBounds.start);
  const [endDate, setEndDate] = useState(initialBounds.end);

  // Ledger filters
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [parentCatFilter, setParentCatFilter] = useState('all');
  const [subCatFilter, setSubCatFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Dialog states
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);

  // Settings tab state
  const [settingsNewSubName, setSettingsNewSubName] = useState<Record<string, string>>({});
  const [settingsNewSubType, setSettingsNewSubType] = useState<Record<string, ExpenseType>>({});

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const parentCategories = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories],
  );

  const pnl = useMemo(
    () =>
      computeFinancialPnL({
        expenses,
        categories,
        orders,
        brands,
        startDate,
        endDate,
      }),
    [expenses, categories, orders, brands, startDate, endDate],
  );

  const insights = useMemo(
    () =>
      generateCostSavingInsights({
        expenses,
        categories,
        orders,
        brands,
        meals,
        packages,
        inventoryItems,
        purchaseHistory,
        actualWithdrawalsPlusWasteCost: actualFoodUsageCost,
        startDate,
        endDate,
      }),
    [
      expenses,
      categories,
      orders,
      brands,
      meals,
      packages,
      inventoryItems,
      purchaseHistory,
      actualFoodUsageCost,
      startDate,
      endDate,
    ],
  );

  const totalSavingsOpportunity = useMemo(
    () => insights.reduce((s, item) => s + item.estimatedMonthlySaving, 0),
    [insights],
  );

  const filteredLedger = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return expenses.filter((exp) => {
      if (startDate && exp.expense_date < startDate) return false;
      if (endDate && exp.expense_date > endDate) return false;

      if (companyFilter !== 'all') {
        const matchesDirect = exp.brand_id === companyFilter;
        const matchesAlloc = exp.allocations.some((a) => a.company_id === companyFilter);
        if (!matchesDirect && !matchesAlloc) return false;
      }

      if (parentCatFilter !== 'all') {
        const cat = exp.category_id ? catById.get(exp.category_id) : null;
        if (!cat) return false;
        if (cat.id !== parentCatFilter && cat.parent_id !== parentCatFilter) return false;
      }

      if (subCatFilter !== 'all' && exp.category_id !== subCatFilter) {
        return false;
      }

      if (sourceFilter !== 'all' && exp.source_type !== sourceFilter) {
        return false;
      }

      if (statusFilter !== 'all' && exp.payment_status !== statusFilter) {
        return false;
      }

      if (q) {
        const catName = exp.category_id ? catById.get(exp.category_id)?.name ?? '' : '';
        return (
          exp.title.toLowerCase().includes(q) ||
          exp.notes.toLowerCase().includes(q) ||
          catName.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [
    expenses,
    startDate,
    endDate,
    companyFilter,
    parentCatFilter,
    subCatFilter,
    sourceFilter,
    statusFilter,
    searchQuery,
    catById,
  ]);

  const exportLedgerExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = filteredLedger.map((exp) => {
      const cat = exp.category_id ? catById.get(exp.category_id) : null;
      const parentCat = cat?.parent_id ? catById.get(cat.parent_id) : cat;
      return {
        'التاريخ': exp.expense_date,
        'البيان': exp.title,
        'التصنيف الرئيسي': parentCat?.name ?? 'غير مصنف',
        'البند الفرعي': cat?.parent_id ? cat.name : '—',
        'النوع المحاسبي': cat?.expense_type === 'capex' ? 'أصول CapEx' : 'تشغيلي OpEx',
        'المصدر': SOURCE_TYPE_LABELS[exp.source_type],
        'المبلغ الأساسي': exp.amount,
        'الضريبة': exp.tax_amount,
        'الإجمالي': exp.amount + exp.tax_amount,
        'طريقة الدفع': PAYMENT_METHOD_LABELS[exp.payment_method],
        'حالة السداد': PAYMENT_STATUS_LABELS[exp.payment_status],
        'توزيع الشركات':
          exp.allocations.length > 0
            ? exp.allocations
                .map((a) => `${brandById.get(a.company_id)?.name ?? 'شركة'}: ${a.allocated_amount} ج.م`)
                .join(' | ')
            : 'مشترك على المطبخ',
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'سجل المصروفات');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        pnl.brandProfitability.map((r) => ({
          'الشركة': r.brandName,
          'عدد الطلبات': r.orderCount,
          'المبيعات': r.revenue,
          'مصروفات مباشرة': r.directExpenses,
          'نصيب المصروفات المشتركة': r.sharedExpenses,
          'إجمالي المصروفات التشغيلية': r.totalOpex,
          'صافي الربح': r.netProfit,
          'هامش الربح %': `${r.profitMarginPct}%`,
        })),
      ),
      'ربحية الشركات',
    );
    XLSX.writeFile(wb, `finance-report-${getTodayDateValue()}.xlsx`);
  };

  const resetAllFilters = () => {
    const bounds = getMonthDateBounds();
    setStartDate(bounds.start);
    setEndDate(bounds.end);
    setSearchQuery('');
    setCompanyFilter('all');
    setParentCatFilter('all');
    setSubCatFilter('all');
    setSourceFilter('all');
    setStatusFilter('all');
  };

  if (financeLoading || brandsLoading || ordersLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header Actions */}
      <AppLayoutHeaderPortal>
        <div className="flex flex-wrap items-center gap-2">
          {storageMode === 'local' && (
            <span className="hidden xl:inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
              مزامنة محلية + قراءة تلقائية
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-lg gap-1.5 text-xs font-semibold"
            onClick={() => navigate('/expenses/recurring')}
          >
            <CalendarDays className="h-3.5 w-3.5 text-emerald-600" />
            <span>الالتزامات المتكررة</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-lg gap-1.5 text-xs font-semibold"
            onClick={() => void exportLedgerExcel()}
          >
            <Download className="h-3.5 w-3.5" />
            <span>تصدير التقرير المالي</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-lg gap-1.5 text-xs font-semibold"
            onClick={() => void refresh()}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </Button>
          {!isDemoMode && (
            <Button
              size="sm"
              className="h-9 rounded-lg gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              onClick={() => {
                setEditingExpense(null);
                setExpenseModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              <span>+ تسجيل مصروف جديد</span>
            </Button>
          )}
        </div>
      </AppLayoutHeaderPortal>

      {/* Global Period Selector Strip */}
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold text-slate-800">نطاق التحليل المالي:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">من</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 w-36 text-xs tabular-nums"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">إلى</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 w-36 text-xs tabular-nums"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-slate-500 hover:text-slate-900 gap-1"
            onClick={resetAllFilters}
          >
            <RotateCcw className="h-3 w-3" />
            <span>الشهر الحالي</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {insights.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 font-semibold text-amber-800 tabular-nums">
              <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
              فرص توفير مكتشفة: {formatEGPCurrency(totalSavingsOpportunity)}
            </span>
          )}
        </div>
      </Card>

      {/* 4 Main Tabs */}
      <Tabs defaultValue="pnl" dir="rtl" className="space-y-5">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto min-w-full sm:min-w-0 justify-start gap-1 rounded-xl border border-slate-200/80 bg-white p-1">
            <TabsTrigger
              value="pnl"
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 gap-1.5"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              لوحة التحليل المالي (P&L)
            </TabsTrigger>
            <TabsTrigger
              value="ledger"
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 gap-1.5 tabular-nums"
            >
              <Receipt className="h-3.5 w-3.5" />
              سجل المصروفات الموحد ({filteredLedger.length.toLocaleString('en-US')})
            </TabsTrigger>
            <TabsTrigger
              value="insights"
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 gap-1.5 tabular-nums"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              فرص التوفير والتنبيهات ({insights.length.toLocaleString('en-US')})
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 gap-1.5"
            >
              <FolderTree className="h-3.5 w-3.5" />
              إدارة التصنيفات وقواعد التوزيع
            </TabsTrigger>
          </TabsList>
        </div>

        {/* =====================================================================
            TAB 1: P&L FINANCIAL DASHBOARD
        ===================================================================== */}
        <TabsContent value="pnl" className="space-y-5">
          {/* 4 Executive KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
            <Card className="p-5 flex flex-col justify-between border-t-2 border-t-emerald-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">إجمالي الإيرادات الفعلية</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
                {formatEGPCurrency(pnl.totalRevenue)}
              </p>
              <span className="text-[11px] text-slate-500 tabular-nums">
                من {pnl.totalOrdersCount.toLocaleString('en-US')} طلب غير ملغي
              </span>
            </Card>

            <Card className="p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">إجمالي المصروفات التشغيلية (OpEx)</span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200/60 flex items-center justify-center text-rose-600">
                  <TrendingDown className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
                {formatEGPCurrency(pnl.totalOpex)}
              </p>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {pnl.totalCapex > 0
                  ? `+ أصول رأسمالية مستقلة (CapEx): ${formatEGPCurrency(pnl.totalCapex)}`
                  : 'شامل الخامات، الرواتب، المرافق، والإعلانات'}
              </span>
            </Card>

            <Card
              className={cn(
                'p-5 flex flex-col justify-between',
                pnl.netOperatingProfit < 0 && 'bg-rose-50/30 border-rose-200/90',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">صافي الربح التشغيلي والهامش</span>
                <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-700">
                  <Wallet className="h-4 w-4" />
                </div>
              </div>
              <p
                className={cn(
                  'mt-2 text-2xl font-bold tabular-nums tracking-tight',
                  pnl.netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700',
                )}
              >
                {formatEGPCurrency(pnl.netOperatingProfit)}
              </p>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">هامش الربح الصافي:</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 font-bold tabular-nums',
                    pnl.operatingMarginPct >= 15
                      ? 'bg-emerald-50 text-emerald-700'
                      : pnl.operatingMarginPct >= 0
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700',
                  )}
                >
                  {pnl.operatingMarginPct.toFixed(1)}%
                </span>
              </div>
            </Card>

            <Card className="p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">نسبة تكلفة الطعام (Food Cost %)</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-700">
                  <PieChartIcon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
                {pnl.foodCostPct.toFixed(1)}%
              </p>
              <span className="text-[11px] text-slate-500 tabular-nums">
                إجمالي خامات وتغليف وهالك: {formatEGPCurrency(pnl.totalCogs)}
              </span>
            </Card>
          </div>

          {/* Multi-Brand Profitability Matrix Table */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-emerald-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">جدول ربحية الشركات والبراندات</h2>
                  <p className="text-[11px] text-slate-500">
                    المبيعات − المصروفات المباشرة (كالإسبونسر) − حصة الشركة من مصروفات المطبخ المشتركة = صافي الربح الفعلي
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 font-semibold">
                    <th className="px-4 py-3">الشركة / البراند</th>
                    <th className="px-4 py-3">الطلبات</th>
                    <th className="px-4 py-3">المبيعات</th>
                    <th className="px-4 py-3">المصروفات المباشرة</th>
                    <th className="px-4 py-3">نصيب المصروفات المشتركة</th>
                    <th className="px-4 py-3">صافي الربح</th>
                    <th className="px-4 py-3">هامش الربح</th>
                    <th className="px-4 py-3">تكلفة استحواذ الطلب (CAC)</th>
                  </tr>
                </thead>
                <tbody>
                  {pnl.brandProfitability.map((row) => (
                    <tr
                      key={row.brandId}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }}
                          />
                          <span>{row.brandName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {row.orderCount.toLocaleString('en-US')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">
                        {formatEGPCurrency(row.revenue)}
                      </td>
                      <td className="px-4 py-3 text-rose-600 tabular-nums">
                        {formatEGPCurrency(row.directExpenses)}
                      </td>
                      <td className="px-4 py-3 text-amber-700 tabular-nums">
                        {formatEGPCurrency(row.sharedExpenses)}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 font-bold tabular-nums',
                          row.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700',
                        )}
                      >
                        {formatEGPCurrency(row.netProfit)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                            row.profitMarginPct >= 15
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                              : row.profitMarginPct >= 0
                                ? 'bg-amber-50 text-amber-700 border border-amber-200/70'
                                : 'bg-rose-50 text-rose-700 border border-rose-200/70',
                          )}
                        >
                          {row.profitMarginPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {row.adSpend > 0 ? formatEGPCurrency(row.cac) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Charts Row: Expense Category Donut + 6-Month Revenue vs OpEx Composed Chart */}
          <div className="grid gap-4 lg:grid-cols-12 items-stretch">
            <Card className="lg:col-span-5 p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">توزيع المصروفات حسب التصنيف</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  هيكل التكاليف التشغيلية للفترة المحددة
                </p>
              </div>

              {pnl.categoryBreakdown.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-400">
                  لا توجد مصروفات مسجلة في هذه الفترة لعرض الرسم الدائري.
                </div>
              ) : (
                <>
                  <div className="h-56 w-full mt-3" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pnl.categoryBreakdown}
                          dataKey="amount"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={82}
                          paddingAngle={2}
                        >
                          {pnl.categoryBreakdown.map((entry, idx) => (
                            <Cell
                              key={entry.categoryId}
                              fill={DONUT_COLORS[idx % DONUT_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: number) => formatEGPCurrency(Number(val))}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-1.5 mt-2">
                    {pnl.categoryBreakdown.map((item, idx) => (
                      <div key={item.categoryId} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                          />
                          <span className="truncate text-slate-700 font-medium">{item.name}</span>
                        </div>
                        <span className="font-semibold text-slate-900 tabular-nums shrink-0">
                          {formatEGPCurrency(item.amount)} ({item.sharePct}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            <Card className="lg:col-span-7 p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  مقارنة الإيرادات بالمصروفات وصافي الربح (آخر 6 شهور)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  تطور الأداء المالي الشهري للمطبخ السحابي
                </p>
              </div>

              <div className="h-72 w-full mt-4" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={pnl.monthlyTrend6m}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(val: number) => formatEGPCurrency(Number(val))} />
                    <Legend />
                    <Bar dataKey="revenue" name="الإيرادات" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="opex" name="المصروفات" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      name="صافي الربح"
                      stroke="#0284c7"
                      strokeWidth={2.5}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* =====================================================================
            TAB 2: UNIFIED EXPENSES LEDGER
        ===================================================================== */}
        <TabsContent value="ledger" className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
              <div className="relative lg:col-span-2">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالعنوان، الملاحظات، أو اسم البند..."
                  className="pr-9 h-9 text-xs"
                />
              </div>

              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="كل الشركات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الشركات</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={parentCatFilter}
                onValueChange={(v) => {
                  setParentCatFilter(v);
                  setSubCatFilter('all');
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="التصنيف الرئيسي" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل التصنيفات</SelectItem>
                  {parentCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="مصدر المصروف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المصادر</SelectItem>
                  <SelectItem value="manual">إدخال يدوي</SelectItem>
                  <SelectItem value="recurring">الالتزامات المتكررة</SelectItem>
                  <SelectItem value="purchase">تلقائي · مشتريات</SelectItem>
                  <SelectItem value="payroll">تلقائي · رواتب وحوافز</SelectItem>
                  <SelectItem value="waste">تلقائي · هالك مخزون</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="حالة السداد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل حالات السداد</SelectItem>
                  <SelectItem value="paid">مدفوع بالكامل</SelectItem>
                  <SelectItem value="partial">مدفوع جزئياً</SelectItem>
                  <SelectItem value="pending">مستحق / آجل</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {parentCatFilter !== 'all' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-500">البند الفرعي:</span>
                <button
                  type="button"
                  onClick={() => setSubCatFilter('all')}
                  className={cn(
                    'px-2.5 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer',
                    subCatFilter === 'all'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  الكل
                </button>
                {categories
                  .filter((c) => c.parent_id === parentCatFilter)
                  .map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setSubCatFilter(sub.id)}
                      className={cn(
                        'px-2.5 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer',
                        subCatFilter === sub.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {sub.name}
                    </button>
                  ))}
              </div>
            )}
          </Card>

          {filteredLedger.length === 0 ? (
            <Card className="border-dashed py-12 text-center text-sm text-slate-500">
              لا توجد قيود مصروفات مطابقة للفلاتر المحددة حالياً.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 font-semibold">
                      <th className="px-4 py-3">التاريخ</th>
                      <th className="px-4 py-3">البيان</th>
                      <th className="px-4 py-3">التصنيف</th>
                      <th className="px-4 py-3">المصدر</th>
                      <th className="px-4 py-3">التوزيع على الشركات</th>
                      <th className="px-4 py-3">الإجمالي</th>
                      <th className="px-4 py-3">الدفع والحالة</th>
                      <th className="px-4 py-3 text-left">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map((exp) => {
                      const cat = exp.category_id ? catById.get(exp.category_id) : null;
                      const isAuto = ['purchase', 'payroll', 'waste'].includes(exp.source_type);

                      return (
                        <tr
                          key={exp.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                        >
                          <td className="px-4 py-3 tabular-nums text-slate-600 font-medium">
                            {exp.expense_date}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-900">{exp.title}</p>
                            {exp.notes && (
                              <p className="text-[11px] text-slate-500 line-clamp-1">{exp.notes}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-700">
                              {cat?.name ?? 'غير مصنف'}
                            </span>
                            {cat?.expense_type === 'capex' && (
                              <Badge variant="outline" className="mr-1.5 text-[10px] text-amber-700 border-amber-300">
                                CapEx
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold border',
                                isAuto
                                  ? 'bg-sky-50 text-sky-700 border-sky-200/80'
                                  : 'bg-slate-100 text-slate-700 border-slate-200/80',
                              )}
                            >
                              {SOURCE_TYPE_LABELS[exp.source_type]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {exp.allocations.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {exp.allocations.map((a) => {
                                  const b = brandById.get(a.company_id);
                                  return (
                                    <span
                                      key={a.id}
                                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 tabular-nums"
                                    >
                                      {b?.name ?? 'شركة'}: {a.percentage.toFixed(0)}%
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">مشترك تلقائي</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900 tabular-nums">
                            {formatEGPCurrency(exp.amount + (exp.tax_amount || 0))}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={cn(
                                  'w-fit rounded-full px-2 py-0.5 text-[10px] font-bold',
                                  exp.payment_status === 'paid' && 'bg-emerald-50 text-emerald-700',
                                  exp.payment_status === 'partial' && 'bg-amber-50 text-amber-700',
                                  exp.payment_status === 'pending' && 'bg-rose-50 text-rose-700',
                                )}
                              >
                                {PAYMENT_STATUS_LABELS[exp.payment_status]}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {PAYMENT_METHOD_LABELS[exp.payment_method]}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {exp.receipt_url && (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  title="عرض الإيصال المرفق"
                                  className="h-7 w-7"
                                  onClick={() => void openReceipt(exp.receipt_url!)}
                                >
                                  <FileText className="h-3.5 w-3.5 text-emerald-600" />
                                </Button>
                              )}
                              {!isDemoMode && !exp.id.startsWith('auto-') && (
                                <>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setEditingExpense(exp);
                                      setExpenseModalOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                                    onClick={() => void deleteExpense(exp.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* =====================================================================
            TAB 3: COST-SAVING & INTELLIGENCE ENGINE (5 RULES)
        ===================================================================== */}
        <TabsContent value="insights" className="space-y-4">
          <Card className="p-5 flex flex-wrap items-center justify-between gap-4 border-r-4 border-r-emerald-500">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  محرك الذكاء واكتشاف فرص التوفير التشغيلية (5 قواعد فحص آلي)
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                يفحص تلقائياً: تضخم أسعار الموردين (&gt;5%)، فجوة تكلفة الطعام (&gt;3%)، كفاءة إعلانات السوشيال ميديا، نزيف الطلبات الملغاة، وقفزات العمالة والمرافق (&gt;15%).
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200/80 px-4 py-2.5 text-center">
              <span className="block text-[11px] font-medium text-emerald-700">
                إجمالي التوفير الشهري المقدر
              </span>
              <span className="text-lg font-bold text-emerald-800 tabular-nums tracking-tight">
                {formatEGPCurrency(totalSavingsOpportunity)}
              </span>
            </div>
          </Card>

          {insights.length === 0 ? (
            <Card className="p-10 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
              <p className="text-sm font-bold text-slate-900">
                مؤشرات التكلفة ضمن الحدود الصحية المثالية!
              </p>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                لم يتم رصد تضخم موردين يتجاوز 5% أو انحراف في تكلفة الوصفات أو نزيف إلغاءات خلال الفترة المحددة.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 items-stretch">
              {insights.map((item) => (
                <Card
                  key={item.id}
                  className={cn(
                    'p-5 flex flex-col justify-between space-y-4',
                    item.severity === 'high'
                      ? 'border-r-4 border-r-amber-500 bg-amber-50/20'
                      : 'border-r-4 border-r-sky-500',
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border',
                          item.severity === 'high'
                            ? 'bg-amber-100/80 text-amber-800 border-amber-300'
                            : 'bg-sky-50 text-sky-700 border-sky-200',
                        )}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {item.metricBadge}
                      </span>
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-700 tabular-nums">
                        توفير متوقع: {formatEGPCurrency(item.estimatedMonthlySaving)}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 pt-1">{item.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs font-semibold"
                      onClick={() => navigate(item.actionHref)}
                    >
                      <span>{item.actionLabel}</span>
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* =====================================================================
            TAB 4: EXPENSE CATEGORIES & ALLOCATION RULES SETTINGS
        ===================================================================== */}
        <TabsContent value="settings" className="space-y-4">
          <Card className="p-4">
            <p className="text-xs text-slate-600">
              أدر شجرة التصنيفات الـ 6 وبنودها الفرعية، وحدد قاعدة التوزيع الافتراضية لكل بند دون الحاجة لأي تعديل برمجي مستقبلاً.
            </p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2 items-start">
            {parentCategories.map((parent) => {
              const subs = categories.filter((c) => c.parent_id === parent.id);
              const draftName = settingsNewSubName[parent.id] ?? '';
              const draftType = settingsNewSubType[parent.id] ?? 'opex';

              return (
                <Card key={parent.id} className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{parent.name}</h3>
                      <span className="text-[11px] text-slate-500">
                        القاعدة الافتراضية: {ALLOCATION_TYPE_LABELS[parent.default_allocation_rule]}
                      </span>
                    </div>
                    <Badge variant="secondary" className="tabular-nums text-[11px]">
                      {subs.length.toLocaleString('en-US')} بند
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {subs.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{sub.name}</span>
                          {sub.expense_type === 'capex' && (
                            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                              CapEx
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            disabled={isDemoMode}
                            value={sub.default_allocation_rule}
                            onChange={(e) =>
                              void saveSubcategory({
                                id: sub.id,
                                name: sub.name,
                                parent_id: parent.id,
                                expense_type: sub.expense_type,
                                default_allocation_rule: e.target.value as AllocationType,
                              })
                            }
                            className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px]"
                          >
                            {(
                              Object.entries(ALLOCATION_TYPE_LABELS) as [AllocationType, string][]
                            ).map(([val, label]) => (
                              <option key={val} value={val}>
                                {label}
                              </option>
                            ))}
                          </select>
                          {!sub.is_system && !isDemoMode && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                              onClick={() => void deleteSubcategory(sub.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {!isDemoMode && (
                    <div className="pt-2 border-t border-slate-100 grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                      <Input
                        value={draftName}
                        onChange={(e) =>
                          setSettingsNewSubName((prev) => ({ ...prev, [parent.id]: e.target.value }))
                        }
                        placeholder="إضافة بند فرعي جديد..."
                        className="h-8 text-xs"
                      />
                      <select
                        value={draftType}
                        onChange={(e) =>
                          setSettingsNewSubType((prev) => ({
                            ...prev,
                            [parent.id]: e.target.value as ExpenseType,
                          }))
                        }
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                      >
                        <option value="opex">تشغيلي OpEx</option>
                        <option value="capex">أصول CapEx</option>
                      </select>
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        onClick={() =>
                          void saveSubcategory({
                            name: draftName,
                            parent_id: parent.id,
                            expense_type: draftType,
                            default_allocation_rule: parent.default_allocation_rule,
                          }).then((created) => {
                            if (created) {
                              setSettingsNewSubName((prev) => ({ ...prev, [parent.id]: '' }));
                            }
                          })
                        }
                      >
                        إضافة
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* New / Edit Expense Modal */}
      <NewExpenseDialog
        open={expenseModalOpen}
        onOpenChange={setExpenseModalOpen}
        editingExpense={editingExpense}
        categories={categories}
        brands={brands}
        onSaveExpense={saveExpense}
        onUploadReceipt={uploadReceipt}
        onAddSubcategory={saveSubcategory}
      />
    </div>
  );
}
