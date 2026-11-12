import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import { parseImportedIngredientsList } from '@/lib/menuHub';
import { compactWhitespace } from '@/lib/utils';
import { MenuCompanyCategory, MenuCompanyMeal, MenuIngredient } from '@/types/companyMenu';
import { mapCustomCategoryToMenuCategory, Meal } from '@/types/menu';

type ExcelRow = Record<string, unknown>;

type Props = {
  companyId?: string | null;
  brandId?: string | null;
  categories: MenuCompanyCategory[];
  ingredients: MenuIngredient[];
  meals: MenuCompanyMeal[];
  catalogMeals?: Meal[];
  onImported: () => void;
};

const aliases = {
  name: ['اسم الوجبة', 'الاسم', 'اسم', 'name', 'meal name', 'meal', 'item'],
  description: ['الوصف', 'وصف', 'description', 'desc'],
  category: ['الفئة', 'التصنيف', 'القسم', 'category', 'section', 'type'],
  price: ['السعر', 'سعر', 'price', 'cost'],
  calories: ['السعرات', 'سعرات', 'كالوريز', 'الكالوريز', 'calories', 'kcal', 'cal'],
  protein: ['بروتين', 'البروتين', 'protein'],
  carbs: ['كارب', 'كربوهيدرات', 'الكربوهيدرات', 'carbs', 'carbohydrates'],
  fat: ['دهون', 'الدهون', 'fat', 'fats'],
  fiber: ['الياف', 'ألياف', 'الألياف', 'fiber'],
  ingredients: ['المكونات', 'مكونات', 'ingredients', 'components'],
  daysCount: ['عدد الأيام', 'الأيام', 'أيام', 'days', 'days_count'],
  packageMeals: ['وجبات الباقة', 'الأصناف', 'package meals', 'meals', 'items'],
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

function normalizeName(value: string) {
  return compactWhitespace(value).toLowerCase();
}

function cell(row: ExcelRow, keys: string[]) {
  const entries = Object.entries(row);
  const match = entries.find(([key]) => keys.some(alias => normalizeHeader(key) === normalizeHeader(alias)));
  return match?.[1];
}

function text(value: unknown) {
  return value === null || value === undefined ? '' : compactWhitespace(String(value));
}

function numberOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function listValue(value: unknown) {
  return text(value).split(/[,،|;\n]/).map(item => compactWhitespace(item)).filter(Boolean);
}

export default function CompanyMenuImportDialog({
  companyId,
  brandId,
  categories,
  ingredients,
  meals,
  catalogMeals = [],
  onImported,
}: Props) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [workbook, setWorkbook] = useState<{ sheets: string[]; rowsBySheet: Record<string, ExcelRow[]> } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; packagesImported: number; skipped: string[] } | null>(null);

  const reset = () => {
    setWorkbook(null);
    setFileName('');
    setResult(null);
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const parsed = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const rowsBySheet = Object.fromEntries(parsed.SheetNames.map(name => [name, XLSX.utils.sheet_to_json<ExcelRow>(parsed.Sheets[name], { defval: '' })]));
      setWorkbook({ sheets: parsed.SheetNames, rowsBySheet });
      setFileName(file.name);
      setResult(null);
    } catch {
      toast.error('تعذر قراءة ملف Excel. تأكد أنه بصيغة xlsx أو xls.');
    }
  };

  const runImport = async () => {
    if (!workbook) return;

    setImporting(true);
    const skipped: string[] = [];
    let imported = 0;
    let packagesImported = 0;
    const loose = asSupabaseLooseClient(supabase);

    const categoryCache = new Map(categories.map(category => [normalizeName(category.name), category.id]));
    const categoryOrderCounter = new Map(categories.map(category => [category.id, meals.filter(meal => meal.category_id === category.id).length]));
    const ingredientCache = new Map(ingredients.map(ingredient => [normalizeName(ingredient.name), ingredient.id]));
    const mealCache = new Map(meals.map(meal => [`${meal.category_id}::${normalizeName(meal.name)}`, meal.id]));
    const catalogMealIdByName = new Map(
      catalogMeals.filter((m) => m.brand_id === brandId).map((m) => [normalizeName(m.name), m.id]),
    );

    const getOrCreateCategory = async (rawName: string) => {
      if (!companyId) return null;
      const key = normalizeName(rawName);
      const existing = categoryCache.get(key);
      if (existing) return existing;
      const { data, error } = await supabase.from('menu_company_categories').insert({ company_id: companyId, name: rawName, display_order: categoryCache.size }).select('id').single();
      if (error || !data) throw new Error(error?.message || 'تعذر إنشاء الفئة');
      categoryCache.set(key, data.id);
      categoryOrderCounter.set(data.id, 0);
      return data.id;
    };

    const getOrCreateIngredient = async (rawName: string) => {
      if (!companyId) return null;
      const key = normalizeName(rawName);
      const existing = ingredientCache.get(key);
      if (existing) return existing;
      const { data, error } = await supabase.from('menu_ingredients').insert({ company_id: companyId, name: rawName }).select('id').single();
      if (error || !data) throw new Error(error?.message || 'تعذر إنشاء المكوّن');
      ingredientCache.set(key, data.id);
      return data.id;
    };

    for (const sheetName of workbook.sheets) {
      const rows = workbook.rowsBySheet[sheetName] ?? [];
      const isPackageSheet = /(باقات|باقة|packages?|plans?)/iu.test(sheetName);

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const name = text(cell(row, ['اسم الباقة', ...aliases.name]));
        if (!name) {
          skipped.push(`${sheetName} / صف ${rowNumber}: لا يوجد اسم`);
          continue;
        }

        // Package row handling if on a Packages sheet or days_count is specified
        const daysVal = numberOrNull(cell(row, aliases.daysCount));
        if ((isPackageSheet || (daysVal !== null && daysVal > 0)) && brandId) {
          try {
            const daysCount = Math.max(1, Math.round(daysVal ?? 5));
            const pkgPrice = numberOrNull(cell(row, aliases.price)) ?? 0;
            const rawMealNames = listValue(cell(row, aliases.packageMeals));

            const pkgRes = await supabase
              .from('package_plans')
              .upsert({ brand_id: brandId, name, days_count: daysCount, price: pkgPrice }, { onConflict: 'brand_id,name' })
              .select('id')
              .single();
            if (pkgRes.error || !pkgRes.data) throw new Error(pkgRes.error?.message || 'تعذر حفظ الباقة');

            await supabase.from('package_plan_items').delete().eq('package_plan_id', pkgRes.data.id);
            if (rawMealNames.length > 0) {
              const pkgItems = rawMealNames.map((mName, idx) => {
                const matchedId = catalogMealIdByName.get(normalizeName(mName));
                return matchedId
                  ? { package_plan_id: pkgRes.data.id, menu_item_id: matchedId, custom_meal_name: null, display_order: idx }
                  : { package_plan_id: pkgRes.data.id, menu_item_id: null, custom_meal_name: mName, display_order: idx };
              });
              await supabase.from('package_plan_items').insert(pkgItems);
            }
            packagesImported += 1;
            continue;
          } catch (error) {
            skipped.push(`${sheetName} / صف ${rowNumber}: ${error instanceof Error ? error.message : 'تعذر حفظ الباقة'}`);
            continue;
          }
        }

        try {
          const categoryName = text(cell(row, aliases.category)) || sheetName;
          const parsedIngredients = parseImportedIngredientsList(text(cell(row, aliases.ingredients)));

          const description = text(cell(row, aliases.description));
          const price = numberOrNull(cell(row, aliases.price));
          const calories = numberOrNull(cell(row, aliases.calories));
          const protein = numberOrNull(cell(row, aliases.protein));
          const carbs = numberOrNull(cell(row, aliases.carbs));
          const fat = numberOrNull(cell(row, aliases.fat));
          const fiber = numberOrNull(cell(row, aliases.fiber));

          // 1. Sync into company menu tables if companyId exists
          if (companyId) {
            const categoryId = await getOrCreateCategory(categoryName);
            if (categoryId) {
              const linkedRows: Array<{ ingredient_id: string; weight_before_grams: number | null; weight_after_grams: number | null }> = [];
              for (const ing of parsedIngredients) {
                const ingId = await getOrCreateIngredient(ing.name);
                if (ingId) {
                  linkedRows.push({
                    ingredient_id: ingId,
                    weight_before_grams: ing.weight_before_grams,
                    weight_after_grams: ing.weight_after_grams,
                  });
                }
              }

              const payload = { name, description, price, calories, protein, carbs, fat, fiber };
              const mealKey = `${categoryId}::${normalizeName(name)}`;
              const existingMealId = mealCache.get(mealKey);
              let mealId = existingMealId;

              if (existingMealId) {
                const { error } = await supabase.from('menu_company_meals').update(payload).eq('id', existingMealId);
                if (error) throw new Error(error.message);
              } else {
                const displayOrder = categoryOrderCounter.get(categoryId) ?? 0;
                const { data, error } = await supabase.from('menu_company_meals').insert({ ...payload, company_id: companyId, category_id: categoryId, display_order: displayOrder }).select('id').single();
                if (error || !data) throw new Error(error?.message || 'تعذر إنشاء الوجبة');
                mealId = data.id;
                mealCache.set(mealKey, mealId);
                categoryOrderCounter.set(categoryId, displayOrder + 1);
              }

              await supabase.from('menu_meal_ingredients').delete().eq('meal_id', mealId);
              if (linkedRows.length > 0) {
                const { error } = await supabase.from('menu_meal_ingredients').insert(
                  linkedRows.map((lr, ingredientIndex) => ({
                    meal_id: mealId!,
                    ingredient_id: lr.ingredient_id,
                    weight_before_grams: lr.weight_before_grams,
                    weight_after_grams: lr.weight_after_grams,
                    display_order: ingredientIndex,
                  })),
                );
                if (error) throw new Error(error.message);
              }
            }
          }

          // 2. Sync into operational menu_items catalog so Orders, Packages & Kitchen immediately see it
          if (brandId) {
            const stdCat = mapCustomCategoryToMenuCategory(categoryName, name);
            const baseCatalogItem = {
              brand_id: brandId,
              name,
              category: stdCat,
              price,
              calories: Math.round(calories ?? 0),
              protein: Math.round(protein ?? 0),
              carbs: Math.round(carbs ?? 0),
              fat: Math.round(fat ?? 0),
            };
            const extCatalogItem: Record<string, unknown> = {
              ...baseCatalogItem,
              description,
              fiber,
              custom_category: categoryName,
              ingredients_snapshot: parsedIngredients,
            };

            let catRes = await loose
              .from('menu_items')
              .upsert(extCatalogItem, { onConflict: 'brand_id,name' })
              .select('id')
              .single();

            if (catRes.error && /(column|schema cache)/i.test(catRes.error.message ?? '')) {
              catRes = await loose
                .from('menu_items')
                .upsert(baseCatalogItem, { onConflict: 'brand_id,name' })
                .select('id')
                .single();
            }

            if (!catRes.error && catRes.data && typeof (catRes.data as { id?: string }).id === 'string') {
              catalogMealIdByName.set(normalizeName(name), (catRes.data as { id: string }).id);
            }
          }

          imported += 1;
        } catch (error) {
          skipped.push(`${sheetName} / صف ${rowNumber}: ${error instanceof Error ? error.message : 'تعذر حفظ الوجبة'}`);
        }
      }
    }

    setResult({ imported, packagesImported, skipped });
    setImporting(false);
    onImported();
    if (imported > 0 || packagesImported > 0) {
      toast.success(
        `تم استيراد ${imported.toLocaleString('en-US')} وجبة${packagesImported > 0 ? ` و ${packagesImported.toLocaleString('en-US')} باقة` : ''} بنجاح`,
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={nextOpen => { setOpen(nextOpen); if (!nextOpen) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg text-xs font-semibold">
          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
          <span>استيراد Excel</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>استيراد شامل للمنيو والمكونات والباقات من Excel</DialogTitle>
          <DialogDescription>
            ارفع ملف Excel متعدد الأوراق؛ يتم استيراد الوجبات والقيم الغذائية وأوزان المكونات مثلاً <code className="text-xs">شرائح دجاج (200-&gt;125)</code> والباقات ومزامنتها تلقائيًا مع شاشة الطلبات والمطبخ.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Input type="file" accept=".xlsx,.xls,.csv" onChange={event => void handleFile(event.target.files?.[0])} />
          {workbook && (
            <Badge variant="secondary" className="w-fit tabular-nums">
              {fileName} · {workbook.sheets.length} ورقة · {workbook.sheets.reduce((sum, sheet) => sum + (workbook.rowsBySheet[sheet]?.length ?? 0), 0)} صف
            </Badge>
          )}
        </div>

        {result && (
          <div className="grid gap-2 rounded-xl border border-slate-200 p-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold tabular-nums">
              <CheckCircle2 className="h-4 w-4" />
              تم حفظ {result.imported.toLocaleString('en-US')} وجبة
              {result.packagesImported > 0 ? ` و ${result.packagesImported.toLocaleString('en-US')} باقة` : ''}.
            </div>
            {result.skipped.length > 0 && (
              <div className="text-rose-600">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4" />تم تجاهل {result.skipped.length.toLocaleString('en-US')} صف:
                </div>
                <ul className="max-h-32 list-disc overflow-y-auto pr-5 space-y-0.5">
                  {result.skipped.map(reason => <li key={reason}>{reason}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إغلاق</Button>
          <Button onClick={() => void runImport()} disabled={!workbook || importing} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            تأكيد الاستيراد والمزامنة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
