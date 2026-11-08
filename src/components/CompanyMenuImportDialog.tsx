import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { compactWhitespace } from '@/lib/utils';
import { MenuCompanyCategory, MenuCompanyMeal, MenuIngredient } from '@/types/companyMenu';

type ExcelRow = Record<string, unknown>;

type Props = {
  companyId: string;
  categories: MenuCompanyCategory[];
  ingredients: MenuIngredient[];
  meals: MenuCompanyMeal[];
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

export default function CompanyMenuImportDialog({ companyId, categories, ingredients, meals, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [workbook, setWorkbook] = useState<{ sheets: string[]; rowsBySheet: Record<string, ExcelRow[]> } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: string[] } | null>(null);

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

    const categoryCache = new Map(categories.map(category => [normalizeName(category.name), category.id]));
    const categoryOrderCounter = new Map(categories.map(category => [category.id, meals.filter(meal => meal.category_id === category.id).length]));
    const ingredientCache = new Map(ingredients.map(ingredient => [normalizeName(ingredient.name), ingredient.id]));
    const mealCache = new Map(meals.map(meal => [`${meal.category_id}::${normalizeName(meal.name)}`, meal.id]));

    const getOrCreateCategory = async (rawName: string) => {
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

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const name = text(cell(row, aliases.name));
        if (!name) {
          skipped.push(`${sheetName} / صف ${rowNumber}: لا يوجد اسم وجبة`);
          continue;
        }

        try {
          const categoryName = text(cell(row, aliases.category)) || sheetName;
          const categoryId = await getOrCreateCategory(categoryName);

          const ingredientNames = listValue(cell(row, aliases.ingredients));
          const ingredientIds: string[] = [];
          for (const ingredientName of ingredientNames) {
            ingredientIds.push(await getOrCreateIngredient(ingredientName));
          }

          const payload = {
            name,
            description: text(cell(row, aliases.description)),
            price: numberOrNull(cell(row, aliases.price)),
            calories: numberOrNull(cell(row, aliases.calories)),
            protein: numberOrNull(cell(row, aliases.protein)),
            carbs: numberOrNull(cell(row, aliases.carbs)),
            fat: numberOrNull(cell(row, aliases.fat)),
            fiber: numberOrNull(cell(row, aliases.fiber)),
          };

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
          if (ingredientIds.length > 0) {
            const { error } = await supabase.from('menu_meal_ingredients').insert(ingredientIds.map((ingredientId, ingredientIndex) => ({ meal_id: mealId, ingredient_id: ingredientId, display_order: ingredientIndex })));
            if (error) throw new Error(error.message);
          }

          imported += 1;
        } catch (error) {
          skipped.push(`${sheetName} / صف ${rowNumber}: ${error instanceof Error ? error.message : 'تعذر حفظ الوجبة'}`);
        }
      }
    }

    setResult({ imported, skipped });
    setImporting(false);
    onImported();
    if (imported > 0) toast.success(`تم استيراد ${imported} وجبة من ${workbook.sheets.length} ورقة`);
  };

  return (
    <Dialog open={open} onOpenChange={nextOpen => { setOpen(nextOpen); if (!nextOpen) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><FileSpreadsheet className="h-4 w-4" />استيراد وجبات من Excel</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>استيراد وجبات هذه الشركة من Excel</DialogTitle>
          <DialogDescription>
            ارفع ملفًا يحتوي على ورقة واحدة أو أكثر. يتم التعرف تلقائيًا على أعمدة الاسم والوصف والسعر والمكونات والقيم الغذائية بغض النظر عن ترتيبها في كل ورقة، وتُستخدم الفئة من عمود الفئة إن وُجد وإلا اسم الورقة نفسها.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Input type="file" accept=".xlsx,.xls,.csv" onChange={event => void handleFile(event.target.files?.[0])} />
          {workbook && <Badge variant="secondary" className="w-fit">{fileName} · {workbook.sheets.length} ورقة · {workbook.sheets.reduce((sum, sheet) => sum + (workbook.rowsBySheet[sheet]?.length ?? 0), 0)} صف</Badge>}
        </div>

        {result && (
          <div className="grid gap-2 rounded-lg border p-3 text-sm">
            <div className="flex items-center gap-2 text-green-700"><CheckCircle2 className="h-4 w-4" />تم حفظ {result.imported} وجبة.</div>
            {result.skipped.length > 0 && (
              <div className="text-destructive">
                <div className="mb-1 flex items-center gap-2"><AlertCircle className="h-4 w-4" />تم تجاهل {result.skipped.length} صف:</div>
                <ul className="max-h-32 list-disc overflow-y-auto pr-5">{result.skipped.map(reason => <li key={reason}>{reason}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إغلاق</Button>
          <Button onClick={() => void runImport()} disabled={!workbook || importing} className="gap-2">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            تأكيد الاستيراد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
