import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import InvoicePrintSheet from '@/components/InvoicePrintSheet';
import { useAuth } from '@/hooks/useAuth';
import { hasCompleteDemoOrders } from '@/lib/demoOrders';
import { getOrdersMealCount } from '@/lib/orderMeals';
import { Meal, PackagePlan } from '@/types/menu';
import { Order, OrderStatus, STATUS_LABELS } from '@/types/order';
import OrderCard from '@/components/OrderCard';
import NewOrderDialog from '@/components/NewOrderDialog';
import { CalendarDays, Filter, Loader2, Printer, RotateCcw, Search } from 'lucide-react';
import { Brand } from '@/hooks/useBrands';
import { formatEGPCurrency, getTodayDateValue } from '@/lib/utils';

type DatePreset = 'today' | 'week' | 'month' | 'custom';

type FilterState = {
  search: string;
  status: string;
  brandId: string;
  startDate: string;
  endDate: string;
  preset: DatePreset;
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
  return {
    search: '',
    status: 'all',
    brandId: 'all',
    startDate: today,
    endDate: today,
    preset: 'today',
  };
}

interface Props {
  orders: Order[];
  loading: boolean;
  onRefresh: () => void;
  addOrder: (order: Omit<Order, 'id' | 'created_at'>) => Promise<boolean>;
  updateStatus: (id: string, status: OrderStatus) => Promise<void>;
  seedDemoOrders: (brands: Brand[]) => Promise<boolean>;
  brands: Brand[];
  meals: Meal[];
  packages: PackagePlan[];
}

export default function Orders({ orders, loading, onRefresh, addOrder, updateStatus, seedDemoOrders, brands, meals, packages }: Props) {
  const { role } = useAuth();
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(() => createDefaultFilters());
  const hasAttemptedAutoSeedRef = useRef(false);

  const setDraftFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setDraftFilters(current => ({ ...current, [key]: value }));
  };

  const applyPreset = (preset: DatePreset) => {
    const today = getTodayDateValue();

    if (preset === 'today') {
      setDraftFilters(current => ({ ...current, preset, startDate: today, endDate: today }));
      return;
    }

    if (preset === 'week') {
      setDraftFilters(current => ({ ...current, preset, startDate: shiftDate(today, -6), endDate: today }));
      return;
    }

    if (preset === 'month') {
      setDraftFilters(current => ({ ...current, preset, startDate: shiftDate(today, -29), endDate: today }));
      return;
    }

    setDraftFilters(current => ({ ...current, preset }));
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const resetFilters = () => {
    const nextFilters = createDefaultFilters();
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  const brandNameById = useMemo(
    () => new Map(brands.map(brand => [brand.id, brand.name])),
    [brands],
  );

  const filtered = useMemo(() => {
    let list = orders;

    if (appliedFilters.status !== 'all') list = list.filter(order => order.status === appliedFilters.status);
    if (appliedFilters.brandId !== 'all') list = list.filter(order => order.brand_id === appliedFilters.brandId);

    if (appliedFilters.startDate) {
      list = list.filter(order => getOrderFilterDate(order) >= appliedFilters.startDate);
    }

    if (appliedFilters.endDate) {
      list = list.filter(order => getOrderFilterDate(order) <= appliedFilters.endDate);
    }

    if (appliedFilters.search.trim()) {
      const q = appliedFilters.search.toLowerCase();
      list = list.filter(o =>
        o.customer_name.toLowerCase().includes(q) ||
        o.phone.includes(q) ||
        o.phone_secondary.includes(q) ||
        o.address.toLowerCase().includes(q),
      );
    }

    return list;
  }, [orders, appliedFilters]);

  const summary = useMemo(() => {
    return {
      orderCount: filtered.length,
      totalMeals: getOrdersMealCount(filtered, meals, packages),
      totalSales: filtered.reduce((sum, order) => sum + order.price, 0),
    };
  }, [filtered, meals, packages]);

  const printableOrders = useMemo(
    () => filtered.filter(order => order.status !== 'cancelled'),
    [filtered],
  );

  useEffect(() => {
    if (role !== 'owner' || brands.length === 0 || loading || hasAttemptedAutoSeedRef.current) {
      return;
    }

    if (hasCompleteDemoOrders(orders)) {
      hasAttemptedAutoSeedRef.current = true;
      return;
    }

    hasAttemptedAutoSeedRef.current = true;
    void seedDemoOrders(brands, { silent: true });
  }, [brands, loading, orders, role, seedDemoOrders]);

  return (
    <>
    <div className="space-y-4 print:hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">الطلبات</h1>
        <NewOrderDialog onCreated={onRefresh} addOrder={addOrder} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(240,253,244,1))] shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">عدد الطلبات</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{summary.orderCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(239,246,255,1))] shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">إجمالي عدد الوجبات</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{summary.totalMeals}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(255,247,237,1))] shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">إجمالي المبيعات</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{formatEGPCurrency(summary.totalSales)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(254,249,195,1))] shadow-sm md:col-span-2 xl:col-span-1">
          <CardContent className="flex h-full flex-col justify-center gap-2 p-5">
            <div className="flex items-center gap-2 text-muted-foreground"><Filter className="h-4 w-4" />الفلاتر النشطة</div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{appliedFilters.brandId === 'all' ? 'كل البراندات' : brandNameById.get(appliedFilters.brandId) ?? 'براند'}</Badge>
              <Badge variant="outline">{appliedFilters.startDate} إلى {appliedFilters.endDate}</Badge>
              <Badge variant="outline">{appliedFilters.status === 'all' ? 'كل الحالات' : STATUS_LABELS[appliedFilters.status as OrderStatus]}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl border-0 shadow-sm">
        <CardContent className="grid gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">فلترة الطلبات اليومية</h2>
              <p className="text-sm text-muted-foreground">استخدم التاريخ والبراند معًا للوصول للطلبات المطلوبة بسرعة.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant={draftFilters.preset === 'today' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => applyPreset('today')}>اليوم</Button>
              <Button variant={draftFilters.preset === 'week' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => applyPreset('week')}>آخر 7 أيام</Button>
              <Button variant={draftFilters.preset === 'month' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => applyPreset('month')}>آخر 30 يوم</Button>
              <Button variant={draftFilters.preset === 'custom' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => applyPreset('custom')}>مخصص</Button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.1fr_180px_180px_180px_180px]">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={draftFilters.search} onChange={e => setDraftFilter('search', e.target.value)} placeholder="ابحث بالاسم أو رقم الهاتف أو العنوان..." className="pr-9" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-foreground">من تاريخ</label>
              <div className="relative">
                <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="date" value={draftFilters.startDate} onChange={e => setDraftFilter('startDate', e.target.value)} className="pr-9" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-foreground">إلى تاريخ</label>
              <div className="relative">
                <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="date" value={draftFilters.endDate} onChange={e => setDraftFilter('endDate', e.target.value)} className="pr-9" />
              </div>
            </div>
            <Select value={draftFilters.brandId} onValueChange={value => setDraftFilter('brandId', value)}>
              <SelectTrigger><SelectValue placeholder="كل العلامات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العلامات</SelectItem>
                {brands.map(brand => (
                  <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={draftFilters.status} onValueChange={value => setDraftFilter('status', value)}>
              <SelectTrigger><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {(Object.entries(STATUS_LABELS) as [OrderStatus, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="rounded-2xl gap-2"
              onClick={() => window.print()}
              disabled={printableOrders.length === 0}
            >
              <Printer className="h-4 w-4" />
              طباعة فواتير اليوم
            </Button>
            <Button variant="outline" className="rounded-2xl gap-2" onClick={resetFilters}>
              <RotateCcw className="h-4 w-4" />
              إعادة تعيين
            </Button>
            <Button className="rounded-2xl gap-2" onClick={applyFilters}>
              <Filter className="h-4 w-4" />
              تطبيق الفلتر
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {orders.length === 0 ? 'لا توجد طلبات بعد. أنشئ أول طلب الآن.' : 'لا توجد طلبات مطابقة للفلاتر الحالية.'}
            </div>
          ) : (
            filtered.map(order => (
              <OrderCard key={order.id} order={order} onUpdate={onRefresh} updateStatus={updateStatus} brands={brands} meals={meals} packages={packages} />
            ))
          )}
        </div>
      )}
    </div>
    <InvoicePrintSheet orders={printableOrders} brands={brands} />
    </>
  );
}
