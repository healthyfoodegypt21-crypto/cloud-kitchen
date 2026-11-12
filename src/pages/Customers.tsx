import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Flame, Search, Star, TrendingUp, Users, Repeat, Sparkles, Wallet } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import { Brand } from '@/hooks/useBrands';
import { Customer } from '@/types/customer';
import { Order } from '@/types/order';
import { cn, formatEGPCurrency, normalizePhone } from '@/lib/utils';

type SortOption = 'last_order_desc' | 'order_count_desc';
type SegmentFilter = 'all' | 'vip' | 'at_risk' | 'new' | 'repeat';

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
}

export default function Customers({ customers, orders, loading, brands, storageMode }: Props) {
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('order_count_desc');
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>('all');

  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = now - (14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

  const brandsById = useMemo(
    () => new Map(brands.map(brand => [brand.id, brand])),
    [brands],
  );

  const customerRevenue = useMemo(() => {
    return orders.reduce<Record<string, number>>((acc, order) => {
      if (order.status === 'cancelled') {
        return acc;
      }

      const key = `${order.brand_id ?? 'no-brand'}:${normalizePhone(order.phone)}`;
      acc[key] = (acc[key] || 0) + order.price;
      return acc;
    }, {});
  }, [orders]);

  const getCustomerSegment = useCallback((customer: Customer): SegmentFilter => {
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
  }, [fourteenDaysAgo, sevenDaysAgo, thirtyDaysAgo]);

  const filteredCustomers = useMemo(() => {
    const rawQuery = search.trim().toLowerCase();
    const phoneQuery = normalizePhone(search);

    const nextCustomers = customers.filter(customer => {
      if (brandFilter !== 'all' && customer.brand_id !== brandFilter) {
        return false;
      }

      if (segmentFilter !== 'all' && getCustomerSegment(customer) !== segmentFilter) {
        return false;
      }

      if (!rawQuery && !phoneQuery) {
        return true;
      }

      return customer.name.toLowerCase().includes(rawQuery)
        || normalizePhone(customer.phone).includes(phoneQuery)
        || normalizePhone(customer.phone_secondary).includes(phoneQuery)
        || customer.address.toLowerCase().includes(rawQuery);
    });

    nextCustomers.sort((left, right) => {
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
  }, [brandFilter, customers, getCustomerSegment, search, segmentFilter, sortBy]);

  const summary = useMemo(() => {
    const vipCustomer = filteredCustomers.reduce<Customer | null>((best, customer) => {
      if (!best || customer.order_count > best.order_count) {
        return customer;
      }

      return best;
    }, null);

    const atRiskCustomers = filteredCustomers.filter(customer => getCustomerSegment(customer) === 'at_risk');
    const estimatedRecoverableRevenue = atRiskCustomers.reduce((sum, customer) => {
      const revenueKey = `${customer.brand_id ?? 'no-brand'}:${normalizePhone(customer.phone)}`;
      return sum + (customerRevenue[revenueKey] || 0);
    }, 0);

    const topRevenueCustomer = filteredCustomers.reduce<Customer | null>((best, customer) => {
      const currentRevenue = customerRevenue[`${customer.brand_id ?? 'no-brand'}:${normalizePhone(customer.phone)}`] || 0;
      const bestRevenue = best ? customerRevenue[`${best.brand_id ?? 'no-brand'}:${normalizePhone(best.phone)}`] || 0 : -1;
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
  }, [customerRevenue, filteredCustomers, getCustomerSegment]);

  const recoveryCandidates = useMemo(() => {
    return filteredCustomers
      .filter((customer) => getCustomerSegment(customer) === 'at_risk')
      .sort((left, right) => {
        const leftRevenue = customerRevenue[`${left.brand_id ?? 'no-brand'}:${normalizePhone(left.phone)}`] || 0;
        const rightRevenue = customerRevenue[`${right.brand_id ?? 'no-brand'}:${normalizePhone(right.phone)}`] || 0;
        return rightRevenue - leftRevenue || right.order_count - left.order_count;
      })
      .slice(0, 3);
  }, [customerRevenue, filteredCustomers, getCustomerSegment]);

  const exportToExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = filteredCustomers.map(customer => ({
      'اسم العميل': customer.name,
      'رقم التليفون': customer.phone,
      'العنوان': customer.address || 'غير متوفر',
      'عدد مرات الطلب': customer.order_count,
      'إجمالي الإيراد': customerRevenue[`${customer.brand_id ?? 'no-brand'}:${normalizePhone(customer.phone)}`] || 0,
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">إجمالي العملاء</p>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 border border-slate-200/60"><Users className="w-4 h-4" /></div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{summary.totalCustomers.toLocaleString('en-US')}</p>
        </Card>
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">إجمالي الطلبات</p>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 border border-slate-200/60"><TrendingUp className="w-4 h-4" /></div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{summary.totalOrders.toLocaleString('en-US')}</p>
        </Card>
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">آخر أوردر</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 border border-slate-200/60"><TrendingUp className="w-4 h-4" /></div>
          </div>
          <p className="mt-2 text-base font-bold text-slate-900 tabular-nums tracking-tight">{formatOrderDate(summary.latestOrderDate)}</p>
        </Card>
        <Card className="p-5 flex flex-col justify-between border-t-2 border-t-amber-400">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">أفضل عميل</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 text-amber-700 border border-amber-200/80"><Star className="w-4 h-4" /></div>
          </div>
          <p className="mt-2 text-base font-bold text-slate-900 truncate">{summary.vipCustomer?.name ?? 'لا يوجد'}</p>
          <p className="text-xs text-slate-500 tabular-nums mt-0.5">{summary.vipCustomer ? `${summary.vipCustomer.order_count.toLocaleString('en-US')} طلب` : 'لا توجد بيانات كافية'}</p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12 items-stretch">
        <Card className="xl:col-span-7 p-5 grid gap-4 sm:grid-cols-3 items-center">
          <div className="rounded-xl bg-slate-50/70 border border-slate-200/60 p-3.5 h-full flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><Repeat className="h-3.5 w-3.5" />فرصة استرجاع</div>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{summary.atRiskCustomers.toLocaleString('en-US')}</p>
            <p className="text-[11px] text-slate-500 mt-1">لم يطلبوا منذ 14 إلى 30 يومًا</p>
          </div>
          <div className="rounded-xl bg-emerald-50/50 border border-emerald-200/60 p-3.5 h-full flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><Wallet className="h-3.5 w-3.5" />إيراد قابل للاسترجاع</div>
            <p className="mt-2 text-xl font-bold text-slate-900 tabular-nums tracking-tight">{formatEGPCurrency(summary.estimatedRecoverableRevenue)}</p>
            <p className="text-[11px] text-slate-500 mt-1">تقريبي من قيمة طلباتهم السابقة</p>
          </div>
          <div className="rounded-xl bg-slate-50/70 border border-slate-200/60 p-3.5 h-full flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700"><Sparkles className="h-3.5 w-3.5" />أعلى عميل قيمة</div>
            <p className="mt-2 text-sm font-bold text-slate-900 truncate">{summary.topRevenueCustomer?.name ?? 'لا يوجد'}</p>
            <p className="text-xs font-semibold text-slate-700 tabular-nums mt-1">
              {summary.topRevenueCustomer
                ? formatEGPCurrency(customerRevenue[`${summary.topRevenueCustomer.brand_id ?? 'no-brand'}:${normalizePhone(summary.topRevenueCustomer.phone)}`] || 0)
                : 'لا توجد بيانات كافية'}
            </p>
          </div>
        </Card>

        <Card className="xl:col-span-5 p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900"><Flame className="h-4 w-4 text-orange-500" />أسرع قائمة متابعة</div>
          <div className="mt-3 space-y-2 flex-1 flex flex-col justify-center">
            {recoveryCandidates.length === 0 ? (
              <p className="text-xs text-slate-500">لا توجد قائمة استرجاع ساخنة الآن. استمر في رفع العملاء العائدين.</p>
            ) : recoveryCandidates.map((customer) => (
              <div key={customer.id} className="rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{customer.name}</p>
                    <p className="text-[11px] text-slate-500">آخر طلب: {formatOrderDate(customer.last_order_at)}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 tabular-nums shrink-0">
                    {formatEGPCurrency(customerRevenue[`${customer.brand_id ?? 'no-brand'}:${normalizePhone(customer.phone)}`] || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { id: 'all', label: 'كل الشرائح' },
              { id: 'vip', label: 'VIP' },
              { id: 'repeat', label: 'عائدون' },
              { id: 'at_risk', label: 'معرضون للانقطاع' },
              { id: 'new', label: 'جدد' },
            ] as Array<{ id: SegmentFilter; label: string }>).map((seg) => (
              <button
                key={seg.id}
                type="button"
                onClick={() => setSegmentFilter(seg.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                  segmentFilter === seg.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {seg.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
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
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_200px_200px]">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث بالاسم أو رقم التليفون..." className="pr-9 h-9 text-xs" />
          </div>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="كل العلامات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل العلامات</SelectItem>
              {brands.map(brand => (
                <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={value => setSortBy(value as SortOption)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="ترتيب العملاء" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="order_count_desc">الأكثر طلبًا</SelectItem>
              <SelectItem value="last_order_desc">الأحدث طلبًا</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <Card className="border-dashed px-4 py-12 text-center text-sm text-slate-500">
          لا توجد بيانات عملاء مطابقة للبحث الحالي.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-stretch">
          {filteredCustomers.map(customer => {
            const brandName = customer.brand_id ? brandsById.get(customer.brand_id)?.name ?? 'بدون براند' : 'بدون براند';
            const isVip = customer.order_count >= 5;
            const segment = getCustomerSegment(customer);
            const totalRevenue = customerRevenue[`${customer.brand_id ?? 'no-brand'}:${normalizePhone(customer.phone)}`] || 0;
            const segmentLabel = segment === 'vip'
              ? 'VIP'
              : segment === 'at_risk'
                ? 'استرجاع'
                : segment === 'new'
                  ? 'جديد'
                  : 'عائد';

            return (
              <Card key={customer.id} className="p-5 flex flex-col justify-between hover:border-slate-300 hover:shadow-xs transition-all duration-150">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{customer.name}</p>
                      <p className="text-xs text-slate-500 tabular-nums mt-0.5">{customer.phone}</p>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700 shrink-0">
                      <Users className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[11px]">{brandName}</Badge>
                    <Badge variant="outline" className="text-[11px] tabular-nums">{customer.order_count.toLocaleString('en-US')} طلب</Badge>
                    {isVip && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">VIP</span>}
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                        segment === 'at_risk'
                          ? 'bg-rose-50 text-rose-600 border-rose-200/60'
                          : 'bg-slate-100 text-slate-700 border-slate-200/80',
                      )}
                    >
                      {segmentLabel}
                    </span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 grid gap-1 text-xs text-slate-500">
                  <p className="truncate">العنوان: <span className="text-slate-700">{customer.address || 'غير متوفر'}</span></p>
                  <div className="flex items-center justify-between pt-1">
                    <span>آخر طلب: {formatOrderDate(customer.last_order_at)}</span>
                    <span className="font-bold text-emerald-700 tabular-nums tracking-tight">{formatEGPCurrency(totalRevenue)}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}