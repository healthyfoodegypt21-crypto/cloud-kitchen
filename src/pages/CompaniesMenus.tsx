import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { hasPageAccess } from '@/lib/permissions';
import { useCompanyMenus } from '@/hooks/useCompanyMenus';
import CompanyMenuImportDialog from '@/components/CompanyMenuImportDialog';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { MenuCompany, MenuCompanyMeal, MenuCompanyMealInput, MenuMealIngredientLink } from '@/types/companyMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Search, ArrowRight, Pencil, Trash2, Copy, ArrowUp, ArrowDown, Building2, X } from 'lucide-react';

// Ingredient names considered a "protein" component, used to auto-suggest the
// standard 200g/125g before/after-cooking weight for single-protein meals.
const PROTEIN_INGREDIENT_NAMES = new Set([
  'شرائح دجاج', 'مكعبات دجاج', 'صدور دجاج كامله', 'صدور دجاج محشية',
  'شرائح لحم', 'مكعبات لحم', 'استيك', 'كفته', 'ميتبول',
  'فيليه سمك', 'جمبري', 'كالماري', 'أصابع كابوريا',
]);

function isProteinIngredientName(name: string) {
  return PROTEIN_INGREDIENT_NAMES.has(name.trim());
}

type CompanyFormState = {
  id?: string;
  name: string;
  phone: string;
  phoneNumbersText: string;
  contact_person: string;
  notes: string;
  status: 'active' | 'inactive';
};

function createEmptyCompanyForm(): CompanyFormState {
  return { name: '', phone: '', phoneNumbersText: '', contact_person: '', notes: '', status: 'active' };
}

type MealIngredientRowState = {
  ingredient_id: string;
  weight_before_grams: string;
  weight_after_grams: string;
};

type MealFormState = {
  id?: string;
  category_id: string;
  name: string;
  description: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  price: string;
  ingredients: MealIngredientRowState[];
};

function createEmptyMealForm(categoryId: string): MealFormState {
  return { category_id: categoryId, name: '', description: '', calories: '', protein: '', carbs: '', fat: '', fiber: '', price: '', ingredients: [] };
}

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function ConfirmDeleteButton({ title, description, onConfirm }: { title: string; description: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1 text-xs text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" />حذف</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>تأكيد الحذف</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function CompaniesMenus() {
  const { role, pagePermissions, isDemoMode } = useAuth();
  const canManage = !isDemoMode && (role === 'owner' || hasPageAccess(role, pagePermissions, 'companies-menus'));
  const {
    companies, loading, categoriesByCompany, mealsByCategory, ingredientsByCompany, refresh,
    saveCompany, deleteCompany, saveCategory, deleteCategory, reorderCategories,
    saveIngredient, deleteIngredient, saveMeal, deleteMeal, duplicateMeal, moveMeal, reorderMeals,
  } = useCompanyMenus();

  const [companySearch, setCompanySearch] = useState('');
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState<CompanyFormState>(createEmptyCompanyForm());

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [mealSearch, setMealSearch] = useState('');

  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryEdits, setCategoryEdits] = useState<Record<string, string>>({});

  const [ingredientManagerOpen, setIngredientManagerOpen] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [ingredientEdits, setIngredientEdits] = useState<Record<string, string>>({});

  const [mealDialogOpen, setMealDialogOpen] = useState(false);
  const [mealForm, setMealForm] = useState<MealFormState | null>(null);
  const [newMealIngredientName, setNewMealIngredientName] = useState('');

  const filteredCompanies = useMemo(() => {
    const query = companySearch.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter(company => company.name.toLowerCase().includes(query) || company.phone.includes(query) || company.phone_numbers.some(number => number.includes(query)));
  }, [companies, companySearch]);

  const selectedCompany = useMemo(() => companies.find(company => company.id === selectedCompanyId) ?? null, [companies, selectedCompanyId]);
  const companyCategories = useMemo(() => selectedCompanyId ? (categoriesByCompany.get(selectedCompanyId) ?? []) : [], [categoriesByCompany, selectedCompanyId]);
  const companyIngredients = useMemo(() => selectedCompanyId ? (ingredientsByCompany.get(selectedCompanyId) ?? []) : [], [ingredientsByCompany, selectedCompanyId]);
  const companyMeals = useMemo(() => companyCategories.flatMap(category => mealsByCategory.get(category.id) ?? []), [companyCategories, mealsByCategory]);

  const openCompanyDialog = (company?: MenuCompany) => {
    setCompanyForm(company
      ? { id: company.id, name: company.name, phone: company.phone, phoneNumbersText: company.phone_numbers.join('، '), contact_person: company.contact_person, notes: company.notes, status: company.status }
      : createEmptyCompanyForm());
    setCompanyDialogOpen(true);
  };

  const submitCompany = async () => {
    const success = await saveCompany({
      id: companyForm.id,
      name: companyForm.name,
      phone: companyForm.phone,
      phone_numbers: companyForm.phoneNumbersText.split(/[،,]/).map(value => value.trim()).filter(Boolean),
      contact_person: companyForm.contact_person,
      notes: companyForm.notes,
      status: companyForm.status,
    });
    if (success) setCompanyDialogOpen(false);
  };

  const openCompany = (company: MenuCompany) => {
    setSelectedCompanyId(company.id);
    const firstCategory = categoriesByCompany.get(company.id)?.[0];
    setActiveCategoryId(firstCategory?.id ?? '');
    setMealSearch('');
  };

  const submitNewCategory = async () => {
    if (!selectedCompanyId || !newCategoryName.trim()) return;
    const success = await saveCategory({ company_id: selectedCompanyId, name: newCategoryName });
    if (success) setNewCategoryName('');
  };

  const submitCategoryRename = async (categoryId: string) => {
    const name = categoryEdits[categoryId];
    if (!name?.trim()) return;
    await saveCategory({ id: categoryId, company_id: selectedCompanyId ?? '', name });
  };

  const moveCategoryOrder = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= companyCategories.length) return;
    const reordered = [...companyCategories];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    await reorderCategories(reordered.map(category => category.id));
  };

  const submitNewIngredient = async () => {
    if (!selectedCompanyId || !newIngredientName.trim()) return;
    const created = await saveIngredient({ company_id: selectedCompanyId, name: newIngredientName });
    if (created) setNewIngredientName('');
  };

  const submitIngredientRename = async (ingredientId: string) => {
    const name = ingredientEdits[ingredientId];
    if (!name?.trim() || !selectedCompanyId) return;
    await saveIngredient({ id: ingredientId, company_id: selectedCompanyId, name });
  };

  const openMealDialog = (categoryId: string, meal?: MenuCompanyMeal) => {
    setMealForm(meal
      ? {
          id: meal.id,
          category_id: meal.category_id,
          name: meal.name,
          description: meal.description,
          calories: meal.calories?.toString() ?? '',
          protein: meal.protein?.toString() ?? '',
          carbs: meal.carbs?.toString() ?? '',
          fat: meal.fat?.toString() ?? '',
          fiber: meal.fiber?.toString() ?? '',
          price: meal.price?.toString() ?? '',
          ingredients: meal.ingredients.map(link => ({
            ingredient_id: link.ingredient_id,
            weight_before_grams: link.weight_before_grams === null ? '' : link.weight_before_grams.toString(),
            weight_after_grams: link.weight_after_grams === null ? '' : link.weight_after_grams.toString(),
          })),
        }
      : createEmptyMealForm(categoryId));
    setNewMealIngredientName('');
    setMealDialogOpen(true);
  };

  // Applies the protein weight-default rule: a single protein ingredient gets
  // 200g/125g defaults; two or more protein ingredients leave all of them empty.
  const applyProteinDefaults = (rows: MealIngredientRowState[]): MealIngredientRowState[] => {
    const proteinIndexes = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => isProteinIngredientName(ingredientNameById.get(row.ingredient_id) ?? ''))
      .map(({ index }) => index);

    if (proteinIndexes.length === 1) {
      const idx = proteinIndexes[0];
      return rows.map((row, index) => index === idx
        ? { ...row, weight_before_grams: row.weight_before_grams || '200', weight_after_grams: row.weight_after_grams || '125' }
        : row);
    }
    if (proteinIndexes.length >= 2) {
      return rows.map((row, index) => proteinIndexes.includes(index)
        ? { ...row, weight_before_grams: '', weight_after_grams: '' }
        : row);
    }
    return rows;
  };

  const removeMealIngredient = (ingredientId: string) => {
    setMealForm(current => current && {
      ...current,
      ingredients: applyProteinDefaults(current.ingredients.filter(row => row.ingredient_id !== ingredientId)),
    });
  };

  const updateMealIngredientWeight = (ingredientId: string, field: 'weight_before_grams' | 'weight_after_grams', value: string) => {
    setMealForm(current => current && {
      ...current,
      ingredients: current.ingredients.map(row => row.ingredient_id === ingredientId ? { ...row, [field]: value } : row),
    });
  };

  const addMealIngredientById = (ingredientId: string) => {
    setMealForm(current => {
      if (!current || current.ingredients.some(row => row.ingredient_id === ingredientId)) return current;
      const nextRows = [...current.ingredients, { ingredient_id: ingredientId, weight_before_grams: '', weight_after_grams: '' }];
      return { ...current, ingredients: applyProteinDefaults(nextRows) };
    });
  };

  const addMealIngredientQuick = async () => {
    if (!selectedCompanyId || !newMealIngredientName.trim() || !mealForm) return;
    const created = await saveIngredient({ company_id: selectedCompanyId, name: newMealIngredientName });
    if (created) {
      addMealIngredientById(created.id);
      setNewMealIngredientName('');
    }
  };

  const submitMeal = async () => {
    if (!mealForm || !selectedCompanyId) return;
    const input: MenuCompanyMealInput = {
      id: mealForm.id,
      company_id: selectedCompanyId,
      category_id: mealForm.category_id,
      name: mealForm.name,
      description: mealForm.description,
      calories: toNullableNumber(mealForm.calories),
      protein: toNullableNumber(mealForm.protein),
      carbs: toNullableNumber(mealForm.carbs),
      fat: toNullableNumber(mealForm.fat),
      fiber: toNullableNumber(mealForm.fiber),
      price: toNullableNumber(mealForm.price),
      ingredients: mealForm.ingredients.map(row => ({
        ingredient_id: row.ingredient_id,
        weight_before_grams: toNullableNumber(row.weight_before_grams),
        weight_after_grams: toNullableNumber(row.weight_after_grams),
      })),
    };
    const success = await saveMeal(input);
    if (success) setMealDialogOpen(false);
  };

  const activeCategoryMeals = useMemo(() => {
    const list = mealsByCategory.get(activeCategoryId) ?? [];
    const query = mealSearch.trim().toLowerCase();
    const filtered = query ? list.filter(meal => meal.name.toLowerCase().includes(query) || meal.description.toLowerCase().includes(query)) : list;
    return [...filtered].sort((left, right) => left.display_order - right.display_order);
  }, [mealsByCategory, activeCategoryId, mealSearch]);

  const moveMealOrder = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= activeCategoryMeals.length) return;
    const reordered = [...activeCategoryMeals];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    await reorderMeals(reordered.map(meal => meal.id));
  };

  const ingredientNameById = useMemo(() => new Map(companyIngredients.map(ingredient => [ingredient.id, ingredient.name])), [companyIngredients]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (selectedCompany) {
    return (
      <div className="space-y-5">
        {canManage && (
          <AppLayoutHeaderPortal>
            <div className="flex flex-wrap gap-2">
              <CompanyMenuImportDialog companyId={selectedCompany.id} categories={companyCategories} ingredients={companyIngredients} meals={companyMeals} onImported={refresh} />
              <Button variant="outline" size="sm" className="h-9 text-xs font-semibold rounded-lg" onClick={() => setIngredientManagerOpen(true)}>إدارة المكونات</Button>
              <Button variant="outline" size="sm" className="h-9 text-xs font-semibold rounded-lg" onClick={() => setCategoryManagerOpen(true)}>إدارة الفئات</Button>
            </div>
          </AppLayoutHeaderPortal>
        )}

        <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setSelectedCompanyId(null)}>
              <ArrowRight className="h-3.5 w-3.5" />
              <span>كل الشركات</span>
            </Button>
            <div>
              <h2 className="text-base font-bold text-slate-900">{selectedCompany.name}</h2>
              <p className="text-xs text-slate-500 tabular-nums">{selectedCompany.phone}{selectedCompany.contact_person ? ` · ${selectedCompany.contact_person}` : ''}</p>
            </div>
            <Badge variant={selectedCompany.status === 'active' ? 'default' : 'secondary'} className="text-[11px]">
              {selectedCompany.status === 'active' ? 'مفعّلة' : 'معطّلة'}
            </Badge>
          </div>
        </Card>

        {companyCategories.length === 0 ? (
          <Card className="rounded-2xl border-dashed"><CardContent className="p-8 text-center text-muted-foreground">لا توجد فئات بعد لهذه الشركة. {canManage && <Button variant="link" onClick={() => setCategoryManagerOpen(true)}>أضف أول فئة</Button>}</CardContent></Card>
        ) : (
          <Tabs value={activeCategoryId} onValueChange={setActiveCategoryId}>
            <TabsList className="h-auto flex-wrap">
              {companyCategories.map(category => <TabsTrigger key={category.id} value={category.id}>{category.name}</TabsTrigger>)}
            </TabsList>

            {companyCategories.map(category => (
              <TabsContent key={category.id} value={category.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative max-w-xs flex-1">
                    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={mealSearch} onChange={event => setMealSearch(event.target.value)} placeholder="ابحث عن وجبة..." className="pr-9" />
                  </div>
                  {canManage && <Button size="sm" className="gap-1" onClick={() => openMealDialog(category.id)}><Plus className="h-4 w-4" />إضافة وجبة</Button>}
                </div>

                {activeCategoryMeals.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">لا توجد وجبات في هذه الفئة بعد.</div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {activeCategoryMeals.map((meal, index) => (
                      <Card key={meal.id} className="rounded-2xl">
                        <CardContent className="space-y-2 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-foreground">{meal.name}</h3>
                            {canManage && <div className="flex shrink-0 gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void moveMealOrder(index, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void moveMealOrder(index, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                            </div>}
                          </div>
                          {meal.description && <p className="text-sm text-muted-foreground">{meal.description}</p>}
                          <div className="flex flex-wrap gap-1.5 text-xs">
                            {meal.price !== null && <Badge>{meal.price} ج.م</Badge>}
                            {meal.calories !== null && <Badge variant="outline">{meal.calories} kcal</Badge>}
                            {meal.protein !== null && <Badge variant="outline">بروتين {meal.protein}g</Badge>}
                            {meal.carbs !== null && <Badge variant="outline">كارب {meal.carbs}g</Badge>}
                            {meal.fat !== null && <Badge variant="outline">دهون {meal.fat}g</Badge>}
                            {meal.fiber !== null && <Badge variant="outline">ألياف {meal.fiber}g</Badge>}
                          </div>
                          {meal.ingredients.length > 0 && <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                            {meal.ingredients.map(link => (
                              <span key={link.ingredient_id} className="rounded-full bg-muted px-2 py-0.5">
                                {ingredientNameById.get(link.ingredient_id) ?? '—'}
                                {(link.weight_before_grams !== null || link.weight_after_grams !== null) && (
                                  <span className="text-muted-foreground/70">
                                    {' '}({link.weight_before_grams ?? '—'}g→{link.weight_after_grams ?? '—'}g)
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>}
                          {canManage && <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => openMealDialog(category.id, meal)}><Pencil className="h-3.5 w-3.5" />تعديل</Button>
                            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => void duplicateMeal(meal.id)}><Copy className="h-3.5 w-3.5" />تكرار</Button>
                            <Select value={meal.category_id} onValueChange={value => value !== meal.category_id && void moveMeal(meal.id, value)}>
                              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="نقل إلى" /></SelectTrigger>
                              <SelectContent>{companyCategories.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <ConfirmDeleteButton title={`حذف "${meal.name}"؟`} description="لا يمكن التراجع عن هذا الإجراء." onConfirm={() => void deleteMeal(meal.id)} />
                          </div>}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Category manager */}
        <Dialog open={categoryManagerOpen} onOpenChange={setCategoryManagerOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>إدارة الفئات</DialogTitle><DialogDescription>أضف أو عدّل أو احذف فئات منيو هذه الشركة، ويمكنك إعادة ترتيبها.</DialogDescription></DialogHeader>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {companyCategories.map((category, index) => (
                <div key={category.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <div className="flex flex-col">
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => void moveCategoryOrder(index, -1)}><ArrowUp className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => void moveCategoryOrder(index, 1)}><ArrowDown className="h-3 w-3" /></Button>
                  </div>
                  <Input value={categoryEdits[category.id] ?? category.name} onChange={event => setCategoryEdits(current => ({ ...current, [category.id]: event.target.value }))} />
                  <Button size="sm" variant="outline" onClick={() => void submitCategoryRename(category.id)}>حفظ</Button>
                  <ConfirmDeleteButton title={`حذف فئة "${category.name}"؟`} description="سيتم حذف الوجبات المرتبطة بها أيضًا." onConfirm={() => void deleteCategory(category.id)} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t pt-3">
              <Input value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)} placeholder="اسم فئة جديدة" />
              <Button onClick={() => void submitNewCategory()}>إضافة</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Ingredient manager */}
        <Dialog open={ingredientManagerOpen} onOpenChange={setIngredientManagerOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>إدارة المكونات</DialogTitle><DialogDescription>مكونات قابلة لإعادة الاستخدام في أي وجبة بهذه الشركة.</DialogDescription></DialogHeader>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {companyIngredients.map(ingredient => (
                <div key={ingredient.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <Input value={ingredientEdits[ingredient.id] ?? ingredient.name} onChange={event => setIngredientEdits(current => ({ ...current, [ingredient.id]: event.target.value }))} />
                  <Button size="sm" variant="outline" onClick={() => void submitIngredientRename(ingredient.id)}>حفظ</Button>
                  <ConfirmDeleteButton title={`حذف "${ingredient.name}"؟`} description="لن يمكن حذفه إذا كان مستخدمًا في وجبة حالية." onConfirm={() => void deleteIngredient(ingredient.id)} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t pt-3">
              <Input value={newIngredientName} onChange={event => setNewIngredientName(event.target.value)} placeholder="اسم مكوّن جديد" />
              <Button onClick={() => void submitNewIngredient()}>إضافة</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Meal dialog */}
        <Dialog open={mealDialogOpen} onOpenChange={setMealDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
            <DialogHeader><DialogTitle>{mealForm?.id ? 'تعديل وجبة' : 'إضافة وجبة'}</DialogTitle><DialogDescription>كل الحقول قابلة للتعديل وتُحفظ مباشرة في قاعدة البيانات.</DialogDescription></DialogHeader>
            {mealForm && <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>الفئة</Label>
                <Select value={mealForm.category_id} onValueChange={value => setMealForm(current => current && { ...current, category_id: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{companyCategories.map(category => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>اسم الوجبة</Label><Input value={mealForm.name} onChange={event => setMealForm(current => current && { ...current, name: event.target.value })} /></div>
              <div className="grid gap-1.5"><Label>الوصف</Label><Textarea value={mealForm.description} onChange={event => setMealForm(current => current && { ...current, description: event.target.value })} placeholder="وصف مختصر وواضح للوجبة" /></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5"><Label className="text-xs">السعر</Label><Input type="number" value={mealForm.price} onChange={event => setMealForm(current => current && { ...current, price: event.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="grid gap-1.5"><Label className="text-xs">سعرات</Label><Input type="number" value={mealForm.calories} onChange={event => setMealForm(current => current && { ...current, calories: event.target.value })} /></div>
                <div className="grid gap-1.5"><Label className="text-xs">بروتين</Label><Input type="number" value={mealForm.protein} onChange={event => setMealForm(current => current && { ...current, protein: event.target.value })} /></div>
                <div className="grid gap-1.5"><Label className="text-xs">كارب</Label><Input type="number" value={mealForm.carbs} onChange={event => setMealForm(current => current && { ...current, carbs: event.target.value })} /></div>
                <div className="grid gap-1.5"><Label className="text-xs">دهون</Label><Input type="number" value={mealForm.fat} onChange={event => setMealForm(current => current && { ...current, fat: event.target.value })} /></div>
                <div className="grid gap-1.5"><Label className="text-xs">ألياف</Label><Input type="number" value={mealForm.fiber} onChange={event => setMealForm(current => current && { ...current, fiber: event.target.value })} /></div>
              </div>
              <div className="grid gap-1.5">
                <Label>مكونات الوجبة (الوزن بالجرام قبل وبعد التسوية)</Label>
                <div className="space-y-2 rounded-lg border p-2">
                  {mealForm.ingredients.length === 0 && <p className="text-xs text-muted-foreground">لا توجد مكونات مضافة لهذه الوجبة بعد.</p>}
                  {mealForm.ingredients.map(row => (
                    <div key={row.ingredient_id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                      <span className="min-w-24 flex-1 text-sm font-medium">{ingredientNameById.get(row.ingredient_id) ?? '—'}</span>
                      <div className="flex items-center gap-1">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">قبل</Label>
                        <Input type="number" className="h-8 w-20" value={row.weight_before_grams} onChange={event => updateMealIngredientWeight(row.ingredient_id, 'weight_before_grams', event.target.value)} placeholder="جرام" />
                      </div>
                      <div className="flex items-center gap-1">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">بعد</Label>
                        <Input type="number" className="h-8 w-20" value={row.weight_after_grams} onChange={event => updateMealIngredientWeight(row.ingredient_id, 'weight_after_grams', event.target.value)} placeholder="جرام" />
                      </div>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeMealIngredient(row.ingredient_id)}><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value="" onValueChange={value => addMealIngredientById(value)}>
                    <SelectTrigger className="h-9 w-56"><SelectValue placeholder="اختر مكوّنًا لإضافته" /></SelectTrigger>
                    <SelectContent>
                      {companyIngredients.filter(ingredient => !mealForm.ingredients.some(row => row.ingredient_id === ingredient.id)).map(ingredient => (
                        <SelectItem key={ingredient.id} value={ingredient.id}>{ingredient.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={newMealIngredientName} onChange={event => setNewMealIngredientName(event.target.value)} placeholder="أو أضف مكوّنًا جديدًا بالاسم" className="w-56" />
                  <Button type="button" variant="outline" onClick={() => void addMealIngredientQuick()}>إضافة</Button>
                </div>
              </div>
            </div>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setMealDialogOpen(false)}>إلغاء</Button>
              <Button onClick={() => void submitMeal()}>حفظ الوجبة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {canManage && (
        <AppLayoutHeaderPortal>
          <Button size="sm" className="h-9 gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold" onClick={() => openCompanyDialog()}>
            <Plus className="h-3.5 w-3.5" />
            <span>شركة جديدة</span>
          </Button>
        </AppLayoutHeaderPortal>
      )}

      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-600">كل شركة لها منيو مستقل بالكامل: فئات، وجبات، وقيم غذائية ومكونات.</p>
        <div className="relative w-full sm:w-72">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={companySearch} onChange={event => setCompanySearch(event.target.value)} placeholder="ابحث بالاسم أو رقم الهاتف" className="pr-9 h-9 text-xs" />
        </div>
      </Card>

      {filteredCompanies.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-10 text-center text-sm text-slate-500">لا توجد شركات مطابقة بعد.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-stretch">
          {filteredCompanies.map(company => (
            <Card key={company.id} className="p-5 flex flex-col justify-between hover:border-slate-300 hover:shadow-xs transition-all duration-150">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-emerald-600" /><h3 className="font-bold text-sm text-slate-900">{company.name}</h3></div>
                  <Badge variant={company.status === 'active' ? 'default' : 'secondary'} className="text-[11px]">{company.status === 'active' ? 'مفعّلة' : 'معطّلة'}</Badge>
                </div>
                <p className="text-xs text-slate-500 tabular-nums">{company.phone || 'بدون هاتف'}{company.contact_person ? ` · ${company.contact_person}` : ''}</p>
                {company.phone_numbers.length > 0 && <p className="text-xs text-slate-500 tabular-nums">أرقام إضافية: {company.phone_numbers.join('، ')}</p>}
                {company.notes && <p className="text-xs text-slate-500">"{company.notes}"</p>}
              </div>
              <div className="flex flex-wrap gap-2 pt-3 mt-3 border-t border-slate-100">
                <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openCompany(company)}>فتح المنيو</Button>
                {canManage && <>
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => openCompanyDialog(company)}><Pencil className="h-3.5 w-3.5" />تعديل</Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void saveCompany({ id: company.id, name: company.name, phone: company.phone, phone_numbers: company.phone_numbers, contact_person: company.contact_person, notes: company.notes, status: company.status === 'active' ? 'inactive' : 'active' })}>
                    {company.status === 'active' ? 'تعطيل' : 'تفعيل'}
                  </Button>
                  <ConfirmDeleteButton title={`حذف "${company.name}"؟`} description="سيتم حذف كل فئات ووجبات هذه الشركة نهائيًا." onConfirm={() => void deleteCompany(company.id)} />
                </>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{companyForm.id ? 'تعديل بيانات الشركة' : 'شركة جديدة'}</DialogTitle><DialogDescription>هذه البيانات مستقلة تمامًا عن العلامات التجارية الحالية للمطبخ.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>اسم الشركة</Label><Input value={companyForm.name} onChange={event => setCompanyForm(current => ({ ...current, name: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>الهاتف الرئيسي</Label><Input value={companyForm.phone} onChange={event => setCompanyForm(current => ({ ...current, phone: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>أرقام إضافية (افصل بينها بفاصلة)</Label><Input value={companyForm.phoneNumbersText} onChange={event => setCompanyForm(current => ({ ...current, phoneNumbersText: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>اسم المسؤول</Label><Input value={companyForm.contact_person} onChange={event => setCompanyForm(current => ({ ...current, contact_person: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>ملاحظات</Label><Textarea value={companyForm.notes} onChange={event => setCompanyForm(current => ({ ...current, notes: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>الحالة</Label>
              <Select value={companyForm.status} onValueChange={value => setCompanyForm(current => ({ ...current, status: value as 'active' | 'inactive' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">مفعّلة</SelectItem><SelectItem value="inactive">معطّلة</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyDialogOpen(false)}>إلغاء</Button>
            <Button onClick={() => void submitCompany()}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
