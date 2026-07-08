import { useMemo, useState } from 'react';
import { Download, Flame, Loader2, Search, Star, TrendingUp, Users, Repeat, Sparkles, Wallet } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brand } from '@/hooks/useBrands';
import { Customer } from '@/types/customer';
import { Order } from '@/types/order';
import { formatEGPCurrency, normalizePhone } from '@/lib/utils';

type SortOption = 'last_order_desc' | 'order_count_desc';
type SegmentFilter = 'all' | 'vip' | 'at_risk' | 'new' | 'repeat';

function formatOrderDate(value: string | null) {
  if (!value) {
    return 'لا توجد طلبات بعد';
  }

  return new Date(value).toLocaleDateString('ar-EG', {
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

  const getCustomerSegment = (customer: Customer): SegmentFilter => {
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
  };

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
  }, [brandFilter, customers, search, segmentFilter, sortBy]);

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
  }, [customerRevenue, filteredCustomers]);

  const recoveryCandidates = useMemo(() => {
    return filteredCustomers
      .filter((customer) => getCustomerSegment(customer) === 'at_risk')
      .sort((left, right) => {
        const leftRevenue = customerRevenue[`${left.brand_id ?? 'no-brand'}:${normalizePhone(left.phone)}`] || 0;
        const rightRevenue = customerRevenue[`${right.brand_id ?? 'no-brand'}:${normalizePhone(right.phone)}`] || 0;
        return rightRevenue - leftRevenue || right.order_count - left.order_count;
      })
      .slice(0, 3);
  }, [customerRevenue, filteredCustomers]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">بيانات العملاء</h1>
          <p className="text-sm text-muted-foreground">تحليل العملاء، تحديد أفضل العملاء، وتجهيز القوائم للمبيعات وإعادة الاستهداف.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={storageMode === 'customers' ? 'default' : 'outline'}>
            {storageMode === 'customers' ? 'الحفظ المباشر مفعل' : 'عرض مشتق من الطلبات الحالية'}
          </Badge>
          <Button onClick={exportToExcel} className="gap-2 rounded-2xl" disabled={filteredCustomers.length === 0}>
            <Download className="h-4 w-4" />
            تصدير إلى Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(240,253,244,1))] shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">إجمالي العملاء</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{summary.totalCustomers}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(239,246,255,1))] shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">إجمالي الطلبات</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{summary.totalOrders}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(255,247,237,1))] shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground"><TrendingUp className="h-4 w-4" />آخر أوردر</div>
            <p className="mt-2 text-lg font-bold text-foreground">{formatOrderDate(summary.latestOrderDate)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(250,245,255,1))] shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground"><Star className="h-4 w-4" />أفضل عميل</div>
            <p className="mt-2 text-lg font-bold text-foreground">{summary.vipCustomer?.name ?? 'لا يوجد'}</p>
            <p className="text-sm text-muted-foreground">{summary.vipCustomer ? `${summary.vipCustomer.order_count} طلب` : 'لا توجد بيانات كافية'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,247,237,1),rgba(255,255,255,1))] shadow-sm">
          <CardContent className="grid gap-4 p-5 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2 text-orange-600"><Repeat className="h-4 w-4" />فرصة استرجاع</div>
              <p className="mt-2 text-3xl font-black text-foreground">{summary.atRiskCustomers}</p>
              <p className="text-sm text-muted-foreground">عملاء لم يطلبوا منذ 14 إلى 30 يومًا</p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-emerald-600"><Wallet className="h-4 w-4" />إيراد قابل للاسترجاع</div>
              <p className="mt-2 text-2xl font-black text-foreground">{formatEGPCurrency(summary.estimatedRecoverableRevenue)}</p>
              <p className="text-sm text-muted-foreground">تقريبي بناءً على قيمة طلباتهم السابقة</p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-sky-600"><Sparkles className="h-4 w-4" />أعلى عميل قيمة</div>
              <p className="mt-2 text-lg font-black text-foreground">{summary.topRevenueCustomer?.name ?? 'لا يوجد'}</p>
              <p className="text-sm text-muted-foreground">
                {summary.topRevenueCustomer
                  ? formatEGPCurrency(customerRevenue[`${summary.topRevenueCustomer.brand_id ?? 'no-brand'}:${normalizePhone(summary.topRevenueCustomer.phone)}`] || 0)
                  : 'لا توجد بيانات كافية'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(239,246,255,1))] shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-slate-700"><Flame className="h-4 w-4 text-orange-500" />أسرع قائمة متابعة</div>
            <div className="mt-4 space-y-3">
              {recoveryCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد قائمة استرجاع ساخنة الآن. استمر في رفع العملاء العائدين.</p>
              ) : recoveryCandidates.map((customer) => (
                <div key={customer.id} className="rounded-2xl border bg-background/80 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">آخر طلب: {formatOrderDate(customer.last_order_at)}</p>
                    </div>
                    <Badge>{formatEGPCurrency(customerRevenue[`${customer.brand_id ?? 'no-brand'}:${normalizePhone(customer.phone)}`] || 0)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-3xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={brandFilter === 'all' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setBrandFilter('all')}>
            كل العملاء
          </Button>
          {brands.map(brand => (
            <Button
              key={brand.id}
              variant={brandFilter === brand.id ? 'default' : 'outline'}
              className="rounded-2xl"
              onClick={() => setBrandFilter(brand.id)}
            >
              {brand.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={segmentFilter === 'all' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setSegmentFilter('all')}>
            كل الشرائح
          </Button>
          <Button variant={segmentFilter === 'vip' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setSegmentFilter('vip')}>
            VIP
          </Button>
          <Button variant={segmentFilter === 'repeat' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setSegmentFilter('repeat')}>
            عائدون
          </Button>
          <Button variant={segmentFilter === 'at_risk' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setSegmentFilter('at_risk')}>
            معرضون للانقطاع
          </Button>
          <Button variant={segmentFilter === 'new' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setSegmentFilter('new')}>
            جدد
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_200px_200px]">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث بالاسم أو رقم التليفون..." className="pr-9" />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger><SelectValue placeholder="كل العلامات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل العلامات</SelectItem>
            {brands.map(brand => (
              <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={value => setSortBy(value as SortOption)}>
          <SelectTrigger><SelectValue placeholder="ترتيب العملاء" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="order_count_desc">الأكثر طلبًا</SelectItem>
            <SelectItem value="last_order_desc">الأحدث طلبًا</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filteredCustomers.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/10 px-4 py-12 text-center text-muted-foreground">
          لا توجد بيانات عملاء مطابقة للبحث الحالي.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
              <Card key={customer.id} className="overflow-hidden rounded-3xl border-0 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(247,249,248,1))] shadow-sm">
                <CardContent className="grid gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-foreground">{customer.name}</p>
                      <p className="text-sm text-muted-foreground">{customer.phone}</p>
                    </div>
                    <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                      <Users className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{brandName}</Badge>
                    <Badge variant="outline">{customer.order_count} طلب</Badge>
                    {isVip && <Badge>VIP</Badge>}
                    <Badge variant={segment === 'at_risk' ? 'destructive' : 'secondary'}>{segmentLabel}</Badge>
                    <Badge variant={customer.record_source === 'customers' ? 'default' : 'secondary'}>
                      {customer.record_source === 'customers' ? 'مخزن' : 'من الطلبات'}
                    </Badge>
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <p>العنوان: {customer.address || 'غير متوفر'}</p>
                    <p>إجمالي الطلبات: {customer.order_count}</p>
                    <p>القيمة الكلية: {formatEGPCurrency(totalRevenue)}</p>
                    <p>آخر أوردر: {formatOrderDate(customer.last_order_at)}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}