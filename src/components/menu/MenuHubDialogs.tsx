import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Copy,
  FolderKanban,
  Loader2,
  MessageCircle,
  Printer,
  Scale,
  Share2,
  TrendingUp,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Brand } from '@/hooks/useBrands';
import {
  buildCustomerMenuShowcaseText,
  InventoryCostItem,
  MenuEngineeringReport,
} from '@/lib/menuHub';
import { formatEGPCurrency } from '@/lib/utils';
import { MenuCompanyCategory, MenuIngredient } from '@/types/companyMenu';
import { Meal, MealInput, PackagePlan, PackagePlanInput } from '@/types/menu';

export function MenuEngineeringPanel({
  report,
  brandName,
}: {
  report: MenuEngineeringReport;
  brandName: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 items-stretch">
        <Card className="p-5 flex flex-col justify-between border-t-2 border-t-emerald-500">
          <span className="text-xs font-medium text-slate-500">طلبات {brandName} (آخر 30 يوم)</span>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
            {report.totalBrandOrders30d.toLocaleString('en-US')} طلب
          </p>
          <span className="text-[11px] text-slate-400">الطلبات غير الملغية</span>
        </Card>
        <Card className="p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-500">إيراد آخر 30 يوم</span>
          <p className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums tracking-tight">
            {formatEGPCurrency(report.totalBrandRevenue30d)}
          </p>
          <span className="text-[11px] text-slate-400">من الوجبات والباقات</span>
        </Card>
        <Card className="p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-500">أصناف راكدة (بدون طلب 30 يوم)</span>
          <p className="mt-2 text-2xl font-bold text-amber-700 tabular-nums tracking-tight">
            {report.dormantMeals.length.toLocaleString('en-US')} وجبة
          </p>
          <span className="text-[11px] text-slate-400">مرشحة للترويج أو التبديل</span>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-stretch">
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">الأصناف والوجبات الأكثر مبيعاً</h3>
          </div>
          {report.topMeals.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">لا توجد بيانات طلبات كافية خلال آخر 30 يوماً.</p>
          ) : (
            <div className="space-y-2.5">
              {report.topMeals.map((item, idx) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      #{idx + 1} {item.name}
                    </span>
                    <span className="text-slate-600 tabular-nums font-semibold">
                      {item.count.toLocaleString('en-US')} مرة ({item.revenueShare}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{ width: `${Math.max(6, item.revenueShare)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-900">الباقات الأكثر طلباً وإيراداً</h3>
          </div>
          {report.topPackages.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">لا توجد باقات مطلوبة خلال آخر 30 يوماً.</p>
          ) : (
            <div className="space-y-2">
              {report.topPackages.map((pkg, idx) => (
                <div
                  key={pkg.name}
                  className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900">
                      #{idx + 1} {pkg.name}
                    </span>
                    <span className="mr-2 text-slate-500 tabular-nums">
                      ({pkg.count.toLocaleString('en-US')} اشتراك)
                    </span>
                  </div>
                  <span className="font-bold text-emerald-700 tabular-nums">
                    {formatEGPCurrency(pkg.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {report.dormantMeals.length > 0 && (
        <Card className="p-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">وجبات لم تُطلب خلال آخر 30 يوماً</h3>
            <span className="text-xs text-slate-400">فكّر في إدراجها بباقات الأسبوع أو تعديل سعرها</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {report.dormantMeals.slice(0, 20).map((m) => (
              <span
                key={m.id}
                className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-2.5 py-1 text-xs font-medium text-amber-900"
              >
                {m.name}
              </span>
            ))}
            {report.dormantMeals.length > 20 && (
              <span className="px-2 py-1 text-xs text-slate-400 tabular-nums">
                +{report.dormantMeals.length - 20} أخرى
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export function CrossBrandCloneDialog({
  open,
  onOpenChange,
  sourceBrand,
  brands,
  sourceMeals,
  sourcePackages,
  onSaveMeal,
  onSavePackage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceBrand: Brand | null;
  brands: Brand[];
  sourceMeals: Meal[];
  sourcePackages: PackagePlan[];
  onSaveMeal: (input: MealInput) => Promise<boolean>;
  onSavePackage: (input: PackagePlanInput) => Promise<boolean>;
}) {
  const otherBrands = brands.filter((b) => b.id !== sourceBrand?.id);
  const [targetBrandId, setTargetBrandId] = useState('');
  const [priceAdjustPct, setPriceAdjustPct] = useState('0');
  const [clonePackagesToo, setClonePackagesToo] = useState(true);
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    if (otherBrands.length > 0 && !otherBrands.some((b) => b.id === targetBrandId)) {
      setTargetBrandId(otherBrands[0].id);
    }
  }, [otherBrands, targetBrandId]);

  const handleClone = async () => {
    if (!sourceBrand || !targetBrandId) return;
    const pctNum = Number(priceAdjustPct || 0);
    const multiplier = Number.isFinite(pctNum) ? 1 + pctNum / 100 : 1;

    setCloning(true);
    let mealsCopied = 0;
    for (const meal of sourceMeals) {
      const adjustedPrice =
        meal.price !== null ? Math.max(0, Math.round(meal.price * multiplier)) : null;
      const ok = await onSaveMeal({
        brand_id: targetBrandId,
        name: meal.name,
        description: meal.description,
        category: meal.category,
        custom_category: meal.custom_category,
        price: adjustedPrice,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        fiber: meal.fiber,
        calories: meal.calories,
        is_available: meal.is_available ?? true,
        ingredients: meal.ingredients ?? [],
      });
      if (ok) mealsCopied += 1;
    }

    let pkgsCopied = 0;
    if (clonePackagesToo) {
      for (const pkg of sourcePackages) {
        const adjustedPkgPrice = Math.max(0, Math.round(pkg.price * multiplier));
        const ok = await onSavePackage({
          brand_id: targetBrandId,
          name: pkg.name,
          days_count: pkg.days_count,
          price: adjustedPkgPrice,
          items: pkg.items.map((it) => ({ custom_meal_name: it.label })),
        });
        if (ok) pkgsCopied += 1;
      }
    }

    setCloning(false);
    onOpenChange(false);
    toast.success(
      `تم نسخ ${mealsCopied.toLocaleString('en-US')} وجبة${pkgsCopied > 0 ? ` و ${pkgsCopied.toLocaleString('en-US')} باقة` : ''} إلى البراند المختار`,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-emerald-600" />
            نسخ المنيو والباقات لشركة أخرى
          </DialogTitle>
          <DialogDescription>
            انسخ وجبات وباقات "{sourceBrand?.name ?? ''}" لشركة أخرى مع إمكانية تعديل نسبة الأسعار تلقائيًا.
          </DialogDescription>
        </DialogHeader>

        {otherBrands.length === 0 ? (
          <p className="py-4 text-xs text-slate-500">لا توجد شركات/براندات أخرى متاحة للنسخ إليها حاليًا.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">الشركة المستهدفة</Label>
              <Select value={targetBrandId} onValueChange={setTargetBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الشركة" />
                </SelectTrigger>
                <SelectContent>
                  {otherBrands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">تعديل الأسعار بنسبة مئوية (%)</Label>
              <Input
                type="number"
                step="1"
                value={priceAdjustPct}
                onChange={(e) => setPriceAdjustPct(e.target.value)}
                placeholder="0 (مثال: 10 لزيادة 10% أو -5 لخصم 5%)"
                className="tabular-nums"
              />
              <p className="text-[11px] text-slate-500">
                اتركه 0 لنسخ الأسعار كما هي، أو اكتب مثلاً 10 لرفع الأسعار 10%.
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={clonePackagesToo}
                onChange={(e) => setClonePackagesToo(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>نسخ الباقات أيضاً ({sourcePackages.length.toLocaleString('en-US')} باقة)</span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cloning}>
            إلغاء
          </Button>
          <Button
            onClick={() => void handleClone()}
            disabled={cloning || otherBrands.length === 0 || !targetBrandId}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            {cloning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            <span>بدء النسخ ({sourceMeals.length.toLocaleString('en-US')} وجبة)</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerMenuShowcaseDialog({
  open,
  onOpenChange,
  companyName,
  phone,
  meals,
  packages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  phone?: string;
  meals: Meal[];
  packages: PackagePlan[];
}) {
  const showcaseText = buildCustomerMenuShowcaseText({
    companyName,
    phone,
    meals,
    packages,
  });

  const copyShowcase = async () => {
    try {
      await navigator.clipboard.writeText(showcaseText);
      toast.success('تم نسخ منيو العميل جاهزاً للإرسال على واتساب');
    } catch {
      toast.error('تعذر النسخ إلى الحافظة');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-emerald-600" />
            عرض ومشاركة منيو العميل ({companyName})
          </DialogTitle>
          <DialogDescription>
            منيو منسق تلقائياً للعملاء يشمل الباقات والأقسام والوجبات المتاحة حالياً مع السعرات والأسعار.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={showcaseText}
          readOnly
          rows={14}
          className="text-xs leading-relaxed bg-slate-50 font-sans"
        />

        <DialogFooter className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()} className="gap-1.5 text-xs">
            <Printer className="h-3.5 w-3.5" />
            <span>طباعة / PDF</span>
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(showcaseText)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>مشاركة عبر واتساب</span>
          </a>
          <Button onClick={() => void copyShowcase()} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs">
            <Copy className="h-3.5 w-3.5" />
            <span>نسخ النص بالكامل</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IngredientsAndCostingDialog({
  open,
  onOpenChange,
  companyId,
  ingredients,
  inventoryItems,
  onSaveIngredient,
  onDeleteIngredient,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  ingredients: MenuIngredient[];
  inventoryItems: InventoryCostItem[];
  onSaveIngredient: (input: {
    id?: string;
    company_id: string;
    name: string;
    inventory_item_id?: string | null;
    unit_cost_per_kg?: number | null;
  }) => Promise<MenuIngredient | null>;
  onDeleteIngredient: (id: string) => Promise<boolean>;
}) {
  const [newName, setNewName] = useState('');
  const [newCostPerKg, setNewCostPerKg] = useState('');
  const [newInvId, setNewInvId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { name: string; cost: string; invId: string }>>({});

  const addNew = async () => {
    if (!companyId || !newName.trim()) return;
    const costVal = newCostPerKg.trim() ? Number(newCostPerKg) : null;
    const saved = await onSaveIngredient({
      company_id: companyId,
      name: newName,
      inventory_item_id: newInvId || null,
      unit_cost_per_kg: Number.isFinite(costVal) ? costVal : null,
    });
    if (saved) {
      setNewName('');
      setNewCostPerKg('');
      setNewInvId('');
      toast.success('تمت إضافة المكوّن للمكتبة');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-emerald-600" />
            مكتبة المكونات وربط تكلفة المخزن المركزي
          </DialogTitle>
          <DialogDescription>
            اربط المكوّن بصنف في المخزن المركزي أو حدد تكلفة الكيلو لحساب تكلفة الوجبة وهامش الربح (Food Cost %) تلقائياً.
          </DialogDescription>
        </DialogHeader>

        {!companyId ? (
          <p className="py-6 text-center text-xs text-slate-500">
            احفظ بيانات ملف الشركة أولاً لتفعيل مكتبة المكونات المخصصة لها.
          </p>
        ) : (
          <>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
              {ingredients.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">لا توجد مكونات مسجلة بعد.</p>
              ) : (
                ingredients.map((ing) => {
                  const current = drafts[ing.id] ?? {
                    name: ing.name,
                    cost: ing.unit_cost_per_kg !== null && ing.unit_cost_per_kg !== undefined ? String(ing.unit_cost_per_kg) : '',
                    invId: ing.inventory_item_id ?? '',
                  };
                  return (
                    <div
                      key={ing.id}
                      className="grid gap-2 sm:grid-cols-[1fr_130px_160px_auto] items-center rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5"
                    >
                      <Input
                        value={current.name}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [ing.id]: { ...current, name: e.target.value } }))
                        }
                        className="h-8 text-xs bg-white"
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="تكلفة الكيلو ج.م"
                        value={current.cost}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [ing.id]: { ...current, cost: e.target.value } }))
                        }
                        className="h-8 text-xs bg-white tabular-nums"
                      />
                      <select
                        value={current.invId}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [ing.id]: { ...current, invId: e.target.value } }))
                        }
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                      >
                        <option value="">ربط بالمخزن (اختياري)</option>
                        {inventoryItems.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name} ({inv.avgCostPerUsageUnit} ج.م/{inv.usageUnit})
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() =>
                            void onSaveIngredient({
                              id: ing.id,
                              company_id: companyId,
                              name: current.name,
                              inventory_item_id: current.invId || null,
                              unit_cost_per_kg: current.cost.trim() ? Number(current.cost) : null,
                            }).then(() => toast.success('تم تحديث المكوّن'))
                          }
                        >
                          حفظ
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                          onClick={() => void onDeleteIngredient(ing.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 grid gap-2 sm:grid-cols-[1fr_130px_160px_auto]">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="اسم مكوّن جديد (مثال: صدور دجاج)"
                className="h-9 text-xs"
              />
              <Input
                type="number"
                min="0"
                step="0.5"
                value={newCostPerKg}
                onChange={(e) => setNewCostPerKg(e.target.value)}
                placeholder="سعر الكيلو ج.م"
                className="h-9 text-xs tabular-nums"
              />
              <select
                value={newInvId}
                onChange={(e) => setNewInvId(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="">ربط بصنف مخزن</option>
                {inventoryItems.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.name}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => void addNew()}
                className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                إضافة
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CategoriesManagerDialog({
  open,
  onOpenChange,
  companyId,
  categories,
  onSaveCategory,
  onDeleteCategory,
  onReorderCategories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  categories: MenuCompanyCategory[];
  onSaveCategory: (input: { id?: string; company_id: string; name: string }) => Promise<boolean>;
  onDeleteCategory: (id: string) => Promise<boolean>;
  onReorderCategories: (orderedIds: string[]) => Promise<boolean>;
}) {
  const [newName, setNewName] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});

  const move = async (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= categories.length) return;
    const copy = [...categories];
    [copy[idx], copy[nextIdx]] = [copy[nextIdx], copy[idx]];
    await onReorderCategories(copy.map((c) => c.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-emerald-600" />
            إدارة وترتيب الفئات المخصصة
          </DialogTitle>
          <DialogDescription>
            أضف فئات خاصة بالشركة (مثل Keto أو Breakfast أو Frozen) ورتّب ظهورها بحرية.
          </DialogDescription>
        </DialogHeader>

        {!companyId ? (
          <p className="py-4 text-xs text-slate-500">احفظ ملف الشركة أولاً لإدارة فئاتها المخصصة.</p>
        ) : (
          <>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {categories.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">
                  تُستخدم حالياً الأقسام القياسية الستة (لحوم، دجاج، أسماك، ميكس، سلطات، سناكس). أضف فئة مخصصة إذا رغبت.
                </p>
              ) : (
                categories.map((cat, idx) => (
                  <div key={cat.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => void move(idx, -1)}
                        className="text-[10px] text-slate-500 hover:text-slate-900 px-1"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => void move(idx, 1)}
                        className="text-[10px] text-slate-500 hover:text-slate-900 px-1"
                      >
                        ▼
                      </button>
                    </div>
                    <Input
                      value={edits[cat.id] ?? cat.name}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() =>
                        void onSaveCategory({
                          id: cat.id,
                          company_id: companyId,
                          name: edits[cat.id] ?? cat.name,
                        })
                      }
                    >
                      حفظ
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                      onClick={() => void onDeleteCategory(cat.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 border-t border-slate-100 pt-3">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="اسم فئة مخصصة جديدة..."
                className="h-9 text-xs"
              />
              <Button
                onClick={() =>
                  void onSaveCategory({ company_id: companyId, name: newName }).then((ok) => {
                    if (ok) setNewName('');
                  })
                }
                className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                إضافة
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
