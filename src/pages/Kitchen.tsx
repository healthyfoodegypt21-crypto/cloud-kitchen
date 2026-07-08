import { useEffect, useMemo, useRef, useState } from 'react';
import { ChefHat, ClipboardList, CookingPot, Loader2, Package2, Printer, Tags } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import KitchenStickerPrintSheet from '@/components/KitchenStickerPrintSheet';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { Brand } from '@/hooks/useBrands';
import { hasCompleteDemoOrders } from '@/lib/demoOrders';
import { aggregateKitchenOrders, buildKitchenStickers, KITCHEN_CATEGORY_LABELS, KitchenCategory } from '@/lib/kitchen';
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
    <div className={cn('space-y-4 print:space-y-3', printMode === 'stickers' && 'print:hidden')}>
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ChefHat className="h-6 w-6 text-primary" />
            المطبخ
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تجميع وجبات التنفيذ اليومية حسب الصنف لتجهيزها مرة واحدة، مع إظهار أي تعديل تحت نفس الوجبة.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full px-3 py-1 text-sm">
          الأرقام مطابقة لطلبات نفس يوم التنفيذ
        </Badge>
      </div>

      <div className="hidden print:block">
        <div className="flex items-center justify-between gap-3 border-b pb-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">تقرير المطبخ اليومي</h1>
            <p className="mt-1 text-sm text-muted-foreground">{selectedBrandName} - {formattedDate}</p>
          </div>
          <div className="text-sm text-muted-foreground">إجمالي الوجبات: {summary.totalMealCount}</div>
        </div>
      </div>

      <Card className="rounded-3xl border-0 shadow-sm print:hidden">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_220px] lg:items-end">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground">تاريخ التنفيذ</label>
            <Input type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} />
            <p className="text-xs text-muted-foreground">
              {weekdayLabel ? `${weekdayLabel} - ${formattedDate}` : 'اختر تاريخًا صالحًا'}
            </p>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground">البراند</label>
            <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
              <SelectTrigger><SelectValue placeholder="كل البراندات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل البراندات</SelectItem>
                {brands.map(brand => (
                  <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 lg:col-span-2 flex justify-end">
            <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-2xl gap-2" onClick={() => setPrintMode('stickers')} disabled={stickers.length === 0}>
              <Tags className="h-4 w-4" />
              طباعة الاستيكرات
            </Button>
            <Button type="button" className="rounded-2xl gap-2" onClick={() => setPrintMode('report')}>
              <Printer className="h-4 w-4" />
              طباعة أمر المطبخ
            </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3 print:grid-cols-3">
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(240,253,244,1))] shadow-sm print:rounded-xl print:shadow-none print:border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground"><ClipboardList className="h-4 w-4" />طلبات التنفيذ</div>
            <p className="mt-2 text-3xl font-bold text-foreground">{summary.orderCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(239,246,255,1))] shadow-sm print:rounded-xl print:shadow-none print:border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground"><CookingPot className="h-4 w-4" />إجمالي عدد الوجبات</div>
            <p className="mt-2 text-3xl font-bold text-foreground">{summary.totalMealCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(255,247,237,1))] shadow-sm print:rounded-xl print:shadow-none print:border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground"><Package2 className="h-4 w-4" />الأصناف المختلفة</div>
            <p className="mt-2 text-3xl font-bold text-foreground">{summary.totalDistinctMeals}</p>
          </CardContent>
        </Card>
      </div>

      {summary.isCombinedView && !loading && summary.brands.length > 0 && (
        <Card className="rounded-3xl border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(250,250,249,1))] shadow-sm print:rounded-xl print:shadow-none print:border">
          <CardContent className="p-4">
            <p className="text-sm text-foreground">
              تم دمج الأصناف المتكررة بين كل الشركات في كشف واحد، كما تم تفكيك الباقات إلى أطباقها الفعلية وتجميعها مع نفس الأصناف لتسهيل التنفيذ على الشيف.
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : groupedCategories.length === 0 ? (
        <Card className="rounded-3xl border-dashed shadow-sm">
          <CardContent className="py-12 text-center">
            <p className="text-lg font-semibold text-foreground">لا توجد وجبات مجمعة لهذا اليوم</p>
            <p className="mt-2 text-sm text-muted-foreground">جرّب تغيير التاريخ أو البراند، أو أضف طلبات بتاريخ التنفيذ المطلوب.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedCategories.map((brandSummary) => (
            <Card key={brandSummary.key} className="rounded-3xl border-0 shadow-sm print:rounded-xl print:shadow-none print:border print:break-inside-avoid">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 print:pb-4">
                <div>
                  <CardTitle className="text-xl">{brandSummary.brandName}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{brandSummary.orderCount} طلبات، {brandSummary.totalMealCount} وجبة مطلوبة للتجهيز</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {brandSummary.categories.map((section) => (
                    <Badge key={`${brandSummary.key}-${section.category}`} variant="secondary" className="rounded-full px-3 py-1">
                      {KITCHEN_CATEGORY_LABELS[section.category]}: {section.items.reduce((sum, item) => sum + item.count, 0)}
                    </Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
                {brandSummary.categories.map((section) => (
                  <div key={`${brandSummary.key}-${section.category}`} className="rounded-3xl border bg-muted/20 p-4 print:rounded-xl print:bg-transparent print:break-inside-avoid">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-foreground">{KITCHEN_CATEGORY_LABELS[section.category]}</h3>
                      <Badge variant="outline">{section.items.length} صنف</Badge>
                    </div>
                    <div className="space-y-3">
                      {section.items.map((item) => (
                        <div key={item.key} className="rounded-2xl bg-background p-3 shadow-sm print:rounded-lg print:shadow-none print:border print:break-inside-avoid">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-foreground">{item.label}</p>
                            <Badge className="rounded-full px-3 py-1 text-sm">{item.count}</Badge>
                          </div>
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
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
    {printMode === 'stickers' && <KitchenStickerPrintSheet stickers={stickers} />}
    </>
  );
}