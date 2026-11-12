import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import InvoicePrintSheet from '@/components/InvoicePrintSheet';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { hasCompleteDemoOrders } from '@/lib/demoOrders';
import { getOrderMealCount, getOrdersMealCount } from '@/lib/orderMeals';
import { Meal, PackagePlan } from '@/types/menu';
import { NEXT_STATUS, Order, OrderStatus, STATUS_LABELS } from '@/types/order';
import OrderCard from '@/components/OrderCard';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import NewOrderDialog from '@/components/NewOrderDialog';
import OrderSheetImportDialog from '@/components/OrderSheetImportDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  CookingPot,
  DollarSign,
  ExternalLink,
  Kanban,
  LayoutGrid,
  Pencil,
  Printer,
  RotateCcw,
  Search,
  Table2,
} from 'lucide-react';
import { Brand } from '@/hooks/useBrands';
import { buildOrderLocationUrl, cn, formatEGPCurrency, getTodayDateValue } from '@/lib/utils';
import { toast } from 'sonner';

type DatePreset = 'today' | 'week' | 'month' | 'all' | 'custom';
type OrdersViewMode = 'cards' | 'table' | 'kanban';

type FilterState = {
  search: string;
  status: string;
  brandId: string;
  startDate: string;
  endDate: string;
  preset: DatePreset;
  delayedOnly: boolean;
};

function getDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return getDateValue(date);
}

function getOrderFilterDate(order: Order) {
  return order.execution_date || order.created_at.slice(0, 10);
}

function createDefaultFilters(): FilterState {
  const today = getTodayDateValue();
  if (typeof window !== 'undefined' && window.location.search) {
    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get('status') || 'all';
    const delayedParam = params.get('delayed') === '1';
    const presetParam = params.get('preset');

    if (delayedParam || presetParam === 'all') {
      return {
        search: params.get('q') || '',
        status: statusParam,
        brandId: params.get('brand') || 'all',
        startDate: '',
        endDate: '',
        preset: 'all',
        delayedOnly: delayedParam,
      };
    }

    if (statusParam !== 'all') {
      return {
        search: params.get('q') || '',
        status: statusParam,
        brandId: params.get('brand') || 'all',
        startDate: '',
        endDate: '',
        preset: 'all',
        delayedOnly: false,
      };
    }
  }

  return {
    search: '',
    status: 'all',
    brandId: 'all',
    startDate: today,
    endDate: today,
    preset: 'today',
    delayedOnly: false,
  };
}

const KANBAN_COLUMNS: OrderStatus[] = ['new', 'confirmed', 'in_preparation', 'out_for_delivery', 'delivered'];
const PAGE_CHUNK = 30;

interface Props {
  orders: Order[];
  loading: boolean;
  onRefresh: () => void;
  addOrder: (order: Omit<Order, 'id' | 'created_at'>) => Promise<boolean>;
  saveImportedOrder: (order: Omit<Order, 'id' | 'created_at'>) => Promise<'imported' | 'duplicate' | 'failed'>;
  updateOrder: (id: string, order: Omit<Order, 'id' | 'created_at'>) => Promise<boolean>;
  updateOrdersStatus: (ids: string[], status: OrderStatus) => Promise<boolean>;
  updateStatus: (id: string, status: OrderStatus) => Promise<void>;
  seedDemoOrders: (brands: Brand[]) => Promise<boolean>;
  brands: Brand[];
  meals: Meal[];
  packages: PackagePlan[];
}

export default function Orders({
  orders,
  loading,
  onRefresh,
  addOrder,
  saveImportedOrder,
  updateOrder,
  updateOrdersStatus,
  updateStatus,
  seedDemoOrders,
  brands,
  meals,
  packages,
}: Props) {
  const { role } = useAuth();
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters());
  const [viewMode, setViewMode] = useState<OrdersViewMode>('cards');
  const [visibleLimit, setVisibleLimit] = useState(PAGE_CHUNK);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const hasAttemptedAutoSeedRef = useRef(false);
  const now = Date.now();

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setVisibleLimit(PAGE_CHUNK);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const applyPreset = (preset: DatePreset) => {
    const today = getTodayDateValue();
    setVisibleLimit(PAGE_CHUNK);

    if (preset === 'today') {
      setFilters((current) => ({ ...current, preset, startDate: today, endDate: today, delayedOnly: false }));
      return;
    }

    if (preset === 'week') {
      setFilters((current) => ({ ...current, preset, startDate: shiftDate(today, -6), endDate: today }));
      return;
    }

    if (preset === 'month') {
      setFilters((current) => ({ ...current, preset, startDate: shiftDate(today, -29), endDate: today }));
      return;
    }

    if (preset === 'all') {
      setFilters((current) => ({ ...current, preset, startDate: '', endDate: '' }));
      return;
    }

    setFilters((current) => ({ ...current, preset }));
  };

  const resetFilters = () => {
    const today = getTodayDateValue();
    setVisibleLimit(PAGE_CHUNK);
    setFilters({
      search: '',
      status: 'all',
      brandId: 'all',
      startDate: today,
      endDate: today,
      preset: 'today',
      delayedOnly: false,
    });
  };

  const brandById = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);

  const isDelayedOrder = (order: Order) =>
    !['delivered', 'cancelled'].includes(order.status) &&
    now - new Date(order.created_at).getTime() > 1000 * 60 * 60 * 6;

  // Base list filtered by date, brand, and search (used to compute live status counts)
  const baseScopedOrders = useMemo(() => {
    let list = orders;

    if (filters.brandId !== 'all') {
      list = list.filter((order) => order.brand_id === filters.brandId);
    }
    if (filters.startDate) {
      list = list.filter((order) => getOrderFilterDate(order) >= filters.startDate);
    }
    if (filters.endDate) {
      list = list.filter((order) => getOrderFilterDate(order) <= filters.endDate);
    }
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (o) =>
          o.customer_name.toLowerCase().includes(q) ||
          o.phone.includes(q) ||
          o.phone_secondary.includes(q) ||
          o.order_number.toLowerCase().includes(q) ||
          o.address.toLowerCase().includes(q),
      );
    }

    return list;
  }, [orders, filters.brandId, filters.startDate, filters.endDate, filters.search]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: baseScopedOrders.length };
    let delayed = 0;
    baseScopedOrders.forEach((o) => {
      counts[o.status] = (counts[o.status] || 0) + 1;
      if (
        !['delivered', 'cancelled'].includes(o.status) &&
        now - new Date(o.created_at).getTime() > 1000 * 60 * 60 * 6
      ) {
        delayed += 1;
      }
    });
    counts.delayed = delayed;
    return counts;
  }, [baseScopedOrders, now]);

  const filtered = useMemo(() => {
    let list = baseScopedOrders;
    if (filters.status === 'active') {
      list = list.filter((order) => !['delivered', 'cancelled'].includes(order.status));
    } else if (filters.status !== 'all') {
      list = list.filter((order) => order.status === filters.status);
    }
    if (filters.delayedOnly) {
      list = list.filter(isDelayedOrder);
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseScopedOrders, filters.status, filters.delayedOnly, now]);

  const summary = useMemo(() => {
    return {
      orderCount: filtered.length,
      totalMeals: getOrdersMealCount(filtered, meals, packages),
      totalSales: filtered.filter((o) => o.status !== 'cancelled').reduce((sum, order) => sum + order.price, 0),
    };
  }, [filtered, meals, packages]);

  const printableOrders = useMemo(() => filtered.filter((order) => order.status !== 'cancelled'), [filtered]);
  const ordersToBulkConfirm = useMemo(() => filtered.filter((order) => order.status === 'new'), [filtered]);
  const canBulkConfirmOrders = role === 'owner' || role === 'call_center';

  const confirmVisibleOrders = async () => {
    setBulkUpdating(true);
    const updated = await updateOrdersStatus(
      ordersToBulkConfirm.map((order) => order.id),
      'confirmed',
    );
    setBulkUpdating(false);
    setBulkConfirmOpen(false);
    onRefresh();
    if (updated) toast.success(`تم تأكيد ${ordersToBulkConfirm.length} طلب دفعة واحدة`);
  };

  const quickAdvanceStatus = async (order: Order) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    await updateStatus(order.id, next);
    toast.success(`تم نقل الطلب إلى ${STATUS_LABELS[next]}`);
    onRefresh();
  };

  useEffect(() => {
    if (role !== 'owner' || brands.length === 0 || loading || hasAttemptedAutoSeedRef.current) {
      return;
    }

    if (hasCompleteDemoOrders(orders)) {
      hasAttemptedAutoSeedRef.current = true;
      return;
    }

    hasAttemptedAutoSeedRef.current = true;
    void seedDemoOrders(brands);
  }, [brands, loading, orders, role, seedDemoOrders]);

  const displayedOrders = filtered.slice(0, visibleLimit);

  return (
    <>
      <div className="space-y-5 print:hidden">
        <AppLayoutHeaderPortal>
          <div className="flex flex-wrap items-center gap-2">
            <OrderSheetImportDialog
              saveImportedOrder={saveImportedOrder}
              onImported={onRefresh}
              brands={brands}
              meals={meals}
              packages={packages}
            />
            <NewOrderDialog onCreated={onRefresh} addOrder={addOrder} />
          </div>
        </AppLayoutHeaderPortal>

        {editingOrder && (
          <NewOrderDialog
            onCreated={onRefresh}
            addOrder={addOrder}
            editOrder={editingOrder}
            updateOrder={updateOrder}
            onEditClose={() => setEditingOrder(null)}
          />
        )}

        {/* KPI Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
          <Card className="p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">عدد الطلبات المعروضة</p>
              <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-600">
                <ClipboardList className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
              {summary.orderCount.toLocaleString('en-US')}
            </p>
          </Card>

          <Card className="p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">إجمالي عدد الوجبات</p>
              <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-600">
                <CookingPot className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
              {summary.totalMeals.toLocaleString('en-US')}
            </p>
          </Card>

          <Card className="p-5 flex flex-col justify-between border-t-2 border-t-emerald-500">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">إجمالي المبيعات الصافية</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
              {formatEGPCurrency(summary.totalSales)}
            </p>
          </Card>

          <Card
            className={cn(
              'p-5 flex flex-col justify-between',
              (statusCounts.delayed || 0) > 0 && 'bg-amber-50/40 border-amber-200/90 border-r-4 border-r-amber-500',
            )}
          >
            <div className="flex items-center justify-between">
              <p className={cn('text-xs font-medium', (statusCounts.delayed || 0) > 0 ? 'text-amber-900' : 'text-slate-500')}>
                متأخرة أكثر من 6 ساعات
              </p>
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  (statusCounts.delayed || 0) > 0
                    ? 'bg-amber-100/80 text-amber-700'
                    : 'bg-slate-50 border border-slate-200/60 text-slate-600',
                )}
              >
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <p className={cn('text-2xl font-bold tabular-nums tracking-tight', (statusCounts.delayed || 0) > 0 ? 'text-amber-950' : 'text-slate-900')}>
                {(statusCounts.delayed || 0).toLocaleString('en-US')}
              </p>
              {(statusCounts.delayed || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => updateFilter('delayedOnly', !filters.delayedOnly)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer',
                    filters.delayedOnly
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200',
                  )}
                >
                  {filters.delayedOnly ? 'إلغاء فلتر التأخير' : 'عرض المتأخرة فقط'}
                </button>
              )}
            </div>
          </Card>
        </div>

        {/* Unified Instant Filter & View Mode Workspace Bar */}
        <Card className="p-4 space-y-3.5">
          {/* Top row: Quick Date Presets + View Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'today', label: 'اليوم' },
                  { id: 'week', label: 'آخر 7 أيام' },
                  { id: 'month', label: 'آخر 30 يوم' },
                  { id: 'all', label: 'كل التواريخ' },
                  { id: 'custom', label: 'مخصص' },
                ] as Array<{ id: DatePreset; label: string }>
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                    filters.preset === p.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* 3-Mode View Switcher */}
            <div className="inline-flex items-center rounded-lg border border-slate-200/80 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer',
                  viewMode === 'cards' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>بطاقات</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer',
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                <Table2 className="h-3.5 w-3.5" />
                <span>جدول مضغوط</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer',
                  viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                <Kanban className="h-3.5 w-3.5" />
                <span>كانبان</span>
              </button>
            </div>
          </div>

          {/* Middle row: Search + Date range + Brand + Status Select */}
          <div className="grid gap-2.5 lg:grid-cols-[1fr_165px_165px_170px_170px]">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                placeholder="بحث فوري بالاسم، الهاتف، رقم الطلب، أو العنوان..."
                className="pr-9 h-9 text-xs"
              />
            </div>
            <div className="relative">
              <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <Input
                type="date"
                aria-label="من تاريخ"
                value={filters.startDate}
                onChange={(e) => {
                  setVisibleLimit(PAGE_CHUNK);
                  setFilters((c) => ({ ...c, startDate: e.target.value, preset: 'custom' }));
                }}
                className="pr-8 h-9 text-xs tabular-nums"
              />
            </div>
            <div className="relative">
              <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <Input
                type="date"
                aria-label="إلى تاريخ"
                value={filters.endDate}
                onChange={(e) => {
                  setVisibleLimit(PAGE_CHUNK);
                  setFilters((c) => ({ ...c, endDate: e.target.value, preset: 'custom' }));
                }}
                className="pr-8 h-9 text-xs tabular-nums"
              />
            </div>
            <Select value={filters.brandId} onValueChange={(value) => updateFilter('brandId', value)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="كل العلامات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العلامات</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.status} onValueChange={(value) => updateFilter('status', value)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="كل الحالات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="active">الطلبات النشطة</SelectItem>
                {(Object.entries(STATUS_LABELS) as [OrderStatus, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bottom row: Live Status Count Pills + Operational Bulk Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => updateFilter('status', 'all')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer tabular-nums',
                  filters.status === 'all' && !filters.delayedOnly
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                <span>الكل</span>
                <span className="opacity-80">{(statusCounts.all || 0).toLocaleString('en-US')}</span>
              </button>
              {(Object.entries(STATUS_LABELS) as [OrderStatus, string][]).map(([statusKey, label]) => {
                const count = statusCounts[statusKey] || 0;
                const active = filters.status === statusKey;
                return (
                  <button
                    key={statusKey}
                    type="button"
                    onClick={() => updateFilter('status', statusKey)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer tabular-nums',
                      active
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-50 border border-slate-200/80 text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    <span>{label}</span>
                    <span className={cn('px-1.5 rounded-full text-[10px]', active ? 'bg-white/20' : 'bg-slate-200/70 text-slate-700')}>
                      {count.toLocaleString('en-US')}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canBulkConfirmOrders && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg gap-1.5 text-xs font-semibold border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => setBulkConfirmOpen(true)}
                  disabled={ordersToBulkConfirm.length === 0 || bulkUpdating}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  تأكيد الطلبات الجديدة المعروضة ({ordersToBulkConfirm.length})
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-lg gap-1.5 text-xs font-semibold"
                onClick={() => window.print()}
                disabled={printableOrders.length === 0}
              >
                <Printer className="h-3.5 w-3.5" />
                طباعة فواتير اليوم
              </Button>
              <Button size="sm" variant="ghost" className="h-8 rounded-lg gap-1 text-xs text-slate-500 hover:text-slate-900" onClick={resetFilters}>
                <RotateCcw className="h-3.5 w-3.5" />
                إعادة تعيين
              </Button>
            </div>
          </div>
        </Card>

        {/* Results Views */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed py-12 text-center text-sm text-slate-500">
            {orders.length === 0 ? 'لا توجد طلبات بعد. أنشئ أول طلب الآن.' : 'لا توجد طلبات مطابقة للفلاتر الحالية.'}
          </Card>
        ) : viewMode === 'table' ? (
          /* High-Density Operational Table View */
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 font-semibold">
                    <th className="px-4 py-3">رقم الطلب</th>
                    <th className="px-4 py-3">العميل</th>
                    <th className="px-4 py-3">البراند</th>
                    <th className="px-4 py-3">الباقة / الوجبات</th>
                    <th className="px-4 py-3">تاريخ التنفيذ</th>
                    <th className="px-4 py-3">القيمة</th>
                    <th className="px-4 py-3">الحالة</th>
                    <th className="px-4 py-3 text-left">إجراءات سريعة</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedOrders.map((order) => {
                    const brand = order.brand_id ? brandById.get(order.brand_id) : undefined;
                    const nextStatus = NEXT_STATUS[order.status];
                    const mealCount = getOrderMealCount(order, meals, packages);
                    return (
                      <tr key={order.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-500 tabular-nums">{order.order_number}</td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{order.customer_name}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums">{order.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          {brand ? (
                            <span
                              className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                              style={{ backgroundColor: `${brand.color}14`, borderColor: `${brand.color}38`, color: brand.color }}
                            >
                              {brand.name}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 truncate max-w-[180px]">{order.package || 'وجبات من المنيو'}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums">{mealCount.toLocaleString('en-US')} وجبة</div>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-600">{order.execution_date}</td>
                        <td className="px-4 py-3 font-bold text-emerald-700 tabular-nums tracking-tight">{formatEGPCurrency(order.price)}</td>
                        <td className="px-4 py-3">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {nextStatus && (
                              <Button
                                size="sm"
                                className="h-7 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                onClick={() => void quickAdvanceStatus(order)}
                              >
                                <span>{STATUS_LABELS[nextStatus]}</span>
                                <ArrowLeft className="h-3 w-3" />
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setEditingOrder(order)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <a
                              href={buildOrderLocationUrl(order)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                              title="فتح الخريطة"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : viewMode === 'kanban' ? (
          /* Live Kitchen & Delivery Kanban Board */
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5 items-start">
            {KANBAN_COLUMNS.map((colStatus) => {
              const colOrders = filtered.filter((o) => o.status === colStatus);
              const colTotal = colOrders.reduce((s, o) => s + o.price, 0);
              return (
                <div key={colStatus} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/70">
                    <OrderStatusBadge status={colStatus} />
                    <span className="text-[11px] font-bold text-slate-600 tabular-nums">
                      {colOrders.length.toLocaleString('en-US')} · {formatEGPCurrency(colTotal)}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-[65vh] overflow-y-auto pl-0.5">
                    {colOrders.length === 0 ? (
                      <p className="py-6 text-center text-[11px] text-slate-400">لا توجد طلبات</p>
                    ) : (
                      colOrders.map((order) => {
                        const nextStatus = NEXT_STATUS[order.status];
                        const brand = order.brand_id ? brandById.get(order.brand_id) : undefined;
                        return (
                          <div
                            key={order.id}
                            className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-bold text-slate-900 truncate">{order.customer_name}</span>
                              <span className="text-[11px] font-bold text-emerald-700 tabular-nums shrink-0">
                                {formatEGPCurrency(order.price)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                              <span>{order.phone}</span>
                              {brand && <span className="truncate max-w-[90px] font-medium" style={{ color: brand.color }}>{brand.name}</span>}
                            </div>
                            <p className="text-[11px] text-slate-600 line-clamp-1">{order.package}</p>
                            <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => setEditingOrder(order)}
                                className="text-[11px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                              >
                                تعديل
                              </button>
                              {nextStatus && (
                                <button
                                  type="button"
                                  onClick={() => void quickAdvanceStatus(order)}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                                >
                                  <span>{STATUS_LABELS[nextStatus]}</span>
                                  <ArrowLeft className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Cards View */
          <div className="space-y-3">
            {displayedOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onUpdate={onRefresh}
                updateStatus={updateStatus}
                brands={brands}
                meals={meals}
                packages={packages}
                onEdit={setEditingOrder}
              />
            ))}
          </div>
        )}

        {viewMode !== 'kanban' && filtered.length > visibleLimit && (
          <div className="flex items-center justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs font-semibold tabular-nums"
              onClick={() => setVisibleLimit((prev) => prev + PAGE_CHUNK)}
            >
              عرض المزيد ({(filtered.length - visibleLimit).toLocaleString('en-US')} طلب متبقي)
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الطلبات دفعة واحدة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم نقل {ordersToBulkConfirm.length} طلب جديد ظاهر في القائمة إلى حالة "تم التأكيد". الطلبات خارج الفلاتر الحالية لن تتغير.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkUpdating}>رجوع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => void confirmVisibleOrders()}
              disabled={bulkUpdating || ordersToBulkConfirm.length === 0}
            >
              {bulkUpdating ? 'جارٍ التأكيد...' : 'تأكيد الكل'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <InvoicePrintSheet orders={printableOrders} brands={brands} />
    </>
  );
}
