import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Building2,
  ChevronDown,
  ChevronUp,
  Download,
  Flame,
  MinusCircle,
  PlusCircle,
  Printer,
  Scale,
  Search,
  Settings2,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AggregatedIngredientItem,
  BrandIngredientsSummary,
  CustomPortionWeightsMap,
  describeMealCategoryLabel,
  formatKitchenWeight,
  INGREDIENT_STATION_LABELS,
  INGREDIENT_STATION_ORDER,
  IngredientStation,
  KitchenIngredientsReport,
} from '@/lib/kitchenIngredients';
import { cn, compactWhitespace } from '@/lib/utils';

interface Props {
  report: KitchenIngredientsReport;
  selectedBrandFilter: string;
  dateLabel: string;
  customPortionWeights: CustomPortionWeightsMap;
  onSaveCustomPortionWeights: (next: CustomPortionWeightsMap) => void;
  onPrintIngredients: (scope: string) => void;
}

const STATION_BADGE_STYLES: Record<IngredientStation, string> = {
  carb: 'bg-amber-50 text-amber-800 border-amber-200/80',
  protein: 'bg-rose-50 text-rose-800 border-rose-200/80',
  vegetable: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  other: 'bg-slate-100 text-slate-700 border-slate-200/80',
};

export default function KitchenIngredientsPanel({
  report,
  selectedBrandFilter,
  dateLabel,
  customPortionWeights,
  onSaveCustomPortionWeights,
  onPrintIngredients,
}: Props) {
  const [activeScope, setActiveScope] = useState<string>(selectedBrandFilter);
  const [selectedStation, setSelectedStation] = useState<'all' | IngredientStation>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [showAdjustmentsDrawer, setShowAdjustmentsDrawer] = useState(false);
  const [weightsDialogOpen, setWeightsDialogOpen] = useState(false);
  const [draftWeights, setDraftWeights] = useState<
    Record<string, { beforeGrams: string; afterGrams: string }>
  >({});

  // Sync scope when user changes the top brand dropdown on Kitchen page
  useEffect(() => {
    setActiveScope(selectedBrandFilter);
  }, [selectedBrandFilter]);

  const activeSummary: BrandIngredientsSummary = useMemo(() => {
    if (activeScope === 'all') return report.combined;
    return report.byBrand[activeScope] ?? report.combined;
  }, [activeScope, report]);

  const showPerBrandColumns = activeScope === 'all' && report.brands.length > 1;

  const filteredItems = useMemo(() => {
    const q = compactWhitespace(searchQuery).toLowerCase();
    return activeSummary.items.filter((item) => {
      if (selectedStation !== 'all' && item.station !== selectedStation) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        INGREDIENT_STATION_LABELS[item.station].toLowerCase().includes(q) ||
        item.meals.some((m) => m.mealLabel.toLowerCase().includes(q))
      );
    });
  }, [activeSummary.items, searchQuery, selectedStation]);

  const activeIngredientsWithPositivePortions = useMemo(
    () => filteredItems.filter((item) => item.portionCount > 0),
    [filteredItems],
  );

  const fullyExcludedItems = useMemo(
    () => filteredItems.filter((item) => item.portionCount === 0 && item.removedPortionCount > 0),
    [filteredItems],
  );

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const openWeightsDialog = () => {
    const initial: Record<string, { beforeGrams: string; afterGrams: string }> = {};
    for (const item of report.combined.items) {
      const override = customPortionWeights[item.key];
      initial[item.key] = {
        beforeGrams: String(override?.beforeGrams ?? item.unitBeforeGrams),
        afterGrams: String(override?.afterGrams ?? item.unitAfterGrams),
      };
    }
    setDraftWeights(initial);
    setWeightsDialogOpen(true);
  };

  const handleSaveWeights = () => {
    const next: CustomPortionWeightsMap = { ...customPortionWeights };
    for (const [key, val] of Object.entries(draftWeights)) {
      const before = Number(val.beforeGrams);
      const after = Number(val.afterGrams);
      if (Number.isFinite(before) && before > 0 && Number.isFinite(after) && after > 0) {
        next[key] = { beforeGrams: Math.round(before), afterGrams: Math.round(after) };
      }
    }
    onSaveCustomPortionWeights(next);
    setWeightsDialogOpen(false);
    toast.success('تم حفظ أوزان الحصة القياسية وإعادة حساب خامات المطبخ فوراً');
  };

  const handleResetWeights = () => {
    onSaveCustomPortionWeights({});
    setWeightsDialogOpen(false);
    toast.success('تمت استعادة الأوزان الافتراضية للمكونات');
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const buildSheetRows = (summary: BrandIngredientsSummary, includeBrands: boolean) =>
        summary.items.map((item) => {
          const baseRow: Record<string, string | number> = {
            'القسم': INGREDIENT_STATION_LABELS[item.station],
            'اسم المكون': item.name,
            'الأوردرات / الحصص الصافية': item.portionCount,
            'الحصص الأساسية قبل الملاحظات': item.basePortionCount,
            'حصص مستبعدة بالملاحظات': item.removedPortionCount,
            'حصص مضافة بالاستبدال': item.addedBySubstitutionCount,
          };

          if (includeBrands) {
            for (const b of report.brands) {
              const split = item.byBrand[b.id];
              baseRow[`${b.name} (حصص)`] = split?.portionCount ?? 0;
              baseRow[`${b.name} قبل التسوية (جم)`] = split?.weightBeforeGrams ?? 0;
              baseRow[`${b.name} بعد التسوية (جم)`] = split?.weightAfterGrams ?? 0;
            }
          }

          baseRow['الإجمالي قبل التسوية (جم)'] = item.weightBeforeGrams;
          baseRow['الإجمالي قبل التسوية (كجم)'] = Number((item.weightBeforeGrams / 1000).toFixed(3));
          baseRow['الإجمالي بعد التسوية (جم)'] = item.weightAfterGrams;
          baseRow['الإجمالي بعد التسوية (كجم)'] = Number((item.weightAfterGrams / 1000).toFixed(3));
          return baseRow;
        });

      const combinedWs = XLSX.utils.json_to_sheet(
        buildSheetRows(report.combined, report.brands.length > 1),
      );
      XLSX.utils.book_append_sheet(wb, combinedWs, 'مجمع كل الشركات');

      for (const brand of report.brands) {
        const bSummary = report.byBrand[brand.id];
        if (!bSummary || bSummary.items.length === 0) continue;
        const safeSheetName = brand.name.replace(/[\\/?*[\]:]/g, '').slice(0, 28) || 'شركة';
        const ws = XLSX.utils.json_to_sheet(buildSheetRows(bSummary, false));
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      }

      if (report.combined.adjustments.length > 0) {
        const adjRows = report.combined.adjustments.map((adj) => ({
          'الشركة': adj.brandName,
          'رقم الطلب': adj.orderNumber,
          'العميل': adj.customerName,
          'الوجبة': adj.mealLabel,
          'التعديل المنفذ': adj.summary,
          'نص ملاحظة العميل': adj.rawInstruction,
        }));
        const adjWs = XLSX.utils.json_to_sheet(adjRows);
        XLSX.utils.book_append_sheet(wb, adjWs, 'التعديلات الذكية');
      }

      XLSX.writeFile(wb, `kitchen-ingredients-${report.date}.xlsx`);
      toast.success('تم تصدير شيت حساب المكونات (مجمع + لكل شركة) بنجاح');
    } catch (err) {
      console.error(err);
      toast.error('تعذر تصدير ملف Excel');
    }
  };

  if (report.combined.cookedMealCount === 0 && report.combined.items.length === 0) {
    return null;
  }

  const totalBeforeFmt = formatKitchenWeight(activeSummary.totalWeightBeforeGrams);
  const totalAfterFmt = formatKitchenWeight(activeSummary.totalWeightAfterGrams);

  const renderIngredientRow = (item: AggregatedIngredientItem) => {
    const isExpanded = Boolean(expandedKeys[item.key]);
    const beforeFmt = formatKitchenWeight(item.weightBeforeGrams);
    const afterFmt = formatKitchenWeight(item.weightAfterGrams);
    const hasNetModification =
      item.removedPortionCount > 0 ||
      item.addedBySubstitutionCount > 0 ||
      item.extraPortionCount > 0;

    return (
      <Fragment key={item.key}>
        <tr
          className={cn(
            'border-b border-slate-100 transition-colors hover:bg-slate-50/80 cursor-pointer',
            isExpanded && 'bg-emerald-50/30',
          )}
          onClick={() => toggleExpand(item.key)}
        >
          <td className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-900">{item.name}</span>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                  STATION_BADGE_STYLES[item.station],
                )}
              >
                {INGREDIENT_STATION_LABELS[item.station]}
              </span>
              {item.removedPortionCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-700 tabular-nums">
                  <MinusCircle className="h-3 w-3" />
                  -{item.removedPortionCount} مستبعد
                </span>
              )}
              {item.addedBySubstitutionCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-semibold text-sky-700 tabular-nums">
                  <ArrowLeftRight className="h-3 w-3" />
                  +{item.addedBySubstitutionCount} بديل
                </span>
              )}
              {item.extraPortionCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[10px] font-semibold text-violet-700 tabular-nums">
                  <PlusCircle className="h-3 w-3" />
                  +{item.extraPortionCount} إضافي
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
              معيار الحصة: {item.unitBeforeGrams} جم قبل ← {item.unitAfterGrams} جم بعد
              {hasNetModification && ` · الأساسي قبل الملاحظات: ${item.basePortionCount} حصة`}
            </p>
          </td>

          <td className="px-4 py-3 text-center">
            <span className="inline-flex items-center justify-center rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white tabular-nums">
              {item.portionCount.toLocaleString('en-US')} أوردر
            </span>
            <span className="mt-1 block text-[10px] text-slate-400 tabular-nums">
              في {item.orderCount.toLocaleString('en-US')} طلب عميل
            </span>
          </td>

          {showPerBrandColumns &&
            report.brands.map((brand) => {
              const split = item.byBrand[brand.id];
              if (!split || split.portionCount === 0) {
                return (
                  <td key={brand.id} className="px-3 py-3 text-center text-xs text-slate-300 tabular-nums">
                    —
                  </td>
                );
              }
              return (
                <td key={brand.id} className="px-3 py-3 text-center tabular-nums">
                  <div className="text-xs font-bold text-slate-800">
                    {split.portionCount.toLocaleString('en-US')} حصة
                  </div>
                  <div className="text-[10px] text-amber-700 font-medium">
                    قبل: {formatKitchenWeight(split.weightBeforeGrams).primary}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-medium">
                    بعد: {formatKitchenWeight(split.weightAfterGrams).primary}
                  </div>
                </td>
              );
            })}

          <td className="px-4 py-3 text-center tabular-nums bg-amber-50/35">
            <div className="text-sm font-extrabold text-amber-900">{beforeFmt.primary}</div>
            {beforeFmt.secondary && (
              <div className="text-[11px] text-amber-700/80">{beforeFmt.secondary}</div>
            )}
          </td>

          <td className="px-4 py-3 text-center tabular-nums bg-emerald-50/35">
            <div className="text-sm font-extrabold text-emerald-800">{afterFmt.primary}</div>
            {afterFmt.secondary && (
              <div className="text-[11px] text-emerald-700/80">{afterFmt.secondary}</div>
            )}
          </td>

          <td className="px-3 py-3 text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 rounded-full"
              aria-label={`تفاصيل ${item.name}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(item.key);
              }}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-slate-600" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </Button>
          </td>
        </tr>

        {isExpanded && (
          <tr className="border-b border-slate-200 bg-slate-50/70">
            <td colSpan={showPerBrandColumns ? 5 + report.brands.length : 5} className="p-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
                  <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <UtensilsCrossed className="h-3.5 w-3.5 text-emerald-600" />
                    الوجبات الداخلة في حساب «{item.name}» ({item.meals.length} صنف)
                  </h4>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {item.meals.map((m) => (
                      <div
                        key={m.mealKey}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {describeMealCategoryLabel(m.category)}
                          </Badge>
                          <span className="font-semibold text-slate-800 truncate">{m.mealLabel}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 tabular-nums text-[11px]">
                          <span className="font-bold text-slate-900">{m.portionCount} حصة</span>
                          <span className="text-amber-700">
                            ({formatKitchenWeight(m.weightBeforeGrams).primary}
                          </span>
                          <span className="text-slate-400">←</span>
                          <span className="text-emerald-700">
                            {formatKitchenWeight(m.weightAfterGrams).primary})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
                  <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Sparkles className="h-3.5 w-3.5 text-sky-600" />
                    تعديلات العملاء الذكية على «{item.name}» ({item.adjustments.length})
                  </h4>
                  {item.adjustments.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      لا توجد ملاحظات استبعاد أو استبدال من العملاء على هذا المكون في هذا النطاق.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {item.adjustments.map((adj) => (
                        <div
                          key={`${item.key}-${adj.id}`}
                          className="rounded-lg border border-sky-100 bg-sky-50/40 px-2.5 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-800">{adj.summary}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {adj.brandName}
                            </Badge>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-600">
                            العميل: {adj.customerName} ({adj.orderNumber}) · الملاحظة: «{adj.rawInstruction}»
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <>
      <Card className="overflow-hidden border-emerald-200/90 shadow-sm print:hidden">
        <CardHeader className="space-y-4 border-b border-slate-100 bg-gradient-to-l from-emerald-50/60 via-white to-amber-50/40 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                  <Scale className="h-4 w-4 text-emerald-600" />
                  حاسبة مكونات وخامات المطبخ الذكية
                </CardTitle>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 border border-emerald-300/70 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                  <Sparkles className="h-3 w-3 text-emerald-700" />
                  تحليل ذكي للاستبعاد والاستبدال
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                تجميع تلقائي للمكونات المشتركة (مثل الأرز، البطاطس، الخضار، البروتين) بأوزان ما قبل وما بعد التسوية لكل صفحة ومجمعة لكل الشركات — مع خصم واستبدال ملاحظات العملاء تلقائياً.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg gap-1.5 text-xs font-semibold"
                onClick={openWeightsDialog}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span>أوزان الحصة القياسية</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg gap-1.5 text-xs font-semibold"
                onClick={() => void handleExportExcel()}
              >
                <Download className="h-3.5 w-3.5" />
                <span>تصدير Excel</span>
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-lg gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                onClick={() => onPrintIngredients(activeScope)}
              >
                <Printer className="h-3.5 w-3.5" />
                <span>طباعة كشف المكونات ({dateLabel})</span>
              </Button>
            </div>
          </div>

          {/* Scope Tabs: Combined All Companies vs Per-Brand / Per-Page */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-slate-500" />
              نطاق الحسبة:
            </span>
            <button
              type="button"
              onClick={() => setActiveScope('all')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-all cursor-pointer',
                activeScope === 'all'
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              <span>مجمع كل الشركات</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.2 text-[10px] tabular-nums',
                  activeScope === 'all' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600',
                )}
              >
                {report.combined.cookedMealCount} وجبة
              </span>
            </button>

            {report.brands.map((brand) => {
              const active = activeScope === brand.id;
              return (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => setActiveScope(brand.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-all cursor-pointer',
                    active
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <span>{brand.name}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.2 text-[10px] tabular-nums',
                      active ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {brand.cookedMealCount} وجبة
                  </span>
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-4 sm:p-5">
          {/* KPI Mini Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
                <span>إجمالي الوزن قبل التسوية (خام)</span>
                <Scale className="h-4 w-4 text-amber-600" />
              </div>
              <p className="mt-1.5 text-xl font-extrabold text-amber-950 tabular-nums">
                {totalBeforeFmt.primary}
              </p>
              {totalBeforeFmt.secondary && (
                <p className="text-[11px] text-amber-800/80 tabular-nums">{totalBeforeFmt.secondary}</p>
              )}
            </div>

            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
                <span>إجمالي الوزن بعد التسوية (صافي)</span>
                <Flame className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-1.5 text-xl font-extrabold text-emerald-950 tabular-nums">
                {totalAfterFmt.primary}
              </p>
              {totalAfterFmt.secondary && (
                <p className="text-[11px] text-emerald-800/80 tabular-nums">{totalAfterFmt.secondary}</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>الأصناف والخامات النشطة</span>
                <UtensilsCrossed className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-1.5 text-xl font-extrabold text-slate-900 tabular-nums">
                {activeSummary.items.filter((i) => i.portionCount > 0).length} مكون
              </p>
              <p className="text-[11px] text-slate-500 tabular-nums">
                من إجمالي {activeSummary.cookedMealCount} وجبة مستوية
                {activeSummary.frozenExcludedMealCount > 0 &&
                  ` (تم عزل ${activeSummary.frozenExcludedMealCount} فروزن)`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAdjustmentsDrawer((v) => !v)}
              className="rounded-xl border border-sky-200/90 bg-sky-50/50 p-3.5 text-right transition-colors hover:bg-sky-100/50 cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-sky-900">
                <span>تعديلات الملاحظات الذكية</span>
                <Sparkles className="h-4 w-4 text-sky-600" />
              </div>
              <p className="mt-1.5 text-xl font-extrabold text-sky-950 tabular-nums">
                {activeSummary.adjustments.length} تعديل تلقائي
              </p>
              <p className="text-[11px] text-sky-700 underline">
                {activeSummary.adjustments.length > 0
                  ? showAdjustmentsDrawer
                    ? 'إخفاء سجل الاستبعاد والاستبدال'
                    : 'اضغط لمراجعة سجل الاستبعاد والاستبدال'
                  : 'مفعل تلقائياً على ملاحظات العملاء'}
              </p>
            </button>
          </div>

          {/* Expandable Smart Adjustments Audit Log */}
          {showAdjustmentsDrawer && activeSummary.adjustments.length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-sky-950 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-sky-600" />
                  سجل التعديلات الذكية المنفذة على حسابات المكونات ({activeSummary.adjustments.length})
                </h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-sky-800"
                  onClick={() => setShowAdjustmentsDrawer(false)}
                >
                  إغلاق
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 max-h-60 overflow-y-auto">
                {activeSummary.adjustments.map((adj) => (
                  <div
                    key={adj.id}
                    className="rounded-lg border border-sky-200/70 bg-white p-2.5 text-xs shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{adj.summary}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {adj.brandName}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {adj.customerName} ({adj.orderNumber}) · النص: «{adj.rawInstruction}»
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={selectedStation === 'all' ? 'default' : 'outline'}
                className="h-8 rounded-lg text-xs"
                onClick={() => setSelectedStation('all')}
              >
                كل الأقسام ({activeSummary.items.filter((i) => i.portionCount > 0).length})
              </Button>
              {INGREDIENT_STATION_ORDER.map((station) => {
                const count = activeSummary.items.filter(
                  (i) => i.station === station && i.portionCount > 0,
                ).length;
                if (count === 0) return null;
                return (
                  <Button
                    key={station}
                    type="button"
                    size="sm"
                    variant={selectedStation === station ? 'default' : 'outline'}
                    className="h-8 rounded-lg text-xs"
                    onClick={() => setSelectedStation(station)}
                  >
                    {INGREDIENT_STATION_LABELS[station]} ({count})
                  </Button>
                );
              })}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن أرز، بطاطس، استيك..."
                className="h-8 pr-8 text-xs"
              />
            </div>
          </div>

          {/* Main Ingredients Calculation Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full min-w-[700px] border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <th className="px-4 py-3 font-bold">المكون / الخامة المشتركة</th>
                  <th className="px-4 py-3 text-center font-bold">المطلوب (أوردر / حصة)</th>
                  {showPerBrandColumns &&
                    report.brands.map((brand) => (
                      <th key={brand.id} className="px-3 py-3 text-center font-bold text-slate-700">
                        {brand.name}
                      </th>
                    ))}
                  <th className="px-4 py-3 text-center font-bold bg-amber-50/70 text-amber-950">
                    الوزن قبل التسوية (خام)
                  </th>
                  <th className="px-4 py-3 text-center font-bold bg-emerald-50/70 text-emerald-950">
                    الوزن بعد التسوية (صافي)
                  </th>
                  <th className="px-3 py-3 text-center font-bold w-12">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {activeIngredientsWithPositivePortions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={showPerBrandColumns ? 5 + report.brands.length : 5}
                      className="px-4 py-8 text-center text-xs text-slate-500"
                    >
                      لا توجد مكونات مطابقة للبحث الحالي في هذا النطاق.
                    </td>
                  </tr>
                ) : (
                  activeIngredientsWithPositivePortions.map(renderIngredientRow)
                )}

                {fullyExcludedItems.length > 0 && (
                  <>
                    <tr className="bg-rose-50/50 border-t border-rose-200/60">
                      <td
                        colSpan={showPerBrandColumns ? 5 + report.brands.length : 5}
                        className="px-4 py-2 text-[11px] font-bold text-rose-800"
                      >
                        مكونات تم استبعادها بالكامل بناءً على ملاحظات العملاء (صافي المطلوب = 0):
                      </td>
                    </tr>
                    {fullyExcludedItems.map(renderIngredientRow)}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog to customize standard pre/post cooking portion weights */}
      <Dialog open={weightsDialogOpen} onOpenChange={setWeightsDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>ضبط معيار أوزان الحصة الواحدة (قبل وبعد التسوية)</DialogTitle>
            <DialogDescription className="text-xs">
              تُستخدم هذه الأوزان تلقائياً لأي وجبة لم يُسجّل لها وزن خاص داخل شاشة المنيو وكذلك عند استبدال مكون بآخر في ملاحظات العميل.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {report.combined.items.map((item) => {
              const draft = draftWeights[item.key] ?? {
                beforeGrams: String(item.unitBeforeGrams),
                afterGrams: String(item.unitAfterGrams),
              };
              return (
                <div
                  key={item.key}
                  className="grid grid-cols-[1fr_110px_110px] items-center gap-3 rounded-lg border border-slate-200/80 p-2.5"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-900">{item.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {INGREDIENT_STATION_LABELS[item.station]}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-amber-800">قبل التسوية (جم)</Label>
                    <Input
                      type="number"
                      min="1"
                      className="h-8 text-xs tabular-nums"
                      value={draft.beforeGrams}
                      onChange={(e) =>
                        setDraftWeights((prev) => ({
                          ...prev,
                          [item.key]: { ...draft, beforeGrams: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-emerald-800">بعد التسوية (جم)</Label>
                    <Input
                      type="number"
                      min="1"
                      className="h-8 text-xs tabular-nums"
                      value={draft.afterGrams}
                      onChange={(e) =>
                        setDraftWeights((prev) => ({
                          ...prev,
                          [item.key]: { ...draft, afterGrams: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex flex-wrap items-center justify-between gap-2 sm:justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={handleResetWeights}>
              استعادة الافتراضي
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setWeightsDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSaveWeights}
              >
                حفظ وإعادة الحساب
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
