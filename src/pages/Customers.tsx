import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Download,
  Eye,
  Flame,
  LayoutGrid,
  MessageCircle,
  Phone,
  Repeat,
  Search,
  Sparkles,
  Star,
  Table2,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import CustomerProfileDrawer from '@/components/customers/CustomerProfileDrawer';
import type { Brand } from '@/hooks/useBrands';
import {
  buildSmartWhatsAppMessage,
  buildWhatsAppUrl,
  CustomerSegment,
  getRecommendedTemplateForSegment,
  WHATSAPP_TEMPLATE_OPTIONS,
  WhatsAppTemplateId,
} from '@/lib/customerCrm';
import { Customer, CustomerUpsertInput } from '@/types/customer';
import { Meal, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';
import { cn, formatEGPCurrency, normalizePhone } from '@/lib/utils';

type SortOption = 'last_order_desc' | 'order_count_desc' | 'revenue_desc';
type SegmentFilter = 'all' | CustomerSegment;
type CustomersViewMode = 'cards' | 'table';

function formatOrderDate(value: string | null) {
  if (!value) {
    return 'لا توجد طلبات بعد';
  }

  return new Date(value).toLocaleDateString('ar-EG-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface Props {
  customers: Customer[];
  orders: Order[];
  loading: boolean;
  brands: Brand[];
  storageMode: 'customers' | 'orders';
  meals?: Meal[];
  packages?: PackagePlan[];
  onUpdateCustomer?: (input: CustomerUpsertInput) => Promise<Customer | null>;
}

export default function Customers({
  customers,
  orders,
  loading,
  brands,
  storageMode,
  meals = [],
  packages = [],
  onUpdateCustomer,
}: Props) {
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('order_count_desc');
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>('all');
  const [viewMode, setViewMode] = useState<CustomersViewMode>('cards');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const brandsById = useMemo(
    () => new Map(brands.map((brand) => [brand.id, brand])),
    [brands],
  );

  const customerMetaByKey = useMemo(() => {
    const meta: Record<string, { revenue: number; lastPackage: string }> = {};
    for (const order of orders) {
      if (order.status === 'cancelled') {
        continue;
      }
      const key = `${order.brand_id ?? 'no-brand'}:${normalizePhone(order.phone)}`;
      const current = meta[key] ?? { revenue: 0, lastPackage: '' };
      current.revenue += order.price;
      if (!current.lastPackage && order.package && order.package !== 'وجبات من المنيو') {
        current.lastPackage = order.package;
      }
      meta[key] = current;
    }
    return meta;
  }, [orders]);

  const getCustomerRevenue = useCallback(
    (customer: Customer) => {
      const key = `${customer.brand_id ?? 'no-brand'}:${normalizePhone(customer.phone)}`;
      return customerMetaByKey[key]?.revenue || 0;
    },
    [customerMetaByKey],
  );

  const getCustomerLastPackage = useCallback(
    (customer: Customer) => {
      const key = `${customer.brand_id ?? 'no-brand'}:${normalizePhone(customer.phone)}`;
      return customerMetaByKey[key]?.lastPackage || '';
    },
    [customerMetaByKey],
  );

  const getCustomerSegment = useCallback(
    (customer: Customer): CustomerSegment => {
      const lastOrderTime = new Date(customer.last_order_at ?? customer.updated_at).getTime();

      if (customer.order_count >= 5) {
        return 'vip';
      }

      if (customer.order_count === 1 && lastOrderTime >= sevenDaysAgo) {
        return 'new';
      }

      if (lastOrderTime < fourteenDaysAgo && lastOrderTime >= thirtyDaysAgo) {
        return 'at_risk';
      }

      return 'repeat';
    },
    [fourteenDaysAgo, sevenDaysAgo, thirtyDaysAgo],
  );

  const buildCustomerWhatsAppHref = useCallback(
    (customer: Customer, templateOverride?: WhatsAppTemplateId) => {
      const seg = getCustomerSegment(customer);
      const templateId = templateOverride ?? getRecommendedTemplateForSegment(seg);
      const brandName = customer.brand_id ? brandsById.get(customer.brand_id)?.name : undefined;
      const msg = buildSmartWhatsAppMessage({
        templateId,
        customerName: customer.name,
        brandName,
        lastPackageName: getCustomerLastPackage(customer),
        orderCount: customer.order_count,
      });
      return buildWhatsAppUrl(customer.phone, msg);
    },
    [brandsById, getCustomerLastPackage, getCustomerSegment],
  );

  // Scoped by brand + search so segment pills show accurate live counts
  const brandAndSearchCustomers = useMemo(() => {
    const rawQuery = search.trim().toLowerCase();
    const phoneQuery = normalizePhone(search);

    return customers.filter((customer) => {
      if (brandFilter !== 'all' && customer.brand_id !== brandFilter) {
        return false;
      }

      if (!rawQuery && !phoneQuery) {
        return true;
      }

      return (
        customer.name.toLowerCase().includes(rawQuery) ||
        (Boolean(phoneQuery) && normalizePhone(customer.phone).includes(phoneQuery)) ||
        (Boolean(phoneQuery) && normalizePhone(customer.phone_secondary).includes(phoneQuery)) ||
        customer.address.toLowerCase().includes(rawQuery)
      );
    });
  }, [brandFilter, customers, search]);

  const segmentCounts = useMemo(() => {
    const counts: Record<SegmentFilter, number> = {
      all: brandAndSearchCustomers.length,
      vip: 0,
      repeat: 0,
      at_risk: 0,
      new: 0,
    };
    brandAndSearchCustomers.forEach((c) => {
      counts[getCustomerSegment(c)] += 1;
    });
    return counts;
  }, [brandAndSearchCustomers, getCustomerSegment]);

  const filteredCustomers = useMemo(() => {
    const nextCustomers =
      segmentFilter === 'all'
        ? [...brandAndSearchCustomers]
        : brandAndSearchCustomers.filter((customer) => getCustomerSegment(customer) === segmentFilter);

    nextCustomers.sort((left, right) => {
      if (sortBy === 'revenue_desc') {
        const revDiff = getCustomerRevenue(right) - getCustomerRevenue(left);
        if (revDiff !== 0) return revDiff;
      }

      if (sortBy === 'order_count_desc') {
        if (right.order_count !== left.order_count) {
          return right.order_count - left.order_count;
        }
      }

      const leftLastOrder = new Date(left.last_order_at ?? left.updated_at).getTime();
      const rightLastOrder = new Date(right.last_order_at ?? right.updated_at).getTime();
      if (rightLastOrder !== leftLastOrder) {
        return rightLastOrder - leftLastOrder;
      }

      return left.name.localeCompare(right.name, 'ar');
    });

    return nextCustomers;
  }, [brandAndSearchCustomers, getCustomerRevenue, getCustomerSegment, segmentFilter, sortBy]);

  const summary = useMemo(() => {
    const vipCustomer = filteredCustomers.reduce<Customer | null>((best, customer) => {
      if (!best || customer.order_count > best.order_count) {
        return customer;
      }
      return best;
    }, null);

    const atRiskCustomers = filteredCustomers.filter((customer) => getCustomerSegment(customer) === 'at_risk');
    const estimatedRecoverableRevenue = atRiskCustomers.reduce(
      (sum, customer) => sum + getCustomerRevenue(customer),
      0,
    );

    const topRevenueCustomer = filteredCustomers.reduce<Customer | null>((best, customer) => {
      const currentRevenue = getCustomerRevenue(customer);
      const bestRevenue = best ? getCustomerRevenue(best) : -1;
      return currentRevenue > bestRevenue ? customer : best;
    }, null);

    return {
      totalCustomers: filteredCustomers.length,
      totalOrders: filteredCustomers.reduce((sum, customer) => sum + customer.order_count, 0),
      latestOrderDate: filteredCustomers[0]?.last_order_at ?? null,
      vipCustomer,
      atRiskCustomers: atRiskCustomers.length,
      estimatedRecoverableRevenue,
      topRevenueCustomer,
    };
  }, [filteredCustomers, getCustomerRevenue, getCustomerSegment]);

  const recoveryCandidates = useMemo(() => {
    return brandAndSearchCustomers
      .filter((customer) => getCustomerSegment(customer) === 'at_risk')
      .sort(
        (left, right) =>
          getCustomerRevenue(right) - getCustomerRevenue(left) || right.order_count - left.order_count,
      )
      .slice(0, 3);
  }, [brandAndSearchCustomers, getCustomerRevenue, getCustomerSegment]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const exportToExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = filteredCustomers.map((customer) => ({
      'اسم العميل': customer.name,
      'رقم التليفون': customer.phone,
      'العنوان': customer.address || 'غير متوفر',
      'عدد مرات الطلب': customer.order_count,
      'إجمالي الإيراد': getCustomerRevenue(customer),
      'الشريحة': getCustomerSegment(customer),
      'تاريخ آخر أوردر': formatOrderDate(customer.last_order_at),
      'البراند': customer.brand_id ? brandsById.get(customer.brand_id)?.name ?? 'بدون براند' : 'بدون براند',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
    XLSX.writeFile(workbook, `customers-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const segmentParam = params.get('segment');
    if (segmentParam && ['all', 'vip', 'at_risk', 'new', 'repeat'].includes(segmentParam)) {
      setSegmentFilter(segmentParam as SegmentFilter);
    }
  }, []);

  const renderWhatsAppQuickActions = (customer: Customer) => {
    const defaultHref = buildCustomerWhatsAppHref(customer);
    const seg = getCustomerSegment(customer);
    const recTpl = getRecommendedTemplateForSegment(seg);
    const recOption = WHATSAPP_TEMPLATE_OPTIONS.find((t) => t.id === recTpl);

    if (!defaultHref) return null;

    return (
      <div
        className="inline-flex items-center rounded-lg border border-emerald-200/90 bg-emerald-50/70 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={defaultHref}
          target="_blank"
          rel="noreferrer"
          title={`إرسال واتساب (${recOption?.shortLabel ?? 'تلقائي'})`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100/80 transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span>واتساب</span>
        </a>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`قوالب واتساب لـ ${customer.name}`}
              className="px-1.5 py-1.5 border-r border-emerald-200/80 text-emerald-700 hover:bg-emerald-100/80 transition-colors cursor-pointer"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60" dir="rtl">
            <DropdownMenuLabel className="text-xs text-slate-500">
              قوالب واتساب الذكية
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {WHATSAPP_TEMPLATE_OPTIONS.map((tpl) => {
              const tplHref = buildCustomerWhatsAppHref(customer, tpl.id);
              const isRecommended = tpl.id === recTpl;
              return (
                <DropdownMenuItem key={tpl.id} asChild className="cursor-pointer text-xs py-2">
                  <a href={tplHref} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 w-full">
                    <span>{tpl.label}</span>
                    {isRecommended && (
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-700 shrink-0">
                        مقترح
                      </span>
                    )}
                  </a>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <AppLayoutHeaderPortal>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden sm:inline-flex items-center rounded-full bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
            {storageMode === 'customers' ? 'الحفظ المباشر مفعل' : 'عرض مشتق من الطلبات الحالية'}
          </span>
          <Button
            size="sm"
            onClick={exportToExcel}
            className="h-9 gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            disabled={filteredCustomers.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            <span>تصدير إلى Excel</span>
          </Button>
        </div>
      </AppLayoutHeaderPortal>

      {/* Top KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">إجمالي العملاء</p>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 border border-slate-200/60">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
            {summary.totalCustomers.toLocaleString('en-US')}
          </p>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">إجمالي الطلبات</p>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 border border-slate-200/60">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
            {summary.totalOrders.toLocaleString('en-US')}
          </p>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">آخر أوردر</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 border border-slate-200/60">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-base font-bold text-slate-900 tabular-nums tracking-tight">
            {formatOrderDate(summary.latestOrderDate)}
          </p>
        </Card>

        <Card
          onClick={() => summary.vipCustomer && setSelectedCustomerId(summary.vipCustomer.id)}
          className={cn(
            'p-5 flex flex-col justify-between border-t-2 border-t-amber-400',
            summary.vipCustomer && 'cursor-pointer hover:border-slate-300 transition-colors',
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">أفضل عميل</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 text-amber-700 border border-amber-200/80">
              <Star className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-base font-bold text-slate-900 truncate">
            {summary.vipCustomer?.name ?? 'لا يوجد'}
          </p>
          <p className="text-xs text-slate-500 tabular-nums mt-0.5">
            {summary.vipCustomer
              ? `${summary.vipCustomer.order_count.toLocaleString('en-US')} طلب`
              : 'لا توجد بيانات كافية'}
          </p>
        </Card>
      </div>

      {/* Retention Intelligence & Hot Recovery List */}
      <div className="grid gap-4 xl:grid-cols-12 items-stretch">
        <Card className="xl:col-span-7 p-5 grid gap-4 sm:grid-cols-3 items-center">
          <div
            onClick={() => setSegmentFilter('at_risk')}
            className="rounded-xl bg-slate-50/70 border border-slate-200/60 hover:border-amber-300 p-3.5 h-full flex flex-col justify-between cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <Repeat className="h-3.5 w-3.5" />
              فرصة استرجاع
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
              {summary.atRiskCustomers.toLocaleString('en-US')}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">لم يطلبوا منذ 14 إلى 30 يومًا</p>
          </div>

          <div className="rounded-xl bg-emerald-50/50 border border-emerald-200/60 p-3.5 h-full flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Wallet className="h-3.5 w-3.5" />
              إيراد قابل للاسترجاع
            </div>
            <p className="mt-2 text-xl font-bold text-slate-900 tabular-nums tracking-tight">
              {formatEGPCurrency(summary.estimatedRecoverableRevenue)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">تقريبي من قيمة طلباتهم السابقة</p>
          </div>

          <div
            onClick={() => summary.topRevenueCustomer && setSelectedCustomerId(summary.topRevenueCustomer.id)}
            className={cn(
              'rounded-xl bg-slate-50/70 border border-slate-200/60 p-3.5 h-full flex flex-col justify-between',
              summary.topRevenueCustomer && 'cursor-pointer hover:border-sky-300 transition-colors',
            )}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              أعلى عميل قيمة
            </div>
            <p className="mt-2 text-sm font-bold text-slate-900 truncate">
              {summary.topRevenueCustomer?.name ?? 'لا يوجد'}
            </p>
            <p className="text-xs font-semibold text-slate-700 tabular-nums mt-1">
              {summary.topRevenueCustomer
                ? formatEGPCurrency(getCustomerRevenue(summary.topRevenueCustomer))
                : 'لا توجد بيانات كافية'}
            </p>
          </div>
        </Card>

        <Card className="xl:col-span-5 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Flame className="h-4 w-4 text-orange-500" />
              <span>أسرع قائمة متابعة واسترجاع</span>
            </div>
            <span className="text-[11px] text-slate-400">واتساب بنقرة واحدة</span>
          </div>
          <div className="mt-3 space-y-2 flex-1 flex flex-col justify-center">
            {recoveryCandidates.length === 0 ? (
              <p className="text-xs text-slate-500">
                لا توجد قائمة استرجاع ساخنة الآن. استمر في رفع العملاء العائدين.
              </p>
            ) : (
              recoveryCandidates.map((customer) => {
                const winbackHref = buildCustomerWhatsAppHref(customer, 'winback');
                return (
                  <div
                    key={customer.id}
                    onClick={() => setSelectedCustomerId(customer.id)}
                    className="rounded-lg border border-slate-200/80 bg-slate-50/60 hover:border-slate-300 px-3 py-2 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{customer.name}</p>
                        <p className="text-[11px] text-slate-500">
                          آخر طلب: {formatOrderDate(customer.last_order_at)} ·{' '}
                          <span className="font-semibold text-emerald-700 tabular-nums">
                            {formatEGPCurrency(getCustomerRevenue(customer))}
                          </span>
                        </p>
                      </div>
                      {winbackHref && (
                        <a
                          href={winbackHref}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-[11px] font-semibold text-white shrink-0 transition-colors"
                        >
                          <MessageCircle className="h-3 w-3" />
                          <span>استرجاع</span>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Filters & View Switcher */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'كل الشرائح' },
                { id: 'vip', label: 'VIP' },
                { id: 'repeat', label: 'عائدون' },
                { id: 'at_risk', label: 'معرضون للانقطاع' },
                { id: 'new', label: 'جدد' },
              ] as Array<{ id: SegmentFilter; label: string }>
            ).map((seg) => {
              const active = segmentFilter === seg.id;
              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => setSegmentFilter(seg.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer tabular-nums',
                    active
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  <span>{seg.label}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px]',
                      active ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-700',
                    )}
                  >
                    {segmentCounts[seg.id].toLocaleString('en-US')}
                  </span>
                </button>
              );
            })}
          </div>

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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setBrandFilter('all')}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer',
              brandFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            كل العلامات
          </button>
          {brands.map((brand) => (
            <button
              key={brand.id}
              type="button"
              onClick={() => setBrandFilter(brand.id)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer',
                brandFilter === brand.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {brand.name}
            </button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_200px_220px]">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو رقم التليفون أو العنوان..."
              className="pr-9 h-9 text-xs"
            />
          </div>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
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
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="ترتيب العملاء" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="order_count_desc">الأكثر طلبًا</SelectItem>
              <SelectItem value="revenue_desc">الأعلى إنفاقًا (LTV)</SelectItem>
              <SelectItem value="last_order_desc">الأحدث طلبًا</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Customer Directory: Cards or Compact Table */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <Card className="border-dashed px-4 py-12 text-center text-sm text-slate-500">
          لا توجد بيانات عملاء مطابقة للبحث الحالي.
        </Card>
      ) : viewMode === 'table' ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-right text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 font-semibold">
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">الشريحة</th>
                  <th className="px-4 py-3">البراند</th>
                  <th className="px-4 py-3">عدد الطلبات</th>
                  <th className="px-4 py-3">القيمة الدائمة (LTV)</th>
                  <th className="px-4 py-3">آخر طلب</th>
                  <th className="px-4 py-3 text-left">تواصل وملف 360</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => {
                  const brandName = customer.brand_id
                    ? brandsById.get(customer.brand_id)?.name ?? 'بدون براند'
                    : 'بدون براند';
                  const segment = getCustomerSegment(customer);
                  const totalRevenue = getCustomerRevenue(customer);
                  const segmentLabel =
                    segment === 'vip'
                      ? 'VIP'
                      : segment === 'at_risk'
                        ? 'استرجاع'
                        : segment === 'new'
                          ? 'جديد'
                          : 'عائد';

                  return (
                    <tr
                      key={customer.id}
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{customer.name}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">{customer.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                            segment === 'vip' && 'bg-amber-50 text-amber-700 border-amber-200/80',
                            segment === 'at_risk' && 'bg-rose-50 text-rose-600 border-rose-200/60',
                            segment === 'new' && 'bg-sky-50 text-sky-700 border-sky-200/80',
                            segment === 'repeat' && 'bg-slate-100 text-slate-700 border-slate-200/80',
                          )}
                        >
                          {segmentLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{brandName}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 tabular-nums">
                        {customer.order_count.toLocaleString('en-US')} طلب
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-700 tabular-nums tracking-tight">
                        {formatEGPCurrency(totalRevenue)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 tabular-nums">
                        {formatOrderDate(customer.last_order_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {renderWhatsAppQuickActions(customer)}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomerId(customer.id);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>ملف 360</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-stretch">
          {filteredCustomers.map((customer) => {
            const brandName = customer.brand_id
              ? brandsById.get(customer.brand_id)?.name ?? 'بدون براند'
              : 'بدون براند';
            const isVip = customer.order_count >= 5;
            const segment = getCustomerSegment(customer);
            const totalRevenue = getCustomerRevenue(customer);
            const segmentLabel =
              segment === 'vip'
                ? 'VIP'
                : segment === 'at_risk'
                  ? 'استرجاع'
                  : segment === 'new'
                    ? 'جديد'
                    : 'عائد';

            return (
              <Card
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                className="p-5 flex flex-col justify-between hover:border-slate-300 hover:shadow-xs transition-all duration-150 cursor-pointer group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                        {customer.name}
                      </p>
                      <a
                        href={`tel:${customer.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 tabular-nums mt-0.5"
                      >
                        <Phone className="h-3 w-3 text-slate-400" />
                        <span>{customer.phone}</span>
                      </a>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCustomerId(customer.id);
                      }}
                      className="h-8 px-2.5 gap-1 text-xs font-semibold text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 shrink-0"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>ملف 360</span>
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[11px]">
                      {brandName}
                    </Badge>
                    <Badge variant="outline" className="text-[11px] tabular-nums">
                      {customer.order_count.toLocaleString('en-US')} طلب
                    </Badge>
                    {isVip && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
                        VIP
                      </span>
                    )}
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                        segment === 'at_risk'
                          ? 'bg-rose-50 text-rose-600 border-rose-200/60'
                          : segment === 'new'
                            ? 'bg-sky-50 text-sky-700 border-sky-200/80'
                            : 'bg-slate-100 text-slate-700 border-slate-200/80',
                      )}
                    >
                      {segmentLabel}
                    </span>
                  </div>

                  {customer.notes && (
                    <p className="text-[11px] text-amber-800 bg-amber-50/60 border border-amber-200/60 rounded-lg px-2.5 py-1 line-clamp-1">
                      {customer.notes}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2.5 text-xs text-slate-500">
                  <p className="truncate">
                    العنوان: <span className="text-slate-700">{customer.address || 'غير متوفر'}</span>
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <div>
                      <span className="block text-[11px] text-slate-400">
                        آخر طلب: {formatOrderDate(customer.last_order_at)}
                      </span>
                      <span className="font-bold text-sm text-emerald-700 tabular-nums tracking-tight">
                        {formatEGPCurrency(totalRevenue)}
                      </span>
                    </div>
                    {renderWhatsAppQuickActions(customer)}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Customer 360 Slide-over Drawer */}
      <CustomerProfileDrawer
        customer={selectedCustomer}
        open={Boolean(selectedCustomer)}
        onOpenChange={(open) => {
          if (!open) setSelectedCustomerId(null);
        }}
        segment={selectedCustomer ? getCustomerSegment(selectedCustomer) : 'repeat'}
        brand={
          selectedCustomer?.brand_id ? brandsById.get(selectedCustomer.brand_id) : undefined
        }
        orders={orders}
        meals={meals}
        packages={packages}
        onUpdateCustomer={onUpdateCustomer}
      />
    </div>
  );
}