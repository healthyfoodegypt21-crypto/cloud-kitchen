import { useEffect, useMemo, useRef, useState } from 'react';
import { ChefHat, ClipboardList, CookingPot, Package2, Printer, Tags, Table2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import KitchenStickerPrintSheet from '@/components/KitchenStickerPrintSheet';
import KitchenReportPrintSheet from '@/components/KitchenReportPrintSheet';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { Brand } from '@/hooks/useBrands';
import { hasCompleteDemoOrders } from '@/lib/demoOrders';
import { aggregateDailyMealsByBrand, aggregateKitchenOrders, buildKitchenStickers, KITCHEN_CATEGORY_LABELS, KitchenCategory } from '@/lib/kitchen';
import { cn, formatArabicDate, getArabicWeekday, getTodayDateValue } from '@/lib/utils';
import { Meal, MENU_CATEGORY_ORDER, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

interface Props {
  brands: Brand[];
  brandsLoading: boolean;
  orders: Order[];
  ordersLoading: boolean;
  meals: Meal[];
  packages: PackagePlan[];
  catalogLoading: boolean;
  seedDemoOrders: (brands: Brand[], options?: { silent?: boolean }) => Promise<boolean>;
}

const CATEGORY_ORDER: KitchenCategory[] = [...MENU_CATEGORY_ORDER, 'uncategorized'];
type KitchenPrintMode = 'report' | 'stickers' | null;

export default function Kitchen({
  brands,
  brandsLoading,
  orders,
  ordersLoading,
  meals,
  packages,
  catalogLoading,
  seedDemoOrders,
}: Props) {
  const { role } = useAuth();
  const [selectedDate, setSelectedDate] = useState(getTodayDateValue());
  const [selectedBrandId, setSelectedBrandId] = useState('all');
  const [printMode, setPrintMode] = useState<KitchenPrintMode>(null);
  const hasAttemptedAutoSeedRef = useRef(false);

  useEffect(() => {
    if (role !== 'owner' || brands.length === 0 || ordersLoading || hasAttemptedAutoSeedRef.current) {
      return;
    }

    if (hasCompleteDemoOrders(orders)) {
      hasAttemptedAutoSeedRef.current = true;
      return;
    }

    hasAttemptedAutoSeedRef.current = true;
    void seedDemoOrders(brands, { silent: true });
  }, [brands, orders, ordersLoading, role, seedDemoOrders]);

  const summary = useMemo(() => aggregateKitchenOrders({
    orders,
    brands,
    meals,
    packages,
    date: selectedDate,
    brandId: selectedBrandId,
  }), [brands, meals, orders, packages, selectedBrandId, selectedDate]);

  const groupedCategories = useMemo(() => {
    return summary.brands.map((brandSummary) => ({
      ...brandSummary,
      categories: CATEGORY_ORDER.map((category) => ({
        category,
        items: brandSummary.meals.filter(meal => meal.category === category),
      })).filter(section => section.items.length > 0),
    }));
  }, [summary]);

  const weekdayLabel = getArabicWeekday(selectedDate);
  const formattedDate = formatArabicDate(selectedDate);
  const loading = brandsLoading || ordersLoading || catalogLoading;
  const selectedBrandName = selectedBrandId === 'all'
    ? 'كل الشركات'
    : (brands.find(brand => brand.id === selectedBrandId)?.name ?? 'براند');
  const stickers = useMemo(() => buildKitchenStickers(summary, meals), [summary, meals]);
  const dailyMealAggregation = useMemo(() => aggregateDailyMealsByBrand({ orders, brands, meals, packages, date: selectedDate }), [brands, meals, orders, packages, selectedDate]);

  useEffect(() => {
    if (!printMode) {
      return;
    }

    const timeoutId = window.setTimeout(() => window.print(), 60);
    return () => window.clearTimeout(timeoutId);
  }, [printMode]);

  useEffect(() => {
    const resetPrintMode = () => setPrintMode(null);
    window.addEventListener('afterprint', resetPrintMode);

    return () => {
      window.removeEventListener('afterprint', resetPrintMode);
    };
  }, []);

  return (
    <>
    <div className={cn('space-y-5 print:space-y-3', printMode && 'print:hidden')}>
      <AppLayoutHeaderPortal>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-lg gap-1.5 text-xs font-semibold"
            onClick={() => setPrintMode('stickers')}
            disabled={stickers.length === 0}
          >
            <Tags className="h-3.5 w-3.5" />
            <span>طباعة الاستيكرات</span>
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-lg gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setPrintMode('report')}
          >
            <Printer className="h-3.5 w-3.5" />
            <span>طباعة أمر المطبخ</span>
          </Button>
        </div>
      </AppLayoutHeaderPortal>

      <div className="hidden print:block">
        <div className="flex items-center justify-between gap-3 border-b pb-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">تقرير المطبخ اليومي</h1>
            <p className="mt-1 text-sm text-slate-500">{selectedBrandName} - {formattedDate}</p>
          </div>
          <div className="text-sm text-slate-500 tabular-nums">إجمالي الوجبات: {summary.totalMealCount.toLocaleString('en-US')}</div>
        </div>
      </div>

      <Card className="p-4 print:hidden">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_240px_auto] lg:items-center">
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold text-slate-600">تاريخ التنفيذ</label>
            <div className="flex flex-wrap items-center gap-2.5">
              <Input type="date" className="max-w-[200px] h-9 text-xs tabular-nums" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} />
              <span className="text-xs text-slate-500">
                {weekdayLabel ? `${weekdayLabel} · ${formattedDate}` : 'اختر تاريخًا صالحًا'}
              </span>
            </div>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold text-slate-600">البراند</label>
            <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="كل البراندات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل البراندات</SelectItem>
                {brands.map(brand => (
                  <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/60 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              <ChefHat className="h-3.5 w-3.5" />
              الأرقام مطابقة لطلبات يوم التنفيذ
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3 print:grid-cols-3 items-stretch">
        <Card className="p-5 flex flex-col justify-between print:shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">طلبات التنفيذ</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 border border-slate-200/60">
              <ClipboardList className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{summary.orderCount.toLocaleString('en-US')}</p>
        </Card>
        <Card className="p-5 flex flex-col justify-between border-t-2 border-t-emerald-500 print:shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">إجمالي عدد الوجبات</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <CookingPot className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{summary.totalMealCount.toLocaleString('en-US')}</p>
        </Card>
        <Card className="p-5 flex flex-col justify-between print:shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">الأصناف المختلفة</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 border border-slate-200/60">
              <Package2 className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{summary.totalDistinctMeals.toLocaleString('en-US')}</p>
        </Card>
      </div>

      {summary.isCombinedView && !loading && summary.brands.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-600 print:border">
          تم دمج الأصناف المتكررة بين كل الشركات في كشف واحد، كما تم تفكيك الباقات إلى أطباقها الفعلية وتجميعها مع نفس الأصناف لتسهيل التنفيذ على الشيف.
        </div>
      )}

      {!loading && dailyMealAggregation.rows.length > 0 && (
        <Card className="overflow-hidden print:shadow-none">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-slate-100 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900"><Table2 className="h-4 w-4 text-emerald-600" />تجميع الوجبات اليومية</CardTitle>
              <p className="mt-1 text-xs text-slate-500">إجمالي الوجبات المشتركة بين الصفحات، مع كمية كل صفحة والإجمالي النهائي.</p>
            </div>
            <span className="rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 tabular-nums">
              {dailyMealAggregation.total.toLocaleString('en-US')} وجبة
            </span>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">اسم الوجبة</th>
                  {dailyMealAggregation.brands.map(brand => <th key={brand.key} className="px-4 py-2.5 text-center font-semibold">{brand.name}</th>)}
                  <th className="px-4 py-2.5 text-center font-semibold">الإجمالي المطلوب</th>
                  <th className="px-4 py-2.5 font-semibold">الكومنتات / التعديلات</th>
                </tr>
              </thead>
              <tbody>
                {dailyMealAggregation.rows.map(row => (
                  <tr key={row.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-800">{row.label}</td>
                    {dailyMealAggregation.brands.map(brand => <td key={brand.key} className="px-4 py-3 text-center tabular-nums text-slate-600">{(row.countsByBrand[brand.key] ?? 0).toLocaleString('en-US')}</td>)}
                    <td className="px-4 py-3 text-center font-bold text-emerald-700 tabular-nums">{row.total.toLocaleString('en-US')}</td>
                    <td className="px-4 py-3">
                      {row.modifications.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div className="space-y-1">
                          {row.modifications.map(modification => (
                            <div key={modification.key} className="flex items-start justify-between gap-2 text-xs">
                              <span className="text-slate-600">{modification.instruction}</span>
                              <Badge variant="outline" className="shrink-0 rounded-full px-2 py-0 tabular-nums">{modification.count}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : groupedCategories.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm font-bold text-slate-900">لا توجد وجبات مجمعة لهذا اليوم</p>
            <p className="mt-1 text-xs text-slate-500">جرّب تغيير التاريخ أو البراند، أو أضف طلبات بتاريخ التنفيذ المطلوب.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedCategories.map((brandSummary) => (
            <Card key={brandSummary.key} className="print:shadow-none print:break-inside-avoid">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 border-b border-slate-100 pb-4">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">{brandSummary.brandName}</CardTitle>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">{brandSummary.orderCount.toLocaleString('en-US')} طلبات · {brandSummary.totalMealCount.toLocaleString('en-US')} وجبة مطلوبة للتجهيز</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {brandSummary.categories.map((section) => (
                    <span key={`${brandSummary.key}-${section.category}`} className="rounded-full bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 tabular-nums">
                      {KITCHEN_CATEGORY_LABELS[section.category]}: {section.items.reduce((sum, item) => sum + item.count, 0).toLocaleString('en-US')}
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 p-5 lg:grid-cols-2 print:grid-cols-2">
                {brandSummary.categories.map((section) => (
                  <div key={`${brandSummary.key}-${section.category}`} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 print:bg-transparent print:break-inside-avoid">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900">{KITCHEN_CATEGORY_LABELS[section.category]}</h3>
                      <Badge variant="outline" className="text-[11px] tabular-nums">{section.items.length} صنف</Badge>
                    </div>
                    <div className="space-y-2.5">
                      {section.items.map((item) => {
                        const matchedMeal = meals.find(
                          (m) =>
                            (!brandSummary.brandId || m.brand_id === brandSummary.brandId) &&
                            m.name.trim().toLowerCase() === item.label.trim().toLowerCase(),
                        );
                        return (
                        <div key={item.key} className="rounded-lg border border-slate-200/70 bg-white p-3 print:shadow-none print:break-inside-avoid">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                            <span className="rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 text-xs font-bold text-emerald-700 tabular-nums">{item.count.toLocaleString('en-US')}</span>
                          </div>
                          {matchedMeal?.ingredients && matchedMeal.ingredients.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-slate-500 tabular-nums">
                              {matchedMeal.ingredients.map((ing, idx) => (
                                <span key={`${ing.name}-${idx}`} className="rounded bg-slate-50 border border-slate-200/70 px-1.5 py-0.5">
                                  {ing.name}
                                  {(ing.weight_before_grams !== null || ing.weight_after_grams !== null) &&
                                    ` (${ing.weight_before_grams ?? '—'}g→${ing.weight_after_grams ?? '—'}g)`}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.modifications.length > 0 && (
                            <div className="mt-3 space-y-2 border-t pt-3">
                              {item.modifications.map((modification) => (
                                <div key={modification.key} className="flex items-start justify-between gap-3 text-sm">
                                  <p className="text-muted-foreground">{modification.label}</p>
                                  <Badge variant="outline" className="shrink-0 rounded-full px-2.5 py-0.5">{modification.count}</Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
    {printMode === 'report' && <KitchenReportPrintSheet summary={summary} dateLabel={formattedDate} brandLabel={selectedBrandName} />}
    {printMode === 'stickers' && <KitchenStickerPrintSheet stickers={stickers} />}
    </>
  );
}